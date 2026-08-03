import { verifyAccessToken } from "@repo/auth/src/jwt/verify";
import { db, moves } from "@repo/db";
import { MAX_MESSAGE_LENGTH } from "@repo/utils/src/constants";

import {
    activeGames,
    AuthedSocket,
    Color,
    GameState,
    onlineUsers,
    opposite,
    playerColor
} from "./state";
import { broadcastOnlineUsers } from "./connection";
import { broadcastToGame, sendTo } from "./utils/broadcastToGame";
import { applyMoveToClocks, scheduleFlagFall } from "./clock";
import { fetchUserSession } from "./services/user.service";
import { getChatHistory, insertChatMessage } from "./services/chat.service";
import { rehydrateGame, updateGameState } from "./services/game.service";
import { concludeGame, concludeOnFlag } from "./services/gameConclusion.service";

/**
 * Authenticates a socket and binds a user id to it.
 *
 * Everything downstream reads identity from `ws.userId`. Nothing may trust a
 * user id supplied in a message body — the sender controls that field, so
 * honouring it would let any connected client act as any other player.
 */
export async function handleUserConnection(ws: AuthedSocket, message: any): Promise<string | null> {
    const { userId, accessToken } = message ?? {};

    if (typeof userId !== "string" || typeof accessToken !== "string") {
        sendTo(ws, "auth-error", { error: "missing-credentials" });
        return null;
    }

    let session;
    try {
        session = await fetchUserSession(userId);
    } catch (error) {
        console.error("[auth] session lookup failed:", error);
        sendTo(ws, "auth-error", { error: "server-error" });
        return null;
    }

    if (!session?.refreshToken) {
        sendTo(ws, "auth-error", { error: "no-session" });
        return null;
    }

    let decoded;
    try {
        decoded = await verifyAccessToken(accessToken, session.refreshToken);
    } catch (error) {
        sendTo(ws, "auth-error", { error: "invalid-token" });
        return null;
    }

    const authenticatedId = decoded.payload.userId;

    // The token decides who this socket is. A mismatch means the caller is
    // presenting someone else's id alongside their own token.
    if (authenticatedId !== userId) {
        sendTo(ws, "auth-error", { error: "identity-mismatch" });
        return null;
    }

    // A second login for the same account supersedes the first; leaving the old
    // socket in the map would send that user's moves to a stale connection.
    const previous = onlineUsers.get(authenticatedId);
    if (previous && previous !== ws) {
        sendTo(previous, "session-superseded", { reason: "connected-elsewhere" });
    }

    ws.userId = authenticatedId;
    onlineUsers.set(authenticatedId, ws);
    broadcastOnlineUsers();

    console.log(`[auth] user ${authenticatedId} connected`);

    sendTo(ws, "connection-established", {
        userId: authenticatedId,
        accessToken: decoded.newAccessToken ?? accessToken,
        message: "Successfully connected"
    });

    return authenticatedId;
}

/**
 * Resolves the game a request refers to and checks the caller is actually one
 * of its two players. Returns null (after replying with an error) otherwise.
 */
async function requirePlayer(
    ws: AuthedSocket,
    gameId: unknown,
    errorAction: string
): Promise<{ game: GameState; userId: string; color: Color } | null> {
    const userId = ws.userId;
    if (!userId) {
        sendTo(ws, errorAction, { error: "not-authenticated" });
        return null;
    }

    if (typeof gameId !== "string" || gameId.length === 0) {
        sendTo(ws, errorAction, { error: "invalid-game-id" });
        return null;
    }

    const game = activeGames.get(gameId) ?? (await rehydrateGame(gameId));
    if (!game) {
        sendTo(ws, errorAction, { error: "game-not-found" });
        return null;
    }

    const color = playerColor(game, userId);
    if (!color) {
        sendTo(ws, errorAction, { error: "not-a-player" });
        return null;
    }

    if (game.status !== "in_progress") {
        sendTo(ws, errorAction, { error: "game-not-in-progress" });
        return null;
    }

    return { game, userId, color };
}

