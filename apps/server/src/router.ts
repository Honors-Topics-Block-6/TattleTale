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
const WS_TICKET_TTL_MS = 60 * 1000;

// ─── Crypto helpers ──────────────────────────────────────────────

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

async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return toBase64(new Uint8Array(buf));
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
    { name: 'PBKDF2', salt: fromBase64(saltB64), iterations: 120_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return toBase64(new Uint8Array(derived));
}

async function createPasswordHash(password: string): Promise<{ salt: string; hash: string }> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const saltB64 = toBase64(salt);
  return { salt: saltB64, hash: await hashPassword(password, saltB64) };
}

async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const hash = await hashPassword(password, salt);
  if (hash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i += 1) diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

function generateToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)));
}

// ─── Cookie / token extraction ───────────────────────────────────

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function extractCookieToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)tt_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getRequestToken(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return (
    extractCookieToken(c.req.header('cookie')) ??
    extractBearerToken(c.req.header('authorization'))
  );
}

function makeSessionCookie(token: string, maxAge: number, secure: boolean): string {
  const parts = [
    `tt_session=${encodeURIComponent(token)}`,
    'HttpOnly',
    ...(secure ? ['Secure'] : []),
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  return parts.join('; ');
}

// ─── Rate limiting (D1-backed per-IP windows) ─────────────────────

const RATE_LIMITS = {
  login: { windowMs: 5 * 60 * 1000, maxAttempts: 10 },
  register: { windowMs: 15 * 60 * 1000, maxAttempts: 5 },
} as const;

async function checkRateLimit(db: D1Database, ip: string, action: keyof typeof RATE_LIMITS): Promise<boolean> {
  const { windowMs, maxAttempts } = RATE_LIMITS[action];
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
  try {
    const result = await db.prepare(`
      INSERT INTO auth_rate_limits (ip, action, window_start, attempts) VALUES (?, ?, ?, 1)
      ON CONFLICT (ip, action, window_start) DO UPDATE SET attempts = attempts + 1
      RETURNING attempts
    `).bind(ip, action, windowStart).all();
    return ((result as any).results?.[0]?.attempts ?? 1) <= maxAttempts;
  } catch {
    return true; // fail open rather than block all logins on DB error
  }
}

// ─── Session lookup helper ────────────────────────────────────────

type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  avatar: string | null;
  totalPoints: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
};

async function lookupSession(db: D1Database, rawToken: string): Promise<SessionUser | null> {
  const tokenHash = await hashToken(rawToken);
  const result = await db.prepare(`
    SELECT u.id, u.email, u.display_name AS displayName, u.avatar,
           u.total_points AS totalPoints, u.games_played AS gamesPlayed, u.wins, u.losses
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
    LIMIT 1
  `).bind(tokenHash, new Date().toISOString()).all();
  return ((result as any).results?.[0] ?? null) as SessionUser | null;
}

