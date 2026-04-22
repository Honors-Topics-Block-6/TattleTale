import type { Env } from '../config/env.js';
import type { LobbyState } from '../domain/lobby/types.js';
import type { GameState } from '../domain/game/types.js';
import type { ServerMessage, ClientMessageType } from '@tattletale/shared';
import { LobbyStatus, SessionStatus } from '@tattletale/shared';
import { DEFAULT_LOBBY_SETTINGS, touchLobby } from '../domain/lobby/types.js';
import { validateDisplayName } from '../domain/lobby/lobby-code.js';
import { reconcileSessionRuntime } from '../domain/game/runtime-domain.js';
import { toLobbyView, toPlayerSessionView } from '../domain/projections.js';
import { DORuntimeRepository } from '../persistence/do-runtime-repo.js';
import { D1AuditRepository } from '../persistence/d1-audit-repo.js';
import { parseClientMessage } from '../transport/ws-schemas.js';
import {
  handleJoinLobby,
  handleRejoinLobby,
  handleKickPlayer,
  handleStartGame,
  handleSubmitIntent,
  handleUpdateSettings,
  persistRuntimeEvents,
  generateToken,
  selectNextHost,
  assignHost,
  type HandlerContext,
  type HandlerResult,
} from '../transport/ws-message-handler.js';

interface WsAttachment {
  playerId: string | null;
}

