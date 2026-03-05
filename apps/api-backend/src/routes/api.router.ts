import path = require("path");
import * as fs from 'fs';
import { Request, Response } from "express";
import { sendResponse } from "@repo/utils/src";

const handlers: Record<string, any> = {};
const apiDir = path.join(__dirname, "../api/public");

// auto-loading handlers
fs.readdirSync(apiDir).forEach((folder) => {
    const runPath = path.join(apiDir, folder, "run");

    try {
        const module = require(runPath);
        if (module.run) {
            handlers[folder] = module.run;
            console.log(`Loaded API handler: ${folder}`);
        }
    } catch (error) {
        console.warn(`Skipping ${folder} no run.ts found`);
    };
});

export const apiRouter = async (req: Request, res: Response) => {
    console.log('req body: ', req.body)
    try {
        const { action } = req.body;
        if (!action) return sendResponse(res, 400, false, "Missing action");

        const handler = handlers[action];
        if (!handler) return sendResponse(res, 404, false, `Unknown action: ${action}`);

        return handler(req, res);
    } catch (error) {
        console.error("API router error: ", error);
        return sendResponse(res, 500, false, 'Internal Server Error');
    }
}