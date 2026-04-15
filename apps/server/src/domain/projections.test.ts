import { describe, it, expect } from 'vitest';
import { toPlayerSessionView } from './projections.js';
import { Phase, ChannelType, IntentType, SessionStatus, SystemEventType, Team } from '@tattletale/shared';
import type { GameState } from './game/types.js';
import { buildSessionFromLobby } from './game/session-domain.js';
import { appendIntent, initializeSessionRuntime } from './game/runtime-domain.js';
import { DEFAULT_LOBBY_SETTINGS } from './lobby/types.js';
import type { LobbyState } from './lobby/types.js';

function makeGameState(overrides?: Partial<GameState>): GameState {
  return {
    gameId: 'game-1',
    lobbyCode: 'ABC123',
    status: SessionStatus.ACTIVE,
    winnerTeam: null,
    phase: Phase.DAY_OPEN,
    cycle: 1,
    players: {
      p1: { playerId: 'p1', displayName: 'Alice', alive: true, connected: true, roleId: 'friend', team: Team.FRIENDS, permissions: [] },
      p2: { playerId: 'p2', displayName: 'Bob', alive: true, connected: true, roleId: 'hacker', team: Team.HACKERS, permissions: [] },
    },
    channels: {
      global: { id: 'global', type: ChannelType.GLOBAL, members: ['p1', 'p2'], locked: false, expiresAt: null },
      hackers: { id: 'hackers', type: ChannelType.ROLE, members: ['p2'], locked: false, expiresAt: null },
    },
    pendingIntents: [],
    systemEvents: [{ id: 'e1', type: SystemEventType.GAME_STARTED, createdAt: '2026-01-01T00:00:00Z', metadata: { type: 'GAME_STARTED' } }],
    timers: { currentPhaseEndsAt: '2026-01-01T00:03:00Z', currentPhaseDurationSeconds: 180 },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('toPlayerSessionView', () => {
  it('includes only channels the player is a member of', () => {
    const state = makeGameState();
    const view = toPlayerSessionView(state, 'p1');
    expect(view.channels.map((c) => c.id)).toContain('global');
    expect(view.channels.map((c) => c.id)).not.toContain('hackers');
  });

  it('hacker sees their role channel', () => {
    const state = makeGameState();
    const view = toPlayerSessionView(state, 'p2');
    expect(view.channels.map((c) => c.id)).toContain('hackers');
  });

  it('includes only the requesting player role and team', () => {
    const viewP1 = toPlayerSessionView(makeGameState(), 'p1');
    expect(viewP1.myRole).toBe('friend');
    expect(viewP1.myTeam).toBe(Team.FRIENDS);
    const viewP2 = toPlayerSessionView(makeGameState(), 'p2');
    expect(viewP2.myRole).toBe('hacker');
    expect(viewP2.myTeam).toBe(Team.HACKERS);
  });

  it('players array never includes role or team', () => {
    const view = toPlayerSessionView(makeGameState(), 'p1');
    for (const player of view.players) {
      expect(player).not.toHaveProperty('roleId');
      expect(player).not.toHaveProperty('team');
    }
  });

  it('only includes own pending intent types', () => {
    const state = makeGameState({
      pendingIntents: [
        { id: 'i1', playerId: 'p1', type: IntentType.SUBMIT_VOTE, payload: { targetPlayerId: 'p2' }, cycle: 1, phase: Phase.DAY_VOTE, createdAt: '' },
        { id: 'i2', playerId: 'p2', type: IntentType.SUBMIT_VOTE, payload: { targetPlayerId: 'p1' }, cycle: 1, phase: Phase.DAY_VOTE, createdAt: '' },
      ],
    });
    expect(toPlayerSessionView(state, 'p1').myPendingIntentTypes).toEqual([IntentType.SUBMIT_VOTE]);
    expect(toPlayerSessionView(state, 'p2').myPendingIntentTypes).toEqual([IntentType.SUBMIT_VOTE]);
  });

  describe('hackerNightView discriminator', () => {
    function buildNightSession() {
      const lobby: LobbyState = {
        code: 'ABCDE',
        status: 'IN_GAME' as any,
        hostPlayerId: 'p1',
        players: Array.from({ length: 5 }, (_, i) => ({
          playerId: `p${i + 1}`,
          displayName: `Player ${i + 1}`,
          isHost: i === 0,
          ready: true,
          connected: true,
          alive: true,
          reconnectToken: `tok-${i + 1}`,
          joinedAt: '2026-03-17T00:00:00.000Z',
        })),
        settings: { ...DEFAULT_LOBBY_SETTINGS },
        sessionId: 'game-1',
        createdAt: '2026-03-17T00:00:00.000Z',
        updatedAt: '2026-03-17T00:00:00.000Z',
      };
      const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
      initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);
      session.phase = Phase.NIGHT_ACTIONS;
      return session;
    }

    it('non-null hackerNightView for living Hacker during NIGHT_ACTIONS', () => {
      const session = buildNightSession();
      const hackers = Object.values(session.players).filter((p) => p.team === Team.HACKERS);
      const [h1, h2] = hackers.map((p) => p.playerId);
      const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
      appendIntent(session, {
        playerId: h1, type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: 'HACKER_KILL', targetPlayerId: friend, metadata: {} },
        phase: Phase.NIGHT_ACTIONS, cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
      const view = toPlayerSessionView(session, h1);
      expect(view.hackerNightView).toEqual({ tally: { [friend]: 1 }, confirmedTarget: friend });
      expect(view.myTeammates).toEqual([h2]);
    });

    it('null hackerNightView for Friends; empty myTeammates', () => {
      const session = buildNightSession();
      const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
      const view = toPlayerSessionView(session, friend);
      expect(view.hackerNightView).toBeNull();
      expect(view.myTeammates).toEqual([]);
    });

    it('null hackerNightView for dead Hackers; empty myTeammates', () => {
      const session = buildNightSession();
      const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!;
      hacker.alive = false;
      const view = toPlayerSessionView(session, hacker.playerId);
      expect(view.hackerNightView).toBeNull();
      expect(view.myTeammates).toEqual([]);
    });

    it('null hackerNightView outside NIGHT_ACTIONS but myTeammates still populated for living Hacker', () => {
      const session = buildNightSession();
      session.phase = Phase.DAY_OPEN;
      const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!;
      const view = toPlayerSessionView(session, hacker.playerId);
      expect(view.hackerNightView).toBeNull();
      expect(view.myTeammates.length).toBeGreaterThan(0);
    });

    it('hackerNightView.tally has empty object (not null) when no submissions yet', () => {
      const session = buildNightSession();
      const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!;
      const view = toPlayerSessionView(session, hacker.playerId);
      expect(view.hackerNightView).not.toBeNull();
      expect(view.hackerNightView!.tally).toEqual({});
      expect(view.hackerNightView!.confirmedTarget).toBeNull();
    });

    it('passes typed SystemEventMetadata through', () => {
      const session = buildNightSession();
      session.systemEvents.push({
        id: 'e1', type: SystemEventType.PLAYER_VOTED_OUT, createdAt: '2026-03-17T00:00:20.000Z',
        metadata: { type: 'PLAYER_VOTED_OUT', targetPlayerId: 'p3', targetDisplayName: 'Player 3' },
      });
      const view = toPlayerSessionView(session, 'p1');
      const evt = view.systemEvents.find((e) => e.id === 'e1');
      expect(evt?.metadata).toEqual({ type: 'PLAYER_VOTED_OUT', targetPlayerId: 'p3', targetDisplayName: 'Player 3' });
    });

    it('Friends do not see hacker channel; Hackers do', () => {
      const session = buildNightSession();
      const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
      const hacker = Object.values(session.players).find((p) => p.team === Team.HACKERS)!.playerId;
      expect(toPlayerSessionView(session, friend).channels.find((c) => c.id === 'hacker')).toBeUndefined();
      expect(toPlayerSessionView(session, hacker).channels.find((c) => c.id === 'hacker')).toBeDefined();
    });
  });
});
