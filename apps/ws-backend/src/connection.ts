import { WebSocket } from "ws";
import { IncomingMessage } from "node:http";

import { activeGames, AuthedSocket, onlineUsers } from "./state";
import {
    handleChat,
    handleDrawOffer,
    handleDrawResponse,
    handleJoinGame,
    handleLeaveGame,
    handleMakeMove,
    handleRequestResign,
    handleUserConnection
} from "./messageHandler";
import { joinQueue, leaveQueue, removeFromQueue } from "./matchmaking";
import { sendTo } from "./utils/broadcastToGame";

/** Largest message we will even attempt to parse, in bytes. */
const MAX_FRAME_BYTES = 8 * 1024;

/** Sustained message allowance per socket. */
const RATE_LIMIT_CAPACITY = 30;
const RATE_LIMIT_REFILL_PER_SEC = 10;

/** How long a socket may go without answering a ping before we drop it. */
const HEARTBEAT_INTERVAL_MS = 30_000;

interface SocketMeta {
    tokens: number;
    lastRefill: number;
    isAlive: boolean;
}

const meta = new WeakMap<AuthedSocket, SocketMeta>();

/**
 * Token bucket per connection. Cheap protection against a client flooding
 * moves or chat faster than a human could.
 */
function consumeToken(ws: AuthedSocket): boolean {
    const now = Date.now();
    const state = meta.get(ws);
    if (!state) return true;

    const elapsedSecs = (now - state.lastRefill) / 1000;
    state.tokens = Math.min(
        RATE_LIMIT_CAPACITY,
        state.tokens + elapsedSecs * RATE_LIMIT_REFILL_PER_SEC
    );
    state.lastRefill = now;

    if (state.tokens < 1) return false;

    state.tokens -= 1;
    return true;
}

export const sendMessage = (ws: AuthedSocket, action: string, data: object = {}) => {
    sendTo(ws, action, data);
};

/** Broadcasts the current online user list to everyone connected. */
export const broadcastOnlineUsers = () => {
    const userIds = Array.from(onlineUsers.keys());
    const payload = JSON.stringify({ action: "ONLINE_USERS", data: { userIds } });

    for (const ws of onlineUsers.values()) {
        if (ws.readyState === WebSocket.OPEN) ws.send(payload);
    }
};

/** Actions a socket may send before it has authenticated. */
const PUBLIC_ACTIONS = new Set(["user-connected", "ping"]);

export function handleConnection(socket: WebSocket, _req: IncomingMessage): void {
    const ws = socket as AuthedSocket;
    meta.set(ws, { tokens: RATE_LIMIT_CAPACITY, lastRefill: Date.now(), isAlive: true });

    console.log("[ws] new connection");

    ws.on("pong", () => {
        const state = meta.get(ws);
        if (state) state.isAlive = true;
    });

    ws.on("message", async (raw) => {
        const text = raw.toString();

        if (text.length > MAX_FRAME_BYTES) {
            sendTo(ws, "error", { error: "message-too-large" });
            return;
        }

        if (!consumeToken(ws)) {
            sendTo(ws, "error", { error: "rate-limited" });
            return;
        }

        let message: any;
        try {
            message = JSON.parse(text);
        } catch {
            sendTo(ws, "error", { error: "malformed-json" });
            return;
        }

        const action = message?.action;
        if (typeof action !== "string") {
            sendTo(ws, "error", { error: "missing-action" });
            return;
        }

        // Identity is established once, at handshake. Every other action is
        // rejected until then, and thereafter reads `ws.userId` rather than
        // anything in the payload.
        if (!ws.userId && !PUBLIC_ACTIONS.has(action)) {
            sendTo(ws, "error", { error: "not-authenticated" });
            return;
        }

        try {
            switch (action) {
                case "user-connected":
                    await handleUserConnection(ws, message);
                    break;
                case "ping":
                    sendTo(ws, "pong", {});
                    break;
                case "join-match-making":
                    await joinQueue(ws, message);
                    break;
                case "leave-match-making":
                    await leaveQueue(ws);
                    break;
                case "possible-move":
                    await handleMakeMove(ws, message);
                    break;
                case "join-game":
                    await handleJoinGame(ws, message);
                    break;
                case "leave-game":
                    handleLeaveGame(ws, message);
                    break;
                case "send-chat":
                    await handleChat(ws, message);
                    break;
                case "resign-request":
                    await handleRequestResign(ws, message);
                    break;
                case "offer-draw":
                    await handleDrawOffer(ws, message);
                    break;
                case "respond-draw":
                    await handleDrawResponse(ws, message);
                    break;
                default:
                    sendTo(ws, "error", { error: "unknown-action", action });
            }
        } catch (error) {
            console.error(`[ws] handler for "${action}" threw:`, error);
            sendTo(ws, "error", { error: "server-error", action });
        }
    });

    ws.on("close", () => {
        void handleDisconnect(ws);
    });

    ws.on("error", (error) => {
        console.error("[ws] socket error:", error);
    });
}

/**
 * Cleans up everything keyed by this socket.
 *
 * Identity is read from `ws.userId`, which the authenticated handshake sets on
 * the socket itself. An earlier version passed a local variable into the auth
 * handler by value, so the assignment never reached this closure: disconnected
 * users were never removed, the map grew without bound, and everyone appeared
 * permanently online.
 */
async function handleDisconnect(ws: AuthedSocket): Promise<void> {
    const userId = ws.userId;

    // Spectator entries are keyed by socket, so clear them regardless of auth.
    for (const game of activeGames.values()) {
        game.spectators.delete(ws);
    }

    if (!userId) return;

    // Only drop the map entry if it still points at *this* socket; a newer
    // connection for the same user must not be evicted by an older one closing.
    if (onlineUsers.get(userId) === ws) {
        onlineUsers.delete(userId);
    }

    await removeFromQueue(userId);
    broadcastOnlineUsers();

    // A player who disconnects mid-game keeps their clock running and loses on
    // time if they never return, which is the correct chess outcome.
    console.log(`[ws] user ${userId} disconnected`);
}

/**
 * Drops sockets that stop answering pings. Without this, half-open connections
 * (laptop lid closed, network dropped) linger in `onlineUsers` because no close
 * event is ever delivered.
 */
export function startHeartbeat(getSockets: () => Iterable<AuthedSocket>): () => void {
    const timer = setInterval(() => {
        for (const ws of getSockets()) {
            const state = meta.get(ws);
            if (!state) continue;

            if (!state.isAlive) {
                ws.terminate();
                continue;
            }

            state.isAlive = false;
            ws.ping();
        }
    }, HEARTBEAT_INTERVAL_MS);

    timer.unref?.();
    return () => clearInterval(timer);
}
