import { X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface ISearchPlayerModalProps {
    ws: WebSocket | null;
    setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const SearchPlayerModal = ({ ws, setModalOpen }: ISearchPlayerModalProps) => {
  const navigate = useNavigate(); 
  
  const handleMessage = useCallback((event: MessageEvent) => {
    const message = JSON.parse(event.data);
    if (message.action === 'match-found') {
        console.log(`Match set for ${message.userId} vs ${message.opponentId}`);
        navigate(`/game/${message.gameId}`);
    }
  }, [navigate]);

  useEffect(() => {
    if (!ws) return;
    ws.addEventListener('message', handleMessage);

    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, handleMessage]);

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
            <div className="py-3 flex flex-col justify-center items-center">
                <p className="tracking-tight font-medium">searching for players...</p>
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