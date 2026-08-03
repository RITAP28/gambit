import { db, eq, games } from "@repo/db";
import { activeGames, GameState, opposite, Color } from "../state";
import { broadcastToGame } from "../utils/broadcastToGame";
import { clearFlagFall } from "../clock";
import { applyRatingChange } from "./rating.service";

export type Termination =
    | "checkmate"
    | "resignation"
    | "timeout"
    | "stalemate"
    | "insufficient_material"
    | "threefold_repetition"
    | "fifty_move_rule"
    | "agreement"
    | "abondonment";

export type GameResult = "white_win" | "black_win" | "draw";

export interface Conclusion {
    /** Winning colour, or null for a draw. */
    winnerColor: Color | null;
    termination: Termination;
    /** Human-readable reason surfaced to the client. */
    reason: string;
    /** Set only for resignations, so the UI can say who resigned. */
    resignedBy?: string | null;
}

/** How long a finished game lingers in memory so late reconnects still see the result. */
const MEMORY_RETENTION_MS = 30_000;

/**
 * Single exit point for every way a game can end. Persists the result, applies
 * rating changes, broadcasts to both players and spectators, then releases the
 * in-memory state.
 *
 * Idempotent: a game already out of `in_progress` is ignored, so a resignation
 * racing a flag-fall cannot double-persist or double-rate.
 */
export async function concludeGame(game: GameState, conclusion: Conclusion): Promise<boolean> {
    if (game.status !== "in_progress") return false;

    const { winnerColor, termination, reason, resignedBy = null } = conclusion;

    // Claim the game synchronously, before any await, so a concurrent handler
    // cannot pass the guard above while this one is mid-flight.
    game.status = "completed";
    clearFlagFall(game);

    const winnerId =
        winnerColor === "white"
            ? game.whitePlayerId
            : winnerColor === "black"
              ? game.blackPlayerId
              : null;

    const result: GameResult =
        winnerColor === null ? "draw" : winnerColor === "white" ? "white_win" : "black_win";

    try {
        await db
            .update(games)
            .set({
                status: "completed",
                result,
                termination,
                winner: winnerId,
                pgn: game.chess.pgn(),
                currentFen: game.chess.fen(),
                whiteTimeLeft: Math.max(0, Math.floor(game.clocks.white / 1000)),
                blackTimeLeft: Math.max(0, Math.floor(game.clocks.black / 1000)),
                resignedBy: resignedBy,
                endedAt: new Date()
            })
            .where(eq(games.id, game.gameId));
    } catch (error) {
        console.error(`[concludeGame] failed to persist result for ${game.gameId}:`, error);
        // Keep going — players still deserve to be told the game is over even if
        // the write failed. The row stays `in_progress` and is repaired on reload.
    }

    let ratingDelta: Awaited<ReturnType<typeof applyRatingChange>> = null;
    if (game.isRated) {
        try {
            ratingDelta = await applyRatingChange(game, result);
        } catch (error) {
            console.error(`[concludeGame] rating update failed for ${game.gameId}:`, error);
        }
    }

    broadcastToGame(game.gameId, {
        action: "game-over",
        data: {
            reason,
            termination,
            result,
            winner: winnerId,
            color: winnerColor,
            resignedBy,
            pgn: game.chess.pgn(),
            clocks: game.clocks,
            ratings: ratingDelta
        }
    });

    setTimeout(() => activeGames.delete(game.gameId), MEMORY_RETENTION_MS);
    return true;
}

/**
 * Ends a game because the player on move ran out of time. Under FIDE rules the
 * opponent only wins if they have mating material; otherwise it is a draw.
 */
export async function concludeOnFlag(game: GameState, flaggedColor: Color): Promise<boolean> {
    const winner = opposite(flaggedColor);

    // Rebuild the position from the winner's perspective to ask whether they
    // could ever deliver mate. chess.js exposes this only as a whole-board test,
    // so an insufficient-material board means neither side can mate.
    const opponentCanMate = !game.chess.isInsufficientMaterial();

    return concludeGame(game, {
        winnerColor: opponentCanMate ? winner : null,
        termination: opponentCanMate ? "timeout" : "insufficient_material",
        reason: opponentCanMate ? "timeout" : "timeout vs insufficient material"
    });
}
