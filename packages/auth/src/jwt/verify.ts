import { JwtPayload, verify } from "jsonwebtoken" 
import { ACCESS_TOKEN_SECRET_KEY } from "@repo/utils/src/index"

interface AuthPayload extends JwtPayload {
    userId: string;
}

export function verifyAccessToken(token: string): AuthPayload {
    console.log('ACCESS_TOKEN_SECRET_KEY: ', ACCESS_TOKEN_SECRET_KEY);
    if (!token || typeof token !== 'string') throw new Error("Token missing or malformed");

    try {
        const decoded = verify(token, ACCESS_TOKEN_SECRET_KEY);
        console.log('decoded in websocket: ', decoded)

        // necessary validations/checks 
        if (!decoded || typeof decoded !== "object") throw new Error("Invalid token payload");
        if (!("userId" in decoded)) throw new Error("Token payload missing userId");
        if (typeof decoded.userId !== 'string') throw new Error("Invalid userId in token");

        return decoded as AuthPayload;
    } catch (error: any) {
        if (error.name === "TokenExpiredError") throw new Error("Token expired");
        if (error.name === "JsonWebTokenError") throw new Error("Invalid token");

        throw new Error("Authentication failed");
    }
}