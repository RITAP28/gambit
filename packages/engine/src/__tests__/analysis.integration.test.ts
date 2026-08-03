import { describe, expect, it } from "vitest";
import { analyseGame } from "../analysis";
import { Engine } from "../uci";

/**
 * These exercise the real Stockfish binary rather than a stub, so they are
 * slower than the unit tests. Depth is kept low deliberately: the point is that
 * the plumbing produces sane numbers, not that the evaluation is deep.
 */
describe("analyseGame (real engine)", () => {
    const engine = new Engine({ binary: "lite-single", hashMb: 16, timeoutMs: 30_000 });

    // Scholar's mate. Black's 3...Nf6 walks into mate on f7.
    const scholarsMate = ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"];

    it("analyses every move of a game", { timeout: 120_000 }, async () => {
        const analysis = await analyseGame(scholarsMate, { depth: 8, engine });

        expect(analysis.moves).toHaveLength(scholarsMate.length);
        expect(analysis.moves[0]?.san).toBe("e4");
        expect(analysis.moves[0]?.color).toBe("white");
        expect(analysis.moves[1]?.color).toBe("black");
        expect(analysis.depth).toBe(8);
    });

    it("flags the losing move as a blunder", { timeout: 120_000 }, async () => {
        const analysis = await analyseGame(scholarsMate, { depth: 8, engine });

        const nf6 = analysis.moves.find((move) => move.san === "Nf6");
        expect(nf6).toBeDefined();
        expect(nf6!.color).toBe("black");
        expect(nf6!.quality).toBe("blunder");
        expect(nf6!.winPercentLost).toBeGreaterThan(20);
    });

    it("suggests a better move than the blunder that was played", { timeout: 120_000 }, async () => {
        const analysis = await analyseGame(scholarsMate, { depth: 8, engine });

        const nf6 = analysis.moves.find((move) => move.san === "Nf6")!;
        expect(nf6.bestMove).toBeTruthy();
        expect(nf6.bestMove).not.toBe("Nf6");
    });

    it("scores the winning side more accurately than the losing side", { timeout: 120_000 }, async () => {
        const analysis = await analyseGame(scholarsMate, { depth: 8, engine });

        expect(analysis.accuracy.white).toBeGreaterThan(analysis.accuracy.black);
        expect(analysis.accuracy.white).toBeLessThanOrEqual(100);
        expect(analysis.accuracy.black).toBeGreaterThanOrEqual(0);
    });

    it("recognises the final position as mate", { timeout: 120_000 }, async () => {
        const analysis = await analyseGame(scholarsMate, { depth: 8, engine });

        const last = analysis.moves.at(-1)!;
        expect(last.san).toBe("Qxf7#");
        // Mate delivered by White reads as 100% for White.
        expect(last.winPercent).toBe(100);
    });

    it("identifies a turning point", { timeout: 120_000 }, async () => {
        const analysis = await analyseGame(scholarsMate, { depth: 8, engine });

        expect(analysis.turningPoint).not.toBeNull();
        expect(analysis.turningPoint!.winPercentLost).toBeGreaterThan(0);
    });

    it("reports progress as it works through the game", { timeout: 120_000 }, async () => {
        const seen: number[] = [];
        await analyseGame(["e4", "e5"], {
            depth: 6,
            engine,
            onProgress: (completed) => seen.push(completed)
        });

        // Three positions: the start plus one after each of the two moves.
        expect(seen).toEqual([1, 2, 3]);
    });

    it("evaluates a known winning position in White's favour", { timeout: 60_000 }, async () => {
        // White is a full queen up.
        const result = await engine.evaluate("4k3/8/8/8/8/8/8/3QK3 w - - 0 1", 8);

        const score = result.mate ?? result.cp ?? 0;
        expect(score).toBeGreaterThan(0);
        expect(result.bestMove).toBeTruthy();
    });

    it("reports the same position from Black's side with the opposite sign", { timeout: 60_000 }, async () => {
        // Black is a full queen up, with Black to move.
        const result = await engine.evaluate("3qk3/8/8/8/8/8/8/4K3 b - - 0 1", 8);

        const score = result.mate ?? result.cp ?? 0;
        expect(score).toBeLessThan(0);
    });
});
