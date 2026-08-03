import * as path from "path";
import * as fs from "fs";
import { Request, Response } from "express";
import { sendResponse } from "@repo/utils/src";

export type ApiHandler = (req: Request, res: Response) => unknown;

/**
 * Builds the dispatcher for the single `POST /api` endpoint.
 *
 * Taking the handler map as an argument (rather than reading the filesystem
 * inline) keeps the routing logic testable without a directory of real handlers
 * sitting behind it.
 */
export function createApiRouter(handlers: Record<string, ApiHandler>) {
    return async function apiRouter(req: Request, res: Response) {
        try {
            const { action } = req.body ?? {};

            if (!action || typeof action !== "string") {
                return sendResponse(res, 400, false, "Missing action");
            }

            // `hasOwnProperty` rather than a truthiness check: otherwise
            // "constructor" or "toString" would resolve to an inherited
            // function and be invoked as a handler.
            if (!Object.prototype.hasOwnProperty.call(handlers, action)) {
                return sendResponse(res, 404, false, `Unknown action: ${action}`);
            }

            return await handlers[action]!(req, res);
        } catch (error) {
            console.error("API router error: ", error);
            if (res.headersSent) return;
            return sendResponse(res, 500, false, "Internal Server Error");
        }
    };
}

/** Discovers handlers on disk: one directory per action, each exporting `run`. */
export function loadHandlers(
    apiDir: string = path.join(__dirname, "../api/public")
): Record<string, ApiHandler> {
    const handlers: Record<string, ApiHandler> = Object.create(null);

    if (!fs.existsSync(apiDir)) {
        console.warn(`[api] handler directory not found: ${apiDir}`);
        return handlers;
    }

    for (const folder of fs.readdirSync(apiDir)) {
        const runPath = path.join(apiDir, folder, "run");

        try {
            const module = require(runPath);
            if (typeof module.run === "function") {
                handlers[folder] = module.run;
            }
        } catch {
            console.warn(`Skipping ${folder}: no loadable run handler`);
        }
    }

    return handlers;
}

let cachedRouter: ReturnType<typeof createApiRouter> | null = null;

/**
 * Scanning the handler directory is deferred to the first request rather than
 * done at import time, so importing this module has no filesystem side effects.
 */
export const apiRouter = (req: Request, res: Response) => {
    cachedRouter ??= createApiRouter(loadHandlers());
    return cachedRouter(req, res);
};
