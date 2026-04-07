# TattleTale Backend Rewrite: Cloudflare Workers + Durable Objects

**Date**: 2026-04-07
**Branch**: `rewriteBackend`
**Status**: Design approved, pending implementation plan

## Motivation

Replace the current Fastify + Socket.IO + Prisma/Postgres + Redis backend with Cloudflare Workers + Durable Objects + D1. Primary driver: **cost and simplicity** -- eliminate server management (OCI VM, Redis, process managers) and move to a fully managed edge platform with a generous free tier.

## Architecture Overview

```
Cloudflare Edge
+-------------------------------------------------------+
|                                                        |
|  Worker (Hono router)       GameRoomDO (per lobby)     |
|  +-----------------+       +------------------------+  |
|  | GET  /health    |------>| Lobby state            |  |
|  | GET  /ready     |       | Game state machine     |  |
|  | POST /api/lobby |       | Hibernatable WS conns  |  |
|  | GET  /api/../ws |       | DO transactional store  |  |
|  | Store routes    |       | alarm() phase timers   |  |
|  +-----------------+       +------------------------+  |
|         |                           |                  |
|         v                           v                  |
|  +-------------+            +-------------+            |
|  | D1 Database |<-----------| Audit writes |           |
|  +-------------+                                       |
+-------------------------------------------------------+
```

**Three components:**

1. **Worker (Hono router)** -- Stateless entry point. Handles HTTP requests (health, store, lobby creation) and upgrades WebSocket connections. Routes WS connections to the correct GameRoomDO by lobby code. Queries D1 for audit/store data.

2. **GameRoomDO** -- One instance per active game room. Manages the full lifecycle: lobby -> game -> completion. Holds all player WebSocket connections via the Hibernatable WebSocket API. Uses DO transactional storage for game state durability. Uses `alarm()` for phase timers.

3. **D1 Database** -- SQLite-based, native to CF. Stores completed game records, session audit events, message audit events, and installed app data. Replaces both Neon Postgres (audit trail) and Redis (app store).

## Durable Object Architecture: Single DO Per Game

One `GameRoomDO` class handles both lobby and game phases. Each lobby code maps to one DO instance. This was chosen over separate Lobby/Game DOs (WebSocket migration complexity) and per-player DOs (over-engineered for 7-20 players).

**Rationale:** The game lifecycle is sequential (lobby -> game -> end). All WebSocket connections for a game live in the same DO instance, making broadcasting a simple loop. The 128MB memory limit per DO is irrelevant for 20 players.

## WebSocket Message Protocol

Replaces Socket.IO with a typed JSON protocol over raw WebSockets.

### Message Envelope

```typescript
// Client -> Server
type ClientMessage = {
  type: string;       // e.g. "createLobby", "submitIntent"
  seq: number;        // Client sequence number for ack correlation
  payload: unknown;   // Type-specific data
};

// Server -> Client
type ServerMessage = {
  type: string;       // e.g. "lobbyState", "error", "ack"
  ref?: number;       // Echoes client seq for request/response correlation
  payload: unknown;
};
```

### Message Types

**HTTP (handled by Worker router):**

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/lobby/create` | Create new lobby. Returns lobby code. |

**WebSocket (handled by GameRoomDO):**

| Direction | Type | Description |
|-----------|------|-------------|
| C -> S | `joinLobby` | Join existing lobby (display name) |
| C -> S | `rejoinLobby` | Reconnect (playerId + reconnectToken) |
| C -> S | `kickPlayer` | Host kicks player |
| C -> S | `startGame` | Host starts game |
| C -> S | `submitIntent` | Submit vote, night action, or message |
| S -> C | `ack` | Acknowledges client request (ref = seq) |
| S -> C | `lobbyState` | Full lobby state broadcast |
| S -> C | `sessionState` | Full game session state broadcast |
| S -> C | `error` | Error response (ref = seq, code + message) |

### Reconnection

The client wrapper handles reconnection with exponential backoff. On reconnect, sends `rejoinLobby` with `playerId` + `reconnectToken`. The DO reattaches the new WebSocket to the existing player state.

### Broadcasting

Socket.IO room broadcasting is replaced by iterating over connected WebSockets in the DO and filtering by recipient (all players, channel members, single player). No external pub/sub needed.

## GameRoomDO Internal Structure

### State Management

```
GameRoomDO
  this.state.storage (DO transactional storage - persistent)
    "lobby"          -> LobbyState
    "game"           -> GameState
    "players:{id}"   -> reconnect tokens, metadata

  In-memory cache (hydrated on first request, written back on mutation)
    lobbyState: LobbyState
    gameState: GameState | null

  WebSocket connections (Hibernatable WS API)
    Map<WebSocket, { playerId, tags[] }>

  alarm() - one active phase timer at a time
