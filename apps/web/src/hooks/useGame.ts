import config from "@/infra/activeconfig";
import { useAppSelector } from "@/redux/hook";
import type { IPlayerMetadataProps } from "@repo/types";
import axios from "axios";
import { Chess, Move } from "chess.js"
import { useCallback, useEffect, useRef, useState } from "react"
import type { PieceDropHandlerArgs, PieceHandlerArgs } from "react-chessboard";
import { useParams } from "react-router-dom";
import { useWebSocket } from "./useWebSocket";

export const useGame = () => {
    const { ws, sendMessage } = useWebSocket();
    const user = useAppSelector((state) => state.auth.user);
    const accessToken = user && user.accessToken;
    const { gameId } = useParams<{ gameId: string }>();

    // defining the game as a ref to have access to the latest game information/state within closures and across renders
    const chessGameRef = useRef(new Chess());
    const timerRef = useRef<ReturnType<typeof setInterval>>(0);
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
        console.log('message received: ', message);

        // if the move is successful
        if (message.action === 'move-successful') {
            console.log('message received for successful move: ', message);
            const moveDta = message.data;

            // syncing chess engine & UI updates
            chessGameRef.current.load(moveDta.fen);
            setChessPosition(moveDta.fen);

            const source = moveDta.uci.slice(0, 2);
            const target = moveDta.uci.slice(2, 4);
            setLastMove((prev) => [ ...prev, { from: source, to: target } ]);

            // updating move history & active player
            setMoveHistory(chessGameRef.current.history({ verbose: true }));
            setActiveColor(chessGameRef.current.turn());

            // syncing clocks between the server and the client
            // server sends the time in the format of milliseconds, so converting them to seconds
            console.log('white time left: ', Math.floor(moveDta.clocks.white / 1000));
            console.log('black time left: ', Math.floor(moveDta.clocks.black / 1000));

            setWhiteTime(Math.floor(moveDta.clocks.white / 1000));
            setBlackTime(Math.floor(moveDta.clocks.black / 1000));
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

    const onDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
        if (!targetSquare) return false;
        try {
            const now = Date.now();
            // const timeTakenSec = Math.round((now - moveStartRef.current) / 1000);
            moveStartRef.current = now;

            const move = chessGameRef.current.move({
                from: sourceSquare,
                to: targetSquare as string,
                promotion: 'q'
            });
            if (!move) return false;

            const uci = `${move.from}${move.to}${move.promotion || ''}`;

            // optimistic UI updates
            setChessPosition(chessGameRef.current.fen());
            setLastMove((prev) => [ ...prev, { from: sourceSquare, to: targetSquare as string } ]);
            setMoveHistory(chessGameRef.current.history({ verbose: true }));
            setActiveColor(chessGameRef.current.turn());

            // tracking captured pieces
            if (move.captured) {
                setCapturedPieces((prev) => ({
                    ...prev,
                    [move.color === 'w' ? 'b' : 'w']: [
                        ...prev[move.color === 'w' ? 'b' : 'w'],
                        move.captured
                    ]
                }))
            };

            // let clockAfter = 0;
            // if (activeColor === 'w') {
            //     clockAfter = Math.max(0, whiteTime - timeTakenSec);
            //     setWhiteTime(clockAfter);
            // } else {
            //     clockAfter = Math.max(0, blackTime - timeTakenSec);
            //     setBlackTime(clockAfter);
            // }

            // if (chessGameRef.current.isCheckmate()) setStatus('checkmate');
            // else if (chessGameRef.current.isCheck()) setStatus('check');
            // else if (chessGameRef.current.isDraw()) setStatus('draw');
            // else setStatus('playing');

            // sending websocket related events to backend
            // sendMessage('possible-move-made', {
            //     userId: user?.id,
            //     opponentId: opponentId,
            //     data: {
            //         gameId: gameId,
            //         moveNumber: Math.ceil(chessGameRef.current.history().length / 2),
            //         color: activeColor === 'w' ? 'white' : 'black',
            //         san: move.san,
            //         uci: `${move.from}${move.to}${move.promotion ?? ""}`,
            //         fenAfter: chessGameRef.current.fen(),
            //         timeTaken: timeTakenSec,
            //         clockAfter: clockAfter,
            //     }
            // });

            // sending the move info to the server
            sendMessage('possible-move', {
                data: {
                    gameId: gameId,
                    playerId: user?.id,
                    uci: uci,
                    color: activeColor
                }
            });

            return true;
        } catch (error) {
            console.error('error while dropping a piece: ', error);
            return false;
        }
    }

    const canDragPiece = ({ piece }: PieceHandlerArgs) => piece.pieceType[0] === playerMetadata?.color;

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
                        time: dta.opponent.color === 'w' ? whiteTime : blackTime
                    });
                    setPlayerMetadata({
                        ...dta.player,
                        time: dta.player.color === 'w' ? whiteTime : blackTime
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
                console.log(whiteTime);
                setWhiteTime((t) => Math.max(0, t-1));
            }
            else if (activeColor === 'b') {
                console.log(blackTime);
                setBlackTime((t) => Math.max(0, t-1));
            }
        }, 1000);

        return () => clearInterval(timerRef.current)
    }, [activeColor, status]);

    return { chessGameRef, chessPosition, setChessPosition, playerColor, blackTime, whiteTime, capturedPieces, activeColor, moveHistory, status, opponentMetadata, playerMetadata, onDrop, gameType, lastMove, canDragPiece }
}