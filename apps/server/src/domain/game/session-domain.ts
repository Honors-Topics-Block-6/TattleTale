import {
  ChannelType,
  Phase,
  SessionStatus,
  SystemEventType,
  Team,
} from '@tattletale/shared';

import type { LobbyState } from '../lobby/types.js';
import type { ChannelState, GameState } from './types.js';
import { SystemEventMetadataBuilders } from './system-events.js';

export function privateChannelId(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `pm:${x}:${y}`;
}

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

  const privateChannels: Record<string, ChannelState> = {};
  for (let i = 0; i < lobby.players.length; i++) {
    for (let j = i + 1; j < lobby.players.length; j++) {
      const a = lobby.players[i].playerId;
      const b = lobby.players[j].playerId;
      const id = privateChannelId(a, b);
      const [memberA, memberB] = [a, b].sort();
      privateChannels[id] = {
        id,
        type: ChannelType.PRIVATE,
        members: [memberA, memberB],
        locked: false,
        expiresAt: null,
      };
    }
  }

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
      ...privateChannels,
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
    timers: {
      currentPhaseEndsAt: null,
      currentPhaseDurationSeconds: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
}