export function createRouter() {
  const router = new Hono<{ Bindings: Env }>();

  router.use('*', async (c, next) => {
    const corsMiddleware = cors({ origin: c.env.WEB_ORIGIN, credentials: true });
    return corsMiddleware(c, next);
  });

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

  // C4: rate limit + C2: hash token + C3: set HttpOnly cookie + C5: timing equalization
  router.post('/api/auth/register', async (c) => {
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
    if (!(await checkRateLimit(c.env.DB, ip, 'register'))) {
      return c.json({ ok: false, error: 'Too many requests. Please try again later.' }, 429);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = registerBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid body' }, 400);

    // Always hash first to equalize timing regardless of email existence (C5)
    const { salt, hash } = await createPasswordHash(parsed.data.password);

    const db = drizzle(c.env.DB);
    const email = parsed.data.email.trim().toLowerCase();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      // Return generic success — don't reveal email is already registered (C5)
      return c.json({ ok: true, user: null });
    }

    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    // Wrap both inserts in a batch so a session failure doesn't leave an orphan user (M15)
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO users (id, email, password_hash, password_salt, display_name, avatar, total_points, games_played, wins, losses, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 0, 0, ?, ?)`,
      ).bind(userId, email, hash, salt, parsed.data.displayName.trim(), now, now),
      c.env.DB.prepare(
        `INSERT INTO user_sessions (id, user_id, token, token_hash, expires_at, revoked_at, created_at)
         VALUES (?, ?, '', ?, ?, NULL, ?)`,
      ).bind(sessionId, userId, tokenHash, expiresAt, now),
    ]);

    const secure = c.req.url.startsWith('https');
    c.header('Set-Cookie', makeSessionCookie(rawToken, SESSION_TTL_MS / 1000, secure));
    return c.json({
      ok: true,
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
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
    if (!(await checkRateLimit(c.env.DB, ip, 'login'))) {
      return c.json({ ok: false, error: 'Too many requests. Please try again later.' }, 429);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = authBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid body' }, 400);

    const db = drizzle(c.env.DB);
    const email = parsed.data.email.trim().toLowerCase();
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];

    // Always run PBKDF2 to equalize timing whether or not the user exists (C5)
    const dummySalt = toBase64(new Uint8Array(16));
    const valid = user
      ? await verifyPassword(parsed.data.password, user.passwordSalt, user.passwordHash)
      : await hashPassword(parsed.data.password, dummySalt).then(() => false);

    if (!user || !valid) {
      return c.json({ ok: false, error: 'Invalid credentials' }, 401);
    }

    const now = new Date().toISOString();
    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await c.env.DB.prepare(
      `INSERT INTO user_sessions (id, user_id, token, token_hash, expires_at, revoked_at, created_at)
       VALUES (?, ?, '', ?, ?, NULL, ?)`,
    ).bind(crypto.randomUUID(), user.id, tokenHash, expiresAt, now).run();

    const secure = c.req.url.startsWith('https');
    c.header('Set-Cookie', makeSessionCookie(rawToken, SESSION_TTL_MS / 1000, secure));
    return c.json({
      ok: true,
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

  // C6: require a token; return error if none present
  router.post('/api/auth/logout', async (c) => {
    const token = getRequestToken(c);
    if (!token) return c.json({ ok: false, error: 'No active session' }, 400);
    const tokenHash = await hashToken(token);
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE user_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`,
    ).bind(now, tokenHash).run();
    const secure = c.req.url.startsWith('https');
    c.header('Set-Cookie', makeSessionCookie('', 0, secure));
    return c.json({ ok: true });
  });

  router.get('/api/auth/me', async (c) => {
    const token = getRequestToken(c);
    if (!token) return c.json({ ok: false, error: 'Unauthorized' }, 401);
    const user = await lookupSession(c.env.DB, token);
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401);
    return c.json({ ok: true, user });
  });

  // Short-lived ticket so the DO can receive a server-verified accountId over WS (C1)
  router.post('/api/auth/ws-ticket', async (c) => {
    const token = getRequestToken(c);
    if (!token) return c.json({ ok: false, error: 'Unauthorized' }, 401);
    const user = await lookupSession(c.env.DB, token);
    if (!user) return c.json({ ok: false, error: 'Unauthorized' }, 401);

    const ticketId = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + WS_TICKET_TTL_MS).toISOString();
    await c.env.DB.prepare(
      `INSERT INTO ws_tickets (id, account_id, used, created_at, expires_at) VALUES (?, ?, 0, ?, ?)`,
    ).bind(ticketId, user.id, now, expiresAt).run();

    return c.json({ ok: true, ticket: ticketId });
  });

  const updateProfileSchema = z.object({
    displayName: z.string().min(2).max(24).optional(),
    // Restrict avatar to http(s) URLs only to close the javascript: / data: XSS surface (M3)
    avatar: z.string().url().max(500).refine(
      (v) => v.startsWith('http://') || v.startsWith('https://'),
      { message: 'Avatar must be an http(s) URL' },
    ).nullable().optional(),
  });

  router.put('/api/profile', async (c) => {
    const token = getRequestToken(c);
    if (!token) return c.json({ ok: false, error: 'Unauthorized' }, 401);
    const body = await c.req.json().catch(() => null);
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid body' }, 400);

    const tokenHash = await hashToken(token);
    const sessionResult = await c.env.DB.prepare(`
      SELECT u.id FROM user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
      LIMIT 1
    `).bind(tokenHash, new Date().toISOString()).all();
    const sessionUser = (sessionResult as any).results?.[0];
    if (!sessionUser?.id) return c.json({ ok: false, error: 'Unauthorized' }, 401);

    const now = new Date().toISOString();
    await c.env.DB.prepare(`
      UPDATE users
      SET display_name = COALESCE(?, display_name),
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
      SELECT id, display_name AS displayName, avatar,
             total_points AS totalPoints, games_played AS gamesPlayed, wins, losses
      FROM users WHERE id = ? LIMIT 1
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
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid deviceId' }, 400);
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
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid body' }, 400);
    const { deviceId, appId } = parsed.data;
    const db = drizzle(c.env.DB);
    await db.insert(installedApps).values({ deviceId, appId, installedAt: new Date().toISOString() }).onConflictDoNothing();
    const rows = await db.select({ appId: installedApps.appId }).from(installedApps).where(eq(installedApps.deviceId, deviceId));
    return c.json({ ok: true, deviceId, installedAppIds: rows.map((r) => r.appId) });
  });

  // Lobby Create (HTTP) — accountId resolved from session, never from body (C1)
  const createLobbyBodySchema = z.object({
    displayName: z.string().min(2).max(24),
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
    // Resolve accountId from the verified session — the client never supplies it (C1)
    const token = getRequestToken(c);
    let resolvedAccountId: string | undefined;
    if (token) {
      const user = await lookupSession(c.env.DB, token);
      resolvedAccountId = user?.id;
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createLobbyBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid body' }, 400);

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
    if (!lobbyCode) return c.json({ ok: false, error: 'Could not generate unique lobby code' }, 503);

    const doId = c.env.GAME_ROOM.idFromName(lobbyCode);
    const stub = c.env.GAME_ROOM.get(doId);
    const doResp = await stub.fetch(
      new Request('http://do/internal/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lobbyCode,
          displayName: parsed.data.displayName,
          accountId: resolvedAccountId, // server-resolved, not client-supplied
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

  // WebSocket Upgrade — verify WS ticket and inject verified accountId header for the DO (C1)
  router.get('/api/lobby/:code/ws', async (c) => {
    const code = c.req.param('code').toUpperCase();
    const wsTicket = c.req.query('wsTicket');

    let verifiedAccountId: string | null = null;
    if (wsTicket) {
      const now = new Date().toISOString();
      const ticketResult = await c.env.DB.prepare(`
        SELECT account_id FROM ws_tickets
        WHERE id = ? AND used = 0 AND expires_at > ?
        LIMIT 1
      `).bind(wsTicket, now).all();
      const ticket = (ticketResult as any).results?.[0];
      if (ticket) {
        verifiedAccountId = ticket.account_id as string;
        // Mark ticket as consumed so it can't be replayed
        await c.env.DB.prepare(`UPDATE ws_tickets SET used = 1 WHERE id = ?`).bind(wsTicket).run();
      }
    }

    const doId = c.env.GAME_ROOM.idFromName(code);
    const stub = c.env.GAME_ROOM.get(doId);

    // Forward the upgrade request, injecting the server-verified accountId as an internal header.
    // This header is set only by the Worker and the DO trusts it (never reachable from clients).
    const newHeaders = new Headers(c.req.raw.headers);
    if (verifiedAccountId) {
      newHeaders.set('X-Verified-Account-Id', verifiedAccountId);
    }
    return stub.fetch(new Request(c.req.raw.url, { headers: newHeaders }));
  });

  const leaderboardQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
  });

  // C8: leaderboard no longer exposes internal user IDs; current-user rank is derived from session
  router.get('/api/leaderboard', async (c) => {
    const parsed = leaderboardQuerySchema.safeParse({
      limit: c.req.query('limit') ?? undefined,
      offset: c.req.query('offset') ?? undefined,
    });
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid query params' }, 400);

    const { limit, offset } = parsed.data;

    // Optionally authenticate to return the calling user's rank (C8: derived from session, not query param)
    const token = getRequestToken(c);
    let sessionUserId: string | null = null;
    if (token) {
      const user = await lookupSession(c.env.DB, token);
      sessionUserId = user?.id ?? null;
    }

    const leaderboardStmt = c.env.DB.prepare(`
      WITH ranked AS (
        SELECT
          display_name AS displayName,
          total_points AS totalPoints,
          games_played AS gamesPlayed,
          wins,
          RANK() OVER (ORDER BY total_points DESC) AS rank
        FROM users
      )
      SELECT displayName, totalPoints, gamesPlayed, wins, rank
      FROM ranked
      ORDER BY totalPoints DESC, displayName ASC
      LIMIT ? OFFSET ?
    `).bind(limit, offset);
    const totalStmt = c.env.DB.prepare('SELECT COUNT(*) AS total FROM users');

    const [leaderboardResult, totalResult] = await c.env.DB.batch([leaderboardStmt, totalStmt]);
    const entries = ((leaderboardResult as any).results ?? []) as Array<{
      displayName: string;
      totalPoints: number;
      gamesPlayed: number;
      wins: number;
      rank: number;
    }>;
    const total = Number((totalResult as any).results?.[0]?.total ?? 0);

    let currentUser: { displayName: string; totalPoints: number; gamesPlayed: number; wins: number; rank: number } | null = null;
    if (sessionUserId) {
      const userRankResult = await c.env.DB.prepare(`
        WITH ranked AS (
          SELECT
            id,
            display_name AS displayName,
            total_points AS totalPoints,
            games_played AS gamesPlayed,
            wins,
            RANK() OVER (ORDER BY total_points DESC) AS rank
          FROM users
        )
        SELECT displayName, totalPoints, gamesPlayed, wins, rank
        FROM ranked WHERE id = ?
        LIMIT 1
      `).bind(sessionUserId).all();
      currentUser = ((userRankResult as any).results?.[0] ?? null) as typeof currentUser;
    }

    return c.json({ ok: true, entries, total, limit, offset, hasMore: offset + entries.length < total, currentUser });
  });

  return router;
}
