import { WebSocketServer } from "ws";

import config from "./infrastructure/activeconfig";
import { handleConnection, startHeartbeat } from "./connection";
import { onFlagFall } from "./clock";
import { concludeOnFlag } from "./services/gameConclusion.service";
import { rehydrateAllActiveGames } from "./services/game.service";
import { startCrossInstanceRelay } from "./utils/broadcastToGame";
import { activeGames, AuthedSocket } from "./state";

// Game state lives in ./state so that importing it does not start a server.
export * from "./state";

const port = Number(config.PORT) || 8080;

// Wire the clock to the game-conclusion logic. Injected here rather than
// imported inside ./clock so the timer module stays dependency-free.
onFlagFall((game, flaggedColor) => {
    void concludeOnFlag(game, flaggedColor);
});

const wss = new WebSocketServer({ port });
wss.on("connection", handleConnection);

const stopHeartbeat = startHeartbeat(() => wss.clients as Set<AuthedSocket>);

console.log(`WS server running on port ${port}`);

// Games that were in flight when this process last stopped are restored rather
// than abandoned.
void rehydrateAllActiveGames().then((count) => {
    if (count > 0) console.log(`[boot] restored ${count} in-progress game(s)`);
});

// No-op unless REDIS_URL is configured.
void startCrossInstanceRelay();

function shutdown(signal: string): void {
    console.log(`[shutdown] received ${signal}, closing server`);
    stopHeartbeat();

    for (const game of activeGames.values()) {
        if (game.flagTimer) clearTimeout(game.flagTimer);
    }

    wss.close(() => process.exit(0));

    // Do not let a stuck socket hold the process open indefinitely.
    setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
