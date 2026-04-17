import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { Phase, IntentType, NightActionType, SessionStatus, SystemEventType, Team } from '@tattletale/shared';
import { buildSessionFromLobby } from '../domain/game/session-domain.js';
import {
  appendIntent,
  calculatePhaseDurations,
  initializeSessionRuntime,
  reconcileSessionRuntime,
} from '../domain/game/runtime-domain.js';
import { DEFAULT_LOBBY_SETTINGS } from '../domain/lobby/types.js';
import type { LobbyState } from '../domain/lobby/types.js';

describe('GameRoomDO integration', () => {
  it('health endpoint returns ok', async () => {
    const resp = await SELF.fetch('http://localhost/health');
    const body = (await resp.json()) as { ok: boolean };
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('creates a lobby via HTTP', async () => {
    const resp = await SELF.fetch('http://localhost/api/lobby/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'TestHost' }),
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      lobbyCode: string;
      playerId: string;
      reconnectToken: string;
      wsUrl: string;
    };
    expect(body.ok).toBe(true);
    expect(body.lobbyCode).toBeTruthy();
    expect(body.playerId).toBeTruthy();
    expect(body.reconnectToken).toBeTruthy();
    expect(body.wsUrl).toContain('/api/lobby/');
  });

  it('ready endpoint checks D1', async () => {
    const resp = await SELF.fetch('http://localhost/ready');
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { d1: string };
    expect(body.d1).toBe('ok');
  });
});

// ─── Full game cycle: domain-level integration test ─────────────
//
// Exercises the complete DAY_OPEN → DAY_VOTE → DAY_RESOLVE →
// NIGHT_ACTIONS → NIGHT_RESOLVE → NIGHT_REVEAL cycle with a hacker
// night kill, verifying elimination events, system events, and win
// detection — the same reconciliation path that the DO alarm handler
// drives, without requiring WebSocket hibernation in the test harness.

describe('full game cycle with hacker night kill', () => {
  function buildLobby(count: number): LobbyState {
    return {
      code: 'CYCLE',
      status: 'IN_GAME' as any,
      hostPlayerId: 'p1',
      players: Array.from({ length: count }, (_, i) => ({
        playerId: `p${i + 1}`,
        displayName: `Player ${i + 1}`,
        isHost: i === 0,
        ready: true,
        connected: true,
        alive: true,
        reconnectToken: `tok-${i + 1}`,
        joinedAt: '2026-03-17T00:00:00.000Z',
      })),
      settings: {
        minPlayers: 5,
        maxPlayers: 5,
        dayDurationSeconds: 3,
        nightDurationSeconds: 3,
      },
      sessionId: 'game-1',
      createdAt: '2026-03-17T00:00:00.000Z',
      updatedAt: '2026-03-17T00:00:00.000Z',
    };
  }

  function addSeconds(iso: string, seconds: number): string {
    return new Date(Date.parse(iso) + seconds * 1000).toISOString();
  }

  it('runs DAY_OPEN → … → NIGHT_ACTIONS → kill applied → HACKERS_WIN', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    // Deterministic shuffle: () => 0 keeps original order, so p1 & p2 are Hackers.
    initializeSessionRuntime(session, lobby.settings, '2026-03-17T00:00:00.000Z', () => 0);

    const hackerIds = Object.values(session.players)
      .filter((p) => p.team === Team.HACKERS)
      .map((p) => p.playerId);
    const friendIds = Object.values(session.players)
      .filter((p) => p.team === Team.FRIENDS)
      .map((p) => p.playerId);

    expect(hackerIds).toHaveLength(2);
    expect(friendIds).toHaveLength(3);
    expect(session.phase).toBe(Phase.DAY_OPEN);
    expect(session.status).toBe(SessionStatus.ACTIVE);

    const durations = calculatePhaseDurations(lobby.settings);
    let now = '2026-03-17T00:00:00.000Z';

    // Advance through DAY_OPEN → DAY_VOTE → DAY_RESOLVE → NIGHT_ACTIONS
    // by expiring each phase deadline.
    const phases = [Phase.DAY_OPEN, Phase.DAY_VOTE, Phase.DAY_RESOLVE] as Phase[];
    for (const expectedPhase of phases) {
      expect(session.phase).toBe(expectedPhase);
      now = addSeconds(session.timers.currentPhaseEndsAt!, 1);
      const events = reconcileSessionRuntime(session, lobby, lobby.settings, now);
      expect(events.some((e) => e.type === 'PHASE_ADVANCED')).toBe(true);
    }

    // Should now be in NIGHT_ACTIONS
    expect(session.phase).toBe(Phase.NIGHT_ACTIONS);

    // Both Hackers submit HACKER_KILL targeting the first Friend
    const targetId = friendIds[0];
    for (const hackerId of hackerIds) {
      appendIntent(session, {
        playerId: hackerId,
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: targetId, metadata: {} },
        phase: Phase.NIGHT_ACTIONS,
        cycle: session.cycle,
        createdAt: addSeconds(now, 1),
      });
    }

    // Advance past NIGHT_ACTIONS → resolves the kill
    now = addSeconds(session.timers.currentPhaseEndsAt!, 1);
    const nightEvents = reconcileSessionRuntime(session, lobby, lobby.settings, now);

    // Assert: PLAYER_ELIMINATED with reason NIGHT_KILL
    const elimEvent = nightEvents.find((e) => e.type === 'PLAYER_ELIMINATED');
    expect(elimEvent).toBeDefined();
    if (elimEvent && elimEvent.type === 'PLAYER_ELIMINATED') {
      expect(elimEvent.reason).toBe('NIGHT_KILL');
      expect(elimEvent.playerId).toBe(targetId);
    }

    // Assert: target is dead
    expect(session.players[targetId].alive).toBe(false);

    // Assert: PLAYER_KILLED_AT_NIGHT system event appended
    const nightKillSysEvent = session.systemEvents.find(
      (e) => e.type === SystemEventType.PLAYER_KILLED_AT_NIGHT,
    );
    expect(nightKillSysEvent).toBeDefined();
    expect(nightKillSysEvent?.metadata).toMatchObject({ targetPlayerId: targetId });

    // Assert: game ended — 2H vs 2F → hackers reach parity → HACKERS_WIN
    expect(session.status).toBe(SessionStatus.HACKERS_WIN);
    expect(session.winnerTeam).toBe(Team.HACKERS);

    const gameEndedEvent = nightEvents.find((e) => e.type === 'GAME_ENDED');
    expect(gameEndedEvent).toBeDefined();
    if (gameEndedEvent && gameEndedEvent.type === 'GAME_ENDED') {
      expect(gameEndedEvent.winnerTeam).toBe(Team.HACKERS);
    }
  });

  it('appends NO_KILL_TONIGHT when hackers tie, game continues', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-2', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, lobby.settings, '2026-03-17T00:00:00.000Z', () => 0);

    const hackerIds = Object.values(session.players)
      .filter((p) => p.team === Team.HACKERS)
      .map((p) => p.playerId);
    const friendIds = Object.values(session.players)
      .filter((p) => p.team === Team.FRIENDS)
      .map((p) => p.playerId);

    let now = '2026-03-17T00:00:00.000Z';

    // Advance to NIGHT_ACTIONS
    for (let i = 0; i < 3; i++) {
      now = addSeconds(session.timers.currentPhaseEndsAt!, 1);
      reconcileSessionRuntime(session, lobby, lobby.settings, now);
    }
    expect(session.phase).toBe(Phase.NIGHT_ACTIONS);

    // Hackers tie: each votes for a different Friend
    appendIntent(session, {
      playerId: hackerIds[0],
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: friendIds[0], metadata: {} },
      phase: Phase.NIGHT_ACTIONS,
      cycle: session.cycle,
      createdAt: addSeconds(now, 1),
    });
    appendIntent(session, {
      playerId: hackerIds[1],
      type: IntentType.SUBMIT_NIGHT_ACTION,
      payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: friendIds[1], metadata: {} },
      phase: Phase.NIGHT_ACTIONS,
      cycle: session.cycle,
      createdAt: addSeconds(now, 1),
    });

    // Advance past NIGHT_ACTIONS
    now = addSeconds(session.timers.currentPhaseEndsAt!, 1);
    const events = reconcileSessionRuntime(session, lobby, lobby.settings, now);

    // No elimination
    expect(events.find((e) => e.type === 'PLAYER_ELIMINATED')).toBeUndefined();

    // NO_KILL_TONIGHT system event
    const noKill = session.systemEvents.find(
      (e) => e.type === SystemEventType.NO_KILL_TONIGHT,
    );
    expect(noKill).toBeDefined();

    // Game still active, phase advanced past NIGHT_ACTIONS
    expect(session.status).toBe(SessionStatus.ACTIVE);
    expect(session.phase).not.toBe(Phase.NIGHT_ACTIONS);
  });

  it('day vote elimination feeds into night cycle', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-3', '2026-03-17T00:00:00.000Z');
    initializeSessionRuntime(session, lobby.settings, '2026-03-17T00:00:00.000Z', () => 0);

    let now = '2026-03-17T00:00:00.000Z';

    // Advance to DAY_VOTE
    now = addSeconds(session.timers.currentPhaseEndsAt!, 1);
    reconcileSessionRuntime(session, lobby, lobby.settings, now);
    expect(session.phase).toBe(Phase.DAY_VOTE);

    // Everyone votes p3
    const voters = Object.values(session.players)
      .filter((p) => p.playerId !== 'p3')
      .map((p) => p.playerId);
    for (const voterId of voters) {
      appendIntent(session, {
        playerId: voterId,
        type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId: 'p3' },
        phase: Phase.DAY_VOTE,
        cycle: session.cycle,
        createdAt: addSeconds(now, 1),
      });
    }

    // Advance past DAY_VOTE → resolves vote
    now = addSeconds(session.timers.currentPhaseEndsAt!, 1);
    const voteEvents = reconcileSessionRuntime(session, lobby, lobby.settings, now);

    const dayElim = voteEvents.find((e) => e.type === 'PLAYER_ELIMINATED');
    expect(dayElim).toBeDefined();
    if (dayElim && dayElim.type === 'PLAYER_ELIMINATED') {
      expect(dayElim.reason).toBe('DAY_VOTE');
      expect(dayElim.playerId).toBe('p3');
    }

    expect(session.players['p3'].alive).toBe(false);

    // PLAYER_VOTED_OUT system event
    const votedOut = session.systemEvents.find(
      (e) => e.type === SystemEventType.PLAYER_VOTED_OUT,
    );
    expect(votedOut).toBeDefined();
    expect(votedOut?.metadata).toMatchObject({ targetPlayerId: 'p3' });

    // Continue advancing — should reach NIGHT_ACTIONS eventually
    now = addSeconds(session.timers.currentPhaseEndsAt!, 1);
    reconcileSessionRuntime(session, lobby, lobby.settings, now);
    expect(session.phase).toBe(Phase.NIGHT_ACTIONS);
    expect(session.status).toBe(SessionStatus.ACTIVE);
  });
});
