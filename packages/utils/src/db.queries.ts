import { asc, eq, or } from "drizzle-orm";
import { db, users, sessions } from "@repo/db";
import { games } from "@repo/db/src/schema/game";
import { chatMessages } from "@repo/db/src/schema/chat";

export const fetchUserSession = async (userId: string) => {
  try {
    const userSession = (await db.select().from(sessions).where(eq(sessions.userId, userId)))[0];
    if (!userSession) throw new Error("db error");
    return userSession;
  } catch (error) {
    console.error("Error while fetching user session: ", error);
  }
};

export const fetchUser = async (userId: string) => {
    try {
        const userInformation = (await db.select().from(users).where(eq(users.id, userId)))[0];
        return userInformation;
    } catch (error) {
        console.error("Error while fetching user information: ", error);
        throw new Error("Error while fetching user information");
    }
}

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

export const insertChatMessage = async (
    gameId: string,
    senderId: string,
    message: string
) => {
    const [saved] = await db
        .insert(chatMessages)
        .values({ gameId, senderId, message })
        .returning();
    return saved;
};

export const getChatHistory = async (gameId: string) => {
    return db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.gameId, gameId))
        .orderBy(asc(chatMessages.createdAt));
};

export const endGame = async (
  gameId: string,
  isResigned: boolean,
  isDraw: boolean,
  isAborted: boolean,
  isAbandoned: boolean,
  reason: "checkmate" | "resignation" | "timeout" | "stalemate" | "insufficient_material" | "threefold_repetition" | "fifty_move_rule" | "abondonment",
  winner: string | null, // winner's userId or null in case of draw
  color: 'white' | 'black' | null // winner color
) => {
  let updated: typeof games.$inferInsert;

  if (isResigned) {
    [updated] = await db.update(games).set({
        status: 'completed',
        winner: winner,
        termination: 'resignation',
        result: color === 'white' ? 'white_win' : 'black_win',
        endedAt: new Date()
      })
      .where(eq(games.id, gameId))
      .returning();
  } else if (isDraw) {
    [updated] = await db.update(games).set({
        status: 'completed',
        winner,
        termination: reason,
        result: 'draw',
        endedAt: new Date()
      })
      .where(eq(games.id, gameId))
      .returning();
  } else if (isAborted) {
    // abort option is possible if the user aborts the game before making any moves
    // so null will be recorded as the result & termination too
    // also, no winner will be declared
    [updated] = await db.update(games).set({
        status: 'aborted',
        winner: null,
        termination: null,
        result: null,
        endedAt: new Date()
      })
      .where(eq(games.id, gameId))
      .returning();
  } else if (isAbandoned) {
    // color opposite to the user color who abandoned will win
    [updated] = await db.update(games).set({
      status: 'abandoned',
      winner: winner,
      termination: 'abondonment',
      result: color === 'white' ? 'white_win' : 'black_win',
      endedAt: new Date()
    })
    .where(eq(games.id, gameId))
    .returning();
  }

  // only case remaining will be the player winning the game by playing it all
  // applicable when all the boolean conditions with this function are set to false
  [updated] = await db.update(games).set({
        status: 'completed',
        termination: reason,
        winner: winner,
        result: color === 'white' ? 'white_win' : 'black_win',
        endedAt: new Date()
    })
    .where(eq(games.id, gameId))
    .returning();

  return updated;
};