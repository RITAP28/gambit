import { WebSocket } from "ws";
import { Chess } from "chess.js";

export type GameStatus =
    | "waiting"
    | "in_progress"
    | "completed"
    | "abandoned"
    | "aborted"
    | "resigned"
    | "draw"
    | "timeout";

export type Color = "white" | "black";

/**
 * A socket that has completed the `user-connected` handshake. `userId` is set
 * only after the access token has been verified, and is the ONLY trusted source
 * of caller identity — message payloads are attacker-controlled.
 */
export interface AuthedSocket extends WebSocket {
    userId?: string;
}

export interface GameState {
    gameId: string;
    whitePlayerId: string;
    blackPlayerId: string;

    chess: Chess;
    activeColor: Color;
    status: GameStatus;

    lastMove: string;
    lastMoveTime: number;
    moveStartTime: number;

    /** Fischer increment added back to a player's clock after each of their moves. */
    incrementMs: number;
    timeControl: "bullet" | "blitz" | "rapid" | "classical" | "daily";
    isRated: boolean;

    clocks: {
        white: number;
        black: number;
    };

    /** Fires at flag-fall for whoever is on move. Cleared/rescheduled every move. */
    flagTimer?: ReturnType<typeof setTimeout>;

    /** userId of the player with an outstanding draw offer, if any. */
    drawOfferedBy?: string | null;

    /** Sockets watching without playing. */
    spectators: Set<AuthedSocket>;
}

export const onlineUsers = new Map<string, AuthedSocket>();

/** All games currently being played on this node, keyed by game id. */
export const activeGames = new Map<string, GameState>();

export const opposite = (color: Color): Color => (color === "white" ? "black" : "white");

export function playerColor(game: GameState, userId: string): Color | null {
    if (game.whitePlayerId === userId) return "white";
    if (game.blackPlayerId === userId) return "black";
    return null;
}
