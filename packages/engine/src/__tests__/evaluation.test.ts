import { describe, expect, it } from "vitest";
import {
    classifyMove,
    formatScore,
    gameAccuracy,
    moveAccuracy,
    winPercent,
    winPercentLost
} from "../evaluation";
import { parseInfoLine } from "../uci";

describe("winPercent", () => {
    it("treats a dead-equal position as a coin flip", () => {
        expect(winPercent({ cp: 0 })).toBeCloseTo(50, 5);
    });

    it("rises for White and falls for Black symmetrically", () => {
        expect(winPercent({ cp: 300 })).toBeGreaterThan(50);
        expect(winPercent({ cp: -300 })).toBeLessThan(50);
        expect(winPercent({ cp: 300 }) - 50).toBeCloseTo(50 - winPercent({ cp: -300 }), 5);
    });

    it("treats a forced mate as certain", () => {
        expect(winPercent({ mate: 3 })).toBe(100);
        expect(winPercent({ mate: -3 })).toBe(0);
    });

    it("saturates rather than running away at huge advantages", () => {
        expect(winPercent({ cp: 100_000 })).toBeLessThanOrEqual(100);
        expect(winPercent({ cp: 5000 })).toBeCloseTo(winPercent({ cp: 2000 }), 5);
    });
});

describe("winPercentLost", () => {
    it("charges White for a move that drops White's evaluation", () => {
        const lost = winPercentLost({ cp: 100 }, { cp: -400 }, true);
        expect(lost).toBeGreaterThan(0);
    });

    it("charges Black for a move that raises White's evaluation", () => {
        const lost = winPercentLost({ cp: -100 }, { cp: 400 }, false);
        expect(lost).toBeGreaterThan(0);
    });

    it("never reports a negative loss when the engine's score drifts", () => {
        expect(winPercentLost({ cp: 0 }, { cp: 50 }, true)).toBe(0);
        expect(winPercentLost({ cp: 0 }, { cp: -50 }, false)).toBe(0);
    });

    /**
     * The whole reason for working in win percentage: an equal centipawn loss
     * matters far less when the game is already decided.
     */
    it("penalises a swing near equality more than the same swing when winning", () => {
        const nearEquality = winPercentLost({ cp: 0 }, { cp: -200 }, true);
        const alreadyWinning = winPercentLost({ cp: 1800 }, { cp: 1600 }, true);

        expect(nearEquality).toBeGreaterThan(alreadyWinning);
    });
});

describe("classifyMove", () => {
    it("labels by severity", () => {
        expect(classifyMove(0.5, false)).toBe("excellent");
        expect(classifyMove(3, false)).toBe("good");
        expect(classifyMove(7, false)).toBe("inaccuracy");
        expect(classifyMove(14, false)).toBe("mistake");
        expect(classifyMove(35, false)).toBe("blunder");
    });

    it("calls the engine's own choice best regardless of the drop", () => {
        expect(classifyMove(0, true)).toBe("best");
        expect(classifyMove(30, true)).toBe("best");
    });
});

describe("moveAccuracy", () => {
    it("approaches 100 for a move that loses nothing", () => {
        expect(moveAccuracy(0)).toBeGreaterThan(99);
    });

    it("decreases monotonically as more is given away", () => {
        const points = [0, 5, 10, 20, 40].map(moveAccuracy);
        for (let i = 1; i < points.length; i += 1) {
            expect(points[i]!).toBeLessThan(points[i - 1]!);
        }
    });

    it("stays within bounds even for an enormous blunder", () => {
        expect(moveAccuracy(100)).toBeGreaterThanOrEqual(0);
        expect(moveAccuracy(100)).toBeLessThanOrEqual(100);
    });
});

describe("gameAccuracy", () => {
    it("is 100 for a game with no moves", () => {
        expect(gameAccuracy([])).toBe(100);
    });

    it("averages the per-move accuracies", () => {
        expect(gameAccuracy([100, 90, 80])).toBeCloseTo(90, 1);
    });
});

describe("formatScore", () => {
    it("renders centipawns as signed pawns", () => {
        expect(formatScore({ cp: 125 })).toBe("+1.25");
        expect(formatScore({ cp: -75 })).toBe("-0.75");
        expect(formatScore({ cp: 0 })).toBe("+0.00");
    });

    it("renders mate scores", () => {
        expect(formatScore({ mate: 4 })).toBe("M4");
        expect(formatScore({ mate: -2 })).toBe("-M2");
    });
});

describe("parseInfoLine", () => {
    const line =
        "info depth 12 seldepth 13 multipv 1 score cp 42 nodes 38013 nps 1118029 hashfull 15 time 34 pv g1f3 b8c6";

    it("extracts depth, score and principal variation", () => {
        const parsed = parseInfoLine(line, true);

        expect(parsed).toMatchObject({ depth: 12, cp: 42 });
        expect(parsed?.pv).toEqual(["g1f3", "b8c6"]);
    });

    /**
     * UCI reports relative to the side to move. Without this flip a good
     * position for Black would read as a good position for White.
     */
    it("flips the sign when Black is to move", () => {
        expect(parseInfoLine(line, false)?.cp).toBe(-42);
    });

    it("handles mate scores in both directions", () => {
        const mateLine = "info depth 10 score mate 3 pv e1e8";
        expect(parseInfoLine(mateLine, true)?.mate).toBe(3);
        expect(parseInfoLine(mateLine, false)?.mate).toBe(-3);
    });

    /**
     * `score mate 0` means the side to move has already been checkmated. Naive
     * sign-flipping turns that into -0 and credits the win to the wrong player.
     */
    it("credits a mate-0 position to the side that is not to move", () => {
        const mated = "info depth 0 score mate 0";

        // White to move and mated: Black won.
        expect(parseInfoLine(mated, true)?.mate).toBeLessThan(0);
        // Black to move and mated: White won.
        expect(parseInfoLine(mated, false)?.mate).toBeGreaterThan(0);
    });

    it("ignores lines that carry no score", () => {
        expect(parseInfoLine("info string NNUE evaluation using nn-abc.nnue", true)).toBeNull();
        expect(parseInfoLine("bestmove g1f3", true)).toBeNull();
    });
});
