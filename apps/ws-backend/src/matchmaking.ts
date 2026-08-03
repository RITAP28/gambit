import { db, eq, matchMakingQueues } from "@repo/db";
import { resolveTimeControl } from "@repo/types";
import { AuthedSocket } from "./state";
import { sendTo, sendToUser } from "./utils/broadcastToGame";
import { getOrCreateRating } from "./services/rating.service";
import { createGame } from "./services/game.service";

interface QueueEntry {
    userId: string;
    ws: AuthedSocket;
    timeControlKey: string;
    rating: number;
    deviation: number;
    isRated: boolean;
    joinedAt: number;
}

/** Rating points either side of a player that count as a fair pairing at t=0. */
const BASE_WINDOW = 100;

/** Extra rating points of tolerance granted per second spent waiting. */
const WINDOW_GROWTH_PER_SEC = 40;

/** Ceiling on the search window; past this we would pair anyone with anyone. */
const MAX_WINDOW = 1200;

/** How often to re-attempt pairing as windows widen. */
const SWEEP_INTERVAL_MS = 2000;

/**
 * One queue per time control. Players only ever match within their own pool —
 * a bullet player must never be paired into a classical game.
 */
const queues = new Map<string, QueueEntry[]>();

let sweepTimer: ReturnType<typeof setInterval> | null = null;

/**
 * How far a player is currently willing to reach. Starts narrow for a good
 * pairing and widens with waiting time so nobody is stuck in a thin pool.
 */
function searchWindow(entry: QueueEntry, now: number): number {
    const waitedSecs = (now - entry.joinedAt) / 1000;
    // An uncertain (provisional) rating justifies a wider window immediately —
    // we do not really know where they belong yet.
    const uncertainty = Math.max(0, entry.deviation - 50);
    return Math.min(MAX_WINDOW, BASE_WINDOW + uncertainty + waitedSecs * WINDOW_GROWTH_PER_SEC);
}

/** A pairing is allowed only when the gap is inside *both* players' windows. */
function isAcceptablePair(a: QueueEntry, b: QueueEntry, now: number): boolean {
    if (a.isRated !== b.isRated) return false;
    const gap = Math.abs(a.rating - b.rating);
    return gap <= searchWindow(a, now) && gap <= searchWindow(b, now);
}

export async function joinQueue(ws: AuthedSocket, message: any): Promise<void> {
    const userId = ws.userId;
    if (!userId) {
        sendTo(ws, "matchmaking-error", { error: "not-authenticated" });
        return;
    }

    const data = message?.data ?? message ?? {};
    const spec = resolveTimeControl(data.timeControl);
    const isRated = data.isRated !== false;

    if (isAlreadyQueued(userId)) {
        sendTo(ws, "matchmaking-error", { error: "already-queued" });
        return;
    }

    const rating = await getOrCreateRating(userId, spec.name);

    const entry: QueueEntry = {
        userId,
        ws,
        timeControlKey: spec.key,
        rating: rating.rating,
        deviation: rating.deviation,
        isRated,
        joinedAt: Date.now()
    };

    const pool = queues.get(spec.key) ?? [];
    pool.push(entry);
    queues.set(spec.key, pool);

    // Mirrored to the database purely for observability — matching itself runs
    // off the in-memory pool.
    void recordQueueEntry(entry, spec.initialSecs, spec.incrementSecs).catch(() => {});

    sendTo(ws, "matchmaking-queued", {
        timeControl: spec.key,
        rating: Math.round(rating.rating),
        isRated,
        poolSize: pool.length
    });

    startSweeping();
    await tryMatch(spec.key);
}

export async function leaveQueue(ws: AuthedSocket): Promise<void> {
    const userId = ws.userId;
    if (!userId) return;
    await removeFromQueue(userId);
    sendTo(ws, "matchmaking-cancelled", {});
}

/** Called on disconnect too, where there is no socket left to reply on. */
export async function removeFromQueue(userId: string): Promise<void> {
    for (const [key, pool] of queues) {
        const index = pool.findIndex((entry) => entry.userId === userId);
        if (index === -1) continue;

        pool.splice(index, 1);
        if (pool.length === 0) queues.delete(key);
    }

    if (queues.size === 0) stopSweeping();

    try {
        await db.delete(matchMakingQueues).where(eq(matchMakingQueues.userId, userId));
    } catch {
        // Observability only — a stale queue row must not fail a disconnect.
    }
}

const isAlreadyQueued = (userId: string): boolean => {
    for (const pool of queues.values()) {
        if (pool.some((entry) => entry.userId === userId)) return true;
    }
    return false;
};

/**
 * Greedily pairs the longest-waiting player with their closest acceptable
 * opponent. Serving the longest waiter first bounds worst-case queue time;
 * choosing their *closest* match keeps pairings as fair as the wait allows.
 */
