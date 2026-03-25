import { sendResponse } from "@repo/utils/src";
import { NextFunction, Request, Response } from "express";
import { fetchGameMoves } from "../get-game-analysis/constants";

export const run = async (req: Request, res: Response, next: NextFunction) => {
    const { action, data }: { action: string, data: { gameId: string }} = req.body;

    const gameId = data.gameId;
    if (action !== 'get-game-moves') return sendResponse(res, 400, false, 'incorrect function on the type of the request');
    if (!gameId) return sendResponse(res, 400, false, 'invalid game id');

    try {
        const gameMoves = await fetchGameMoves(gameId);
        return sendResponse(res, 200, true, 'game moves fetched successfully', {
            moves: gameMoves
        });
    } catch (error) {
        console.error('error while fetching game moves: ', error);
        return sendResponse(res, 500, false, 'internal server error');
    }
}