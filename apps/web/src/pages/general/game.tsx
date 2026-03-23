import MoveHistory from '@/components/game/moveHistory';
import PlayerCard from '@/components/game/playerCard';
import { useGame } from '@/hooks/useGame';
import { useAppSelector } from '@/redux/hook';
import { useEffect, useRef } from 'react';
import { Chessboard } from 'react-chessboard'

const Game = () => {
  const { user } = useAppSelector((state) => state.auth);
  const { chessGameRef, chessPosition, setChessPosition, activeColor, moveHistory, status, playerMetadata, opponentMetadata, onDrop, canDragPiece, whiteTime, blackTime, chatMessages, chatInput, setChatInput, sendChatMessage } = useGame();

  const playerTime = playerMetadata?.color === 'w' ? whiteTime : blackTime;
  const opponentTime = opponentMetadata?.color === 'w' ? whiteTime : blackTime;
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // loading the initial piece positions after the first mount
  useEffect(() => {
    setChessPosition(chessGameRef.current.fen());
  }, []);

  return (
    <div className='game bg-neutral-900 text-white'>
      <header className="topbar w-full flex flex-row gap-2 items-center justify-center bg-neutral-900 border-b-[0.3px] border-neutral-600">
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
          <div className="sidebar__section border-[0.3px] border-neutral-700">
            <h3 className="sidebar__heading border-b-[0.3px] border-neutral-700">Move History</h3>
            <MoveHistory moves={moveHistory} />
          </div>
          <div className="sidebar__actions">
            <button
              className="btn--ghost w-full py-1 rounded-md hover:cursor-pointer border-[0.3px] border-neutral-700 transition duration-300 ease-in-out"
              disabled={status !== "in_progress"}
              title="Offer Draw"
            >
              ½ Draw
            </button>
            <button
              className="btn--danger w-full py-1 rounded-md hover:cursor-pointer border-[0.3px] border-neutral-700 transition duration-300 ease-in-out"
              disabled={status !== "in_progress"}
              title="Resign"
            >
              ⚑ Resign
            </button>
          </div>
          {/* chatting section */}
          <div className="sidebar__section sidebar__chat">
            <h3 className="sidebar__heading">Chat</h3>
            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <p className="chat__placeholder">GG and good luck!</p>
              )}
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`chat__message ${msg.senderId === user?.id ? 'chat__message--self' : 'chat__message--opponent'}`}
                >
                  <span className="chat__message-text">{msg.message}</span>
                </div>
              ))}
            </div>

            <div className="chat-input-row">
              <input
                className="chat-input"
                placeholder="Type a message…"
                maxLength={120}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendChatMessage();
                }}
              />
              <button
                className="btn btn--send"
                onClick={sendChatMessage}
                disabled={!chatInput.trim()}
              >
                ↑
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

export default Game