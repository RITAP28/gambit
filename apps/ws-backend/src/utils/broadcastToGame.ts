import { WebSocket } from "ws";
import { getPubSub } from "@repo/redis";
import { activeGames, AuthedSocket, onlineUsers } from "../state";

export interface GamePayload {
    action: string;
    data: unknown;
}

/** Channel every node publishes game traffic to. */
const GAME_CHANNEL = "chess:game-events";

interface RelayEnvelope {
    gameId: string;
    /** User ids that should receive this message, wherever they are connected. */
    recipients: string[];
    payload: GamePayload;
}

function safeSend(socket: AuthedSocket | undefined, serialised: string): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    try {
        socket.send(serialised);
    } catch (error) {
        console.error("[broadcast] failed to write to socket:", error);
    }
}

/** Delivers to whichever of these users happen to be connected to *this* node. */
function deliverToUsers(userIds: Iterable<string>, serialised: string): void {
    for (const userId of userIds) {
        safeSend(onlineUsers.get(userId), serialised);
    }
}

/** Everyone who should see traffic for a game: both players and any spectators. */
function recipientsOf(gameId: string): string[] {
    const game = activeGames.get(gameId);
    if (!game) return [];

    const recipients = new Set<string>([game.whitePlayerId, game.blackPlayerId]);
    for (const spectator of game.spectators) {
        if (spectator.userId) recipients.add(spectator.userId);
    }

    return [...recipients];
}

/**
 * Fans a payload out to both players and any spectators.
 *
 * Every recipient is optional — a player may have disconnected, and a game may
 * already have been evicted from memory. Losing one recipient must never stop
 * the others from being told, so each send is isolated.
 *
 * When Redis is configured the message is also published so that players
 * connected to a different node still receive it; without it, this is purely
 * local and behaves exactly as a single-node deployment.
 */
export function broadcastToGame(gameId: string, payload: GamePayload): void {
    const recipients = recipientsOf(gameId);

    if (recipients.length === 0) {
        console.warn(`[broadcast] no active game ${gameId}; dropping ${payload.action}`);
        return;
    }

    const serialised = JSON.stringify({ action: payload.action, data: payload.data });
    deliverToUsers(recipients, serialised);

    const pubsub = getPubSub();
    if (pubsub.enabled) {
        const envelope: RelayEnvelope = { gameId, recipients, payload };
        void pubsub.publish(GAME_CHANNEL, envelope);
    }
}

/**
 * Delivers game messages published by other nodes.
 *
 * A remote node holds the player's socket but not the game state, which is why
 * the envelope carries its own recipient list rather than being re-derived
 * from `activeGames` here.
 */
export async function startCrossInstanceRelay(): Promise<void> {
    const pubsub = getPubSub();
    if (!pubsub.enabled) return;

    await pubsub.subscribe(GAME_CHANNEL, (message) => {
        const envelope = message as RelayEnvelope;
        if (!envelope?.recipients || !envelope.payload) return;

        const serialised = JSON.stringify({
            action: envelope.payload.action,
            data: envelope.payload.data
        });

        deliverToUsers(envelope.recipients, serialised);
    });

    console.log("[broadcast] cross-instance relay active");
}

/** Sends to a single socket, tolerating a closed or missing connection. */
export function sendTo(socket: AuthedSocket | undefined, action: string, data: unknown = {}): void {
    safeSend(socket, JSON.stringify({ action, data }));
}

/**
 * Sends to a user by id. Falls back to the relay when they are not connected
 * here, so a match-found notice reaches a player on another node.
 */
export function sendToUser(userId: string, action: string, data: unknown = {}): void {
    const serialised = JSON.stringify({ action, data });
    const local = onlineUsers.get(userId);

    if (local) {
        safeSend(local, serialised);
        return;
    }

    const pubsub = getPubSub();
    if (pubsub.enabled) {
        const envelope: RelayEnvelope = {
            gameId: "",
            recipients: [userId],
            payload: { action, data }
        };
        void pubsub.publish(GAME_CHANNEL, envelope);
    }
}
