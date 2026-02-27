import { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import config from "../infrastructure/activeconfig";
import { db } from "@repo/db";
import { sessions } from "@repo/db/src/schema/session";
import { sendResponse } from '@repo/utils/src/index';
import { fetchUserSession } from '@repo/utils/src/db.queries';

dotenv.config();

export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.params.userId as string;
    const accessTokenSecretKey = config.ACCESS_TOKEN_SECRET_KEY;
    const refreshTokenSecretKey = config.REFRESH_TOKEN_SECRET_KEY;

    if (!accessTokenSecretKey || !refreshTokenSecretKey) {
      return sendResponse(res, 500, false, "Server configuration error");
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return sendResponse(res, 401, false, "Authorization header is required");
    }

    // console.log("auth header: ", authHeader);
    // Check if the token format is correct
    if (!authHeader.startsWith("Bearer ")) {
      return sendResponse(res, 401, false, "Invalid token format");
    }

    const token = authHeader.split(" ")[1] || req.cookies.accessToken as string;
    if (!token) {
      return sendResponse(res, 401, false, "Token is required");
    }

    // Fetch user session
    const userSession = await fetchUserSession(userId);
    if (!userSession) {
      return sendResponse(res, 401, false, "Session not found");
    }
    const refreshTokenExpiry = userSession.expiresAt?.toISOString();
    if (!refreshTokenExpiry) {
      return;
    }
    
    // Check if refresh token is expired
    if (new Date() > new Date(userSession.expiresAt)) {
      console.log("user session: ", userSession);
      console.log("date now: ", new Date());
      console.log("Session expired");
      return sendResponse(res, 403, false, "Session expired. Please log in again");
    }

    // Verify access token
    jwt.verify(token, accessTokenSecretKey, async (err, decoded) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          // console.error("access token expired error");
          // Attempt to refresh the access token
          try {
            const refreshToken = userSession.refreshToken;
            // console.log("refresh token: ", refreshToken);
            if (!refreshToken) {
              return sendResponse(res, 403, false, "Refresh token not found");
            }

            // Verify refresh token
            jwt.verify(
              refreshToken,
              refreshTokenSecretKey,
              async (refreshErr, refreshDecoded) => {
                if (refreshErr) {
                  // console.log("Refresh token invalid or expired");
                  return sendResponse(res, 403, false, "Refresh token invalid or expired");
                }

                // Generate new access token
                const newAccessToken = jwt.sign(
                  { userId: (refreshDecoded as any).userId },
                  accessTokenSecretKey,
                  { expiresIn: Number(config.ACCESS_TOKEN_EXPIRY_TIME) || 1800 }
                );

                // Update session with new access token
                await db
                  .update(sessions)
                  .set({ accessToken: newAccessToken })
                  .where(eq(sessions.userId, userId as string));
                
                // Set new access token in response header
                res.setHeader("X-New-Access-Token", newAccessToken);
                (req as any).user = refreshDecoded;
                next();
              }
            );
          } catch (error) {
            return sendResponse(res, 500, false, "Error refreshing token");
          }
        } else {
          return sendResponse(res, 401, false, "Invalid token");
        }
      } else {
        // Token is valid
        const jwtUserId = (decoded as any).userId;
        const paramUserId = req.params.userId;

        if (jwtUserId !== paramUserId) {
          return sendResponse(res, 403, false, "User ID mismatch");
        }

        (req as any).user = decoded;
        console.log('passed all middleware checks successfully!');
        console.log('decoded user from token: ', decoded);
        next();
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, "Internal server error");
  }
};