import config from "@/infra/activeconfig";
import { useAppSelector } from "@/redux/hook";
import { newAccessToken } from "@/redux/slices/auth.slice";
import axios from "axios";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import type { IWebSocketContextProps } from '@repo/types/src/index'
import { WebSocketContext } from "@/hooks/useWebSocket";

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
    const dispatch = useDispatch();
    const { user } = useAppSelector((state) => state.auth);

    const [ws, setWs] = useState<WebSocket | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState<boolean>(false);

    const reconnectAttemptRef = useRef<number>(0);
    const maxReconnectAttempts = 5;
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const sendMessage = useCallback((action: string, data: object = {}) => {
        const socket = wsRef.current;

        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action, ...data }))
        } else {
            console.log('Websocket is not connected');
        }
    }, []);

    const connectWebsocket = () => {
        if (!token || !user?.id) {
            console.log('Cannot connect: missing token or user');
            return;
        };

        // not trying to open an another new websocket connection if one already exists
        if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
            console.log('WebSocket already connected or connecting');
            return;
        };

        console.log('Establishing websocket connection...');

        const socket = new WebSocket(config.DEV_WS_URL || `ws://localhost:8080`);
        wsRef.current = socket;

        socket.onopen = () => {
            console.log('websocket connected successfully');
            setIsConnected(true);
            reconnectAttemptRef.current = 0;

            // authenticate
            // socket.send(JSON.stringify({
            //     type:
            // }))
            sendMessage('user-connected', { userId: user.id, accessToken: token });
        };

        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                console.log('received message from the server: ', message);
            } catch (error) {
                console.error('error while parsing message: ', error);
            };
        };

        socket.onclose = (event) => {
            console.log('websocket connection closed: ', event.code, event.reason);
            setIsConnected(false);
            setWs(null);
            wsRef.current = null;

            if (event.code !== 1000 && reconnectAttemptRef.current < maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
                console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptRef.current + 1})`);

                if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);

                reconnectTimeoutRef.current = setTimeout(() => {
                    reconnectAttemptRef.current += 1;
                    connectWebsocket();
                }, delay);
            } else if (reconnectAttemptRef.current >= maxReconnectAttempts) console.error('Max connections attempts reached');
        };

        socket.onerror = (error) => {
            console.error("WebSocket error: ", error);
        }

        setWs(socket);
    };

    useEffect(() => {
        const getToken = async (userId: string) => {
            try {
                const tokenResponse = await axios.post(
                    `${config.DEV_BASE_URL}`,
                    {
                        action: 'get-token',
                        data: {
                            userId: userId
                        }
                    },
                    {
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${user?.accessToken}`
                        }
                    }
                );

                if (tokenResponse.data.success) {
                    console.log('tokens approved while checking websocket connection');
                    const accessToken = tokenResponse.data.accessToken;
                    setToken(accessToken);

                    if (accessToken !== user?.accessToken) {
                        dispatch(newAccessToken({ accessToken: accessToken }));
                    }
                } else {
                    console.log('something went wrong, checking in the backend');
                }
            } catch (error) {
                console.error('error while getting the access token: ', error);
            }
        }

        if (user?.id) {
            getToken(user.id);
        }
    }, [user?.id]);

    useEffect(() => {
        if (token && user?.id) connectWebsocket();

        return () => {
            console.log('cleaning up websocket connection');
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            };

            // closing websocket connection
            const socket = wsRef.current;
            if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) socket.close(1000, 'component unmounting');

            wsRef.current = null;
            setWs(null);
            setIsConnected(false);
        }
    }, [token, user?.id]);

    const contextValue: IWebSocketContextProps = {
        ws,
        isConnected,
        sendMessage
    };

    return (
        <WebSocketContext.Provider value={contextValue}>
            {children}
        </WebSocketContext.Provider>
    )
};