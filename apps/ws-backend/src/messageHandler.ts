import { verifyAccessToken } from "@repo/auth/src/jwt/verify";
import { WebSocket } from "ws";
import { activeGames, GameState, onlineUsers, usersSearchingForMatch } from "./server";
import { broadcastOnlineUsers, sendMessage } from "./connection";
import { db } from "../../../packages/db/src";
import { games } from "../../../packages/db/src/schema/game";
import { moves } from '@repo/db/src/schema/moves';
import { Chess } from "chess.js";
import { broadcastToGame } from "./utils/broadcastToGame";
import { fetchExistingGame, fetchUserSession, insertChatMessage, updateGameState } from '@repo/utils/src/db.queries'
import { ChatMessage } from "@repo/types";
import { MAX_MESSAGE_LENGTH } from "@repo/utils/src/constants";

export async function handleUserConnection(ws: WebSocket, message: any, currentUserId: string | null) {
    const { userId, accessToken } = message;

    const session = await fetchUserSession(userId);
    const decoded = await verifyAccessToken(accessToken, session.refreshToken);
    
    onlineUsers.set(decoded.payload.userId, ws);
    currentUserId = decoded.payload.userId;
    broadcastOnlineUsers();
    
    console.log(`User ${userId} connected to the websocket`);
    
    // send confirmation
    ws.send(JSON.stringify({
        action: 'connection-established',
        userId: userId,
        accessToken: decoded.newAccessToken,
        message: 'Successfully connected'
    }));
};

export async function handleMatchPlayer(ws: WebSocket, message: any) {
    // structure of the message to be received
    // message = {
    //     action: 'match-player',
    //     userId: userId,
    // }
    const { userId } = message;

    // adding user to the search queue/map or returning if it already exists
    if (usersSearchingForMatch.has(userId)) return;
    usersSearchingForMatch.set(userId, ws);

    if (usersSearchingForMatch.size < 2) {
        console.log('Waiting for opponent...');
        return;
    };

    const players = Array.from(usersSearchingForMatch.keys());

    const player1 = players[0];
    const player2 = players[1];

    const ws1 = usersSearchingForMatch.get(player1);
    const ws2 = usersSearchingForMatch.get(player2);

    // removing both users from the queue/map
    usersSearchingForMatch.delete(player1);
    usersSearchingForMatch.delete(player2);

    console.log(`Match found: ${player1} vs ${player2}`);

    // game can be created in the db as both the players have been matched
    const newGame = (
        await db
            .insert(games)
            .values({
                whitePlayerId: player1,
                blackPlayerId: player2,

                timeControl: 'blitz',
                timeLimitSecs: 300,
                incrementSecs: 2,

                status: 'in_progress',

                initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                currentFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",

                whiteTimeLeft: 300,
                blackTimeLeft: 300,

                isRated: false,

                startedAt: new Date(),
                endedAt: null
            })
            .returning()
    )[0];
    console.log('new game created: ', newGame);

    // creating a new game state in server's memory
    const gameId = newGame.id;
    const game: GameState = {
        gameId: newGame.id,
        whitePlayerId: player1,
        blackPlayerId: player2,

        chess: new Chess(),
        activeColor: 'white',

        lastMove: '',
        lastMoveTime: 0,
        moveStartTime: Date.now(),

        clocks: {
            white: 300 * 1000,  // sec
            black: 300 * 1000   // sec
        }
    };

    activeGames.set(gameId, game);
    console.log('game id: ', gameId);
    console.log('active games set for this game id: ', activeGames.has(gameId));

    sendMessage(ws1, 'match-found', {
        action: 'match-found',
        userId: player1,
        opponentId: player2,
        gameId: newGame.id,
        color: 'white'
    });

    sendMessage(ws2, 'match-found', {
        action: 'match-found',
        userId: player2,
        opponentId: player1,
        gameId: newGame.id,
        color: 'black'
    });
};

