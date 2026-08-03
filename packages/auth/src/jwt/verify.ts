import jwt, { TokenExpiredError } from "jsonwebtoken";
import { getAccessTokenSecret } from "../constants";
import { AuthError } from "../errors";
import { assertAuthPayload, type VerifiedAccess } from "../types";
import { refreshAccessToken } from "./refresh";

/**
 * Verifies an access token, transparently renewing it from the refresh token
 * when it has merely expired.
 *
 * The returned payload always describes the *authenticated* user — callers bind
 * that id to the connection rather than trusting any id supplied alongside it.
 */
export async function verifyAccessToken(
    accessToken: string,
    refreshToken: string
): Promise<VerifiedAccess> {
    try {
        return { payload: assertAuthPayload(jwt.verify(accessToken, getAccessTokenSecret())) };
    } catch (error) {
        // Only an expiry is recoverable. A malformed or forged token is not.
        if (!(error instanceof TokenExpiredError)) {
            throw new AuthError("ACCESS_TOKEN_INVALID");
        }
    }

    const refreshed = await refreshAccessToken(refreshToken);

    return {
        payload: refreshed.payload,
        newAccessToken: refreshed.accessToken
    };
}
