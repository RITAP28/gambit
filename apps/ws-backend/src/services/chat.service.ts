import { db, eq, asc, chatMessages, games } from "@repo/db";

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