export async function handleMakeMove(ws: WebSocket, message: { action: string, data: { gameId: string, playerId: string, uci: string, color: 'w' | 'b' } }) {
    const { action, data } = message;
    if (action !== 'possible-move') return;

    const gameId = data.gameId;
    const uci = data.uci;

    const game = activeGames.get(gameId);
    if (!game) return;

    const chess = game.chess;

    // todo: turn validation: checking whose turn it is actually
    const expectedColor = chess.turn() === 'w' ? 'white' : 'black';
    const isThisPlayersTurn = (expectedColor === 'white' && game.whitePlayerId === data.playerId) || (expectedColor === 'black' && game.blackPlayerId === data.playerId);
    if (!isThisPlayersTurn) {
        // sending notification to the player's socket making the wrong move
        ws.send(JSON.stringify({ action: 'not-your-turn', gameId }));
        return;
    };

    let move;
    try {
        // applying move via chess.js
        move = chess.move({
            from: data.uci.slice(0,2),
            to: data.uci.slice(2,4),
            promotion: data.uci[4] ?? 'q'
        });
    } catch (error) {
        ws.send(JSON.stringify({ action: 'illegal-move', gameId: gameId }));
        return;
    }

    // todo: clock management --> configuring the clocks to avoid any cheating based on time
    const now = Date.now();
    const timeTaken = now - game.moveStartTime;
    console.log('time taken for the move: ', timeTaken);
    const moveColor = move.color === 'w' ? 'white' : 'black';

    const updatedClocks = {
        white: moveColor === 'white' ? game.clocks.white - timeTaken : game.clocks.white,   // ms
        black: moveColor === 'black' ? game.clocks.black - timeTaken : game.clocks.black    // ms
    };

    // checking for time-out meaning if time ran out for either of the players
    if (updatedClocks.white <= 0 || updatedClocks.black <= 0) {
        const loser = updatedClocks.white <= 0 ? 'white' : 'black';
        broadcastToGame(gameId, {
            action: 'time-out',
            data: {
                loser: loser,
            }
        });
        return;
    };

    // saving the move in the database
    // rollback in-memory state on failure
    try {
        await db
            .insert(moves)
            .values({
                gameId: gameId,
                moveNumber: chess.history().length,
                color: move.color === 'w' ? "white" : "black",
                san: move.san,
                uci: data.uci,
                fenAfter: chess.fen(),
                timeTaken: Math.floor(timeTaken / 1000),    // seconds
                clockAfter: move.color === 'w' ? Math.floor(updatedClocks.white / 1000) : Math.floor(updatedClocks.black / 1000)    // seconds
            })
            .returning();
    } catch (error) {
        chess.undo();
        ws.send(JSON.stringify({ action: 'server-error', gameId }));
        console.error(`[handleMakeMove] DB insert error for game ${gameId}: `, error);
        return;
    };

    // persisting first in the database above, then updating the in-memory state
    activeGames.set(gameId, {
        ...game,
        activeColor: game.activeColor === 'white' ? 'black' : 'white',
        clocks: updatedClocks,

        // resetting the clock for the next player's turn
        moveStartTime: now
    });

    // todo: game status validation --> checking whether there is a checkmate/draw/stalemate/three-fold-repetition
    if (chess.isCheckmate()) {
        console.log('checkmate');
        broadcastToGame(gameId, {
            action: 'checkmate',
            data: {}
        });

        await db.update(games).set({
            status: 'completed',
            winner: data.playerId,
        });
        return;
    }
    else if (chess.isDraw()) {
        console.log('draw, shake hands!');
        broadcastToGame(gameId, {
            action: 'draw',
            data: {}
        });

        await db.update(games).set({
            status: 'completed',
            winner: 'draw'
        });
        return;
    }
    else if (chess.isStalemate()) { console.log('stalemate') }
    else if (chess.isThreefoldRepetition()) { console.log('three fold repetition') }

    // updating game state inside the database
    await updateGameState(gameId, chess.fen(), updatedClocks);

    // broadcasting information to both the players to keep them in sync
    broadcastToGame(gameId, {
        action: 'move-successful',
        data: {
            fen: chess.fen(),
            uci: uci,
            san: move.san,
            moveNumber: chess.history().length,

            // keeping clients in sync with updated clocks
            clocks: updatedClocks
        }
    });
};

export async function handleRegisterMove(ws: WebSocket, message: any) {
    const { userId, opponentId, data } : { userId: string, opponentId: string, data: typeof moves.$inferInsert } = message;
    console.log('user id: ', userId);
    console.log('opponent id: ', opponentId);
    console.log('data received in this ws: ', data);

    const userSocket = onlineUsers.get(userId);
    const opponentSocket = onlineUsers.get(opponentId);

    console.log('type: ', typeof data.timeTaken);
    console.log('type: ', typeof data.clockAfter);

    try {
        const existingGame = await fetchExistingGame(data.gameId);
        if (!existingGame) return;

        const move = (await db.insert(moves).values({ ...data, createdAt: new Date() }).returning())[0];
        if (!move) {
            // sending errors to both the sockets
            userSocket.send(JSON.stringify({
                action: 'db-insertion-error',
                message: 'some error occured while insertion'
            }));
            opponentSocket.send(JSON.stringify({
                action: 'db-insertion-error',
                message: 'some error occured while insertion'
            }));
        };

        // sending this message to the opponent socket to apply the same changes on his/her screen as well
        opponentSocket.send(JSON.stringify({
            action: 'move-successful',
            message: 'successful move by the user',
            move: move
        }));
    } catch (error) {
        console.error('error while registering a move: ', error);
        userSocket.send(JSON.stringify({
            action: 'internal-server-error',
            message: 'error'
        }));
        opponentSocket.send(JSON.stringify({
            action: 'internal-server-error',
            message: 'error'
        }));
    };
};

export const handleChat = async (ws: WebSocket, payload: ChatMessage) => {
    const { data } = payload;
    const { gameId, senderId, message } = data;

    // 1. Game existence check
    const game = activeGames.get(gameId);
    if (!game) {
        ws.send(JSON.stringify({ action: 'chat-error', error: 'game-not-found' }));
        return;
    }

    // 2. Sender must be one of the two players — no outsiders
    const isPlayer = game.whitePlayerId === senderId || game.blackPlayerId === senderId;
    if (!isPlayer) {
        ws.send(JSON.stringify({ action: 'chat-error', error: 'not-a-player' }));
        return;
    }

    // 3. Sanitize — trim and enforce length
    const trimmed = message.trim();
    if (!trimmed || trimmed.length === 0) return;
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
        ws.send(JSON.stringify({
            action: 'chat-error',
            error: 'message-too-long',
            max: MAX_MESSAGE_LENGTH
        }));
        return;
    }

    // 4. Persist
    let saved;
    try {
        saved = await insertChatMessage(gameId, senderId, trimmed);
    } catch (err) {
        console.error(`[handleChat] DB insert failed for game ${gameId}:`, err);
        ws.send(JSON.stringify({ action: 'chat-error', error: 'server-error' }));
        return;
    }

    // 5. Broadcast to both players
    broadcastToGame(gameId, {
        action: 'chat-message',
        data: {
            id: saved.id,
            gameId,
            senderId,
            message: trimmed,
            createdAt: saved.createdAt,
        }
    });
};