import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", async () => (await import("./helpers/dbMock")).makeDbMock());

import { applyMoveToClocks, clearFlagFall, onFlagFall, scheduleFlagFall } from "../clock";
import { makeGame, resetGames } from "./helpers/factories";

describe("clock", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetGames();
    });

    afterEach(() => {
        vi.useRealTimers();
        onFlagFall(() => {});
    });

    describe("flag fall", () => {
        /**
         * The original implementation only checked the clock inside the move
         * handler, so a player who simply stopped moving never lost on time.
         */
        it("fires when the player on move never moves", async () => {
            const flagged = vi.fn();
            onFlagFall(flagged);

            const game = makeGame({ clocks: { white: 5000, black: 300_000 } });
            scheduleFlagFall(game);

            expect(flagged).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(5001);

            expect(flagged).toHaveBeenCalledOnce();
            expect(flagged.mock.calls[0]![1]).toBe("white");
            expect(game.clocks.white).toBe(0);
        });

        it("does not fire while time remains", async () => {
            const flagged = vi.fn();
            onFlagFall(flagged);

            const game = makeGame({ clocks: { white: 60_000, black: 60_000 } });
            scheduleFlagFall(game);

            await vi.advanceTimersByTimeAsync(59_000);

            expect(flagged).not.toHaveBeenCalled();
        });

        it("re-arms for the other player when the turn changes", async () => {
            const flagged = vi.fn();
            onFlagFall(flagged);

            const game = makeGame({ clocks: { white: 10_000, black: 3000 } });
            scheduleFlagFall(game);

            // White moves; black is now on the clock with only 3s.
            game.activeColor = "black";
            scheduleFlagFall(game);

            await vi.advanceTimersByTimeAsync(3001);

            expect(flagged).toHaveBeenCalledOnce();
            expect(flagged.mock.calls[0]![1]).toBe("black");
        });

        it("does not fire after the timer is cleared", async () => {
            const flagged = vi.fn();
            onFlagFall(flagged);

            const game = makeGame({ clocks: { white: 1000, black: 1000 } });
            scheduleFlagFall(game);
            clearFlagFall(game);

            await vi.advanceTimersByTimeAsync(5000);

            expect(flagged).not.toHaveBeenCalled();
        });

        it("does not fire for a game that already ended", async () => {
            const flagged = vi.fn();
            onFlagFall(flagged);

            const game = makeGame({ clocks: { white: 1000, black: 1000 } });
            scheduleFlagFall(game);
            game.status = "completed";

            await vi.advanceTimersByTimeAsync(5000);

            expect(flagged).not.toHaveBeenCalled();
        });

        /**
         * A timer already queued in the event loop must not flag a player whose
         * move landed in the same tick.
         */
        it("ignores a stale timer when the turn has already moved on", async () => {
            const flagged = vi.fn();
            onFlagFall(flagged);

            const game = makeGame({ clocks: { white: 1000, black: 300_000 } });
            scheduleFlagFall(game);

            game.activeColor = "black";

            await vi.advanceTimersByTimeAsync(2000);

            expect(flagged).not.toHaveBeenCalled();
        });
    });

    describe("applyMoveToClocks", () => {
        it("charges the mover for the time they spent", () => {
            const start = Date.now();
            const game = makeGame({ clocks: { white: 60_000, black: 60_000 }, moveStartTime: start });

            const clocks = applyMoveToClocks(game, "white", start + 4000);

            expect(clocks.white).toBe(56_000);
            expect(clocks.black).toBe(60_000);
        });

        it("adds the increment on top of the remaining time", () => {
            const start = Date.now();
            const game = makeGame({
                clocks: { white: 60_000, black: 60_000 },
                incrementMs: 3000,
                moveStartTime: start
            });

            const clocks = applyMoveToClocks(game, "white", start + 4000);

            expect(clocks.white).toBe(59_000);
        });

        it("withholds the increment from a player who has already flagged", () => {
            const start = Date.now();
            const game = makeGame({
                clocks: { white: 2000, black: 60_000 },
                incrementMs: 5000,
                moveStartTime: start
            });

            const clocks = applyMoveToClocks(game, "white", start + 4000);

            // Two seconds over: still negative, so the move is too late to save.
            expect(clocks.white).toBeLessThanOrEqual(0);
        });
    });
});
