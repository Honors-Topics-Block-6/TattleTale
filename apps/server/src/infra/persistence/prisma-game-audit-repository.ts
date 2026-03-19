import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  CreateGameRecordInput,
  GameAuditRepository,
  MessageAuditEventInput,
  SessionAuditEventInput,
} from '../../domain/repositories.js';

export class PrismaGameAuditRepository implements GameAuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createGameRecord(input: CreateGameRecordInput): Promise<void> {
    await this.prisma.game.create({
      data: {
        id: input.gameId,
        lobbyCode: input.lobbyCode,
        status: 'ACTIVE',
        currentPhase: input.phase,
        cycle: input.cycle,
        players: {
          create: input.players.map((player) => ({
            playerId: player.playerId,
            displayName: player.displayName,
            alive: player.alive,
            isHost: player.isHost,
            roleId: player.roleId,
            team: player.team,
          })),
        },
      },
    });
  }

  async appendSessionEvent(input: SessionAuditEventInput): Promise<void> {
    await this.prisma.sessionAuditEvent.create({
      data: {
        gameId: input.gameId,
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
  }

  async appendMessageAudit(input: MessageAuditEventInput): Promise<void> {
    await this.prisma.messageAuditEvent.create({
      data: {
        gameId: input.gameId ?? null,
        lobbyCode: input.lobbyCode,
        channelId: input.channelId,
        senderPlayerId: input.senderPlayerId,
        rawPayload: input.rawPayload as Prisma.InputJsonValue,
        deliveredPayload:
          input.deliveredPayload === null
            ? Prisma.JsonNull
            : (input.deliveredPayload as Prisma.InputJsonValue | undefined),
      },
    });
  }
}
