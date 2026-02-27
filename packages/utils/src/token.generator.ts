import * as jwt from "@repo/api/node_modules/jsonwebtoken";
import "dotenv/config";
import config from "@repo/api/src/infrastructure/activeconfig";

const accessTokenKey = config.ACCESS_TOKEN_SECRET_KEY;
const refreshTokenKey = config.REFRESH_TOKEN_SECRET_KEY;

// VALIDATING WHETHER ACCESS TOKEN AND REFRESH TOKEN ARE ACTUALLY PRESENT
if (!accessTokenKey || !refreshTokenKey) {
  throw new Error("Missing JWT secret keys in environment variables");
}

export const accessTokenGenerator = (userId: string) => {
  const expiryTime = Number(config.ACCESS_TOKEN_EXPIRY_TIME) || 1800;
  const accessToken = jwt.sign({ userId: userId }, accessTokenKey, {
    expiresIn: expiryTime,
  });
  console.log("access token generated: ", accessToken);
  return accessToken;
};

export const refreshTokenGenerator = (userId: string) => {
  const expiryTime = Number(config.REFRESH_TOKEN_EXPIRY_TIME) || 1209600;
  const refreshToken = jwt.sign({ userId: userId }, refreshTokenKey, {
    expiresIn: expiryTime,
  });
  console.log("refresh token generated: ", refreshToken);
  return refreshToken;
};