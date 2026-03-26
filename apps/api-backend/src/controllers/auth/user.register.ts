import { Request, Response } from "express";
import validator from 'validator';
import { eq } from "drizzle-orm";
import bcrypt from 'bcrypt';
import { sendResponse } from "@repo/utils/src/index";
import { authProvider } from '../../../../../packages/types/src/index'
import { db, users } from "@repo/db";
import backendConfig from "../../infra/activeconfig";
import { accessTokenGenerator, refreshTokenGenerator } from "../../utils/token.generator";
import { saveSession } from "../../utils/save.session";

const ACCESS_TOKEN_EXPIRY = backendConfig.ACCESS_TOKEN_EXPIRY_TIME;
const REFRESH_TOKEN_EXPIRY = backendConfig.REFRESH_TOKEN_EXPIRY_TIME;

export const register = async (req: Request, res: Response) => {
    try {
        const { name, email, password } = req.body;

        // input validation
        if (!name || !email || !password) return sendResponse(res, 400, false, "All fields are required");
        if (!validator.isEmail(email)) return sendResponse(res, 400, false, "Invalid email format");
        
        const existingUser = (await db.select().from(users).where(eq(users.email, email)))[0];
        if (existingUser) return sendResponse(res, 409, false, "User already exists");

        const hashedPassword = await bcrypt.hash(password, 12);

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
        if (!newUserDB.id) return sendResponse(res, 500, false, "failed while creating user");

        // generate tokens
        const accessToken = accessTokenGenerator(newUserDB.id);
        const refreshToken = refreshTokenGenerator(newUserDB.id);

        // Save session
        const savedSession = await saveSession(newUserDB.id, accessToken, refreshToken);
        if (!savedSession) return sendResponse(res, 500, false, "failed while creating a session");

        // setting tokens in cookies
        if (ACCESS_TOKEN_EXPIRY && REFRESH_TOKEN_EXPIRY) {
            // console.log("in here!, max age is: ", ACCESS_TOKEN_EXPIRY);
            res.cookie("accessToken", accessToken, {
                httpOnly: true,
                secure: backendConfig.ENV === "production",
                maxAge: Number(ACCESS_TOKEN_EXPIRY) || 1000 * 60 * 30,
                sameSite: "strict",
                path: "/",
            });

            res.cookie("refreshToken", refreshToken, {
                httpOnly: true,
                secure: backendConfig.ENV === "production",
                maxAge: Number(REFRESH_TOKEN_EXPIRY) || 1000 * 60 * 60 * 24 * 14,
                sameSite: "strict",
                path: "/",
            });
        } else {
            return sendResponse(res, 500, false, "token expiration configuration missing");
        };

        // console.log("user registered successfully");
        return sendResponse(res, 201, true, "user registered successfully", {
            user: {
                id: newUserDB.id,
                username: newUserDB.username,
                email: newUserDB.email,
                isAuthenticated: newUserDB.isAuthenticated,
            },
            accessToken: accessToken
        });
    } catch (error) {
        console.error("Registration error: ", error);
        return sendResponse(res, 500, false, "Internal Server Error");
    }
}