import Redis from "ioredis";

/**
 * Cross-instance message bus.
 *
 * A single WebSocket node keeps its games in memory, so two players are only
 * guaranteed to see each other's moves if they are connected to the same node.
 * Publishing every outbound game message here lets other nodes relay it to
 * whichever of their own sockets belongs to that game.
 *
 * Redis is optional. With no REDIS_URL configured the no-op implementation is
 * used and a single node behaves exactly as it did before — so local
 * development needs no extra service.
 */
export interface PubSub {
    /** True when messages actually leave this process. */
    readonly enabled: boolean;
    publish(channel: string, message: unknown): Promise<void>;
    subscribe(channel: string, handler: (message: unknown) => void): Promise<void>;
    close(): Promise<void>;
}

/** Identifies this process so it can ignore the messages it published itself. */
export const INSTANCE_ID = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

interface Envelope {
    from: string;
    payload: unknown;
}

class NoopPubSub implements PubSub {
    readonly enabled = false;

    async publish(): Promise<void> {
        // Single-node deployment: local delivery already covers every recipient.
    }

    async subscribe(): Promise<void> {
        // Nothing will ever arrive, so there is nothing to wire up.
    }

    async close(): Promise<void> {}
}

class RedisPubSub implements PubSub {
    readonly enabled = true;

    /**
     * Two connections are required: a Redis client in subscriber mode cannot
     * issue ordinary commands, so publishing needs its own.
     */
    private readonly publisher: Redis;
    private readonly subscriber: Redis;
    private readonly handlers = new Map<string, Set<(message: unknown) => void>>();

    constructor(url: string) {
        this.publisher = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });
        this.subscriber = new Redis(url, { maxRetriesPerRequest: null, lazyConnect: false });

        // A pub/sub outage must degrade to single-node behaviour, not crash the
        // server, so connection errors are logged rather than thrown.
        this.publisher.on("error", (error) => console.error("[redis] publisher:", error.message));
        this.subscriber.on("error", (error) => console.error("[redis] subscriber:", error.message));

        this.subscriber.on("message", (channel: string, raw: string) => {
            const listeners = this.handlers.get(channel);
            if (!listeners?.size) return;

            let envelope: Envelope;
            try {
                envelope = JSON.parse(raw);
            } catch {
                return;
            }

            // Redis echoes to every subscriber including the publisher; the
            // origin node has already delivered this locally.
            if (envelope.from === INSTANCE_ID) return;

            for (const listener of listeners) {
                try {
                    listener(envelope.payload);
                } catch (error) {
                    console.error("[redis] subscriber handler threw:", error);
                }
            }
        });
    }

    async publish(channel: string, message: unknown): Promise<void> {
        const envelope: Envelope = { from: INSTANCE_ID, payload: message };
        try {
            await this.publisher.publish(channel, JSON.stringify(envelope));
        } catch (error) {
            console.error("[redis] publish failed:", error);
        }
    }

    async subscribe(channel: string, handler: (message: unknown) => void): Promise<void> {
        const existing = this.handlers.get(channel);

        if (existing) {
            existing.add(handler);
            return;
        }

        this.handlers.set(channel, new Set([handler]));
        await this.subscriber.subscribe(channel);
    }

    async close(): Promise<void> {
        this.handlers.clear();
        await Promise.allSettled([this.publisher.quit(), this.subscriber.quit()]);
    }
}

let shared: PubSub | null = null;

export function getPubSub(url: string | undefined = process.env.REDIS_URL): PubSub {
    if (shared) return shared;

    if (!url) {
        console.log("[redis] REDIS_URL not set; running single-node without cross-instance fanout");
        shared = new NoopPubSub();
    } else {
        console.log("[redis] cross-instance fanout enabled");
        shared = new RedisPubSub(url);
    }

    return shared;
}

/** Test seam and shutdown hook. */
export async function resetPubSub(): Promise<void> {
    await shared?.close();
    shared = null;
}

export { NoopPubSub, RedisPubSub };
