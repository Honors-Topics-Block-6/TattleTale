import { ChannelType, LobbyStatus } from '@tattletale/shared';
import { describe, expect, it } from 'vitest';

import type { LobbyState } from '../lobby/types.js';
import { DEFAULT_LOBBY_SETTINGS } from '../lobby/types.js';
import { buildSessionFromLobby } from './session-domain.js';

// Reused helper pattern from runtime-domain.test.ts
function buildLobby(playerCount: number): LobbyState {
  const createdAt = '2026-03-17T00:00:00.000Z';
  const players = Array.from({ length: playerCount }, (_, index) => ({
    playerId: `p${index + 1}`,
    displayName: `Player ${index + 1}`,
    isHost: index === 0,
    ready: false,
    connected: true,
    alive: true,
    reconnectToken: `token-${index + 1}`,
    joinedAt: createdAt,
  }));

  return {
    code: 'ABCDE',
    status: LobbyStatus.IN_GAME,
    hostPlayerId: 'p1',
    players,
    settings: { ...DEFAULT_LOBBY_SETTINGS },
    sessionId: 'game-1',
    createdAt,
    updatedAt: createdAt,
  };
}

describe('buildSessionFromLobby — PRIVATE (DM) channels', () => {
  it('produces exactly N*(N-1)/2 PRIVATE channels for N=4 players', () => {
    const lobby = buildLobby(4);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');

    const privateChannels = Object.values(session.channels).filter(
      (ch) => ch.type === ChannelType.PRIVATE,
    );

    // 4*(4-1)/2 = 6
    expect(privateChannels).toHaveLength(6);
  });

  it('each PRIVATE channel has exactly 2 members', () => {
    const lobby = buildLobby(4);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');

    const privateChannels = Object.values(session.channels).filter(
      (ch) => ch.type === ChannelType.PRIVATE,
    );

    for (const ch of privateChannels) {
      expect(ch.members).toHaveLength(2);
    }
  });

  it('channel IDs are deterministic — same pair always produces same ID regardless of player order', () => {
    // The channel ID is built by sorting the two player IDs:
    // dm-${[idA, idB].sort().join('-')}
    // So dm-p1-p2 and dm-p1-p2 must be the same regardless of which player is i vs j.
    const lobby = buildLobby(4);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');

    // The channel for p1 and p2 must have the same ID from both perspectives.
    const expectedId = `dm-${ ['p1', 'p2'].sort().join('-')}`;
    expect(session.channels[expectedId]).toBeDefined();
    expect(session.channels[expectedId].members.sort()).toEqual(['p1', 'p2'].sort());

    // Build a second session from a lobby where player order is reversed — same IDs expected.
    const reversedLobby: LobbyState = {
      ...lobby,
      players: [...lobby.players].reverse(),
    };
    const session2 = buildSessionFromLobby(reversedLobby, 'game-2', '2026-03-17T00:00:00.000Z');
    expect(session2.channels[expectedId]).toBeDefined();
  });

  it('no PRIVATE channel where both members are the same player (no self-DM)', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');

    const privateChannels = Object.values(session.channels).filter(
      (ch) => ch.type === ChannelType.PRIVATE,
    );

    for (const ch of privateChannels) {
      expect(ch.members[0]).not.toBe(ch.members[1]);
    }
  });

  it('GLOBAL, SYSTEM, and HACKER channels are still created alongside PRIVATE channels', () => {
    const lobby = buildLobby(4);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');

    expect(session.channels.global).toBeDefined();
    expect(session.channels.global.type).toBe(ChannelType.GLOBAL);

    expect(session.channels.system).toBeDefined();
    expect(session.channels.system.type).toBe(ChannelType.SYSTEM);

    expect(session.channels.hacker).toBeDefined();
    expect(session.channels.hacker.type).toBe(ChannelType.HACKER);
  });

  it('PRIVATE channels are initialized with locked=false and expiresAt=null', () => {
    const lobby = buildLobby(3);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');

    const privateChannels = Object.values(session.channels).filter(
      (ch) => ch.type === ChannelType.PRIVATE,
    );

    for (const ch of privateChannels) {
      expect(ch.locked).toBe(false);
      expect(ch.expiresAt).toBeNull();
    }
  });

  it('2 players produce exactly 1 PRIVATE channel', () => {
    const lobby = buildLobby(2);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');

    const privateChannels = Object.values(session.channels).filter(
      (ch) => ch.type === ChannelType.PRIVATE,
    );
    expect(privateChannels).toHaveLength(1);
    expect(privateChannels[0].members.sort()).toEqual(['p1', 'p2']);
  });
});
