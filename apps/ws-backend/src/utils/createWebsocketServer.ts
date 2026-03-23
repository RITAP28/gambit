import { WebSocketServer } from "ws";
import { handleConnection } from "../connection";

export const createWsServer = (port: number): Promise<WebSocketServer> => {
    return new Promise((resolve) => {
        const wss = new WebSocketServer({ port }, () => resolve(wss));
        wss.on('connection', handleConnection); // your existing connection handler
    });
};