import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import {
  games,
  gamePlayers,
  sessionAuditEvents,
  messageAuditEvents,
} from '../../drizzle/schema.js';
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
