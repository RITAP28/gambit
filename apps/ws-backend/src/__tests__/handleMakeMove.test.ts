import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", async () => (await import("./helpers/dbMock")).makeDbMock());
vi.mock("../services/rating.service", () => ({
    applyRatingChange: vi.fn().mockResolvedValue(null),
    getOrCreateRating: vi.fn().mockResolvedValue({
        rating: 1500,
        deviation: 350,
        volatility: 0.06,
        gamesPlayed: 0,
        peakRating: 1500
    })
}));

import { activeGames } from "../state";
import { handleMakeMove } from "../messageHandler";
import { broadcastToGame } from "../utils/broadcastToGame";
import {
    BLACK_ID,
    lastMessage,
    makeGame,
    mockSocket,
    resetGames,
    sentMessages,
    STRANGER_ID,
    WHITE_ID
} from "./helpers/factories";

vi.mock("../utils/broadcastToGame", async () => {
    const actual = await vi.importActual<typeof import("../utils/broadcastToGame")>(
        "../utils/broadcastToGame"
    );
    return { ...actual, broadcastToGame: vi.fn() };
});

const move = (gameId: string, uci: string) => ({
    action: "possible-move",
    data: { gameId, uci }
});

describe("handleMakeMove", () => {
    const gameId = "game-123";

    beforeEach(() => {
        vi.clearAllMocks();
        resetGames();
    });

    it("broadcasts a legal move to both players", async () => {
        makeGame({ gameId, moveStartTime: Date.now() - 3000 });
        const ws = mockSocket(WHITE_ID);

        await handleMakeMove(ws, move(gameId, "e2e4"));

        expect(broadcastToGame).toHaveBeenCalledWith(
            gameId,
            expect.objectContaining({ action: "move-successful" })
        );
    });

    it("applies a legal move and flips the side to move", async () => {
        makeGame({ gameId, moveStartTime: Date.now() - 3000 });
        const ws = mockSocket(WHITE_ID);

        await handleMakeMove(ws, move(gameId, "e2e4"));

        const updated = activeGames.get(gameId)!;
        expect(updated.chess.history()).toContain("e4");
        expect(updated.activeColor).toBe("black");
    });

    it("rejects a move for a game that does not exist", async () => {
        const ws = mockSocket(WHITE_ID);

        await handleMakeMove(ws, move("nonexistent-game", "e2e4"));

        expect(lastMessage(ws)?.data.error).toBe("game-not-found");
        expect(broadcastToGame).not.toHaveBeenCalled();
    });

    it("rejects a move made out of turn", async () => {
        makeGame({ gameId });
        const ws = mockSocket(BLACK_ID);

        await handleMakeMove(ws, move(gameId, "e7e5"));

        expect(lastMessage(ws)?.action).toBe("not-your-turn");
    });

    it("rejects an illegal move", async () => {
        makeGame({ gameId });
        const ws = mockSocket(WHITE_ID);

        await handleMakeMove(ws, move(gameId, "e2e5"));

        expect(lastMessage(ws)?.action).toBe("illegal-move");
    });

    it("rejects a malformed move payload", async () => {
        makeGame({ gameId });
        const ws = mockSocket(WHITE_ID);

        await handleMakeMove(ws, { action: "possible-move", data: { gameId, uci: "zz" } });

        expect(lastMessage(ws)?.data.error).toBe("malformed-move");
    });

    describe("identity", () => {
        /**
         * The move payload used to carry a `playerId` that was trusted over the
         * socket's own identity, so any client could move its opponent's pieces.
         */
        it("ignores a playerId in the payload and uses the socket identity", async () => {
            makeGame({ gameId });
            const ws = mockSocket(BLACK_ID);

            // Black claims to be white while it is white's turn.
            await handleMakeMove(ws, {
                action: "possible-move",
                data: { gameId, uci: "e2e4", playerId: WHITE_ID }
            });

            expect(lastMessage(ws)?.action).toBe("not-your-turn");
            expect(activeGames.get(gameId)!.chess.history()).toHaveLength(0);
        });

        it("refuses a move from someone who is not in the game", async () => {
            makeGame({ gameId });
            const ws = mockSocket(STRANGER_ID);

            await handleMakeMove(ws, move(gameId, "e2e4"));

            expect(lastMessage(ws)?.data.error).toBe("not-a-player");
        });

        it("refuses a move from an unauthenticated socket", async () => {
            makeGame({ gameId });
            const ws = mockSocket(undefined);

            await handleMakeMove(ws, move(gameId, "e2e4"));

            expect(lastMessage(ws)?.data.error).toBe("not-authenticated");
        });
    });

    describe("clocks", () => {
        it("deducts elapsed time from the mover only", async () => {
            makeGame({ gameId, moveStartTime: Date.now() - 3000 });
            const ws = mockSocket(WHITE_ID);

            await handleMakeMove(ws, move(gameId, "e2e4"));

            const { clocks } = activeGames.get(gameId)!;
            expect(clocks.white).toBeLessThan(300_000);
            expect(clocks.white).toBeGreaterThan(290_000);
            expect(clocks.black).toBe(300_000);
        });

        it("credits the Fischer increment after a completed move", async () => {
            makeGame({ gameId, incrementMs: 5000, moveStartTime: Date.now() - 1000 });
            const ws = mockSocket(WHITE_ID);

            await handleMakeMove(ws, move(gameId, "e2e4"));

            // Spent ~1s, gained 5s, so the clock should be ahead of where it started.
            const { clocks } = activeGames.get(gameId)!;
            expect(clocks.white).toBeGreaterThan(303_000);
            expect(clocks.white).toBeLessThan(305_000);
        });

        it("ends the game when the mover's clock expired before the move landed", async () => {
            makeGame({ gameId, clocks: { white: 1000, black: 300_000 }, moveStartTime: Date.now() - 5000 });
            const ws = mockSocket(WHITE_ID);

            await handleMakeMove(ws, move(gameId, "e2e4"));

            expect(broadcastToGame).toHaveBeenCalledWith(
                gameId,
                expect.objectContaining({ action: "game-over" })
            );
            const payload = vi.mocked(broadcastToGame).mock.calls.at(-1)![1] as any;
            expect(payload.data.termination).toBe("timeout");
            expect(payload.data.color).toBe("black");
        });
    });

    describe("terminal positions", () => {
        it("detects checkmate and names the winner", async () => {
            // Fool's mate, one move from completion with black to play Qh4#.
            makeGame({
                gameId,
                fen: "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2"
            });
            const ws = mockSocket(BLACK_ID);

            await handleMakeMove(ws, move(gameId, "d8h4"));

            const payload = vi.mocked(broadcastToGame).mock.calls.at(-1)![1] as any;
            expect(payload.action).toBe("game-over");
            expect(payload.data.termination).toBe("checkmate");
            expect(payload.data.color).toBe("black");
            expect(payload.data.winner).toBe(BLACK_ID);
        });

        it("detects stalemate as a draw", async () => {
            // Lone black king on h8; Qg6 covers g7/g8/h7 without giving check,
            // leaving black with no legal move.
            makeGame({ gameId, fen: "7k/8/8/8/8/8/8/K5Q1 w - - 0 1" });
            const ws = mockSocket(WHITE_ID);

            await handleMakeMove(ws, move(gameId, "g1g6"));

            const payload = vi.mocked(broadcastToGame).mock.calls.at(-1)![1] as any;
            expect(payload.action).toBe("game-over");
            expect(payload.data.termination).toBe("stalemate");
            expect(payload.data.result).toBe("draw");
            expect(payload.data.winner).toBeNull();
        });

        it("records the PGN when a game ends", async () => {
            makeGame({
                gameId,
                fen: "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2"
            });
            const ws = mockSocket(BLACK_ID);

            await handleMakeMove(ws, move(gameId, "d8h4"));

            const payload = vi.mocked(broadcastToGame).mock.calls.at(-1)![1] as any;
            expect(payload.data.pgn).toContain("Qh4#");
        });
    });

    it("rolls the move back in memory when the database write fails", async () => {
        const { db } = (await import("@repo/db")) as any;
        db.insert.mockImplementationOnce(() => ({
            values: vi.fn(() => Promise.reject(new Error("connection lost")))
        }));

        makeGame({ gameId });
        const ws = mockSocket(WHITE_ID);

        await handleMakeMove(ws, move(gameId, "e2e4"));

        expect(activeGames.get(gameId)!.chess.history()).toHaveLength(0);
        expect(sentMessages(ws).some((m) => m.action === "server-error")).toBe(true);
        expect(broadcastToGame).not.toHaveBeenCalled();
    });
});
