# Chess Application

Real-time multiplayer chess with a server-authoritative game engine, Glicko-2
ratings, rating-banded matchmaking, and post-game analysis powered by Stockfish.

## Architecture

A pnpm/Turborepo monorepo. Three runnable services and seven shared packages.

```
apps/
  web                 React 19 + Vite client (board, chat, analysis)
  ws-backend          WebSocket game server — owns all game state and rules
  api-backend         Express REST/SSE API — auth, profiles, game analysis
  dashboard-frontend  (scaffold, not yet implemented)

packages/
  db        Drizzle ORM schema + migrations (PostgreSQL / Neon)
  auth      JWT signing, verification and refresh; password hashing
  engine    Stockfish UCI client and game analysis
  rating    Glicko-2 rating engine
  redis     Optional cross-instance pub/sub
  types     Shared types and time-control definitions
  utils     Shared helpers
```

### Where the rules live

The WebSocket server is the only authority on a game. It validates every move
with `chess.js` before broadcasting, owns both clocks, and decides every
terminal condition. A client may render a move optimistically, but the server's
broadcast is what counts — a rejected move is rolled back on the client.

Two properties follow from that and are worth stating explicitly:

- **Identity comes from the socket, never the payload.** `ws.userId` is set once,
  after the access token is verified, and every handler reads it from there. A
  user id in a message body is ignored.
- **The clock runs server-side.** A timer is armed for whoever is on move and
  fires at flag-fall, so a player who simply stops moving still loses on time.

### Game lifecycle

`concludeGame` is the single exit point for every way a game can end —
checkmate, resignation, timeout, draw agreement, or any of the automatic draws.
It persists the result, applies rating changes, writes the PGN, broadcasts to
both players and spectators, and releases the in-memory state. It is idempotent,
so a resignation racing a flag-fall cannot double-rate a game.

In-progress games are rehydrated from the database at boot and on reconnect, so
a restart does not abandon games that are mid-play.

### Analysis

Analysis runs in two stages and streams over Server-Sent Events:

1. **Stockfish** evaluates every position and produces the numbers: per-move
   centipawn evaluations, blunder/mistake/inaccuracy classification, and an
   accuracy percentage per player.
2. **Gemini** is handed those numbers and asked only to explain them in prose.

The split is deliberate. Language models are unreliable at evaluating chess
positions, so the engine owns every judgement and the model never invents an
evaluation. If the commentary call fails, the engine analysis has already
reached the client, so the feature degrades rather than failing.

## Getting started

Requires Node 20.19+ or 22.12+, and pnpm 9.

```sh
pnpm install
pnpm build          # shared packages must be built before apps typecheck
pnpm dev            # runs every app
```

### Environment

Create a `.env` at the repo root:

```sh
DATABASE_URL=postgres://...          # required
ACCESS_TOKEN_SECRET_KEY=...          # required — startup fails without it
REFRESH_TOKEN_SECRET_KEY=...         # required
GEMINI_API_KEY=...                   # optional; without it analysis returns
                                     # engine numbers but no written commentary
REDIS_URL=...                        # optional; enables multi-node fanout
CORS_ORIGINS=https://your.app        # required in production
TRUST_PROXY=1                        # hops of reverse proxy to trust
ANALYSIS_DEPTH=12                    # engine depth, clamped to 6–18
```

Both token secrets are validated at startup rather than at first login — an
unset secret previously surfaced as a random 500 during authentication.

### Database

```sh
pnpm --filter @repo/db db:migrate
```

> **Note:** `drizzle-kit generate` currently requires interactive input because
> the `0000` snapshot names its enums `timeControlEnum`/`gameStatusEnum` while
> `schema/enums.ts` declares `time_control_enum`/`game_status_enum`. That drift
> predates the Glicko-2 migration (`0001`), which is hand-written for that
> reason. Resolving the enum naming would let generation run clean again.

## Verification

```sh
pnpm test           # 111 tests
pnpm check-types
pnpm lint
```

The engine package includes integration tests that run the real Stockfish
binary against a known game and assert the losing move is flagged as a blunder.
The rating package checks its Glicko-2 implementation against the worked
example in Glickman's specification.

CI runs build, typecheck, lint and test on every push and pull request.

## Scaling

A single node keeps games in memory and needs nothing else. Setting `REDIS_URL`
turns on cross-instance fanout: every outbound game message is published with
its recipient list, so players connected to different nodes still see each
other's moves. With no Redis configured both the publisher and subscriber are
no-ops and behaviour is identical to a single node.
