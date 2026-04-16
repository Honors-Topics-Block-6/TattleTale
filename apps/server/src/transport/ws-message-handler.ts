import {
  IntentType,
  LobbyStatus,
  Phase,
  SessionStatus,
  SystemEventType,
  Team,
  type JoinLobbyPayload,
  type KickPlayerPayload,
  type RejoinLobbyPayload,
  type SubmitIntentPayload,
  type UpdateSettingsPayload,
} from '@tattletale/shared';

import { DomainError } from '../domain/errors.js';
import {
  appendIntent,
  calculatePhaseDurations,
  initializeSessionRuntime,
  isIntentAllowedInPhase,
  processElimination,
  reconcileSessionRuntime,
  type RuntimeEvent,
} from '../domain/game/runtime-domain.js';
import { buildSessionFromLobby } from '../domain/game/session-domain.js';
import type {
  GameState,
  NightActionIntentPayload,
  VoteIntentPayload,
} from '../domain/game/types.js';
import { validateDisplayName } from '../domain/lobby/lobby-code.js';
import type { LobbyState } from '../domain/lobby/types.js';
import { toLobbyView, toPlayerSessionView } from '../domain/projections.js';
import type {
  GameAuditRepository,
  PlayerConnectionRecord,
} from '../domain/repositories.js';
import type { DORuntimeRepository } from '../persistence/do-runtime-repo.js';

// ─── Constants ──────────────────────────────────────────────────

const RECONNECT_EXPIRY_MS = 10 * 60 * 1000;

// ─── Handler context & result types ─────────────────────────────

export interface HandlerContext {
  repo: DORuntimeRepository;
  auditRepo: GameAuditRepository;
  getPlayerIdForWs(ws: WebSocket): string | null;
  setPlayerIdForWs(ws: WebSocket, playerId: string): void;
  broadcastLobbyState(lobby: LobbyState): void;
  broadcastSessionState(session: GameState): void;
  broadcastChannelMessage(
    channelId: string,
    message: {
      id: string;
      senderId: string;
      senderName: string;
      content: string;
      timestamp: string;
      cycle: number;
    },
    recipientPlayerIds: string[],
  ): void;
  broadcastPlayerEliminated(
    playerId: string,
    cause: 'VOTED_OUT' | 'NIGHT_KILL' | 'PLAYER_LEFT' | 'PLAYER_KICKED',
    cycle: number,
    recipientPlayerIds: string[],
  ): void;
  closeWsForPlayer(playerId: string, code: number, reason: string): void;
  setPhaseAlarm(deadlineMs: number, phase: string, cycle: number): Promise<void>;
  clearPhaseAlarm(): Promise<void>;
}

export type HandlerResult =
  | { ok: true; data: unknown }
  | { ok: false; code: string; message: string };

// ─── Utility exports ────────────────────────────────────────────

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateId(): string {
  return crypto.randomUUID();
}

export async function persistRuntimeEvents(
  auditRepo: GameAuditRepository,
  gameId: string,
  events: RuntimeEvent[],
): Promise<void> {
  for (const event of events) {
    try {
      if (event.type === 'PHASE_ADVANCED') {
        await auditRepo.appendSessionEvent({
          gameId,
          type: 'PHASE_ADVANCED',
          payload: { phase: event.phase, cycle: event.cycle, at: event.at },
        });
        continue;
      }

      if (event.type === 'PLAYER_ELIMINATED') {
        await auditRepo.appendSessionEvent({
          gameId,
          type: 'PLAYER_ELIMINATED',
          payload: { playerId: event.playerId, reason: event.reason, at: event.at },
        });
        continue;
      }

      await auditRepo.appendSessionEvent({
        gameId,
        type: 'GAME_ENDED',
        payload: { winnerTeam: event.winnerTeam, status: event.status, at: event.at },
      });
    } catch {
      // Non-fatal: audit persistence failures are swallowed
    }
  }
}

// ─── Internal helpers ───────────────────────────────────────────

function fail(code: string, message: string): HandlerResult {
  return { ok: false, code, message };
}

function ok(data: unknown): HandlerResult {
  return { ok: true, data };
}

function requirePlayerId(ctx: HandlerContext, ws: WebSocket): string {
  const playerId = ctx.getPlayerIdForWs(ws);
  if (!playerId) {
    throw new DomainError('NOT_AUTHENTICATED', 'WebSocket is not authenticated.', 403);
  }
  return playerId;
}

