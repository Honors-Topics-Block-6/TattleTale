import {
  ChannelType,
  Phase,
  SessionStatus,
  SystemEventType,
  Team,
} from '@tattletale/shared';

import type { LobbyState } from '../lobby/types.js';
import type { GameState } from './types.js';

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
    },
    pendingIntents: [],
    systemEvents: [
      {
        id: crypto.randomUUID(),
        type: SystemEventType.GAME_STARTED,
        createdAt: now,
      },
    ],
    timers: {
      currentPhaseEndsAt: null,
    },
    createdAt: now,
    updatedAt: now,
  };
}
