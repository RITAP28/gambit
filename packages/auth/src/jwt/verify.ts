import { JwtPayload, TokenExpiredError, verify } from "jsonwebtoken" 
import { ACCESS_TOKEN_SECRET_KEY } from "@repo/utils/src/index"
import { refreshAccessToken } from "./refresh";

interface AuthPayload extends JwtPayload {
    userId: string;
}

// Modified to accept both tokens from the client
export async function verifyAccessToken(accessToken: string, refreshToken: string): Promise<{ payload: AuthPayload; newAccessToken?: string }> {
    try {
        // 1. Try verifying the Access Token first
        const decoded = verify(accessToken, ACCESS_TOKEN_SECRET_KEY) as any;
        return { payload: decoded as AuthPayload };

    } catch (error: any) {
        // 2. If Access Token is expired, attempt to use the Refresh Token
        if (error instanceof TokenExpiredError) {
            console.log("Access token expired, attempting refresh...");
            
            try {
                // This calls your existing logic to validate the Refresh Token and return a new Access Token
                const result = await refreshAccessToken(refreshToken); 
                
                // Return the new token along with the payload so the WebSocket can send it back to the UI
                return {
                    payload: result as AuthPayload,
                    newAccessToken: result.accessToken
                };
            } catch (refreshError) {
                throw new Error("REFRESH_TOKEN_EXPIRED_OR_INVALID");
            }
        }
        
        throw new Error("Authentication failed");
    }
}