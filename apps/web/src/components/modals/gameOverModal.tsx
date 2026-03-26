import config from "@/infra/activeconfig";
import { useAppSelector } from "@/redux/hook";
import type { IGameMoves } from "@repo/types";
import axios from "axios";
import { useEffect, useRef, useState } from "react";

interface IGameOverModalProps {
    gameOverInfo: {
        isGameOver: boolean;
        reason: string;
        winner: string | null;
        color: 'white' | 'black' | null;
        resignedBy: string | null;
    };
    gameId: string;
    playerColor: 'w' | 'b';
    playerId: string;
}

const parseMarkdown = (text: string): string => {
    const lines = text.split('\n');

    const parsed = lines.map((line) => {
        // H3 ### heading
        if (line.startsWith('### ')) {
            return `<h3 class="text-base font-semibold text-white mt-4 mb-1">${line.slice(4)}</h3>`;
        }
        // H2 ## heading
        if (line.startsWith('## ')) {
            return `<h2 class="text-lg font-semibold text-white mt-5 mb-2 border-b border-neutral-600 pb-1">${line.slice(3)}</h2>`;
        }
        // H1 # heading
        if (line.startsWith('# ')) {
            return `<h1 class="text-xl font-bold text-white mt-5 mb-2">${line.slice(2)}</h1>`;
        }
        // Numbered list: "1. item"
        if (/^\d+\.\s/.test(line)) {
            const content = line.replace(/^\d+\.\s/, '');
            return `<li class="ml-4 list-decimal text-neutral-300 text-sm mb-1">${applyInline(content)}</li>`;
        }
        // Bullet list: "- item" or "* item"
        if (/^[-*]\s/.test(line)) {
            const content = line.slice(2);
            return `<li class="ml-4 list-disc text-neutral-300 text-sm mb-1">${applyInline(content)}</li>`;
        }
        // Empty line → spacer
        if (line.trim() === '') {
            return `<div class="h-2"></div>`;
        }
        // Normal paragraph
        return `<p class="text-neutral-300 text-sm mb-1">${applyInline(line)}</p>`;
    });

    return parsed.join('');
};

const applyInline = (text: string): string => {
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
        .replace(/\*(.+?)\*/g,     '<em class="text-neutral-200 italic">$1</em>')
        .replace(/`(.+?)`/g,       '<code class="bg-neutral-800 text-green-400 px-1 rounded text-xs font-mono">$1</code>');
};

