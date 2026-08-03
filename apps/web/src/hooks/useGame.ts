import config from "@/infra/activeconfig";
import { useAppSelector } from "@/redux/hook";
import type { IPlayerMetadataProps } from "@repo/types";
import axios from "axios";
import { Chess, type Move } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PieceDropHandlerArgs, PieceHandlerArgs } from "react-chessboard";
import { useParams } from "react-router-dom";
import { useWebSocket } from "./useWebSocket";

export interface ChatMessage {
    id: string;
    gameId: string;
    senderId: string;
    message: string;
    createdAt: string;
}

export interface RatingDelta {
    userId: string;
    before: number;
    after: number;
    change: number;
    provisional: boolean;
}

export interface GameOverInfo {
    isGameOver: boolean;
    reason: string;
    termination: string | null;
    result: "white_win" | "black_win" | "draw" | null;
    winner: string | null;
    color: "white" | "black" | null;
    resignedBy: string | null;
    pgn: string | null;
    ratings: { white: RatingDelta; black: RatingDelta } | null;
}

export type GameStatus =
    | "waiting"
    | "in_progress"
    | "completed"
    | "abandoned"
    | "aborted"
    | "resigned"
    | "draw"
    | "timeout";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * Union of every field the server sends in a `data` payload. Which ones are
 * present depends on the action, so all are optional and each case reads only
 * what it expects.
 */
interface SocketData {
    fen?: string;
    pgn?: string;
    uci?: string;
    yourColor?: "white" | "black" | null;
    role?: "player" | "spectator";
    whitePlayerId?: string;
    blackPlayerId?: string;
    timeControl?: string;
    isRated?: boolean;
    drawOfferedBy?: string | null;
    chatHistory?: ChatMessage[];
    clocks?: { white: number; black: number };
    by?: string | null;
    result?: GameOverInfo["result"];
    reason?: string;
    termination?: string | null;
    winner?: string | null;
    color?: "white" | "black" | null;
    resignedBy?: string | null;
    ratings?: GameOverInfo["ratings"];
    error?: string;
    id?: string;
    gameId?: string;
    senderId?: string;
    message?: string;
    createdAt?: string;
}

const EMPTY_GAME_OVER: GameOverInfo = {
    isGameOver: false,
    reason: "",
    termination: null,
    result: null,
    winner: null,
    color: null,
    resignedBy: null,
    pgn: null,
    ratings: null
};

