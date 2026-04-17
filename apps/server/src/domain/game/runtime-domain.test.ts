import { ChannelType, IntentType, LobbyStatus, NightActionType, Phase, RoleId, SessionStatus, SystemEventType, Team } from '@tattletale/shared';

import { describe, expect, it } from 'vitest';

import type { LobbyState } from '../lobby/types.js';
import { DEFAULT_LOBBY_SETTINGS } from '../lobby/types.js';
import type { GameState } from './types.js';
import {
  appendIntent,
  buildRolePool,
  calculatePhaseDurations,
  initializeSessionRuntime,
  processElimination,
  reconcileSessionRuntime,
  resolveHackerKillTargetForTest,
} from './runtime-domain.js';
import { buildSessionFromLobby } from './session-domain.js';

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
    revision: 0,
  };
}

describe('runtime-domain', () => {
  it('allocates deterministic 70/20/10 and 75/15/10 phase splits', () => {
    const durations = calculatePhaseDurations({
      ...DEFAULT_LOBBY_SETTINGS,
      dayDurationSeconds: 180,
      nightDurationSeconds: 60,
    });

    expect(durations[Phase.DAY_OPEN]).toBe(126);
    expect(durations[Phase.DAY_VOTE]).toBe(36);
    expect(durations[Phase.DAY_RESOLVE]).toBe(18);
    expect(durations[Phase.NIGHT_ACTIONS]).toBe(45);
    expect(durations[Phase.NIGHT_RESOLVE]).toBe(9);
    expect(durations[Phase.NIGHT_REVEAL]).toBe(6);
  });

  it('seeds hacker team counts by player range', () => {
    const lobby = buildLobby(11);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');

    initializeSessionRuntime(session, lobby.settings, '2026-03-17T00:00:00.000Z', () => 0);

    const hackers = Object.values(session.players).filter(
      (player) => player.team === Team.HACKERS,
    );
    expect(hackers).toHaveLength(3);
  });

  it('advances from NIGHT_REVEAL to DAY_OPEN and increments cycle', () => {
    const lobby = buildLobby(7);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, lobby.settings, '2026-03-17T00:00:00.000Z', () => 0.99);

    session.phase = Phase.NIGHT_REVEAL;
    session.cycle = 4;
    session.timers.currentPhaseEndsAt = '2026-03-17T00:00:10.000Z';

    const events = reconcileSessionRuntime(
      session,
      lobby,
      lobby.settings,
      '2026-03-17T00:00:11.000Z',
    );

    expect(events.some((event) => event.type === 'PHASE_ADVANCED')).toBe(true);
    expect(session.phase).toBe(Phase.DAY_OPEN);
    expect(session.cycle).toBe(5);
  });

  it('eliminates vote winner and removes them from channels', () => {
    const lobby = buildLobby(7);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, lobby.settings, '2026-03-17T00:00:00.000Z', () => 0.99);
    session.phase = Phase.DAY_VOTE;
    session.timers.currentPhaseEndsAt = '2026-03-17T00:00:20.000Z';

    for (const playerId of ['p2', 'p3', 'p4', 'p5']) {
      appendIntent(session, {
        playerId,
        type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId: 'p1' },
        phase: Phase.DAY_VOTE,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
    }

    reconcileSessionRuntime(session, lobby, lobby.settings, '2026-03-17T00:00:25.000Z');

    expect(session.players.p1.alive).toBe(false);
    expect(session.channels.global.members.includes('p1')).toBe(false);
  });

  it('does not eliminate when abstain has the most votes or when tied', () => {
    const lobby = buildLobby(7);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, lobby.settings, '2026-03-17T00:00:00.000Z', () => 0.99);
    session.phase = Phase.DAY_VOTE;
    session.timers.currentPhaseEndsAt = '2026-03-17T00:00:20.000Z';

    appendIntent(session, {
      playerId: 'p1',
      type: IntentType.SUBMIT_VOTE,
      payload: { targetPlayerId: 'p2' },
      phase: Phase.DAY_VOTE,
      cycle: session.cycle,
      createdAt: '2026-03-17T00:00:10.000Z',
    });
    appendIntent(session, {
      playerId: 'p2',
      type: IntentType.SUBMIT_VOTE,
      payload: { targetPlayerId: 'p3' },
      phase: Phase.DAY_VOTE,
      cycle: session.cycle,
      createdAt: '2026-03-17T00:00:10.000Z',
    });

    reconcileSessionRuntime(session, lobby, lobby.settings, '2026-03-17T00:00:25.000Z');
    expect(Object.values(session.players).every((player) => player.alive)).toBe(true);

    session.phase = Phase.DAY_VOTE;
    session.timers.currentPhaseEndsAt = '2026-03-17T00:01:20.000Z';
    session.pendingIntents = [];

    for (const [playerId, targetPlayerId] of [
      ['p1', 'p6'],
      ['p2', 'p6'],
      ['p3', 'p6'],
      ['p4', 'p7'],
      ['p5', 'p7'],
      ['p6', 'p7'],
    ] as const) {
      appendIntent(session, {
        playerId,
        type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId },
        phase: Phase.DAY_VOTE,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:01:00.000Z',
      });
    }

    reconcileSessionRuntime(session, lobby, lobby.settings, '2026-03-17T00:01:25.000Z');
    expect(Object.values(session.players).every((player) => player.alive)).toBe(true);
  });

  it('applies friend and hacker win checks after elimination', () => {
    const lobby = buildLobby(7);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, lobby.settings, '2026-03-17T00:00:00.000Z', () => 0.99);

    for (const player of Object.values(session.players)) {
      player.team = Team.FRIENDS;
    }
    session.players.p1.team = Team.HACKERS;

    const friendWinEvents = processElimination(
      session,
      lobby,
      'p1',
      '2026-03-17T00:00:10.000Z',
      'DAY_VOTE',
    );
    expect(friendWinEvents.some((event) => event.type === 'GAME_ENDED')).toBe(true);
    expect(session.status).toBe(SessionStatus.FRIENDS_WIN);

    const lobby2 = buildLobby(7);
    const session2 = buildSessionFromLobby(lobby2, 'game-2', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session2, lobby2.settings, '2026-03-17T00:00:00.000Z', () => 0.99);
    session2.players.p1.team = Team.HACKERS;
    session2.players.p2.team = Team.HACKERS;
    session2.players.p3.team = Team.FRIENDS;
    session2.players.p4.team = Team.FRIENDS;
    session2.players.p5.alive = false;
    session2.players.p6.alive = false;
    session2.players.p7.alive = false;

    const hackerWinEvents = processElimination(
      session2,
      lobby2,
      'p4',
      '2026-03-17T00:00:10.000Z',
      'DAY_VOTE',
    );
    expect(hackerWinEvents.some((event) => event.type === 'GAME_ENDED')).toBe(true);
    expect(session2.status).toBe(SessionStatus.HACKERS_WIN);
  });

  it('rejects duplicate votes but allows night-action overwrite', () => {
    const lobby = buildLobby(7);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, lobby.settings, '2026-03-17T00:00:00.000Z', () => 0.99);

    const firstVote = appendIntent(session, {
      playerId: 'p1',
      type: IntentType.SUBMIT_VOTE,
      payload: { targetPlayerId: 'p2' },
      phase: Phase.DAY_VOTE,
      cycle: session.cycle,
      createdAt: '2026-03-17T00:00:05.000Z',
    });
    const secondVote = appendIntent(session, {
      playerId: 'p1',
      type: IntentType.SUBMIT_VOTE,
      payload: { targetPlayerId: 'p3' },
      phase: Phase.DAY_VOTE,
      cycle: session.cycle,
      createdAt: '2026-03-17T00:00:06.000Z',
    });

    expect(firstVote.accepted).toBe(true);
    expect(secondVote).toEqual({
      accepted: false,
      reason: 'DUPLICATE_VOTE',
    });

    const nightAction1 = appendIntent(session, {
      playerId: 'p1',
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: {
        actionType: NightActionType.MONITOR,
        targetPlayerId: 'p2',
        metadata: {},
      },
      phase: Phase.NIGHT_ACTIONS,
      cycle: session.cycle,
      createdAt: '2026-03-17T00:00:07.000Z',
    });
    const nightAction2 = appendIntent(session, {
      playerId: 'p1',
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: {
        actionType: NightActionType.MONITOR,
        targetPlayerId: 'p3',
        metadata: {},
      },
      phase: Phase.NIGHT_ACTIONS,
      cycle: session.cycle,
      createdAt: '2026-03-17T00:00:08.000Z',
    });

    expect(nightAction1.accepted).toBe(true);
    expect(nightAction2.accepted).toBe(true);
    const nightActions = session.pendingIntents.filter(
      (intent) =>
        intent.type === IntentType.SUBMIT_NIGHT_ACTION && intent.playerId === 'p1',
    );
    expect(nightActions).toHaveLength(1);
    expect((nightActions[0].payload as { targetPlayerId: string | null }).targetPlayerId).toBe('p3');
  });

  it('initializeSessionRuntime: hacker channel populated, capped event log, GAME_STARTED carries typed metadata', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);

    // Hacker channel exists, has type HACKER, populated with assigned Hackers (count 2 for n=5).
    expect(session.channels.hacker).toBeDefined();
    expect(session.channels.hacker.type).toBe('HACKER');
    const hackerIds = Object.values(session.players)
      .filter((p) => p.team === Team.HACKERS)
      .map((p) => p.playerId)
      .sort();
    expect(session.channels.hacker.members.sort()).toEqual(hackerIds);
    expect(hackerIds).toHaveLength(2);

    // GAME_STARTED appended once with typed metadata.
    const started = session.systemEvents.find((e) => e.type === SystemEventType.GAME_STARTED);
    expect(started?.metadata).toEqual({ type: 'GAME_STARTED' });
  });

  it('DAY_VOTE → DAY_RESOLVE appends PLAYER_VOTED_OUT system event with target metadata', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);

    session.phase = Phase.DAY_VOTE;
    session.timers.currentPhaseEndsAt = '2026-03-17T00:00:30.000Z';

    const voters = ['p1', 'p2', 'p4', 'p5'];
    for (const voterId of voters) {
      appendIntent(session, {
        playerId: voterId,
        type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId: 'p3' },
        phase: Phase.DAY_VOTE,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
    }

    const events = reconcileSessionRuntime(
      session,
      lobby,
      DEFAULT_LOBBY_SETTINGS,
      '2026-03-17T00:00:31.000Z',
    );

    const elimEvent = events.find((e) => e.type === 'PLAYER_ELIMINATED');
    expect(elimEvent).toBeDefined();

    const sysEvent = session.systemEvents.find(
      (e) => e.type === SystemEventType.PLAYER_VOTED_OUT,
    );
    expect(sysEvent).toBeDefined();
    expect(sysEvent?.metadata).toEqual({
      type: 'PLAYER_VOTED_OUT',
      targetPlayerId: 'p3',
      targetDisplayName: 'Player 3',
    });
  });

  describe('resolveHackerKillTarget', () => {
    function setupNightSession() {
      const lobby = buildLobby(5);
      const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
      initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);
      session.phase = Phase.NIGHT_ACTIONS;
      return { lobby, session };
    }

    function submitKill(session: ReturnType<typeof setupNightSession>['session'], hackerId: string, targetId: string | null) {
      appendIntent(session, {
        playerId: hackerId,
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: targetId, metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
    }

    function hackersOf(session: ReturnType<typeof setupNightSession>['session']): string[] {
      return Object.values(session.players)
        .filter((p) => p.team === Team.HACKERS)
        .map((p) => p.playerId);
    }

    function friendsOf(session: ReturnType<typeof setupNightSession>['session']): string[] {
      return Object.values(session.players)
        .filter((p) => p.team === Team.FRIENDS)
        .map((p) => p.playerId);
    }

    it('returns the plurality winner when Hackers agree', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1] = friendsOf(session);
      submitKill(session, h1, f1);
      submitKill(session, h2, f1);
      expect(resolveHackerKillTargetForTest(session)).toBe(f1);
    });

    it('returns null on tie between two Hackers', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1, f2] = friendsOf(session);
      submitKill(session, h1, f1);
      submitKill(session, h2, f2);
      expect(resolveHackerKillTargetForTest(session)).toBeNull();
    });

    it('returns null when all Hackers abstain (no submissions)', () => {
      const { session } = setupNightSession();
      expect(resolveHackerKillTargetForTest(session)).toBeNull();
    });

    it('treats a target that is already dead at resolution as abstain', () => {
      const { session, lobby } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1] = friendsOf(session);
      submitKill(session, h1, f1);
      submitKill(session, h2, f1);
      processElimination(session, lobby, f1, '2026-03-17T00:00:20.000Z', 'PLAYER_LEFT');
      expect(resolveHackerKillTargetForTest(session)).toBeNull();
    });

    it('rejects a target that is a Hacker (treats as abstain)', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      submitKill(session, h1, h2);
      submitKill(session, h2, h2);
      expect(resolveHackerKillTargetForTest(session)).toBeNull();
    });

    it('rejects self-target (treats as abstain)', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      submitKill(session, h1, h1);
      submitKill(session, h2, h2);
      expect(resolveHackerKillTargetForTest(session)).toBeNull();
    });

    it('awards a lone Hacker the kill when they submit a valid target', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1] = friendsOf(session);
      session.players[h2].alive = false;
      submitKill(session, h1, f1);
      expect(resolveHackerKillTargetForTest(session)).toBe(f1);
    });

    it('uses the latest intent per hacker when multiple HACKER_KILL intents exist for the same cycle', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1, f2] = friendsOf(session);
      session.pendingIntents.push({
        id: crypto.randomUUID(),
        playerId: h1,
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: f1, metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:05.000Z',
      });
      session.pendingIntents.push({
        id: crypto.randomUUID(),
        playerId: h1,
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: f2, metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
      submitKill(session, h2, f2);
      expect(resolveHackerKillTargetForTest(session)).toBe(f2);
    });

    it('ignores SUBMIT_NIGHT_ACTION intents from non-Hackers in pendingIntents (defensive)', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1, f2] = friendsOf(session);
      session.pendingIntents.push({
        id: crypto.randomUUID(),
        playerId: f1,
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: f2, metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle,
        createdAt: '2026-03-17T00:00:10.000Z',
      });
      submitKill(session, h1, f2);
      submitKill(session, h2, f2);
      expect(resolveHackerKillTargetForTest(session)).toBe(f2);
    });

    it('ignores intents from previous cycles', () => {
      const { session } = setupNightSession();
      const [h1, h2] = hackersOf(session);
      const [f1, f2] = friendsOf(session);
      session.pendingIntents.push({
        id: crypto.randomUUID(),
        playerId: h1,
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: f2, metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle - 1,
        createdAt: '2026-03-17T00:00:05.000Z',
      });
      submitKill(session, h1, f1);
      submitKill(session, h2, f1);
      expect(resolveHackerKillTargetForTest(session)).toBe(f1);
    });
  });

  describe('NIGHT_ACTIONS → NIGHT_RESOLVE', () => {
    function toNightActions(now: string) {
      const lobby = buildLobby(5);
      const session = buildSessionFromLobby(lobby, 'game-1', now);
      initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, now, () => 0);
      session.phase = Phase.NIGHT_ACTIONS;
      session.timers.currentPhaseEndsAt = '2026-03-17T00:00:30.000Z';
      return { lobby, session };
    }

    it('applies the plurality kill, emits PLAYER_ELIMINATED with reason NIGHT_KILL, and appends PLAYER_KILLED_AT_NIGHT', () => {
      const { lobby, session } = toNightActions('2026-03-17T00:00:00.000Z');
      const hackers = Object.values(session.players).filter((p) => p.team === Team.HACKERS).map((p) => p.playerId);
      const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!.playerId;
      for (const h of hackers) {
        appendIntent(session, {
          playerId: h,
          type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: friend, metadata: {} },
          phase: Phase.NIGHT_ACTIONS,
          cycle: session.cycle,
          createdAt: '2026-03-17T00:00:10.000Z',
        });
      }

      const events = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

      const elim = events.find((e) => e.type === 'PLAYER_ELIMINATED');
      expect(elim).toBeDefined();
      if (elim && elim.type === 'PLAYER_ELIMINATED') {
        expect(elim.reason).toBe('NIGHT_KILL');
        expect(elim.playerId).toBe(friend);
      }
      expect(session.players[friend].alive).toBe(false);
      const sysEvent = session.systemEvents.find((e) => e.type === SystemEventType.PLAYER_KILLED_AT_NIGHT);
      expect(sysEvent).toBeDefined();
      expect(sysEvent?.metadata).toEqual({
        type: 'PLAYER_KILLED_AT_NIGHT',
        targetPlayerId: friend,
        targetDisplayName: session.players[friend]?.displayName ?? expect.any(String),
      });
    });

    it('appends NO_KILL_TONIGHT when Hackers tie', () => {
      const { lobby, session } = toNightActions('2026-03-17T00:00:00.000Z');
      const [h1, h2] = Object.values(session.players).filter((p) => p.team === Team.HACKERS).map((p) => p.playerId);
      const friends = Object.values(session.players).filter((p) => p.team === Team.FRIENDS).map((p) => p.playerId);
      appendIntent(session, {
        playerId: h1, type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: friends[0], metadata: {} },
        phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
      });
      appendIntent(session, {
        playerId: h2, type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: friends[1], metadata: {} },
        phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
      });

      const events = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');
      expect(events.find((e) => e.type === 'PLAYER_ELIMINATED')).toBeUndefined();
      const sysEvent = session.systemEvents.find((e) => e.type === SystemEventType.NO_KILL_TONIGHT);
      expect(sysEvent).toBeDefined();
      expect(sysEvent?.metadata).toEqual({ type: 'NO_KILL_TONIGHT' });
    });

    it('triggers GAME_ENDED when the night kill reaches the win threshold', () => {
      const { lobby, session } = toNightActions('2026-03-17T00:00:00.000Z');
      const hackers = Object.values(session.players).filter((p) => p.team === Team.HACKERS).map((p) => p.playerId);
      const friends = Object.values(session.players).filter((p) => p.team === Team.FRIENDS).map((p) => p.playerId);
      session.players[friends[0]].alive = false;

      for (const h of hackers) {
        appendIntent(session, {
          playerId: h, type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: friends[1], metadata: {} },
          phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
        });
      }

      const events = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');
      expect(session.status).toBe(SessionStatus.HACKERS_WIN);
      expect(events.find((e) => e.type === 'GAME_ENDED')).toBeDefined();
    });

    it('does not append PLAYER_KILLED_AT_NIGHT when no Hackers are alive', () => {
      const { lobby, session } = toNightActions('2026-03-17T00:00:00.000Z');
      Object.values(session.players)
        .filter((p) => p.team === Team.HACKERS)
        .forEach((p) => { p.alive = false; });

      const events = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');
      expect(events.find((e) => e.type === 'PLAYER_ELIMINATED')).toBeUndefined();
    });

    it('uses the metadata builder so PLAYER_KILLED_AT_NIGHT entries match the typed schema', () => {
      const { lobby, session } = toNightActions('2026-03-17T00:00:00.000Z');
      const hackers = Object.values(session.players).filter((p) => p.team === Team.HACKERS).map((p) => p.playerId);
      const friend = Object.values(session.players).find((p) => p.team === Team.FRIENDS)!;
      for (const h of hackers) {
        appendIntent(session, {
          playerId: h, type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: friend.playerId, metadata: {} },
          phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
        });
      }
      reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');
      const evt = session.systemEvents.find((e) => e.type === SystemEventType.PLAYER_KILLED_AT_NIGHT);
      expect(evt?.metadata).toEqual({
        type: 'PLAYER_KILLED_AT_NIGHT',
        targetPlayerId: friend.playerId,
        targetDisplayName: friend.displayName,
      });
    });
  });

  it('replayed reconciliation at the same now does not double-append events', () => {
    const now0 = '2026-03-17T00:00:00.000Z';
    const lobby = buildLobby(7);
    const session = buildSessionFromLobby(lobby, 'game-1', now0);
    initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, now0, () => 0);

    session.phase = Phase.DAY_VOTE;
    session.timers.currentPhaseEndsAt = '2026-03-17T00:00:30.000Z';
    const voters = Object.values(session.players).map((p) => p.playerId);
    for (const v of voters.slice(0, 4)) {
      appendIntent(session, {
        playerId: v, type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId: voters[4] }, phase: Phase.DAY_VOTE,
        cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
      });
    }

    const transitionNow = '2026-03-17T00:00:31.000Z';
    const events1 = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, transitionNow);
    const events2 = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, transitionNow);

    expect(events1.some((e) => e.type === 'PHASE_ADVANCED')).toBe(true);
    expect(events1.some((e) => e.type === 'PLAYER_ELIMINATED')).toBe(true);
    expect(events2).toHaveLength(0);

    const votedOutEvents = session.systemEvents.filter(
      (e) => e.type === SystemEventType.PLAYER_VOTED_OUT,
    );
    expect(votedOutEvents).toHaveLength(1);
  });

  it('triple invocation across a phase boundary still produces exactly one elimination + one system event', () => {
    const lobby = buildLobby(7);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);
    session.phase = Phase.DAY_VOTE;
    session.timers.currentPhaseEndsAt = '2026-03-17T00:00:30.000Z';
    const voters = Object.values(session.players).map((p) => p.playerId);
    for (const v of voters.slice(0, 4)) {
      appendIntent(session, {
        playerId: v, type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId: voters[4] }, phase: Phase.DAY_VOTE,
        cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
      });
    }

    const e1 = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:29.000Z');
    const e2 = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');
    const e3 = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

    expect(e1).toHaveLength(0);
    expect(e2.find((e) => e.type === 'PLAYER_ELIMINATED')).toBeDefined();
    expect(e3).toHaveLength(0);

    const sysEvents = session.systemEvents.filter((e) => e.type === SystemEventType.PLAYER_VOTED_OUT);
    expect(sysEvents).toHaveLength(1);
  });

  describe('resolveNightActions (priority resolver)', () => {
    function buildNightSession() {
      const lobby = buildLobby(5);
      const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
      initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);
      session.phase = Phase.NIGHT_ACTIONS;
      session.timers.currentPhaseEndsAt = '2026-03-17T00:00:30.000Z';
      return { lobby, session };
    }

    function hackerIds(session: GameState): string[] {
      return Object.values(session.players).filter((p) => p.team === Team.HACKERS).map((p) => p.playerId);
    }

    function friendIds(session: GameState): string[] {
      return Object.values(session.players).filter((p) => p.team === Team.FRIENDS).map((p) => p.playerId);
    }

    it('Tier 1 PROTECT blocks a Tier 4 HACKER_KILL on the same target', () => {
      const { lobby, session } = buildNightSession();
      const [h1, h2] = hackerIds(session);
      const [f1, f2] = friendIds(session);

      // Hackers both target f1
      for (const h of [h1, h2]) {
        appendIntent(session, {
          playerId: h, type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: f1, metadata: {} },
          phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
        });
      }
      // A Friend protects f1 (roleId validation happens in the handler, not the resolver).
      appendIntent(session, {
        playerId: f2, type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.PROTECT, targetPlayerId: f1, metadata: {} },
        phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:11.000Z',
      });

      const events = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

      expect(session.players[f1].alive).toBe(true);
      expect(events.find((e) => e.type === 'PLAYER_ELIMINATED')).toBeUndefined();
      const protEvent = session.systemEvents.find((e) => e.type === SystemEventType.NIGHT_KILL_PROTECTED);
      expect(protEvent).toBeDefined();
      expect(protEvent?.metadata).toMatchObject({
        type: 'NIGHT_KILL_PROTECTED',
        targetPlayerId: f1,
      });
    });

    it('PROTECT on a different target does not block the kill', () => {
      const { lobby, session } = buildNightSession();
      const [h1, h2] = hackerIds(session);
      const [f1, f2, f3] = friendIds(session);

      for (const h of [h1, h2]) {
        appendIntent(session, {
          playerId: h, type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: f1, metadata: {} },
          phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
        });
      }
      // Protection on f2 (different player) should not help f1.
      appendIntent(session, {
        playerId: f3, type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.PROTECT, targetPlayerId: f2, metadata: {} },
        phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:11.000Z',
      });

      reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

      expect(session.players[f1].alive).toBe(false);
      expect(session.players[f2].alive).toBe(true);
    });

    it('Tier 2 INVESTIGATE writes a private system event visible only to the investigator', () => {
      const { lobby, session } = buildNightSession();
      const [h1] = hackerIds(session);
      const [f1, f2] = friendIds(session);
      // Force a known target role for the assertion (role assignment is a separate issue).
      session.players[h1].roleId = 'HACKER';

      appendIntent(session, {
        playerId: f1, type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.INVESTIGATE, targetPlayerId: h1, metadata: {} },
        phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
      });

      reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

      // Never added to public systemEvents.
      expect(session.systemEvents.find((e) => e.type === SystemEventType.INVESTIGATION_RESULT)).toBeUndefined();
      // Added to the investigator's private bucket.
      const privateForF1 = session.privateSystemEvents?.[f1] ?? [];
      const investigation = privateForF1.find((e) => e.type === SystemEventType.INVESTIGATION_RESULT);
      expect(investigation).toBeDefined();
      expect(investigation?.metadata).toMatchObject({
        type: 'INVESTIGATION_RESULT',
        targetPlayerId: h1,
        targetRoleId: 'HACKER',
        targetTeam: Team.HACKERS,
      });
      // Another player sees nothing private for themselves here.
      expect(session.privateSystemEvents?.[f2]).toBeUndefined();
    });

    it('Tier 5 CREATE_TEMP_CHAT adds a TEMP channel expiring at DAY_RESOLVE', () => {
      const { lobby, session } = buildNightSession();
      const [f1, f2] = friendIds(session);

      appendIntent(session, {
        playerId: f1, type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.CREATE_TEMP_CHAT, targetPlayerId: f2, metadata: {} },
        phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
      });

      reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

      const tempChannels = Object.values(session.channels).filter((c) => c.type === ChannelType.TEMP);
      expect(tempChannels).toHaveLength(1);
      expect(tempChannels[0].members.sort()).toEqual([f1, f2].sort());
      expect(tempChannels[0].expiresAt).toBe(Phase.DAY_RESOLVE);
      expect(tempChannels[0].locked).toBe(false);
      const ev = session.systemEvents.find((e) => e.type === SystemEventType.TEMP_CHANNEL_CREATED);
      expect(ev).toBeDefined();
    });

    it('Tier 5 CHANNEL_LOCK sets locked=true on a non-system channel', () => {
      const { lobby, session } = buildNightSession();
      const [f1] = friendIds(session);

      appendIntent(session, {
        playerId: f1, type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.CHANNEL_LOCK, targetPlayerId: 'global', metadata: {} },
        phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
      });

      reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

      expect(session.channels.global.locked).toBe(true);
      const ev = session.systemEvents.find((e) => e.type === SystemEventType.CHANNEL_LOCKED);
      expect(ev?.metadata).toEqual({ type: 'CHANNEL_LOCKED', channelId: 'global' });
    });

    it('priority order: PROTECT wins even when submitted after the kill intents', () => {
      const { lobby, session } = buildNightSession();
      const [h1, h2] = hackerIds(session);
      const [f1, f2] = friendIds(session);

      // Kill submitted earlier
      for (const h of [h1, h2]) {
        appendIntent(session, {
          playerId: h, type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: f1, metadata: {} },
          phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:05.000Z',
        });
      }
      // Protection submitted later (createdAt later), still applies first by tier.
      appendIntent(session, {
        playerId: f2, type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.PROTECT, targetPlayerId: f1, metadata: {} },
        phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:25.000Z',
      });

      reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

      expect(session.players[f1].alive).toBe(true);
    });

    it('clears night-action intents after resolution', () => {
      const { lobby, session } = buildNightSession();
      const [h1, h2] = hackerIds(session);
      const [f1] = friendIds(session);

      for (const h of [h1, h2]) {
        appendIntent(session, {
          playerId: h, type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: f1, metadata: {} },
          phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
        });
      }

      reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

      const remaining = session.pendingIntents.filter((i) => i.type === IntentType.SUBMIT_NIGHT_ACTION);
      expect(remaining).toHaveLength(0);
    });

    describe('VENGEFUL_KILL', () => {
      // Uses 7 players (2 Hackers + 5 Friends) so that killing the vengeful Friend
      // does not immediately satisfy the Hackers-win condition (which would prevent
      // the VENGEFUL_KILL branch from running while session.status === ACTIVE).
      function buildLargerNightSession() {
        const lobby = buildLobby(7);
        const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
        initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);
        session.phase = Phase.NIGHT_ACTIONS;
        session.timers.currentPhaseEndsAt = '2026-03-17T00:00:30.000Z';
        return { lobby, session };
      }

      it('vengeful target is eliminated when the victim had a valid VENGEFUL_KILL queued', () => {
        const { lobby, session } = buildLargerNightSession();
        const [h1, h2] = hackerIds(session);
        const [f1, f2, f3] = friendIds(session);

        // f1 is our vengeful player; set roleId so the resolver's synchronous-trigger logic is clear.
        const vengefulId = f1;
        const revengeTargetId = f2;
        session.players[vengefulId].roleId = 'VENGEFUL';

        // Both Hackers target the vengeful player.
        for (const h of [h1, h2]) {
          appendIntent(session, {
            playerId: h, type: IntentType.SUBMIT_NIGHT_ACTION,
            payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: vengefulId, metadata: {} },
            phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
          });
        }

        // Vengeful player queues a VENGEFUL_KILL against f2.
        appendIntent(session, {
          playerId: vengefulId, type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: NightActionType.VENGEFUL_KILL, targetPlayerId: revengeTargetId, metadata: {} },
          phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:11.000Z',
        });

        const events = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

        // Vengeful player is dead.
        expect(session.players[vengefulId].alive).toBe(false);
        // Revenge target is also dead.
        expect(session.players[revengeTargetId].alive).toBe(false);
        // f3 (uninvolved friend) is still alive.
        expect(session.players[f3].alive).toBe(true);

        // Two PLAYER_KILLED_AT_NIGHT system events: one per victim.
        const nightKillEvents = session.systemEvents.filter(
          (e) => e.type === SystemEventType.PLAYER_KILLED_AT_NIGHT,
        );
        expect(nightKillEvents).toHaveLength(2);

        // Both PLAYER_ELIMINATED runtime events must exist.
        const elimEvents = events.filter((e) => e.type === 'PLAYER_ELIMINATED');
        expect(elimEvents).toHaveLength(2);
        const elimPlayerIds = elimEvents.map((e) => (e as { playerId: string }).playerId);
        expect(elimPlayerIds).toContain(vengefulId);
        expect(elimPlayerIds).toContain(revengeTargetId);
      });

      it('vengeful target is NOT eliminated when they were protected in tier 1', () => {
        const { lobby, session } = buildLargerNightSession();
        const [h1, h2] = hackerIds(session);
        const [f1, f2, f3] = friendIds(session);

        const vengefulId = f1;
        const revengeTargetId = f2;
        const protectorId = f3;
        session.players[vengefulId].roleId = 'VENGEFUL';

        // Both Hackers target the vengeful player — that kill goes through (no protection on f1).
        for (const h of [h1, h2]) {
          appendIntent(session, {
            playerId: h, type: IntentType.SUBMIT_NIGHT_ACTION,
            payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: vengefulId, metadata: {} },
            phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
          });
        }

        // Vengeful player queues a VENGEFUL_KILL against f2.
        appendIntent(session, {
          playerId: vengefulId, type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: NightActionType.VENGEFUL_KILL, targetPlayerId: revengeTargetId, metadata: {} },
          phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:11.000Z',
        });

        // f3 protects the revenge target (f2), blocking the VENGEFUL_KILL.
        appendIntent(session, {
          playerId: protectorId, type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: NightActionType.PROTECT, targetPlayerId: revengeTargetId, metadata: {} },
          phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:09.000Z',
        });

        const events = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

        // Vengeful player is dead (their protection didn't cover them).
        expect(session.players[vengefulId].alive).toBe(false);
        // Revenge target is alive (protected).
        expect(session.players[revengeTargetId].alive).toBe(true);

        // Exactly one PLAYER_KILLED_AT_NIGHT (the vengeful player's death).
        const nightKillEvents = session.systemEvents.filter(
          (e) => e.type === SystemEventType.PLAYER_KILLED_AT_NIGHT,
        );
        expect(nightKillEvents).toHaveLength(1);
        expect(nightKillEvents[0].metadata).toMatchObject({ targetPlayerId: vengefulId });

        // The resolver silently drops the blocked VENGEFUL_KILL (no event is emitted for it).
        // The only NIGHT_KILL_PROTECTED event that exists is for the initial hacker kill, but
        // since the hacker kill target (vengefulId) was NOT protected, there is no
        // NIGHT_KILL_PROTECTED event at all in this scenario.
        // Verify: only one elimination occurred (the vengeful player's).
        const elimEvents = events.filter((e) => e.type === 'PLAYER_ELIMINATED');
        expect(elimEvents).toHaveLength(1);
        expect((elimEvents[0] as { playerId: string }).playerId).toBe(vengefulId);
      });

      it('vengeful-kill that reduces hackersAlive to 0 produces GAME_ENDED with FRIENDS_WIN', () => {
        const { lobby, session } = buildNightSession();
        const [h1, h2] = hackerIds(session);
        const [f1] = friendIds(session);

        const vengefulId = f1;
        session.players[vengefulId].roleId = 'VENGEFUL';

        // Both Hackers target the vengeful Friend.
        for (const h of [h1, h2]) {
          appendIntent(session, {
            playerId: h, type: IntentType.SUBMIT_NIGHT_ACTION,
            payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: vengefulId, metadata: {} },
            phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:10.000Z',
          });
        }

        // Vengeful Friend queues a VENGEFUL_KILL targeting h1.
        appendIntent(session, {
          playerId: vengefulId, type: IntentType.SUBMIT_NIGHT_ACTION,
          payload: { actionType: NightActionType.VENGEFUL_KILL, targetPlayerId: h1, metadata: {} },
          phase: Phase.NIGHT_ACTIONS, cycle: session.cycle, createdAt: '2026-03-17T00:00:11.000Z',
        });

        // Pre-eliminate h2 so that after the vengeful kill on h1, zero Hackers remain.
        session.players[h2].alive = false;

        const events = reconcileSessionRuntime(session, lobby, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:31.000Z');

        // Game should have ended with Friends winning.
        expect(session.status).toBe(SessionStatus.FRIENDS_WIN);

        const gameEndedEvent = events.find((e) => e.type === 'GAME_ENDED');
        expect(gameEndedEvent).toBeDefined();
        if (gameEndedEvent && gameEndedEvent.type === 'GAME_ENDED') {
          expect(gameEndedEvent.winnerTeam).toBe(Team.FRIENDS);
        }
      });
    });
  });
});

