export type WebSocketType = {
    online_users: "ONLINE_USERS"
}

export interface IWebSocketContextProps {
    ws: WebSocket | null;
    isConnected: boolean;
    sendMessage: (action: string, data?: object) => void;
}