import { Color, GameState } from "./state";

type FlagHandler = (game: GameState, flaggedColor: Color) => void | Promise<void>;

let flagHandler: FlagHandler | null = null;

/**
 * Registered once at startup. Injected rather than imported so this module stays
 * free of any dependency on game-conclusion logic (and free of an import cycle).
 */
export function onFlagFall(handler: FlagHandler): void {
    flagHandler = handler;
}

export function clearFlagFall(game: GameState): void {
    if (game.flagTimer) {
        clearTimeout(game.flagTimer);
        game.flagTimer = undefined;
    }
}

/**
 * Arms a timer that fires when the player on move runs out of time.
 *
 * Without this the clock is only ever checked when a move arrives, so a player
 * who simply stops moving never loses — their opponent waits forever. Call this
 * whenever the side to move changes, and after rehydrating a game from the DB.
 */
export function scheduleFlagFall(game: GameState): void {
    clearFlagFall(game);
    if (game.status !== "in_progress") return;

    const colorToMove = game.activeColor;
    const remaining = game.clocks[colorToMove];

    game.flagTimer = setTimeout(
        () => {
            game.flagTimer = undefined;
            // Re-read the clock at fire time: the move that would have refuted
            // this timer may have landed while it was pending.
            if (game.status !== "in_progress" || game.activeColor !== colorToMove) return;

            game.clocks[colorToMove] = 0;
            void flagHandler?.(game, colorToMove);
        },
        Math.max(0, remaining)
    );

    // A pending flag timer should not hold the process open on shutdown.
    game.flagTimer.unref?.();
}

/**
 * Deducts the time spent on a move from the mover's clock and adds the Fischer
 * increment. Returns the updated clocks; does not mutate the game.
 */
export function applyMoveToClocks(
    game: GameState,
    moverColor: Color,
    now: number
): { white: number; black: number } {
    const elapsed = now - game.moveStartTime;
    const remaining = game.clocks[moverColor] - elapsed;

    return {
        ...game.clocks,
        // Increment is only credited when the player actually completes a move
        // in time; a player who flags gets nothing.
        [moverColor]: remaining <= 0 ? remaining : remaining + game.incrementMs
    };
}
