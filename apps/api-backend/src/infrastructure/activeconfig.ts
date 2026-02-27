
const config = {
    PORT: 7070,
    ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,

    // token secrets for both access token and refresh token
    ACCESS_TOKEN_SECRET_KEY: process.env.ACCESS_TOKEN_SECRET_KEY as string,
    ACCESS_TOKEN_EXPIRY_TIME: process.env.ACCESS_TOKEN_EXPIRY_TIME,
    REFRESH_TOKEN_SECRET_KEY: process.env.REFRESH_TOKEN_SECRET_KEY as string,
    REFRESH_TOKEN_EXPIRY_TIME: process.env.REFRESH_TOKEN_EXPIRY_TIME,
    ACCESS_GENERATE_TOKEN: process.env.ACCESS_GENERATE_TOKEN,
    REFRESH_GENERATE_TOKEN: process.env.REFRESH_GENERATE_TOKEN,
    REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY,
}

export default config;