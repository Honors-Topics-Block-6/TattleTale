import { ChannelType, IntentType, LobbyStatus, Phase, SessionStatus, Team } from '@tattletale/shared';
import { describe, expect, it } from 'vitest';

import { DEFAULT_LOBBY_SETTINGS } from '../domain/lobby/types.js';
import type { LobbyState } from '../domain/lobby/types.js';
import { buildSessionFromLobby, privateChannelId } from '../domain/game/session-domain.js';
import { initializeSessionRuntime } from '../domain/game/runtime-domain.js';
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
  };
}

function buildCtx(opts: {
  lobby: LobbyState;
  session: GameState;
  senderId: string;
}): {
  ctx: HandlerContext;
  ws: WebSocket;
  broadcasts: Array<{ channelId: string; recipients: string[] }>;
} {
  const { lobby, session, senderId } = opts;
  const broadcasts: Array<{ channelId: string; recipients: string[] }> = [];
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
    broadcastChannelMessage: (channelId, _message, recipients) => {
      broadcasts.push({ channelId, recipients: [...recipients] });
    },
    broadcastPlayerEliminated: () => {},
    closeWsForPlayer: () => {},
    setPhaseAlarm: async () => {},
    clearPhaseAlarm: async () => {},
  };
  const ws = {} as WebSocket;
  return { ctx, ws, broadcasts };
}

function setupSession(phase: Phase) {
  const lobby = buildLobby(5);
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
        payload: { actionType: 'HACKER_KILL', targetPlayerId: friend, metadata: {} },
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
        payload: { actionType: 'HACKER_KILL', targetPlayerId: otherFriend, metadata: {} },
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
        payload: { actionType: 'HACKER_KILL', targetPlayerId: friend, metadata: {} },
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
        payload: { actionType: 'HACKER_KILL', targetPlayerId: h2, metadata: {} },
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
        payload: { actionType: 'HACKER_KILL', targetPlayerId: hacker, metadata: {} },
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
        payload: { actionType: 'HACKER_KILL', targetPlayerId: friend, metadata: {} },
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
        payload: { actionType: 'HACKER_KILL', targetPlayerId: 'nonexistent', metadata: {} },
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
        payload: { actionType: 'HACKER_KILL', targetPlayerId: friend, metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'INTENT_NOT_ALLOWED_IN_PHASE' });
  });

  it('rejects unsupported actionType with UNSUPPORTED_ACTION', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const hacker = hackersOf(session)[0];
    const friend = friendsOf(session)[0];
    const { ctx, ws } = buildCtx({ lobby, session, senderId: hacker });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SUBMIT_NIGHT_ACTION,
        payload: { actionType: 'INVESTIGATE', targetPlayerId: friend, metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'UNSUPPORTED_ACTION' });
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
        payload: { actionType: 'HACKER_KILL', targetPlayerId: 42 as any, metadata: {} },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
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

describe('handleSubmitIntent — hacker channel privacy', () => {
  it('rejects a Friend SEND_MESSAGE to the hacker channel with NOT_IN_CHANNEL', async () => {
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
    expect(result).toMatchObject({ ok: false, code: 'NOT_IN_CHANNEL' });
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

describe('handleSubmitIntent — PRIVATE channels', () => {
  it('creates a PRIVATE channel per pair of players at game start', () => {
    const lobby = buildLobby(5);
    const session = buildSessionFromLobby(lobby, 'game-1', '2026-03-17T00:00:00.000Z');
    const privateChannels = Object.values(session.channels).filter(
      (ch) => ch.type === ChannelType.PRIVATE,
    );
    // 5 players → C(5,2) = 10 pairs
    expect(privateChannels).toHaveLength(10);
    // Each private channel has exactly 2 members
    for (const ch of privateChannels) {
      expect(ch.members).toHaveLength(2);
      expect(ch.id).toBe(privateChannelId(ch.members[0], ch.members[1]));
    }
  });

  it('privateChannelId is deterministic regardless of argument order', () => {
    expect(privateChannelId('p1', 'p2')).toBe('pm:p1:p2');
    expect(privateChannelId('p2', 'p1')).toBe('pm:p1:p2');
  });

  it('allows SEND_MESSAGE on a PRIVATE channel during DAY_OPEN', async () => {
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    const channelId = privateChannelId('p1', 'p2');
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId, content: 'hi p2' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    Phase.DAY_VOTE,
    Phase.DAY_RESOLVE,
    Phase.NIGHT_ACTIONS,
    Phase.NIGHT_RESOLVE,
    Phase.NIGHT_REVEAL,
  ])('rejects SEND_MESSAGE on a PRIVATE channel during %s with CHANNEL_LOCKED_PHASE', async (phase) => {
    const { lobby, session } = setupSession(phase);
    const channelId = privateChannelId('p1', 'p2');
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId, content: 'psst' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'CHANNEL_LOCKED_PHASE' });
  });

  it('rejects non-member SEND_MESSAGE on a PRIVATE channel with NOT_CHANNEL_MEMBER', async () => {
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    const channelId = privateChannelId('p1', 'p2');
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p3' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId, content: 'eavesdrop' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'NOT_CHANNEL_MEMBER' });
  });

  it('rejects eliminated sender on a PRIVATE channel with PLAYER_NOT_ALIVE', async () => {
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    session.players.p1.alive = false;
    const channelId = privateChannelId('p1', 'p2');
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId, content: 'from the grave' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'PLAYER_NOT_ALIVE' });
  });

  it('rejects PM to an eliminated peer with PEER_NOT_ALIVE', async () => {
    const { lobby, session } = setupSession(Phase.DAY_OPEN);
    session.players.p2.alive = false;
    const channelId = privateChannelId('p1', 'p2');
    const { ctx, ws } = buildCtx({ lobby, session, senderId: 'p1' });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId, content: 'are you there' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result).toMatchObject({ ok: false, code: 'PEER_NOT_ALIVE' });
  });
});

describe('handleSubmitIntent — HACKER channel receives', () => {
  it('keeps dead hackers as recipients of hacker channel broadcasts', async () => {
    const { lobby, session } = setupSession(Phase.NIGHT_ACTIONS);
    const [h1, h2] = hackersOf(session);
    session.players[h2].alive = false;
    const { ctx, ws, broadcasts } = buildCtx({ lobby, session, senderId: h1 });

    const result = await handleSubmitIntent(ctx, ws, {
      intent: {
        type: IntentType.SEND_MESSAGE,
        payload: { channelId: 'hacker', content: 'rip' },
        clientTimestamp: '2026-03-17T00:00:00.000Z',
      },
    });
    expect(result.ok).toBe(true);
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].recipients).toContain(h2);
  });
});
