import { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import config from '../../infrastructure/activeconfig';
import { sendResponse, fetchUser } from '@repo/utils/src/index';
import { db, sessions } from '@repo/db';

export const logout = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.userId as string;
        if (!userId) return sendResponse(res, 400, false, "User ID is required");

        const existingUser = await fetchUser(userId);
        if (!existingUser) return sendResponse(res, 404, false, "User Not Found");
        
        // Clear access token cookie
        res.cookie("accessToken", "", {
            httpOnly: true,
            secure: config.ENV === "production",
            expires: new Date(0),
            sameSite: "strict",
            path: "/",
        });

        // Clear refresh token cookie
        res.cookie("refreshToken", "", {
            httpOnly: true,
            secure: config.ENV === "production",
            expires: new Date(0),
            sameSite: "strict",
            path: "/",
        });

        // Delete session from database
        const deletedSession = await db
            .delete(sessions)
            .where(eq(sessions.userId, userId))
            .returning();

        if (!deletedSession.length) {
            return sendResponse(res, 404, false, "No active session found");
        }

        return sendResponse(res, 200, true, "Logged out successfully");
    } catch (error) {
        console.error("Logout error:", error);
        return sendResponse(res, 500, false, "Internal server error");
    }
};