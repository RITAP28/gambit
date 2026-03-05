import { WebSocket } from "ws";
import { verifyAccessToken } from "@repo/auth/src/index"
import { onlineUsers } from "./server";
import { IncomingMessage } from "node:http";

export const sendMessage = (ws: WebSocket, type: string, data: {}) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...data }));
};

// broadcasts the current online user list to everyone
export const broadcastOnlineUsers = () => {
    const userIds = Array.from(onlineUsers.keys());
    const payload = JSON.stringify({ type: "ONLINE_USERS", userIds });

    const websockets = Array.from(onlineUsers.values());

    for (const ws of websockets) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload)
    };
};

export function handleConnection(ws: WebSocket, req: IncomingMessage){
    const token = new URL(req.url, "http://localhost").searchParams.get("token");
    if (!token) {
        ws.close();
        return;
    };

    try {
        const payload = verifyAccessToken(token);

        onlineUsers.set(payload.userId, ws);
        broadcastOnlineUsers();

        ws.on('message', (data) => {
            console.log('message on websocket');
        });

        ws.on('close', () => {
            onlineUsers.delete(payload.userId);

            // notifying everyone this user is now offline
            broadcastOnlineUsers();
        });
    } catch (error) {
        ws.close();
    };
};