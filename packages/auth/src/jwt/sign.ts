import jwt from "jsonwebtoken";
import {
    ACCESS_TOKEN_TTL,
    getAccessTokenSecret,
    getRefreshTokenSecret,
    REFRESH_TOKEN_TTL
} from "../constants";

export const signAccessToken = (userId: string): string =>
    jwt.sign({ userId }, getAccessTokenSecret(), { expiresIn: ACCESS_TOKEN_TTL });

export const signRefreshToken = (userId: string): string =>
    jwt.sign({ userId }, getRefreshTokenSecret(), { expiresIn: REFRESH_TOKEN_TTL });