export async function handleMakeMove(ws: AuthedSocket, message: any): Promise<void> {
    const data = message?.data ?? {};
    const context = await requirePlayer(ws, data.gameId, "move-error");
    if (!context) return;

    const { game, color } = context;
    const uci = data.uci;

    if (typeof uci !== "string" || uci.length < 4 || uci.length > 5) {
        sendTo(ws, "move-error", { error: "malformed-move" });
        return;
    }

    const chess = game.chess;
    const sideToMove: Color = chess.turn() === "w" ? "white" : "black";

    if (sideToMove !== color) {
        sendTo(ws, "not-your-turn", { gameId: game.gameId });
        return;
    }

    const now = Date.now();
    const updatedClocks = applyMoveToClocks(game, color, now);

    // The mover's own clock expired before this move landed. Their opponent
    // wins on time; the move itself is discarded.
    if (updatedClocks[color] <= 0) {
        game.clocks[color] = 0;
        await concludeOnFlag(game, color);
        return;
    }

    let move;
    try {
        move = chess.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci[4] ?? "q"
        });
    } catch {
        sendTo(ws, "illegal-move", { gameId: game.gameId });
        return;
    }

    if (!move) {
        sendTo(ws, "illegal-move", { gameId: game.gameId });
        return;
    }

    const elapsed = now - game.moveStartTime;
    const moveNumber = chess.history().length;

    // Persist before advancing in-memory state, so a failed write can be undone
    // without the two views of the game diverging.
    try {
        await db.insert(moves).values({
            gameId: game.gameId,
            moveNumber,
            color,
            san: move.san,
            uci,
            fenAfter: chess.fen(),
            timeTaken: elapsed,
            clockAfter: Math.max(0, updatedClocks[color])
        });
    } catch (error) {
        chess.undo();
        sendTo(ws, "server-error", { gameId: game.gameId });
        console.error(`[handleMakeMove] DB insert error for game ${game.gameId}:`, error);
        return;
    }

    game.clocks = updatedClocks;
    game.activeColor = opposite(color);
    game.moveStartTime = now;
    game.lastMove = uci;
    game.lastMoveTime = now;

    // A move answers any outstanding draw offer with an implicit decline.
    if (game.drawOfferedBy && game.drawOfferedBy !== ws.userId) {
        game.drawOfferedBy = null;
        broadcastToGame(game.gameId, { action: "draw-declined", data: { by: ws.userId } });
    }

    if (chess.isCheckmate()) {
        await concludeGame(game, {
            winnerColor: color,
            termination: "checkmate",
            reason: "checkmate"
        });
        return;
    }

    if (chess.isDraw() || chess.isStalemate()) {
        const termination = chess.isStalemate()
            ? "stalemate"
            : chess.isThreefoldRepetition()
              ? "threefold_repetition"
              : chess.isInsufficientMaterial()
                ? "insufficient_material"
                : "fifty_move_rule";

        await concludeGame(game, {
            winnerColor: null,
            termination,
            reason: termination.replace(/_/g, " ")
        });
        return;
    }

    // The side to move changed, so the flag timer belongs to the other player.
    scheduleFlagFall(game);

    try {
        await updateGameState(game.gameId, chess.fen(), updatedClocks);
    } catch (error) {
        // The move is already durable in the moves table; a stale snapshot on
        // the games row is recoverable by replay and must not abort the game.
        console.error(`[handleMakeMove] snapshot update failed for ${game.gameId}:`, error);
    }

    broadcastToGame(game.gameId, {
        action: "move-successful",
        data: {
            fen: chess.fen(),
            uci,
            san: move.san,
            moveNumber,
            activeColor: game.activeColor,
            inCheck: chess.inCheck(),
            clocks: updatedClocks
        }
    });
}

export async function handleChat(ws: AuthedSocket, message: any): Promise<void> {
    const data = message?.data ?? {};
    const userId = ws.userId;

    if (!userId) {
        sendTo(ws, "chat-error", { error: "not-authenticated" });
        return;
    }

    const gameId = data.gameId;
    if (typeof gameId !== "string") {
        sendTo(ws, "chat-error", { error: "invalid-game-id" });
        return;
    }

    const game = activeGames.get(gameId) ?? (await rehydrateGame(gameId));
    if (!game) {
        sendTo(ws, "chat-error", { error: "game-not-found" });
        return;
    }

    // Spectators may watch but not speak.
    if (!playerColor(game, userId)) {
        sendTo(ws, "chat-error", { error: "not-a-player" });
        return;
    }

    const trimmed = typeof data.message === "string" ? data.message.trim() : "";
    if (trimmed.length === 0) return;

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
        sendTo(ws, "chat-error", { error: "message-too-long", max: MAX_MESSAGE_LENGTH });
        return;
    }

    let saved;
    try {
        // senderId comes from the socket, never the payload.
        saved = await insertChatMessage(gameId, userId, trimmed);
    } catch (error) {
        console.error(`[handleChat] DB insert failed for game ${gameId}:`, error);
        sendTo(ws, "chat-error", { error: "server-error" });
        return;
    }

    broadcastToGame(gameId, {
        action: "chat-message",
        data: {
            id: saved.id,
            gameId,
            senderId: userId,
            message: trimmed,
            createdAt: saved.createdAt
        }
    });
}

