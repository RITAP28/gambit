import 'dotenv/config'
//
const backendConfig = {
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

    // gemini api key
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,

    /**
     * Comma-separated list of browser origins allowed to call the API.
     * Required in production — the previous hard-coded empty list meant every
     * cross-origin request was rejected once NODE_ENV became "production".
     */
    CORS_ORIGINS: (process.env.CORS_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),

    /** Hops of reverse proxy to trust for client IPs (rate limiting). */
    TRUST_PROXY: Number(process.env.TRUST_PROXY ?? 0),

    /** Depth of engine search per position when analysing a game. */
    ANALYSIS_DEPTH: Number(process.env.ANALYSIS_DEPTH ?? 12)
}

export default backendConfig;