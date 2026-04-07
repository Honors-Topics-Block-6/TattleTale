# Cloudflare Workers Backend Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Fastify + Socket.IO + Prisma/Postgres + Redis backend with Cloudflare Workers + Durable Objects + D1, preserving all domain logic.

**Architecture:** A Hono-based Worker handles HTTP routes and upgrades WebSocket connections to a single `GameRoomDO` Durable Object per game room. The DO manages the full lobby-to-game lifecycle using the Hibernatable WebSocket API and `alarm()` for phase timers. D1 (SQLite) replaces Postgres for audit data. Domain logic (`runtime-domain.ts`, `session-domain.ts`) is preserved unchanged.

**Tech Stack:** Cloudflare Workers, Durable Objects, D1, Hono, Drizzle ORM, Zod, Vitest + Miniflare

**Spec:** `docs/superpowers/specs/2026-04-07-cloudflare-workers-backend-rewrite-design.md`

**Known limitations (intentional):**
- `SEND_MESSAGE` intent type returns `NOT_IMPLEMENTED` (matches existing codebase — message channel system is a future feature)
- System event visibility filtering in `toPlayerSessionView` broadcasts all events to all players (role-specific filtering like `PSYCHIC_SIGNAL_RECEIVED` requires the role system to be fully implemented first)

---

## File Map

### Files to CREATE

```
apps/server/wrangler.toml                         # CF Workers config
apps/server/src/index.ts                           # Worker entry (Hono + DO export) - REPLACES old
apps/server/src/router.ts                          # HTTP routes (health, store, lobby)
apps/server/src/config/env.ts                      # CF Env bindings type - REPLACES old
apps/server/src/durable-objects/game-room.ts       # GameRoomDO class
apps/server/src/persistence/do-runtime-repo.ts     # DO storage wrapper
apps/server/src/persistence/d1-audit-repo.ts       # D1 audit repository
apps/server/src/transport/ws-schemas.ts            # Zod schemas for WS messages
apps/server/src/transport/ws-message-handler.ts    # Message routing to domain functions
apps/server/drizzle/schema.ts                      # Drizzle D1 schema
apps/server/drizzle.config.ts                      # Drizzle Kit config
packages/shared/src/contracts/messages.ts          # WS protocol types
apps/web/src/lib/game-socket.ts                    # Client WebSocket wrapper
```

### Files to MODIFY

```
apps/server/package.json                           # Swap dependencies
apps/server/tsconfig.json                          # Target for CF Workers
apps/server/vitest.config.ts                       # Add miniflare pool (if exists, else create)
apps/server/src/domain/projections.ts              # Add toPlayerSessionView
apps/server/src/domain/repositories.ts             # Remove socket presence methods
packages/shared/src/contracts/views.ts             # Add PlayerSessionView
packages/shared/src/protocol.ts                    # Export messages
packages/shared/package.json                       # Add zod dependency
apps/web/src/os/store/storeApi.js                  # Update server URL comment (already uses env)
```

### Files to PRESERVE (no changes)

```
apps/server/src/domain/game/types.ts
apps/server/src/domain/game/runtime-domain.ts
apps/server/src/domain/game/session-domain.ts
apps/server/src/domain/lobby/types.ts
apps/server/src/domain/lobby/lobby-code.ts
apps/server/src/domain/errors.ts
apps/server/src/domain/game/runtime-domain.test.ts
```

### Files to DELETE (Task 14)

```
apps/server/src/app.ts
apps/server/src/app.test.ts
apps/server/src/infra/                             # Entire directory
apps/server/src/transport/http/                     # Entire directory
apps/server/src/transport/socket/                   # Entire directory (including test)
apps/server/prisma/                                 # Entire directory
```

---

## Task 1: Scaffold CF Worker Project

**Files:**
- Rewrite: `apps/server/package.json`
- Rewrite: `apps/server/tsconfig.json`
- Create: `apps/server/wrangler.toml`

This task swaps the Node.js/Fastify toolchain for CF Workers. After this, `npx wrangler dev` starts a minimal worker.

- [ ] **Step 1: Rewrite `apps/server/package.json`**

```json
{
  "name": "@tattletale/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "build": "wrangler deploy --dry-run --outdir=dist",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply tattletale --local",
    "db:migrate:remote": "wrangler d1 migrations apply tattletale --remote"
  },
  "dependencies": {
    "@tattletale/shared": "workspace:*",
    "hono": "^4.7.0",
    "drizzle-orm": "^0.39.0",
    "zod": "^4.1.11"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20250327.0",
    "@cloudflare/vitest-pool-workers": "^0.8.0",
    "drizzle-kit": "^0.30.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.4",
    "wrangler": "^4.14.0"
  }
}
```

- [ ] **Step 2: Rewrite `apps/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"],
    "lib": ["ES2022"],
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `apps/server/wrangler.toml`**

```toml
name = "tattletale-server"
main = "src/index.ts"
compatibility_date = "2025-04-01"
compatibility_flags = ["nodejs_compat"]

[durable_objects]
bindings = [
  { name = "GAME_ROOM", class_name = "GameRoomDO" }
]

[[d1_databases]]
binding = "DB"
database_name = "tattletale"
database_id = "local"

[[migrations]]
tag = "v1"
new_classes = ["GameRoomDO"]

[vars]
WEB_ORIGIN = "http://localhost:5173"
```

- [ ] **Step 4: Create minimal `apps/server/src/index.ts` placeholder**

```typescript
import { Hono } from 'hono';

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  DB: D1Database;
  WEB_ORIGIN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) =>
  c.json({ ok: true, service: 'tattletale-server', timestamp: new Date().toISOString() }),
);

export default app;

// Placeholder DO - will be replaced in Task 7
export class GameRoomDO implements DurableObject {
  constructor(private state: DurableObjectState, private env: Env) {}
  async fetch(_request: Request): Promise<Response> {
    return new Response('not implemented', { status: 501 });
  }
}
```

- [ ] **Step 5: Install dependencies**

Run from repo root:
```bash
npm install
```

- [ ] **Step 6: Verify wrangler starts**

Run from `apps/server/`:
```bash
npx wrangler dev
```
Expected: Worker starts on `http://localhost:8787`. `curl http://localhost:8787/health` returns `{"ok":true,"service":"tattletale-server",...}`.

Stop wrangler after verifying.

- [ ] **Step 7: Commit**

```bash
git add apps/server/package.json apps/server/tsconfig.json apps/server/wrangler.toml apps/server/src/index.ts
git commit -m "feat: scaffold CF Worker project with Hono + DO stub"
```

---

## Task 2: Shared Protocol Types

**Files:**
- Create: `packages/shared/src/contracts/messages.ts`
- Modify: `packages/shared/src/contracts/views.ts`
- Modify: `packages/shared/src/protocol.ts`
- Modify: `packages/shared/package.json`

Defines the typed WebSocket message protocol and per-player session view.

- [ ] **Step 1: Add zod to shared package**

In `packages/shared/package.json`, add to dependencies:
```json
"dependencies": {
  "zod": "^4.1.11"
}
```

Run `npm install` from repo root.

- [ ] **Step 2: Create `packages/shared/src/contracts/messages.ts`**

```typescript
import { z } from 'zod';
import { IntentType } from '../enums.js';

// ─── Client Message Types ────────────────────────────────────

export const ClientMessageTypes = [
  'joinLobby',
  'rejoinLobby',
  'kickPlayer',
  'startGame',
  'submitIntent',
] as const;

export type ClientMessageType = (typeof ClientMessageTypes)[number];

// ─── Client Payload Schemas ──────────────────────────────────

export const JoinLobbyPayloadSchema = z.object({
  displayName: z.string().min(2).max(24),
});
export type JoinLobbyPayload = z.infer<typeof JoinLobbyPayloadSchema>;

export const RejoinLobbyPayloadSchema = z.object({
  playerId: z.string().min(1),
  reconnectToken: z.string().min(1),
});
export type RejoinLobbyPayload = z.infer<typeof RejoinLobbyPayloadSchema>;

export const KickPlayerPayloadSchema = z.object({
  targetPlayerId: z.string().min(1),
});
export type KickPlayerPayload = z.infer<typeof KickPlayerPayloadSchema>;

export const StartGamePayloadSchema = z.object({});
export type StartGamePayload = z.infer<typeof StartGamePayloadSchema>;

export const VotePayloadSchema = z.object({
  targetPlayerId: z.string().nullable(),
});
export type VotePayload = z.infer<typeof VotePayloadSchema>;

export const NightActionPayloadSchema = z.object({
  actionType: z.string().min(1),
  targetPlayerId: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type NightActionPayload = z.infer<typeof NightActionPayloadSchema>;

export const MessagePayloadSchema = z.object({
  channelId: z.string().min(1),
  content: z.string().min(1),
});
export type MessagePayload = z.infer<typeof MessagePayloadSchema>;

export const SubmitIntentPayloadSchema = z.object({
  intent: z.object({
    type: z.nativeEnum(IntentType),
    payload: z.union([VotePayloadSchema, NightActionPayloadSchema, MessagePayloadSchema]),
    clientTimestamp: z.string(),
  }),
});
export type SubmitIntentPayload = z.infer<typeof SubmitIntentPayloadSchema>;

export const ClientPayloadSchemas = {
  joinLobby: JoinLobbyPayloadSchema,
  rejoinLobby: RejoinLobbyPayloadSchema,
  kickPlayer: KickPlayerPayloadSchema,
  startGame: StartGamePayloadSchema,
  submitIntent: SubmitIntentPayloadSchema,
} as const;

// ─── Client Message Envelope ─────────────────────────────────

export const ClientMessageSchema = z.object({
  type: z.enum(ClientMessageTypes),
  seq: z.number().int().nonnegative(),
  payload: z.unknown(),
});

export interface ClientMessage<T extends ClientMessageType = ClientMessageType> {
  type: T;
  seq: number;
  payload: unknown;
}

// ─── Server Message Types ────────────────────────────────────

export type ServerMessageType = 'ack' | 'lobbyState' | 'sessionState' | 'error' | 'kicked';

export interface ServerMessage<T extends ServerMessageType = ServerMessageType> {
  type: T;
  ref?: number;
  payload: unknown;
}

export interface ServerErrorPayload {
  code: string;
  message: string;
}
```

