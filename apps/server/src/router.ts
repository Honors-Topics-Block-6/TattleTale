import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { generateLobbyCode } from './domain/lobby/lobby-code.js';
import { installedApps, users, userSessions } from '../drizzle/schema.js';
import type { Env } from './config/env.js';

const MAX_LOBBY_CODE_ATTEMPTS = 12;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function hashPassword(password: string, saltB64: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: fromBase64(saltB64),
      iterations: 120_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return toBase64(new Uint8Array(derived));
}

async function createPasswordHash(password: string): Promise<{ salt: string; hash: string }> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltB64 = toBase64(salt);
  const hash = await hashPassword(password, saltB64);
  return { salt: saltB64, hash };
}

async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const hash = await hashPassword(password, salt);
  if (hash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i += 1) diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

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

  const authBodySchema = z.object({
    email: z.string().email().max(200),
    password: z.string().min(8).max(200),
  });
  const registerBodySchema = authBodySchema.extend({
    displayName: z.string().min(2).max(24),
  });

  router.post('/api/auth/register', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = registerBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid body' }, 400);
    }
    const db = drizzle(c.env.DB);
    const email = parsed.data.email.trim().toLowerCase();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return c.json({ ok: false, error: 'Email already registered' }, 409);
    }

    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const token = crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const { salt, hash } = await createPasswordHash(parsed.data.password);

    await db.insert(users).values({
      id: userId,
      email,
      passwordHash: hash,
      passwordSalt: salt,
      displayName: parsed.data.displayName.trim(),
      avatar: null,
      totalPoints: 0,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(userSessions).values({
      id: sessionId,
      userId,
      token,
      expiresAt,
      revokedAt: null,
      createdAt: now,
    });

    return c.json({
      ok: true,
      token,
      user: {
        id: userId,
        email,
        displayName: parsed.data.displayName.trim(),
        avatar: null,
        totalPoints: 0,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
      },
    });
  });

  router.post('/api/auth/login', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = authBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid body' }, 400);
    }
    const db = drizzle(c.env.DB);
    const email = parsed.data.email.trim().toLowerCase();
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    if (!user) {
      return c.json({ ok: false, error: 'Invalid credentials' }, 401);
    }
    const valid = await verifyPassword(parsed.data.password, user.passwordSalt, user.passwordHash);
    if (!valid) {
      return c.json({ ok: false, error: 'Invalid credentials' }, 401);
    }

    const now = new Date().toISOString();
    const token = crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await db.insert(userSessions).values({
      id: crypto.randomUUID(),
      userId: user.id,
      token,
      expiresAt,
      revokedAt: null,
      createdAt: now,
    });
    return c.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        totalPoints: user.totalPoints,
        gamesPlayed: user.gamesPlayed,
        wins: user.wins,
        losses: user.losses,
      },
    });
  });

  router.post('/api/auth/logout', async (c) => {
    const token = extractBearerToken(c.req.header('authorization'));
    if (!token) return c.json({ ok: true });
    const now = new Date().toISOString();
    await c.env.DB.prepare('UPDATE user_sessions SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL')
      .bind(now, token)
      .run();
    return c.json({ ok: true });
  });

  router.get('/api/auth/me', async (c) => {
    const token = extractBearerToken(c.req.header('authorization'));
    if (!token) return c.json({ ok: false, error: 'Unauthorized' }, 401);
    const result = await c.env.DB.prepare(`
      SELECT
        u.id,
        u.email,
        u.display_name AS displayName,
        u.avatar,
        u.total_points AS totalPoints,
        u.games_played AS gamesPlayed,
        u.wins,
        u.losses
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > ?
      LIMIT 1
    `).bind(token, new Date().toISOString()).all();
    const user = (result as any).results?.[0];
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401);
    return c.json({ ok: true, user });
  });

  const updateProfileSchema = z.object({
    displayName: z.string().min(2).max(24).optional(),
    avatar: z.string().max(2000).nullable().optional(),
  });

  router.put('/api/profile', async (c) => {
    const token = extractBearerToken(c.req.header('authorization'));
    if (!token) return c.json({ ok: false, error: 'Unauthorized' }, 401);
    const body = await c.req.json().catch(() => null);
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid body' }, 400);

    const sessionResult = await c.env.DB.prepare(`
      SELECT u.id
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > ?
      LIMIT 1
    `).bind(token, new Date().toISOString()).all();
    const sessionUser = (sessionResult as any).results?.[0];
    if (!sessionUser?.id) return c.json({ ok: false, error: 'Unauthorized' }, 401);

    const now = new Date().toISOString();
    await c.env.DB.prepare(`
      UPDATE users
      SET
        display_name = COALESCE(?, display_name),
        avatar = CASE WHEN ? = 1 THEN ? ELSE avatar END,
        updated_at = ?
      WHERE id = ?
    `).bind(
      parsed.data.displayName ?? null,
      parsed.data.avatar !== undefined ? 1 : 0,
      parsed.data.avatar ?? null,
      now,
      sessionUser.id,
    ).run();

    const updated = await c.env.DB.prepare(`
      SELECT
        id,
        email,
        display_name AS displayName,
        avatar,
        total_points AS totalPoints,
        games_played AS gamesPlayed,
        wins,
        losses
      FROM users
      WHERE id = ?
      LIMIT 1
    `).bind(sessionUser.id).all();
    return c.json({ ok: true, user: (updated as any).results?.[0] ?? null });
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
          id AS accountId,
          display_name AS displayName,
          total_points AS totalPoints,
          games_played AS gamesPlayed,
          wins,
          RANK() OVER (ORDER BY total_points DESC) AS rank
        FROM users
      )
      SELECT accountId, displayName, totalPoints, gamesPlayed, wins, rank
      FROM ranked
      ORDER BY totalPoints DESC, displayName ASC, accountId ASC
      LIMIT ? OFFSET ?
    `).bind(limit, offset);

    const totalStmt = c.env.DB.prepare('SELECT COUNT(*) AS total FROM users');
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
            id AS accountId,
            display_name AS displayName,
            total_points AS totalPoints,
            games_played AS gamesPlayed,
            wins,
            RANK() OVER (ORDER BY total_points DESC) AS rank
          FROM users
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
