import config from "@/infra/activeconfig";
import type { GameOverInfo } from "@/hooks/useGame";
import { useAppSelector } from "@/redux/hook";
import type { IGameMoves } from "@repo/types";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";

interface IGameOverModalProps {
    gameOverInfo: GameOverInfo;
    gameId: string;
    playerColor: 'w' | 'b';
    playerId: string;
}

interface AnalysedMove {
    moveNumber: number;
    color: 'white' | 'black';
    san: string;
    evaluationText: string;
    winPercentLost: number;
    quality: string;
    bestMove: string | null;
}

interface EngineAnalysis {
    moves: AnalysedMove[];
    accuracy: { white: number; black: number };
    summary: Record<'white' | 'black', Record<string, number>>;
    turningPoint: AnalysedMove | null;
    depth: number;
}

/** One Server-Sent Event from the analysis stream. */
interface AnalysisEvent {
    type: 'status' | 'engine-progress' | 'engine-analysis' | 'chunk' | 'done' | 'error';
    message?: string;
    completed?: number;
    total?: number;
    analysis?: EngineAnalysis;
    content?: string;
    error?: string;
    metadata?: {
        tokensUsed?: number;
        processingTime?: number;
        depth?: number;
    };
}

/** Terminations where replaying the game through an engine is meaningful. */
const ANALYSABLE_TERMINATIONS = [
    'checkmate',
    'stalemate',
    'threefold_repetition',
    'insufficient_material',
    'fifty_move_rule',
    'resignation',
    'timeout',
    'agreement'
];

const parseMarkdown = (text: string): string => {
    const lines = text.split('\n');

    const parsed = lines.map((line) => {
        if (line.startsWith('### ')) {
            return `<h3 class="text-base font-semibold text-white mt-4 mb-1">${line.slice(4)}</h3>`;
        }
        if (line.startsWith('## ')) {
            return `<h2 class="text-lg font-semibold text-white mt-5 mb-2 border-b border-neutral-600 pb-1">${line.slice(3)}</h2>`;
        }
        if (line.startsWith('# ')) {
            return `<h1 class="text-xl font-bold text-white mt-5 mb-2">${line.slice(2)}</h1>`;
        }
        if (/^\d+\.\s/.test(line)) {
            const content = line.replace(/^\d+\.\s/, '');
            return `<li class="ml-4 list-decimal text-neutral-300 text-sm mb-1">${applyInline(content)}</li>`;
        }
        if (/^[-*]\s/.test(line)) {
            return `<li class="ml-4 list-disc text-neutral-300 text-sm mb-1">${applyInline(line.slice(2))}</li>`;
        }
        if (line.trim() === '') {
            return `<div class="h-2"></div>`;
        }
        return `<p class="text-neutral-300 text-sm mb-1">${applyInline(line)}</p>`;
    });

    return parsed.join('');
};

const escapeHtml = (text: string): string =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

const applyInline = (text: string): string =>
    // Escaping first matters: this output is passed to dangerouslySetInnerHTML,
    // and the model's response is not trusted markup.
    escapeHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
        .replace(/\*(.+?)\*/g, '<em class="text-neutral-200 italic">$1</em>')
        .replace(/`(.+?)`/g, '<code class="bg-neutral-800 text-green-400 px-1 rounded text-xs font-mono">$1</code>');

const QUALITY_COLOURS: Record<string, string> = {
    blunder: 'text-red-400',
    mistake: 'text-orange-400',
    inaccuracy: 'text-yellow-400'
};

