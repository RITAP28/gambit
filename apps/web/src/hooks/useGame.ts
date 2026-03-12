import config from "@/infra/activeconfig";
import { useAppSelector } from "@/redux/hook";
import type { IPlayerMetadataProps } from "@repo/types";
import axios from "axios";
import { Chess } from "chess.js"
import { useEffect, useRef, useState } from "react"
import { useParams } from "react-router-dom";

export const useGame = () => {
    const user = useAppSelector((state) => state.auth.user);
    const accessToken = user && user.accessToken;
    const { gameId } = useParams<{ gameId: string }>();

    // defining the game as a ref to have access to the latest game information/state within closures and across renders
    const chessGameRef = useRef(new Chess());
    const timerRef = useRef<number>(0);

    // states important for running the game
    const [chessPosition, setChessPosition] = useState<string>('');

    // opponent id & metadata states
    const [opponentId, setOpponentId] = useState<string>('');
    const [opponentMetadata, setOpponentMetadata] = useState<IPlayerMetadataProps | null>(null);
    const [playerMetadata, setPlayerMetadata] = useState<IPlayerMetadataProps | null>(null);

    const [gameType, setGameType] = useState<"bullet" | "blitz" | "rapid" | "classical" | "daily" | null>(null)
    const [moveHistory, setMoveHistory] = useState<string[]>([]);
    const [status, setStatus] = useState<'playing' | 'check' | 'checkmate' | 'draw' | 'resigned'>('playing');
    const [activeColor, setActiveColor] = useState<'w' | 'b'>('w');
    const [capturedPieces, setCapturedPieces] = useState({ w: [], b: [] });
    const [lastMove, setLastMove] = useState<string | null>(null);
    const [whiteTime, setWhiteTime] = useState<number>(0);
    const [blackTime, setBlackTime] = useState<number>(0);
    const [playerColor] = useState<'w' | 'b'>('w');

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
                    const dta = response.data.metadata;
                    setOpponentMetadata(dta.opponent);
                    setPlayerMetadata(dta.player);
                }
            } catch (error) {
                console.error('error while fetching user metadata: ', error);
            }
        };


        fetchPlayersMetadata();
    }, [user?.id, accessToken, opponentId, gameId])

    useEffect(() => {
        timerRef.current = setInterval(() => {
            if (status !== 'playing') clearInterval(timerRef.current);
            if (activeColor === 'w') setWhiteTime((t) => Math.max(0, t-1));
            else if (activeColor === 'b') setBlackTime((t) => Math.max(0, t-1));
        }, 1000);
    }, [activeColor, status]);

    return { chessGameRef, chessPosition, setChessPosition, playerColor, blackTime, whiteTime, capturedPieces, activeColor, moveHistory, status, opponentMetadata, playerMetadata }
}