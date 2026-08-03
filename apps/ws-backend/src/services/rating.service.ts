import { and, db, eq, ratings } from "@repo/db";
import { defaultRating, rateGame, type Rating } from "@repo/rating";
import { GameState } from "../state";

export type TimeControl = "bullet" | "blitz" | "rapid" | "classical" | "daily";

export interface RatingDelta {
    userId: string;
    before: number;
    after: number;
    change: number;
    deviation: number;
    provisional: boolean;
}

export interface RatingOutcome {
    white: RatingDelta;
    black: RatingDelta;
}

interface StoredRating extends Rating {
    gamesPlayed: number;
    peakRating: number;
}

/**
 * Reads a player's rating for a time control, creating the default row the
 * first time they play it. Concurrent first games are safe: the unique
 * constraint on (user, time control) turns the loser of the race into a no-op
 * and we re-read.
 */
export async function getOrCreateRating(
    userId: string,
    timeControl: TimeControl
): Promise<StoredRating> {
    const existing = await readRating(userId, timeControl);
    if (existing) return existing;

    const base = defaultRating();

    await db
        .insert(ratings)
        .values({
            userId,
            timeControl,
            rating: base.rating,
            ratingDeviation: base.deviation,
            volatility: base.volatility,
            peakRating: base.rating,
            gamesPlayed: 0
        })
        .onConflictDoNothing();

    const created = await readRating(userId, timeControl);
    if (created) return created;

    // Read-after-write failed; fall back to defaults rather than blocking the
    // game from concluding. The row is repaired on the next game.
    return { ...base, gamesPlayed: 0, peakRating: base.rating };
}

async function readRating(userId: string, timeControl: TimeControl): Promise<StoredRating | null> {
    const [row] = await db
        .select()
        .from(ratings)
        .where(and(eq(ratings.userId, userId), eq(ratings.timeControl, timeControl)));

    if (!row) return null;

    return {
        rating: row.rating,
        deviation: row.ratingDeviation,
        volatility: row.volatility,
        gamesPlayed: row.gamesPlayed,
        peakRating: row.peakRating
    };
}

/**
 * Rates a finished game for both players and persists the result. Returns the
 * before/after numbers so the client can show "+12" on the game-over screen.
 *
 * Both players are rated from the same pre-game snapshot, so the outcome does
 * not depend on which row is written first.
 */
export async function applyRatingChange(
    game: GameState,
    result: "white_win" | "black_win" | "draw"
): Promise<RatingOutcome | null> {
    const timeControl = game.timeControl;

    const [whiteBefore, blackBefore] = await Promise.all([
        getOrCreateRating(game.whitePlayerId, timeControl),
        getOrCreateRating(game.blackPlayerId, timeControl)
    ]);

    const rated = rateGame(whiteBefore, blackBefore, result);

    await Promise.all([
        persist(game.whitePlayerId, timeControl, whiteBefore, rated.white),
        persist(game.blackPlayerId, timeControl, blackBefore, rated.black)
    ]);

    return {
        white: toDelta(game.whitePlayerId, whiteBefore, rated.white),
        black: toDelta(game.blackPlayerId, blackBefore, rated.black)
    };
}

async function persist(
    userId: string,
    timeControl: TimeControl,
    before: StoredRating,
    after: Rating
): Promise<void> {
    await db
        .update(ratings)
        .set({
            rating: after.rating,
            ratingDeviation: after.deviation,
            volatility: after.volatility,
            gamesPlayed: before.gamesPlayed + 1,
            peakRating: Math.max(before.peakRating, after.rating),
            lastPlayedAt: new Date(),
            updatedAt: new Date()
        })
        .where(and(eq(ratings.userId, userId), eq(ratings.timeControl, timeControl)));
}

function toDelta(userId: string, before: Rating, after: Rating): RatingDelta {
    return {
        userId,
        before: Math.round(before.rating),
        after: Math.round(after.rating),
        change: Math.round(after.rating) - Math.round(before.rating),
        deviation: Math.round(after.deviation),
        provisional: after.deviation > 110
    };
}
