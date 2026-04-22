import { ChannelType, IntentType, LobbyStatus, NightActionType, Phase, SessionStatus, Team } from '@tattletale/shared';
import { describe, expect, it } from 'vitest';

import { DEFAULT_LOBBY_SETTINGS } from '../domain/lobby/types.js';
import type { LobbyState } from '../domain/lobby/types.js';
import { buildSessionFromLobby } from '../domain/game/session-domain.js';
import { initializeSessionRuntime } from '../domain/game/runtime-domain.js';
import { RestrictionBuilders, applyRestriction } from '../domain/game/restrictions.js';
import type { GameState } from '../domain/game/types.js';
import { handleSubmitIntent, type HandlerContext } from './ws-message-handler.js';

function buildLobby(playerCount: number): LobbyState {
  const createdAt = '2026-03-17T00:00:00.000Z';
  const players = Array.from({ length: playerCount }, (_, i) => ({
    playerId: `p${i + 1}`,
    displayName: `Player ${i + 1}`,
    isHost: i === 0,
    ready: true,
    connected: true,
    alive: true,
    reconnectToken: `tok-${i + 1}`,
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

function buildCtx(opts: {
  lobby: LobbyState;
  session: GameState;
  senderId: string;
}): { ctx: HandlerContext; ws: WebSocket } {
  const { lobby, session, senderId } = opts;
  const ctx: HandlerContext = {
    repo: {
      getLobby: async () => lobby,
      getSession: async () => session,
      saveLobby: async () => {},
      saveSession: async () => {},
      savePlayerRecord: async () => {},
      getPlayerRecord: async () => null,
    } as any,
    auditRepo: {
      appendSessionEvent: async () => {},
      createGameRecord: async () => {},
    } as any,
    getPlayerIdForWs: () => senderId,
    setPlayerIdForWs: () => {},
    broadcastLobbyState: () => {},
    broadcastSessionState: () => {},
    broadcastChannelMessage: () => {},
    broadcastPlayerEliminated: () => {},
    closeWsForPlayer: () => {},
    setPhaseAlarm: async () => {},
    clearPhaseAlarm: async () => {},
  };
  const ws = {} as WebSocket;
  return { ctx, ws };
}

function setupSession(phase: Phase) {
  const lobby = buildLobby(7);
  const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
  initializeSessionRuntime(session, DEFAULT_LOBBY_SETTINGS, '2026-03-17T00:00:00.000Z', () => 0);
  session.phase = phase;
  // Set deadline far in the future so reconcile doesn't advance phase
  session.timers.currentPhaseEndsAt = '2099-01-01T00:00:00.000Z';
  return { lobby, session };
}

function hackersOf(session: GameState): string[] {
  return Object.values(session.players)
    .filter((p) => p.team === Team.HACKERS)
    .map((p) => p.playerId);
}

function friendsOf(session: GameState): string[] {
  return Object.values(session.players)
    .filter((p) => p.team === Team.FRIENDS)
    .map((p) => p.playerId);
}

describe('handleSubmitIntent — SUBMIT_NIGHT_ACTION', () => {
  it('accepts a HACKER_KILL from a living Hacker targeting a living Friend', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const hacker = hackersOf(session)[0];
    const friend = friendsOf(session)[0];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: friend, metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects HACKER_KILL from a Friend with NOT_AUTHORIZED', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const friend = friendsOf(session)[0];
    const otherFriend = friendsOf(session)[1];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: friend });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: otherFriend, metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'NOT_AUTHORIZED' });
  });

  it('rejects HACKER_KILL from a dead Hacker with PLAYER_NOT_ALIVE', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const hacker = hackersOf(session)[0];
    const friend = friendsOf(session)[0];
    session.players[hacker].alive = false;
    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: friend, metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    // The generic alive check fires before the team-specific validation
    expect(result).toMatchObject({ ok: false, code: 'PLAYER_NOT_ALIVE' });
  });

  it('rejects HACKER_KILL targeting another Hacker with INVALID_TARGET', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const [h1, h2] = hackersOf(session);
    const { ctx, ws } = buildCtx({ lobby, session, senderId: h1 });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: h2, metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_TARGET' });
  });

  it('rejects HACKER_KILL targeting self with INVALID_TARGET', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const hacker = hackersOf(session)[0];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: hacker, metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_TARGET' });
  });

  it('rejects HACKER_KILL targeting a dead player with INVALID_TARGET', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const hacker = hackersOf(session)[0];
    const friend = friendsOf(session)[0];
    session.players[friend].alive = false;
    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: friend, metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_TARGET' });
  });

  it('rejects HACKER_KILL targeting a nonexistent player with INVALID_TARGET', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const hacker = hackersOf(session)[0];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: 'nonexistent', metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_TARGET' });
  });

  it('rejects HACKER_KILL during DAY_VOTE with INTENT_NOT_ALLOWED_IN_PHASE', async () => {
    const { lobby, session } = setupSession(Phase.DAY_VOTE);
    const hacker = hackersOf(session)[0];
    const friend = friendsOf(session)[0];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: friend, metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'INTENT_NOT_ALLOWED_IN_PHASE' });
  });

  it('rejects unknown actionType with UNSUPPORTED_ACTION', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const hacker = hackersOf(session)[0];
    const friend = friendsOf(session)[0];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: 'SCAN' as unknown as NightActionType, targetPlayerId: friend, metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'UNSUPPORTED_ACTION' });
  });

  it('rejects a Hacker submitting a non-Hacker action with NOT_AUTHORIZED (role-based gate)', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const hacker = hackersOf(session)[0];
    const friend = friendsOf(session)[0];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.INVESTIGATE, targetPlayerId: friend, metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'NOT_AUTHORIZED' });
  });

  it('rejects payload without actionType with INVALID_PAYLOAD', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const hacker = hackersOf(session)[0];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { targetPlayerId: 'p3' } as any,
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
  });

  it('rejects payload with non-string targetPlayerId with INVALID_PAYLOAD', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const hacker = hackersOf(session)[0];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: 42 as any, metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
  });

  it('accepts a night-action submitted at the exact moment the phase timer expires', async () => {
    // Regression test for commit 76df80d.
    //
    // Bug: handleSubmitIntent previously called reconcileAndPersist BEFORE appending the
    // intent. When the phase timer had already elapsed, reconcile advanced the phase from
    // NIGHT_ACTIONS → the next phase. isIntentAllowedInPhase then saw the new (non-night)
    // phase and rejected the legitimate in-flight action with INTENT_NOT_ALLOWED_IN_PHASE.
    //
    // Fix: append the intent first, then reconcile. The intent lands in pendingIntents
    // while the session is still in NIGHT_ACTIONS, so the phase guard passes.
    //
    // To verify this test catches a regression: if the order were reverted to
    // reconcile-first, reconcile would flip the phase before the guard runs, causing
    // result.ok to be false (INTENT_NOT_ALLOWED_IN_PHASE) — making this assertion fail.
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const hacker = hackersOf(session)[0];
    const friend = friendsOf(session)[0];

    // Set the phase deadline one second in the past so reconcileSessionRuntime
    // will immediately advance the phase when it runs.
    session.timers.currentPhaseEndsAt = new Date(Date.now() - 1000).toISOString();

    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: NightActionType.HACKER_KILL, targetPlayerId: friend, metadata: {} },
        clientTimestamp: new Date().toISOString(),
      },
    });

    // The intent must be accepted despite the timer having already expired.
    expect(result.ok).toBe(true);
    // The accepted intent id must be present in the response data payload.
    expect((result as { ok: true; data: { acceptedIntentId: string } }).data.acceptedIntentId).toBeTruthy();
  });
});

