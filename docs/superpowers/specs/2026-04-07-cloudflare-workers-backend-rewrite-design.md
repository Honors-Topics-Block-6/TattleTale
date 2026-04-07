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
type ClientMessageType = 'joinLobby' | 'rejoinLobby' | 'kickPlayer' | 'startGame' | 'submitIntent';

type ClientMessage<T extends ClientMessageType = ClientMessageType> = {
  type: T;
  seq: number;        // Monotonically increasing per connection, for ack correlation
  payload: ClientPayloadMap[T];
};

// Server -> Client
type ServerMessageType = 'ack' | 'lobbyState' | 'sessionState' | 'error' | 'kicked';

type ServerMessage<T extends ServerMessageType = ServerMessageType> = {
  type: T;
  ref?: number;       // Echoes client seq for request-response correlation (absent on pushes)
  payload: ServerPayloadMap[T];
};
```

### HTTP Endpoints (Worker Router)

| Method | Route | Request Body | Response |
|--------|-------|-------------|----------|
| POST | `/api/lobby/create` | `{ displayName: string, settings?: Partial<LobbySettingsView> }` | `{ lobbyCode: string, wsUrl: string }` |
| GET | `/health` | -- | `{ status: "ok", timestamp: string }` |
| GET | `/ready` | -- | `{ d1: "ok" \| "error" }` |
| GET | `/store/installed-apps?deviceId=<uuid>` | -- | `{ apps: string[] }` |
| POST | `/store/install` | `{ deviceId: string, appId: string }` | `{ ok: true }` |

Lobby creation is HTTP-only. The response includes the `wsUrl` the client uses to open a WebSocket to the correct DO.

### WebSocket Messages (GameRoomDO)

**Client -> Server payloads** (each validated with Zod on receipt):

```typescript
// joinLobby - first message after WS connect for new players
{ displayName: string }

// rejoinLobby - first message after WS connect for reconnecting players
{ playerId: string, reconnectToken: string }

// kickPlayer - host only
{ targetPlayerId: string }

// startGame - host only
{ } // empty payload; identity comes from the authenticated WS connection

// submitIntent - during game phases
{
  intent: {
    type: IntentType;                            // SUBMIT_VOTE | SUBMIT_NIGHT_ACTION | SEND_MESSAGE
    payload: VotePayload | NightActionPayload | MessagePayload;
    clientTimestamp: string;                      // ISO 8601, for audit only (server is authoritative)
  }
}

// where:
type VotePayload       = { targetPlayerId: string | null };
type NightActionPayload = { actionType: string, targetPlayerId?: string | null, metadata?: Record<string, unknown> };
type MessagePayload     = { channelId: string, content: string };
```

**Server -> Client payloads:**

```typescript
// ack - confirms a client command succeeded
{ data?: LobbyCommandSuccess | StartGameSuccess | SubmitIntentSuccess }

// lobbyState - broadcast to all connected players after lobby mutations
LobbyView  // same shape as current shared contract

// sessionState - broadcast PER-PLAYER after game state mutations (see Per-Player State Filtering)
PlayerSessionView  // filtered view, NOT the raw SessionView

// error - command failed
{ code: string, message: string }

// kicked - sent to a player before their WS is closed
{ reason: string }
```

Note: `playerId` and `reconnectToken` are NOT sent in every WebSocket message (unlike the current Socket.IO protocol where every command includes credentials). Instead, the DO tags the WebSocket with the player's identity on `joinLobby`/`rejoinLobby` and uses that tag for all subsequent messages. This eliminates credential repetition and prevents a class of impersonation bugs.

### Message Ordering and Idempotency

**Ordering:** Messages within a single WebSocket connection are processed in order (guaranteed by the WebSocket protocol and DO single-threaded execution). No out-of-order delivery is possible.

**Idempotency for intents:** The `submitIntent` handler is idempotent within a (playerId, cycle, phase, intentType) tuple. If a player submits a vote twice in the same phase, the second submission replaces the first (last-write-wins). This matches the current behavior and prevents double-vote bugs on reconnection.

**Stale message rejection:** If a `submitIntent` arrives for a phase/cycle that has already advanced (e.g., the alarm fired between the client sending and the DO receiving), the DO returns an error with code `PHASE_EXPIRED`. The client should treat this as a no-op and wait for the new `sessionState` push.

**Duplicate ack safety:** If the client retransmits a message with the same `seq` (e.g., after a reconnect where the ack was lost), the DO does not track seq history. Instead, the idempotency of domain operations (last-write-wins for intents, no-op for duplicate joins) makes retransmission safe at the application level.

### Per-Player State Filtering (Information Contract)

This is a hidden-information game. The server MUST NOT broadcast the same state to all players. Each player receives a `PlayerSessionView` filtered to only information they are allowed to know.

```typescript
interface PlayerSessionView {
  gameId: string;
  lobbyCode: string;
  status: SessionStatus;
  phase: Phase;
  cycle: number;
  currentPhaseEndsAt: string | null;

