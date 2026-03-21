import MoveHistory from '@/components/game/moveHistory';
import PlayerCard from '@/components/game/playerCard';
import { useGame } from '@/hooks/useGame';
import { useEffect } from 'react';
import { Chessboard } from 'react-chessboard'

const Game = () => {
  const { chessGameRef, chessPosition, setChessPosition, activeColor, moveHistory, status, playerMetadata, opponentMetadata, onDrop, canDragPiece, whiteTime, blackTime } = useGame();

  const playerTime = playerMetadata?.color === 'w' ? whiteTime : blackTime;
  const opponentTime = opponentMetadata?.color === 'w' ? whiteTime : blackTime;

  // loading the initial piece positions after the first mount
  useEffect(() => {
    setChessPosition(chessGameRef.current.fen());
  }, []);

  return (
    <div className='game'>
      <header className="topbar w-full flex flex-row gap-2 items-center justify-center bg-white">
        <div className="topbar__logo">Gambit</div>
        <div className="topbar__info">Rated • Classical 10+0</div>
        <button type="button" className="topbar__abort">Abort</button>
      </header>

      <main className="game-layout w-full flex flex-row p-2">
        {/* left board view */}
        <section className="board-column">
          {opponentMetadata && <PlayerCard {...opponentMetadata} time={opponentTime} isActive={activeColor === opponentMetadata?.color} />}
          <div className="board-wrap">
            <Chessboard
              options={{
                onPieceDrop: onDrop,
                showAnimations: true,
                position: chessPosition,
                animationDurationInMs: 800,
                boardOrientation: playerMetadata?.color === 'w' ? "white" : "black",
                canDragPiece: canDragPiece,
                darkSquareStyle: { 'backgroundColor': "#4a7c59" },
                lightSquareStyle: { 'backgroundColor': "#f0d9b5" },
                boardStyle: { 'borderRadius': '6px' },
                squareStyle: { 'borderRadius': '1px' }
              }}
            />
          </div>
          {playerMetadata && <PlayerCard {...playerMetadata} time={playerTime} isActive={activeColor === playerMetadata?.color} />}
        </section>

        {/* right board view */}
        <aside className="sidebar">
          {/* move history */}
          <div className="sidebar__section">
            <h3 className="sidebar__heading">Move History</h3>
            <MoveHistory moves={moveHistory} />
          </div>
          <div className="sidebar__actions">
            <button
              className="btn btn--ghost"
              disabled={status !== "playing"}
              title="Offer Draw"
            >
              ½ Draw
            </button>
            <button
              className="btn btn--danger"
              disabled={status !== "playing"}
              title="Resign"
            >
              ⚑ Resign
            </button>
          </div>
          {/* chatting section */}
          <div className="sidebar__section sidebar__chat">
            <h3 className="sidebar__heading">Chat</h3>
            <div className="chat-messages">
              <p className="chat__placeholder">GG and good luck!</p>
            </div>
            <div className="chat-input-row">
              <input className="chat-input" placeholder="Type a message…" maxLength={120} />
              <button className="btn btn--send">↑</button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default Game