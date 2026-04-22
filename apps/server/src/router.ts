import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { generateLobbyCode } from './domain/lobby/lobby-code.js';
import { installedApps, userAvatarUnlocks, users } from '../drizzle/schema.js';
import type { Env } from './config/env.js';

const MAX_LOBBY_CODE_ATTEMPTS = 12;
const DEFAULT_AVATAR_ID = 'avatar-default';
const DEFAULT_AVATAR_ICON = '🙂';
const AVATAR_CATALOG = [
  { id: DEFAULT_AVATAR_ID, name: 'Classic', icon: DEFAULT_AVATAR_ICON, cost: 0 },
  { id: 'avatar-detective', name: 'Detective', icon: '🕵️', cost: 80 },
  { id: 'avatar-robot', name: 'Cipher Bot', icon: '🤖', cost: 120 },
  { id: 'avatar-ghost', name: 'Ghost', icon: '👻', cost: 160 },
  { id: 'avatar-wizard', name: 'Arcane Hacker', icon: '🧙', cost: 220 },
  { id: 'avatar-alien', name: 'Signal Alien', icon: '👽', cost: 300 },
] as const;

function getAvatarById(avatarId: string) {
  return AVATAR_CATALOG.find((avatar) => avatar.id === avatarId) ?? null;
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

  const accountBodySchema = z.object({
    accountId: z.string().uuid(),
    displayName: z.string().min(2).max(24),
  });

  router.post('/api/account/init', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = accountBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid body' }, 400);
    }
    const { accountId, displayName } = parsed.data;
    const now = new Date().toISOString();
    const db = drizzle(c.env.DB);
    const existing = await db.select().from(users).where(eq(users.id, accountId)).limit(1);
    if (existing.length === 0) {
      await db.insert(users).values({
        id: accountId,
        displayName,
        avatar: DEFAULT_AVATAR_ICON,
        totalPoints: 0,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(userAvatarUnlocks).values({
        userId: accountId,
        avatarId: DEFAULT_AVATAR_ID,
        unlockedAt: now,
      }).onConflictDoNothing();
    } else {
      await db.update(users).set({ displayName, updatedAt: now }).where(eq(users.id, accountId));
    }
    const user = (await db.select().from(users).where(eq(users.id, accountId)).limit(1))[0];
    return c.json({ ok: true, user });
  });

  router.get('/api/account/:accountId', async (c) => {
    const accountId = c.req.param('accountId');
    if (!z.string().uuid().safeParse(accountId).success) {
      return c.json({ ok: false, error: 'Invalid accountId' }, 400);
    }
    const db = drizzle(c.env.DB);
    const user = (await db.select().from(users).where(eq(users.id, accountId)).limit(1))[0];
    if (!user) {
      return c.json({ ok: false, error: 'Account not found' }, 404);
    }
    const unlocks = await db.select().from(userAvatarUnlocks).where(eq(userAvatarUnlocks.userId, accountId));
    return c.json({
      ok: true,
      user,
      ownedAvatarIds: Array.from(new Set([DEFAULT_AVATAR_ID, ...unlocks.map((u) => u.avatarId)])),
    });
  });

  const purchaseBodySchema = z.object({
    accountId: z.string().uuid(),
    avatarId: z.string().min(1).max(64),
  });

  router.get('/api/avatar/catalog', async (c) => {
    const accountId = c.req.query('accountId');
    let ownedAvatarIds: string[] = [DEFAULT_AVATAR_ID];
    if (accountId && z.string().uuid().safeParse(accountId).success) {
      const db = drizzle(c.env.DB);
      const unlocks = await db.select().from(userAvatarUnlocks).where(eq(userAvatarUnlocks.userId, accountId));
      ownedAvatarIds = Array.from(new Set([DEFAULT_AVATAR_ID, ...unlocks.map((u) => u.avatarId)]));
    }
    return c.json({
      ok: true,
      avatars: AVATAR_CATALOG,
      ownedAvatarIds,
    });
  });

  router.post('/api/avatar/purchase', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = purchaseBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid body' }, 400);
    const { accountId, avatarId } = parsed.data;
    const avatar = getAvatarById(avatarId);
    if (!avatar) return c.json({ ok: false, error: 'Avatar not found' }, 404);

    const db = drizzle(c.env.DB);
    const user = (await db.select().from(users).where(eq(users.id, accountId)).limit(1))[0];
    if (!user) return c.json({ ok: false, error: 'Account not found' }, 404);

    const unlockExists = await db
      .select()
      .from(userAvatarUnlocks)
      .where(eq(userAvatarUnlocks.userId, accountId));
    const alreadyOwned = avatar.id === DEFAULT_AVATAR_ID || unlockExists.some((u) => u.avatarId === avatar.id);
    if (alreadyOwned) {
      return c.json({ ok: true, alreadyOwned: true, totalPoints: user.totalPoints });
    }

    const updateResult = await c.env.DB.prepare(
      'UPDATE users SET total_points = total_points - ?, updated_at = ? WHERE id = ? AND total_points >= ?',
    ).bind(avatar.cost, new Date().toISOString(), accountId, avatar.cost).run();
    if (((updateResult as any).meta?.changes ?? 0) !== 1) {
      return c.json({ ok: false, error: 'INSUFFICIENT_POINTS' }, 400);
    }

    await db.insert(userAvatarUnlocks).values({
      userId: accountId,
      avatarId: avatar.id,
      unlockedAt: new Date().toISOString(),
    }).onConflictDoNothing();

    const updatedUser = (await db.select().from(users).where(eq(users.id, accountId)).limit(1))[0];
    return c.json({ ok: true, purchasedAvatarId: avatar.id, totalPoints: updatedUser?.totalPoints ?? 0 });
  });

  router.post('/api/avatar/equip', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = purchaseBodySchema.safeParse(body);
    if (!parsed.success) return c.json({ ok: false, error: 'Invalid body' }, 400);
    const { accountId, avatarId } = parsed.data;
    const avatar = getAvatarById(avatarId);
    if (!avatar) return c.json({ ok: false, error: 'Avatar not found' }, 404);

    const db = drizzle(c.env.DB);
    const user = (await db.select().from(users).where(eq(users.id, accountId)).limit(1))[0];
    if (!user) return c.json({ ok: false, error: 'Account not found' }, 404);
    if (avatar.id !== DEFAULT_AVATAR_ID) {
      const ownedRows = await db.select().from(userAvatarUnlocks).where(eq(userAvatarUnlocks.userId, accountId));
      if (!ownedRows.some((row) => row.avatarId === avatar.id)) {
        return c.json({ ok: false, error: 'Avatar not owned' }, 400);
      }
    }

    await db.update(users).set({
      avatar: avatar.icon,
      updatedAt: new Date().toISOString(),
    }).where(eq(users.id, accountId));

    return c.json({ ok: true, activeAvatarId: avatar.id, activeAvatar: avatar.icon });
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
    avatar: z.string().max(16).optional(),
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
          avatar: parsed.data.avatar ?? null,
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

  return router;
}
