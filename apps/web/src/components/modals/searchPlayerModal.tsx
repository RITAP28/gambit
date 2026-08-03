// Imported from source rather than the package root: @repo/types builds to
// CommonJS, and Rollup cannot see named runtime values through its
// `__exportStar` re-exports. Type-only imports are unaffected.
import { TIME_CONTROLS } from '@repo/types/src/timeControls';
import { X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '@/hooks/useWebSocket';

interface MatchmakingData {
    gameId?: string;
    poolSize?: number;
    error?: string;
}

interface ISearchPlayerModalProps {
    ws: WebSocket | null;
    timeControl: string;
    setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const SearchPlayerModal = ({ ws, timeControl, setModalOpen }: ISearchPlayerModalProps) => {
  const navigate = useNavigate();
  const { sendMessage } = useWebSocket();
  const [status, setStatus] = useState<string>('Joining the queue…');
  const [waitedSecs, setWaitedSecs] = useState(0);

  const handleMessage = useCallback((event: MessageEvent) => {
    let message: { action?: string; data?: MatchmakingData };
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    const data: MatchmakingData = message.data ?? {};

    // Payloads are now consistently { action, data }, so the game id lives one
    // level deeper than it used to.
    if (message.action === 'match-found' && data.gameId) {
      navigate(`/game/${data.gameId}`);
      return;
    }

    if (message.action === 'matchmaking-queued') {
      setStatus(
        (data.poolSize ?? 0) > 1
          ? 'Looking for an opponent near your rating…'
          : 'Waiting for another player to join…'
      );
      return;
    }

    if (message.action === 'matchmaking-error') {
      setStatus(
        data.error === 'already-queued'
          ? 'You are already searching for a game.'
          : 'Could not join the queue. Please try again.'
      );
    }
  }, [navigate]);

  useEffect(() => {
    if (!ws) return;
    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, handleMessage]);

  // Join on open, and always leave on close so an abandoned search does not
  // leave the player sitting in the server's queue.
  useEffect(() => {
    sendMessage('join-match-making', { data: { timeControl, isRated: true } });
    return () => sendMessage('leave-match-making', {});
  }, [sendMessage, timeControl]);

  useEffect(() => {
    const timer = setInterval(() => setWaitedSecs((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const label = TIME_CONTROLS[timeControl]?.label ?? timeControl;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-neutral-700 text-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-2">
            <div className="w-full flex justify-end items-center">
                <button
                    type="button"
                    className="hover:underline"
                    onClick={() => setModalOpen(false)}
                >
                    <X className='w-4 h-4' />
                </button>
            </div>
            <div className="py-3 flex flex-col justify-center items-center gap-1">
                <p className="tracking-tight font-medium">{status}</p>
                <p className="text-sm text-neutral-400 tracking-tight">
                    {label} · {waitedSecs}s
                </p>
                {waitedSecs > 15 && (
                    <p className="text-xs text-neutral-500 tracking-tight text-center px-2">
                        Still searching — the rating range widens the longer you wait.
                    </p>
                )}
            </div>
            <div className="py-1 w-full flex justify-center items-center">
                <button
                    type="button"
                    className="tracking-tight text-sm px-2 py-1 bg-neutral-900 hover:bg-neutral-800 hover:cursor-pointer rounded-sm transition duration-300 ease-in-out"
                    onClick={() => setModalOpen(false)}
                >
                    Cancel
                </button>
            </div>
        </div>
    </div>
  )
}

export default SearchPlayerModal
