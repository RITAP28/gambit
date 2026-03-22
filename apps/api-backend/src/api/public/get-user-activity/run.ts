import { fetchUser, sendResponse } from "@repo/utils/src";
import { NextFunction, Request, Response } from "express";
import { gamesPlayedByUser, IUserActivity } from "./constants";

export const run = async (req: Request, res: Response, next: NextFunction) => {
    const { action, data } : { action: string, data: { userId: string } } = req.body;
    const userId = data.userId;

    // request body/input validation
    if (action !== 'get-user-activity') return sendResponse(res, 400, false, 'wrong request type, bad request');
    if (!userId) return sendResponse(res, 400, false, 'invalid user id');

    const activityMap = new Map<string, IUserActivity>();

    try {
        const existingUser = await fetchUser(userId);
        if (!existingUser) return sendResponse(res, 404, false, 'user not found');

        const gamesPlayed = await gamesPlayedByUser(userId);
        const completedGames = gamesPlayed.filter((game) => game.status === "completed" && game.endedAt);

        // arranging data in a proper manner
        completedGames.forEach((game) => {
            const date = game.endedAt.toISOString().split("T")[0];
            if (!activityMap.has(date)) {
                // setting the games against which are again set against user ids
                    activityMap.set(date, {
                        date,
                        played: 0,
                        won: 0,
                        lost: 0,
                        draw: 0
                    })
            };

            const entry = activityMap.get(date)!;
            entry.played += 1;

            if (game.winner === userId) entry.won += 1;
            else if (game.winner === 'draw') entry.draw += 1;
            else entry.lost += 1;
        });

        let userActivity: IUserActivity[] = [];
        userActivity = Array.from(activityMap.values()).sort((a,b) => a.date.localeCompare(b.date));
        console.log(`for user id ${userId}: `, userActivity);

        return sendResponse(res, 200, true, 'user activity fetched successfully', {
            activity: userActivity
        });
    } catch (error) {
        console.error('error while fetching user activity: ', error);
        return sendResponse(res, 500, false, 'internal server error');
    }
}