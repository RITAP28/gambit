import config from "@/infra/activeconfig";
import { useAppSelector } from "@/redux/hook";
import { newAccessToken } from "@/redux/slices/auth.slice";
import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";

export function useWebsocket() {
    const { user } = useAppSelector((state) => state.auth);
    const navigate = useNavigate();
    const wsRef = useRef<WebSocket | null>(null);
    const dispatch = useDispatch();

    const [socket, setSocket] = useState<WebSocket | null>(null);

    useEffect(() => {
        if (user && !wsRef.current) {
            const ws = new WebSocket(config.DEV_WS_URL || 'ws://localhost:8080');

            ws.onopen = () => {
                ws.send(JSON.stringify({
                    action: 'user-connected',
                    userId: user.id,
                    accessToken: user.accessToken
                }));
            };

            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                switch (msg.action) {
                    case 'connection-established':
                        console.log(`${msg.userId} connected to websockets`);

                        // setting a new access token if earlier one already expired
                        dispatch(newAccessToken({
                            accessToken: msg.accessToken
                        }));
                        break;
                    case 'match-found':
                        navigate(`/game/${msg.gameId}`);
                        break;
                    default:
                        break;
                }
            };

            ws.onerror = () => console.error('ws error');
            wsRef.current = ws;
        }

        // cleanup when user logs out
        return () => {
            wsRef.current?.close();
            wsRef.current = null;
            setSocket(null);
        };
    }, [user, navigate]);

    useEffect(() => {
        setSocket(wsRef.current);
    }, []);

    const send = (payload: unknown) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(payload));
        };
    };

    return { send, ws: socket }
}