```

### Lifecycle

1. **Lobby phase**: Worker receives HTTP `POST /api/lobby/create` -> gets DO stub by lobby code -> DO initializes lobby state. Players connect via WebSocket upgrade routed to the same DO.

2. **Game start**: Host sends `startGame` -> DO calls `initializeSessionRuntime()` (existing domain logic) -> sets first `alarm()` for day phase timer -> broadcasts `sessionState`.

3. **During game**: Players send `submitIntent` -> DO calls `appendIntent()` / `reconcileSessionRuntime()` (existing domain logic) -> broadcasts updated state -> persists to DO storage.

4. **Phase transitions**: `alarm()` fires -> DO advances phase -> sets next alarm -> broadcasts new state.

5. **Game end**: Win condition detected -> DO writes audit records to D1 -> broadcasts final state -> closes connections after delay.

### Domain Logic Preservation

The existing domain layer is preserved:
- `domain/game/types.ts` -- GameState, PlayerState types (unchanged)
- `domain/game/runtime-domain.ts` -- initializeSessionRuntime, appendIntent, reconcileSessionRuntime (unchanged)
- `domain/game/session-domain.ts` -- processElimination, isIntentAllowedInPhase (unchanged)
- `domain/lobby/types.ts` -- LobbyState, LobbySettings types (unchanged)

Infrastructure adapters change:
- `RuntimeRepository` gets a DO-storage-backed implementation (replaces Redis)
- `GameAuditRepository` gets a D1-backed implementation (replaces Prisma/Postgres)
- Socket event handlers from `register-foundation-namespace.ts` move into the DO's `webSocketMessage()` handler

## D1 Database Schema

Replaces Prisma + Neon Postgres. Uses Drizzle ORM for typed schema definitions and migrations.

```sql
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  lobby_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  phase TEXT NOT NULL DEFAULT 'day_open',
  cycle INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  settings TEXT NOT NULL  -- JSON blob
);

CREATE TABLE game_players (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  team TEXT NOT NULL,
  alive INTEGER NOT NULL DEFAULT 1,
  eliminated_cycle INTEGER,
  eliminated_phase TEXT
);

