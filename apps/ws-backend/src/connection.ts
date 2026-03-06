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
    console.log('New Websocket connection established');
    let currentUserId: string | null = null;
    try {
        ws.on('message', (data) => {
            console.log('data received through websockets: ', data);
            try {
                const message = JSON.parse(data.toString());
                if (message.action === 'user-connected') {
                    const { userId, accessToken } = message;

                    // verifying access token
                    const payload = verifyAccessToken(accessToken);

                    onlineUsers.set(payload.userId, ws);
                    currentUserId = payload.userId;
                    broadcastOnlineUsers();

                    console.log(`User ${userId} connected to the websocket`);

                    // send confirmation
                    ws.send(JSON.stringify({
                        action: 'connection-established',
                        userId: userId,
                        message: 'Successfully connected'
                    }));
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