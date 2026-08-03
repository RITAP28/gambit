import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", async () => (await import("./helpers/dbMock")).makeDbMock());

const createGame = vi.fn();
vi.mock("../services/game.service", () => ({
    createGame: (...args: unknown[]) => createGame(...args)
}));
vi.mock("../services/rating.service", () => ({
    getOrCreateRating: vi.fn()
}));

import {
    enqueueForTest,
    isAcceptablePair,
    queueSnapshot,
    resetQueues,
    searchWindow,
    tryMatch,
    type QueueEntry
} from "../matchmaking";
import { mockSocket } from "./helpers/factories";

const NOW = 1_700_000_000_000;

function entry(overrides: Partial<QueueEntry> & { userId: string; rating: number }): QueueEntry {
    return {
        ws: mockSocket(overrides.userId),
        timeControlKey: "5+3",
        deviation: 50,
        isRated: true,
        joinedAt: NOW,
        ...overrides
    } as QueueEntry;
}

describe("matchmaking", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetQueues();
        createGame.mockImplementation(async (args: any) => ({
            gameId: "game-new",
            whitePlayerId: args.whitePlayerId,
            blackPlayerId: args.blackPlayerId,
            timeControl: "blitz",
            isRated: args.isRated,
            clocks: { white: 300_000, black: 300_000 },
            incrementMs: 3000
        }));
    });

    describe("search window", () => {
        it("starts narrow for an established rating", () => {
            expect(searchWindow(entry({ userId: "a", rating: 1500 }), NOW)).toBe(100);
        });

        it("widens the longer a player waits", () => {
            const player = entry({ userId: "a", rating: 1500 });

            const atStart = searchWindow(player, NOW);
            const after10s = searchWindow(player, NOW + 10_000);

            expect(after10s).toBeGreaterThan(atStart);
            expect(after10s).toBe(100 + 10 * 40);
        });

        it("opens wider immediately for an uncertain rating", () => {
            const provisional = entry({ userId: "a", rating: 1500, deviation: 350 });
            const established = entry({ userId: "b", rating: 1500, deviation: 50 });

            expect(searchWindow(provisional, NOW)).toBeGreaterThan(searchWindow(established, NOW));
        });

        it("is capped so it cannot grow without bound", () => {
            const player = entry({ userId: "a", rating: 1500 });
            expect(searchWindow(player, NOW + 60 * 60 * 1000)).toBe(1200);
        });
    });

    describe("pair acceptability", () => {
        it("accepts two closely rated players straight away", () => {
            const a = entry({ userId: "a", rating: 1500 });
            const b = entry({ userId: "b", rating: 1560 });

            expect(isAcceptablePair(a, b, NOW)).toBe(true);
        });

        it("rejects a wide rating gap at the start", () => {
            const a = entry({ userId: "a", rating: 1200 });
            const b = entry({ userId: "b", rating: 2000 });

            expect(isAcceptablePair(a, b, NOW)).toBe(false);
        });

        it("accepts that same gap once both have waited long enough", () => {
            const a = entry({ userId: "a", rating: 1200 });
            const b = entry({ userId: "b", rating: 2000 });

            expect(isAcceptablePair(a, b, NOW + 20_000)).toBe(true);
        });

        it("requires the gap to fit both players' windows, not just one", () => {
            // `a` has waited a long time and would accept anyone; `b` just joined.
            const a = entry({ userId: "a", rating: 1200, joinedAt: NOW - 60_000 });
            const b = entry({ userId: "b", rating: 2000, joinedAt: NOW });

            expect(isAcceptablePair(a, b, NOW)).toBe(false);
        });

        it("never mixes rated and casual players", () => {
            const a = entry({ userId: "a", rating: 1500, isRated: true });
            const b = entry({ userId: "b", rating: 1500, isRated: false });

            expect(isAcceptablePair(a, b, NOW)).toBe(false);
        });
    });

    describe("pairing", () => {
        it("does nothing with a single player queued", async () => {
            enqueueForTest(entry({ userId: "a", rating: 1500 }));

            await tryMatch("5+3");

            expect(createGame).not.toHaveBeenCalled();
            expect(queueSnapshot()["5+3"]).toBe(1);
        });

        it("pairs the longest waiter with their closest opponent", async () => {
            enqueueForTest(entry({ userId: "waiting", rating: 1500, joinedAt: NOW - 30_000 }));
            enqueueForTest(entry({ userId: "far", rating: 1700, joinedAt: NOW }));
            enqueueForTest(entry({ userId: "near", rating: 1520, joinedAt: NOW }));

            await tryMatch("5+3");

            expect(createGame).toHaveBeenCalledOnce();
            const players = [
                createGame.mock.calls[0]![0].whitePlayerId,
                createGame.mock.calls[0]![0].blackPlayerId
            ];
            expect(players).toContain("waiting");
            expect(players).toContain("near");
        });

        it("removes both players from the pool once matched", async () => {
            enqueueForTest(entry({ userId: "a", rating: 1500 }));
            enqueueForTest(entry({ userId: "b", rating: 1510 }));

            await tryMatch("5+3");

            expect(queueSnapshot()["5+3"] ?? 0).toBe(0);
        });

        it("leaves mismatched players queued rather than forcing a pairing", async () => {
            enqueueForTest(entry({ userId: "low", rating: 800 }));
            enqueueForTest(entry({ userId: "high", rating: 2400 }));

            await tryMatch("5+3");

            expect(createGame).not.toHaveBeenCalled();
            expect(queueSnapshot()["5+3"]).toBe(2);
        });

        it("keeps separate pools per time control", async () => {
            enqueueForTest(entry({ userId: "bullet", rating: 1500, timeControlKey: "1+0" }));
            enqueueForTest(entry({ userId: "classical", rating: 1500, timeControlKey: "30+0" }));

            await tryMatch("1+0");

            expect(createGame).not.toHaveBeenCalled();
            expect(queueSnapshot()["1+0"]).toBe(1);
            expect(queueSnapshot()["30+0"]).toBe(1);
        });

        it("pairs several games in one pass when the pool allows", async () => {
            for (const [id, rating] of [
                ["a", 1500],
                ["b", 1510],
                ["c", 1520],
                ["d", 1530]
            ] as const) {
                enqueueForTest(entry({ userId: id, rating }));
            }

            await tryMatch("5+3");

            expect(createGame).toHaveBeenCalledTimes(2);
            expect(queueSnapshot()["5+3"] ?? 0).toBe(0);
        });

        it("assigns colours without always favouring the same seat", async () => {
            const asWhite = new Set<string>();

            for (let i = 0; i < 40; i += 1) {
                resetQueues();
                createGame.mockClear();
                enqueueForTest(entry({ userId: "a", rating: 1500 }));
                enqueueForTest(entry({ userId: "b", rating: 1500 }));

                await tryMatch("5+3");
                asWhite.add(createGame.mock.calls[0]![0].whitePlayerId);
            }

            expect(asWhite.size).toBe(2);
        });
    });
});
