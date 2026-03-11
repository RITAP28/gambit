import { fetchUserSession, sendResponse } from "@repo/utils/src";
import { Request, Response } from "express"
import backendConfig from "../../../infra/activeconfig";
import * as jwt from 'jsonwebtoken';

interface AuthRequest extends Request {
    user?: {
        id: string;
    }
}

export const run = async (req: AuthRequest, res: Response) => {
    const userId = req.body.data.userId;
    if (!userId) return sendResponse(res, 400, false, 'user id is required');

    console.log('userId received from the client: ', userId);

    const accessTokenSecretKey = backendConfig.ACCESS_TOKEN_SECRET_KEY;
    const refreshTokenSecretKey = backendConfig.REFRESH_TOKEN_SECRET_KEY;

    if (!accessTokenSecretKey || !refreshTokenSecretKey) return sendResponse(res, 500, false, 'server configuration error');

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return sendResponse(res, 401, false, 'authorization header is required');
        if (!authHeader.startsWith("Bearer ")) return sendResponse(res, 401, false, 'invalid token format');

        console.log('auth header: ', authHeader);

        const token = authHeader.split(" ")[1] || (req.cookies.accessToken as string);
        if (!token) return sendResponse(res, 401, false, 'access token is required');

        console.log('token received from the auth header: ', token)

        const userSession = await fetchUserSession(userId);
        if (!userSession) return sendResponse(res, 401, false, 'session not found');
        console.log('user session: ', userSession);

        const refreshTokenExpiry = userSession.expiresAt?.toISOString();
        if (!refreshTokenExpiry) return;

        if (new Date() > new Date(userSession.expiresAt)) return sendResponse(res, 403, false, 'session expired. please log in again.');

        try {
            const decoded: any = jwt.verify(token, accessTokenSecretKey);
            console.log('decoded object from the jsonwebtoken: ', decoded);
            if (decoded.userId !== userId) return sendResponse(res, 403, false, 'user ID mismatch');

            req.user = {
                id: decoded.userId
            };

            return sendResponse(res, 200, true, 'tokens approved', {
                accessToken: token
            });
        } catch (error) {
            if (error.name === jwt.TokenExpiredError) {
                try {
                    console.log('decrypting refresh token');

                    const refreshToken = userSession.refreshToken;
                    if (!refreshToken) return sendResponse(res, 403, false, 'refresh token not found');

                    // verifying refresh token
                    const refreshTokenDecoded: any = jwt.verify(refreshToken, refreshTokenSecretKey);
                    if (typeof refreshTokenDecoded !== 'object') return sendResponse(res, 400, false, 'decoded information shall be in the form of an object');

                    const newAccessToken = jwt.sign({ userId: userId }, accessTokenSecretKey, { expiresIn: "30m" });

                    // attaching decoded information to the request
                    req.user = refreshTokenDecoded;

                    res.setHeader("X-New-Access-Token", newAccessToken);
                    return sendResponse(res, 200, true, 'tokens approved', {
                        accessToken: newAccessToken
                    });
                } catch (refreshError) {
                    return sendResponse(res, 403, false, 'refresh token invalid or expired');
                }
            };

            console.log('error: ', error);
            return sendResponse(res, 401, false, 'invalid access token');
        };
    } catch (error) {
        console.error('auth middleware error: ', error);
        return sendResponse(res, 500, false, 'internal server error');    
    }
};