import { asc, db, moves, eq } from "@repo/db";

/**
 * Moves are ordered explicitly. Postgres gives no ordering guarantee without an
 * ORDER BY, and replaying a game's moves out of order would silently produce a
 * different (and probably illegal) game.
 */
export const fetchGameMoves = async (gameId: string) => {
    try {
        return await db
            .select()
            .from(moves)
            .where(eq(moves.gameId, gameId))
            .orderBy(asc(moves.moveNumber));
    } catch (error) {
        console.error('error while fetching game moves: ', error);
        throw new Error('error while fetching game moves');
    }
}