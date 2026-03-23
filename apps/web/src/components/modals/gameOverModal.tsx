interface IGameOverModalProps {
    gameOverInfo: {
        isGameOver: boolean;
        reason: string;
        winner: string | null;
        color: 'white' | 'black' | null;
        resignedBy: string | null;
    };
    playerColor: 'w' | 'b';
    playerId: string;
}

const GameOverModal = ({ gameOverInfo, playerColor, playerId }: IGameOverModalProps) => {
    const winnerLabel = gameOverInfo.color === 'white' ? 'White' : gameOverInfo.color === 'black' ? 'Black' : null;
    const youWon = (gameOverInfo.color === 'white' && playerColor === 'w') ? true : (gameOverInfo.color === 'black' && playerColor === 'b') ? true : null;

    return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <div className="bg-neutral-700 text-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-sm p-6 flex flex-col items-center gap-5">
                    
                    {/* Result icon */}
                    <div className="text-5xl">
                        {youWon !== null && (youWon ? '🏆' : '🏳')}
                    </div>

                    {/* Result text */}
                    <div className="flex flex-col items-center gap-1 text-center">
                        <p className="text-xl font-semibold tracking-tight">
                            {youWon === null ? <p>Match Drawn</p> : `${winnerLabel} wins`}
                        </p>
                        <p className="text-sm text-neutral-400 tracking-tight">
                            {gameOverInfo.reason === 'resigned'
                                ? (gameOverInfo.winner === playerId ? 'Your opponent resigned' : 'You resigned')
                                : gameOverInfo.reason === 'checkmate' ? (gameOverInfo.winner === playerId ? 'Excellent checkmate!' : 'You got checkmate :(')
                                : gameOverInfo.reason === "stalemate" || gameOverInfo.reason === "threefold-repetition" || gameOverInfo.reason === "insufficient material" || gameOverInfo.reason === "fifty-move rule" && 'Game Drawn'}
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="w-full flex flex-col gap-2">
                        {/* Rematch — TODO: wire up rematch WS event */}
                        {/* <button
                            type="button"
                            className="w-full tracking-tight text-sm px-4 py-2 bg-white text-black font-medium rounded-sm hover:bg-neutral-200 hover:cursor-pointer transition duration-300 ease-in-out"
                            onClick={() => {
                                // TODO: sendMessage('rematch-request', { gameId })
                            }}
                        >
                            Rematch
                        </button> */}

                        {/* Dashboard */}
                        <button
                            type="button"
                            className="w-full tracking-tight text-sm px-4 py-2 bg-neutral-900 hover:bg-neutral-800 hover:cursor-pointer rounded-sm transition duration-300 ease-in-out"
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