const GameOverModal = ({ gameOverInfo, gameId, playerColor, playerId }: IGameOverModalProps) => {
    const { user } = useAppSelector((state) => state.auth);

    const [movesLoading, setMovesLoading] = useState<boolean>(false);
    const [movesError, setMovesError] = useState<string | null>(null);
    const [moves, setMoves] = useState<IGameMoves[]>([]);

    const [analysisLoading, setAnalysisLoading] = useState<boolean>(false);
    const [analysisError, setAnalysisError]     = useState<string | null>(null);
    const [analysisText, setAnalysisText]       = useState<string>('');         // raw accumulated text
    const [analysisDone, setAnalysisDone]       = useState<boolean>(false);
    const [analysisMetadata, setAnalysisMetadata] = useState<{
        tokensUsed: number;
        processingTime: number;
    } | null>(null);

    const analysisEndRef = useRef<HTMLDivElement>(null);

    const winnerLabel = gameOverInfo.color === 'white' ? 'White' : gameOverInfo.color === 'black' ? 'Black' : null;
    // const youWon = (gameOverInfo.color === 'white' && playerColor === 'w') ? true : (gameOverInfo.color === 'black' && playerColor === 'b') ? true : null;
    const youWon = gameOverInfo.winner !== null && ((gameOverInfo.color === 'white' && playerColor === 'w') || (gameOverInfo.color === 'black' && playerColor === 'b'));
    const analysisAvailable = ['checkmate', 'stalemate', 'threefold_repetition', 'insufficient_material', 'fifty_move_rule']

    // fetching the actual moves of the player after the game completes
    useEffect(() => {
        const handleFetchMoves = async () => {
            setMovesLoading(true);
            setMovesError(null);
    
            try {
                const response = await axios.post(
                    `${config.DEV_BASE_URL}`,
                    {
                        action: 'get-game-moves',
                        data: { gameId: gameId }
                    },
                    {
                        headers: { "Content-Type": "application/json" }
                    }
                );
    
                if (response.status === 200) {
                    console.log('response by fetching game moves: ', response.data);
                    setMoves(response.data.moves);
                }
            } catch (error) {
                console.error('error while fetching moves: ', error);
                setMovesError('could not fetch moves');
            } finally {
                setMovesLoading(false);
            }
        };

        handleFetchMoves();
    }, []);

    // providing game analysis when the game is either fully completed like checkmate or there is a draw.
    // not providing it if there is an event like resignation or abandonment
    const handleFetchAnalysis = async () => {
        if (!analysisAvailable || analysisLoading || analysisDone) return;

        setAnalysisLoading(true);
        setAnalysisError(null);
        setAnalysisText('');

        try {
            const response = await fetch(
                `${config.DEV_BASE_URL}`,
                {
                    method: 'POST',
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${user?.accessToken}`
                    },
                    body: JSON.stringify({
                        action: 'get-game-analysis',
                        data: { gameId }
                    })
                }
            );

            if (!response.ok || !response.body) throw new Error("Failed to connect to analysis service");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            // reading the stream chunk by chunk
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const raw   = decoder.decode(value, { stream: true });
                const lines = raw.split('\n');

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;

                    try {
                        const parsed = JSON.parse(line.slice(6)); // strip 'data: '

                        if (parsed.type === 'chunk') {
                            // Append raw text — parseMarkdown runs in render
                            setAnalysisText((prev) => prev + parsed.content);
                        }
                        else if (parsed.type === 'done') {
                            setAnalysisDone(true);
                            setAnalysisMetadata({
                                tokensUsed:     parsed.metadata.tokensUsed,
                                processingTime: parsed.metadata.processingTime,
                            });
                        }
                        else if (parsed.type === 'error') {
                            setAnalysisError(parsed.error ?? 'Analysis failed.');
                        }
                    } catch {}
                }
            }
        } catch (error: any) {
            console.error('error while fetching game analysis: ', error);
            setAnalysisError(error.message ?? 'Something went wrong');
        } finally {
            setAnalysisLoading(false);
        }
    };

    const subtitleText = () => {
        if (gameOverInfo.reason === 'resigned') {
            return youWon ? 'Your opponent resigned' : 'You resigned';
        }
        if (gameOverInfo.reason === 'checkmate') {
            return youWon ? 'Excellent checkmate!' : 'You got checkmated';
        }
        if (['stalemate', 'threefold-repetition', 'insufficient-material', '50-move-rule']
                .includes(gameOverInfo.reason)) {
            return 'Game drawn';
        }
        return '';
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
                    <p className="text-sm text-neutral-400 tracking-tight">
                        {subtitleText()}
                    </p>
                </div>

                {/* Move history */}
                <div className="w-full">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-2">
                        Moves
                    </p>
                    {movesLoading && (
                        <p className="text-xs text-neutral-500 animate-pulse">Loading moves...</p>
                    )}
                    {movesError && (
                        <p className="text-xs text-red-400">{movesError}</p>
                    )}
                    {!movesLoading && moves.length > 0 && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-h-32 overflow-y-auto text-xs font-mono">
                            {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                                const white = moves[i * 2];
                                const black = moves[i * 2 + 1];
                                return (
                                    <div key={i} className="contents">
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
                                    {analysisMetadata.tokensUsed} tokens · {(analysisMetadata.processingTime / 1000).toFixed(1)}s
                                </span>
                            )}
                        </div>

                        {/* Fetch button — only shown before analysis starts */}
                        {!analysisLoading && !analysisText && !analysisError && (
                            <button
                                type="button"
                                onClick={handleFetchAnalysis}
                                className="w-full text-sm px-4 py-2 bg-neutral-700 hover:bg-neutral-600 rounded-sm transition duration-300 tracking-tight"
                            >
                                ✦ Analyse this game
                            </button>
                        )}

                        {/* Streaming response — parsed markdown rendered live */}
                        {(analysisLoading || analysisText) && (
                            <div className="bg-neutral-900 rounded-md p-4 max-h-72 overflow-y-auto text-sm leading-relaxed">
                                <div
                                    dangerouslySetInnerHTML={{ __html: parseMarkdown(analysisText) }}
                                />
                                {/* Streaming cursor — disappears when done */}
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
                        onClick={() => window.location.href = `/home/${playerId}`}
                    >
                        Back to Dashboard
                    </button>
                </div>

            </div>
        </div>        
    );
}

export default GameOverModal