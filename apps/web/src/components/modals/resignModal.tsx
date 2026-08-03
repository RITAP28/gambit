import { X } from 'lucide-react';
import React from 'react'

interface IResignModalProps {
    isResigning: boolean;
    onConfirm: () => void;
    setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * State and the resign action are passed in rather than pulled from useGame().
 * Calling that hook here created a second, independent game instance with its
 * own socket listeners, so the flag this modal set was never the one the board
 * was reading.
 */
const ResignModal = ({ isResigning, onConfirm, setModalOpen }: IResignModalProps) => {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-neutral-700 text-white dark:bg-zinc-900 rounded-lg shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-2">
            {/* Header */}
            <div className="w-full flex justify-between items-center">
                <p className="tracking-tight font-medium">Resign game?</p>
                <button
                    type="button"
                    className="hover:text-neutral-300 transition"
                    onClick={() => setModalOpen(false)}
                    disabled={isResigning}
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
            {/* Body */}
            <p className="text-sm text-neutral-400 tracking-tight">
                Your opponent will be declared the winner. This cannot be undone.
            </p>
            {/* Actions */}
            <div className="w-full flex flex-row gap-2 justify-end">
                <button
                    type="button"
                    className="tracking-tight text-sm px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 hover:cursor-pointer rounded-sm transition duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => setModalOpen(false)}
                    disabled={isResigning}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    className="tracking-tight text-sm px-3 py-1.5 bg-red-700 hover:bg-red-600 hover:cursor-pointer rounded-sm transition duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed min-w-20 flex items-center justify-center"
                    onClick={onConfirm}
                    disabled={isResigning}
                >
                    {isResigning ? <span className="animate-pulse">Resigning...</span> : 'Resign'}
                </button>
            </div>
        </div>
    </div>
  )
}

export default ResignModal
