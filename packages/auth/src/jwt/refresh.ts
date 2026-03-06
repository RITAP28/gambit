import * as jwt from "jsonwebtoken"
import { db, sessions } from "../../../db/src"
import { eq } from 'drizzle-orm';
import { REFRESH_TOKEN_SECRET_KEY } from "@repo/utils/src";

export const refreshAccessToken = async (token: string) => {
    try {
        const session = await db.select().from(sessions).where(eq(sessions.accessToken, token));
        const refreshToken = session[0].refreshToken;

        // validating the refresh token i.e., checking whether the refresh token has expired or not
        const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET_KEY);
        console.log('refresh token decoded: ', decoded);

        // necessary validations/checks
        if (!decoded || typeof decoded !== "object") throw new Error("Invalid token payload");
        if (!("userId" in decoded)) throw new Error("Token payload missing userId");
        if (typeof decoded.userId !== 'string') throw new Error("Invalid userId in token");

        const accessToken = jwt.sign({ userId: decoded.userId }, REFRESH_TOKEN_SECRET_KEY, {
            expiresIn: "30m"
        });

        const updatedSession = await db.update(sessions).set({ accessToken: accessToken }).returning();
        return updatedSession[0];
    } catch (error) {
        console.error('error while refreshing access token: ', error);
        throw new Error('error while refreshing access token');
    }
}