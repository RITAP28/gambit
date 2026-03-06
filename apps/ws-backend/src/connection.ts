import { WebSocket } from "ws";
import { onlineUsers } from "./server";
import { IncomingMessage } from "node:http";
import { handleMatchPlayer, handleUserConnection } from "./messageHandler";

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
    console.log('New Websocket connection established');
    let currentUserId: string | null = null;
    try {
        ws.on('message', (data) => {
            console.log('data received through websockets: ', data);
            try {
                const message = JSON.parse(data.toString());
                switch (message.action) {
                    case 'user-connected':
                        handleUserConnection(ws, message, currentUserId);
                        break;
                    case 'join-match-making':
                        handleMatchPlayer(ws, message);
                        break;
                    default:
                        break;
                }
            } catch (error) {
                console.error('Error processing message: ', error);
            }
        });

        ws.on('close', () => {
            if (currentUserId) {
                onlineUsers.delete(currentUserId);
                
                // notifying everyone this user is now offline
                broadcastOnlineUsers();
                console.log(`User ${currentUserId} disconnected`);
            }
        });
    } catch (error) {
        ws.close();
    };
};