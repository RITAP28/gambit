/**
 * Glicko-2 rating system, following Glickman's specification:
 * http://www.glicko.net/glicko/glicko2.pdf
 *
 * Ratings are stored on the familiar ~1500-centred Glicko scale and converted
 * internally to the Glicko-2 scale (μ, φ) for the update maths.
 */

/** Conversion factor between the Glicko and Glicko-2 scales. */
const SCALE = 173.7178;

export const DEFAULT_RATING = 1500;
export const DEFAULT_DEVIATION = 350;
export const DEFAULT_VOLATILITY = 0.06;

/**
 * System constant τ, constraining how much volatility can move per period.
 * Smaller values damp the effect of improbable results. Glickman suggests
 * 0.3–1.2; 0.5 is the common choice for chess.
 */
export const TAU = 0.5;

/** Convergence tolerance for the volatility solver. */
const EPSILON = 0.000001;

/** A rating deviation this low would make a rating essentially unmovable. */
const MIN_DEVIATION = 30;

/** Caps RD growth from inactivity at the provisional default. */
const MAX_DEVIATION = DEFAULT_DEVIATION;

export interface Rating {
    rating: number;
    deviation: number;
    volatility: number;
}

/** Score from the perspective of the player being updated. */
export type Score = 1 | 0 | 0.5;

export interface MatchResult {
    opponent: Rating;
    score: Score;
}

export const defaultRating = (): Rating => ({
    rating: DEFAULT_RATING,
    deviation: DEFAULT_DEVIATION,
    volatility: DEFAULT_VOLATILITY
});

const toGlicko2 = (r: Rating) => ({
    mu: (r.rating - DEFAULT_RATING) / SCALE,
    phi: r.deviation / SCALE,
    sigma: r.volatility
});

const fromGlicko2 = (mu: number, phi: number, sigma: number): Rating => ({
    rating: SCALE * mu + DEFAULT_RATING,
    deviation: SCALE * phi,
    volatility: sigma
});

/** g(φ): weights an opponent's influence by how well-established their rating is. */
const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

/** E(μ, μⱼ, φⱼ): expected score against one opponent. */
const expectedScore = (mu: number, muJ: number, phiJ: number): number =>
    1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

/**
 * Solves for the new volatility σ′ using the Illinois variant of regula falsi,
 * exactly as in step 5 of the specification.
 */
function solveVolatility(phi: number, sigma: number, v: number, delta: number, tau: number): number {
    const a = Math.log(sigma * sigma);
    const phiSq = phi * phi;
    const deltaSq = delta * delta;

    const f = (x: number): number => {
        const ex = Math.exp(x);
        const denom = phiSq + v + ex;
        return (ex * (deltaSq - phiSq - v - ex)) / (2 * denom * denom) - (x - a) / (tau * tau);
    };

    let A = a;
    let B: number;

    if (deltaSq > phiSq + v) {
        B = Math.log(deltaSq - phiSq - v);
    } else {
        // Walk B down until f(B) is negative, bracketing the root.
        let k = 1;
        while (f(a - k * tau) < 0) k += 1;
        B = a - k * tau;
    }

    let fA = f(A);
    let fB = f(B);

    // Guard against a pathological non-converging case rather than spinning.
    let iterations = 0;
    while (Math.abs(B - A) > EPSILON && iterations < 100) {
        const C = A + ((A - B) * fA) / (fB - fA);
        const fC = f(C);

        if (fC * fB <= 0) {
            A = B;
            fA = fB;
        } else {
            // Illinois adjustment: halve fA to avoid one endpoint stagnating.
            fA = fA / 2;
        }

        B = C;
        fB = fC;
        iterations += 1;
    }

    return Math.exp(A / 2);
}

/**
 * Updates one player's rating from the results they played in a rating period.
 *
 * Passing a single result is the "rate every game immediately" mode this
 * application uses; passing several batches a period as Glickman intended.
 */
export function rate(player: Rating, results: MatchResult[], tau: number = TAU): Rating {
    if (results.length === 0) return applyInactivity(player);

    const { mu, phi, sigma } = toGlicko2(player);

    let vInv = 0;
    let deltaSum = 0;

    for (const { opponent, score } of results) {
        const { mu: muJ, phi: phiJ } = toGlicko2(opponent);
        const gPhiJ = g(phiJ);
        const e = expectedScore(mu, muJ, phiJ);

        vInv += gPhiJ * gPhiJ * e * (1 - e);
        deltaSum += gPhiJ * (score - e);
    }

    const v = 1 / vInv;
    const delta = v * deltaSum;

    const newSigma = solveVolatility(phi, sigma, v, delta, tau);

    // Pre-period RD growth, then contraction by the information gained.
    const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
    const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
    const newMu = mu + newPhi * newPhi * deltaSum;

    const updated = fromGlicko2(newMu, newPhi, newSigma);

    return {
        rating: updated.rating,
        deviation: clamp(updated.deviation, MIN_DEVIATION, MAX_DEVIATION),
        volatility: updated.volatility
    };
}

/**
 * Increases rating deviation for a player who sat out a rating period. Rating
 * and volatility are unchanged — we are only becoming less certain.
 */
export function applyInactivity(player: Rating): Rating {
    const { phi, sigma } = toGlicko2(player);
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);

    return {
        ...player,
        deviation: clamp(SCALE * phiStar, MIN_DEVIATION, MAX_DEVIATION)
    };
}

/**
 * Rates both sides of a single game at once, using each player's pre-game
 * rating as the other's opponent. Rating both from the same snapshot keeps the
 * update order-independent.
 */
export function rateGame(
    white: Rating,
    black: Rating,
    result: "white_win" | "black_win" | "draw",
    tau: number = TAU
): { white: Rating; black: Rating } {
    const whiteScore: Score = result === "white_win" ? 1 : result === "black_win" ? 0 : 0.5;
    const blackScore: Score = whiteScore === 1 ? 0 : whiteScore === 0 ? 1 : 0.5;

    return {
        white: rate(white, [{ opponent: black, score: whiteScore }], tau),
        black: rate(black, [{ opponent: white, score: blackScore }], tau)
    };
}

/**
 * Conservative public rating: the bottom of the 95% confidence interval. A
 * provisional player with a huge RD ranks below an established player of the
 * same nominal rating, which is what you want on a leaderboard.
 */
export const conservativeRating = (r: Rating): number => r.rating - 2 * r.deviation;

/** True while the rating is too uncertain to display without a "?" marker. */
export const isProvisional = (r: Rating): boolean => r.deviation > 110;

const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);
