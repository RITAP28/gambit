import "dotenv/config";

/**
 * Reads a required secret, failing loudly rather than at the first login.
 *
 * `jsonwebtoken` throws an opaque error when handed `undefined`, so an unset
 * secret used to surface as a random 500 during authentication instead of an
 * obvious misconfiguration.
 */
function requireSecret(name: string): string {
    const value = process.env[name];
    if (!value || value.length === 0) {
        throw new Error(
            `[auth] ${name} is not set. Refusing to issue tokens with an unusable secret.`
        );
    }
    return value;
}

export const getAccessTokenSecret = (): string => requireSecret("ACCESS_TOKEN_SECRET_KEY");
export const getRefreshTokenSecret = (): string => requireSecret("REFRESH_TOKEN_SECRET_KEY");

/** Short-lived: a leaked access token stops working quickly. */
export const ACCESS_TOKEN_TTL = "30m";

/** Long-lived: this is what keeps a user signed in across sessions. */
export const REFRESH_TOKEN_TTL = "14d";
