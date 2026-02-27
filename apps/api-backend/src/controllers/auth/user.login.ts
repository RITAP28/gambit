import { Request, Response } from "express";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import validator from "validator";
import { db, users } from "@repo/db";
import config from "../../infrastructure/activeconfig";
import rateLimit from 'express-rate-limit';
import { sendResponse, accessTokenGenerator, refreshTokenGenerator, saveSession } from "@repo/utils/src/index";

// Configure rate limiting for login attempts
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per windowMs
  message: "Too many login attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  try {
    // Input validation
    if (!email || !password) return sendResponse(res, 400, false, "Email and password are required");
    if (!validator.isEmail(email)) return sendResponse(res, 400, false, "Invalid email format");

    // Find user by email
    const existingUser = (
      await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1)
    )[0];

    console.log("existing user: ", existingUser);

    if (!existingUser) {
      return sendResponse(res, 401, false, "Invalid credentials");
    }

    // Check if user is blocked or locked
    if (existingUser.isAuthenticated === false) {
      return sendResponse(res, 403, false, "Account is not authenticated");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      password,
      existingUser.passwordHash as string
    );
    if (!isPasswordValid) {
      return sendResponse(res, 401, false, "Invalid credentials");
    }

    // Generate new tokens
    const accessToken = accessTokenGenerator(existingUser.id);
    const refreshToken = refreshTokenGenerator(existingUser.id);

    console.log("access token: ", accessToken);
    console.log("refresh token: ", refreshToken);

    // Save session
    const savedSession = await saveSession(
      existingUser.id,
      accessToken,
      refreshToken
    );

    if (!savedSession) {
      return sendResponse(res, 500, false, "Failed to create session");
    }

    console.log("expiry saved in db: ", savedSession.expiresAt);

    // Set secure cookies
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: (Number(config.ACCESS_TOKEN_EXPIRY_TIME) || 1800) * 1000, // Convert to milliseconds
      sameSite: "strict",
      path: "/",
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: (Number(config.REFRESH_TOKEN_EXPIRY_TIME) || 1209600) * 1000, // Convert to milliseconds
      sameSite: "strict",
      path: "/",
    });

    // Return success response without sensitive data
    return sendResponse(res, 200, true, "Login successful", {
      user: {
        id: existingUser.id,
        name: existingUser.username,
        email: existingUser.email,
        isAuthenticated: existingUser.isAuthenticated,
      },
      accessToken: savedSession.accessToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    return sendResponse(res, 500, false, "Internal server error");
  }
};