import { Chess } from "chess.js";
import { vi } from "vitest";
import { activeGames, AuthedSocket, GameState } from "../../state";

export const WHITE_ID = "player-white";
export const BLACK_ID = "player-black";
export const STRANGER_ID = "player-stranger";

/** A socket double that records what was written to it. */
export function mockSocket(userId?: string): AuthedSocket & { send: ReturnType<typeof vi.fn> } {
    const socket = {
        userId,
        readyState: 1, // WebSocket.OPEN
        send: vi.fn(),
        ping: vi.fn(),
        terminate: vi.fn(),
        on: vi.fn()
    };
    return socket as unknown as AuthedSocket & { send: ReturnType<typeof vi.fn> };
}

/** Every action + data payload written to a mock socket. */
export function sentMessages(socket: { send: ReturnType<typeof vi.fn> }): Array<{
    action: string;
    data: any;
}> {
    return socket.send.mock.calls.map((call) => JSON.parse(call[0] as string));
}

export function lastMessage(socket: { send: ReturnType<typeof vi.fn> }) {
    return sentMessages(socket).at(-1);
}

export interface GameOverrides {
    gameId?: string;
    fen?: string;
    clocks?: { white: number; black: number };
    incrementMs?: number;
    moveStartTime?: number;
    isRated?: boolean;
    status?: GameState["status"];
}

/** Builds a game and registers it in `activeGames`, as a real match would be. */
export function makeGame(overrides: GameOverrides = {}): GameState {
    const gameId = overrides.gameId ?? "game-123";
    const chess = new Chess();
    if (overrides.fen) chess.load(overrides.fen);

    const game: GameState = {
        gameId,
        whitePlayerId: WHITE_ID,
        blackPlayerId: BLACK_ID,

        chess,
        activeColor: chess.turn() === "w" ? "white" : "black",
        status: overrides.status ?? "in_progress",

        lastMove: "",
        lastMoveTime: 0,
        moveStartTime: overrides.moveStartTime ?? Date.now(),

        incrementMs: overrides.incrementMs ?? 0,
        timeControl: "blitz",
        isRated: overrides.isRated ?? false,

        clocks: overrides.clocks ?? { white: 300_000, black: 300_000 },

        drawOfferedBy: null,
        spectators: new Set()
    };

    activeGames.set(gameId, game);
    return game;
}

export function resetGames(): void {
    for (const game of activeGames.values()) {
        if (game.flagTimer) clearTimeout(game.flagTimer);
    }
    activeGames.clear();
}
