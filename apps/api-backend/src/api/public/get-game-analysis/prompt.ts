import type { GameAnalysis } from "@repo/engine";

interface PromptContext {
    result: string | null;
    winner: string | null;
    timeControl: string;
    analysis: GameAnalysis;
}

const QUALITY_ORDER = ["blunder", "mistake", "inaccuracy"] as const;

/**
 * Builds the coaching prompt from evaluations Stockfish already computed.
 *
 * The model is given the numbers rather than asked to produce them. Language
 * models are unreliable at evaluating chess positions — they will confidently
 * call a good move a blunder — so the engine owns every judgement here and the
 * model's only job is to explain those judgements in prose.
 */
export function buildAnalysisPrompt({
    result,
    winner,
    timeControl,
    analysis
}: PromptContext): string {
    const notable = analysis.moves
        .filter((move) => QUALITY_ORDER.includes(move.quality as (typeof QUALITY_ORDER)[number]))
        .sort((a, b) => b.winPercentLost - a.winPercentLost)
        .slice(0, 8)
        .map(
            (move) =>
                `  - Move ${move.moveNumber} (${move.color}) ${move.san}: ${move.quality}, ` +
                `evaluation went to ${move.evaluationText} ` +
                `(gave away ${move.winPercentLost}% winning chances)` +
                (move.bestMove ? `. Engine preferred ${move.bestMove}.` : "")
        )
        .join("\n");

    const counts = (side: "white" | "black") => {
        const summary = analysis.summary[side];
        return `${summary.blunder} blunders, ${summary.mistake} mistakes, ${summary.inaccuracy} inaccuracies`;
    };

    const turningPoint = analysis.turningPoint
        ? `Move ${analysis.turningPoint.moveNumber} (${analysis.turningPoint.color}) ` +
          `${analysis.turningPoint.san}, which swung the evaluation to ` +
          `${analysis.turningPoint.evaluationText}`
        : "No single decisive turning point.";

    return `
You are a chess coach explaining a completed game to a club-level player.

An engine has already analysed this game at depth ${analysis.depth}. Use its
numbers as ground truth. Do NOT re-evaluate positions yourself, do not contradict
the engine, and do not invent moves or evaluations that are not listed below.

Game result: ${result ?? "unknown"}${winner ? ` (winner: ${winner})` : ""}
Time control: ${timeControl}
Total moves: ${analysis.moves.length}

Accuracy: White ${analysis.accuracy.white}%, Black ${analysis.accuracy.black}%
White played ${counts("white")}.
Black played ${counts("black")}.

Biggest turning point: ${turningPoint}

Notable moves the engine flagged:
${notable || "  - None; both sides played accurately."}

Write the following, in clear prose:
1. A two or three sentence summary of how the game went.
2. What decided the game, referring to the turning point above.
3. The most instructive mistake for each side, and what the better idea was.
4. One concrete thing each player should work on.

Refer to moves by their number and notation. Keep it under 400 words, and stay
concrete — a reader should be able to follow along on a board.
`.trim();
}
