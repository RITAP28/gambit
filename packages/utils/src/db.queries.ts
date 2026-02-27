import { eq } from "drizzle-orm";
import { db } from "@repo/db";
import { sessions } from "@repo/db/src/schema/session";

export const fetchUserSession = async (userId: string) => {
  try {
    const userSession = (
      await db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, userId))
    )[0];
    if (!userSession) throw new Error("db error");

    return userSession;
  } catch (error) {
    console.error("Error while fetching user session: ", error);
  }
};