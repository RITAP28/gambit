import { db } from "@repo/db";
import { games } from "@repo/db/src/schema/game";
import { getChatHistory, sendResponse } from "@repo/utils/src";
import { eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

export const run = async (req: Request, res: Response, next: NextFunction) => {
    const { gameId } = req.body.data;
    if (!gameId) return sendResponse(res, 400, false, 'invalid game id');

    try {
        const existingGame = (await db.select().from(games).where(eq(games.id, gameId)))[0];
        if (!existingGame) return sendResponse(res, 404, false, 'game not found');

        const chatHistory = await getChatHistory(gameId);

        return sendResponse(res, 200, true, 'game metadata found successfully', {
            metadata: {
                game: existingGame,
                chatHistory: chatHistory
            }
        });
    } catch (error) {
        console.error('error while fetching game metadata: ', error);
        return sendResponse(res, 500, false, 'internal server error')
    }
}