export async function handleRequestResign(ws: AuthedSocket, message: any): Promise<void> {
    const data = message?.data ?? {};
    const context = await requirePlayer(ws, data.gameId, "resign-error");
    if (!context) return;

    const { game, userId, color } = context;

    await concludeGame(game, {
        winnerColor: opposite(color),
        termination: "resignation",
        reason: "resigned",
        resignedBy: userId
    });
}

export async function handleDrawOffer(ws: AuthedSocket, message: any): Promise<void> {
    const data = message?.data ?? {};
    const context = await requirePlayer(ws, data.gameId, "draw-error");
    if (!context) return;

    const { game, userId } = context;

    if (game.drawOfferedBy === userId) {
        sendTo(ws, "draw-error", { error: "already-offered" });
        return;
    }

    // Offering into a standing offer from the opponent is an acceptance.
    if (game.drawOfferedBy && game.drawOfferedBy !== userId) {
        await acceptDraw(game);
        return;
    }

    game.drawOfferedBy = userId;
    broadcastToGame(game.gameId, { action: "draw-offered", data: { by: userId } });
}

export async function handleDrawResponse(ws: AuthedSocket, message: any): Promise<void> {
    const data = message?.data ?? {};
    const context = await requirePlayer(ws, data.gameId, "draw-error");
    if (!context) return;

    const { game, userId } = context;

    if (!game.drawOfferedBy) {
        sendTo(ws, "draw-error", { error: "no-offer" });
        return;
    }

    // Only the player who did not make the offer can answer it.
    if (game.drawOfferedBy === userId) {
        sendTo(ws, "draw-error", { error: "cannot-answer-own-offer" });
        return;
    }

    if (data.accept === true) {
        await acceptDraw(game);
        return;
    }

    game.drawOfferedBy = null;
    broadcastToGame(game.gameId, { action: "draw-declined", data: { by: userId } });
}

async function acceptDraw(game: GameState): Promise<void> {
    game.drawOfferedBy = null;
    await concludeGame(game, {
        winnerColor: null,
        termination: "agreement",
        reason: "draw by agreement"
    });
}

/**
 * Sends a reconnecting player (or a new spectator) everything needed to render
 * a game already in progress.
 */
export async function handleJoinGame(ws: AuthedSocket, message: any): Promise<void> {
    const data = message?.data ?? {};
    const userId = ws.userId;

    if (!userId) {
        sendTo(ws, "join-error", { error: "not-authenticated" });
        return;
    }

    const gameId = data.gameId;
    if (typeof gameId !== "string") {
        sendTo(ws, "join-error", { error: "invalid-game-id" });
        return;
    }

    const game = activeGames.get(gameId) ?? (await rehydrateGame(gameId));
    if (!game) {
        sendTo(ws, "join-error", { error: "game-not-found" });
        return;
    }

    const color = playerColor(game, userId);
    if (!color) game.spectators.add(ws);

    // Charge the player on move for the time spent while this client was away,
    // so a reconnect cannot be used to stop the clock.
    const elapsed = Date.now() - game.moveStartTime;
    const liveClocks = {
        ...game.clocks,
        [game.activeColor]: game.clocks[game.activeColor] - elapsed
    };

    let chatHistory: Awaited<ReturnType<typeof getChatHistory>> = [];
    if (color) {
        try {
            chatHistory = await getChatHistory(gameId);
        } catch (error) {
            console.error(`[handleJoinGame] chat history failed for ${gameId}:`, error);
        }
    }

    sendTo(ws, "game-state", {
        gameId,
        fen: game.chess.fen(),
        pgn: game.chess.pgn(),
        history: game.chess.history({ verbose: true }),
        activeColor: game.activeColor,
        yourColor: color,
        role: color ? "player" : "spectator",
        whitePlayerId: game.whitePlayerId,
        blackPlayerId: game.blackPlayerId,
        timeControl: game.timeControl,
        incrementMs: game.incrementMs,
        isRated: game.isRated,
        inCheck: game.chess.inCheck(),
        drawOfferedBy: game.drawOfferedBy ?? null,
        clocks: liveClocks,
        chatHistory,
        spectatorCount: game.spectators.size
    });
}

export function handleLeaveGame(ws: AuthedSocket, message: any): void {
    const gameId = message?.data?.gameId;
    if (typeof gameId !== "string") return;

    activeGames.get(gameId)?.spectators.delete(ws);
}
