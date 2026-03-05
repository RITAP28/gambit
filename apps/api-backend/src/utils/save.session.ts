import { eq } from "drizzle-orm";
import { db, sessions } from "@repo/db";
import backendConfig from "../infra/activeconfig";

export const saveSession = async (
  userId: string,
  accessToken: string,
  refreshToken: string
) => {
  try {
    const existingSession = (await db.select().from(sessions).where(eq(sessions.userId, userId)))[0];
    
    // Getting refresh token expiry in seconds
    const refreshTokenExpirySeconds = Number(backendConfig.REFRESH_TOKEN_EXPIRY_TIME) || 1209600;
    
    // Calculating expiry date by adding seconds
    const expiresAt = new Date();
    expiresAt.setTime(expiresAt.getTime() + (refreshTokenExpirySeconds * 1000)); // Converting seconds to milliseconds
    
    if (!existingSession) {
      const sessionInDB = (
        await db
          .insert(sessions)
          .values({
            userId: userId,
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt
          })
          .returning()
      )[0];

      console.log("session saved in the database");
      return sessionInDB;
    }

    const updatedSession = await db.update(sessions).set({
      accessToken: accessToken,
      refreshToken: refreshToken,
      expiresAt: expiresAt
    }).where(eq(sessions.userId, userId)).returning();

    console.log("session updated in the database");
    return updatedSession[0];
  } catch (error) {
    console.error("Error while saving session data: ", error);
    throw new Error("Error while saving session data");
  }
};