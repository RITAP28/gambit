import { WebSocket, WebSocketServer } from "ws";
import config from "./infrastructure/activeconfig";
import { handleConnection } from "./connection";

export const onlineUsers = new Map<string, WebSocket>();
export const usersSearchingForMatch = new Map<string, WebSocket>();

const wss = new WebSocketServer({ port: Number(config.PORT) });
wss.on("connection", handleConnection);

console.log(`WS server running on port ${config.PORT}`);