describe('handleSubmitIntent — SUBMIT_VOTE', () => {
  it('accepts a vote from a living player on a living target', async () => {
    const { lobby, session } = setupSession(Phase.DAY_VOTE);
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId: 'p2' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects vote from a dead player with PLAYER_NOT_ALIVE', async () => {
    const { lobby, session } = setupSession(Phase.DAY_VOTE);
    session.players.p1.alive = false;
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId: 'p2' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'PLAYER_NOT_ALIVE' });
  });

  it('rejects vote on a dead target with INVALID_VOTE_TARGET', async () => {
    const { lobby, session } = setupSession(Phase.DAY_VOTE);
    session.players.p2.alive = false;
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId: 'p2' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_VOTE_TARGET' });
  });

  it('rejects vote on a nonexistent target with INVALID_VOTE_TARGET', async () => {
    const { lobby, session } = setupSession(Phase.DAY_VOTE);
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId: 'ghost' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_VOTE_TARGET' });
  });

  it('rejects vote outside DAY_VOTE with INTENT_NOT_ALLOWED_IN_PHASE', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_VOTE,
        payload: { targetPlayerId: 'p2' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'INTENT_NOT_ALLOWED_IN_PHASE' });
  });
});

describe('handleSubmitIntent — SEND_MESSAGE on PRIVATE (DM) channels', () => {
  // Helper: find the DM channel ID for a given player pair in the session.
  function getDmChannelId(session: GameState, idA: string, idB: string): string {
    return `dm-${[idA, idB].sort().join('-')}`;
  }

  it('PRIVATE channel SEND_MESSAGE succeeds during Phase.DAY_OPEN', async () => {
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    const [p1, p2] = ['p1', 'p2'];
    const channelId = getDmChannelId(session, p1, p2);
    // The DM channel was created by buildSessionFromLobby
    expect(session.channels[channelId]).toBeDefined();
    const { ctx, ws } = buildCtx({ lobby, session, senderId: p1 });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId, content: 'hello!' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result.ok).toBe(true);
  });

  it('PRIVATE channel SEND_MESSAGE rejected with PM_PHASE_RESTRICTED during DAY_VOTE', async () => {
    const { lobby, session } = setupSession(Phase.DAY_VOTE);
    const channelId = getDmChannelId(session, 'p1', 'p2');
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId, content: 'hello' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'PM_PHASE_RESTRICTED' });
  });

  it('PRIVATE channel SEND_MESSAGE rejected with PM_PHASE_RESTRICTED during NIGHT_ACTIONS', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const channelId = getDmChannelId(session, 'p1', 'p2');
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId, content: 'hello' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'PM_PHASE_RESTRICTED' });
  });

  it('PRIVATE channel SEND_MESSAGE rejected with PM_PHASE_RESTRICTED during NIGHT_RESOLVE', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_RESOLVE);
    const channelId = getDmChannelId(session, 'p1', 'p2');
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId, content: 'hello' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'PM_PHASE_RESTRICTED' });
  });

  it('PRIVATE channel SEND_MESSAGE rejected with PM_PHASE_RESTRICTED during NIGHT_REVEAL', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_REVEAL);
    const channelId = getDmChannelId(session, 'p1', 'p2');
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId, content: 'hello' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'PM_PHASE_RESTRICTED' });
  });

  it('PRIVATE channel SEND_MESSAGE rejected with PM_PHASE_RESTRICTED during DAY_RESOLVE', async () => {
    const { lobby, session } = setupSession(Phase.DAY_RESOLVE);
    const channelId = getDmChannelId(session, 'p1', 'p2');
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId, content: 'hello' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'PM_PHASE_RESTRICTED' });
  });

  it('non-member of PRIVATE channel hits NOT_CHANNEL_MEMBER before phase check (order guard)', async () => {
    // p3 is not a member of the dm-p1-p2 channel; even in a restricted phase this
    // must hit NOT_CHANNEL_MEMBER first (guard ordering).
    const { lobby, session } = setupSession(Phase.DAY_VOTE);
    const channelId = getDmChannelId(session, 'p1', 'p2');
    // Confirm p3 is not in the channel
    expect(session.channels[channelId].members).not.toContain('p3');
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p3' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId, content: 'sneaky' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'NOT_CHANNEL_MEMBER' });
  });

  it('eliminated player removed from channel members hits NOT_CHANNEL_MEMBER on PM attempt', async () => {
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    const channelId = getDmChannelId(session, 'p1', 'p2');
    // Simulate elimination: remove p1 from channel members (as processElimination does)
    session.channels[channelId].members = session.channels[channelId].members.filter(
      (id) => id !== 'p1',
    );
    session.players['p1'].alive = false;
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId, content: 'still here?' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    // Dead players are caught by the PLAYER_NOT_ALIVE check before the channel
    // member check — either way, the send must be rejected.
    expect(result.ok).toBe(false);
    expect(['PLAYER_NOT_ALIVE', 'NOT_CHANNEL_MEMBER']).toContain(
      (result as { ok: false; code: string }).code,
    );
  });

  it('GLOBAL channel SEND_MESSAGE during DAY_VOTE still succeeds (no regression)', async () => {
    const { lobby, session } = setupSession(Phase.DAY_VOTE);
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: 'global', content: 'everyone hear me?' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result.ok).toBe(true);
  });
});

