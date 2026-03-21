import { WebSocket, WebSocketServer } from "ws";
import config from "./infrastructure/activeconfig";
import { handleConnection } from "./connection";
import { Chess } from "chess.js";

export interface GameState {
    gameId: string;
    whitePlayerId: string;
    blackPlayerId: string;

    chess: Chess,
    activeColor: 'white' | 'black',

    lastMove: string;
    lastMoveTime: number;
    moveStartTime: number;

    clocks: {
        white: number;
        black: number;
    }
}

export const onlineUsers = new Map<string, WebSocket>();
export const usersSearchingForMatch = new Map<string, WebSocket>();

// keeping all the active games in memory
export const activeGames = new Map<string, GameState>();

const wss = new WebSocketServer({ port: Number(config.PORT) });
wss.on("connection", handleConnection);

console.log(`WS server running on port ${config.PORT}`);