function requireLobby(lobby: LobbyState | null): LobbyState {
  if (!lobby) {
    throw new DomainError('LOBBY_NOT_FOUND', 'Lobby was not found.', 404);
  }
  return lobby;
}

function requireSession(session: GameState | null): GameState {
  if (!session) {
    throw new DomainError('SESSION_NOT_FOUND', 'Active session was not found.', 404);
  }
  return session;
}

function requirePlayerInLobby(lobby: LobbyState, playerId: string) {
  const playerIndex = lobby.players.findIndex((p) => p.playerId === playerId);
  if (playerIndex < 0) {
    throw new DomainError('PLAYER_NOT_FOUND', 'Player was not found in this lobby.', 404);
  }
  return { player: lobby.players[playerIndex], playerIndex };
}

export function selectNextHost(candidates: LobbyState['players']): string | null {
  if (candidates.length === 0) return null;
  return (
    candidates.find((p) => p.connected && p.alive)?.playerId
    ?? candidates.find((p) => p.alive)?.playerId
    ?? candidates.find((p) => p.connected)?.playerId
    ?? candidates[0].playerId
  );
}

export function assignHost(lobby: LobbyState, nextHostPlayerId: string | null): void {
  lobby.hostPlayerId = nextHostPlayerId ?? '';
  for (const player of lobby.players) {
    player.isHost = nextHostPlayerId !== null && player.playerId === nextHostPlayerId;
  }
}

function markPlayerPermanentlyRemoved(player: LobbyState['players'][number]): void {
  player.alive = false;
  player.connected = false;
  player.reconnectToken = crypto.randomUUID();
}

async function reconcileAndPersist(
  ctx: HandlerContext,
  lobby: LobbyState,
  session: GameState,
): Promise<RuntimeEvent[]> {
  const now = new Date().toISOString();
  const events = reconcileSessionRuntime(session, lobby, lobby.settings, now);
  if (events.length === 0) return events;

  await ctx.repo.saveSession(session);
  await ctx.repo.saveLobby(lobby);
  await persistRuntimeEvents(ctx.auditRepo, session.gameId, events);
  return events;
}

// ─── Handlers ───────────────────────────────────────────────────

