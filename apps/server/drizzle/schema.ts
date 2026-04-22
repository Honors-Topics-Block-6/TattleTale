import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  lobbyCode: text('lobby_code').notNull(),
  status: text('status').notNull().default('active'),
  phase: text('phase').notNull().default('day_open'),
  cycle: integer('cycle').notNull().default(1),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  settings: text('settings').notNull(),
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
  payload: text('payload').notNull(),
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

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  avatar: text('avatar').notNull().default('🙂'),
  totalPoints: integer('total_points').notNull().default(0),
  gamesPlayed: integer('games_played').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const userAvatarUnlocks = sqliteTable('user_avatar_unlocks', {
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  avatarId: text('avatar_id').notNull(),
  unlockedAt: text('unlocked_at').notNull(),
});
