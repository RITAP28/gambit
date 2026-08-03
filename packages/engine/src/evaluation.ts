import type { EvaluationScore } from "./uci";

export type MoveQuality = "best" | "excellent" | "good" | "inaccuracy" | "mistake" | "blunder";

/**
 * Logistic mapping from centipawns to expected score, fitted against real game
 * outcomes. Raw centipawns are a poor basis for judging a move: losing 200cp
 * when already winning by 2000 barely matters, while losing 200cp from equality
 * is decisive. Converting to a win percentage first makes the two comparable.
 */
const CP_TO_WIN_SLOPE = 0.00368208;

/** Beyond this the position is winning enough that further gain is noise. */
const CP_CLAMP = 2000;

export function winPercent(score: EvaluationScore): number {
    if (typeof score.mate === "number") {
        // A forced mate is a certainty; sign says for whom.
        return score.mate > 0 ? 100 : 0;
    }

    const cp = clamp(score.cp ?? 0, -CP_CLAMP, CP_CLAMP);
    const chances = 2 / (1 + Math.exp(-CP_TO_WIN_SLOPE * cp)) - 1;

    return clamp(50 + 50 * chances, 0, 100);
}

/**
 * How much win probability the player on move gave away, in percentage points.
 * Always non-negative: an engine cannot improve on its own best line, so any
 * apparent gain is search noise and is floored at zero.
 */
export function winPercentLost(
    before: EvaluationScore,
    after: EvaluationScore,
    moverIsWhite: boolean
): number {
    const beforePct = winPercent(before);
    const afterPct = winPercent(after);

    const delta = moverIsWhite ? beforePct - afterPct : afterPct - beforePct;
    return Math.max(0, delta);
}

/**
 * Per-move accuracy on a 0–100 scale, from the same exponential fit Lichess
 * uses. A move that loses nothing scores ~100; a 20-point swing scores ~40.
 */
export function moveAccuracy(winPercentDrop: number): number {
    return clamp(103.1668 * Math.exp(-0.04354 * winPercentDrop) - 3.1669, 0, 100);
}

/**
 * Buckets a move by how much it cost, in win percentage rather than
 * centipawns. Thresholds follow the conventional labels players expect.
 */
export function classifyMove(
    winPercentDrop: number,
    playedEngineBestMove: boolean
): MoveQuality {
    if (playedEngineBestMove) return "best";
    if (winPercentDrop >= 20) return "blunder";
    if (winPercentDrop >= 10) return "mistake";
    if (winPercentDrop >= 5) return "inaccuracy";
    if (winPercentDrop >= 2) return "good";
    return "excellent";
}

/**
 * Game accuracy for one player: the mean of their per-move accuracies.
 *
 * A plain mean is used rather than a volatility-weighted one so the number is
 * explainable — a player can add up their own moves and get the same answer.
 */
export function gameAccuracy(moveAccuracies: number[]): number {
    if (moveAccuracies.length === 0) return 100;
    const total = moveAccuracies.reduce((sum, value) => sum + value, 0);
    return Math.round((total / moveAccuracies.length) * 10) / 10;
}

/** Human-readable evaluation, e.g. "+1.25" or "M4". */
export function formatScore(score: EvaluationScore): string {
    if (typeof score.mate === "number") {
        return score.mate > 0 ? `M${score.mate}` : `-M${Math.abs(score.mate)}`;
    }
    const pawns = (score.cp ?? 0) / 100;
    return pawns >= 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
}

const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);
