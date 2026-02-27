import { NextFunction, Request, Response } from "express";
import { AppError } from "@repo/utils/src/error";

export const errorHandler = (err: Error | AppError, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message
        });
    };

    console.error('Unexpected Error: ', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
}