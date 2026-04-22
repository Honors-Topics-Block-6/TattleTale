import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
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

  // Health
  router.get('/health', (c) =>
    c.json({ ok: true, service: 'tattletale-server', timestamp: new Date().toISOString() }),
  );

  router.get('/ready', async (c) => {
    try {
      await c.env.DB.prepare('SELECT 1').run();
      return c.json({ d1: 'ok' });
    } catch {
      return c.json({ d1: 'error' }, 503);
    }
  });

  // Store routes
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

  // Lobby Create (HTTP)
  const createLobbyBodySchema = z.object({
    displayName: z.string().min(2).max(24),
    accountId: z.string().uuid().optional(),
    settings: z
      .object({
        minPlayers: z.number().int().min(1).max(20).optional(),
        maxPlayers: z.number().int().min(1).max(20).optional(),
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

    let lobbyCode: string | null = null;
    for (let i = 0; i < MAX_LOBBY_CODE_ATTEMPTS; i++) {
      const candidate = generateLobbyCode();
      const doId = c.env.GAME_ROOM.idFromName(candidate);
      const stub = c.env.GAME_ROOM.get(doId);
      const checkResp = await stub.fetch(new Request('http://do/internal/exists'));
      if (checkResp.status === 404) {
        lobbyCode = candidate;
        break;
      }
    }
    if (!lobbyCode) {
      return c.json({ ok: false, error: 'Could not generate unique lobby code' }, 503);
    }

    const doId = c.env.GAME_ROOM.idFromName(lobbyCode);
    const stub = c.env.GAME_ROOM.get(doId);
    const doResp = await stub.fetch(
      new Request('http://do/internal/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyCode,
          displayName: parsed.data.displayName,
          accountId: parsed.data.accountId,
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

  // WebSocket Upgrade
  router.get('/api/lobby/:code/ws', async (c) => {
    const code = c.req.param('code').toUpperCase();
    const doId = c.env.GAME_ROOM.idFromName(code);
    const stub = c.env.GAME_ROOM.get(doId);
    return stub.fetch(c.req.raw);
  });

  const leaderboardQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
    accountId: z.string().uuid().optional(),
  });

  router.get('/api/leaderboard', async (c) => {
    const parsed = leaderboardQuerySchema.safeParse({
      limit: c.req.query('limit') ?? undefined,
      offset: c.req.query('offset') ?? undefined,
      accountId: c.req.query('accountId') ?? undefined,
    });

    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid query params' }, 400);
    }

    const { limit, offset, accountId } = parsed.data;
    const leaderboardStmt = c.env.DB.prepare(`
      WITH ranked AS (
        SELECT
          account_id AS accountId,
          display_name AS displayName,
          total_points AS totalPoints,
          games_played AS gamesPlayed,
          wins,
          RANK() OVER (ORDER BY total_points DESC) AS rank
        FROM user_points
      )
      SELECT accountId, displayName, totalPoints, gamesPlayed, wins, rank
      FROM ranked
      ORDER BY totalPoints DESC, displayName ASC, accountId ASC
      LIMIT ? OFFSET ?
    `).bind(limit, offset);

    const totalStmt = c.env.DB.prepare('SELECT COUNT(*) AS total FROM user_points');
    const [leaderboardResult, totalResult] = await c.env.DB.batch([leaderboardStmt, totalStmt]);
    const entries = ((leaderboardResult as any).results ?? []) as Array<{
      accountId: string;
      displayName: string;
      totalPoints: number;
      gamesPlayed: number;
      wins: number;
      rank: number;
    }>;
    const total = Number((totalResult as any).results?.[0]?.total ?? 0);

    let currentUser: (typeof entries)[number] | null = null;
    if (accountId) {
      const userRankStmt = c.env.DB.prepare(`
        WITH ranked AS (
          SELECT
            account_id AS accountId,
            display_name AS displayName,
            total_points AS totalPoints,
            games_played AS gamesPlayed,
            wins,
            RANK() OVER (ORDER BY total_points DESC) AS rank
          FROM user_points
        )
        SELECT accountId, displayName, totalPoints, gamesPlayed, wins, rank
        FROM ranked
        WHERE accountId = ?
        LIMIT 1
      `).bind(accountId);
      const userRankResult = await userRankStmt.all();
      currentUser = ((userRankResult as any).results?.[0] ?? null) as typeof currentUser;
    }

    return c.json({
      ok: true,
      entries,
      total,
      limit,
      offset,
      hasMore: offset + entries.length < total,
      currentUser,
    });
  });

  return router;
}