- [ ] **Step 3: Add `PlayerSessionView` to `packages/shared/src/contracts/views.ts`**

Append to the end of the existing file:

```typescript
export interface PlayerSessionView {
  gameId: string;
  lobbyCode: string;
  status: SessionStatus;
  phase: Phase;
  cycle: number;
  currentPhaseEndsAt: string | null;
  players: SessionPlayerView[];
  channels: ChannelView[];
  myPendingIntentTypes: IntentType[];
  systemEvents: SystemEventView[];
  myRole: string;
  myTeam: Team;
}
```

The existing imports at the top of this file already include `SessionStatus`, `Phase`, `IntentType`, `Team`, `ChannelType` from the enums. If `Team` is missing from the import, add it.

- [ ] **Step 4: Export messages from `packages/shared/src/protocol.ts`**

Add to the existing exports:

```typescript
export * from './contracts/messages.js';
```

- [ ] **Step 5: Build shared package**

```bash
npm run build -w @tattletale/shared
```
Expected: Compiles without errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat: add WS message protocol types, Zod schemas, PlayerSessionView"
```

---

## Task 3: Drizzle D1 Schema and Migration

**Files:**
- Create: `apps/server/drizzle/schema.ts`
- Create: `apps/server/drizzle.config.ts`

- [ ] **Step 1: Create `apps/server/drizzle.config.ts`**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle/migrations',
  schema: './drizzle/schema.ts',
  dialect: 'sqlite',
});
```

- [ ] **Step 2: Create `apps/server/drizzle/schema.ts`**

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  lobbyCode: text('lobby_code').notNull(),
  status: text('status').notNull().default('active'),
  phase: text('phase').notNull().default('day_open'),
  cycle: integer('cycle').notNull().default(1),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  settings: text('settings').notNull(), // JSON blob
});

export const gamePlayers = sqliteTable('game_players', {
  id: text('id').primaryKey(),
  gameId: text('game_id')
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull(),
  team: text('team').notNull(),
  alive: integer('alive').notNull().default(1),
  eliminatedCycle: integer('eliminated_cycle'),
  eliminatedPhase: text('eliminated_phase'),
});

export const sessionAuditEvents = sqliteTable('session_audit_events', {
  id: text('id').primaryKey(),
  gameId: text('game_id')
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  payload: text('payload').notNull(), // JSON
  createdAt: text('created_at').notNull(),
});

export const messageAuditEvents = sqliteTable('message_audit_events', {
  id: text('id').primaryKey(),
  gameId: text('game_id')
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  senderId: text('sender_id').notNull(),
  channelId: text('channel_id').notNull(),
  rawContent: text('raw_content').notNull(),
  deliveredContent: text('delivered_content').notNull(),
  createdAt: text('created_at').notNull(),
});

export const installedApps = sqliteTable('installed_apps', {
  deviceId: text('device_id').notNull(),
  appId: text('app_id').notNull(),
  installedAt: text('installed_at').notNull(),
});
```

Note: Drizzle's SQLite driver doesn't support composite primary keys via the table builder in the same way. The `installedApps` table uses a composite unique constraint instead. We'll handle deduplication in the insert query with `ON CONFLICT`.

- [ ] **Step 3: Generate migration**

Run from `apps/server/`:
```bash
npx drizzle-kit generate
```
Expected: Creates a SQL migration file in `drizzle/migrations/`.

- [ ] **Step 4: Apply migration locally**

```bash
npx wrangler d1 migrations apply tattletale --local
```
Expected: Migration applies successfully against local SQLite.

- [ ] **Step 5: Commit**

```bash
git add apps/server/drizzle/ apps/server/drizzle.config.ts
git commit -m "feat: add Drizzle D1 schema and initial migration"
```

---

## Task 4: Worker Entry Point and Hono Router

**Files:**
- Rewrite: `apps/server/src/index.ts`
- Create: `apps/server/src/router.ts`
- Rewrite: `apps/server/src/config/env.ts`

- [ ] **Step 1: Rewrite `apps/server/src/config/env.ts`**

Replace the entire file:

```typescript
export interface Env {
  GAME_ROOM: DurableObjectNamespace;
  DB: D1Database;
  WEB_ORIGIN: string;
}
```

- [ ] **Step 2: Create `apps/server/src/router.ts`**

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { generateLobbyCode } from './domain/lobby/lobby-code.js';
import { installedApps } from '../drizzle/schema.js';
import type { Env } from './config/env.js';

const MAX_LOBBY_CODE_ATTEMPTS = 12;

export function createRouter() {
  const router = new Hono<{ Bindings: Env }>();

  // CORS middleware
  router.use('*', async (c, next) => {
    const corsMiddleware = cors({
      origin: c.env.WEB_ORIGIN,
      credentials: true,
    });
    return corsMiddleware(c, next);
  });

  // ─── Health ──────────────────────────────────────────────
  router.get('/health', (c) =>
    c.json({ ok: true, service: 'tattletale-server', timestamp: new Date().toISOString() }),
  );

  router.get('/ready', async (c) => {
    try {
      const db = drizzle(c.env.DB);
      await db.run({ sql: 'SELECT 1', params: [] } as any);
      return c.json({ d1: 'ok' });
    } catch {
      return c.json({ d1: 'error' }, 503);
    }
  });

  // ─── Store ───────────────────────────────────────────────
  const deviceIdSchema = z.string().uuid();
  const installBodySchema = z.object({
    deviceId: z.string().uuid(),
    appId: z.string().min(1).max(64),
  });

  router.get('/store/installed-apps', async (c) => {
    const deviceId = c.req.query('deviceId');
    const parsed = deviceIdSchema.safeParse(deviceId);
    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid deviceId' }, 400);
    }
    const db = drizzle(c.env.DB);
    const rows = await db
      .select({ appId: installedApps.appId })
      .from(installedApps)
      .where(eq(installedApps.deviceId, parsed.data));
    return c.json({ ok: true, deviceId: parsed.data, installedAppIds: rows.map((r) => r.appId) });
  });

  router.post('/store/install', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = installBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid body' }, 400);
    }
    const { deviceId, appId } = parsed.data;
    const db = drizzle(c.env.DB);
    // Insert or ignore if already installed
    await db.insert(installedApps).values({
      deviceId,
      appId,
      installedAt: new Date().toISOString(),
    }).onConflictDoNothing();
    const rows = await db
      .select({ appId: installedApps.appId })
      .from(installedApps)
      .where(eq(installedApps.deviceId, deviceId));
    return c.json({ ok: true, deviceId, installedAppIds: rows.map((r) => r.appId) });
  });

  // ─── Lobby Create (HTTP) ────────────────────────────────
  const createLobbyBodySchema = z.object({
    displayName: z.string().min(2).max(24),
    settings: z
      .object({
        minPlayers: z.number().int().min(2).max(20).optional(),
        maxPlayers: z.number().int().min(2).max(20).optional(),
        dayDurationSeconds: z.number().int().min(30).max(600).optional(),
        nightDurationSeconds: z.number().int().min(15).max(300).optional(),
      })
      .optional(),
  });

  router.post('/api/lobby/create', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = createLobbyBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid body' }, 400);
    }

    // Generate a unique lobby code by trying codes until we find one
    // whose DO has no existing lobby state
    let lobbyCode: string | null = null;
    for (let i = 0; i < MAX_LOBBY_CODE_ATTEMPTS; i++) {
      const candidate = generateLobbyCode();
      const doId = c.env.GAME_ROOM.idFromName(candidate);
      const stub = c.env.GAME_ROOM.get(doId);
      // Check if this DO already has an active lobby
      const checkResp = await stub.fetch(new Request('http://do/internal/exists'));
      if (checkResp.status === 404) {
        lobbyCode = candidate;
        break;
      }
    }
    if (!lobbyCode) {
      return c.json({ ok: false, error: 'Could not generate unique lobby code' }, 503);
    }

    // Forward creation to the DO
    const doId = c.env.GAME_ROOM.idFromName(lobbyCode);
    const stub = c.env.GAME_ROOM.get(doId);
    const doResp = await stub.fetch(
      new Request('http://do/internal/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyCode,
          displayName: parsed.data.displayName,
          settings: parsed.data.settings,
        }),
      }),
    );

    if (!doResp.ok) {
      const err = await doResp.json().catch(() => ({ error: 'DO error' }));
      return c.json(err, doResp.status as any);
    }

    const data = (await doResp.json()) as { playerId: string; reconnectToken: string };
    const wsProtocol = c.req.url.startsWith('https') ? 'wss' : 'ws';
    const host = c.req.header('host') ?? 'localhost:8787';

    return c.json({
      ok: true,
      lobbyCode,
      playerId: data.playerId,
      reconnectToken: data.reconnectToken,
      wsUrl: `${wsProtocol}://${host}/api/lobby/${lobbyCode}/ws`,
    });
  });

  // ─── WebSocket Upgrade ──────────────────────────────────
  router.get('/api/lobby/:code/ws', async (c) => {
    const code = c.req.param('code').toUpperCase();
    const doId = c.env.GAME_ROOM.idFromName(code);
    const stub = c.env.GAME_ROOM.get(doId);
    // Forward the upgrade request to the DO
    return stub.fetch(c.req.raw);
  });

  return router;
}
```

- [ ] **Step 3: Rewrite `apps/server/src/index.ts`**

Replace the entire file:

```typescript
import { createRouter } from './router.js';
import { GameRoomDO } from './durable-objects/game-room.js';