describe('buildRolePool', () => {
  it('returns pool of correct size filled with base role when no roles enabled', () => {
    const pool = buildRolePool(Team.FRIENDS, 5, 7, []);
    expect(pool).toHaveLength(5);
    expect(pool.every((r) => r === RoleId.FRIEND)).toBe(true);
  });

  it('returns hacker base roles when no roles enabled for hackers', () => {
    const pool = buildRolePool(Team.HACKERS, 2, 7, []);
    expect(pool).toHaveLength(2);
    expect(pool.every((r) => r === RoleId.HACKER)).toBe(true);
  });

  it('includes special roles that are enabled and meet minPlayers', () => {
    const pool = buildRolePool(Team.FRIENDS, 5, 7, [
      RoleId.EXTROVERT,
      RoleId.WHITE_HAT_HACKER,
      RoleId.SECURITY_SPECIALIST,
    ]);
    expect(pool).toHaveLength(5);
    expect(pool.filter((r) => r !== RoleId.FRIEND)).toHaveLength(3);
    expect(pool).toContain(RoleId.EXTROVERT);
    expect(pool).toContain(RoleId.WHITE_HAT_HACKER);
    expect(pool).toContain(RoleId.SECURITY_SPECIALIST);
  });

  it('excludes roles that do not meet minPlayers threshold', () => {
    // TROLLER requires minPlayers 11, but we only have 7
    const pool = buildRolePool(Team.HACKERS, 2, 7, [RoleId.THE_BOSS, RoleId.TROLLER]);
    expect(pool).toHaveLength(2);
    expect(pool).toContain(RoleId.THE_BOSS);
    expect(pool).not.toContain(RoleId.TROLLER);
  });

  it('caps special roles at teamSize - 1 to guarantee at least one base role', () => {
    const pool = buildRolePool(Team.HACKERS, 2, 11, [
      RoleId.THE_BOSS,
      RoleId.SIGNAL_JAMMER,
      RoleId.EAVESDROPPER,
      RoleId.TROLLER,
      RoleId.IMITATOR,
    ]);
    expect(pool).toHaveLength(2);
    expect(pool.filter((r) => r === RoleId.HACKER)).toHaveLength(1);
    expect(pool.filter((r) => r !== RoleId.HACKER)).toHaveLength(1);
  });

  it('ignores roles from the wrong team', () => {
    const pool = buildRolePool(Team.FRIENDS, 3, 7, [RoleId.THE_BOSS, RoleId.EXTROVERT]);
    expect(pool).not.toContain(RoleId.THE_BOSS);
    expect(pool).toContain(RoleId.EXTROVERT);
  });
});

