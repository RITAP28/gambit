export type AuthErrorCode =
    | "ACCESS_TOKEN_INVALID"
    | "REFRESH_TOKEN_EXPIRED_OR_INVALID"
    | "SESSION_NOT_FOUND"
    | "AUTHENTICATION_FAILED";

/**
 * Carries a stable machine-readable code so callers can tell "log in again"
 * apart from "retry" without string-matching on messages.
 */
export class AuthError extends Error {
    constructor(
        readonly code: AuthErrorCode,
        message?: string
    ) {
        super(message ?? code);
        this.name = "AuthError";
    }
}
