import MoveHistory from '@/components/game/moveHistory';
import PlayerCard from '@/components/game/playerCard';
import GameOverModal from '@/components/modals/gameOverModal';
import ResignModal from '@/components/modals/resignModal';
import { useGame } from '@/hooks/useGame';
import { useAppSelector } from '@/redux/hook';
import { useEffect, useRef } from 'react';
import { Chessboard } from 'react-chessboard'

const Game = () => {
  const { user } = useAppSelector((state) => state.auth);

  const {
    gameId,
    chessPosition,
    activeColor,
    playerColor,
    role,
    inCheck,
    moveHistory,
    status,
    isRated,
    gameType,
    playerMetadata,
    opponentMetadata,
    onDrop,
    canDragPiece,
    whiteTime,
    blackTime,
    chatMessages,
    chatInput,
    setChatInput,
    sendChatMessage,
    gameOverInfo,
    resignModal,
    setResignModal,
    resign,
    isResigning,
    offerDraw,
    respondToDraw,
    hasIncomingDrawOffer,
    drawOfferedBy,
    errorMessage
  } = useGame();

  // The server tells us which side we are playing; the profile payload is only
  // a fallback while that message is still in flight.
  const myColor = playerColor ?? playerMetadata?.color ?? 'w';
  const playerTime = myColor === 'w' ? whiteTime : blackTime;
  const opponentTime = myColor === 'w' ? blackTime : whiteTime;

  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const isLive = status === 'in_progress';
  const awaitingOurAnswer = hasIncomingDrawOffer && isLive;
  const weOfferedDraw = Boolean(drawOfferedBy && drawOfferedBy === user?.id);

  return (
    <div className='game bg-neutral-900 text-white'>
      <header className="topbar w-full flex flex-row gap-2 items-center justify-center bg-neutral-900 border-b-[0.3px] border-neutral-600">
        <div className="topbar__logo">Gambit</div>
        <div className="topbar__info">
          {isRated ? 'Rated' : 'Casual'}
          {gameType ? ` • ${gameType}` : ''}
          {role === 'spectator' ? ' • Spectating' : ''}
        </div>
      </header>

      {errorMessage && (
        <div className="w-full text-center text-sm text-amber-400 py-1" role="status">
          {errorMessage}
        </div>
      )}

      <main className="game-layout w-full flex flex-row p-2">
        {/* left board view */}
        <section className="board-column">
          {opponentMetadata && (
            <PlayerCard
              {...opponentMetadata}
              time={opponentTime}
              isActive={isLive && activeColor !== myColor}
            />
          )}
          <div className="board-wrap">
            <Chessboard
              options={{
                onPieceDrop: onDrop,
                showAnimations: true,
                position: chessPosition,
                animationDurationInMs: 300,
                boardOrientation: myColor === 'w' ? 'white' : 'black',
                canDragPiece: canDragPiece,
                darkSquareStyle: { 'backgroundColor': "#4a7c59" },
                lightSquareStyle: { 'backgroundColor': "#f0d9b5" },
                boardStyle: { 'borderRadius': '6px' },
                squareStyle: { 'borderRadius': '1px' }
              }}
            />
          </div>
          {playerMetadata && (
            <PlayerCard
              {...playerMetadata}
              time={playerTime}
              isActive={isLive && activeColor === myColor}
            />
          )}
          {inCheck && isLive && (
            <p className="text-center text-sm text-amber-400 pt-1">Check</p>
          )}
        </section>

        {/* right board view */}
        <aside className="sidebar">
          <div className="sidebar__section border-[0.3px] border-neutral-700">
            <h3 className="sidebar__heading border-b-[0.3px] border-neutral-700">Move History</h3>
            <MoveHistory moves={moveHistory} />
          </div>

          {awaitingOurAnswer ? (
            <div className="sidebar__actions flex flex-col gap-1">
              <p className="text-sm tracking-tight text-neutral-300">
                Your opponent offers a draw.
              </p>
              <div className="flex flex-row gap-2">
                <button
                  className="btn--ghost flex-1 py-1 rounded-md hover:cursor-pointer border-[0.3px] border-neutral-700"
                  onClick={() => respondToDraw(true)}
                >
                  Accept
                </button>
                <button
                  className="btn--ghost flex-1 py-1 rounded-md hover:cursor-pointer border-[0.3px] border-neutral-700"
                  onClick={() => respondToDraw(false)}
                >
                  Decline
                </button>
              </div>
            </div>
          ) : (
            <div className="sidebar__actions">
              <button
                className="btn--ghost w-full py-1 rounded-md hover:cursor-pointer border-[0.3px] border-neutral-700 transition duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isLive || role === 'spectator' || weOfferedDraw}
                title="Offer Draw"
                onClick={offerDraw}
              >
                {weOfferedDraw ? '½ Draw offered' : '½ Draw'}
              </button>

              <button
                className="btn--danger w-full py-1 rounded-md hover:cursor-pointer border-[0.3px] border-neutral-700 transition duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!isLive || role === 'spectator'}
                title="Resign"
                onClick={() => setResignModal(true)}
              >
                ⚑ Resign
              </button>
            </div>
          )}

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
              <div ref={chatBottomRef} />
            </div>
            <div className="chat-input-row">
              <input
                className="chat-input"
                placeholder={role === 'spectator' ? 'Spectators cannot chat' : 'Type a message…'}
                maxLength={120}
                value={chatInput}
                disabled={role === 'spectator'}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendChatMessage();
                }}
              />
              <button
                className="btn btn--send"
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || role === 'spectator'}
              >
                ↑
              </button>
            </div>
          </div>
        </aside>
      </main>

      {resignModal && (
        <ResignModal
          isResigning={isResigning}
          onConfirm={resign}
          setModalOpen={setResignModal}
        />
      )}
      {gameOverInfo.isGameOver && gameId && (
        <GameOverModal
          gameId={gameId}
          playerColor={myColor}
          playerId={user?.id ?? ''}
          gameOverInfo={gameOverInfo}
        />
      )}
    </div>
  )
}

export default Game
