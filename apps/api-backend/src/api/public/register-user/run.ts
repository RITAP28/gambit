import { sendResponse } from "@repo/utils/src";
import { Request, Response } from "express";
import { accessTokenExpiry, getExistingUser, hashPassword, refreshTokenExpiry, registerErrors, registerUserInputSchema } from "./constants";
import { db, users } from "@repo/db";
import backendConfig from "../../../infra/activeconfig";
import { accessTokenGenerator, refreshTokenGenerator } from "../../../utils/token.generator";
import { saveSession } from "../../../utils/save.session";
import { authProvider } from "@repo/types/src/index";

export const run = async (req: Request, res: Response) => {
    const validation = registerUserInputSchema.safeParse(req.body.data);
    if (!validation.success) return sendResponse(res, 400, false, validation.error.message);

    const { name, email, password } = validation.data;
    if (!name || !email || !password) return sendResponse(res, 400, false, registerErrors.MISSING_FIELDS);

    try {
        const existingUser = await getExistingUser(email);
        if (existingUser) return sendResponse(res, 409, false, registerErrors.USER_EXISTS);

        const hashedPassword = await hashPassword(password);

        // isVerified: false --> user needs to do email verification via link in the email
        const newUser = {
            username: name as string,
            email: email as string,
            passwordHash: hashedPassword,
            authProvider: authProvider.CREDENTIALS as "credentials",
            isAuthenticated: true,
            isOnline: true,
            lastSeenAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const newUserDB = (await db.insert(users).values(newUser).returning())[0];
        if (!newUserDB.id) return sendResponse(res, 500, false, registerErrors.USER_CREATE_FAILED);

        // generate tokens
        const accessToken = accessTokenGenerator(newUserDB.id);
        const refreshToken = refreshTokenGenerator(newUserDB.id);

        // Save session
        const savedSession = await saveSession(newUserDB.id, accessToken, refreshToken);
        if (!savedSession) return sendResponse(res, 500, false, registerErrors.SESSION_FAILED);

        // setting tokens in cookies
        if (accessTokenExpiry && refreshTokenExpiry) {
            // console.log("in here!, max age is: ", ACCESS_TOKEN_EXPIRY);
            res.cookie("accessToken", accessToken, {
                httpOnly: true,
                secure: backendConfig.ENV === "production",
                maxAge: Number(accessTokenExpiry) || 1000 * 60 * 30,
                sameSite: "strict",
                path: "/",
            });

            res.cookie("refreshToken", refreshToken, {
                httpOnly: true,
                secure: backendConfig.ENV === "production",
                maxAge: Number(refreshTokenExpiry) || 1000 * 60 * 60 * 24 * 14,
                sameSite: "strict",
                path: "/",
            });
        } else {
            return sendResponse(res, 500, false, registerErrors.TOKEN_CONFIG_MISSING);
        };

        // console.log("user registered successfully");
        return sendResponse(res, 201, true, "user registered successfully", {
            user: {
                id: newUserDB.id,
                name: newUserDB.username,
                email: newUserDB.email,
                isAuthenticated: newUserDB.isAuthenticated,
            },
            accessToken: accessToken
        });
    } catch (error) {
        return sendResponse(res, 500, false, registerErrors.INTERNAL_ERROR);
    }

}