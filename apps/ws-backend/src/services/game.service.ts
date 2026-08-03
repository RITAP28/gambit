import { and, asc, db, eq, games, moves, or } from "@repo/db";
import { Chess } from "chess.js";
import { resolveTimeControl } from "@repo/types";
import { activeGames, GameState } from "../state";
import { scheduleFlagFall } from "../clock";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const fetchExistingGame = async (gameId: string) => {
    try {
        const [existingGame] = await db.select().from(games).where(eq(games.id, gameId));
        return existingGame ?? null;
    } catch (error) {
        console.error("Error while fetching game information: ", error);
        throw new Error("Error while fetching game information");
    }
};

export const updateGameState = async (
    gameId: string,
    fen: string,
    updatedClocks: { white: number; black: number }
) => {
    try {
        await db
            .update(games)
            .set({
                currentFen: fen,
                whiteTimeLeft: Math.max(0, Math.floor(updatedClocks.white / 1000)),
                blackTimeLeft: Math.max(0, Math.floor(updatedClocks.black / 1000))
            })
            .where(eq(games.id, gameId));
    } catch (error) {
        console.error("error while updating game state: ", error);
        throw new Error("error while updating game state info");
    }
};

export interface CreateGameArgs {
    whitePlayerId: string;
    blackPlayerId: string;
    timeControlKey: string;
    isRated: boolean;
}

/**
 * Creates the persisted game row and its in-memory counterpart, and starts
 * white's clock.
 */
export async function createGame(args: CreateGameArgs): Promise<GameState> {
    const spec = resolveTimeControl(args.timeControlKey);

    const [row] = await db
        .insert(games)
        .values({
            whitePlayerId: args.whitePlayerId,
            blackPlayerId: args.blackPlayerId,

            timeControl: spec.name,
            timeLimitSecs: spec.initialSecs,
            incrementSecs: spec.incrementSecs,

            status: "in_progress",

            initialFen: STARTING_FEN,
            currentFen: STARTING_FEN,

            whiteTimeLeft: spec.initialSecs,
            blackTimeLeft: spec.initialSecs,

            isRated: args.isRated,

            startedAt: new Date(),
            endedAt: null
        })
        .returning();

    if (!row) throw new Error("failed to create game row");

    const game: GameState = {
        gameId: row.id,
        whitePlayerId: args.whitePlayerId,
        blackPlayerId: args.blackPlayerId,

        chess: new Chess(),
        activeColor: "white",
        status: "in_progress",

        lastMove: "",
        lastMoveTime: 0,
        moveStartTime: Date.now(),

        incrementMs: spec.incrementSecs * 1000,
        timeControl: spec.name,
        isRated: args.isRated,

        clocks: {
            white: spec.initialSecs * 1000,
            black: spec.initialSecs * 1000
        },

        drawOfferedBy: null,
        spectators: new Set()
    };

    activeGames.set(game.gameId, game);
    scheduleFlagFall(game);

    return game;
}

/**
 * Rebuilds an in-progress game from the database.
 *
 * Without this, `activeGames` being an in-memory map means a server restart
 * silently destroys every game in flight. Move history is replayed rather than
 * loading the stored FEN directly, because threefold repetition and the
 * fifty-move rule need the history, not just the current position.
 */
export async function rehydrateGame(gameId: string): Promise<GameState | null> {
    const cached = activeGames.get(gameId);
    if (cached) return cached;

    const row = await fetchExistingGame(gameId);
    if (!row || row.status !== "in_progress") return null;

    const history = await db
        .select()
        .from(moves)
        .where(eq(moves.gameId, gameId))
        .orderBy(asc(moves.moveNumber));

    const chess = new Chess();
    for (const move of history) {
        try {
            chess.move(move.san);
        } catch {
            // Stored history diverges from a legal game. Fall back to the last
            // known FEN so play can continue, losing only repetition detection
            // for the moves before this point.
            console.error(`[rehydrate] illegal stored move ${move.san} in ${gameId}`);
            if (row.currentFen) chess.load(row.currentFen);
            break;
        }
    }

    const game: GameState = {
        gameId: row.id,
        whitePlayerId: row.whitePlayerId,
        blackPlayerId: row.blackPlayerId,

        chess,
        activeColor: chess.turn() === "w" ? "white" : "black",
        status: "in_progress",

        lastMove: history.at(-1)?.uci ?? "",
        lastMoveTime: 0,
        moveStartTime: Date.now(),

        incrementMs: (row.incrementSecs ?? 0) * 1000,
        timeControl: row.timeControl,
        isRated: row.isRated ?? false,

        clocks: {
            white: (row.whiteTimeLeft ?? row.timeLimitSecs) * 1000,
            black: (row.blackTimeLeft ?? row.timeLimitSecs) * 1000
        },

        drawOfferedBy: null,
        spectators: new Set()
    };

    activeGames.set(gameId, game);
    scheduleFlagFall(game);

    console.log(`[rehydrate] restored game ${gameId} at move ${history.length}`);
    return game;
}

/**
 * Restores every unfinished game at boot so a deploy or crash does not abandon
 * games that are mid-play.
 */
export async function rehydrateAllActiveGames(): Promise<number> {
    try {
        const rows = await db
            .select({ id: games.id })
            .from(games)
            .where(eq(games.status, "in_progress"));

        let restored = 0;
        for (const row of rows) {
            if (await rehydrateGame(row.id)) restored += 1;
        }

        return restored;
    } catch (error) {
        console.error("[rehydrate] failed to restore active games:", error);
        return 0;
    }
}

/** All in-progress games a user is a player in. */
export async function findActiveGamesForUser(userId: string) {
    return db
        .select({ id: games.id })
        .from(games)
        .where(
            and(
                eq(games.status, "in_progress"),
                or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId))
            )
        );
}