export { GameRoomDO };

export default createRouter();
```

- [ ] **Step 4: Create stub `apps/server/src/durable-objects/game-room.ts`**

Create the directory and file:

```typescript
import type { Env } from '../config/env.js';

export class GameRoomDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal: check if this DO has an active lobby
    if (url.pathname === '/internal/exists') {
      const lobby = await this.state.storage.get('lobby');
      return lobby ? new Response('exists', { status: 200 }) : new Response('not found', { status: 404 });
    }

    // Internal: create lobby (called by Worker router)
    if (url.pathname === '/internal/create' && request.method === 'POST') {
      const existing = await this.state.storage.get('lobby');
      if (existing) {
        return Response.json({ error: 'Lobby already exists' }, { status: 409 });
      }
      // Placeholder - will be implemented in Task 7
      return Response.json({ error: 'Not yet implemented' }, { status: 501 });
    }

    return new Response('not found', { status: 404 });
  }
}
```

- [ ] **Step 5: Verify routes work**

```bash
cd apps/server && npx wrangler dev
```

In another terminal:
```bash
curl http://localhost:8787/health
```
Expected: `{"ok":true,"service":"tattletale-server",...}`

```bash
curl http://localhost:8787/ready
```
Expected: `{"d1":"ok"}`

Stop wrangler after verifying.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/ apps/server/drizzle/
git commit -m "feat: add Hono router with health, store, and lobby create routes"
```

---

## Task 5: Domain Updates - PlayerSessionView Projection

**Files:**
- Modify: `apps/server/src/domain/projections.ts`
- Modify: `apps/server/src/domain/repositories.ts`
- Create: `apps/server/src/domain/projections.test.ts`

- [ ] **Step 1: Write failing test for `toPlayerSessionView`**

Create `apps/server/src/domain/projections.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { toPlayerSessionView } from './projections.js';
import { Phase, ChannelType, IntentType, SessionStatus, SystemEventType, Team } from '@tattletale/shared';
import type { GameState } from './game/types.js';

function makeGameState(overrides?: Partial<GameState>): GameState {
  return {
    gameId: 'game-1',
    lobbyCode: 'ABC123',
    status: SessionStatus.ACTIVE,
    winnerTeam: null,
    phase: Phase.DAY_OPEN,
    cycle: 1,
    players: {
      p1: {
        playerId: 'p1',
        displayName: 'Alice',
        alive: true,
        connected: true,
        roleId: 'friend',
        team: Team.FRIENDS,
        permissions: [],
      },
      p2: {
        playerId: 'p2',
        displayName: 'Bob',
        alive: true,
        connected: true,
        roleId: 'hacker',
        team: Team.HACKERS,
        permissions: [],
      },
    },
    channels: {
      global: {
        id: 'global',
        type: ChannelType.GLOBAL,
        members: ['p1', 'p2'],
        locked: false,
        expiresAt: null,
      },
      hackers: {
        id: 'hackers',
        type: ChannelType.ROLE,
        members: ['p2'],
        locked: false,
        expiresAt: null,
      },
    },
    pendingIntents: [],
    systemEvents: [
      { id: 'e1', type: SystemEventType.GAME_STARTED, createdAt: '2026-01-01T00:00:00Z' },
    ],
    timers: { currentPhaseEndsAt: '2026-01-01T00:03:00Z' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('toPlayerSessionView', () => {
  it('includes only channels the player is a member of', () => {
    const state = makeGameState();
    const view = toPlayerSessionView(state, 'p1');
    const channelIds = view.channels.map((c) => c.id);
    expect(channelIds).toContain('global');
    expect(channelIds).not.toContain('hackers');
  });

  it('hacker sees their role channel', () => {
    const state = makeGameState();
    const view = toPlayerSessionView(state, 'p2');
    const channelIds = view.channels.map((c) => c.id);
    expect(channelIds).toContain('global');
    expect(channelIds).toContain('hackers');
  });

  it('includes only the requesting player own role and team', () => {
    const state = makeGameState();
    const viewP1 = toPlayerSessionView(state, 'p1');
    expect(viewP1.myRole).toBe('friend');
    expect(viewP1.myTeam).toBe(Team.FRIENDS);

    const viewP2 = toPlayerSessionView(state, 'p2');
    expect(viewP2.myRole).toBe('hacker');
    expect(viewP2.myTeam).toBe(Team.HACKERS);
  });

  it('players array never includes role or team', () => {
    const state = makeGameState();
    const view = toPlayerSessionView(state, 'p1');
    for (const player of view.players) {
      expect(player).not.toHaveProperty('roleId');
      expect(player).not.toHaveProperty('team');
    }
  });

  it('only includes own pending intent types', () => {
    const state = makeGameState({
      pendingIntents: [
        { id: 'i1', playerId: 'p1', type: IntentType.SUBMIT_VOTE, payload: { targetPlayerId: 'p2' }, cycle: 1, phase: Phase.DAY_VOTE, createdAt: '' },
        { id: 'i2', playerId: 'p2', type: IntentType.SUBMIT_VOTE, payload: { targetPlayerId: 'p1' }, cycle: 1, phase: Phase.DAY_VOTE, createdAt: '' },
      ],
    });
    const viewP1 = toPlayerSessionView(state, 'p1');
    expect(viewP1.myPendingIntentTypes).toEqual([IntentType.SUBMIT_VOTE]);

    const viewP2 = toPlayerSessionView(state, 'p2');
    expect(viewP2.myPendingIntentTypes).toEqual([IntentType.SUBMIT_VOTE]);
  });
});
```

- [ ] **Step 2: Run test to see it fail**