export async function handleJoinLobby(
  ctx: HandlerContext,
  ws: WebSocket,
  payload: JoinLobbyPayload,
): Promise<HandlerResult> {
  try {
    const lobby = requireLobby(await ctx.repo.getLobby());

    if (lobby.status !== LobbyStatus.WAITING) {
      return fail('LOBBY_IN_GAME', 'Lobby is already in game and cannot be joined.');
    }

    if (lobby.players.length >= lobby.settings.maxPlayers) {
      return fail('LOBBY_FULL', 'Lobby has reached its maximum player count.');
    }

    const displayName = validateDisplayName(payload.displayName);
    const now = new Date().toISOString();
    const playerId = generateId();
    const reconnectToken = generateToken();

    lobby.players.push({
      playerId,
      displayName,
      isHost: false,
      ready: false,
      connected: true,
      alive: true,
      reconnectToken,
      joinedAt: now,
    });
    lobby.updatedAt = now;

    await ctx.repo.saveLobby(lobby);
    await ctx.repo.savePlayerRecord(playerId, {
      reconnectToken,
      tokenIssuedAt: Date.now(),
    });

    ctx.setPlayerIdForWs(ws, playerId);
    ctx.broadcastLobbyState(lobby);

    return ok({
      lobby: toLobbyView(lobby),
      playerId,
      reconnectToken,
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return fail(error.code, error.message);
    }
    return fail('INTERNAL_ERROR', 'An unexpected error occurred.');
  }
}

export async function handleRejoinLobby(
  ctx: HandlerContext,
  ws: WebSocket,
  payload: RejoinLobbyPayload,
): Promise<HandlerResult> {
  try {
    const lobby = requireLobby(await ctx.repo.getLobby());
    const { player } = requirePlayerInLobby(lobby, payload.playerId);

    // Check if player was kicked
    const record = await ctx.repo.getPlayerRecord(payload.playerId);
    if (record?.kickedAt) {
      return fail('PLAYER_KICKED', 'You have been kicked from this lobby.');
    }

    if (!player.alive) {
      return fail('PLAYER_NOT_ALIVE', 'Eliminated players cannot reconnect.');
    }

    // Validate reconnect token
    if (player.reconnectToken !== payload.reconnectToken) {
      return fail('INVALID_RECONNECT_TOKEN', 'Reconnect token is invalid.');
    }

    // Check token expiry — use token issuance as fallback when lastDisconnectedAt
    // is missing (e.g., unclean disconnect before webSocketClose fires)
    if (record) {
      const referenceTime = record.lastDisconnectedAt ?? record.tokenIssuedAt;
      const elapsed = Date.now() - referenceTime;
      if (elapsed > RECONNECT_EXPIRY_MS) {
        return fail('RECONNECT_EXPIRED', 'Reconnect window has expired.');
      }
    }

    // Close any existing WebSocket for this player
    ctx.closeWsForPlayer(payload.playerId, 4001, 'Superseded by new connection');

    // Rotate reconnect token
    const now = new Date().toISOString();
    const newToken = generateToken();
    player.reconnectToken = newToken;
    player.connected = true;
    lobby.updatedAt = now;

    await ctx.repo.saveLobby(lobby);
    await ctx.repo.savePlayerRecord(payload.playerId, {
      reconnectToken: newToken,
      tokenIssuedAt: Date.now(),
    });

    ctx.setPlayerIdForWs(ws, payload.playerId);

    // If there's an active session, update connected state there too
    let sessionView = null;
    if (lobby.sessionId) {
      const session = await ctx.repo.getSession();
      if (session) {
        const sessionPlayer = session.players[payload.playerId];
        if (sessionPlayer) {
          sessionPlayer.connected = true;
          session.updatedAt = now;
        }

        const runtimeEvents = await reconcileAndPersist(ctx, lobby, session);
        if (runtimeEvents.length === 0) {
          await ctx.repo.saveSession(session);
        }

        ctx.broadcastSessionState(session);
        sessionView = toPlayerSessionView(session, payload.playerId);
      }
    }

    ctx.broadcastLobbyState(lobby);

    return ok({
      lobby: toLobbyView(lobby),
      playerId: payload.playerId,
      reconnectToken: newToken,
      session: sessionView,
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return fail(error.code, error.message);
    }
    return fail('INTERNAL_ERROR', 'An unexpected error occurred.');
  }
}

export async function handleKickPlayer(
  ctx: HandlerContext,
  ws: WebSocket,
  payload: KickPlayerPayload,
): Promise<HandlerResult> {
  try {
    const actorId = requirePlayerId(ctx, ws);
    const lobby = requireLobby(await ctx.repo.getLobby());
    const { player: actor } = requirePlayerInLobby(lobby, actorId);

    if (!actor.isHost) {
      return fail('NOT_HOST', 'Only the host can kick players.');
    }

    if (payload.targetPlayerId === actorId) {
      return fail('INVALID_TARGET', 'Host cannot kick themselves.');
    }

    const { player: target } = requirePlayerInLobby(lobby, payload.targetPlayerId);
    const now = new Date().toISOString();

    if (lobby.status === LobbyStatus.WAITING) {
      // Remove from lobby outright
      lobby.players = lobby.players.filter((p) => p.playerId !== payload.targetPlayerId);
      lobby.updatedAt = now;

      await ctx.repo.saveLobby(lobby);

      // Mark kicked in player record
      const record = await ctx.repo.getPlayerRecord(payload.targetPlayerId);
      if (record) {
        record.kickedAt = Date.now();
        await ctx.repo.savePlayerRecord(payload.targetPlayerId, record);
      } else {
        await ctx.repo.savePlayerRecord(payload.targetPlayerId, {
          reconnectToken: '',
          tokenIssuedAt: 0,
          kickedAt: Date.now(),
        });
      }

      ctx.closeWsForPlayer(payload.targetPlayerId, 4002, 'Kicked by host');
      ctx.broadcastLobbyState(lobby);

      return ok({ lobby: toLobbyView(lobby) });
    }

    // IN_GAME: eliminate player
    if (lobby.status !== LobbyStatus.IN_GAME || !lobby.sessionId) {
      return fail('INVALID_LOBBY_STATE', 'Lobby is not in a valid state for kick.');
    }

    const session = requireSession(await ctx.repo.getSession());
    await reconcileAndPersist(ctx, lobby, session);

    if (session.status !== SessionStatus.ACTIVE) {
      return fail('GAME_NOT_ACTIVE', 'Cannot kick players after game completion.');
    }

    const eliminationEvents = processElimination(
      session,
      lobby,
      payload.targetPlayerId,
      now,
      'PLAYER_KICKED',
    );
    markPlayerPermanentlyRemoved(target);
    if (session.players[payload.targetPlayerId]) {
      session.players[payload.targetPlayerId].connected = false;
    }

    ctx.broadcastPlayerEliminated(
      payload.targetPlayerId,
      'PLAYER_KICKED',
      session.cycle,
      Object.keys(session.players),
    );

    if (target.isHost) {
      const candidates = lobby.players.filter((p) => p.playerId !== payload.targetPlayerId);
      assignHost(lobby, selectNextHost(candidates));
    }

    lobby.updatedAt = now;

    // Mark kicked
    const record = await ctx.repo.getPlayerRecord(payload.targetPlayerId);
    if (record) {
      record.kickedAt = Date.now();
      await ctx.repo.savePlayerRecord(payload.targetPlayerId, record);
    } else {
      await ctx.repo.savePlayerRecord(payload.targetPlayerId, {
        reconnectToken: '',
        tokenIssuedAt: 0,
        kickedAt: Date.now(),
      });
    }

    ctx.closeWsForPlayer(payload.targetPlayerId, 4002, 'Kicked by host');

    await ctx.repo.saveLobby(lobby);
    await ctx.repo.saveSession(session);
    await persistRuntimeEvents(ctx.auditRepo, session.gameId, eliminationEvents);

    ctx.broadcastLobbyState(lobby);
    ctx.broadcastSessionState(session);

    return ok({ lobby: toLobbyView(lobby) });
  } catch (error) {
    if (error instanceof DomainError) {
      return fail(error.code, error.message);
    }
    return fail('INTERNAL_ERROR', 'An unexpected error occurred.');
  }
}

export async function handleStartGame(
  ctx: HandlerContext,
  ws: WebSocket,
): Promise<HandlerResult> {
  try {
    const actorId = requirePlayerId(ctx, ws);
    const lobby = requireLobby(await ctx.repo.getLobby());
    const { player: actor } = requirePlayerInLobby(lobby, actorId);

    if (!actor.isHost) {
      return fail('NOT_HOST', 'Only the host can start the game.');
    }

    if (lobby.status !== LobbyStatus.WAITING) {
      return fail('LOBBY_NOT_WAITING', 'Only waiting lobbies can start the game.');
    }

    if (lobby.players.length < lobby.settings.minPlayers) {
      return fail(
        'INSUFFICIENT_PLAYERS',
        `At least ${lobby.settings.minPlayers} players are required to start.`,
      );
    }

    if (lobby.players.length > lobby.settings.maxPlayers) {
      return fail('TOO_MANY_PLAYERS', 'Lobby exceeds max player count.');
    }

    const now = new Date().toISOString();
    const gameId = generateId();
    const session = buildSessionFromLobby(lobby, gameId, now);
    initializeSessionRuntime(session, lobby.settings, now);

    lobby.status = LobbyStatus.IN_GAME;
    lobby.sessionId = gameId;
    lobby.updatedAt = now;

    await ctx.repo.saveSession(session);
    await ctx.repo.saveLobby(lobby);

    // Set phase alarm for the first phase deadline
    const phaseDurations = calculatePhaseDurations(lobby.settings);
    const deadlineMs = Date.parse(now) + phaseDurations[session.phase] * 1000;
    await ctx.setPhaseAlarm(deadlineMs, session.phase, session.cycle);

    // Audit: create game record and log start event (non-fatal)
    try {
      await ctx.auditRepo.createGameRecord({
        gameId: session.gameId,
        lobbyCode: lobby.code,
        phase: session.phase,
        cycle: session.cycle,
        players: lobby.players.map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName,
          alive: p.alive,
          isHost: p.isHost,
          roleId: session.players[p.playerId]?.roleId ?? null,
          team: session.players[p.playerId]?.team ?? 'UNKNOWN',
        })),
      });

      await ctx.auditRepo.appendSessionEvent({
        gameId: session.gameId,
        type: SystemEventType.GAME_STARTED,
        payload: {
          lobbyCode: lobby.code,
          cycle: session.cycle,
          phase: session.phase,
        },
      });
    } catch {
      // Non-fatal: audit persistence failures are swallowed
    }

    ctx.broadcastLobbyState(lobby);
    ctx.broadcastSessionState(session);

    return ok({
      lobby: toLobbyView(lobby),
      session: toPlayerSessionView(session, actorId),
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return fail(error.code, error.message);
    }
    return fail('INTERNAL_ERROR', 'An unexpected error occurred.');
  }
}

