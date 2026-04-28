import { describe, it, expect } from 'vitest';
import { toPlayerSessionView } from './projections.js';
import { Phase, ChannelType, IntentType, NightActionType, RestrictionType, RoleId, SessionStatus, SystemEventType, Team } from '@tattletale/shared';
import type { GameState } from './game/types.js';
import { RestrictionBuilders } from './game/restrictions.js';
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

  it('friends do not see role or team on any player in the players array', () => {
    const view = toPlayerSessionView(makeGameState(), 'p1');
    for (const player of view.players) {
      expect(player).not.toHaveProperty('role');
      expect(player).not.toHaveProperty('team');
    }
  });

  it('hackers see role and team on fellow hackers in the players array', () => {
    const state = makeGameState({
      players: {
        p1: { playerId: 'p1', displayName: 'Alice', alive: true, connected: true, roleId: 'FRIEND', team: Team.FRIENDS, permissions: [] },
        p2: { playerId: 'p2', displayName: 'Bob', alive: true, connected: true, roleId: 'THE_BOSS', team: Team.HACKERS, permissions: [] },
        p3: { playerId: 'p3', displayName: 'Carol', alive: true, connected: true, roleId: 'HACKER', team: Team.HACKERS, permissions: [] },
      },
      channels: {
        global: { id: 'global', type: ChannelType.GLOBAL, members: ['p1', 'p2', 'p3'], locked: false, expiresAt: null },
        hacker: { id: 'hacker', type: ChannelType.HACKER, members: ['p2', 'p3'], locked: false, expiresAt: null },
      },
    });
    const view = toPlayerSessionView(state, 'p2');

    // Hacker sees roles on fellow hackers
    const bob = view.players.find((p) => p.playerId === 'p2')!;
    expect(bob.role).toBe('THE_BOSS');
    expect(bob.team).toBe(Team.HACKERS);
    const carol = view.players.find((p) => p.playerId === 'p3')!;
    expect(carol.role).toBe('HACKER');
    expect(carol.team).toBe(Team.HACKERS);

    // Hacker does not see role on friends
    const alice = view.players.find((p) => p.playerId === 'p1')!;
    expect(alice).not.toHaveProperty('role');
    expect(alice).not.toHaveProperty('team');
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
        players: Array.from({ length: 7 }, (_, i) => ({
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
        revision: 0,
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
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: friend, metadata: {} },
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

  describe('protectNightView discriminator', () => {
    function makeProtectState(overrides?: Partial<GameState>): GameState {
      return {
        gameId: 'game-1',
        lobbyCode: 'ABC123',
        status: SessionStatus.ACTIVE,
        winnerTeam: null,
        phase: Phase.NIGHT_ACTIONS,
        cycle: 1,
        players: {
          p1: { playerId: 'p1', displayName: 'Alice', alive: true, connected: true, roleId: RoleId.SECURITY_SPECIALIST, team: Team.FRIENDS, permissions: [] },
          p2: { playerId: 'p2', displayName: 'Bob', alive: true, connected: true, roleId: RoleId.FRIEND, team: Team.FRIENDS, permissions: [] },
          p3: { playerId: 'p3', displayName: 'Carol', alive: true, connected: true, roleId: RoleId.HACKER, team: Team.HACKERS, permissions: [] },
        },
        channels: {
          global: { id: 'global', type: ChannelType.GLOBAL, members: ['p1', 'p2', 'p3'], locked: false, expiresAt: null },
        },
        pendingIntents: [],
        systemEvents: [],
        timers: { currentPhaseEndsAt: null, currentPhaseDurationSeconds: 0 },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides,
      };
    }

    it('non-null protectNightView for living Specialist during NIGHT_ACTIONS, with confirmed target after submission', () => {
      const state = makeProtectState({
        pendingIntents: [
          {
            id: 'i1', playerId: 'p1', type: IntentType.SUBMIT_NIGHT_ACTION,
            payload: { actionType: NightActionType.PROTECT, targetPlayerId: 'p2', metadata: {} },
            phase: Phase.NIGHT_ACTIONS, cycle: 1, createdAt: '',
          },
        ],
      });
      const view = toPlayerSessionView(state, 'p1');
      expect(view.protectNightView).toEqual({ confirmedTarget: 'p2' });
    });

    it('confirmedTarget is null when Specialist has not submitted yet', () => {
      const view = toPlayerSessionView(makeProtectState(), 'p1');
      expect(view.protectNightView).toEqual({ confirmedTarget: null });
    });

    it('null protectNightView for non-Specialist roles', () => {
      const state = makeProtectState();
      expect(toPlayerSessionView(state, 'p2').protectNightView).toBeNull();
      expect(toPlayerSessionView(state, 'p3').protectNightView).toBeNull();
    });

    it('null protectNightView for dead Specialist', () => {
      const state = makeProtectState();
      state.players.p1.alive = false;
      expect(toPlayerSessionView(state, 'p1').protectNightView).toBeNull();
    });

    it('null protectNightView outside NIGHT_ACTIONS', () => {
      const state = makeProtectState({ phase: Phase.DAY_OPEN });
      expect(toPlayerSessionView(state, 'p1').protectNightView).toBeNull();
    });

    it('ignores PROTECT intents from prior cycles', () => {
      const state = makeProtectState({
        cycle: 2,
        pendingIntents: [
          {
            id: 'i1', playerId: 'p1', type: IntentType.SUBMIT_NIGHT_ACTION,
            payload: { actionType: NightActionType.PROTECT, targetPlayerId: 'p2', metadata: {} },
            phase: Phase.NIGHT_ACTIONS, cycle: 1, createdAt: '',
          },
        ],
      });
      expect(toPlayerSessionView(state, 'p1').protectNightView).toEqual({ confirmedTarget: null });
    });
  });

  describe('PRIVATE channel label projection', () => {
    function makeGameStateWithDM(): GameState {
      return {
        gameId: 'game-1',
        lobbyCode: 'ABC123',
        status: SessionStatus.ACTIVE,
        winnerTeam: null,
        phase: Phase.DAY_OPEN,
        cycle: 1,
        players: {
          p1: { playerId: 'p1', displayName: 'Alice', alive: true, connected: true, roleId: null, team: Team.FRIENDS, permissions: [] },
          p2: { playerId: 'p2', displayName: 'Bob', alive: true, connected: true, roleId: null, team: Team.FRIENDS, permissions: [] },
          p3: { playerId: 'p3', displayName: 'Carol', alive: true, connected: true, roleId: null, team: Team.FRIENDS, permissions: [] },
        },
        channels: {
          global: { id: 'global', type: ChannelType.GLOBAL, members: ['p1', 'p2', 'p3'], locked: false, expiresAt: null },
          system: { id: 'system', type: ChannelType.SYSTEM, members: ['p1', 'p2', 'p3'], locked: false, expiresAt: null },
          'dm-p1-p2': { id: 'dm-p1-p2', type: ChannelType.PRIVATE, members: ['p1', 'p2'], locked: false, expiresAt: null },
          'dm-p1-p3': { id: 'dm-p1-p3', type: ChannelType.PRIVATE, members: ['p1', 'p3'], locked: false, expiresAt: null },
          'dm-p2-p3': { id: 'dm-p2-p3', type: ChannelType.PRIVATE, members: ['p2', 'p3'], locked: false, expiresAt: null },
        },
        pendingIntents: [],
        systemEvents: [],
        timers: { currentPhaseEndsAt: null, currentPhaseDurationSeconds: 0 },
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
    }

    it('PRIVATE channel projection sets label to the OTHER member displayName from viewer perspective', () => {
      const state = makeGameStateWithDM();
      // p1 views dm-p1-p2: other member is p2 (Bob)
      const viewP1 = toPlayerSessionView(state, 'p1');
      const dmChannel = viewP1.channels.find((c) => c.id === 'dm-p1-p2');
      expect(dmChannel).toBeDefined();
      expect(dmChannel!.label).toBe('Bob');
    });

    it('label is the other member regardless of member array order', () => {
      const state = makeGameStateWithDM();
      // p2 views dm-p1-p2: other member is p1 (Alice)
      const viewP2 = toPlayerSessionView(state, 'p2');
      const dmChannel = viewP2.channels.find((c) => c.id === 'dm-p1-p2');
      expect(dmChannel).toBeDefined();
      expect(dmChannel!.label).toBe('Alice');
    });

    it('non-PRIVATE channel projection has label === null', () => {
      const state = makeGameStateWithDM();
      const viewP1 = toPlayerSessionView(state, 'p1');
      const globalChannel = viewP1.channels.find((c) => c.id === 'global');
      expect(globalChannel).toBeDefined();
      expect(globalChannel!.label).toBeNull();

      const systemChannel = viewP1.channels.find((c) => c.id === 'system');
      expect(systemChannel).toBeDefined();
      expect(systemChannel!.label).toBeNull();
    });

    it('PRIVATE channel where the other member does not exist in session.players yields label === null (defensive)', () => {
      const state = makeGameStateWithDM();
      // Add a DM channel referencing a player not in session.players
      state.channels['dm-p1-ghost'] = {
        id: 'dm-p1-ghost',
        type: ChannelType.PRIVATE,
        members: ['p1', 'ghost-player'],
        locked: false,
        expiresAt: null,
      };
      const viewP1 = toPlayerSessionView(state, 'p1');
      const dmChannel = viewP1.channels.find((c) => c.id === 'dm-p1-ghost');
      expect(dmChannel).toBeDefined();
      expect(dmChannel!.label).toBeNull();
    });

    it('a player only sees PRIVATE channels they are a member of', () => {
      const state = makeGameStateWithDM();
      // p1 is a member of dm-p1-p2 and dm-p1-p3 but NOT dm-p2-p3
      const viewP1 = toPlayerSessionView(state, 'p1');
      const channelIds = viewP1.channels.map((c) => c.id);
      expect(channelIds).toContain('dm-p1-p2');
      expect(channelIds).toContain('dm-p1-p3');
      expect(channelIds).not.toContain('dm-p2-p3');
    });

    it('each viewer sees their own label on each DM', () => {
      const state = makeGameStateWithDM();
      // p3 views dm-p1-p3: other is p1 (Alice)
      const viewP3 = toPlayerSessionView(state, 'p3');
      const dmP1P3 = viewP3.channels.find((c) => c.id === 'dm-p1-p3');
      expect(dmP1P3!.label).toBe('Alice');
      // p3 views dm-p2-p3: other is p2 (Bob)
      const dmP2P3 = viewP3.channels.find((c) => c.id === 'dm-p2-p3');
      expect(dmP2P3!.label).toBe('Bob');
    });
    it('eliminated DM partner: survivor still sees the channel (members=[self], label=null); dead partner no longer sees it', () => {
      // End-to-end flow for the "Bob is eliminated" case. After eliminatePlayer
      // strips Bob from members and flips his alive flag, the shared DM must
      // stay visible to Alice (so history is not lost) with a graceful label
      // fallback, while Bob's own projection must not leak back the channel
      // (defense-in-depth against a reconnect racing with the projection).
      const state = makeGameStateWithDM();
      // Simulate post-elimination state for p2 (Bob): alive=false and stripped
      // from all channel member lists. Matches runtime-domain.ts#eliminatePlayer.
      state.players.p2.alive = false;
      for (const ch of Object.values(state.channels)) {
        ch.members = ch.members.filter((id) => id !== 'p2');
      }

      const viewP1 = toPlayerSessionView(state, 'p1');
      const dm = viewP1.channels.find((c) => c.id === 'dm-p1-p2');
      expect(dm).toBeDefined();
      expect(dm!.members).toEqual(['p1']);
      // No other member to derive a name from → label degrades to null so the
      // sidebar renders the "ghost DM" without crashing.
      expect(dm!.label).toBeNull();

      // From p2's perspective the channel is gone — membership filter at
      // projections.ts:143-144 removes it before any PRIVATE content could
      // be emitted back to a reconnecting eliminated player.
      const viewP2 = toPlayerSessionView(state, 'p2');
      const dmFromP2 = viewP2.channels.find((c) => c.id === 'dm-p1-p2');
      expect(dmFromP2).toBeUndefined();
      // dm-p2-p3 (a DM Bob was in) is also invisible to him now.
      expect(viewP2.channels.find((c) => c.id === 'dm-p2-p3')).toBeUndefined();
    });
  });

  describe('privateSystemEvents privacy isolation', () => {
    it('an INVESTIGATION_RESULT in player A private bucket must NOT appear in player B view, but MUST appear in player A view', () => {
      const state = makeGameState();
      const aId = 'p1';
      const bId = 'p2';

      const investigationEvent = {
        id: 'priv-evt-1',
        type: SystemEventType.INVESTIGATION_RESULT,
        createdAt: '2026-01-01T00:01:00Z',
        metadata: {
          type: 'INVESTIGATION_RESULT' as const,
          targetPlayerId: bId,
          targetDisplayName: 'Bob',
          targetRoleId: 'hacker',
          targetTeam: Team.HACKERS,
        },
      };

      // Manually populate only player A's private bucket.
      state.privateSystemEvents = { [aId]: [investigationEvent] };

      // Negative control: player B must NOT see the investigation result.
      const viewB = toPlayerSessionView(state, bId);
      expect(
        viewB.systemEvents.find((e) => e.type === SystemEventType.INVESTIGATION_RESULT),
      ).toBeUndefined();

      // Positive control: player A DOES see their own investigation result.
      const viewA = toPlayerSessionView(state, aId);
      const found = viewA.systemEvents.find((e) => e.type === SystemEventType.INVESTIGATION_RESULT);
      expect(found).toBeDefined();
      expect(found?.id).toBe('priv-evt-1');
      expect(found?.metadata).toMatchObject({
        type: 'INVESTIGATION_RESULT',
        targetPlayerId: bId,
      });
    });
  });

  describe('myRestrictions projection', () => {
    it('surfaces own SILENCED restriction to the target and omits it from other viewers', () => {
      const state = makeGameState({
        restrictions: [
          RestrictionBuilders.silenced('p1', 'p2', Phase.DAY_RESOLVE, '2026-01-01T00:00:00Z'),
        ],
      });

      const viewTarget = toPlayerSessionView(state, 'p1');
      expect(viewTarget.myRestrictions).toEqual([
        { type: RestrictionType.SILENCED, expiresAt: Phase.DAY_RESOLVE },
      ]);

      const viewOther = toPlayerSessionView(state, 'p2');
      expect(viewOther.myRestrictions).toEqual([]);
    });

    it('surfaces JAMMED with channel-type scope but strips attacker identity', () => {
      const state = makeGameState({
        restrictions: [
          RestrictionBuilders.jammed(
            'p1',
            [ChannelType.PRIVATE],
            'p2',
            Phase.DAY_RESOLVE,
            '2026-01-01T00:00:00Z',
          ),
        ],
      });
      const view = toPlayerSessionView(state, 'p1');
      expect(view.myRestrictions).toHaveLength(1);
      const [r] = view.myRestrictions;
      expect(r).toEqual({
        type: RestrictionType.JAMMED,
        channelTypes: [ChannelType.PRIVATE],
        expiresAt: Phase.DAY_RESOLVE,
      });
      expect(r as any).not.toHaveProperty('appliedByPlayerId');
      expect(r as any).not.toHaveProperty('playerId');
    });

    it('MONITORED is covert — NEITHER the target NOR the observer see it in myRestrictions', () => {
      const state = makeGameState({
        restrictions: [
          RestrictionBuilders.monitored(
            'p1',
            'p2',
            [ChannelType.PRIVATE],
            'p2',
            Phase.DAY_RESOLVE,
            '2026-01-01T00:00:00Z',
          ),
        ],
      });
      const viewTarget = toPlayerSessionView(state, 'p1');
      const viewObserver = toPlayerSessionView(state, 'p2');
      expect(viewTarget.myRestrictions).toEqual([]);
      expect(viewObserver.myRestrictions).toEqual([]);
    });

    it('LOCKED is projected to channel members only', () => {
      const state = makeGameState({
        restrictions: [
          RestrictionBuilders.locked('hackers', 'p1', Phase.DAY_RESOLVE, '2026-01-01T00:00:00Z'),
        ],
      });
      // p2 is the only member of `hackers` — they see the lock entry.
      const viewHacker = toPlayerSessionView(state, 'p2');
      expect(viewHacker.myRestrictions).toEqual([
        { type: RestrictionType.LOCKED, channelId: 'hackers', expiresAt: Phase.DAY_RESOLVE },
      ]);
      // p1 isn't in `hackers` — no entry.
      const viewNonMember = toPlayerSessionView(state, 'p1');
      expect(viewNonMember.myRestrictions).toEqual([]);
    });
  });
});