const GameOverModal = ({ gameOverInfo, gameId, playerColor, playerId }: IGameOverModalProps) => {
    const { user } = useAppSelector((state) => state.auth);

    const [movesLoading, setMovesLoading] = useState(false);
    const [movesError, setMovesError] = useState<string | null>(null);
    const [moves, setMoves] = useState<IGameMoves[]>([]);

    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [analysisText, setAnalysisText] = useState('');
    const [analysisDone, setAnalysisDone] = useState(false);
    const [engineAnalysis, setEngineAnalysis] = useState<EngineAnalysis | null>(null);
    const [engineProgress, setEngineProgress] = useState<{ completed: number; total: number } | null>(null);
    const [phase, setPhase] = useState<string>('');
    const [analysisMetadata, setAnalysisMetadata] = useState<{
        tokensUsed?: number;
        processingTime: number;
        depth?: number;
    } | null>(null);

    const analysisEndRef = useRef<HTMLDivElement>(null);

    const winnerLabel =
        gameOverInfo.color === 'white' ? 'White' : gameOverInfo.color === 'black' ? 'Black' : null;

    const youWon =
        gameOverInfo.winner !== null &&
        ((gameOverInfo.color === 'white' && playerColor === 'w') ||
            (gameOverInfo.color === 'black' && playerColor === 'b'));

    /**
     * This was previously a bare array reference, which is always truthy, so
     * the analysis panel rendered for every termination including aborts.
     */
    const analysisAvailable = ANALYSABLE_TERMINATIONS.includes(gameOverInfo.termination ?? '');

    const myRating = playerColor === 'w' ? gameOverInfo.ratings?.white : gameOverInfo.ratings?.black;

    useEffect(() => {
        const controller = new AbortController();

        const handleFetchMoves = async () => {
            setMovesLoading(true);
            setMovesError(null);

            try {
                const response = await axios.post(
                    `${config.DEV_BASE_URL}`,
                    { action: 'get-game-moves', data: { gameId } },
                    { headers: { "Content-Type": "application/json" }, signal: controller.signal }
                );

                if (response.status === 200) setMoves(response.data.moves);
            } catch (error) {
                if (axios.isCancel(error)) return;
                console.error('error while fetching moves: ', error);
                setMovesError('could not fetch moves');
            } finally {
                setMovesLoading(false);
            }
        };

        void handleFetchMoves();
        return () => controller.abort();
    }, [gameId]);

    const handleFetchAnalysis = useCallback(async () => {
        if (!analysisAvailable || analysisLoading || analysisDone) return;

        setAnalysisLoading(true);
        setAnalysisError(null);
        setAnalysisText('');
        setEngineProgress(null);

        try {
            const response = await fetch(`${config.DEV_BASE_URL}`, {
                method: 'POST',
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${user?.accessToken}`
                },
                body: JSON.stringify({ action: 'get-game-analysis', data: { gameId } })
            });

            if (!response.ok || !response.body) {
                throw new Error("Failed to connect to analysis service");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            // Events can straddle chunk boundaries, so hold a buffer and only
            // consume whole `data: ...` lines out of it.
            let buffer = '';

            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;

                    let parsed: AnalysisEvent;
                    try {
                        parsed = JSON.parse(line.slice(6));
                    } catch {
                        // A partial or malformed event is skipped rather than
                        // aborting the whole stream.
                        continue;
                    }

                    switch (parsed.type) {
                        case 'status':
                            setPhase(parsed.message ?? '');
                            break;
                        case 'engine-progress':
                            if (parsed.completed !== undefined && parsed.total) {
                                setEngineProgress({
                                    completed: parsed.completed,
                                    total: parsed.total
                                });
                            }
                            break;
                        case 'engine-analysis':
                            if (parsed.analysis) setEngineAnalysis(parsed.analysis);
                            break;
                        case 'chunk':
                            if (parsed.content) {
                                setAnalysisText((previous) => previous + parsed.content);
                            }
                            break;
                        case 'done':
                            setAnalysisDone(true);
                            setAnalysisMetadata({
                                tokensUsed: parsed.metadata?.tokensUsed,
                                processingTime: parsed.metadata?.processingTime ?? 0,
                                depth: parsed.metadata?.depth
                            });
                            break;
                        case 'error':
                            setAnalysisError(parsed.error ?? 'Analysis failed.');
                            break;
                        default:
                            break;
                    }
                }
            }
        } catch (error) {
            console.error('error while fetching game analysis: ', error);
            setAnalysisError(error instanceof Error ? error.message : 'Something went wrong');
        } finally {
            setAnalysisLoading(false);
        }
    }, [analysisAvailable, analysisDone, analysisLoading, gameId, user?.accessToken]);

    useEffect(() => {
        analysisEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [analysisText]);

    const subtitleText = () => {
        switch (gameOverInfo.termination) {
            case 'resignation':
                return youWon ? 'Your opponent resigned' : 'You resigned';
            case 'checkmate':
                return youWon ? 'Excellent checkmate!' : 'You got checkmated';
            case 'timeout':
                return youWon ? 'Your opponent ran out of time' : 'You ran out of time';
            case 'agreement':
                return 'Draw agreed';
            case 'stalemate':
                return 'Stalemate';
            case 'threefold_repetition':
                return 'Draw by repetition';
            case 'insufficient_material':
                return 'Draw — insufficient material';
            case 'fifty_move_rule':
                return 'Draw by the fifty-move rule';
            default:
                return gameOverInfo.reason;
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-neutral-800 text-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-lg p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">

                {/* Result icon + text */}
                <div className="flex flex-col items-center gap-2 text-center">
                    <div className="text-5xl">
                        {gameOverInfo.winner === null ? '🤝' : youWon ? '🏆' : '🏳'}
                    </div>
                    <p className="text-xl font-semibold tracking-tight">
                        {winnerLabel ? `${winnerLabel} wins` : 'Match Drawn'}
                    </p>
                    <p className="text-sm text-neutral-400 tracking-tight">{subtitleText()}</p>

                    {myRating && (
                        <p className="text-sm tracking-tight">
                            <span className="text-neutral-400">Rating </span>
                            <span className="font-semibold">{myRating.after}</span>
                            <span
                                className={
                                    myRating.change > 0
                                        ? 'text-green-400 ml-1'
                                        : myRating.change < 0
                                          ? 'text-red-400 ml-1'
                                          : 'text-neutral-400 ml-1'
                                }
                            >
                                {myRating.change > 0 ? `+${myRating.change}` : myRating.change}
                            </span>
                            {myRating.provisional && (
                                <span className="text-neutral-500 ml-1" title="Provisional rating">?</span>
                            )}
                        </p>
                    )}
                </div>

                {/* Move history */}
                <div className="w-full">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
                        Moves
                    </p>
                    {movesLoading && (
                        <p className="text-xs text-neutral-500 animate-pulse">Loading moves...</p>
                    )}
                    {movesError && <p className="text-xs text-red-400">{movesError}</p>}
                    {!movesLoading && moves.length > 0 && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-h-32 overflow-y-auto text-xs font-mono">
                            {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                                const white = moves[i * 2];
                                const black = moves[i * 2 + 1];
                                return (
                                    <div key={white?.id ?? i} className="contents">
                                        <span className="text-neutral-500">{i + 1}.</span>
                                        <span className="text-neutral-300">
                                            {white?.san ?? ''}
                                            {black ? ` ${black.san}` : ''}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Game analysis section */}
                {analysisAvailable && (
                    <div className="w-full">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                                Game Analysis
                            </p>
                            {analysisDone && analysisMetadata && (
                                <span className="text-xs text-neutral-600">
                                    {analysisMetadata.depth ? `depth ${analysisMetadata.depth} · ` : ''}
                                    {(analysisMetadata.processingTime / 1000).toFixed(1)}s
                                </span>
                            )}
                        </div>

                        {!analysisLoading && !analysisText && !engineAnalysis && !analysisError && (
                            <button
                                type="button"
                                onClick={handleFetchAnalysis}
                                className="w-full text-sm px-4 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-sm transition duration-300 tracking-tight"
                            >
                                ✦ Analyse this game
                            </button>
                        )}

                        {analysisLoading && !engineAnalysis && (
                            <div className="bg-neutral-900 rounded-md p-4 text-sm">
                                <p className="text-neutral-400 tracking-tight">{phase || 'Starting…'}</p>
                                {engineProgress && (
                                    <>
                                        <div className="mt-2 h-1 w-full bg-neutral-800 rounded">
                                            <div
                                                className="h-1 bg-green-500 rounded transition-all"
                                                style={{
                                                    width: `${(engineProgress.completed / engineProgress.total) * 100}%`
                                                }}
                                            />
                                        </div>
                                        <p className="text-xs text-neutral-600 mt-1">
                                            {engineProgress.completed} / {engineProgress.total} positions
                                        </p>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Engine numbers, shown before the written commentary */}
                        {engineAnalysis && (
                            <div className="bg-neutral-900 rounded-md p-4 mb-2 text-sm">
                                <div className="flex justify-between mb-2">
                                    <span className="text-neutral-400">Accuracy</span>
                                    <span className="font-mono">
                                        White {engineAnalysis.accuracy.white}% · Black{' '}
                                        {engineAnalysis.accuracy.black}%
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs text-neutral-500">
                                    <span>
                                        White: {engineAnalysis.summary.white.blunder} blunders,{' '}
                                        {engineAnalysis.summary.white.mistake} mistakes
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs text-neutral-500">
                                    <span>
                                        Black: {engineAnalysis.summary.black.blunder} blunders,{' '}
                                        {engineAnalysis.summary.black.mistake} mistakes
                                    </span>
                                </div>

                                {engineAnalysis.turningPoint && (
                                    <p className="text-xs text-neutral-400 mt-2">
                                        Turning point: move {engineAnalysis.turningPoint.moveNumber}{' '}
                                        <span className="font-mono">{engineAnalysis.turningPoint.san}</span>{' '}
                                        <span className={QUALITY_COLOURS[engineAnalysis.turningPoint.quality] ?? ''}>
                                            ({engineAnalysis.turningPoint.quality})
                                        </span>
                                    </p>
                                )}
                            </div>
                        )}

                        {(analysisLoading || analysisText) && engineAnalysis && (
                            <div className="bg-neutral-900 rounded-md p-4 max-h-72 overflow-y-auto text-sm leading-relaxed">
                                <div dangerouslySetInnerHTML={{ __html: parseMarkdown(analysisText) }} />
                                {!analysisDone && (
                                    <span className="inline-block w-2 h-4 bg-neutral-400 animate-pulse ml-0.5 align-middle" />
                                )}
                                <div ref={analysisEndRef} />
                            </div>
                        )}

                        {analysisError && (
                            <div className="bg-red-950 border border-red-800 rounded-md p-3 text-sm text-red-300">
                                {analysisError}
                                <button
                                    onClick={handleFetchAnalysis}
                                    className="ml-2 underline text-red-400 hover:text-red-300"
                                >
                                    Retry
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="w-full flex flex-col gap-2">
                    <button
                        type="button"
                        className="w-full tracking-tight text-sm px-4 py-2 bg-neutral-900 hover:bg-neutral-800 rounded-sm transition duration-300 ease-in-out"
                        onClick={() => { window.location.href = `/home/${playerId}`; }}
                    >
                        Back to Dashboard
                    </button>
                </div>

            </div>
        </div>
    );
}

export default GameOverModal
