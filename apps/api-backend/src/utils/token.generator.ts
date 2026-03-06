import * as jwt from 'jsonwebtoken';
import "dotenv/config";
import backendConfig from '../infra/activeconfig';

const accessTokenKey = backendConfig.ACCESS_TOKEN_SECRET_KEY;
const refreshTokenKey = backendConfig.REFRESH_TOKEN_SECRET_KEY;

console.log('access token key: ', accessTokenKey);
console.log('access token key: ', refreshTokenKey);

// VALIDATING WHETHER ACCESS TOKEN AND REFRESH TOKEN ARE ACTUALLY PRESENT
if (!accessTokenKey || !refreshTokenKey) {
  throw new Error("Missing JWT secret keys in environment variables");
}

export const accessTokenGenerator = (userId: string) => {
  const expiryTime = Number(backendConfig.ACCESS_TOKEN_EXPIRY_TIME) || 1800;
  const accessToken = jwt.sign({ userId: userId }, accessTokenKey, {
    expiresIn: expiryTime,
  });
  // console.log("access token generated: ", accessToken);
  return accessToken;
};

export const refreshTokenGenerator = (userId: string) => {
  const expiryTime = Number(backendConfig.REFRESH_TOKEN_EXPIRY_TIME) || 1209600;
  const refreshToken = jwt.sign({ userId: userId }, refreshTokenKey, {
    expiresIn: expiryTime,
  });
  // console.log("refresh token generated: ", refreshToken);
  return refreshToken;
};