export async function handleUpdateSettings(
  ctx: HandlerContext,
  ws: WebSocket,
  payload: UpdateSettingsPayload,
): Promise<HandlerResult> {
  try {
    const actorId = requirePlayerId(ctx, ws);
    const lobby = requireLobby(await ctx.repo.getLobby());
    const { player: actor } = requirePlayerInLobby(lobby, actorId);

    if (!actor.isHost) {
      return fail('NOT_HOST', 'Only the host can update settings.');
    }

    if (lobby.status !== LobbyStatus.WAITING) {
      return fail('GAME_IN_PROGRESS', 'Cannot update settings after the game has started.');
    }

    const updates = payload.settings;
    if (updates.minPlayers !== undefined) lobby.settings.minPlayers = updates.minPlayers;
    if (updates.maxPlayers !== undefined) lobby.settings.maxPlayers = updates.maxPlayers;
    if (updates.dayDurationSeconds !== undefined) lobby.settings.dayDurationSeconds = updates.dayDurationSeconds;
    if (updates.nightDurationSeconds !== undefined) lobby.settings.nightDurationSeconds = updates.nightDurationSeconds;
    if (updates.enabledRoles !== undefined) lobby.settings.enabledRoles = updates.enabledRoles;

    lobby.updatedAt = new Date().toISOString();

    await ctx.repo.saveLobby(lobby);
    ctx.broadcastLobbyState(lobby);

    return ok({ lobby: toLobbyView(lobby) });
  } catch (err) {
    if (err instanceof DomainError) return fail(err.code, err.message);
    return fail('INTERNAL_ERROR', 'An unexpected error occurred.');
  }
}