describe('role assignment via initializeSessionRuntime', () => {
  it('assigns a non-null roleId to every player', () => {
    const lobby = buildLobby(7);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, lobby.settings, '2026-03-17T00:00:00.000Z', () => 0.5);

    for (const player of Object.values(session.players)) {
      expect(player.roleId).not.toBeNull();
    }
  });

  it('assigns friend-team roles only to friends and hacker-team roles only to hackers', () => {
    const lobby = buildLobby(10);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, lobby.settings, '2026-03-17T00:00:00.000Z', () => 0.5);

    const friendRoles = new Set([RoleId.FRIEND, RoleId.EXTROVERT, RoleId.WHITE_HAT_HACKER, RoleId.SECURITY_SPECIALIST]);
    const hackerRoles = new Set([RoleId.HACKER, RoleId.THE_BOSS, RoleId.SIGNAL_JAMMER, RoleId.EAVESDROPPER, RoleId.TROLLER, RoleId.IMITATOR]);

    for (const player of Object.values(session.players)) {
      if (player.team === Team.FRIENDS) {
        expect(friendRoles.has(player.roleId as RoleId)).toBe(true);
      } else {
        expect(hackerRoles.has(player.roleId as RoleId)).toBe(true);
      }
    }
  });

  it('assigns all base roles when enabledRoles is empty', () => {
    const lobby = buildLobby(7);
    lobby.settings.enabledRoles = [];
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, lobby.settings, '2026-03-17T00:00:00.000Z', () => 0.5);

    for (const player of Object.values(session.players)) {
      if (player.team === Team.FRIENDS) {
        expect(player.roleId).toBe(RoleId.FRIEND);
      } else {
        expect(player.roleId).toBe(RoleId.HACKER);
      }
    }
  });

  it('produces deterministic assignments with a seeded random', () => {
    const lobby = buildLobby(10);
    const session1 = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    const session2 = buildSessionFromLobby(lobby, 'game-2', '2026-03-17T00:00:00.000Z');

    let seed = 0.42;
    const seeded = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

    let seed2 = 0.42;
    const seeded2 = () => { seed2 = (seed2 * 9301 + 49297) % 233280; return seed2 / 233280; };

    initializeSessionRuntime(session1, lobby.settings, '2026-03-17T00:00:00.000Z', seeded);
    initializeSessionRuntime(session2, lobby.settings, '2026-03-17T00:00:00.000Z', seeded2);

    for (const playerId of Object.keys(session1.players)) {
      expect(session1.players[playerId].roleId).toBe(session2.players[playerId].roleId);
      expect(session1.players[playerId].team).toBe(session2.players[playerId].team);
    }
  });
});
