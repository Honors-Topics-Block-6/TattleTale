import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  LobbyStatus,
  Phase,
  SOCKET_EVENTS,
  SOCKET_NAMESPACE,
  type ClientCommandAcks,
  type LobbyCommandSuccess,
  type LobbyView,
  type SessionView,
  type SocketReadyPayload,
} from '@tattletale/shared';
import type { FastifyBaseLogger } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameState } from '../../domain/game/types.js';
import type { LobbyState } from '../../domain/lobby/types.js';
import type {
  CreateGameRecordInput,
  GameAuditRepository,
  MessageAuditEventInput,
  PresenceBinding,
  RuntimeRepository,
  SessionAuditEventInput,
} from '../../domain/repositories.js';
import { registerFoundationNamespace } from './register-foundation-namespace.js';

class InMemoryRuntimeRepository implements RuntimeRepository {
  private readonly lobbies = new Map<string, LobbyState>();

  private readonly sessions = new Map<string, GameState>();

  private readonly socketPresence = new Map<string, PresenceBinding>();

  private readonly playerPresence = new Map<string, PresenceBinding>();

  async lobbyCodeExists(code: string): Promise<boolean> {
    return this.lobbies.has(code);
  }

  async getLobby(code: string): Promise<LobbyState | null> {
    const value = this.lobbies.get(code);
    return value ? structuredClone(value) : null;
  }

  async saveLobby(lobby: LobbyState): Promise<void> {
    this.lobbies.set(lobby.code, structuredClone(lobby));
  }

  async getSession(gameId: string): Promise<GameState | null> {
    const value = this.sessions.get(gameId);
    return value ? structuredClone(value) : null;
  }

  async saveSession(session: GameState): Promise<void> {
    this.sessions.set(session.gameId, structuredClone(session));
  }

  async bindSocket(binding: PresenceBinding): Promise<void> {
    this.socketPresence.set(binding.socketId, structuredClone(binding));
    this.playerPresence.set(
      `${binding.lobbyCode}:${binding.playerId}`,
      structuredClone(binding),
    );
  }

  async getPresenceBySocket(socketId: string): Promise<PresenceBinding | null> {
    const value = this.socketPresence.get(socketId);
    return value ? structuredClone(value) : null;
  }

  async clearSocket(socketId: string): Promise<PresenceBinding | null> {
    const binding = this.socketPresence.get(socketId);

    if (!binding) {
      return null;
    }

    this.socketPresence.delete(socketId);
    this.playerPresence.delete(`${binding.lobbyCode}:${binding.playerId}`);

    return structuredClone(binding);
  }

  async clearPlayerPresence(
    lobbyCode: string,
    playerId: string,
  ): Promise<PresenceBinding | null> {
    const key = `${lobbyCode}:${playerId}`;
    const binding = this.playerPresence.get(key);

    if (!binding) {
      return null;
    }

    this.playerPresence.delete(key);
    this.socketPresence.delete(binding.socketId);

    return structuredClone(binding);
  }
}

class InMemoryAuditRepository implements GameAuditRepository {
  readonly gameRecords: CreateGameRecordInput[] = [];

  readonly sessionEvents: SessionAuditEventInput[] = [];

  readonly messageEvents: MessageAuditEventInput[] = [];

  async createGameRecord(input: CreateGameRecordInput): Promise<void> {
    this.gameRecords.push(structuredClone(input));
  }

  async appendSessionEvent(input: SessionAuditEventInput): Promise<void> {
    this.sessionEvents.push(structuredClone(input));
  }

  async appendMessageAudit(input: MessageAuditEventInput): Promise<void> {
    this.messageEvents.push(structuredClone(input));
  }
}

function createLogger(): FastifyBaseLogger {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'silent',
    silent: true,
  } as unknown as FastifyBaseLogger;
}

