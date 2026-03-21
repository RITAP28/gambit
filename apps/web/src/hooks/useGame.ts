import config from "@/infra/activeconfig";
import { useAppSelector } from "@/redux/hook";
import type { IPlayerMetadataProps } from "@repo/types";
import axios from "axios";
import { Chess, Move } from "chess.js"
import { useCallback, useEffect, useRef, useState } from "react"
import type { PieceDropHandlerArgs, PieceHandlerArgs } from "react-chessboard";
import { useParams } from "react-router-dom";
import { useWebSocket } from "./useWebSocket";

interface IMoveProps {
    id: string;
    createdAt: Date;
    gameId: string;
    color: "white" | "black";
    moveNumber: number;
    san: string;
    uci: string;
    fenAfter: string;
    timeTaken: number;
    clockAfter: number;
}

export const useGame = () => {
    const { ws, sendMessage } = useWebSocket();
    const user = useAppSelector((state) => state.auth.user);
    const accessToken = user && user.accessToken;
    const { gameId } = useParams<{ gameId: string }>();

    // defining the game as a ref to have access to the latest game information/state within closures and across renders
    const chessGameRef = useRef(new Chess());
    const timerRef = useRef<number>(0);
    const moveStartRef = useRef<number>(0);

    // states important for running the game
    const [chessPosition, setChessPosition] = useState<string>('');

    // opponent id & metadata states
    const [opponentId, setOpponentId] = useState<string>('');
    const [opponentMetadata, setOpponentMetadata] = useState<IPlayerMetadataProps | null>(null);
    const [playerMetadata, setPlayerMetadata] = useState<IPlayerMetadataProps | null>(null);

    const [gameType, setGameType] = useState<"bullet" | "blitz" | "rapid" | "classical" | "daily" | null>(null)
    const [moveHistory, setMoveHistory] = useState<Move[]>([]);
    const [status, setStatus] = useState<'playing' | 'check' | 'checkmate' | 'draw' | 'resigned'>('playing');
    const [activeColor, setActiveColor] = useState<'w' | 'b'>('w');
    const [capturedPieces, setCapturedPieces] = useState({ w: [], b: [] });
    const [lastMove, setLastMove] = useState<{ from: string, to: string }[]>([]);
    const [whiteTime, setWhiteTime] = useState<number>(0);
    const [blackTime, setBlackTime] = useState<number>(0);
    const [playerColor] = useState<'w' | 'b'>('w');

    const handleMessage = useCallback((event: MessageEvent) => {
        const message = JSON.parse(event.data);
        if (message.action === 'move-successful') {
            const move = message.move as IMoveProps;

            // syncing chess engine
            chessGameRef.current.load(move.fenAfter);

            // UI update
            setChessPosition(move.fenAfter);

            // move.uci: {move.from}{move.to}{move.promotion}
            const source = move.uci.slice(0, 2);
            const target = move.uci.slice(2, 4);

            setLastMove((prev) => [
                ...prev,
                { from: source, to: target }
            ]);

            // updating move history
            const hist = chessGameRef.current.history({ verbose: true });
            setMoveHistory(hist);

            // update active player
            setActiveColor(chessGameRef.current.turn());
        }
    }, []);

    useEffect(() => {
        if (!ws) return;
        ws.addEventListener('message', handleMessage);

        return () => ws.removeEventListener('message', handleMessage);
    }, [ws, handleMessage]);

    useEffect(() => {
        moveStartRef.current = Date.now();
    }, [activeColor]);

    // const onDrop = ({ sourceSquare, targetSquare, piece }: PieceDropHandlerArgs) => {
    //     if (!targetSquare) return false;
    //     try {
    //         const now = Date.now();
    //         const timeTakenSec = Math.round((now - moveStartRef.current) / 1000);
    //         moveStartRef.current = now;

    //         // const move = chessGameRef.current.move({
    //         //     from: sourceSquare,
    //         //     to: targetSquare as string,
    //         //     promotion: 'q'
    //         // });
    //         // if (!move) return false;
    //         sendMessage('make-move', {
    //             gameId: gameId,
    //             uci: `${sourceSquare}${targetSquare}${}`,
    //         })

    //         // optimistic UI updates
    //         setChessPosition(chessGameRef.current.fen());
    //         setLastMove((prev) => [
    //             ...prev,
    //             { from: sourceSquare, to: targetSquare as string }
    //         ]);

    //         // updating move history
    //         const hist = chessGameRef.current.history({ verbose: true });
    //         setMoveHistory(hist);

    //         // tracking captured pieces
    //         if (move.captured) {
    //             setCapturedPieces((prev) => ({
    //                 ...prev,
    //                 [move.color === 'w' ? 'b' : 'w']: [
    //                     ...prev[move.color === 'w' ? 'b' : 'w'],
    //                     move.captured
    //                 ]
    //             }))
    //         };

    //         let clockAfter = 0;
    //         if (activeColor === 'w') {
    //             clockAfter = Math.max(0, whiteTime - timeTakenSec);
    //             setWhiteTime(clockAfter);
    //         } else {
    //             clockAfter = Math.max(0, blackTime - timeTakenSec);
    //             setBlackTime(clockAfter);
    //         }

    //         // updating game states
    //         if (chessGameRef.current.isCheckmate()) setStatus('checkmate');
    //         else if (chessGameRef.current.isCheck()) setStatus('check');
    //         else if (chessGameRef.current.isDraw()) setStatus('draw');
    //         else setStatus('playing');

    //         // sending websocket related events to backend
    //         sendMessage('possible-move-made', {
    //             userId: user?.id,
    //             opponentId: opponentId,
    //             data: {
    //                 gameId: gameId,
    //                 moveNumber: Math.ceil(chessGameRef.current.history().length / 2),
    //                 color: activeColor === 'w' ? 'white' : 'black',
    //                 san: move.san,
    //                 uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    //                 fenAfter: chessGameRef.current.fen(),
    //                 timeTaken: timeTakenSec,
    //                 clockAfter: clockAfter,
    //             }
    //         });

    //         setActiveColor(chessGameRef.current.turn());
    //         return true
    //     } catch (error) {
    //         console.error('error while dropping a piece: ', error);
    //         return false;
    //     }
    // }

    const onDrop = () => {
        // sendMessage('possible-move-made', { gameId, uci })
    }

    const canDragPiece = ({ piece }: PieceHandlerArgs) => piece.pieceType[0] === playerColor && activeColor === playerColor

    useEffect(() => {
        const fetchGameMetadata = async () => {
            // early return if user/accessToken is null
            if (!user && !accessToken) return;

            try {
                const response = await axios.post(
                    `${config.DEV_BASE_URL}`,
                    {
                        action: "get-game-metadata",
                        data: { gameId: gameId }
                    },
                    {
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${accessToken}`
                        }
                    }
                );

                if (response.status === 200) {
                    const dta = response.data.metadata;
                    console.log('game metadata fetched: ', dta);

                    setWhiteTime(dta.whiteTimeLeft);
                    setBlackTime(dta.blackTimeLeft);
                    setGameType(dta.timeControl);
                    setStatus(dta.status);
                    setOpponentId(dta.blackPlayerId !== user.id ? dta.blackPlayerId : dta.whitePlayerId );
                }
            } catch (error) {
                console.error('error while fetching game metadata: ', error);
            }
        }

        fetchGameMetadata();
    }, [gameId, accessToken, user]);

    useEffect(() => {
        const fetchPlayersMetadata = async () => {
            // early return from the function if the opponent ID is null or absent
            if (!opponentId || opponentId.length === 0) return;
            try {
                const response = await axios.post(
                    `${config.DEV_BASE_URL}`,
                    {
                        action: "get-user-metadata",
                        data: { userId: user?.id, opponentId: opponentId, gameId: gameId }
                    },
                    {
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${accessToken}`
                        }
                    }
                );

                if (response.status === 200) {
                    console.log("player's & opponent's metadata fetched successfully: ", response.data.metadata);
                    const dta = response.data.metadata;
                    setOpponentMetadata({
                        ...dta.opponent,
                        time: opponentMetadata?.color === 'w' ? whiteTime : blackTime
                    });
                    setPlayerMetadata({
                        ...dta.player,
                        time: playerMetadata?.color === 'w' ? whiteTime : blackTime
                    });
                };
            } catch (error) {
                console.error('error while fetching user metadata: ', error);
            }
        };


        fetchPlayersMetadata();
    }, [user?.id, accessToken, opponentId, gameId])

    useEffect(() => {
        timerRef.current = setInterval(() => {
            if (status !== 'playing') clearInterval(timerRef.current);
            if (activeColor === 'w') {
                console.log('wt - 1');
                setWhiteTime((t) => Math.max(0, t-1));
            }
            else if (activeColor === 'b') {
                console.log('bt - 1');
                setBlackTime((t) => Math.max(0, t-1));
            }
        }, 1000);

        return () => clearInterval(timerRef.current)
    }, [activeColor, status]);

    return { chessGameRef, chessPosition, setChessPosition, playerColor, blackTime, whiteTime, capturedPieces, activeColor, moveHistory, status, opponentMetadata, playerMetadata, onDrop, gameType, lastMove, canDragPiece }
}