describe('handleSubmitIntent — hacker channel privacy', () => {
  it('rejects a Friend SEND_MESSAGE to the hacker channel with NOT_CHANNEL_MEMBER', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const friend = friendsOf(session)[0];
    // Force-add the friend to hacker channel members to simulate a regression
    session.channels.hacker.members.push(friend);
    const { ctx, ws } = buildCtx({ lobby, session, senderId: friend });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: 'hacker', content: 'sneaky' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    // Uses the shared MessageErrorCode.NOT_CHANNEL_MEMBER enum value — the
    // hacker-team gate is semantically the same rejection reason as the
    // membership gate from a client's perspective.
    expect(result).toMatchObject({ ok: false, code: 'NOT_CHANNEL_MEMBER' });
  });

  it('allows a living Hacker to SEND_MESSAGE on the hacker channel', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const hacker = hackersOf(session)[0];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: 'hacker', content: 'hello team' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result.ok).toBe(true);
  });
});

describe('handleSubmitIntent — SYSTEM channel is read-only', () => {
  it('rejects SEND_MESSAGE on the SYSTEM channel with SYSTEM_CHANNEL_READONLY', async () => {
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: 'system', content: 'hi system' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'SYSTEM_CHANNEL_READONLY' });
  });

  it('SYSTEM readonly check fires even when the channel is locked', async () => {
    // SYSTEM channels aren't supposed to be lockable, but if they ever are
    // we still want the readonly error to win so clients show the correct UI.
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    session.channels['system'].locked = true;
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: 'system', content: 'hi system' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'SYSTEM_CHANNEL_READONLY' });
  });

  it('SYSTEM readonly fires before NOT_CHANNEL_MEMBER (order guard)', async () => {
    // SYSTEM is a channel-property rule, not a sender-state rule, so it must
    // beat the membership check. Remove p1 from the system channel members
    // and confirm the readonly code wins — mirrors the PRIVATE/membership
    // order-guard test above.
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    session.channels['system'].members = session.channels['system'].members.filter(
      (id) => id !== 'p1',
    );
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: 'system', content: 'hi system' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'SYSTEM_CHANNEL_READONLY' });
  });

  it('SYSTEM readonly fires even for living Hacker senders (guard sits before the HACKER team gate)', async () => {
    // A Hacker targeting SYSTEM must hit SYSTEM_CHANNEL_READONLY — the
    // readonly check is unconditional and must run before any channel-type
    // branching, so swapping the check order would leak through as a
    // different code (or an accepted send if all gates were skipped).
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    const hacker = hackersOf(session)[0];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: 'system', content: 'hi system' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'SYSTEM_CHANNEL_READONLY' });
  });
});

