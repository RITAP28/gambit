import { sendResponse } from "@repo/utils/src";
import { Request, Response } from "express";
import { joinMatchMakingErrors } from "./constants";
import { fetchUser } from "../../../services/user.service";

export const run = async (req: Request, res: Response) => {
    const userId = req.body.data.userId as string;

    // validation if user exists or not
    const existingUser = await fetchUser(userId);
    if (!existingUser) return sendResponse(res, 404, false, joinMatchMakingErrors.USER_NOT_FOUND)
        
    try {
        
    } catch (error) {
        
    }
}