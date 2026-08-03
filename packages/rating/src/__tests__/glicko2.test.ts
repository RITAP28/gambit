import { describe, expect, it } from "vitest";
import {
    applyInactivity,
    conservativeRating,
    defaultRating,
    isProvisional,
    rate,
    rateGame,
    type Rating
} from "../glicko2";

const r = (rating: number, deviation: number, volatility = 0.06): Rating => ({
    rating,
    deviation,
    volatility
});

describe("Glicko-2", () => {
    /**
     * The worked example from Glickman's specification (section "Example
     * calculation"). Matching it to 2dp is the strongest evidence the
     * implementation is correct.
     */
    it("reproduces the reference calculation from the specification", () => {
        const player = r(1500, 200, 0.06);
        const results = [
            { opponent: r(1400, 30), score: 1 as const },
            { opponent: r(1550, 100), score: 0 as const },
            { opponent: r(1700, 300), score: 0 as const }
        ];

        const updated = rate(player, results, 0.5);

        expect(updated.rating).toBeCloseTo(1464.06, 1);
        expect(updated.deviation).toBeCloseTo(151.52, 1);
        expect(updated.volatility).toBeCloseTo(0.05999, 4);
    });

    it("raises the winner and lowers the loser by the same magnitude for equal players", () => {
        const white = r(1500, 200);
        const black = r(1500, 200);

        const { white: w, black: b } = rateGame(white, black, "white_win");

        expect(w.rating).toBeGreaterThan(1500);
        expect(b.rating).toBeLessThan(1500);
        expect(w.rating - 1500).toBeCloseTo(1500 - b.rating, 6);
    });

    it("leaves evenly matched players almost unchanged after a draw", () => {
        const { white, black } = rateGame(r(1500, 100), r(1500, 100), "draw");

        expect(white.rating).toBeCloseTo(1500, 6);
        expect(black.rating).toBeCloseTo(1500, 6);
    });

    it("moves an established rating less than a provisional one", () => {
        const established = rate(r(1500, 40), [{ opponent: r(1500, 40), score: 1 }]);
        const provisional = rate(r(1500, 350), [{ opponent: r(1500, 40), score: 1 }]);

        expect(provisional.rating - 1500).toBeGreaterThan(established.rating - 1500);
    });

    it("rewards beating a stronger opponent more than a weaker one", () => {
        const beatStronger = rate(r(1500, 100), [{ opponent: r(1900, 100), score: 1 }]);
        const beatWeaker = rate(r(1500, 100), [{ opponent: r(1100, 100), score: 1 }]);

        expect(beatStronger.rating).toBeGreaterThan(beatWeaker.rating);
    });

    it("shrinks deviation as games are played", () => {
        let player = defaultRating();
        const before = player.deviation;

        for (let i = 0; i < 10; i += 1) {
            player = rate(player, [{ opponent: r(1500, 50), score: i % 2 === 0 ? 1 : 0 }]);
        }

        expect(player.deviation).toBeLessThan(before);
    });

    it("grows deviation during inactivity but never past the provisional default", () => {
        let player = r(1500, 50);
        player = applyInactivity(player);
        expect(player.deviation).toBeGreaterThan(50);

        for (let i = 0; i < 500; i += 1) player = applyInactivity(player);
        expect(player.deviation).toBeLessThanOrEqual(350);
        expect(player.rating).toBe(1500);
    });

    it("is order-independent when rating both sides of a game", () => {
        const white = r(1600, 80);
        const black = r(1450, 120);

        const forwards = rateGame(white, black, "black_win");
        const backwards = rateGame(black, white, "white_win");

        // Same game described from either seat must move each player identically.
        expect(forwards.white.rating).toBeCloseTo(backwards.black.rating, 9);
        expect(forwards.black.rating).toBeCloseTo(backwards.white.rating, 9);
    });

    it("ranks a provisional player below an established one at equal rating", () => {
        expect(conservativeRating(r(1500, 350))).toBeLessThan(conservativeRating(r(1500, 50)));
        expect(isProvisional(r(1500, 350))).toBe(true);
        expect(isProvisional(r(1500, 50))).toBe(false);
    });

    it("never produces NaN for extreme mismatches", () => {
        const crushed = rate(r(2800, 30), [{ opponent: r(600, 350), score: 0 }]);

        expect(Number.isFinite(crushed.rating)).toBe(true);
        expect(Number.isFinite(crushed.deviation)).toBe(true);
        expect(Number.isFinite(crushed.volatility)).toBe(true);
    });
});
