import { db, users } from "@repo/db";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import * as bcrypt from 'bcrypt';
import z from "zod";

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: "Too many login attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginErrors = {
    MISSING_FIELDS: "All fields are required",
    INVALID_EMAIL: "Invalid email format",
    INVALID_CREDENTIALS: "Invalid credentials",
    UNAUTHENTICATED_ACCOUNT: "Account is not authenticated",
    SESSION_FAILED: "failed while creating a session",
    INTERNAL_ERROR: "Internal Server Error",
    INVALID_VALIDATION: "Login validation failed"
};

export const getExistingUser = async (email: string) => {
    const existingUser = (await db.select().from(users).where(eq(users.email, email)))[0];
    return existingUser;
};

export const comparePasswords = async (pwd: string, hashedPwd: string) => {
    const value = await bcrypt.compare(pwd, hashedPwd);
    return value;
}

export const loginUserInputSchema = z.object({
    email: z.email({ error: 'Invalid email format' }),
    password: z
        .string()
        .min(8, { error: 'Password must be at least 8 characters long' })
        .max(100, { error: 'Password cannot contain more than 100 characters' })
        .regex(/[A-Z]/, { error: 'Password must contain at least one uppercase letter' })
        .regex(/[a-z]/, { error: 'Password must contain at least one lowercase letter' })
        .regex(/[0-9]/, { error: 'Password must contain at least one number' })
})