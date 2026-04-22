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

  // Build DM channels for every unique pair of players.
  // O(n²) channel count: ~190 channels at max 20 players (~43 KB serialized).
  // Stored as a single DO value under key 'game' — see do-runtime-repo.ts.
  // NOTE: privateSystemEvents growth (n×events×size) is a separate budget concern
  // flagged for a future pass; it is NOT addressed here (out of scope for #72).
  const dmChannels: Record<string, ChannelState> = {};
  for (let i = 0; i < lobby.players.length; i++) {
    for (let j = i + 1; j < lobby.players.length; j++) {
      const p1 = lobby.players[i];
      const p2 = lobby.players[j];
      // Defensive: should never be equal given lobby uniqueness invariant.
      if (p1.playerId === p2.playerId) continue;
      const channelId = `dm-${[p1.playerId, p2.playerId].sort().join('-')}`;
      dmChannels[channelId] = {
        id: channelId,
        type: ChannelType.PRIVATE,
        members: [p1.playerId, p2.playerId],
        locked: false,
        expiresAt: null,
      };
    }
  }

  const initialChannels = {
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
  };

  return {
    gameId,
    lobbyCode: lobby.code,
    status: SessionStatus.ACTIVE,
    winnerTeam: null,
    phase: Phase.DAY_OPEN,
    cycle: 1,
    players: Object.fromEntries(playerEntries),
    channels: { ...initialChannels, ...dmChannels },
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
    // Communication restrictions (#76). Eagerly empty so new sessions always have the field;
    // the optional marker on GameState.restrictions remains for sessions persisted before
    // the framework landed.
    restrictions: [],
    pointAwards: {},
    timers: {
      currentPhaseEndsAt: null,
      currentPhaseDurationSeconds: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
}