```bash
cd apps/server && npx vitest run src/domain/projections.test.ts
```
Expected: FAIL - `toPlayerSessionView is not a function` (it doesn't exist yet).

- [ ] **Step 3: Implement `toPlayerSessionView` in `apps/server/src/domain/projections.ts`**

Add the following to the existing file. Keep `toLobbyView` unchanged. Keep `toSessionView` in the file (it's still used by existing tests and the `StartGameSuccess` ack type) but the WebSocket broadcast layer now uses `toPlayerSessionView` exclusively:

```typescript
import type { PlayerSessionView } from '@tattletale/shared';
// Add PlayerSessionView to the existing import from @tattletale/shared

export function toPlayerSessionView(session: GameState, playerId: string): PlayerSessionView {
  const player = session.players[playerId];

  return {
    gameId: session.gameId,
    lobbyCode: session.lobbyCode,
    status: session.status,
    phase: session.phase,
    cycle: session.cycle,
    currentPhaseEndsAt: session.timers.currentPhaseEndsAt,
    players: Object.values(session.players).map((p) => ({
      playerId: p.playerId,
      displayName: p.displayName,
      alive: p.alive,
      connected: p.connected,
    })),
    channels: Object.values(session.channels)
      .filter((ch) => ch.members.includes(playerId))
      .map((ch) => ({
        id: ch.id,
        type: ch.type,
        members: [...ch.members],
        locked: ch.locked,
        expiresAt: ch.expiresAt,
      })),
    myPendingIntentTypes: session.pendingIntents
      .filter((intent) => intent.playerId === playerId)
      .map((intent) => intent.type),
    systemEvents: session.systemEvents.map((event) => ({
      id: event.id,
      type: event.type,
      createdAt: event.createdAt,
    })),
    myRole: player?.roleId ?? 'unknown',
    myTeam: player?.team ?? 'FRIENDS' as any,
  };
}
```

Ensure the import at the top of the file includes `PlayerSessionView`:
```typescript
import type { LobbyView, SessionView, PlayerSessionView } from '@tattletale/shared';
```

- [ ] **Step 4: Run test to see it pass**

```bash
cd apps/server && npx vitest run src/domain/projections.test.ts
```
Expected: All 5 tests PASS.

- [ ] **Step 5: Verify existing domain tests still pass**

```bash
cd apps/server && npx vitest run src/domain/game/runtime-domain.test.ts
```
Expected: All existing tests PASS (domain logic unchanged).

- [ ] **Step 6: Simplify `RuntimeRepository` in `apps/server/src/domain/repositories.ts`**

Remove the socket presence methods. Replace the entire file:

```typescript
import type { GameState } from './game/types.js';
import type { LobbyState } from './lobby/types.js';

// ─── Runtime Repository ──────────────────────────────────────
// In the DO model, this wraps DO transactional storage.
// Each DO instance stores at most one lobby and one session.

export interface RuntimeRepository {
  getLobby(): Promise<LobbyState | null>;
  saveLobby(lobby: LobbyState): Promise<void>;
  getSession(): Promise<GameState | null>;
  saveSession(session: GameState): Promise<void>;
  deleteLobby(): Promise<void>;
  deleteSession(): Promise<void>;
}

// ─── Player Connection Records ───────────────────────────────

export interface PlayerConnectionRecord {
  reconnectToken: string;
  tokenIssuedAt: number;
  lastDisconnectedAt?: number;
  kickedAt?: number;
}

// ─── Phase Deadline ──────────────────────────────────────────

export interface PersistedPhaseDeadline {
  phase: string;
  cycle: number;
  deadlineMs: number;
}

// ─── Game Audit Repository ───────────────────────────────────

export interface CreateGameRecordInput {
  gameId: string;
  lobbyCode: string;
  phase: string;
  cycle: number;
  players: Array<{
    playerId: string;
    displayName: string;
    alive: boolean;
    isHost: boolean;
    roleId: string | null;
    team: string;
  }>;
}

export interface SessionAuditEventInput {
  gameId: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface MessageAuditEventInput {
  gameId: string;
  channelId: string;
  senderPlayerId: string;
  rawPayload: Record<string, unknown>;
  deliveredPayload?: Record<string, unknown> | null;
}

export interface GameAuditRepository {
  createGameRecord(input: CreateGameRecordInput): Promise<void>;
  appendSessionEvent(input: SessionAuditEventInput): Promise<void>;
  appendMessageAudit(input: MessageAuditEventInput): Promise<void>;
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/domain/
git commit -m "feat: add toPlayerSessionView projection, simplify repository interfaces"
```

---

## Task 6: DO-Storage Runtime Repository

**Files:**
- Create: `apps/server/src/persistence/do-runtime-repo.ts`

- [ ] **Step 1: Create `apps/server/src/persistence/do-runtime-repo.ts`**

```typescript
import type { GameState } from '../domain/game/types.js';
import type { LobbyState } from '../domain/lobby/types.js';
import type {
  RuntimeRepository,
  PlayerConnectionRecord,
  PersistedPhaseDeadline,
} from '../domain/repositories.js';

/**
 * RuntimeRepository backed by Durable Object transactional storage.
 * Each DO instance stores at most one lobby and one session.
 */
export class DORuntimeRepository implements RuntimeRepository {
  constructor(private storage: DurableObjectStorage) {}

  async getLobby(): Promise<LobbyState | null> {
    return (await this.storage.get<LobbyState>('lobby')) ?? null;
  }

  async saveLobby(lobby: LobbyState): Promise<void> {
    await this.storage.put('lobby', lobby);
  }

  async deleteLobby(): Promise<void> {
    await this.storage.delete('lobby');
  }

  async getSession(): Promise<GameState | null> {
    return (await this.storage.get<GameState>('game')) ?? null;
  }

  async saveSession(session: GameState): Promise<void> {
    await this.storage.put('game', session);
  }

  async deleteSession(): Promise<void> {
    await this.storage.delete('game');
  }

  // ─── Player Connection Records ─────────────────────────

  async getPlayerRecord(playerId: string): Promise<PlayerConnectionRecord | null> {
    return (await this.storage.get<PlayerConnectionRecord>(`players:${playerId}`)) ?? null;
  }

  async savePlayerRecord(playerId: string, record: PlayerConnectionRecord): Promise<void> {
    await this.storage.put(`players:${playerId}`, record);
  }

  async deletePlayerRecord(playerId: string): Promise<void> {
    await this.storage.delete(`players:${playerId}`);
  }

  async deleteAllPlayerRecords(playerIds: string[]): Promise<void> {
    await this.storage.delete(playerIds.map((id) => `players:${id}`));
  }

  // ─── Phase Deadline ────────────────────────────────────

  async getPhaseDeadline(): Promise<PersistedPhaseDeadline | null> {
    return (await this.storage.get<PersistedPhaseDeadline>('phaseDeadline')) ?? null;
  }

  async savePhaseDeadline(deadline: PersistedPhaseDeadline): Promise<void> {
    await this.storage.put('phaseDeadline', deadline);
  }

  async clearPhaseDeadline(): Promise<void> {
    await this.storage.delete('phaseDeadline');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/persistence/do-runtime-repo.ts
git commit -m "feat: add DO-storage runtime repository"
```

---

## Task 7: D1 Audit Repository

**Files:**
- Create: `apps/server/src/persistence/d1-audit-repo.ts`

- [ ] **Step 1: Create `apps/server/src/persistence/d1-audit-repo.ts`**

```typescript
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { games, gamePlayers, sessionAuditEvents, messageAuditEvents } from '../../drizzle/schema.js';
import type {
  GameAuditRepository,
  CreateGameRecordInput,
  SessionAuditEventInput,
  MessageAuditEventInput,
} from '../domain/repositories.js';

export class D1AuditRepository implements GameAuditRepository {
  private db: DrizzleD1Database;

  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async createGameRecord(input: CreateGameRecordInput): Promise<void> {
    const now = new Date().toISOString();

    await this.db.insert(games).values({
      id: input.gameId,
      lobbyCode: input.lobbyCode,
      status: 'active',
      phase: input.phase,
      cycle: input.cycle,
      startedAt: now,
      settings: '{}',
    });

    if (input.players.length > 0) {
      await this.db.insert(gamePlayers).values(
        input.players.map((p) => ({
          id: `${input.gameId}:${p.playerId}`,
          gameId: input.gameId,
          playerId: p.playerId,
          displayName: p.displayName,
          role: p.roleId ?? 'unknown',
          team: p.team,
          alive: p.alive ? 1 : 0,
        })),
      );
    }
  }

  async appendSessionEvent(input: SessionAuditEventInput): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insert(sessionAuditEvents).values({
      id: `${input.gameId}:${now}:${Math.random().toString(36).slice(2, 8)}`,
      gameId: input.gameId,
      eventType: input.type,
      payload: JSON.stringify(input.payload),
      createdAt: now,
    });
  }

  async appendMessageAudit(input: MessageAuditEventInput): Promise<void> {
    const now = new Date().toISOString();
    await this.db.insert(messageAuditEvents).values({
      id: `${input.gameId}:${now}:${Math.random().toString(36).slice(2, 8)}`,
      gameId: input.gameId,
      senderId: input.senderPlayerId,
      channelId: input.channelId,
      rawContent: JSON.stringify(input.rawPayload),
      deliveredContent: JSON.stringify(input.deliveredPayload ?? input.rawPayload),
      createdAt: now,
    });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/persistence/d1-audit-repo.ts
git commit -m "feat: add D1 audit repository"
```

---

## Task 8: WebSocket Message Handler

**Files:**
- Create: `apps/server/src/transport/ws-schemas.ts`
- Create: `apps/server/src/transport/ws-message-handler.ts`

This is the core logic port from `register-foundation-namespace.ts`. It routes typed messages to domain functions.

- [ ] **Step 1: Create `apps/server/src/transport/ws-schemas.ts`**

```typescript
import { ClientMessageSchema, ClientPayloadSchemas, type ClientMessageType } from '@tattletale/shared';
import { z } from 'zod';

/**
 * Parse and validate a raw WebSocket message string.
 * Returns the parsed envelope + validated payload, or an error.
 */
export function parseClientMessage(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'INVALID_JSON', message: 'Message is not valid JSON' };
  }

  const envelope = ClientMessageSchema.safeParse(json);
  if (!envelope.success) {
    return { ok: false, code: 'INVALID_ENVELOPE', message: 'Invalid message envelope' };
  }

  const { type, seq, payload } = envelope.data;
  const schema = ClientPayloadSchemas[type as ClientMessageType];
  if (!schema) {
    return { ok: false, code: 'UNKNOWN_TYPE', message: `Unknown message type: ${type}` };
  }

  const payloadResult = (schema as z.ZodType).safeParse(payload);
  if (!payloadResult.success) {
    return {
      ok: false,
      code: 'INVALID_PAYLOAD',
      message: `Invalid payload for ${type}: ${payloadResult.error.issues.map((i) => i.message).join(', ')}`,
    };
  }

  return { ok: true, type: type as ClientMessageType, seq, payload: payloadResult.data };
}

export type ParseResult =
  | { ok: true; type: ClientMessageType; seq: number; payload: unknown }
  | { ok: false; code: string; message: string };
```

- [ ] **Step 2: Create `apps/server/src/transport/ws-message-handler.ts`**

This file contains the per-message-type handlers. It's the DO-side equivalent of `register-foundation-namespace.ts`.

```typescript
import type { LobbyView, PlayerSessionView, LobbyCommandSuccess, StartGameSuccess, SubmitIntentSuccess } from '@tattletale/shared';
import { IntentType, LobbyStatus, SessionStatus, Phase } from '@tattletale/shared';
import type { JoinLobbyPayload, RejoinLobbyPayload, KickPlayerPayload, SubmitIntentPayload } from '@tattletale/shared';
import type { LobbyState, LobbyPlayerState } from '../domain/lobby/types.js';
import type { GameState } from '../domain/game/types.js';
import { DomainError } from '../domain/errors.js';
import { validateDisplayName } from '../domain/lobby/lobby-code.js';
import { DEFAULT_LOBBY_SETTINGS } from '../domain/lobby/types.js';
import { buildSessionFromLobby } from '../domain/game/session-domain.js';
import {
  initializeSessionRuntime,
  appendIntent,
  reconcileSessionRuntime,
  processElimination,
  isIntentAllowedInPhase,
} from '../domain/game/runtime-domain.js';
import { toLobbyView, toPlayerSessionView } from '../domain/projections.js';
import type { DORuntimeRepository } from '../persistence/do-runtime-repo.js';
import type { GameAuditRepository, PlayerConnectionRecord } from '../domain/repositories.js';

const RECONNECT_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateId(): string {
  return crypto.randomUUID();
}

// ─── Handler Context ─────────────────────────────────────────

export interface HandlerContext {
  repo: DORuntimeRepository;
  auditRepo: GameAuditRepository;
  getPlayerIdForWs(ws: WebSocket): string | null;
  setPlayerIdForWs(ws: WebSocket, playerId: string): void;
  broadcastLobbyState(lobby: LobbyState): void;
  broadcastSessionState(session: GameState): void;
  closeWsForPlayer(playerId: string, code: number, reason: string): void;
  setPhaseAlarm(deadlineMs: number, phase: string, cycle: number): Promise<void>;
  clearPhaseAlarm(): Promise<void>;
}

// ─── Result Types ────────────────────────────────────────────

export type HandlerResult =
  | { ok: true; data: unknown }
  | { ok: false; code: string; message: string };

// ─── Join Lobby ──────────────────────────────────────────────

export async function handleJoinLobby(
  ctx: HandlerContext,
  ws: WebSocket,
  payload: JoinLobbyPayload,
): Promise<HandlerResult> {
  const lobby = await ctx.repo.getLobby();
  if (!lobby) return { ok: false, code: 'LOBBY_NOT_FOUND', message: 'Lobby does not exist' };
  if (lobby.status !== LobbyStatus.WAITING) return { ok: false, code: 'GAME_ALREADY_STARTED', message: 'Game already started' };
  if (lobby.players.length >= lobby.settings.maxPlayers) return { ok: false, code: 'LOBBY_FULL', message: 'Lobby is full' };

  const displayName = validateDisplayName(payload.displayName);
  const playerId = generateId();
  const reconnectToken = generateToken();
  const now = new Date().toISOString();

  const player: LobbyPlayerState = {
    playerId,
    displayName,
    isHost: false,
    ready: false,
    connected: true,
    alive: true,
    reconnectToken,
    joinedAt: now,
  };

  lobby.players.push(player);
  lobby.updatedAt = now;
  await ctx.repo.saveLobby(lobby);
  await ctx.repo.savePlayerRecord(playerId, { reconnectToken, tokenIssuedAt: Date.now() });
  ctx.setPlayerIdForWs(ws, playerId);
  ctx.broadcastLobbyState(lobby);

  const result: LobbyCommandSuccess = { lobby: toLobbyView(lobby), playerId, reconnectToken };
  return { ok: true, data: result };
}

// ─── Rejoin Lobby ────────────────────────────────────────────

export async function handleRejoinLobby(
  ctx: HandlerContext,
  ws: WebSocket,
  payload: RejoinLobbyPayload,
): Promise<HandlerResult> {
  const lobby = await ctx.repo.getLobby();
  if (!lobby) return { ok: false, code: 'LOBBY_NOT_FOUND', message: 'Lobby does not exist' };

  const player = lobby.players.find((p) => p.playerId === payload.playerId);
  if (!player) return { ok: false, code: 'PLAYER_NOT_FOUND', message: 'Player not in lobby' };

  // Check kick status
  const record = await ctx.repo.getPlayerRecord(payload.playerId);
  if (record?.kickedAt) return { ok: false, code: 'PLAYER_KICKED', message: 'You were kicked from this lobby' };

  // Check token
  if (!record || record.reconnectToken !== payload.reconnectToken) {
    return { ok: false, code: 'INVALID_TOKEN', message: 'Invalid reconnect token' };
  }

  // Check expiry
  if (record.lastDisconnectedAt && Date.now() - record.lastDisconnectedAt > RECONNECT_EXPIRY_MS) {
    return { ok: false, code: 'TOKEN_EXPIRED', message: 'Reconnect token expired' };
  }

  // Close any stale WS for this player
  ctx.closeWsForPlayer(payload.playerId, 4002, 'Replaced by new connection');

  // Rotate token
  const newToken = generateToken();
  await ctx.repo.savePlayerRecord(payload.playerId, {
    reconnectToken: newToken,
    tokenIssuedAt: Date.now(),
  });

  player.connected = true;
  player.reconnectToken = newToken;
  lobby.updatedAt = new Date().toISOString();
  await ctx.repo.saveLobby(lobby);
  ctx.setPlayerIdForWs(ws, payload.playerId);

  // Update session player if in game
  const session = await ctx.repo.getSession();
  if (session && session.players[payload.playerId]) {
    session.players[payload.playerId].connected = true;
    await ctx.repo.saveSession(session);
    ctx.broadcastSessionState(session);
  }

  ctx.broadcastLobbyState(lobby);

  const result: LobbyCommandSuccess = {
    lobby: toLobbyView(lobby),
    playerId: payload.playerId,
    reconnectToken: newToken,
  };
  return { ok: true, data: result };
}

// ─── Kick Player ─────────────────────────────────────────────

export async function handleKickPlayer(
  ctx: HandlerContext,
  ws: WebSocket,
  payload: KickPlayerPayload,
): Promise<HandlerResult> {
  const actorId = ctx.getPlayerIdForWs(ws);
  if (!actorId) return { ok: false, code: 'NOT_AUTHENTICATED', message: 'Not authenticated' };

  const lobby = await ctx.repo.getLobby();
  if (!lobby) return { ok: false, code: 'LOBBY_NOT_FOUND', message: 'Lobby does not exist' };
  if (lobby.hostPlayerId !== actorId) return { ok: false, code: 'NOT_HOST', message: 'Only the host can kick players' };

  const targetIdx = lobby.players.findIndex((p) => p.playerId === payload.targetPlayerId);
  if (targetIdx === -1) return { ok: false, code: 'PLAYER_NOT_FOUND', message: 'Target player not found' };
  if (payload.targetPlayerId === actorId) return { ok: false, code: 'CANNOT_KICK_SELF', message: 'Cannot kick yourself' };

  const now = new Date().toISOString();

  if (lobby.status === LobbyStatus.WAITING) {
    lobby.players.splice(targetIdx, 1);
  } else if (lobby.status === LobbyStatus.IN_GAME) {
    const session = await ctx.repo.getSession();
    if (session && session.status === SessionStatus.ACTIVE) {
      const events = processElimination(session, lobby, payload.targetPlayerId, now, 'PLAYER_KICKED');
      await ctx.repo.saveSession(session);
      await persistRuntimeEvents(ctx.auditRepo, session.gameId, events);
    }
    lobby.players[targetIdx].alive = false;
    lobby.players[targetIdx].connected = false;
  }

  // Mark as kicked in connection record
  const record = await ctx.repo.getPlayerRecord(payload.targetPlayerId);
  if (record) {
    await ctx.repo.savePlayerRecord(payload.targetPlayerId, { ...record, kickedAt: Date.now() });
  }

  lobby.updatedAt = now;
  await ctx.repo.saveLobby(lobby);

  // Notify kicked player and close their WS
  ctx.closeWsForPlayer(payload.targetPlayerId, 4001, 'Kicked by host');

  ctx.broadcastLobbyState(lobby);
  const session = await ctx.repo.getSession();
  if (session) ctx.broadcastSessionState(session);

  return { ok: true, data: { lobby: toLobbyView(lobby) } };
}

// ─── Start Game ──────────────────────────────────────────────

export async function handleStartGame(
  ctx: HandlerContext,
  ws: WebSocket,
): Promise<HandlerResult> {
  const actorId = ctx.getPlayerIdForWs(ws);
  if (!actorId) return { ok: false, code: 'NOT_AUTHENTICATED', message: 'Not authenticated' };

  const lobby = await ctx.repo.getLobby();
  if (!lobby) return { ok: false, code: 'LOBBY_NOT_FOUND', message: 'Lobby does not exist' };
  if (lobby.hostPlayerId !== actorId) return { ok: false, code: 'NOT_HOST', message: 'Only the host can start the game' };
  if (lobby.status !== LobbyStatus.WAITING) return { ok: false, code: 'GAME_ALREADY_STARTED', message: 'Game already started' };

  const connectedCount = lobby.players.filter((p) => p.connected && p.alive).length;
  if (connectedCount < lobby.settings.minPlayers) {
    return { ok: false, code: 'NOT_ENOUGH_PLAYERS', message: `Need at least ${lobby.settings.minPlayers} connected players` };
  }

  const now = new Date().toISOString();
  const gameId = generateId();

  const session = buildSessionFromLobby(lobby, gameId, now);
  initializeSessionRuntime(session, lobby.settings, now);

  lobby.status = LobbyStatus.IN_GAME;
  lobby.sessionId = gameId;
  lobby.updatedAt = now;

  await ctx.repo.saveSession(session);
  await ctx.repo.saveLobby(lobby);

  // Set phase alarm
  if (session.timers.currentPhaseEndsAt) {
    const deadlineMs = new Date(session.timers.currentPhaseEndsAt).getTime();
    await ctx.setPhaseAlarm(deadlineMs, session.phase, session.cycle);
  }

  // Audit
  try {
    await ctx.auditRepo.createGameRecord({
      gameId,
      lobbyCode: lobby.code,
      phase: session.phase,
      cycle: session.cycle,
      players: lobby.players.map((p) => ({
        playerId: p.playerId,
        displayName: p.displayName,
        alive: p.alive,
        isHost: p.isHost,
        roleId: session.players[p.playerId]?.roleId ?? null,
        team: session.players[p.playerId]?.team ?? 'FRIENDS',
      })),
    });
    await ctx.auditRepo.appendSessionEvent({
      gameId,
      type: 'GAME_STARTED',
      payload: { phase: session.phase, cycle: session.cycle },
    });
  } catch {
    // Audit failures should not block the game
  }

  ctx.broadcastLobbyState(lobby);
  ctx.broadcastSessionState(session);

  const result: StartGameSuccess = {
    lobby: toLobbyView(lobby),
    session: toPlayerSessionView(session, actorId),
  };
  return { ok: true, data: result };
}

// ─── Submit Intent ───────────────────────────────────────────

export async function handleSubmitIntent(
  ctx: HandlerContext,
  ws: WebSocket,
  payload: SubmitIntentPayload,
): Promise<HandlerResult> {
  const playerId = ctx.getPlayerIdForWs(ws);
  if (!playerId) return { ok: false, code: 'NOT_AUTHENTICATED', message: 'Not authenticated' };

  const lobby = await ctx.repo.getLobby();
  if (!lobby) return { ok: false, code: 'LOBBY_NOT_FOUND', message: 'Lobby does not exist' };
  if (lobby.status !== LobbyStatus.IN_GAME) return { ok: false, code: 'GAME_NOT_STARTED', message: 'Game not started' };

  const session = await ctx.repo.getSession();
  if (!session) return { ok: false, code: 'SESSION_NOT_FOUND', message: 'Session not found' };

  // Reconcile first (catches missed phase transitions)
  const now = new Date().toISOString();
  const reconEvents = reconcileSessionRuntime(session, lobby, lobby.settings, now);
  if (reconEvents.length > 0) {
    await ctx.repo.saveSession(session);
    await ctx.repo.saveLobby(lobby);
    await persistRuntimeEvents(ctx.auditRepo, session.gameId, reconEvents);
    // Re-set alarm if phase changed
    if (session.timers.currentPhaseEndsAt) {
      await ctx.setPhaseAlarm(
        new Date(session.timers.currentPhaseEndsAt).getTime(),
        session.phase,
        session.cycle,
      );
    }
    ctx.broadcastSessionState(session);
    ctx.broadcastLobbyState(lobby);
  }

  if (session.status !== SessionStatus.ACTIVE) {
    return { ok: false, code: 'GAME_ENDED', message: 'Game has ended' };
  }

  const sessionPlayer = session.players[playerId];
  if (!sessionPlayer) return { ok: false, code: 'PLAYER_NOT_IN_SESSION', message: 'Player not in session' };
  if (!sessionPlayer.alive) return { ok: false, code: 'PLAYER_ELIMINATED', message: 'Player is eliminated' };

  const { intent } = payload;

  // SEND_MESSAGE is not yet implemented
  if (intent.type === IntentType.SEND_MESSAGE) {
    return { ok: false, code: 'NOT_IMPLEMENTED', message: 'SEND_MESSAGE not yet implemented' };
  }

  if (!isIntentAllowedInPhase(intent.type, session.phase)) {
    return { ok: false, code: 'PHASE_EXPIRED', message: `${intent.type} not allowed in ${session.phase}` };
  }

  // Validate vote target
  if (intent.type === IntentType.SUBMIT_VOTE) {
    const votePayload = intent.payload as { targetPlayerId: string | null };
    if (votePayload.targetPlayerId !== null) {
      const target = session.players[votePayload.targetPlayerId];
      if (!target || !target.alive) {
        return { ok: false, code: 'INVALID_TARGET', message: 'Vote target is not a valid alive player' };
      }
    }
  }

  const result = appendIntent(session, {
    playerId,
    type: intent.type as IntentType.SUBMIT_VOTE | IntentType.SUBMIT_NIGHT_ACTION,
    payload: intent.payload as any,
    phase: session.phase,
    cycle: session.cycle,
    createdAt: now,
  });

  if (!result.accepted) {
    return { ok: false, code: 'DUPLICATE_VOTE', message: 'Vote already submitted this phase (replacement applied)' };
  }

  await ctx.repo.saveSession(session);
  ctx.broadcastSessionState(session);

  const ackResult: SubmitIntentSuccess = {
    acceptedIntentId: result.intent.id,
    session: toPlayerSessionView(session, playerId),
  };
  return { ok: true, data: ackResult };
}

// ─── Helpers ─────────────────────────────────────────────────

export async function persistRuntimeEvents(
  auditRepo: GameAuditRepository,
  gameId: string,
  events: Array<{ type: string; [key: string]: unknown }>,
): Promise<void> {
  for (const event of events) {
    try {
      await auditRepo.appendSessionEvent({ gameId, type: event.type, payload: event as Record<string, unknown> });
    } catch {
      // Audit failures are non-fatal
    }
  }
}
```

Note: `handleCreateLobby` is not here because lobby creation goes through the HTTP route -> DO internal `/internal/create` path, handled directly in the GameRoomDO class (Task 9).

Note: `SEND_MESSAGE` intent type is intentionally not implemented — the existing Socket.IO handler also returns not-implemented for this. The message channel system (channel-based chat with mutation abilities for Troller/Imitator roles) is a future feature. The Zod schema accepts it for forward compatibility, but the handler returns `NOT_IMPLEMENTED`.

Note: Game-end detection after intent submission relies on the `reconcileSessionRuntime` call at the top of `handleSubmitIntent`, which calls `applyWinState` internally. If reconciliation triggers a win, the handler returns `GAME_ENDED` and the DO's alarm handler (or the next message wake) handles cleanup via `handleGameEnd()`.

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/transport/
git commit -m "feat: add WS message schemas and handler (port from Socket.IO namespace)"
```

---

## Task 9: GameRoomDO - Full Implementation

**Files:**
- Rewrite: `apps/server/src/durable-objects/game-room.ts`

This is the largest task. The DO manages the full lifecycle: lobby creation, WebSocket connections, message routing, phase alarms, and game end cleanup.

- [ ] **Step 1: Rewrite `apps/server/src/durable-objects/game-room.ts`**

```typescript
import type { Env } from '../config/env.js';
import type { LobbyState, LobbyPlayerState } from '../domain/lobby/types.js';
import type { GameState } from '../domain/game/types.js';
import type { ServerMessage, ServerErrorPayload, ClientMessageType } from '@tattletale/shared';
import { LobbyStatus, SessionStatus } from '@tattletale/shared';
import { DEFAULT_LOBBY_SETTINGS } from '../domain/lobby/types.js';
import { validateDisplayName } from '../domain/lobby/lobby-code.js';
import { reconcileSessionRuntime } from '../domain/game/runtime-domain.js';
import { toLobbyView, toPlayerSessionView } from '../domain/projections.js';
import { DORuntimeRepository } from '../persistence/do-runtime-repo.js';
import { D1AuditRepository } from '../persistence/d1-audit-repo.js';
import { parseClientMessage } from '../transport/ws-schemas.js';
import {
  handleJoinLobby,
  handleRejoinLobby,
  handleKickPlayer,
  handleStartGame,
  handleSubmitIntent,
  persistRuntimeEvents,
  generateToken,
  type HandlerContext,
  type HandlerResult,
} from '../transport/ws-message-handler.js';

interface WsAttachment {
  playerId: string | null;
}

export class GameRoomDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private repo: DORuntimeRepository;
  private auditRepo: D1AuditRepository;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.repo = new DORuntimeRepository(state.storage);
    this.auditRepo = new D1AuditRepository(env.DB);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // ─── Internal endpoints (called by Worker router) ─────
    if (url.pathname === '/internal/exists') {
      const lobby = await this.repo.getLobby();
      if (lobby && lobby.status !== LobbyStatus.CLOSED) {
        return new Response('exists', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }

    if (url.pathname === '/internal/create' && request.method === 'POST') {
      return this.handleCreateLobby(request);
    }

    // ─── WebSocket upgrade ────────────────────────────────
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade();
    }

    return new Response('not found', { status: 404 });
  }

  // ─── Lobby Creation (HTTP) ──────────────────────────────

  private async handleCreateLobby(request: Request): Promise<Response> {
    const existing = await this.repo.getLobby();
    if (existing && existing.status !== LobbyStatus.CLOSED) {
      return Response.json({ ok: false, error: 'Lobby already exists' }, { status: 409 });
    }

    const body = (await request.json()) as {
      lobbyCode: string;
      displayName: string;
      settings?: Partial<typeof DEFAULT_LOBBY_SETTINGS>;
    };

    const displayName = validateDisplayName(body.displayName);
    const playerId = crypto.randomUUID();
    const reconnectToken = generateToken();
    const now = new Date().toISOString();

    const settings = { ...DEFAULT_LOBBY_SETTINGS, ...body.settings };

    const lobby: LobbyState = {
      code: body.lobbyCode,
      status: LobbyStatus.WAITING,
      hostPlayerId: playerId,
      players: [
        {
          playerId,
          displayName,
          isHost: true,
          ready: false,
          connected: true,
          alive: true,
          reconnectToken,
          joinedAt: now,
        },
      ],
      settings,
      sessionId: null,
      createdAt: now,
      updatedAt: now,
    };

    // If there was old state from a previous game, clear it
    if (existing) {
      await this.state.storage.deleteAll();
    }

    await this.repo.saveLobby(lobby);
    await this.repo.savePlayerRecord(playerId, { reconnectToken, tokenIssuedAt: Date.now() });

    return Response.json({ playerId, reconnectToken });
  }

  // ─── WebSocket Upgrade ──────────────────────────────────

  private handleWebSocketUpgrade(): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);
    (server as any).serializeAttachment({ playerId: null } satisfies WsAttachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ─── Hibernatable WebSocket Handlers ────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);

    // Restore phase alarm if needed (defensive, on any wake)
    await this.restoreAlarmIfNeeded();

    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      this.sendMessage(ws, { type: 'error', payload: { code: parsed.code, message: parsed.message } });
      return;
    }

    const { type, seq, payload } = parsed;

    // Authentication gate: only joinLobby and rejoinLobby allowed before auth
    const attachment = (ws as any).deserializeAttachment() as WsAttachment;
    if (!attachment.playerId && type !== 'joinLobby' && type !== 'rejoinLobby') {
      this.sendMessage(ws, {
        type: 'error',
        ref: seq,
        payload: { code: 'NOT_AUTHENTICATED', message: 'Send joinLobby or rejoinLobby first' },
      });
      return;
    }

    const ctx = this.createHandlerContext();
    let result: HandlerResult;

    switch (type) {
      case 'joinLobby':
        result = await handleJoinLobby(ctx, ws, payload as any);
        break;
      case 'rejoinLobby':
        result = await handleRejoinLobby(ctx, ws, payload as any);
        break;
      case 'kickPlayer':
        result = await handleKickPlayer(ctx, ws, payload as any);
        break;
      case 'startGame':
        result = await handleStartGame(ctx, ws);
        break;
      case 'submitIntent':
        result = await handleSubmitIntent(ctx, ws, payload as any);
        break;
      default:
        result = { ok: false, code: 'UNKNOWN_TYPE', message: `Unknown type: ${type}` };
    }

    if (result.ok) {
      this.sendMessage(ws, { type: 'ack', ref: seq, payload: { data: result.data } });
    } else {
      this.sendMessage(ws, { type: 'error', ref: seq, payload: { code: result.code, message: result.message } });
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const attachment = (ws as any).deserializeAttachment() as WsAttachment;
    if (!attachment.playerId) return;

    const playerId = attachment.playerId;

    // Mark disconnected in player record
    const record = await this.repo.getPlayerRecord(playerId);
    if (record) {
      await this.repo.savePlayerRecord(playerId, { ...record, lastDisconnectedAt: Date.now() });
    }

    // Mark disconnected in lobby state
    const lobby = await this.repo.getLobby();
    if (lobby) {
      const player = lobby.players.find((p) => p.playerId === playerId);
      if (player) {
        player.connected = false;
        lobby.updatedAt = new Date().toISOString();
        await this.repo.saveLobby(lobby);
        this.broadcastLobbyState(lobby);
      }
    }

    // Mark disconnected in session state
    const session = await this.repo.getSession();
    if (session && session.players[playerId]) {
      session.players[playerId].connected = false;
      await this.repo.saveSession(session);
      this.broadcastSessionState(session);
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    // Treat errors as disconnections
    await this.webSocketClose(ws, 1011, 'WebSocket error');
  }

  // ─── Alarm (Phase Timer) ────────────────────────────────

  async alarm(): Promise<void> {
    const deadline = await this.repo.getPhaseDeadline();
    if (!deadline) return;

    const lobby = await this.repo.getLobby();
    const session = await this.repo.getSession();
    if (!lobby || !session || session.status !== SessionStatus.ACTIVE) {
      await this.repo.clearPhaseDeadline();
      return;
    }

    // Verify this alarm matches current state
    if (session.phase !== deadline.phase || session.cycle !== deadline.cycle) {
      await this.repo.clearPhaseDeadline();
      return;
    }

    const now = new Date().toISOString();
    const events = reconcileSessionRuntime(session, lobby, lobby.settings, now);

    await this.repo.saveSession(session);
    await this.repo.saveLobby(lobby);
    await persistRuntimeEvents(this.auditRepo, session.gameId, events);

    // Check if game ended (win condition reached during reconciliation)
    if (session.status !== SessionStatus.ACTIVE) {
      await this.handleGameEnd(session, lobby);
      return;
    }

    // Set next alarm if game is still active
    if (session.timers.currentPhaseEndsAt) {
      const nextDeadlineMs = new Date(session.timers.currentPhaseEndsAt).getTime();
      await this.repo.savePhaseDeadline({ phase: session.phase, cycle: session.cycle, deadlineMs: nextDeadlineMs });
      await this.state.storage.setAlarm(nextDeadlineMs);
    } else {
      await this.repo.clearPhaseDeadline();
    }

    this.broadcastSessionState(session);
    this.broadcastLobbyState(lobby);
  }

  // ─── Game End Cleanup ───────────────────────────────────

  private async handleGameEnd(session: GameState, lobby: LobbyState): Promise<void> {
    // Clear phase timer
    await this.repo.clearPhaseDeadline();
    await this.state.storage.deleteAlarm();

    // Write final audit record
    try {
      await this.auditRepo.appendSessionEvent({
        gameId: session.gameId,
        type: 'GAME_ENDED',
        payload: { status: session.status, winnerTeam: session.winnerTeam },
      });
    } catch { /* non-fatal */ }

    // Update lobby status
    lobby.status = LobbyStatus.CLOSED;
    lobby.updatedAt = new Date().toISOString();
    await this.repo.saveLobby(lobby);

    // Final broadcast
    this.broadcastSessionState(session);
    this.broadcastLobbyState(lobby);

    // Invalidate all reconnect tokens (spec: "All tokens are invalidated when the game ends")
    const playerIds = lobby.players.map((p) => p.playerId);
    await this.repo.deleteAllPlayerRecords(playerIds);

    // Close all WebSocket connections after a short delay (let final state arrive)
    setTimeout(() => {
      for (const ws of this.state.getWebSockets()) {
        try { ws.close(1000, 'Game ended'); } catch { /* already closed */ }
      }
    }, 3000);
  }

  // ─── Private Helpers ────────────────────────────────────

  private createHandlerContext(): HandlerContext {
    return {
      repo: this.repo,
      auditRepo: this.auditRepo,
      getPlayerIdForWs: (ws) => {
        const att = (ws as any).deserializeAttachment() as WsAttachment;
        return att.playerId;
      },
      setPlayerIdForWs: (ws, playerId) => {
        (ws as any).serializeAttachment({ playerId } satisfies WsAttachment);
      },
      broadcastLobbyState: (lobby) => this.broadcastLobbyState(lobby),
      broadcastSessionState: (session) => this.broadcastSessionState(session),
      closeWsForPlayer: (playerId, code, reason) => this.closeWsForPlayer(playerId, code, reason),
      setPhaseAlarm: async (deadlineMs, phase, cycle) => {
        await this.repo.savePhaseDeadline({ phase, cycle, deadlineMs });
        await this.state.storage.setAlarm(deadlineMs);
      },
      clearPhaseAlarm: async () => {
        await this.repo.clearPhaseDeadline();
        await this.state.storage.deleteAlarm();
      },
    };
  }

  private broadcastLobbyState(lobby: LobbyState): void {
    const view = toLobbyView(lobby);
    const msg: ServerMessage = { type: 'lobbyState', payload: view };
    const raw = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(raw); } catch { /* dead socket */ }
    }
  }

  private broadcastSessionState(session: GameState): void {
    for (const ws of this.state.getWebSockets()) {
      const attachment = (ws as any).deserializeAttachment() as WsAttachment;
      if (!attachment.playerId) continue;
      const view = toPlayerSessionView(session, attachment.playerId);
      const msg: ServerMessage = { type: 'sessionState', payload: view };
      try { ws.send(JSON.stringify(msg)); } catch { /* dead socket */ }
    }
  }

  private closeWsForPlayer(playerId: string, code: number, reason: string): void {
    for (const ws of this.state.getWebSockets()) {
      const attachment = (ws as any).deserializeAttachment() as WsAttachment;
      if (attachment.playerId === playerId) {
        try {
          this.sendMessage(ws, { type: 'kicked', payload: { reason } });
          ws.close(code, reason);
        } catch { /* already closed */ }
      }
    }
  }

  private sendMessage(ws: WebSocket, msg: ServerMessage): void {
    try { ws.send(JSON.stringify(msg)); } catch { /* dead socket */ }
  }

  private async restoreAlarmIfNeeded(): Promise<void> {
    const deadline = await this.repo.getPhaseDeadline();
    if (!deadline) return;

    const currentAlarm = await this.state.storage.getAlarm();
    if (currentAlarm) return; // Alarm already set

    if (deadline.deadlineMs <= Date.now()) {
      // Missed deadline - process immediately
      await this.alarm();
    } else {
      // Re-register alarm
      await this.state.storage.setAlarm(deadline.deadlineMs);
    }
  }
}
```

- [ ] **Step 2: Verify the project compiles**

```bash
cd apps/server && npx tsc --noEmit
```
Expected: No type errors. If there are import path issues, fix them.

- [ ] **Step 3: Verify wrangler starts and health route works**

```bash
cd apps/server && npx wrangler dev
```
Test: `curl http://localhost:8787/health`
Expected: `{"ok":true,...}`

