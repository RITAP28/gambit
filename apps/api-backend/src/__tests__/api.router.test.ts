import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApiRouter, type ApiHandler } from "../routes/api.router";

function appWith(handlers: Record<string, ApiHandler>) {
    const app = express();
    app.use(express.json());
    app.post("/api", createApiRouter(handlers));
    return app;
}

describe("api router", () => {
    it("dispatches to the handler named by the action", async () => {
        const handler = vi.fn((_req, res) => res.status(200).json({ ok: true }));
        const app = appWith({ "get-thing": handler });

        const response = await request(app).post("/api").send({ action: "get-thing" });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ok: true });
        expect(handler).toHaveBeenCalledOnce();
    });

    it("passes the request body through to the handler", async () => {
        const app = appWith({
            echo: (req, res) => res.status(200).json({ received: req.body.data })
        });

        const response = await request(app)
            .post("/api")
            .send({ action: "echo", data: { gameId: "abc" } });

        expect(response.body.received).toEqual({ gameId: "abc" });
    });

    it("rejects a request with no action", async () => {
        const response = await request(appWith({})).post("/api").send({});

        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Missing action");
    });

    it("rejects a non-string action", async () => {
        const response = await request(appWith({})).post("/api").send({ action: 42 });

        expect(response.status).toBe(400);
    });

    it("returns 404 for an action with no handler", async () => {
        const response = await request(appWith({})).post("/api").send({ action: "nope" });

        expect(response.status).toBe(404);
        expect(response.body.message).toContain("nope");
    });

    /**
     * A plain property lookup would resolve inherited Object members, so an
     * action of "constructor" would find a function and try to call it.
     */
    it("does not resolve inherited object properties as handlers", async () => {
        const app = appWith({});

        for (const action of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
            const response = await request(app).post("/api").send({ action });
            expect(response.status).toBe(404);
        }
    });

    it("returns 500 when a handler throws", async () => {
        const app = appWith({
            boom: () => {
                throw new Error("handler exploded");
            }
        });

        const response = await request(app).post("/api").send({ action: "boom" });

        expect(response.status).toBe(500);
        expect(response.body.message).toBe("Internal Server Error");
    });

    it("returns 500 when a handler rejects", async () => {
        const app = appWith({ boom: async () => Promise.reject(new Error("async failure")) });

        const response = await request(app).post("/api").send({ action: "boom" });

        expect(response.status).toBe(500);
    });

    /**
     * A handler that already streamed a response must not have a second set of
     * headers written over it by the error path.
     */
    it("does not double-respond when a handler fails after replying", async () => {
        const app = appWith({
            "half-written": (_req, res) => {
                res.status(200).json({ partial: true });
                throw new Error("failed after replying");
            }
        });

        const response = await request(app).post("/api").send({ action: "half-written" });

        expect(response.status).toBe(200);
    });
});
