import { db, eq, games } from "@repo/db";

export const fetchExistingGame = async (gameId: string) => {
  try {
    const existingGame = (await db.select().from(games).where(eq(games.id, gameId)))[0];
    return existingGame;
  } catch (error) {
    console.error("Error while fetching game information: ", error);
    throw new Error("Error while fetching game information");
  }
}

export const updateGameState = async (gameId: string, fen: string, updatedClocks: { white: number, black: number }) => {
  try {
    await db
      .update(games)
      .set({
        currentFen: fen,
        whiteTimeLeft: Math.floor(updatedClocks.white / 1000),
        blackTimeLeft: Math.floor(updatedClocks.black / 1000)
      })
      .where(eq(games.id, gameId));
  } catch (error) {
    console.error('error while updating game state: ', error);
    throw new Error("error while updating game state info");
  }
}