CREATE TABLE session_audit_events (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,  -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE message_audit_events (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  delivered_content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE installed_apps (
  device_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (device_id, app_id)
);
```

### Two-Tier Storage

- **DO storage**: Hot game state during active gameplay (fast reads/writes)
- **D1**: Cold audit data (queryable after game ends), installed apps

## Frontend Changes

Minimal. Only the networking layer changes.

### Client WebSocket Wrapper

Located in `packages/shared/src/ws-client.ts`:

```typescript
class GameSocket {
  connect(url: string): void;
  send<T>(type: string, payload: T): Promise<ServerMessage>;
  on(type: string, handler: (payload) => void): void;
  off(type: string, handler: (payload) => void): void;
  close(): void;
  // Auto-reconnect with exponential backoff
  // Sends rejoinLobby on reconnect if reconnectToken stored
}
```

### Migration from Socket.IO

- Replace `socket.io-client` with `GameSocket` from shared package
- `socket.emit("event", data)` -> `gameSocket.send("event", data)`
- `socket.on("event", handler)` -> `gameSocket.on("event", handler)`
- Connection URL: `ws://localhost:8787/api/lobby/{code}/ws` (wrangler dev)

### Unchanged

- All React components, Zustand stores, mini-games, theming
- Shared types/enums (Phase, Team, IntentType, etc.)
- View contracts (LobbyView, SessionView) -- same shape, different transport

## Project Structure

```
apps/server/
  src/
    index.ts                      # Worker entry point (Hono app)
    router.ts                     # HTTP routes
    durable-objects/
      game-room.ts                # GameRoomDO class
    domain/                       # PRESERVED
      game/
        types.ts
        runtime-domain.ts
        session-domain.ts
      lobby/
        types.ts
    persistence/
      do-runtime-repo.ts          # DO storage RuntimeRepository impl
      d1-audit-repo.ts            # D1 GameAuditRepository impl
    transport/
      ws-message-handler.ts       # Message type -> domain function routing
    config/
      env.ts                      # CF bindings type definition
  drizzle/
    schema.ts                     # Drizzle schema definition
    migrations/                   # Generated SQL migrations
  wrangler.toml
  package.json
  tsconfig.json
  vitest.config.ts
```

### Wrangler Configuration

```toml
name = "tattletale-server"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[durable_objects]
bindings = [
  { name = "GAME_ROOM", class_name = "GameRoomDO" }
]

[[d1_databases]]
binding = "DB"
database_name = "tattletale"
database_id = "<generated on wrangler d1 create>"

[[migrations]]
tag = "v1"
new_classes = ["GameRoomDO"]
```

### Dependencies

**Removed:** `fastify`, `@fastify/cors`, `socket.io`, `prisma`, `@prisma/client`, `ioredis`

**Added:** `hono`, `drizzle-orm`, `drizzle-kit` (dev), `@cloudflare/workers-types` (dev)

### Dev Commands

| Old | New |
|-----|-----|
| `tsx watch src/index.ts` | `wrangler dev` |
| `prisma migrate dev` | `wrangler d1 migrations apply tattletale --local` |
| `prisma generate` | `npx drizzle-kit generate` |
| Redis + Postgres required | Nothing required (local D1 = SQLite file, local DO = in-memory) |

## Error Handling

- **WebSocket errors**: `webSocketMessage()` wraps each message in try/catch. Validation failures (Zod) return `{type: "error", ref, payload: {code, message}}`. Domain errors return structured error codes.
- **DO crashes**: CF auto-restarts the DO. State rehydrates from DO storage. On wake, DO checks if a game is active and restores the `alarm()` for the current phase timer.
- **Client disconnection**: `webSocketClose()` marks player as disconnected. Reconnection window uses existing `reconnectToken` pattern.

## Testing Strategy

- **Unit tests (Vitest)**: Domain logic -- pure functions, tested directly. Same tests as current.
- **Integration tests (Vitest + Miniflare)**: DO lifecycle -- create lobby, join players, start game, submit intents, verify state transitions. Miniflare provides in-memory DO environment.
- **WebSocket protocol tests**: Connect to local wrangler dev, send raw WS messages, verify responses.

## Deployment

- `wrangler deploy` -- deploys Worker + DO + D1 migrations to CF edge
- CORS: Hono middleware, origin configured via `wrangler.toml` vars or CF secrets
- Environment variables: `[vars]` in wrangler.toml (non-secrets), `wrangler secret put` (secrets)
- Free `*.workers.dev` subdomain provided; custom domain optional

### Free Tier Limits

| Resource | Limit | Relevance |
|----------|-------|-----------|
| Workers requests | 100K/day | Far exceeds game traffic |
| Worker CPU | 10ms/request | Typical handler uses <1ms |
| DO requests | 1M/month | WS messages count; sufficient for dev/small scale |
| DO storage | 1GB | Game state is tiny |
| D1 reads | 5M/day | Audit queries are infrequent |
| D1 writes | 100K/day | Audit writes during games only |
| D1 storage | 5GB | More than enough for game history |
