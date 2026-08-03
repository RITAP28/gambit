import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", async () => (await import("./helpers/dbMock")).makeDbMock());
vi.mock("../services/rating.service", () => ({
    applyRatingChange: vi.fn().mockResolvedValue(null),
    getOrCreateRating: vi.fn()
}));
vi.mock("../utils/broadcastToGame", async () => {
    const actual = await vi.importActual<typeof import("../utils/broadcastToGame")>(
        "../utils/broadcastToGame"
    );
    return { ...actual, broadcastToGame: vi.fn() };
});

import { handleDrawOffer, handleDrawResponse, handleMakeMove } from "../messageHandler";
import { broadcastToGame } from "../utils/broadcastToGame";
import { BLACK_ID, lastMessage, makeGame, mockSocket, resetGames, STRANGER_ID, WHITE_ID } from "./helpers/factories";

const gameId = "game-draw";
const payload = { action: "offer-draw", data: { gameId } };

const lastBroadcast = () => vi.mocked(broadcastToGame).mock.calls.at(-1)?.[1] as any;

describe("draw offers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetGames();
    });

    it("records an offer and tells both sides", async () => {
        const game = makeGame({ gameId });
        const ws = mockSocket(WHITE_ID);

        await handleDrawOffer(ws, payload);

        expect(game.drawOfferedBy).toBe(WHITE_ID);
        expect(lastBroadcast().action).toBe("draw-offered");
    });

    it("ends the game as a draw when the opponent accepts", async () => {
        const game = makeGame({ gameId });
        await handleDrawOffer(mockSocket(WHITE_ID), payload);

        await handleDrawResponse(mockSocket(BLACK_ID), {
            action: "respond-draw",
            data: { gameId, accept: true }
        });

        const broadcast = lastBroadcast();
        expect(broadcast.action).toBe("game-over");
        expect(broadcast.data.result).toBe("draw");
        expect(broadcast.data.termination).toBe("agreement");
        expect(game.status).toBe("completed");
    });

    it("clears the offer when the opponent declines", async () => {
        const game = makeGame({ gameId });
        await handleDrawOffer(mockSocket(WHITE_ID), payload);

        await handleDrawResponse(mockSocket(BLACK_ID), {
            action: "respond-draw",
            data: { gameId, accept: false }
        });

        expect(game.drawOfferedBy).toBeNull();
        expect(lastBroadcast().action).toBe("draw-declined");
        expect(game.status).toBe("in_progress");
    });

    it("refuses to let a player accept their own offer", async () => {
        const game = makeGame({ gameId });
        await handleDrawOffer(mockSocket(WHITE_ID), payload);

        const ws = mockSocket(WHITE_ID);
        await handleDrawResponse(ws, { action: "respond-draw", data: { gameId, accept: true } });

        expect(lastMessage(ws)?.data.error).toBe("cannot-answer-own-offer");
        expect(game.status).toBe("in_progress");
    });

    it("refuses an offer from someone who is not playing", async () => {
        const game = makeGame({ gameId });
        const ws = mockSocket(STRANGER_ID);

        await handleDrawOffer(ws, payload);

        expect(lastMessage(ws)?.data.error).toBe("not-a-player");
        expect(game.drawOfferedBy).toBeNull();
    });

    it("treats a counter-offer as an acceptance", async () => {
        const game = makeGame({ gameId });

        await handleDrawOffer(mockSocket(WHITE_ID), payload);
        await handleDrawOffer(mockSocket(BLACK_ID), payload);

        expect(lastBroadcast().action).toBe("game-over");
        expect(game.status).toBe("completed");
    });

    it("rejects a duplicate offer from the same player", async () => {
        makeGame({ gameId });
        await handleDrawOffer(mockSocket(WHITE_ID), payload);

        const ws = mockSocket(WHITE_ID);
        await handleDrawOffer(ws, payload);

        expect(lastMessage(ws)?.data.error).toBe("already-offered");
    });

    it("implicitly declines an outstanding offer when the opponent moves", async () => {
        const game = makeGame({ gameId });
        await handleDrawOffer(mockSocket(BLACK_ID), payload);

        await handleMakeMove(mockSocket(WHITE_ID), {
            action: "possible-move",
            data: { gameId, uci: "e2e4" }
        });

        expect(game.drawOfferedBy).toBeNull();
        expect(game.status).toBe("in_progress");
    });

    it("rejects a response when there is no outstanding offer", async () => {
        makeGame({ gameId });
        const ws = mockSocket(BLACK_ID);

        await handleDrawResponse(ws, { action: "respond-draw", data: { gameId, accept: true } });

        expect(lastMessage(ws)?.data.error).toBe("no-offer");
    });
});