Stop wrangler.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/
git commit -m "feat: implement GameRoomDO with full lobby+game lifecycle, alarms, per-player broadcast"
```

---

## Task 10: Client WebSocket Wrapper

**Files:**
- Create: `apps/web/src/lib/game-socket.ts`

- [ ] **Step 1: Create `apps/web/src/lib/game-socket.ts`**

```typescript
/**
 * Lightweight WebSocket client for TattleTale game protocol.
 * Handles connect, reconnect, request-response via seq/ref, and server pushes.
 */

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
type Listener = (payload: unknown) => void;
type StateListener = (state: ConnectionState) => void;

export class GameSocket {
  private ws = null;
  private url = '';
  private seq = 0;
  private state_ = 'disconnected';
  private pending = new Map();
  private listeners = new Map();
  private stateListeners = new Set();
  private credentials = null;
  private reconnectTimer = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private shouldReconnect = false;

  get state() {
    return this.state_;
  }

  connect(url) {
    this.url = url;
    this.shouldReconnect = true;
    this.reconnectDelay = 1000;
    this.doConnect();
  }

  close() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'Client closed');
      this.ws = null;
    }
    this.rejectAllPending('Connection closed');
    this.setState('disconnected');
  }

  send(type, payload) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.state_ !== 'connected') {
        reject(new Error('Not connected'));
        return;
      }
      const s = ++this.seq;
      const timeout = setTimeout(() => {
        this.pending.delete(s);
        reject(new Error('Ack timeout'));
      }, 10000);
      this.pending.set(s, { resolve, reject, timeout });
      this.ws.send(JSON.stringify({ type, seq: s, payload }));
    });
  }

  on(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }

  off(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  onStateChange(handler) {
    this.stateListeners.add(handler);
    return () => this.stateListeners.delete(handler);
  }

  setCredentials(playerId, reconnectToken) {
    this.credentials = { playerId, reconnectToken };
  }

  clearCredentials() {
    this.credentials = null;
  }

  // ─── Private ─────────────────────────────────────────

  doConnect() {
    this.setState(this.state_ === 'disconnected' ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(this.url);

    ws.onopen = () => {
      this.ws = ws;
      this.reconnectDelay = 1000;
      this.setState('connected');

      // Auto-rejoin if we have credentials
      if (this.credentials) {
        this.send('rejoinLobby', {
          playerId: this.credentials.playerId,
          reconnectToken: this.credentials.reconnectToken,
        }).then((resp) => {
          // Update token from rotation
          if (resp?.payload?.data?.reconnectToken) {
            this.credentials.reconnectToken = resp.payload.data.reconnectToken;
          }
        }).catch(() => {
          // Rejoin failed - emit for app layer to handle
          this.emit('rejoinFailed', {});
        });
      }
    };

    ws.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      // Handle ack/error responses to pending requests
      if (msg.ref != null && this.pending.has(msg.ref)) {
        const { resolve, reject, timeout } = this.pending.get(msg.ref);
        clearTimeout(timeout);
        this.pending.delete(msg.ref);
        if (msg.type === 'error') {
          reject(Object.assign(new Error(msg.payload?.message ?? 'Error'), { code: msg.payload?.code }));
        } else {
          resolve(msg);
        }
        return;
      }

      // Handle server pushes
      this.emit(msg.type, msg.payload);
    };

    ws.onclose = (event) => {
      this.ws = null;
      this.rejectAllPending('Connection lost');

      if (this.shouldReconnect && event.code !== 4001) {
        // 4001 = kicked, don't reconnect
        this.scheduleReconnect();
      } else {
        this.setState('disconnected');
        if (event.code === 4001) {
          this.emit('kicked', { reason: event.reason });
        }
      }
    };

    ws.onerror = () => {
      // onclose will fire after this
    };
  }

  scheduleReconnect() {
    const jitter = Math.random() * 0.3 * this.reconnectDelay;
    const delay = this.reconnectDelay + jitter;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  rejectAllPending(reason) {
    for (const [seq, { reject, timeout }] of this.pending) {
      clearTimeout(timeout);
      reject(new Error(reason));
    }
    this.pending.clear();
  }

  emit(type, payload) {
    const handlers = this.listeners.get(type);
    if (handlers) {
      for (const h of handlers) {
        try { h(payload); } catch { /* listener error */ }
      }
    }
  }

  setState(s) {
    if (this.state_ === s) return;
    this.state_ = s;
    for (const h of this.stateListeners) {
      try { h(s); } catch { /* listener error */ }
    }
  }
}
```

Note: This is plain JS-compatible (no TypeScript syntax) to match the frontend's `.jsx` convention. If the project later adds TS to the frontend, types can be added.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/game-socket.ts
git commit -m "feat: add GameSocket client wrapper with reconnect and seq/ref correlation"
```

---

## Task 11: Frontend Store API Update

**Files:**
- Modify: `apps/web/src/os/store/storeApi.js`

The store API already uses `VITE_SERVER_URL` env var, so it will automatically point to the new Worker URL when configured. The only change needed is documenting the new default.

- [ ] **Step 1: Verify `apps/web/src/os/store/storeApi.js` uses env var**

Read the file and confirm it uses `import.meta.env?.VITE_SERVER_URL`. If it does, no code change is needed - just set the env var when running with the new backend.

The frontend's `vite.config.js` can optionally be updated to proxy `/api` and `/store` routes to the wrangler dev server, but this is not required since CORS is already configured.

- [ ] **Step 2: Commit (if any changes were needed)**

```bash
git add apps/web/
git commit -m "chore: verify frontend store API compatibility with CF Worker"
```

---

## Task 12: Vitest Configuration for Workers

**Files:**
- Create or update: `apps/server/vitest.config.ts`

- [ ] **Step 1: Create `apps/server/vitest.config.ts`**

```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    globals: true,
    pool: '@cloudflare/vitest-pool-workers',
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          compatibilityDate: '2025-04-01',
          compatibilityFlags: ['nodejs_compat'],
        },
      },
    },
    // Keep domain tests running in default pool (they don't need Workers runtime)
    include: ['src/**/*.test.ts'],
  },
});
```

Note: The existing `runtime-domain.test.ts` tests pure functions and should run without changes. The `@cloudflare/vitest-pool-workers` pool gives tests access to Workers APIs (Durable Objects, D1) but pure function tests work in both pools.

- [ ] **Step 2: Verify existing domain tests pass**

```bash
cd apps/server && npx vitest run src/domain/game/runtime-domain.test.ts
```
Expected: All existing tests PASS.

```bash
cd apps/server && npx vitest run src/domain/projections.test.ts
```
Expected: All projection tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/server/vitest.config.ts
git commit -m "chore: add vitest config with CF Workers pool for integration tests"
```

---

## Task 13: Integration Smoke Test

**Files:**
- Create: `apps/server/src/durable-objects/game-room.test.ts`

A basic integration test that exercises the DO lifecycle via `SELF.fetch()` and WebSocket connections using the Miniflare test environment.

- [ ] **Step 1: Create `apps/server/src/durable-objects/game-room.test.ts`**

```typescript
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('GameRoomDO integration', () => {
  it('health endpoint returns ok', async () => {
    const resp = await SELF.fetch('http://localhost/health');
    const body = (await resp.json()) as { ok: boolean };
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('creates a lobby via HTTP', async () => {
    const resp = await SELF.fetch('http://localhost/api/lobby/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'TestHost' }),
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      lobbyCode: string;
      playerId: string;
      reconnectToken: string;
      wsUrl: string;
    };
    expect(body.ok).toBe(true);
    expect(body.lobbyCode).toBeTruthy();
    expect(body.playerId).toBeTruthy();
    expect(body.reconnectToken).toBeTruthy();
    expect(body.wsUrl).toContain('/api/lobby/');
  });

  it('ready endpoint checks D1', async () => {
    const resp = await SELF.fetch('http://localhost/ready');
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { d1: string };
    expect(body.d1).toBe('ok');
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
cd apps/server && npx vitest run src/durable-objects/game-room.test.ts
```
Expected: All tests PASS. If there are import/config issues, fix them.

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/durable-objects/game-room.test.ts
git commit -m "test: add integration smoke tests for health, lobby creation, and D1"
```

---

## Task 14: Cleanup - Remove Old Infrastructure

**Files:**
- Delete: `apps/server/src/app.ts`
- Delete: `apps/server/src/app.test.ts`
- Delete: `apps/server/src/infra/` (entire directory)
- Delete: `apps/server/src/transport/http/` (entire directory)
- Delete: `apps/server/src/transport/socket/` (entire directory)
- Delete: `apps/server/prisma/` (entire directory)
- Delete: `apps/server/src/config/env.test.ts` (tests old Zod env schema)
- Modify: `apps/server/src/domain/lobby/types.ts` (ensure DEFAULT_LOBBY_SETTINGS is exported)

- [ ] **Step 1: Delete old infrastructure files**

```bash
cd apps/server
rm -f src/app.ts src/app.test.ts src/config/env.test.ts
rm -rf src/infra/
rm -rf src/transport/http/
rm -rf src/transport/socket/
rm -rf prisma/
```

- [ ] **Step 2: Verify the project still compiles**

```bash
cd apps/server && npx tsc --noEmit
```
Expected: No errors. If there are broken imports (e.g., old files importing deleted modules), fix them.

- [ ] **Step 3: Verify all tests pass**

```bash
cd apps/server && npx vitest run
```
Expected: Domain tests and integration tests pass. Old tests referencing deleted files should have been removed in Step 1.

- [ ] **Step 4: Update root `run.sh`**

Read `run.sh` and replace the server startup command. The `server` mode should now run `npx wrangler dev` in `apps/server/` instead of the old `tsx watch` command. The `web` mode stays the same.

- [ ] **Step 5: Update `.github/workflows/pr-backend-integrity.yml`**

Replace the backend CI workflow steps. Remove PostgreSQL and Redis service containers. Replace with:
1. Checkout
2. Setup Node 20
3. `npm ci`
4. Build shared: `npm run build -w @tattletale/shared`
5. Typecheck: `cd apps/server && npx tsc --noEmit`
6. Test: `cd apps/server && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove old Fastify/Socket.IO/Prisma/Redis infrastructure, update CI"
```

---

## Execution Checklist

After all tasks are complete:

1. `cd apps/server && npx wrangler dev` starts the Worker locally
2. `curl http://localhost:8787/health` returns `{"ok":true,...}`
3. `curl http://localhost:8787/ready` returns `{"d1":"ok"}`
4. `POST http://localhost:8787/api/lobby/create` creates a lobby and returns a WS URL
5. WebSocket connects to `/api/lobby/{code}/ws` and can join/rejoin
6. `cd apps/server && npx vitest run` passes all tests
7. Domain logic tests (`runtime-domain.test.ts`) still pass unchanged
8. No old infrastructure files remain (no Fastify, Socket.IO, Prisma, Redis imports)
