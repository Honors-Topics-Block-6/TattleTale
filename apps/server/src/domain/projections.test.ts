import { describe, it, expect } from 'vitest';
import { toPlayerSessionView } from './projections.js';
import { Phase, ChannelType, IntentType, SessionStatus, SystemEventType, Team } from '@tattletale/shared';
import type { GameState } from './game/types.js';

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
    systemEvents: [{ id: 'e1', type: SystemEventType.GAME_STARTED, createdAt: '2026-01-01T00:00:00Z' }],
    timers: { currentPhaseEndsAt: '2026-01-01T00:03:00Z' },
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
});
