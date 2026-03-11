import { createContext, useContext } from "react"
import type { IWebSocketContextProps } from '@repo/types/src/index'

export const WebSocketContext = createContext<IWebSocketContextProps | null>(null);
export const useWebSocket = () => {
    const context = useContext(WebSocketContext);
    if (!context) throw new Error('useWebsocket must be used within WebSocket Provider');

    return context;
};