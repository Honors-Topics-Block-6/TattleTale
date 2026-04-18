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

describe('gameStore — PRIVATE channel / DM sync', () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState());
  });

  function makeView(channelOverrides = []) {
    return {
      gameId: 'game-1',
      lobbyCode: 'ABCDE',
      status: 'ACTIVE',
      phase: 'DAY_OPEN',
      cycle: 1,
      currentPhaseEndsAt: '2026-03-17T00:01:00.000Z',
      phaseDurationSeconds: 60,
      players: [
        { playerId: 'p1', displayName: 'Alice', alive: true, connected: true },
        { playerId: 'p2', displayName: 'Bob', alive: true, connected: true },
        { playerId: 'p3', displayName: 'Carol', alive: true, connected: true },
      ],
      channels: channelOverrides,
      myPendingIntentTypes: [],
      systemEvents: [],
      myRole: 'unknown',
      myTeam: 'FRIENDS',
      voteTally: null,
      myTeammates: [],
      hackerNightView: null,
    };
  }

  it('syncSessionState with PRIVATE channels populates state.channels with label field', () => {
    const view = makeView([
      { id: 'global', type: 'GLOBAL', members: ['p1', 'p2', 'p3'], locked: false, expiresAt: null, label: null },
      { id: 'dm-p1-p2', type: 'PRIVATE', members: ['p1', 'p2'], locked: false, expiresAt: null, label: 'Bob' },
    ]);

    useGameStore.setState({ selfId: 'p1' });
    useGameStore.getState().syncSessionState(view);

    const state = useGameStore.getState();
    expect(state.channels['dm-p1-p2']).toBeDefined();
    expect(state.channels['dm-p1-p2'].label).toBe('Bob');
  });

  it('syncSessionState re-sync updates label field on existing channel', () => {
    // First sync
    const view1 = makeView([
      { id: 'dm-p1-p2', type: 'PRIVATE', members: ['p1', 'p2'], locked: false, expiresAt: null, label: 'Bob' },
    ]);
    useGameStore.setState({ selfId: 'p1' });
    useGameStore.getState().syncSessionState(view1);
    expect(useGameStore.getState().channels['dm-p1-p2'].label).toBe('Bob');

    // Second sync with updated label (edge case: display name change scenario)
    const view2 = makeView([
      { id: 'dm-p1-p2', type: 'PRIVATE', members: ['p1', 'p2'], locked: false, expiresAt: null, label: 'Bobby' },
    ]);
    useGameStore.getState().syncSessionState(view2);
    expect(useGameStore.getState().channels['dm-p1-p2'].label).toBe('Bobby');
  });

  it('auto-select prefers SYSTEM > GLOBAL > first non-PRIVATE; never picks PRIVATE first', () => {
    // Only PRIVATE channels present — should still pick the PRIVATE (last resort) rather
    // than null, but must prefer non-PRIVATE when available.
    const viewOnlyPrivate = makeView([
      { id: 'dm-p1-p2', type: 'PRIVATE', members: ['p1', 'p2'], locked: false, expiresAt: null, label: 'Bob' },
    ]);
    useGameStore.setState({ selfId: 'p1', activeChannelId: null });
    useGameStore.getState().syncSessionState(viewOnlyPrivate);
    // When only PRIVATE channels exist, fallback to first channel (view.channels[0])
    // per the store's auto-select logic.
    expect(useGameStore.getState().activeChannelId).toBe('dm-p1-p2');
  });

  it('auto-select picks SYSTEM over GLOBAL and PRIVATE', () => {
    const view = makeView([
      { id: 'dm-p1-p2', type: 'PRIVATE', members: ['p1', 'p2'], locked: false, expiresAt: null, label: 'Bob' },
      { id: 'global', type: 'GLOBAL', members: ['p1', 'p2'], locked: false, expiresAt: null, label: null },
      { id: 'system', type: 'SYSTEM', members: ['p1', 'p2'], locked: false, expiresAt: null, label: null },
    ]);
    useGameStore.setState({ selfId: 'p1', activeChannelId: null });
    useGameStore.getState().syncSessionState(view);
    expect(useGameStore.getState().activeChannelId).toBe('system');
  });

  it('auto-select picks GLOBAL when no SYSTEM exists (and not PRIVATE first)', () => {
    const view = makeView([
      { id: 'dm-p1-p2', type: 'PRIVATE', members: ['p1', 'p2'], locked: false, expiresAt: null, label: 'Bob' },
      { id: 'global', type: 'GLOBAL', members: ['p1', 'p2'], locked: false, expiresAt: null, label: null },
    ]);
    useGameStore.setState({ selfId: 'p1', activeChannelId: null });
    useGameStore.getState().syncSessionState(view);
    expect(useGameStore.getState().activeChannelId).toBe('global');
  });

  it('removing a PRIVATE channel via re-sync clears activeChannelId if it pointed there', () => {
    // Set up with a DM as the active channel
    const view1 = makeView([
      { id: 'dm-p1-p2', type: 'PRIVATE', members: ['p1', 'p2'], locked: false, expiresAt: null, label: 'Bob' },
    ]);
    useGameStore.setState({ selfId: 'p1', activeChannelId: null });
    useGameStore.getState().syncSessionState(view1);
    // Force-set active to the DM
    useGameStore.setState({ activeChannelId: 'dm-p1-p2' });
    expect(useGameStore.getState().activeChannelId).toBe('dm-p1-p2');

    // Re-sync without that channel (player got eliminated, channel removed from view)
    const view2 = makeView([
      { id: 'global', type: 'GLOBAL', members: ['p1'], locked: false, expiresAt: null, label: null },
    ]);
    useGameStore.getState().syncSessionState(view2);
    // After removal, activeChannelId must not point to the removed channel
    expect(useGameStore.getState().activeChannelId).not.toBe('dm-p1-p2');
    // It should auto-select to an available channel (global here)
    expect(useGameStore.getState().activeChannelId).toBe('global');
  });

  it('non-PRIVATE channel has label null after sync', () => {
    const view = makeView([
      { id: 'global', type: 'GLOBAL', members: ['p1', 'p2'], locked: false, expiresAt: null, label: null },
    ]);
    useGameStore.setState({ selfId: 'p1' });
    useGameStore.getState().syncSessionState(view);
    expect(useGameStore.getState().channels['global'].label).toBeNull();
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
