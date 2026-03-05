import express from 'express';
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { testDatabaseConnection } from '@repo/db'
import { apiRouter } from './routes/api.router';
import backendConfig from './infra/activeconfig';

const app = express();
const port = backendConfig.PORT ?? 7070;
const nodeEnv = backendConfig.ENV;

app.use(express.json({ limit: "10mb" }));
app.use(
  cors({
    origin(origin, callback) {
      const allowedOrigins =
        nodeEnv === "production" ? [] : ["http://localhost:5173"]

      if (!origin || allowedOrigins.includes(origin as string)) {
        callback(null, true);
      } else {
        callback(new Error("NOT allowed by cors"));
      }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}))
app.use(cookieParser());

app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
    next();
});

// routes
app.use('/api', apiRouter)

app.listen(port, async () => {
    try {
      console.log(`server listening on port ${port}`)
      const isDBConnected = await testDatabaseConnection()

      if (isDBConnected) {
        console.log('server & database are ready')
      } else {
        console.error('server started but database/redis connection failed')
      }
    } catch (error) {
        console.error('error connecting to server: ', error)
    }
})