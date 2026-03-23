import config from "@/infra/activeconfig";
import { useAppSelector } from "@/redux/hook";
import type { IPlayerMetadataProps } from "@repo/types";
import axios from "axios";
import { Chess, Move } from "chess.js"
import { useCallback, useEffect, useRef, useState } from "react"
import type { PieceDropHandlerArgs, PieceHandlerArgs } from "react-chessboard";
import { useParams } from "react-router-dom";
import { useWebSocket } from "./useWebSocket";

interface ChatMessage {
    id: string;
    gameId: string;
    senderId: string;
    message: string;
    createdAt: string;
}

export const useGame = () => {
    const { ws, sendMessage } = useWebSocket();
    const user = useAppSelector((state) => state.auth.user);
    const accessToken = user && user.accessToken;
    const { gameId } = useParams<{ gameId: string }>();

    // defining the game as a ref to have access to the latest game information/state within closures and across renders
    const chessGameRef = useRef(new Chess());
    const timerRef = useRef<ReturnType<typeof setInterval>>(null);
    const activeColorRef = useRef<'w' | 'b'>('w');
    const statusRef = useRef<"waiting" | "in_progress" | "completed" | "abandoned" | "aborted" | "resigned" | "draw" | "timeout">("in_progress");
    const moveStartRef = useRef<number>(0);

    // states important for running the game
    const [isFetched, setIsFetched] = useState<boolean>(false);
    const [chessPosition, setChessPosition] = useState<string>('');

    // opponent id & metadata states
    const [opponentId, setOpponentId] = useState<string>('');
    const [opponentMetadata, setOpponentMetadata] = useState<IPlayerMetadataProps | null>(null);
    const [playerMetadata, setPlayerMetadata] = useState<IPlayerMetadataProps | null>(null);

    const [gameType, setGameType] = useState<"bullet" | "blitz" | "rapid" | "classical" | "daily" | null>(null)
    const [moveHistory, setMoveHistory] = useState<Move[]>([]);
    const [status, setStatus] = useState<"waiting" | "in_progress" | "completed" | "abandoned" | "aborted" | "resigned" | "draw" | "timeout">("in_progress");
    const [activeColor, setActiveColor] = useState<'w' | 'b'>('w');
    const [capturedPieces, setCapturedPieces] = useState({ w: [], b: [] });
    const [lastMove, setLastMove] = useState<{ from: string, to: string }[]>([]);
    const [whiteTime, setWhiteTime] = useState<number>(0);
    const [blackTime, setBlackTime] = useState<number>(0);
    const [playerColor] = useState<'w' | 'b'>('w');
    
    const [isResigning, setIsResigning] = useState<boolean>(false);
    const [resignModal, setResignModal] = useState<boolean>(false);

    // game over states
    const [gameOverModal, setGameOverModal] = useState<boolean>(false);
    const [gameOverInfo, setGameOverInfo] = useState<{
        isGameOver: boolean,
        reason: string,
        winner: string | null,
        color: 'white' | 'black' | null,
        resignedBy: string | null
    }>({
        isGameOver: false,
        reason: '',
        winner: null,
        color: null,
        resignedBy: null
    });

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState<string>('');

    const handleMessage = useCallback((event: MessageEvent) => {
        const message = JSON.parse(event.data);
        console.log('message received: ', message);

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
        } else if (message.action === 'chat-message') {
            setChatMessages((prev) => [ ...prev, message.data ]);
        } else if (message.action === 'game-over') {
            console.log('message data: ', message.data);
            const { reason, winner, color, resignedBy } = message.data;

            clearInterval(timerRef.current!);

            // if the resign modal was open, then close it first before showing the confirmation modal
            if (resignModal) setResignModal(false);

            if (reason === 'checkmate') setStatus('completed');
            if (reason === 'resigned') { setStatus('completed'); setIsResigning(false) };
            if (reason === 'stalemate' || reason === 'threefold-repetition' || reason === 'insufficient material' || reason === 'fifty-move rule') setStatus('draw');

            // game over state --> filled after the game ends
            setGameOverModal(true);
            setGameOverInfo({ isGameOver: true, reason, winner, color, resignedBy });
        }
    }, []);

    useEffect(() => {
        if (!ws) return;
        ws.addEventListener('message', handleMessage);

        return () => ws.removeEventListener('message', handleMessage);
    }, [ws, handleMessage]);

    useEffect(() => { activeColorRef.current = activeColor }, [activeColor]);
    useEffect(() => { statusRef.current = status }, [status]);

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
            // setMoveHistory(chessGameRef.current.history({ verbose: true }));
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

    // the player shall be able to move pieces of the same color and also when it is only his/her turn
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
                    const dta = response.data.metadata.game;
                    const chatHistory = response.data.metadata.chatHistory;
                    console.log('game metadata fetched: ', dta);

                    setWhiteTime(dta.whiteTimeLeft);
                    setBlackTime(dta.blackTimeLeft);
                    setGameType(dta.timeControl);
                    setChessPosition(dta.currentFen);
                    setStatus(dta.status);
                    setOpponentId(dta.blackPlayerId !== user.id ? dta.blackPlayerId : dta.whitePlayerId );
                    setIsFetched(true);
                    setChatMessages(chatHistory);
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
        if (!isFetched) return;

        timerRef.current = setInterval(() => {
            if (statusRef.current !== "in_progress") {
                clearInterval(timerRef.current!);
                return;
            };

            if (activeColorRef.current === 'w') {
                setWhiteTime((t) => {
                    if (t <= 1) {
                        clearInterval(timerRef.current!);
                        return 0;
                    };

                    return t-1;
                });
            } else if (activeColorRef.current === 'b') {
                setBlackTime((t) => {
                    if (t <= 1) {
                        clearInterval(timerRef.current!);
                        return 0;
                    };

                    return t-1;
                });
            };
        }, 1000);

        return () => clearInterval(timerRef.current!);
    }, [isFetched]); // this hook fires only when the data is ready

    const sendChatMessage = useCallback(() => {
        const trimmed = chatInput.trim();
        if (!trimmed || trimmed.length === 0) return;
        if (trimmed.length > 120) return;

        sendMessage('send-chat', {
            data: {
                gameId,
                senderId: user?.id,
                message: trimmed,
            }
        });

        setChatInput(''); // clear input immediately
    }, [chatInput, gameId, sendMessage, user?.id]);

    return {
        gameId,
        chessGameRef,
        chessPosition,
        setChessPosition,
        playerColor,
        blackTime,
        whiteTime,
        capturedPieces,
        activeColor,
        moveHistory,
        status,
        opponentMetadata,
        playerMetadata,
        onDrop,
        gameType,
        lastMove,
        canDragPiece,
        chatMessages,
        chatInput,
        setChatInput,
        sendChatMessage,
        gameOverModal,
        setGameOverModal,
        gameOverInfo,
        isResigning,
        setIsResigning,
        resignModal,
        setResignModal
    }
}