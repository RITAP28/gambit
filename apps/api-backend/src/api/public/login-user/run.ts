import { sendResponse } from "@repo/utils/src";
import { Request, Response } from "express";
import { comparePasswords, getExistingUser, loginErrors, loginUserInputSchema } from "./constants";
import { accessTokenGenerator, refreshTokenGenerator } from "../../../utils/token.generator";
import backendConfig from "../../../infra/activeconfig";
import { saveSession } from "../../../utils/save.session";

export const run = async (req: Request, res: Response): Promise<void> => {
  const validation = loginUserInputSchema.safeParse(req.body.data)
  if (!validation.success) return sendResponse(res, 400, false, loginErrors.INVALID_VALIDATION);

  const { email, password } = validation.data;
  try {
    // Find user by email
    const existingUser = await getExistingUser(email)
    if (!existingUser) return sendResponse(res, 401, false, loginErrors.INVALID_CREDENTIALS);
    if (existingUser.isAuthenticated === false) return sendResponse(res, 403, false, loginErrors.UNAUTHENTICATED_ACCOUNT);

    // Verify password
    const isPasswordValid = await comparePasswords(password, existingUser.passwordHash);
    if (!isPasswordValid) return sendResponse(res, 401, false, loginErrors.INVALID_CREDENTIALS);

    // Generate new tokens
    const accessToken = accessTokenGenerator(existingUser.id);
    const refreshToken = refreshTokenGenerator(existingUser.id);

    console.log("access token: ", accessToken);
    console.log("refresh token: ", refreshToken);

    // Save session
    const savedSession = await saveSession(existingUser.id, accessToken, refreshToken);
    if (!savedSession) return sendResponse(res, 500, false, loginErrors.SESSION_FAILED);

    console.log("expiry saved in db: ", savedSession.expiresAt);

    // Set secure cookies
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: (Number(backendConfig.ACCESS_TOKEN_EXPIRY_TIME) || 1800) * 1000, // Convert to milliseconds
      sameSite: "strict",
      path: "/",
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: (Number(backendConfig.REFRESH_TOKEN_EXPIRY_TIME) || 1209600) * 1000, // Convert to milliseconds
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
    return sendResponse(res, 500, false, loginErrors.INTERNAL_ERROR);
  }
};