  // All players are visible (name, alive, connected) but NOT their role or team
  players: SessionPlayerView[];

  // Only channels this player is a member of
  // Hackers see the hacker role channel; friends do not
  channels: ChannelView[];

  // Only this player's own pending intent types
  myPendingIntentTypes: IntentType[];

  // System events visible to this player (some are role-specific)
  systemEvents: SystemEventView[];

  // This player's own role and team (never broadcast to others)
  myRole: string;
  myTeam: Team;
}
```

The `toPlayerSessionView(gameState, playerId)` projection function filters:
- **Channels**: Only channels where `members.includes(playerId)`. This prevents friends from seeing the hacker role channel's existence or membership.
- **Pending intents**: Only the requesting player's own pending intent types. Other players' pending actions are hidden.
- **System events**: Events are filtered by visibility rules per event type (e.g., `PSYCHIC_SIGNAL_RECEIVED` is only visible to the psychic).
- **Role/team**: Each player receives only their own `myRole` and `myTeam`. Other players' roles and teams are never included.

This replaces the current `toSessionView()` which broadcasts an unfiltered view to all players -- a hidden-information leak that exists in the current codebase.

### Reconnection

The client wrapper handles reconnection with exponential backoff (initial 1s, max 30s, jitter). On reconnect, the client opens a new WebSocket to the same DO URL and sends `rejoinLobby` as its first message. The DO:

1. Validates the `reconnectToken` (see Reconnection Security below)
2. Detaches any stale WebSocket for this playerId (calls `.close()` on the old one)
3. Tags the new WebSocket with the player's identity
4. Sends the current state (`lobbyState` or `sessionState`) as the first response

The client discards any pending ack callbacks from the previous connection and re-derives its local state from the full state push. This is a **full resync**, not incremental.

### Broadcasting

Socket.IO room broadcasting is replaced by iterating over connected WebSockets in the DO and filtering by recipient. Since all connections for a game live in the same DO, broadcasting is a `for` loop:

```
broadcast(state):
  for each connected WebSocket ws:
    playerId = ws.deserializeAttachment().playerId
    filteredView = toPlayerSessionView(state, playerId)
    ws.send(JSON.stringify({ type: "sessionState", payload: filteredView }))
```

No external pub/sub or Redis adapter needed.

## GameRoomDO Internal Structure

### State Management

```
GameRoomDO
  this.state.storage (DO transactional storage - persistent)
    "lobby"          -> LobbyState
    "game"           -> GameState
    "players:{id}"   -> { reconnectToken, tokenIssuedAt, kickedAt? }
    "phaseDeadline"  -> { phase: Phase, cycle: number, deadlineMs: number } | null

  In-memory cache (hydrated on first request, written back on mutation)
    lobbyState: LobbyState
    gameState: GameState | null

  WebSocket connections (Hibernatable WS API)
    ws.serializeAttachment({ playerId }) per connection

  alarm() - one active phase timer at a time