export class GameRoomDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private repo: DORuntimeRepository;
  private auditRepo: D1AuditRepository;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.repo = new DORuntimeRepository(state.storage);
    this.auditRepo = new D1AuditRepository(env.DB);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // ─── Internal endpoints (called by Worker router) ─────
    if (url.pathname === '/internal/exists') {
      const lobby = await this.repo.getLobby();
      if (lobby && lobby.status !== LobbyStatus.CLOSED) {
        return new Response('exists', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }

    if (url.pathname === '/internal/create' && request.method === 'POST') {
      return this.handleCreateLobby(request);
    }

    // ─── WebSocket upgrade ────────────────────────────────
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade();
    }

    return new Response('not found', { status: 404 });
  }

  // ─── Lobby Creation (HTTP) ──────────────────────────────

  private async handleCreateLobby(request: Request): Promise<Response> {
    const existing = await this.repo.getLobby();
    if (existing && existing.status !== LobbyStatus.CLOSED) {
      return Response.json({ ok: false, error: 'Lobby already exists' }, { status: 409 });
    }

    const body = (await request.json()) as {
      lobbyCode: string;
      displayName: string;
      accountId?: string;
      avatar?: string | null;
      settings?: Partial<typeof DEFAULT_LOBBY_SETTINGS>;
    };

    const displayName = validateDisplayName(body.displayName);
    const playerId = crypto.randomUUID();
    const reconnectToken = generateToken();
    const now = new Date().toISOString();

    const settings = { ...DEFAULT_LOBBY_SETTINGS, ...body.settings };

    const lobby: LobbyState = {
      code: body.lobbyCode,
      status: LobbyStatus.WAITING,
      hostPlayerId: playerId,
      players: [
        {
          playerId,
          accountId: body.accountId,
          displayName,
          avatar: body.avatar ?? null,
          isHost: true,
          ready: false,
          connected: true,
          alive: true,
          reconnectToken,
          joinedAt: now,
        },
      ],
      settings,
      sessionId: null,
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };

    // If there was old state from a previous game, clear it
    if (existing) {
      await this.state.storage.deleteAll();
    }

    await this.repo.saveLobby(lobby);
    await this.repo.savePlayerRecord(playerId, { reconnectToken, tokenIssuedAt: Date.now() });

    return Response.json({ playerId, reconnectToken });
  }

  // ─── WebSocket Upgrade ──────────────────────────────────

  private handleWebSocketUpgrade(): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);
    (server as any).serializeAttachment({ playerId: null } satisfies WsAttachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ─── Hibernatable WebSocket Handlers ────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const raw = typeof message === 'string' ? message : new TextDecoder().decode(message);

    // Restore phase alarm if needed (defensive, on any wake)
    await this.restoreAlarmIfNeeded();

    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      this.sendMessage(ws, { type: 'error', payload: { code: parsed.code, message: parsed.message } });
      return;
    }

    const { type, seq, payload } = parsed;

    // Authentication gate: only joinLobby, rejoinLobby, and ping allowed before auth
    const attachment = (ws as any).deserializeAttachment() as WsAttachment;
    if (
      !attachment.playerId &&
      type !== 'joinLobby' &&
      type !== 'rejoinLobby' &&
      type !== 'ping'
    ) {
      this.sendMessage(ws, {
        type: 'error',
        ref: seq,
        payload: { code: 'NOT_AUTHENTICATED', message: 'Send joinLobby or rejoinLobby first' },
      });
      return;
    }

    const ctx = this.createHandlerContext();
    let result: HandlerResult;

    switch (type) {
      case 'ping':
        result = { ok: true, data: {} };
        break;
      case 'joinLobby':
        result = await handleJoinLobby(ctx, ws, payload as any);
        break;
      case 'rejoinLobby':
        result = await handleRejoinLobby(ctx, ws, payload as any);
        break;
      case 'kickPlayer':
        result = await handleKickPlayer(ctx, ws, payload as any);
        break;
      case 'startGame':
        result = await handleStartGame(ctx, ws);
        break;
      case 'submitIntent':
        result = await handleSubmitIntent(ctx, ws, payload as any);
        break;
      case 'updateSettings':
        result = await handleUpdateSettings(ctx, ws, payload as any);
        break;
      default:
        result = { ok: false, code: 'UNKNOWN_TYPE', message: `Unknown type: ${type}` };
    }

    if (result.ok) {
      this.sendMessage(ws, { type: 'ack', ref: seq, payload: { data: result.data } });
    } else {
      this.sendMessage(ws, { type: 'error', ref: seq, payload: { code: result.code, message: result.message } });
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const attachment = (ws as any).deserializeAttachment() as WsAttachment;
    if (!attachment.playerId) return;

    const playerId = attachment.playerId;

    // Mark disconnected in player record
    const record = await this.repo.getPlayerRecord(playerId);
    if (record) {
      await this.repo.savePlayerRecord(playerId, { ...record, lastDisconnectedAt: Date.now() });
    }

    // Mark disconnected in lobby state
    const lobby = await this.repo.getLobby();
    if (lobby) {
      const player = lobby.players.find((p) => p.playerId === playerId);
      if (player) {
        player.connected = false;

        // Reassign host if the disconnecting player was the host
        if (player.isHost) {
          const candidates = lobby.players.filter((p) => p.playerId !== playerId);
          assignHost(lobby, selectNextHost(candidates));
        }

        touchLobby(lobby, new Date().toISOString());
        await this.repo.saveLobby(lobby);
        this.broadcastLobbyState(lobby);
      }
    }

    // Mark disconnected in session state
    const session = await this.repo.getSession();
    if (session && session.players[playerId]) {
      session.players[playerId].connected = false;
      await this.repo.saveSession(session);
      this.broadcastSessionState(session);
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    // Treat errors as disconnections
    await this.webSocketClose(ws, 1011, 'WebSocket error');
  }

  // ─── Alarm (Phase Timer) ────────────────────────────────

  async alarm(): Promise<void> {
    // Handle game-end WS close alarm
    const gameEndPending = await this.repo.getGameEndPending();
    if (gameEndPending) {
      await this.repo.saveGameEndPending(false);
      for (const ws of this.state.getWebSockets()) {
        try { ws.close(1000, 'Game ended'); } catch { /* already closed */ }
      }
      return;
    }

    const deadline = await this.repo.getPhaseDeadline();
    if (!deadline) return;

    const lobby = await this.repo.getLobby();
    const session = await this.repo.getSession();
    if (!lobby || !session || session.status !== SessionStatus.ACTIVE) {
      await this.repo.clearPhaseDeadline();
      return;
    }

    // Verify this alarm matches current state
    if (session.phase !== deadline.phase || session.cycle !== deadline.cycle) {
      await this.repo.clearPhaseDeadline();
      return;
    }

    const now = new Date().toISOString();
    const events = reconcileSessionRuntime(session, lobby, lobby.settings, now);

    await this.repo.saveSession(session);
    await this.repo.saveLobby(lobby);
    await persistRuntimeEvents(this.auditRepo, session.gameId, events);

    // Push targeted playerEliminated events so clients can trigger the
    // elimination sequence; reason→cause mapping matches PlayerEliminatedPayload.
    const sessionPlayerIds = Object.keys(session.players);
    for (const ev of events) {
      if (ev.type !== 'PLAYER_ELIMINATED') continue;
      const cause =
        ev.reason === 'DAY_VOTE' ? 'VOTED_OUT'
        : ev.reason === 'NIGHT_KILL' ? 'NIGHT_KILL'
        : ev.reason === 'PLAYER_LEFT' ? 'PLAYER_LEFT'
        : 'PLAYER_KICKED';
      this.broadcastPlayerEliminated(ev.playerId, cause, session.cycle, sessionPlayerIds);
    }

    // Check if game ended (win condition reached during reconciliation)
    if (session.status !== SessionStatus.ACTIVE) {
      await this.handleGameEnd(session, lobby);
      return;
    }

    // Set next alarm if game is still active
    if (session.timers.currentPhaseEndsAt) {
      const nextDeadlineMs = new Date(session.timers.currentPhaseEndsAt).getTime();
      await this.repo.savePhaseDeadline({ phase: session.phase, cycle: session.cycle, deadlineMs: nextDeadlineMs });
      await this.state.storage.setAlarm(nextDeadlineMs);
    } else {
      await this.repo.clearPhaseDeadline();
    }

    this.broadcastSessionState(session);
    this.broadcastLobbyState(lobby);
  }

  // ─── Game End Cleanup ───────────────────────────────────

  private async handleGameEnd(session: GameState, lobby: LobbyState): Promise<void> {
    // Clear phase timer
    await this.repo.clearPhaseDeadline();
    await this.state.storage.deleteAlarm();

    // Write final audit record
    try {
      await this.auditRepo.appendSessionEvent({
        gameId: session.gameId,
        type: 'GAME_ENDED',
        payload: { status: session.status, winnerTeam: session.winnerTeam },
      });
    } catch { /* non-fatal */ }

    // Update lobby status
    lobby.status = LobbyStatus.CLOSED;
    touchLobby(lobby, new Date().toISOString());
    await this.repo.saveLobby(lobby);

    // Final broadcast
    this.broadcastSessionState(session);
    this.broadcastLobbyState(lobby);

    // Invalidate all reconnect tokens (spec: "All tokens are invalidated when the game ends")
    const playerIds = lobby.players.map((p) => p.playerId);
    await this.repo.deleteAllPlayerRecords(playerIds);

    // Schedule alarm to close WebSocket connections after final state arrives
    await this.repo.saveGameEndPending(true);
    await this.state.storage.setAlarm(Date.now() + 3000);
  }

  // ─── Private Helpers ────────────────────────────────────

  private createHandlerContext(): HandlerContext {
    return {
      repo: this.repo,
      auditRepo: this.auditRepo,
      getPlayerIdForWs: (ws) => {
        const att = (ws as any).deserializeAttachment() as WsAttachment;
        return att.playerId;
      },
      setPlayerIdForWs: (ws, playerId) => {
        (ws as any).serializeAttachment({ playerId } satisfies WsAttachment);
      },
      broadcastLobbyState: (lobby) => this.broadcastLobbyState(lobby),
      broadcastSessionState: (session) => this.broadcastSessionState(session),
      broadcastChannelMessage: (channelId, message, recipientPlayerIds) =>
        this.broadcastChannelMessage(channelId, message, recipientPlayerIds),
      broadcastPlayerEliminated: (playerId, cause, cycle, recipientPlayerIds) =>
        this.broadcastPlayerEliminated(playerId, cause, cycle, recipientPlayerIds),
      closeWsForPlayer: (playerId, code, reason) => this.closeWsForPlayer(playerId, code, reason),
      setPhaseAlarm: async (deadlineMs, phase, cycle) => {
        await this.repo.savePhaseDeadline({ phase, cycle, deadlineMs });
        await this.state.storage.setAlarm(deadlineMs);
      },
      clearPhaseAlarm: async () => {
        await this.repo.clearPhaseDeadline();
        await this.state.storage.deleteAlarm();
      },
    };
  }

  private broadcastLobbyState(lobby: LobbyState): void {
    const view = toLobbyView(lobby);
    const msg: ServerMessage = { type: 'lobbyState', payload: view };
    const raw = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      try { ws.send(raw); } catch { /* dead socket */ }
    }
  }

  private broadcastSessionState(session: GameState): void {
    for (const ws of this.state.getWebSockets()) {
      const attachment = (ws as any).deserializeAttachment() as WsAttachment;
      if (!attachment.playerId) continue;
      const view = toPlayerSessionView(session, attachment.playerId);
      const msg: ServerMessage = { type: 'sessionState', payload: view };
      try { ws.send(JSON.stringify(msg)); } catch { /* dead socket */ }
    }
  }

  private broadcastChannelMessage(
    channelId: string,
    message: {
      id: string;
      senderId: string;
      senderName: string;
      senderAvatar?: string | null;
      content: string;
      timestamp: string;
      cycle: number;
    },
    recipientPlayerIds: string[],
  ): void {
    const recipients = new Set(recipientPlayerIds);
    const msg: ServerMessage = {
      type: 'channelMessage',
      payload: { channelId, message },
    };
    const raw = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      const attachment = (ws as any).deserializeAttachment() as WsAttachment;
      if (!attachment.playerId || !recipients.has(attachment.playerId)) continue;
      try { ws.send(raw); } catch { /* dead socket */ }
    }
  }

  private broadcastPlayerEliminated(
    playerId: string,
    cause: 'VOTED_OUT' | 'NIGHT_KILL' | 'PLAYER_LEFT' | 'PLAYER_KICKED',
    cycle: number,
    recipientPlayerIds: string[],
  ): void {
    const recipients = new Set(recipientPlayerIds);
    const msg: ServerMessage = {
      type: 'playerEliminated',
      payload: { playerId, cause, cycle },
    };
    const raw = JSON.stringify(msg);
    for (const ws of this.state.getWebSockets()) {
      const attachment = (ws as any).deserializeAttachment() as WsAttachment;
      if (!attachment.playerId || !recipients.has(attachment.playerId)) continue;
      try { ws.send(raw); } catch { /* dead socket */ }
    }
  }

  private closeWsForPlayer(playerId: string, code: number, reason: string): void {
    for (const ws of this.state.getWebSockets()) {
      const attachment = (ws as any).deserializeAttachment() as WsAttachment;
      if (attachment.playerId === playerId) {
        try {
          this.sendMessage(ws, { type: 'kicked', payload: { reason } });
          ws.close(code, reason);
        } catch { /* already closed */ }
      }
    }
  }

  private sendMessage(ws: WebSocket, msg: ServerMessage): void {
    try { ws.send(JSON.stringify(msg)); } catch { /* dead socket */ }
  }

  private async restoreAlarmIfNeeded(): Promise<void> {
    const deadline = await this.repo.getPhaseDeadline();
    if (!deadline) return;

    const currentAlarm = await this.state.storage.getAlarm();
    if (currentAlarm) return; // Alarm already set

    if (deadline.deadlineMs <= Date.now()) {
      // Missed deadline - process immediately
      await this.alarm();
    } else {
      // Re-register alarm
      await this.state.storage.setAlarm(deadline.deadlineMs);
    }
  }
}
