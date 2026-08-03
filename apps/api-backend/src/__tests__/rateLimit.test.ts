import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Limiters = typeof import("../middlewares/rateLimit.middleware");

/**
 * Each test gets a fresh module instance so the limiters' in-memory counters do
 * not leak between cases.
 */
async function freshLimiters(): Promise<Limiters> {
    vi.resetModules();
    return import("../middlewares/rateLimit.middleware");
}

/** An app whose handler always succeeds. */
async function successApp() {
    const { authLimiter, analysisLimiter, globalLimiter } = await freshLimiters();

    const app = express();
    app.use(express.json());
    app.post("/api", globalLimiter, authLimiter, analysisLimiter, (req, res) => {
        res.status(200).json({ action: req.body.action });
    });
    return app;
}

/** An app whose handler always rejects credentials, as a failed login would. */
async function failingAuthApp() {
    const { authLimiter } = await freshLimiters();

    const app = express();
    app.use(express.json());
    app.post("/api", authLimiter, (_req, res) => {
        res.status(401).json({ message: "Invalid credentials" });
    });
    return app;
}

const post = (app: express.Express, action: string) =>
    request(app).post("/api").send({ action });

describe("rate limiting", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("allows a normal number of login attempts", async () => {
        const app = await successApp();

        for (let i = 0; i < 5; i += 1) {
            expect((await post(app, "login-user")).status).toBe(200);
        }
    });

    /**
     * The limiter used to be defined next to the login handler and never
     * applied to a route, leaving password guessing entirely unthrottled.
     */
    it("blocks repeated failed login attempts", async () => {
        const app = await failingAuthApp();

        for (let i = 0; i < 5; i += 1) {
            expect((await post(app, "login-user")).status).toBe(401);
        }

        const blocked = await post(app, "login-user");
        expect(blocked.status).toBe(429);
        expect(blocked.body.message).toContain("Too many attempts");
    });

    it("counts login and register against separate budgets", async () => {
        const app = await failingAuthApp();

        for (let i = 0; i < 5; i += 1) {
            await post(app, "login-user");
        }

        expect((await post(app, "login-user")).status).toBe(429);
        // Registration has its own bucket and should be untouched.
        expect((await post(app, "register-user")).status).toBe(401);
    });

    it("does not throttle ordinary gameplay actions with the auth limiter", async () => {
        const app = await successApp();

        for (let i = 0; i < 20; i += 1) {
            expect((await post(app, "get-game-metadata")).status).toBe(200);
        }
    });

    it("throttles the expensive analysis action tightly", async () => {
        const app = await successApp();

        for (let i = 0; i < 5; i += 1) {
            expect((await post(app, "get-game-analysis")).status).toBe(200);
        }

        const blocked = await post(app, "get-game-analysis");
        expect(blocked.status).toBe(429);
        expect(blocked.body.message).toContain("Analysis is rate limited");
    });

    it("applies a global backstop across all actions", async () => {
        const app = await successApp();
        let sawLimit = false;

        for (let i = 0; i < 130; i += 1) {
            if ((await post(app, "get-user-metadata")).status === 429) {
                sawLimit = true;
                break;
            }
        }

        expect(sawLimit).toBe(true);
    });
});
