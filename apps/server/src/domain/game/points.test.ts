import { describe, it, expect } from 'vitest';
import { Team, SessionStatus, Phase, LobbyStatus } from '@tattletale/shared';
import { computePointAwards } from './points.js';
import type { GameState, PlayerState } from './types.js';
import type { LobbyState } from '../lobby/types.js';

function makePlayer(overrides: Partial<PlayerState> & Pick<PlayerState, 'playerId' | 'team'>): PlayerState {
  return {
    playerId: overrides.playerId,
    displayName: overrides.displayName ?? `Player ${overrides.playerId}`,
    roleId: overrides.roleId ?? null,
    team: overrides.team,
    alive: overrides.alive ?? true,
    connected: overrides.connected ?? true,
    permissions: overrides.permissions ?? [],
  };
}

function makeLobbyPlayer(playerId: string, accountId: string | undefined): LobbyState['players'][number] {
  return {
    playerId,
    accountId,
    displayName: `Player ${playerId}`,
    isHost: false,
    ready: true,
    connected: true,
    alive: true,
    reconnectToken: 'tok',
    joinedAt: '2026-03-17T00:00:00.000Z',
  };
}

function makeSession(
  players: Record<string, PlayerState>,
  winnerTeam: Team | null,
): GameState {
  return {
    gameId: 'game-1',
    lobbyCode: 'TEST',
    status: winnerTeam === Team.HACKERS
      ? SessionStatus.HACKERS_WIN
      : winnerTeam === Team.FRIENDS
      ? SessionStatus.FRIENDS_WIN
      : SessionStatus.ACTIVE,
    phase: Phase.DAY_OPEN,
    cycle: 1,
    players,
    channels: {},
    systemEvents: [],
    pendingIntents: [],
    timers: { currentPhaseEndsAt: null, currentPhaseDurationSeconds: 0 },
    winnerTeam,
    createdAt: '2026-03-17T00:00:00.000Z',
    updatedAt: '2026-03-17T00:00:00.000Z',
  };
}

function makeLobby(lobbyPlayers: LobbyState['players']): LobbyState {
  return {
    code: 'TEST',
    status: LobbyStatus.IN_GAME,
    hostPlayerId: lobbyPlayers[0]?.playerId ?? '',
    players: lobbyPlayers,
    settings: {
      minPlayers: 1,
      maxPlayers: 10,
      dayDurationSeconds: 60,
      nightDurationSeconds: 30,
      enabledRoles: [],
    },
    sessionId: 'game-1',
    createdAt: '2026-03-17T00:00:00.000Z',
    updatedAt: '2026-03-17T00:00:00.000Z',
    revision: 0,
  };
}

describe('computePointAwards', () => {
  it('awards HACKERS 10 × alive-hackers, friends get 0', () => {
    const session = makeSession(
      {
        h1: makePlayer({ playerId: 'h1', team: Team.HACKERS, alive: true }),
        h2: makePlayer({ playerId: 'h2', team: Team.HACKERS, alive: true }),
        f1: makePlayer({ playerId: 'f1', team: Team.FRIENDS, alive: false }),
        f2: makePlayer({ playerId: 'f2', team: Team.FRIENDS, alive: false }),
      },
      Team.HACKERS,
    );
    const lobby = makeLobby([
      makeLobbyPlayer('h1', 'acct-h1'),
      makeLobbyPlayer('h2', 'acct-h2'),
      makeLobbyPlayer('f1', 'acct-f1'),
      makeLobbyPlayer('f2', 'acct-f2'),
    ]);

    const awards = computePointAwards(session, lobby);
    const byAcct = Object.fromEntries(awards.map((a) => [a.accountId, a]));

    expect(byAcct['acct-h1']).toMatchObject({ points: 20, didWin: true, didLose: false });
    expect(byAcct['acct-h2']).toMatchObject({ points: 20, didWin: true, didLose: false });
    expect(byAcct['acct-f1']).toMatchObject({ points: 0, didWin: false, didLose: true });
    expect(byAcct['acct-f2']).toMatchObject({ points: 0, didWin: false, didLose: true });
  });

  it('awards FRIENDS 60 points flat on friend win', () => {
    const session = makeSession(
      {
        h1: makePlayer({ playerId: 'h1', team: Team.HACKERS, alive: false }),
        f1: makePlayer({ playerId: 'f1', team: Team.FRIENDS, alive: true }),
        f2: makePlayer({ playerId: 'f2', team: Team.FRIENDS, alive: true }),
      },
      Team.FRIENDS,
    );
    const lobby = makeLobby([
      makeLobbyPlayer('h1', 'acct-h1'),
      makeLobbyPlayer('f1', 'acct-f1'),
      makeLobbyPlayer('f2', 'acct-f2'),
    ]);

    const awards = computePointAwards(session, lobby);
    const byAcct = Object.fromEntries(awards.map((a) => [a.accountId, a]));

    expect(byAcct['acct-f1']).toMatchObject({ points: 60, didWin: true, didLose: false });
    expect(byAcct['acct-f2']).toMatchObject({ points: 60, didWin: true, didLose: false });
    expect(byAcct['acct-h1']).toMatchObject({ points: 0, didWin: false, didLose: true });
  });

  it('abandoned run (no winner) still yields per-account award rows with 0 points and no win/loss', () => {
    const session = makeSession(
      {
        h1: makePlayer({ playerId: 'h1', team: Team.HACKERS }),
        f1: makePlayer({ playerId: 'f1', team: Team.FRIENDS }),
      },
      null,
    );
    const lobby = makeLobby([
      makeLobbyPlayer('h1', 'acct-h1'),
      makeLobbyPlayer('f1', 'acct-f1'),
    ]);

    const awards = computePointAwards(session, lobby);
    expect(awards).toHaveLength(2);
    for (const award of awards) {
      expect(award.points).toBe(0);
      expect(award.didWin).toBe(false);
      expect(award.didLose).toBe(false);
    }
  });

  it('anonymous joiners (no accountId) are filtered out', () => {
    const session = makeSession(
      {
        h1: makePlayer({ playerId: 'h1', team: Team.HACKERS, alive: true }),
        f1: makePlayer({ playerId: 'f1', team: Team.FRIENDS, alive: false }),
      },
      Team.HACKERS,
    );
    const lobby = makeLobby([
      makeLobbyPlayer('h1', 'acct-h1'),
      makeLobbyPlayer('f1', undefined),
    ]);

    const awards = computePointAwards(session, lobby);
    expect(awards).toHaveLength(1);
    expect(awards[0].accountId).toBe('acct-h1');
  });

  it('only counts ALIVE hackers for the 10×N multiplier', () => {
    const session = makeSession(
      {
        h1: makePlayer({ playerId: 'h1', team: Team.HACKERS, alive: true }),
        h2: makePlayer({ playerId: 'h2', team: Team.HACKERS, alive: false }),
        h3: makePlayer({ playerId: 'h3', team: Team.HACKERS, alive: false }),
      },
      Team.HACKERS,
    );
    const lobby = makeLobby([
      makeLobbyPlayer('h1', 'acct-h1'),
      makeLobbyPlayer('h2', 'acct-h2'),
      makeLobbyPlayer('h3', 'acct-h3'),
    ]);

    const awards = computePointAwards(session, lobby);
    for (const award of awards) {
      expect(award.points).toBe(10);
      expect(award.didWin).toBe(true);
    }
  });
});
