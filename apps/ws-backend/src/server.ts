import { WebSocket, WebSocketServer } from "ws";
import config from "./infrastructure/activeconfig";

const port = config.PORT;
const handleConnection = () => {};

export const onlineUsers = new Map<string, WebSocket>();

const wss = new WebSocketServer({ port: port });
wss.on("connection", handleConnection);

console.log(`WS server running on port ${port}`);