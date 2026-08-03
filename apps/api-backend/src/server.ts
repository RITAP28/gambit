import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { testDatabaseConnection } from '@repo/db';
import { apiRouter } from './routes/api.router';
import backendConfig from './infra/activeconfig';
import { analysisLimiter, authLimiter, globalLimiter } from './middlewares/rateLimit.middleware';

const app = express();
const port = backendConfig.PORT ?? 7070;
const isProduction = backendConfig.ENV === 'production';

const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'];

/**
 * In production the allowlist comes from CORS_ORIGINS. Starting with none
 * configured would reject every browser request, so fail fast rather than
 * shipping an API nothing can talk to.
 */
const allowedOrigins = isProduction ? backendConfig.CORS_ORIGINS : DEV_ORIGINS;

if (isProduction && allowedOrigins.length === 0) {
    throw new Error('[api] CORS_ORIGINS must be set in production');
}

// Rate limiting keys on client IP, which is only meaningful if we know how many
// proxies sit in front of us. Trusting blindly would let a client spoof its IP
// with an X-Forwarded-For header.
app.set('trust proxy', backendConfig.TRUST_PROXY);

app.use(express.json({ limit: '1mb' }));
app.use(
    cors({
        origin(origin, callback) {
            // Same-origin and non-browser callers send no Origin header.
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error('Not allowed by CORS'));
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['X-New-Access-Token'],
        credentials: true
    })
);
app.use(cookieParser());

app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
    next();
});

app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Ordered cheapest-to-strictest: the global backstop sheds floods before the
// action-specific limiters do any work.
app.use('/api', globalLimiter, authLimiter, analysisLimiter, apiRouter);

// Final safety net so an unhandled throw returns JSON rather than an HTML stack.
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[api] unhandled error:', error);
    if (res.headersSent) return;
    res.status(500).json({ status: 500, success: false, message: 'Internal Server Error' });
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(port, async () => {
        try {
            console.log(`server listening on port ${port}`);
            const isDBConnected = await testDatabaseConnection();

            if (isDBConnected) {
                console.log('server & database are ready');
            } else {
                console.error('server started but database connection failed');
            }
        } catch (error) {
            console.error('error connecting to server: ', error);
        }
    });
}

export { app };