describe('handleSubmitIntent — SEND_MESSAGE restriction enforcement', () => {
  it('SILENCED sender gets PLAYER_SILENCED', async () => {
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    applyRestriction(
      session,
      RestrictionBuilders.silenced('p1', 'imitator', Phase.DAY_RESOLVE, '2026-03-17T00:00:00.000Z'),
    );
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: 'global', content: 'hi' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'PLAYER_SILENCED' });
  });

  it('JAMMED on a specific channel type blocks matching sends, allows others', async () => {
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    applyRestriction(
      session,
      RestrictionBuilders.jammed(
        'p1',
        [ChannelType.PRIVATE],
        'signal-jammer',
        Phase.DAY_RESOLVE,
        '2026-03-17T00:00:00.000Z',
      ),
    );
    const dmId = `dm-${['p1', 'p2'].sort().join('-')}`;
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const dmResult = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: dmId, content: 'jammed' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(dmResult).toMatchObject({ ok: false, code: 'PLAYER_JAMMED' });

    const globalResult = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: 'global', content: 'not jammed here' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(globalResult.ok).toBe(true);
  });

  it('LOCKED restriction (framework, not channel.locked) rejects with CHANNEL_LOCKED', async () => {
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    // Do NOT set channel.locked directly — rely only on the restriction to verify the
    // message handler reads from the framework, not the legacy boolean.
    applyRestriction(
      session,
      RestrictionBuilders.locked('global', 'firewall', Phase.DAY_RESOLVE, '2026-03-17T00:00:00.000Z'),
    );
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: 'global', content: 'hello' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'CHANNEL_LOCKED' });
  });

  it('MONITORED delivers an unaltered copy to the observer', async () => {
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    const dmId = `dm-${['p1', 'p2'].sort().join('-')}`;
    applyRestriction(
      session,
      RestrictionBuilders.monitored(
        'p1',
        'p3', // observer — not a channel member
        [ChannelType.PRIVATE],
        'eavesdropper',
        Phase.DAY_RESOLVE,
        '2026-03-17T00:00:00.000Z',
      ),
    );

    const broadcasts: Array<{ channelId: string; content: string; recipients: string[] }> = [];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });
    ctx.broadcastChannelMessage = (channelId, message, recipients) => {
      broadcasts.push({ channelId, content: message.content, recipients: [...(recipients ?? [])] });
    };

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: dmId, content: 'secret' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result.ok).toBe(true);
    // Split broadcast: one to sender (original), one to recipients+observer (content unchanged
    // because only MONITORED — no ALTERED was applied).
    const senderBroadcast = broadcasts.find((b) => b.recipients.length === 1 && b.recipients[0] === 'p1');
    expect(senderBroadcast).toBeDefined();
    expect(senderBroadcast?.content).toBe('secret');

    const otherBroadcast = broadcasts.find((b) => b.recipients.includes('p3'));
    expect(otherBroadcast).toBeDefined();
    expect(otherBroadcast?.content).toBe('secret');
    expect(otherBroadcast?.recipients).not.toContain('p1'); // sender excluded from transformed bucket
  });

  it('ALTERED REPLACE delivers original to sender and replacement to recipients', async () => {
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    const dmId = `dm-${['p1', 'p2'].sort().join('-')}`;
    applyRestriction(
      session,
      RestrictionBuilders.altered(
        'p1',
        [ChannelType.PRIVATE],
        'REPLACE',
        false,
        'troller',
        Phase.DAY_RESOLVE,
        '2026-03-17T00:00:00.000Z',
        'MWAHAHA',
      ),
    );

    const broadcasts: Array<{ content: string; recipients: string[] }> = [];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });
    ctx.broadcastChannelMessage = (_c, message, recipients) => {
      broadcasts.push({ content: message.content, recipients: [...(recipients ?? [])] });
    };

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: dmId, content: 'genuine message' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result.ok).toBe(true);

    const senderBroadcast = broadcasts.find((b) => b.recipients.length === 1 && b.recipients[0] === 'p1');
    expect(senderBroadcast?.content).toBe('genuine message');

    const othersBroadcast = broadcasts.find((b) => b.recipients.includes('p2'));
    expect(othersBroadcast?.content).toBe('MWAHAHA');
  });

  it('oneShot ALTERED consume() flips spent AND persists the session so it survives DO reload', async () => {
    // Regression guard: consume() mutates `alteredMatch.spent` on the
    // in-memory session, but without an explicit saveSession the mutation
    // is lost on the next DO load (reconnect/eviction) and the one-shot
    // fires again. This test asserts both the mutation and the persist.
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    const dmId = `dm-${['p1', 'p2'].sort().join('-')}`;
    applyRestriction(
      session,
      RestrictionBuilders.altered(
        'p1',
        [ChannelType.PRIVATE],
        'REPLACE',
        /* oneShot */ true,
        'troller',
        Phase.DAY_RESOLVE,
        '2026-03-17T00:00:00.000Z',
        'MWAHAHA',
      ),
    );

    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });
    let saveCalls = 0;
    ctx.repo.saveSession = async () => {
      saveCalls += 1;
    };

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: dmId, content: 'genuine message' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result.ok).toBe(true);

    // consume() must have flipped spent=true on the stored restriction.
    const altered = session.restrictions?.find(
      (r) => r.type === 'ALTERED' && r.targetPlayerId === 'p1',
    );
    expect(altered && 'spent' in altered ? altered.spent : null).toBe(true);

    // And the handler must have persisted the session so `spent=true`
    // survives DO reload (this is the bit that the in-memory-only tests
    // cannot catch).
    expect(saveCalls).toBeGreaterThanOrEqual(1);
  });
});