async function tryMatch(timeControlKey: string): Promise<void> {
    const pool = queues.get(timeControlKey);
    if (!pool || pool.length < 2) return;

    const now = Date.now();
    pool.sort((a, b) => a.joinedAt - b.joinedAt);

    for (let i = 0; i < pool.length; i += 1) {
        const seeker = pool[i];
        if (!seeker) continue;

        let bestIndex = -1;
        let bestGap = Number.POSITIVE_INFINITY;

        for (let j = i + 1; j < pool.length; j += 1) {
            const candidate = pool[j];
            if (!candidate) continue;
            if (!isAcceptablePair(seeker, candidate, now)) continue;

            const gap = Math.abs(seeker.rating - candidate.rating);
            if (gap < bestGap) {
                bestGap = gap;
                bestIndex = j;
            }
        }

        if (bestIndex === -1) continue;

        const opponent = pool[bestIndex];
        if (!opponent) continue;

        // Remove both before awaiting so a concurrent sweep cannot re-pair them.
        pool.splice(bestIndex, 1);
        pool.splice(i, 1);

        await startGame(seeker, opponent, timeControlKey);
        return tryMatch(timeControlKey);
    }
}

async function startGame(a: QueueEntry, b: QueueEntry, timeControlKey: string): Promise<void> {
    // Randomise colours so neither queue position nor rating decides who is white.
    const [white, black] = Math.random() < 0.5 ? [a, b] : [b, a];

    try {
        const game = await createGame({
            whitePlayerId: white.userId,
            blackPlayerId: black.userId,
            timeControlKey,
            isRated: a.isRated && b.isRated
        });

        await Promise.all([
            db.delete(matchMakingQueues).where(eq(matchMakingQueues.userId, a.userId)),
            db.delete(matchMakingQueues).where(eq(matchMakingQueues.userId, b.userId))
        ]).catch(() => {});

        const payload = {
            gameId: game.gameId,
            timeControl: game.timeControl,
            timeControlKey,
            isRated: game.isRated,
            clocks: game.clocks,
            incrementMs: game.incrementMs
        };

        sendToUser(white.userId, "match-found", {
            ...payload,
            color: "white",
            opponentId: black.userId,
            opponentRating: Math.round(black.rating),
            yourRating: Math.round(white.rating)
        });

        sendToUser(black.userId, "match-found", {
            ...payload,
            color: "black",
            opponentId: white.userId,
            opponentRating: Math.round(white.rating),
            yourRating: Math.round(black.rating)
        });

        console.log(
            `[matchmaking] ${timeControlKey}: ${white.userId} (${Math.round(white.rating)}) vs ` +
                `${black.userId} (${Math.round(black.rating)}) -> ${game.gameId}`
        );
    } catch (error) {
        console.error("[matchmaking] failed to start game:", error);
        // Put both players back rather than silently dropping them.
        const pool = queues.get(timeControlKey) ?? [];
        pool.push(a, b);
        queues.set(timeControlKey, pool);

        sendTo(a.ws, "matchmaking-error", { error: "failed-to-start" });
        sendTo(b.ws, "matchmaking-error", { error: "failed-to-start" });
    }
}

async function recordQueueEntry(
    entry: QueueEntry,
    timeLimit: number,
    increment: number
): Promise<void> {
    const spec = resolveTimeControl(entry.timeControlKey);
    const window = searchWindow(entry, Date.now());

    await db
        .insert(matchMakingQueues)
        .values({
            userId: entry.userId,
            timeControl: spec.name,
            timeLimit,
            increment,
            ratingMin: Math.round(entry.rating - window),
            ratingMax: Math.round(entry.rating + window),
            isRated: entry.isRated,
            joinedAt: new Date(entry.joinedAt)
        })
        .onConflictDoNothing();
}

/**
 * Re-runs matching on a timer. Necessary because a pair that is unacceptable
 * now can become acceptable purely by waiting, with no new event to trigger it.
 */
function startSweeping(): void {
    if (sweepTimer) return;

    sweepTimer = setInterval(() => {
        for (const key of [...queues.keys()]) {
            void tryMatch(key);
        }
        if (queues.size === 0) stopSweeping();
    }, SWEEP_INTERVAL_MS);

    sweepTimer.unref?.();
}

function stopSweeping(): void {
    if (!sweepTimer) return;
    clearInterval(sweepTimer);
    sweepTimer = null;
}

/** Exposed for tests and for a future admin/status endpoint. */
export function queueSnapshot(): Record<string, number> {
    const snapshot: Record<string, number> = {};
    for (const [key, pool] of queues) snapshot[key] = pool.length;
    return snapshot;
}

/** Test seam: injects a pre-built entry without touching the database. */
export function enqueueForTest(entry: QueueEntry): void {
    const pool = queues.get(entry.timeControlKey) ?? [];
    pool.push(entry);
    queues.set(entry.timeControlKey, pool);
}

export { isAcceptablePair, searchWindow, tryMatch, type QueueEntry };

/** Test helper: drops all queued players and stops the sweep timer. */
export function resetQueues(): void {
    queues.clear();
    stopSweeping();
}