function onceEvent<T>(socket: ClientSocket, eventName: string, timeoutMs = 3000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timed out waiting for event: ${eventName}`));
    }, timeoutMs);

    function onEvent(payload: T) {
      clearTimeout(timer);
      resolve(payload);
    }

    socket.once(eventName, onEvent);
  });
}

async function emitAck<E extends keyof ClientCommandAcks>(
  socket: ClientSocket,
  eventName: E,
  payload: unknown,
): Promise<ClientCommandAcks[E]> {
  return new Promise<ClientCommandAcks[E]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Ack timeout: ${eventName}`)), 3000);

    socket.emit(eventName, payload, (response: ClientCommandAcks[E]) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 4000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await check()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Condition was not met before timeout.');
}

describe('registerFoundationNamespace', () => {
  let httpServer: HttpServer;
  let io: SocketIOServer;
  let baseUrl: string;
  let runtimeRepository: InMemoryRuntimeRepository;
  let auditRepository: InMemoryAuditRepository;
  let logger: FastifyBaseLogger;
  const clients: ClientSocket[] = [];

  async function connectClient(): Promise<{
    socket: ClientSocket;
    ready: SocketReadyPayload;
  }> {
    const socket = createClient(`${baseUrl}${SOCKET_NAMESPACE}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    clients.push(socket);

    const readyPromise = onceEvent<SocketReadyPayload>(socket, SOCKET_EVENTS.server.ready);
    await onceEvent(socket, 'connect');
    const ready = await readyPromise;

    return {
      socket,
      ready,
    };
  }

  async function createLobby(
    socket: ClientSocket,
    displayName: string,
  ): Promise<LobbyCommandSuccess> {
    const ack = await emitAck(socket, SOCKET_EVENTS.client.createLobby, {
      displayName,
    });

    expect(ack.ok).toBe(true);

    if (!ack.ok) {
      throw new Error('Expected create lobby to succeed.');
    }

    return ack.data;
  }

  async function joinLobby(
    socket: ClientSocket,
    lobbyCode: string,
    displayName: string,
  ): Promise<LobbyCommandSuccess> {
    const ack = await emitAck(socket, SOCKET_EVENTS.client.joinLobby, {
      lobbyCode,
      displayName,
    });

    expect(ack.ok).toBe(true);

    if (!ack.ok) {
      throw new Error('Expected join lobby to succeed.');
    }

    return ack.data;
  }

  async function setLobbyPlayerReady(
    socket: ClientSocket,
    lobbyCode: string,
    playerId: string,
    reconnectToken: string,
    ready: boolean,
  ): Promise<void> {
    const ack = await emitAck(socket, SOCKET_EVENTS.client.setLobbyReady, {
      lobbyCode,
      playerId,
      reconnectToken,
      ready,
    });
    expect(ack.ok).toBe(true);
  }

  async function markLobbyPlayersReady(
    lobbyCode: string,
    entries: Array<{
      socket: ClientSocket;
      playerId: string;
      reconnectToken: string;
    }>,
  ): Promise<void> {
    for (const entry of entries) {
      await setLobbyPlayerReady(
        entry.socket,
        lobbyCode,
        entry.playerId,
        entry.reconnectToken,
        true,
      );
    }
  }

  beforeEach(async () => {
    runtimeRepository = new InMemoryRuntimeRepository();
    auditRepository = new InMemoryAuditRepository();
    logger = createLogger();

    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: true,
        credentials: true,
      },
    });

    registerFoundationNamespace(io, logger, {
      runtimeRepository,
      auditRepository,
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });

    const address = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    for (const socket of clients.splice(0)) {
      if (socket.connected) {
        socket.disconnect();
      }
    }

    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });

    if (httpServer.listening) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  it('creates a lobby with Redis-backed runtime state and broadcasts lobby state', async () => {
    const { socket: host, ready } = await connectClient();

    expect(ready.lobbyCode).toBeNull();

    const lobbyStatePromise = onceEvent<LobbyView>(host, SOCKET_EVENTS.server.lobbyState);
    const created = await createLobby(host, 'HostPlayer');

    const lobbyState = await lobbyStatePromise;
    expect(lobbyState.code).toBe(created.lobby.code);
    expect(lobbyState.players).toHaveLength(1);
    expect(lobbyState.hostPlayerId).toBe(created.playerId);

    const persisted = await runtimeRepository.getLobby(created.lobby.code);
    expect(persisted).not.toBeNull();
    expect(persisted?.players[0].displayName).toBe('HostPlayer');
  });

  it('joins a lobby and enforces host-only kick', async () => {
    const { socket: host } = await connectClient();
    const created = await createLobby(host, 'HostPlayer');

    const { socket: joiner } = await connectClient();
    const hostLobbyUpdate = onceEvent<LobbyView>(host, SOCKET_EVENTS.server.lobbyState);
    const joined = await joinLobby(joiner, created.lobby.code, 'Joiner');

    const lobbyView = await hostLobbyUpdate;
    expect(lobbyView.players).toHaveLength(2);
    expect(lobbyView.players.some((player) => player.playerId === joined.playerId)).toBe(true);

    const nonHostKickAck = await emitAck(joiner, SOCKET_EVENTS.client.kickPlayer, {
      lobbyCode: created.lobby.code,
      actorPlayerId: joined.playerId,
      targetPlayerId: created.playerId,
      reconnectToken: joined.reconnectToken,
    });

    expect(nonHostKickAck.ok).toBe(false);
    if (!nonHostKickAck.ok) {
      expect(nonHostKickAck.error.code).toBe('NOT_HOST');
    }
  });

  it('reconnects an existing alive player and updates presence', async () => {
    const { socket: original } = await connectClient();
    const created = await createLobby(original, 'HostPlayer');

    original.disconnect();

    await waitFor(async () => {
      const lobby = await runtimeRepository.getLobby(created.lobby.code);
      return lobby?.players[0].connected === false;
    });

    const { socket: reconnecting } = await connectClient();

    const reconnectAck = await emitAck(reconnecting, SOCKET_EVENTS.client.reconnect, {
      lobbyCode: created.lobby.code,
      playerId: created.playerId,
      reconnectToken: created.reconnectToken,
    });

    expect(reconnectAck.ok).toBe(true);

    const lobby = await runtimeRepository.getLobby(created.lobby.code);
    const hostPlayer = lobby?.players.find((player) => player.playerId === created.playerId);
    expect(hostPlayer?.connected).toBe(true);
  });

  it('transfers host when host leaves a waiting lobby', async () => {
    const { socket: host } = await connectClient();
    const created = await createLobby(host, 'HostPlayer');

    const { socket: joiner } = await connectClient();
    const joined = await joinLobby(joiner, created.lobby.code, 'Joiner');

    const joinerLobbyUpdate = onceEvent<LobbyView>(joiner, SOCKET_EVENTS.server.lobbyState);
    const leaveAck = await emitAck(host, SOCKET_EVENTS.client.leaveLobby, {
      lobbyCode: created.lobby.code,
      playerId: created.playerId,
      reconnectToken: created.reconnectToken,
    });

    expect(leaveAck.ok).toBe(true);
    if (leaveAck.ok) {
      expect(leaveAck.data.lobby).toBeNull();
    }

    const lobbyView = await joinerLobbyUpdate;
    expect(lobbyView.players).toHaveLength(1);
    expect(lobbyView.hostPlayerId).toBe(joined.playerId);
    expect(lobbyView.players[0].isHost).toBe(true);
  });

  it('auto-starts when all players are ready, persists audit record, and rejects joining in-progress lobby', async () => {
    const { socket: host } = await connectClient();
    const created = await createLobby(host, 'HostPlayer');

    const readyEntries: Array<{
      socket: ClientSocket;
      playerId: string;
      reconnectToken: string;
    }> = [
      {
        socket: host,
        playerId: created.playerId,
        reconnectToken: created.reconnectToken,
      },
    ];

    for (let index = 0; index < 6; index += 1) {
      const { socket: playerSocket } = await connectClient();
      const joined = await joinLobby(playerSocket, created.lobby.code, `Player${index + 2}`);
      readyEntries.push({
        socket: playerSocket,
        playerId: joined.playerId,
        reconnectToken: joined.reconnectToken,
      });
    }

    await markLobbyPlayersReady(created.lobby.code, readyEntries);

    const lobbyAfterStart = await runtimeRepository.getLobby(created.lobby.code);
    expect(lobbyAfterStart?.status).toBe(LobbyStatus.IN_GAME);
    expect(lobbyAfterStart?.sessionId).toBeTruthy();

    expect(auditRepository.gameRecords).toHaveLength(1);
    expect(auditRepository.sessionEvents).toHaveLength(1);

    const { socket: outsider } = await connectClient();
    const joinAck = await emitAck(outsider, SOCKET_EVENTS.client.joinLobby, {
      lobbyCode: created.lobby.code,
      displayName: 'LateJoiner',
    });

    expect(joinAck.ok).toBe(false);
    if (!joinAck.ok) {
      expect(joinAck.error.code).toBe('LOBBY_IN_GAME');
    }
  });

  it('applies permanent removal on midgame leave and blocks reconnect', async () => {
    const { socket: host } = await connectClient();
    const created = await createLobby(host, 'HostPlayer');

    const participants: Array<{ socket: ClientSocket; player: LobbyCommandSuccess }> = [];

    for (let index = 0; index < 6; index += 1) {
      const connection = await connectClient();
      const joined = await joinLobby(connection.socket, created.lobby.code, `Player${index + 2}`);
      participants.push({
        socket: connection.socket,
        player: joined,
      });
    }

    await markLobbyPlayersReady(created.lobby.code, [
      { socket: host, playerId: created.playerId, reconnectToken: created.reconnectToken },
      ...participants.map((p) => ({
        socket: p.socket,
        playerId: p.player.playerId,
        reconnectToken: p.player.reconnectToken,
      })),
    ]);

    const target = participants[0];
    const leaveAck = await emitAck(target.socket, SOCKET_EVENTS.client.leaveLobby, {
      lobbyCode: created.lobby.code,
      playerId: target.player.playerId,
      reconnectToken: target.player.reconnectToken,
    });

    expect(leaveAck.ok).toBe(true);

    const lobby = await runtimeRepository.getLobby(created.lobby.code);
    const lobbyPlayer = lobby?.players.find((player) => player.playerId === target.player.playerId);
    expect(lobbyPlayer?.alive).toBe(false);
    expect(lobbyPlayer?.connected).toBe(false);

    const sessionId = lobby?.sessionId;
    expect(sessionId).toBeTruthy();

    const session = await runtimeRepository.getSession(sessionId as string);
    expect(session?.players[target.player.playerId]?.alive).toBe(false);
    expect(session?.players[target.player.playerId]?.connected).toBe(false);

    const channelsContainPlayer = Object.values(session?.channels ?? {}).some((channel) =>
      channel.members.includes(target.player.playerId),
    );
    expect(channelsContainPlayer).toBe(false);

    const { socket: reconnectAttempt } = await connectClient();
    const reconnectAck = await emitAck(reconnectAttempt, SOCKET_EVENTS.client.reconnect, {
      lobbyCode: created.lobby.code,
      playerId: target.player.playerId,
      reconnectToken: target.player.reconnectToken,
    });

    expect(reconnectAck.ok).toBe(false);
    if (!reconnectAck.ok) {
      expect(reconnectAck.error.code).toBe('PLAYER_NOT_ALIVE');
    }
  });

  it('applies permanent removal on midgame kick and blocks reconnect', async () => {
    const { socket: host } = await connectClient();
    const created = await createLobby(host, 'HostPlayer');

    const participants: Array<{ socket: ClientSocket; player: LobbyCommandSuccess }> = [];

    for (let index = 0; index < 6; index += 1) {
      const connection = await connectClient();
      const joined = await joinLobby(connection.socket, created.lobby.code, `Player${index + 2}`);
      participants.push({
        socket: connection.socket,
        player: joined,
      });
    }

    await markLobbyPlayersReady(created.lobby.code, [
      { socket: host, playerId: created.playerId, reconnectToken: created.reconnectToken },
      ...participants.map((p) => ({
        socket: p.socket,
        playerId: p.player.playerId,
        reconnectToken: p.player.reconnectToken,
      })),
    ]);

    const target = participants[1];
    const kickAck = await emitAck(host, SOCKET_EVENTS.client.kickPlayer, {
      lobbyCode: created.lobby.code,
      actorPlayerId: created.playerId,
      targetPlayerId: target.player.playerId,
      reconnectToken: created.reconnectToken,
    });
    expect(kickAck.ok).toBe(true);

    const lobby = await runtimeRepository.getLobby(created.lobby.code);
    const lobbyPlayer = lobby?.players.find((player) => player.playerId === target.player.playerId);
    expect(lobbyPlayer?.alive).toBe(false);
    expect(lobbyPlayer?.connected).toBe(false);

    const { socket: reconnectAttempt } = await connectClient();
    const reconnectAck = await emitAck(reconnectAttempt, SOCKET_EVENTS.client.reconnect, {
      lobbyCode: created.lobby.code,
      playerId: target.player.playerId,
      reconnectToken: target.player.reconnectToken,
    });

    expect(reconnectAck.ok).toBe(false);
    if (!reconnectAck.ok) {
      expect(reconnectAck.error.code).toBe('PLAYER_NOT_ALIVE');
    }
  });

  it('marks disconnected players as disconnected without killing them', async () => {
    const { socket: host } = await connectClient();
    const created = await createLobby(host, 'HostPlayer');

    const { socket: joiner } = await connectClient();
    const initialJoinUpdate = onceEvent<LobbyView>(host, SOCKET_EVENTS.server.lobbyState);
    const joined = await joinLobby(joiner, created.lobby.code, 'Joiner');
    await initialJoinUpdate;

    const hostLobbyUpdate = onceEvent<LobbyView>(host, SOCKET_EVENTS.server.lobbyState);
    joiner.disconnect();

    const lobbyView = await hostLobbyUpdate;
    const joinerView = lobbyView.players.find((player) => player.playerId === joined.playerId);

    expect(joinerView?.connected).toBe(false);
    expect(joinerView?.alive).toBe(true);

    await waitFor(async () => {
      const lobby = await runtimeRepository.getLobby(created.lobby.code);
      const player = lobby?.players.find((entry) => entry.playerId === joined.playerId);
      return player?.connected === false && player.alive === true;
    });
  });

  it('emits session state when the last player shuts off (all ready)', async () => {
    const { socket: host } = await connectClient();
    const created = await createLobby(host, 'HostPlayer');

    const readyEntries: Array<{
      socket: ClientSocket;
      playerId: string;
      reconnectToken: string;
    }> = [
      {
        socket: host,
        playerId: created.playerId,
        reconnectToken: created.reconnectToken,
      },
    ];

    for (let index = 0; index < 6; index += 1) {
      const { socket: playerSocket } = await connectClient();
      const joined = await joinLobby(playerSocket, created.lobby.code, `Player${index + 2}`);
      readyEntries.push({
        socket: playerSocket,
        playerId: joined.playerId,
        reconnectToken: joined.reconnectToken,
      });
    }

    const sessionStatePromise = onceEvent<SessionView>(host, SOCKET_EVENTS.server.sessionState);

    await markLobbyPlayersReady(created.lobby.code, readyEntries);

    const sessionState = await sessionStatePromise;
    expect(sessionState.lobbyCode).toBe(created.lobby.code);
    expect(sessionState.players).toHaveLength(7);
    expect(sessionState.phase).toBe(Phase.NIGHT_ACTIONS);
    expect(sessionState.self?.playerId).toBe(created.playerId);
  });
});
