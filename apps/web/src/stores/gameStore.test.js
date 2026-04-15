import { beforeEach, describe, expect, it } from 'vitest';
import useGameStore, {
  selectIsHacker,
  selectIsHackerNight,
  selectConfirmedNightKill,
  selectNightKillCandidates,
} from './gameStore';

describe('gameStore night-kill session fields', () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState());
  });

  it('syncSessionState copies myTeam, myTeammates, hackerNightView', () => {
    const view = {
      gameId: 'game-1',
      lobbyCode: 'ABCDE',
      status: 'ACTIVE',
      phase: 'NIGHT_ACTIONS',
      cycle: 1,
      currentPhaseEndsAt: '2026-03-17T00:01:00.000Z',
      phaseDurationSeconds: 60,
      players: [
        { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        { playerId: 'p2', displayName: 'P2', alive: true, connected: true },
      ],
      channels: [],
      myPendingIntentTypes: ['SUBMIT_NIGHT_ACTION'],
      systemEvents: [],
      myRole: 'unknown',
      myTeam: 'HACKERS',
      voteTally: null,
      myTeammates: [],
      hackerNightView: { tally: { p2: 1 }, confirmedTarget: 'p2' },
    };

    useGameStore.setState({ selfId: 'p1' });
    useGameStore.getState().syncSessionState(view);

    const state = useGameStore.getState();
    expect(state.myTeam).toBe('HACKERS');
    expect(state.myTeammates).toEqual([]);
    expect(state.hackerNightView).toEqual({ tally: { p2: 1 }, confirmedTarget: 'p2' });
  });

  it('syncSessionState with null hackerNightView keeps null', () => {
    const view = {
      gameId: 'game-1',
      lobbyCode: 'ABCDE',
      status: 'ACTIVE',
      phase: 'DAY_OPEN',
      cycle: 1,
      currentPhaseEndsAt: '2026-03-17T00:01:00.000Z',
      phaseDurationSeconds: 60,
      players: [],
      channels: [],
      myPendingIntentTypes: [],
      systemEvents: [],
      myRole: 'friend',
      myTeam: 'FRIENDS',
      voteTally: null,
      myTeammates: [],
      hackerNightView: null,
    };

    useGameStore.getState().syncSessionState(view);
    expect(useGameStore.getState().hackerNightView).toBeNull();
  });
});

describe('gameStore selectors', () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState());
  });

  it('selectIsHacker returns true for a living Hacker', () => {
    useGameStore.setState({
      myTeam: 'HACKERS',
      selfId: 'p1',
      players: { p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true } },
    });
    expect(selectIsHacker(useGameStore.getState())).toBe(true);
  });

  it('selectIsHacker returns false for a dead Hacker', () => {
    useGameStore.setState({
      myTeam: 'HACKERS',
      selfId: 'p1',
      players: { p1: { playerId: 'p1', displayName: 'P1', alive: false, connected: true } },
    });
    expect(selectIsHacker(useGameStore.getState())).toBe(false);
  });

  it('selectIsHacker returns false for a Friend', () => {
    useGameStore.setState({
      myTeam: 'FRIENDS',
      selfId: 'p1',
      players: { p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true } },
    });
    expect(selectIsHacker(useGameStore.getState())).toBe(false);
  });

  it('selectIsHackerNight returns true when hackerNightView is non-null', () => {
    useGameStore.setState({
      hackerNightView: { tally: {}, confirmedTarget: null },
    });
    expect(selectIsHackerNight(useGameStore.getState())).toBe(true);
  });

  it('selectIsHackerNight returns false when hackerNightView is null', () => {
    useGameStore.setState({ hackerNightView: null });
    expect(selectIsHackerNight(useGameStore.getState())).toBe(false);
  });

  it('selectConfirmedNightKill returns null when hackerNightView is null', () => {
    useGameStore.setState({ hackerNightView: null });
    expect(selectConfirmedNightKill(useGameStore.getState())).toBeNull();
  });

  it('selectConfirmedNightKill returns target when set', () => {
    useGameStore.setState({
      hackerNightView: { tally: { p3: 1 }, confirmedTarget: 'p3' },
    });
    expect(selectConfirmedNightKill(useGameStore.getState())).toBe('p3');
  });

  it('selectNightKillCandidates excludes self, dead players, and Hackers', () => {
    useGameStore.setState({
      myTeam: 'HACKERS',
      selfId: 'p1',
      myTeammates: ['p2'],
      players: {
        p1: { playerId: 'p1', displayName: 'P1', alive: true, connected: true },
        p2: { playerId: 'p2', displayName: 'P2', alive: true, connected: true },
        p3: { playerId: 'p3', displayName: 'P3', alive: true, connected: true },
        p4: { playerId: 'p4', displayName: 'P4', alive: false, connected: true },
        p5: { playerId: 'p5', displayName: 'P5', alive: true, connected: true },
      },
    });
    const candidates = selectNightKillCandidates(useGameStore.getState())
      .map((p) => p.playerId)
      .sort();
    expect(candidates).toEqual(['p3', 'p5']);
  });
});
