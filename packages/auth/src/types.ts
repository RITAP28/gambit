import type { JwtPayload } from "jsonwebtoken";

export interface AuthPayload extends JwtPayload {
    userId: string;
}

export interface VerifiedAccess {
    payload: AuthPayload;
    /** Set when the access token was expired and has been silently renewed. */
    newAccessToken?: string;
}

/** Narrows an arbitrary decoded JWT to our payload shape. */
export function assertAuthPayload(decoded: unknown): AuthPayload {
    if (!decoded || typeof decoded !== "object") {
        throw new Error("Invalid token payload");
    }
    if (!("userId" in decoded) || typeof (decoded as AuthPayload).userId !== "string") {
        throw new Error("Token payload missing userId");
    }
    return decoded as AuthPayload;
}
