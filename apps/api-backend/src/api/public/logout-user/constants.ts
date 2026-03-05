import { db, sessions } from "@repo/db";
import { eq } from "drizzle-orm";

export const logoutErrors = {
    INVALID_ID: 'Missing User ID',
    USER_NOT_FOUND: 'User not found',
    SESSION_NOT_FOUND: 'No active session found',
    INTERNAL_ERROR: 'Internal Server Error'
};

export const deleteSession = async (userId: string) => (await db.delete(sessions).where(eq(sessions.userId, userId)).returning())[0];