```

### Phase Timer Persistence and Alarm Restoration

Phase timers are the most critical timing mechanism in the game. The DO persists timer state explicitly:

```typescript
interface PersistedPhaseDeadline {
  phase: Phase;         // Which phase this deadline is for
  cycle: number;        // Which cycle
  deadlineMs: number;   // Absolute timestamp (Date.now() + duration)
}
```

**Setting a timer:** When the game enters a new phase, the DO:
1. Computes `deadlineMs = Date.now() + phaseDurationSeconds * 1000`
2. Writes `{ phase, cycle, deadlineMs }` to DO storage key `"phaseDeadline"` atomically with the game state update
3. Calls `this.state.storage.setAlarm(deadlineMs)`
4. Updates `gameState.timers.currentPhaseEndsAt` (ISO string of deadlineMs, sent to clients)

**Alarm fires (`alarm()`):** The DO:
1. Reads `"phaseDeadline"` from storage
2. Verifies it matches the current game phase/cycle (guards against stale alarms)
3. Calls domain logic to advance the phase
4. Sets the next alarm for the new phase
5. Broadcasts updated per-player state

**DO wake after hibernation or restart:** When the DO wakes (from a WebSocket message or any request), the constructor/initialization path:
1. Reads `"phaseDeadline"` from storage
2. If a deadline exists and `deadlineMs` is in the future, calls `this.state.storage.setAlarm(deadlineMs)` to ensure the alarm is registered (alarms survive hibernation but this is defensive)
3. If `deadlineMs` is in the past (DO was hibernated through a deadline), immediately processes the phase transition as if the alarm just fired, then sets the next alarm

This guarantees phase timers are never lost, even across DO restarts or extended hibernation periods. The persisted `deadlineMs` is the source of truth, not the alarm itself.

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

New domain code:
- `domain/projections.ts` -- `toLobbyView()` is preserved as-is. `toSessionView()` is replaced by `toPlayerSessionView(gameState, playerId)` which filters channels, intents, system events, and injects `myRole`/`myTeam` for the requesting player (see Per-Player State Filtering).

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

The UI layer (React components, Zustand stores, mini-games, theming) is unchanged. However, replacing Socket.IO with raw WebSockets is a **non-trivial transport migration** that touches connection management, acknowledgment handling, reconnection logic, and state resynchronization. This section specifies exactly what changes and why.

### What Changes

1. **Connection lifecycle** -- Socket.IO manages connection, upgrade, heartbeats, and auto-reconnect internally. Raw WebSockets require all of this to be explicit in our client wrapper. The wrapper must handle: initial connect, exponential backoff reconnect (1s initial, 30s max, with jitter), connection state events (`connecting`, `connected`, `disconnected`, `reconnecting`), and WebSocket close codes.

2. **Acknowledgment handling** -- Socket.IO's `emit(event, data, callback)` provides built-in request-response semantics. Our wrapper replaces this with a `send()` that returns a `Promise<ServerMessage>`, correlating responses via `seq`/`ref`. Pending promises must be tracked and rejected on disconnect (with an error the caller can distinguish from a server error).

3. **Reconnection and resync** -- Socket.IO auto-reconnects and re-emits missed events. Our wrapper must: reconnect with exponential backoff, send `rejoinLobby` as the first message on reconnection, handle token rotation (store the new token from the ack), reject all pending promises from the previous connection, and treat the first `lobbyState` or `sessionState` push as a full resync that replaces local state. Components consuming game state (via Zustand) must tolerate a full state replacement rather than incremental updates.

4. **Lobby creation flow** -- Currently the client does `socket.emit("createLobby", ...)` over WebSocket. Now it's a two-step process: HTTP `POST /api/lobby/create` returns a lobby code + WS URL, then the client opens a WebSocket to that URL. The Lobby component needs to handle this sequential flow.

5. **Session view shape change** -- The server now sends `PlayerSessionView` (per-player filtered) instead of `SessionView` (global). The frontend gains `myRole`, `myTeam`, and `myPendingIntentTypes` fields and loses visibility into other players' channels and intents. Zustand stores and any components that read these fields need updating.

### What Does NOT Change

- All React components, Zustand stores, mini-games, theming (except networking hooks)
- Shared types/enums (Phase, Team, IntentType, etc.)
- View contracts (LobbyView shape is unchanged; SessionView is replaced by PlayerSessionView which is a strict superset minus the fields that were leaking hidden info)

### Client WebSocket Wrapper

Located in `apps/web/src/lib/game-socket.ts` (client-only; NOT in shared package since it depends on the browser WebSocket API):

```typescript
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

class GameSocket {
  // Connection
  connect(url: string): void;
  close(): void;
  get state(): ConnectionState;

  // Request-response (returns Promise that resolves on ack or rejects on error/disconnect)
  send<T>(type: string, payload: T): Promise<ServerMessage>;

  // Server push listeners
  on(type: string, handler: (payload: unknown) => void): void;
  off(type: string, handler: (payload: unknown) => void): void;

  // Connection state listeners
  onStateChange(handler: (state: ConnectionState) => void): void;

  // Reconnection credentials (set after joinLobby/rejoinLobby ack)
  setCredentials(playerId: string, reconnectToken: string): void;
  clearCredentials(): void;
}
```

The shared package (`packages/shared`) exports the **message type definitions and Zod schemas** (so both client and server validate the same shapes), but NOT the WebSocket client class itself.

### Migration Scope Summary

| Area | Effort | Notes |
|------|--------|-------|
| GameSocket wrapper | New code | ~200-300 lines; core of the transport migration |
| Lobby creation flow | Moderate | HTTP POST + WS connect replaces single socket.emit |
| Reconnection logic | Moderate | Full resync model replaces Socket.IO's incremental approach |
| Zustand store updates | Small | Adopt PlayerSessionView shape, add myRole/myTeam |
| Component updates | Small | Replace socket.emit calls with gameSocket.send |
| Pending request handling | Small | Callers must handle promise rejection on disconnect |

## Project Structure

```
apps/server/
  src/
    index.ts                      # Worker entry point (Hono app + DO export)
    router.ts                     # HTTP routes (health, store, lobby create)
    durable-objects/
      game-room.ts                # GameRoomDO class (lifecycle, WS handlers, alarm)
    domain/                       # PRESERVED (with projections updated)
      game/
        types.ts                  # GameState, PlayerState (unchanged)
        runtime-domain.ts         # initializeSessionRuntime, appendIntent, etc (unchanged)
        session-domain.ts         # processElimination, isIntentAllowedInPhase (unchanged)
      lobby/
        types.ts                  # LobbyState, LobbySettings (unchanged)
      projections.ts              # toLobbyView (unchanged), toPlayerSessionView (new)
    persistence/
      do-runtime-repo.ts          # DO storage RuntimeRepository impl
      d1-audit-repo.ts            # D1 GameAuditRepository impl
    transport/
      ws-message-handler.ts       # Message type -> domain function routing
      ws-schemas.ts               # Zod schemas for all client/server message payloads
    config/
      env.ts                      # CF bindings type definition (Env interface)
  drizzle/
    schema.ts                     # Drizzle schema definition
    migrations/                   # Generated SQL migrations
  wrangler.toml
  package.json
  tsconfig.json
  vitest.config.ts

