import {
  ChannelType,
  Phase,
  SessionStatus,
  SystemEventType,
  Team,
} from '@tattletale/shared';

import type { LobbyState } from '../lobby/types.js';
import type { GameState } from './types.js';
import { SystemEventMetadataBuilders } from './system-events.js';

export function buildSessionFromLobby(
  lobby: LobbyState,
  gameId: string,
  now: string,
): GameState {
  const playerEntries = lobby.players.map((player) => [
    player.playerId,
    {
      playerId: player.playerId,
      displayName: player.displayName,
      alive: player.alive,
      connected: player.connected,
      roleId: null,
      team: Team.FRIENDS,
      permissions: [],
    },
  ]);

  return {
    gameId,
    lobbyCode: lobby.code,
    status: SessionStatus.ACTIVE,
    winnerTeam: null,
    phase: Phase.DAY_OPEN,
    cycle: 1,
    players: Object.fromEntries(playerEntries),
    channels: {
      global: {
        id: 'global',
        type: ChannelType.GLOBAL,
        members: lobby.players.map((player) => player.playerId),
        locked: false,
        expiresAt: null,
      },
      system: {
        id: 'system',
        type: ChannelType.SYSTEM,
        members: lobby.players.map((player) => player.playerId),
        locked: false,
        expiresAt: null,
      },
      hacker: {
        id: 'hacker',
        type: ChannelType.HACKER,
        members: [],
        locked: false,
        expiresAt: null,
      },
    },
    pendingIntents: [],
    systemEvents: [
      {
        id: crypto.randomUUID(),
        type: SystemEventType.GAME_STARTED,
        createdAt: now,
        metadata: SystemEventMetadataBuilders.gameStarted(),
      },
    ],
    // Eagerly initialize so new sessions always have the field. The lazy-init guard in
    // appendPrivateSystemEvent is kept for backward compatibility with sessions that were
    // persisted before this field was introduced and may be missing it on deserialization.
    privateSystemEvents: {},
    timers: {
      currentPhaseEndsAt: null,
      currentPhaseDurationSeconds: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
}
