import type { Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { sendResponse } from "@repo/utils/src";

/**
 * Every request enters through a single `POST /api` endpoint and is dispatched
 * on `req.body.action`, so a plain per-route limiter cannot distinguish a login
 * attempt from a board refresh. These limiters key on the action instead, and
 * skip requests that are not the action they protect.
 */

const AUTH_ACTIONS = new Set(["login-user", "register-user"]);
const EXPENSIVE_ACTIONS = new Set(["get-game-analysis"]);

const actionOf = (req: Request): string =>
    typeof req.body?.action === "string" ? req.body.action : "";

/**
 * IPv6 addresses are handed out in huge blocks, so limiting on the exact
 * address is trivially bypassed. `ipKeyGenerator` normalises to a subnet.
 */
const keyBy = (suffix: (req: Request) => string) => (req: Request, _res: Response) =>
    `${ipKeyGenerator(req.ip ?? "")}:${suffix(req)}`;

const rejected = (message: string) => (req: Request, res: Response) =>
    sendResponse(res, 429, false, message);

/**
 * Strict limit on credential endpoints. Five attempts per quarter hour per IP
 * per action makes online password guessing impractical while staying clear of
 * a user who simply mistyped.
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: keyBy(actionOf),
    skip: (req) => !AUTH_ACTIONS.has(actionOf(req)),
    handler: rejected("Too many attempts, please try again later")
});

/**
 * Game analysis fans out to an engine and a language model, so it is orders of
 * magnitude more expensive than any other action and is limited separately.
 */
export const analysisLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: keyBy(actionOf),
    skip: (req) => !EXPENSIVE_ACTIONS.has(actionOf(req)),
    handler: rejected("Analysis is rate limited, please wait a moment")
});

/** Backstop against a client hammering the API with anything at all. */
export const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: keyBy(() => "global"),
    handler: rejected("Too many requests, please slow down")
});
