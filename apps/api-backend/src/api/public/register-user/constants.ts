import { db, users } from "@repo/db";
import { eq } from "drizzle-orm";
import { z } from 'zod';
import * as bcrypt from 'bcrypt'
import backendConfig from "../../../infra/activeconfig";

export const accessTokenExpiry = backendConfig.ACCESS_TOKEN_EXPIRY_TIME;
export const refreshTokenExpiry = backendConfig.REFRESH_TOKEN_EXPIRY_TIME;

export const registerErrors = {
    MISSING_FIELDS: "All fields are required",
    INVALID_EMAIL: "Invalid email format",
    USER_EXISTS: "User already exists",
    USER_CREATE_FAILED: "failed while creating user",
    SESSION_FAILED: "failed while creating a session",
    TOKEN_CONFIG_MISSING: "token expiration configuration missing",
    INTERNAL_ERROR: "Internal Server Error"
};

export const registerUserInputSchema = z.object({
    name: z
        .string()
        .trim()
        .min(3, { error: 'Name must be at least 3 characters long' })
        .max(50, { error: 'Name cannot exceed 50 characters' })
        .regex(/^[a-zA-Z\s]+$/, { error: 'Name can only contain letters and spaces' }),
    email: z
        .email({ error: 'Invalid email format' }),
    password: z
        .string()
        .min(8, { error: 'Password must be at least 8 characters long' })
        .max(100, { error: 'Password cannot contain more than 100 characters' })
        .regex(/[A-Z]/, { error: 'Password must contain at least one uppercase letter' })
        .regex(/[a-z]/, { error: 'Password must contain at least one lowercase letter' })
        .regex(/[0-9]/, { error: 'Password must contain at least one number' })
});

export const getExistingUser = async (email: string) => {
    const existingUser = (await db.select().from(users).where(eq(users.email, email)))[0];
    return existingUser;
}

export const hashPassword = async (pwd: string) => {
    const hashedPwd = await bcrypt.hash(pwd, 12);
    return hashedPwd;
}