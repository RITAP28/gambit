import { fetchUser, sendResponse } from "@repo/utils/src";
import { Request, Response } from "express";
import { deleteSession, logoutErrors } from "./constants";
import backendConfig from "../../../infra/activeconfig";

export const run = async (req: Request, res: Response) => {
    const userId = req.body.data.userId;
    if (!userId) return sendResponse(res, 400, false, logoutErrors.INVALID_ID);

    const existingUser = await fetchUser(userId);
    if (!existingUser) return sendResponse(res, 404, false, logoutErrors.USER_NOT_FOUND);

    try {
        // Clear access token cookie
        res.cookie("accessToken", "", {
            httpOnly: true,
            secure: backendConfig.ENV === "production",
            expires: new Date(0),
            sameSite: "strict",
            path: "/",
        });

        // Clear refresh token cookie
        res.cookie("refreshToken", "", {
            httpOnly: true,
            secure: backendConfig.ENV === "production",
            expires: new Date(0),
            sameSite: "strict",
            path: "/",
        });

        // Delete session from database
        const deletedSession = await deleteSession(userId);
        if (!deletedSession) return sendResponse(res, 404, false, logoutErrors.SESSION_NOT_FOUND);

        return sendResponse(res, 200, true, "Logged out successfully");
    } catch (error) {
        
    }
}