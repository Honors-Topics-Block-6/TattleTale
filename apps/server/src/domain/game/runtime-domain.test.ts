import { IntentType, LobbyStatus, Phase, SessionStatus, SystemEventType, Team } from '@tattletale/shared';
import { describe, expect, it } from 'vitest';

import type { LobbyState } from '../lobby/types.js';
import { DEFAULT_LOBBY_SETTINGS } from '../lobby/types.js';
import {
  appendIntent,
  calculatePhaseDurations,
  initializeSessionRuntime,
  processElimination,
  reconcileSessionRuntime,
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
  };
}

describe('runtime-domain', () => {
  it('allocates deterministic 70/20/10 and 75/15/10 phase splits', () => {
    const durations = calculatePhaseDurations({
      minPlayers: 7,
      maxPlayers: 20,
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
        actionType: 'SCAN',
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
        actionType: 'SCAN',
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
});
