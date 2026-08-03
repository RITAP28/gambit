import jwt from "jsonwebtoken";
import { db, eq, sessions } from "@repo/db";
import { getRefreshTokenSecret } from "../constants";
import { AuthError } from "../errors";
import { assertAuthPayload, type AuthPayload } from "../types";

export interface RefreshResult {
    payload: AuthPayload;
    accessToken: string;
}

/**
 * Exchanges a valid refresh token for a fresh access token.
 *
 * Three bugs previously lived here and are called out because each one is easy
 * to reintroduce:
 *  - the session was looked up by `accessToken` even though a refresh token was
 *    passed in, so the lookup never matched;
 *  - the new access token was signed with the *refresh* secret, so nothing that
 *    validated it with the access secret would accept it;
 *  - the session UPDATE had no WHERE clause, so refreshing one user's token
 *    rewrote the access token of every user in the table.
 */
export async function refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
    if (!refreshToken) {
        throw new AuthError("REFRESH_TOKEN_EXPIRED_OR_INVALID", "no refresh token supplied");
    }

    let payload: AuthPayload;
    try {
        payload = assertAuthPayload(jwt.verify(refreshToken, getRefreshTokenSecret()));
    } catch {
        throw new AuthError("REFRESH_TOKEN_EXPIRED_OR_INVALID");
    }

    // The token must correspond to a live session; a signed-out user's token is
    // no longer good even while it is still cryptographically valid.
    const [session] = await db
        .select()
        .from(sessions)
        .where(eq(sessions.refreshToken, refreshToken));

    if (!session) {
        throw new AuthError("SESSION_NOT_FOUND");
    }

    if (session.expiresAt && new Date() > new Date(session.expiresAt)) {
        throw new AuthError("REFRESH_TOKEN_EXPIRED_OR_INVALID", "session expired");
    }

    const { signAccessToken } = await import("./sign");
    const accessToken = signAccessToken(payload.userId);

    await db
        .update(sessions)
        .set({ accessToken })
        .where(eq(sessions.userId, payload.userId));

    return { payload, accessToken };
}
