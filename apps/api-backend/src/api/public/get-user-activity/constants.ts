import { db, games, eq, or } from "@repo/db"

export interface IUserActivity {
    date: string
    played: number
    won: number
    lost: number
    draw: number
}

export const gamesPlayedByUser = async (userId: string) => {
  try {
    const gamesPlayed = await db
      .select({
        id: games.id,
        whitePlayerId: games.whitePlayerId,
        blackPlayerId: games.blackPlayerId,
        status: games.status,
        winner: games.winner,
        createdAt: games.createdAt,
        endedAt: games.endedAt
      })
      .from(games)
      .where(or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)));

    return gamesPlayed;
  } catch (error) {
    console.error('error while fetching games played: ', error);
    throw new Error('error while fetching games played');
  }
}