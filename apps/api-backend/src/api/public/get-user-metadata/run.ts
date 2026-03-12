import { db } from "@repo/db";
import { games } from "@repo/db/src/schema/game";
import { fetchUser, sendResponse } from "@repo/utils/src";
import { eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";

export const run = async (req: Request, res: Response, next: NextFunction) => {
    const { userId, opponentId, gameId } = req.body.data;
    if (!userId || !opponentId || !gameId) return sendResponse(res, 400, false, 'user/game id is required');
    if (typeof userId !== 'string' || typeof opponentId !== 'string' || typeof gameId !== 'string') return sendResponse(res, 400, false, 'invalid user/game id');

    try {
        const existingUser = await fetchUser(userId);
        if (!existingUser) return sendResponse(res, 404, false, 'user not found');

        const existingOpponent = await fetchUser(opponentId);
        if (!existingOpponent) return sendResponse(res, 404, false, 'opponent not found');

        const existingGame = (await db.select().from(games).where(eq(games.id, gameId)))[0];
        if (!existingGame) return sendResponse(res, 404, false, 'game not found');

        const playerDta = {
            id: existingUser.id,
            username: existingUser.username,
            email: existingUser.email,
            color: existingGame.whitePlayerId === userId ? 'w' : 'b',
            isActive: existingUser.isOnline,
            time: existingGame.whitePlayerId === userId ? existingGame.whiteTimeLeft : existingGame.blackTimeLeft,
            capturedBy: [],
            rating: 1000
        };

        const opponentDta = {
            id: existingOpponent.id,
            username: existingOpponent.username,
            email: existingOpponent.email,
            color: existingGame.whitePlayerId === opponentId ? 'w' : 'b',
            isActive: existingOpponent.isOnline,
            time: existingGame.whitePlayerId === opponentId ? existingGame.whiteTimeLeft : existingGame.blackTimeLeft,
            capturedBy: [],
            rating: 1000
        };

        return sendResponse(res, 200, true, 'user data fetched successfully', {
            metadata: {
                player: playerDta,
                opponent: opponentDta
            }
        });
    } catch (error) {
        console.error('error while fetching user metadata: ', error);
        return sendResponse(res, 500, false, 'internal server error');
    }
}