apps/web/
  src/
    lib/
      game-socket.ts              # NEW: GameSocket wrapper (connect, send, reconnect)

packages/shared/
  src/
    contracts/
      messages.ts                 # NEW: ClientMessage, ServerMessage types + Zod schemas
      views.ts                    # UPDATED: add PlayerSessionView (replaces SessionView for WS)
      commands.ts                 # REMOVED (commands are now message payloads in messages.ts)
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

## Reconnection Security

Reconnect tokens prevent unauthorized players from hijacking a disconnected player's session. The current codebase uses tokens but does not define their lifecycle. This spec makes it explicit.

### Token Lifecycle

**Issuance:** A reconnect token (cryptographically random, 32 bytes hex-encoded) is generated when a player joins the lobby (`joinLobby`). The token and its issuance timestamp are stored in DO storage at `players:{playerId}`.

**Rotation:** The token is rotated (replaced with a new random token) on every successful `rejoinLobby`. The old token is immediately invalidated. The client receives the new token in the `ack` response and must use it for any future reconnection. This limits the window of exposure if a token is intercepted.

**Expiry:** Tokens expire after **10 minutes** of disconnection. The DO tracks `lastDisconnectedAt` per player. On `rejoinLobby`, the DO checks `Date.now() - lastDisconnectedAt < 600_000`. If expired, the reconnection is rejected with `TOKEN_EXPIRED` and the player is treated as having left.

**Invalidation on kick:** When a player is kicked (`kickPlayer`), the DO:
1. Sets `kickedAt` on the player's storage record
2. Closes the player's WebSocket with code `4001` (custom close code for "kicked")
3. The `rejoinLobby` handler checks for `kickedAt` and rejects with `PLAYER_KICKED` regardless of token validity

**Invalidation on game end:** All tokens are invalidated when the game ends (DO clears player storage records). No reconnection is possible after game completion.

### Token Storage

```typescript
// DO storage key: "players:{playerId}"
interface PlayerConnectionRecord {
  reconnectToken: string;       // 32 bytes hex
  tokenIssuedAt: number;        // Date.now() when token was created/rotated
  lastDisconnectedAt?: number;  // Date.now() when webSocketClose fired
  kickedAt?: number;            // Date.now() when kicked, if applicable
}
```

### Client-Side Token Handling

The `GameSocket` wrapper stores the current `playerId` and `reconnectToken` in memory (not localStorage -- tokens are session-scoped). On reconnect, the wrapper automatically sends `rejoinLobby` with the stored credentials. If the server responds with `TOKEN_EXPIRED` or `PLAYER_KICKED`, the wrapper emits a `"kicked"` or `"expired"` event to the application layer, which should navigate the user back to the lobby screen.

## Error Handling

- **WebSocket errors**: `webSocketMessage()` wraps each message in try/catch. Validation failures (Zod) return `{type: "error", ref, payload: {code, message}}`. Domain errors return structured error codes matching the existing error code set: `LOBBY_NOT_FOUND`, `LOBBY_FULL`, `GAME_ALREADY_STARTED`, `NOT_HOST`, `PHASE_EXPIRED`, `INTENT_NOT_ALLOWED`, etc.
- **DO crashes**: CF auto-restarts the DO. State rehydrates from DO storage. Phase timer is restored from the persisted `phaseDeadline` record (see Phase Timer Persistence above). If the deadline passed during the crash, the missed phase transition is processed immediately on wake.
- **Client disconnection**: `webSocketClose()` marks the player as disconnected in game state and records `lastDisconnectedAt` in the player's connection record. The 10-minute reconnection window begins.
- **Malformed messages**: Messages that fail JSON parse or Zod validation are rejected with `{type: "error", payload: {code: "INVALID_MESSAGE"}}`. The WebSocket is NOT closed -- clients may send a corrected message.
- **Unauthenticated messages**: If a WebSocket sends any message other than `joinLobby` or `rejoinLobby` before authenticating, the DO responds with `{type: "error", payload: {code: "NOT_AUTHENTICATED"}}` and closes the WebSocket after a short delay.

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