export const useGame = () => {
    const { ws, sendMessage, isConnected } = useWebSocket();
    const user = useAppSelector((state) => state.auth.user);
    const accessToken = user?.accessToken;
    const { gameId } = useParams<{ gameId: string }>();

    // The board is a ref so message handlers always see the latest position
    // without being re-created on every move.
    const chessGameRef = useRef(new Chess());
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const activeColorRef = useRef<"w" | "b">("w");
    const statusRef = useRef<GameStatus>("in_progress");

    const [isFetched, setIsFetched] = useState(false);
    // Seeded with the standard opening position rather than reading the ref,
    // which must not be touched during render.
    const [chessPosition, setChessPosition] = useState<string>(STARTING_FEN);

    const [opponentId, setOpponentId] = useState<string>("");
    const [opponentMetadata, setOpponentMetadata] = useState<IPlayerMetadataProps | null>(null);
    const [playerMetadata, setPlayerMetadata] = useState<IPlayerMetadataProps | null>(null);

    const [gameType, setGameType] = useState<string | null>(null);
    const [isRated, setIsRated] = useState(false);
    const [moveHistory, setMoveHistory] = useState<Move[]>([]);
    const [status, setStatus] = useState<GameStatus>("in_progress");
    const [activeColor, setActiveColor] = useState<"w" | "b">("w");
    const [capturedPieces, setCapturedPieces] = useState<{ w: string[]; b: string[] }>({
        w: [],
        b: []
    });
    const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
    const [inCheck, setInCheck] = useState(false);
    const [whiteTime, setWhiteTime] = useState(0);
    const [blackTime, setBlackTime] = useState(0);

    /**
     * Which side this client is playing, as told by the server. This used to be
     * hardcoded to white, which flipped the board and disabled dragging for
     * whoever was playing black.
     */
    const [playerColor, setPlayerColor] = useState<"w" | "b" | null>(null);
    const [role, setRole] = useState<"player" | "spectator">("player");

    const [isResigning, setIsResigning] = useState(false);
    const [resignModal, setResignModal] = useState(false);
    const [drawOfferedBy, setDrawOfferedBy] = useState<string | null>(null);

    const [gameOverModal, setGameOverModal] = useState(false);
    const [gameOverInfo, setGameOverInfo] = useState<GameOverInfo>(EMPTY_GAME_OVER);

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const syncFromBoard = useCallback(() => {
        const board = chessGameRef.current;
        setChessPosition(board.fen());
        setMoveHistory(board.history({ verbose: true }));
        setActiveColor(board.turn());
        setInCheck(board.inCheck());
    }, []);

    const handleMessage = useCallback(
        (event: MessageEvent) => {
            let message: { action?: string; data?: SocketData };
            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }

            const data: SocketData = message.data ?? {};

            switch (message.action) {
                /**
                 * Full state for a game already in progress, sent in reply to
                 * `join-game`. This is what makes a refresh or a reconnect
                 * restore the board instead of showing an empty position.
                 */
                case "game-state": {
                    const board = chessGameRef.current;
                    board.reset();
                    try {
                        if (data.pgn) board.loadPgn(data.pgn);
                        else if (data.fen) board.load(data.fen);
                    } catch {
                        if (data.fen) board.load(data.fen);
                    }

                    setPlayerColor(
                        data.yourColor === "black" ? "b" : data.yourColor === "white" ? "w" : null
                    );
                    setRole(data.role ?? "player");
                    setOpponentId(
                        (data.whitePlayerId === user?.id
                            ? data.blackPlayerId
                            : data.whitePlayerId) ?? ""
                    );
                    setGameType(data.timeControl ?? null);
                    setIsRated(Boolean(data.isRated));
                    setDrawOfferedBy(data.drawOfferedBy ?? null);
                    setChatMessages(data.chatHistory ?? []);

                    setWhiteTime(Math.max(0, Math.floor((data.clocks?.white ?? 0) / 1000)));
                    setBlackTime(Math.max(0, Math.floor((data.clocks?.black ?? 0) / 1000)));

                    syncFromBoard();
                    setIsFetched(true);
                    break;
                }

                case "move-successful": {
                    // A broadcast without a position is unusable; ignoring it
                    // keeps the last good board rather than blanking it.
                    if (!data.fen) break;

                    chessGameRef.current.load(data.fen);

                    if (data.uci) {
                        setLastMove({ from: data.uci.slice(0, 2), to: data.uci.slice(2, 4) });
                    }
                    if (data.clocks) {
                        setWhiteTime(Math.max(0, Math.floor(data.clocks.white / 1000)));
                        setBlackTime(Math.max(0, Math.floor(data.clocks.black / 1000)));
                    }
                    syncFromBoard();
                    break;
                }

                case "chat-message":
                    setChatMessages((previous) => [...previous, data as unknown as ChatMessage]);
                    break;

                case "draw-offered":
                    setDrawOfferedBy(data.by ?? null);
                    break;

                case "draw-declined":
                    setDrawOfferedBy(null);
                    break;

                case "game-over": {
                    if (timerRef.current) clearInterval(timerRef.current);

                    setResignModal(false);
                    setIsResigning(false);
                    setDrawOfferedBy(null);
                    setStatus(data.result === "draw" ? "draw" : "completed");

                    setGameOverInfo({
                        isGameOver: true,
                        reason: data.reason ?? "",
                        termination: data.termination ?? null,
                        result: data.result ?? null,
                        winner: data.winner ?? null,
                        color: data.color ?? null,
                        resignedBy: data.resignedBy ?? null,
                        pgn: data.pgn ?? null,
                        ratings: data.ratings ?? null
                    });
                    setGameOverModal(true);
                    break;
                }

                /**
                 * The server rejected a move we had already applied
                 * optimistically, so roll the local board back.
                 */
                case "illegal-move":
                case "not-your-turn":
                case "move-error": {
                    chessGameRef.current.undo();
                    syncFromBoard();
                    setErrorMessage(
                        message.action === "not-your-turn"
                            ? "It is not your turn"
                            : "That move was rejected"
                    );
                    break;
                }

                case "chat-error":
                case "draw-error":
                case "resign-error":
                    setErrorMessage(data.error ?? "Something went wrong");
                    break;

                default:
                    break;
            }
        },
        [syncFromBoard, user?.id]
    );

    useEffect(() => {
        if (!ws) return;
        ws.addEventListener("message", handleMessage);
        return () => ws.removeEventListener("message", handleMessage);
    }, [ws, handleMessage]);

    // Ask for current state as soon as there is a live socket. This is what
    // makes refreshing mid-game recoverable.
    useEffect(() => {
        if (!isConnected || !gameId) return;
        sendMessage("join-game", { data: { gameId } });

        return () => sendMessage("leave-game", { data: { gameId } });
    }, [isConnected, gameId, sendMessage]);

    useEffect(() => {
        activeColorRef.current = activeColor;
    }, [activeColor]);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    // Clear a transient error after a moment so it does not stick around.
    useEffect(() => {
        if (!errorMessage) return;
        const timer = setTimeout(() => setErrorMessage(null), 3000);
        return () => clearTimeout(timer);
    }, [errorMessage]);

    const onDrop = useCallback(
        ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
            if (!targetSquare || role === "spectator") return false;

            try {
                const move = chessGameRef.current.move({
                    from: sourceSquare,
                    to: targetSquare,
                    promotion: "q"
                });
                if (!move) return false;

                // Show the move immediately; the server's broadcast is the
                // authority and corrects us if it disagrees.
                setLastMove({ from: sourceSquare, to: targetSquare });
                syncFromBoard();

                if (move.captured) {
                    const capturedFrom = move.color === "w" ? "b" : "w";
                    setCapturedPieces((previous) => ({
                        ...previous,
                        [capturedFrom]: [...previous[capturedFrom], move.captured as string]
                    }));
                }

                sendMessage("possible-move", {
                    data: {
                        gameId,
                        uci: `${move.from}${move.to}${move.promotion ?? ""}`
                    }
                });

                return true;
            } catch {
                return false;
            }
        },
        [gameId, role, sendMessage, syncFromBoard]
    );

    /** A player may only drag their own pieces, and only on their own turn. */
    const canDragPiece = useCallback(
        ({ piece }: PieceHandlerArgs) =>
            role === "player" &&
            playerColor !== null &&
            piece.pieceType[0] === playerColor &&
            activeColor === playerColor &&
            status === "in_progress",
        [activeColor, playerColor, role, status]
    );

    // Names and ratings are not part of the game socket payload, so they are
    // still fetched over HTTP.
    useEffect(() => {
        if (!opponentId || !user?.id || !accessToken) return;

        const controller = new AbortController();

        const fetchPlayersMetadata = async () => {
            try {
                const response = await axios.post(
                    `${config.DEV_BASE_URL}`,
                    {
                        action: "get-user-metadata",
                        data: { userId: user.id, opponentId, gameId }
                    },
                    {
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${accessToken}`
                        },
                        signal: controller.signal
                    }
                );

                if (response.status === 200) {
                    const metadata = response.data.metadata;
                    setOpponentMetadata(metadata.opponent);
                    setPlayerMetadata(metadata.player);
                }
            } catch (error) {
                if (!axios.isCancel(error)) {
                    console.error("error while fetching user metadata: ", error);
                }
            }
        };

        void fetchPlayersMetadata();
        return () => controller.abort();
    }, [user?.id, accessToken, opponentId, gameId]);

    /**
     * Local countdown, purely for display. The server owns the real clock and
     * corrects this on every move, so drift here can never decide a game.
     */
    useEffect(() => {
        if (!isFetched) return;

        timerRef.current = setInterval(() => {
            if (statusRef.current !== "in_progress") {
                if (timerRef.current) clearInterval(timerRef.current);
                return;
            }

            const setter = activeColorRef.current === "w" ? setWhiteTime : setBlackTime;
            setter((remaining) => Math.max(0, remaining - 1));
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isFetched]);

    const sendChatMessage = useCallback(() => {
        const trimmed = chatInput.trim();
        if (!trimmed || trimmed.length > 120) return;

        sendMessage("send-chat", { data: { gameId, message: trimmed } });
        setChatInput("");
    }, [chatInput, gameId, sendMessage]);

    const offerDraw = useCallback(() => {
        sendMessage("offer-draw", { data: { gameId } });
    }, [gameId, sendMessage]);

    const respondToDraw = useCallback(
        (accept: boolean) => {
            sendMessage("respond-draw", { data: { gameId, accept } });
        },
        [gameId, sendMessage]
    );

    const resign = useCallback(() => {
        setIsResigning(true);
        sendMessage("resign-request", { data: { gameId } });
    }, [gameId, sendMessage]);

    /** True when the opponent has an offer waiting on us. */
    const hasIncomingDrawOffer = useMemo(
        () => Boolean(drawOfferedBy && drawOfferedBy !== user?.id),
        [drawOfferedBy, user?.id]
    );

    return {
        gameId,
        chessGameRef,
        chessPosition,
        setChessPosition,
        playerColor,
        role,
        blackTime,
        whiteTime,
        capturedPieces,
        activeColor,
        inCheck,
        moveHistory,
        status,
        isRated,
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
        setResignModal,
        resign,
        offerDraw,
        respondToDraw,
        drawOfferedBy,
        hasIncomingDrawOffer,
        errorMessage
    };
};
