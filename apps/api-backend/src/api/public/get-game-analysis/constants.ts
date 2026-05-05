import { db, moves, eq } from "@repo/db";

export const fetchGameMoves = async (gameId: string) => {
    try {
        const gameMoves = await db.select().from(moves).where(eq(moves.gameId, gameId));
        return gameMoves;
    } catch (error) {
        console.error('error while fetching game moves: ', error);
        throw new Error('error while fetching game moves');
    }
}