export async function handleSubmitIntent(
  ctx: HandlerContext,
  ws: WebSocket,
  payload: SubmitIntentPayload,
): Promise<HandlerResult> {
  try {
    const actorId = requirePlayerId(ctx, ws);
    const lobby = requireLobby(await ctx.repo.getLobby());

    if (lobby.status !== LobbyStatus.IN_GAME || !lobby.sessionId) {
      return fail('LOBBY_NOT_IN_GAME', 'Lobby is not in an active game.');
    }

    const session = requireSession(await ctx.repo.getSession());

    // Reconcile first to ensure we're at the right phase
    const runtimeEvents = await reconcileAndPersist(ctx, lobby, session);
    if (runtimeEvents.length > 0) {
      ctx.broadcastLobbyState(lobby);
      ctx.broadcastSessionState(session);
    }

    if (!session.players[actorId]) {
      return fail('PLAYER_NOT_FOUND', 'Player is not part of the active session.');
    }

    if (session.status !== SessionStatus.ACTIVE) {
      return fail('GAME_NOT_ACTIVE', 'Cannot accept intents after game completion.');
    }

    if (!session.players[actorId].alive) {
      return fail('PLAYER_NOT_ALIVE', 'Eliminated players cannot submit intents.');
    }

    const { intent } = payload;

    // SEND_MESSAGE: broadcast a chat message to the channel's members.
    // Messages are transient — we do not persist them in GameState.
    if (intent.type === IntentType.SEND_MESSAGE) {
      const messagePayload = intent.payload as { channelId: string; content: string };
      const channel = session.channels[messagePayload.channelId];
      if (!channel) {
        return fail('CHANNEL_NOT_FOUND', 'Channel does not exist.');
      }
      // Defense-in-depth: HACKER channels require sender to be a living Hacker,
      // regardless of channel membership state.
      if (channel.type === 'HACKER') {
        const sender = session.players[actorId];
        if (!sender || sender.team !== Team.HACKERS || !sender.alive) {
          return fail('NOT_IN_CHANNEL', 'You are not authorized for this channel.');
        }
      }
      if (!channel.members.includes(actorId)) {
        return fail('NOT_CHANNEL_MEMBER', 'You are not a member of this channel.');
      }
      if (channel.locked) {
        return fail('CHANNEL_LOCKED', 'This channel is locked.');
      }

      const trimmed = messagePayload.content.trim();
      if (!trimmed) {
        return fail('EMPTY_MESSAGE', 'Message content cannot be empty.');
      }
      if (trimmed.length > 500) {
        return fail('MESSAGE_TOO_LONG', 'Message exceeds 500 characters.');
      }

      const now = new Date().toISOString();
      const message = {
        id: generateId(),
        senderId: actorId,
        senderName: session.players[actorId].displayName,
        content: trimmed,
        timestamp: now,
        cycle: session.cycle,
      };

      // Defense-in-depth: for HACKER channels, filter recipients by team+alive
      // even if channel.members is somehow wrong.
      let recipients = channel.members;
      if (channel.type === 'HACKER') {
        recipients = recipients.filter((id) => {
          const p = session.players[id];
          return Boolean(p?.alive && p.team === Team.HACKERS);
        });
      }

      ctx.broadcastChannelMessage(
        messagePayload.channelId,
        message,
        recipients,
      );

      return ok({ messageId: message.id });
    }

    if (
      intent.type !== IntentType.SUBMIT_VOTE
      && intent.type !== IntentType.SUBMIT_NIGHT_ACTION
    ) {
      return fail('INVALID_INTENT_TYPE', 'Intent type is not supported.');
    }

    if (!isIntentAllowedInPhase(intent.type, session.phase)) {
      return fail(
        'INTENT_NOT_ALLOWED_IN_PHASE',
        `Intent ${intent.type} is not allowed in phase ${session.phase}.`,
      );
    }

    // Validate vote target if applicable
    if (intent.type === IntentType.SUBMIT_VOTE) {
      const votePayload = intent.payload as VoteIntentPayload;
      if (votePayload.targetPlayerId !== null) {
        const target = session.players[votePayload.targetPlayerId];
        if (!target || !target.alive) {
          return fail('INVALID_VOTE_TARGET', 'Vote target must be an alive player.');
        }
      }
    }

    // Validate SUBMIT_NIGHT_ACTION payload
    if (intent.type === IntentType.SUBMIT_NIGHT_ACTION) {
      const nightPayload = intent.payload as NightActionIntentPayload;

      // Validate payload shape
      if (
        typeof nightPayload?.actionType !== 'string'
        || (nightPayload.targetPlayerId !== null && typeof nightPayload.targetPlayerId !== 'string')
      ) {
        return fail('INVALID_PAYLOAD', 'Night action payload is malformed.');
      }

      // Only HACKER_KILL is supported in MVP
      if (nightPayload.actionType !== 'HACKER_KILL') {
        return fail('UNSUPPORTED_ACTION', 'Only HACKER_KILL is supported.');
      }

      // Sender must be a living Hacker
      const sender = session.players[actorId];
      if (!sender || !sender.alive || sender.team !== Team.HACKERS) {
        return fail('NOT_AUTHORIZED', 'Only living Hackers can submit night kill actions.');
      }

      // Target must be a living non-Hacker who is not the sender
      const nightTarget = nightPayload.targetPlayerId
        ? session.players[nightPayload.targetPlayerId]
        : undefined;
      if (
        !nightPayload.targetPlayerId
        || nightPayload.targetPlayerId === actorId
        || !nightTarget
        || !nightTarget.alive
        || nightTarget.team === Team.HACKERS
      ) {
        return fail('INVALID_TARGET', 'Target must be a living non-Hacker player.');
      }
    }

    const now = new Date().toISOString();
    const appendResult = appendIntent(session, {
      playerId: actorId,
      type: intent.type,
      payload: intent.payload as VoteIntentPayload | NightActionIntentPayload,
      phase: session.phase,
      cycle: session.cycle,
      createdAt: now,
    });

    if (!appendResult.accepted) {
      return fail(
        'VOTE_ALREADY_SUBMITTED',
        'Only one vote submission is allowed per alive player each cycle.',
      );
    }

    session.updatedAt = now;
    await ctx.repo.saveSession(session);
    ctx.broadcastSessionState(session);

    return ok({
      acceptedIntentId: appendResult.intent.id,
      session: toPlayerSessionView(session, actorId),
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return fail(error.code, error.message);
    }
    return fail('INTERNAL_ERROR', 'An unexpected error occurred.');
  }
}
