import { Chess } from "chess.js";
import { Engine, getSharedEngine, type EvaluationScore, type PositionEvaluation } from "./uci";
import {
    classifyMove,
    formatScore,
    gameAccuracy,
    moveAccuracy,
    winPercent,
    winPercentLost,
    type MoveQuality
} from "./evaluation";

export interface AnalysedMove {
    moveNumber: number;
    ply: number;
    color: "white" | "black";
    san: string;
    uci: string;
    /** Evaluation of the position that resulted from this move. */
    evaluation: EvaluationScore;
    evaluationText: string;
    winPercent: number;
    winPercentLost: number;
    accuracy: number;
    quality: MoveQuality;
    /** The move the engine preferred instead, in SAN. Null when they matched. */
    bestMove: string | null;
    bestLine: string[];
}

export interface GameAnalysis {
    moves: AnalysedMove[];
    accuracy: { white: number; black: number };
    summary: {
        white: Record<MoveQuality, number>;
        black: Record<MoveQuality, number>;
    };
    /** Largest single swing in the game, useful as the "turning point". */
    turningPoint: AnalysedMove | null;
    depth: number;
}

export interface AnalyseOptions {
    depth?: number;
    engine?: Engine;
    /** Called after each position so callers can stream progress. */
    onProgress?: (completed: number, total: number) => void;
}

const emptySummary = (): Record<MoveQuality, number> => ({
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0
});

const scoreOf = (evaluation: PositionEvaluation): EvaluationScore =>
    typeof evaluation.mate === "number" ? { mate: evaluation.mate } : { cp: evaluation.cp ?? 0 };

/**
 * Runs a full game through the engine and returns a per-move report.
 *
 * Each position is evaluated once, and a move is judged by comparing the
 * evaluation before it with the evaluation after it. That single pass is what
 * makes the cost linear in game length rather than quadratic.
 */
export async function analyseGame(
    sanMoves: string[],
    options: AnalyseOptions = {}
): Promise<GameAnalysis> {
    const depth = options.depth ?? 12;
    const engine = options.engine ?? getSharedEngine();

    const chess = new Chess();
    const positions: string[] = [chess.fen()];
    const played: Array<{ san: string; uci: string; color: "white" | "black" }> = [];

    for (const san of sanMoves) {
        const move = chess.move(san);
        if (!move) break;

        played.push({
            san: move.san,
            uci: `${move.from}${move.to}${move.promotion ?? ""}`,
            color: move.color === "w" ? "white" : "black"
        });
        positions.push(chess.fen());
    }

    // One evaluation per position: the starting position plus one after each move.
    const evaluations: PositionEvaluation[] = [];
    for (let i = 0; i < positions.length; i += 1) {
        const fen = positions[i] as string;
        const terminal = terminalEvaluation(fen);

        // A finished position has no search to run, and engines report it
        // inconsistently — decide it from the board instead of asking.
        evaluations.push(terminal ?? (await engine.evaluate(fen, depth)));
        options.onProgress?.(i + 1, positions.length);
    }

    const moves: AnalysedMove[] = [];
    const summary = { white: emptySummary(), black: emptySummary() };
    const accuracies = { white: [] as number[], black: [] as number[] };

    for (let ply = 0; ply < played.length; ply += 1) {
        const entry = played[ply]!;
        const before = evaluations[ply]!;
        const after = evaluations[ply + 1]!;

        const beforeScore = scoreOf(before);
        const afterScore = scoreOf(after);
        const moverIsWhite = entry.color === "white";

        const lost = winPercentLost(beforeScore, afterScore, moverIsWhite);
        const accuracy = moveAccuracy(lost);
        const playedBest = before.bestMove === entry.uci;
        const quality = classifyMove(lost, playedBest);

        moves.push({
            moveNumber: Math.floor(ply / 2) + 1,
            ply: ply + 1,
            color: entry.color,
            san: entry.san,
            uci: entry.uci,
            evaluation: afterScore,
            evaluationText: formatScore(afterScore),
            winPercent: Math.round(winPercent(afterScore) * 10) / 10,
            winPercentLost: Math.round(lost * 10) / 10,
            accuracy: Math.round(accuracy * 10) / 10,
            quality,
            bestMove: playedBest ? null : toSan(positions[ply] as string, before.bestMove),
            bestLine: before.pv.slice(0, 6)
        });

        summary[entry.color][quality] += 1;
        accuracies[entry.color].push(accuracy);
    }

    const turningPoint = moves.reduce<AnalysedMove | null>((worst, move) => {
        if (!worst) return move.winPercentLost >= 10 ? move : null;
        return move.winPercentLost > worst.winPercentLost ? move : worst;
    }, null);

    return {
        moves,
        accuracy: {
            white: gameAccuracy(accuracies.white),
            black: gameAccuracy(accuracies.black)
        },
        summary,
        turningPoint,
        depth
    };
}

/**
 * Decides a finished position without consulting the engine. Returns null when
 * the game is still live and a real search is needed.
 */
function terminalEvaluation(fen: string): PositionEvaluation | null {
    let board: Chess;
    try {
        board = new Chess(fen);
    } catch {
        return null;
    }

    if (board.isCheckmate()) {
        // The side to move is mated, so the other side won.
        const whiteToMove = board.turn() === "w";
        return { mate: whiteToMove ? -1 : 1, bestMove: null, pv: [], depth: 0 };
    }

    if (board.isStalemate() || board.isInsufficientMaterial() || board.isDraw()) {
        return { cp: 0, bestMove: null, pv: [], depth: 0 };
    }

    return null;
}

/** Converts a UCI move to SAN in the context of a position, for display. */
function toSan(fen: string, uci: string | null): string | null {
    if (!uci) return null;
    try {
        const board = new Chess(fen);
        const move = board.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci[4] ?? "q"
        });
        return move?.san ?? null;
    } catch {
        return null;
    }
}
