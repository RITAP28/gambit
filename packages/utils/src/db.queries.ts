import { eq } from "drizzle-orm";
import { db, users, sessions } from "@repo/db";

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
        console.error("Error while fetching user information");
        throw new Error("Error while fetching user information");
    }
}