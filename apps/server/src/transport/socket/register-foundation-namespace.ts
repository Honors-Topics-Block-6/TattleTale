import {
  IntentType,
  LobbyStatus,
  SessionStatus,
  SOCKET_EVENTS,
  SOCKET_NAMESPACE,
  SystemEventType,
  type ClientCommandAcks,
  type ClientCommandPayloads,
  type CommandFailure,
  type LobbyCommandSuccess,
  type SubmitIntentSuccess,
  type StartGameSuccess,
} from '@tattletale/shared';
import type { FastifyBaseLogger } from 'fastify';
import { Server as SocketIOServer, type Socket } from 'socket.io';

import { DomainError } from '../../domain/errors.js';
import {
  appendIntent,
  initializeSessionRuntime,
  isIntentAllowedInPhase,
  processElimination,
  reconcileSessionRuntime,
  type RuntimeEvent,
} from '../../domain/game/runtime-domain.js';
import { buildSessionFromLobby } from '../../domain/game/session-domain.js';
import type {
  GameState,
  NightActionIntentPayload,
  VoteIntentPayload,
} from '../../domain/game/types.js';
import {
  generateLobbyCode,
  normalizeLobbyCode,
  validateDisplayName,
} from '../../domain/lobby/lobby-code.js';
import {
  DEFAULT_LOBBY_SETTINGS,
  type LobbySettings,
  type LobbyState,
} from '../../domain/lobby/types.js';
import { toLobbyView, toSessionView } from '../../domain/projections.js';
import type {
  GameAuditRepository,
  RuntimeRepository,
} from '../../domain/repositories.js';

const LOBBY_ROOM_PREFIX = 'lobby:';
const SESSION_ROOM_PREFIX = 'session:';
const MAX_LOBBY_CODE_ATTEMPTS = 12;

interface RegisterFoundationNamespaceDependencies {
  runtimeRepository: RuntimeRepository;
  auditRepository: GameAuditRepository;
}

function notImplementedResponse(): CommandFailure {
  return {
    ok: false as const,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'This command is not implemented.',
    },
  };
}

function commandSuccess<T>(data: T) {
  return {
    ok: true as const,
    data,
  };
}

function toCommandFailure(error: unknown): CommandFailure {
  if (error instanceof DomainError) {
    return {
      ok: false as const,
      error: {
        code: error.code,
        message: error.message,
      },
    };
  }

  return {
    ok: false as const,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  };
}

function lobbyRoom(code: string): string {
  return `${LOBBY_ROOM_PREFIX}${code}`;
}

function sessionRoom(gameId: string): string {
  return `${SESSION_ROOM_PREFIX}${gameId}`;
}

function updateSocketReady(
  socket: Socket,
  payload: {
    lobbyCode: string | null;
    playerId: string | null;
    sessionId: string | null;
  },
): void {
  socket.emit(SOCKET_EVENTS.server.ready, payload);
}

function emitLobbyState(namespace: ReturnType<SocketIOServer['of']>, lobby: LobbyState): void {
  namespace
    .to(lobbyRoom(lobby.code))
    .emit(SOCKET_EVENTS.server.lobbyState, toLobbyView(lobby));
}

function emitSessionState(namespace: ReturnType<SocketIOServer['of']>, session: GameState): void {
  namespace
    .to(sessionRoom(session.gameId))
    .emit(SOCKET_EVENTS.server.sessionState, toSessionView(session));
}

async function reconcileRuntime(
  logger: FastifyBaseLogger,
  auditRepository: GameAuditRepository,
  runtimeRepository: RuntimeRepository,
  lobby: LobbyState,
  session: GameState,
): Promise<RuntimeEvent[]> {
  const now = new Date().toISOString();
  const events = reconcileSessionRuntime(session, lobby, lobby.settings, now);

  if (events.length === 0) {
    return events;
  }

  await runtimeRepository.saveSession(session);
  await runtimeRepository.saveLobby(lobby);
  await persistRuntimeEvents(logger, auditRepository, session.gameId, events);

  return events;
}

function parseLobbySettings(settings?: Partial<LobbySettings>): LobbySettings {
  if (!settings) {
    return { ...DEFAULT_LOBBY_SETTINGS };
  }

  const merged: LobbySettings = {
    ...DEFAULT_LOBBY_SETTINGS,
    ...settings,
  };

  if (!Number.isInteger(merged.minPlayers) || merged.minPlayers < 7 || merged.minPlayers > 20) {
    throw new DomainError('INVALID_LOBBY_SETTINGS', 'minPlayers must be an integer between 7 and 20.');
  }

  if (!Number.isInteger(merged.maxPlayers) || merged.maxPlayers < 7 || merged.maxPlayers > 20) {
    throw new DomainError('INVALID_LOBBY_SETTINGS', 'maxPlayers must be an integer between 7 and 20.');
  }

  if (merged.maxPlayers < merged.minPlayers) {
    throw new DomainError(
      'INVALID_LOBBY_SETTINGS',
      'maxPlayers must be greater than or equal to minPlayers.',
    );
  }

  if (!Number.isInteger(merged.dayDurationSeconds) || merged.dayDurationSeconds < 30) {
    throw new DomainError(
      'INVALID_LOBBY_SETTINGS',
      'dayDurationSeconds must be an integer greater than or equal to 30.',
    );
  }

  if (!Number.isInteger(merged.nightDurationSeconds) || merged.nightDurationSeconds < 10) {
    throw new DomainError(
      'INVALID_LOBBY_SETTINGS',
      'nightDurationSeconds must be an integer greater than or equal to 10.',
    );
  }

  return merged;
}

async function createUniqueLobbyCode(runtimeRepository: RuntimeRepository): Promise<string> {
  for (let attempt = 0; attempt < MAX_LOBBY_CODE_ATTEMPTS; attempt += 1) {
    const code = normalizeLobbyCode(generateLobbyCode());

    if (!(await runtimeRepository.lobbyCodeExists(code))) {
      return code;
    }
  }

  throw new DomainError(
    'LOBBY_CODE_GENERATION_FAILED',
    'Failed to allocate a unique lobby code.',
    500,
  );
}

async function requireLobby(
  runtimeRepository: RuntimeRepository,
  lobbyCodeInput: string,
): Promise<LobbyState> {
  const code = normalizeLobbyCode(lobbyCodeInput);
  const lobby = await runtimeRepository.getLobby(code);

  if (!lobby) {
    throw new DomainError('LOBBY_NOT_FOUND', 'Lobby was not found.', 404);
  }

  return lobby;
}

async function requireSession(
  runtimeRepository: RuntimeRepository,
  gameId: string,
): Promise<GameState> {
  const session = await runtimeRepository.getSession(gameId);

  if (!session) {
    throw new DomainError('SESSION_NOT_FOUND', 'Active session was not found.', 404);
  }

  return session;
}

function requirePlayerInLobby(lobby: LobbyState, playerId: string) {
  const playerIndex = lobby.players.findIndex((player) => player.playerId === playerId);

  if (playerIndex < 0) {
    throw new DomainError('PLAYER_NOT_FOUND', 'Player was not found in this lobby.', 404);
  }

  return {
    player: lobby.players[playerIndex],
    playerIndex,
  };
}

async function requireBoundSocket(
  runtimeRepository: RuntimeRepository,
  socket: Socket,
  lobbyCode: string,
  playerId: string,
): Promise<void> {
  const presence = await runtimeRepository.getPresenceBySocket(socket.id);

  if (!presence) {
    throw new DomainError('SOCKET_NOT_BOUND', 'Socket is not bound to a lobby player.', 403);
  }

  if (presence.lobbyCode !== lobbyCode || presence.playerId !== playerId) {
    throw new DomainError('SOCKET_NOT_BOUND', 'Socket binding does not match actor identity.', 403);
  }
}

function assignHost(lobby: LobbyState, nextHostPlayerId: string | null): void {
  lobby.hostPlayerId = nextHostPlayerId ?? '';

  for (const player of lobby.players) {
    player.isHost = nextHostPlayerId !== null && player.playerId === nextHostPlayerId;
  }
}

function selectNextHost(candidates: LobbyState['players']): string | null {
  if (candidates.length === 0) {
    return null;
  }

  return (
    candidates.find((player) => player.connected && player.alive)?.playerId
    ?? candidates.find((player) => player.alive)?.playerId
    ?? candidates.find((player) => player.connected)?.playerId
    ?? candidates[0].playerId
  );
}

function markPlayerPermanentlyRemoved(player: LobbyState['players'][number]): void {
  player.alive = false;
  player.connected = false;
  player.reconnectToken = crypto.randomUUID();
}

function touchLobby(lobby: LobbyState, now: string): void {
  lobby.updatedAt = now;
}

function parseVoteIntentPayload(payload: unknown): VoteIntentPayload {
  if (!payload || typeof payload !== 'object') {
    throw new DomainError('INVALID_INTENT_PAYLOAD', 'Vote payload must be an object.');
  }

  const candidate = (payload as { targetPlayerId?: unknown }).targetPlayerId;
  if (candidate !== null && typeof candidate !== 'string') {
    throw new DomainError(
      'INVALID_INTENT_PAYLOAD',
      'Vote payload targetPlayerId must be a string or null.',
    );
  }

  return {
    targetPlayerId: candidate ?? null,
  };
}

function parseNightActionIntentPayload(payload: unknown): NightActionIntentPayload {
  if (!payload || typeof payload !== 'object') {
    throw new DomainError('INVALID_INTENT_PAYLOAD', 'Night action payload must be an object.');
  }

  const actionType = (payload as { actionType?: unknown }).actionType;
  if (typeof actionType !== 'string' || actionType.trim().length === 0) {
    throw new DomainError(
      'INVALID_INTENT_PAYLOAD',
      'Night action payload actionType must be a non-empty string.',
    );
  }

  const rawTarget = (payload as { targetPlayerId?: unknown }).targetPlayerId;
  if (rawTarget !== undefined && rawTarget !== null && typeof rawTarget !== 'string') {
    throw new DomainError(
      'INVALID_INTENT_PAYLOAD',
      'Night action payload targetPlayerId must be a string, null, or omitted.',
    );
  }

  const rawMetadata = (payload as { metadata?: unknown }).metadata;
  if (rawMetadata !== undefined && (typeof rawMetadata !== 'object' || rawMetadata === null)) {
    throw new DomainError(
      'INVALID_INTENT_PAYLOAD',
      'Night action payload metadata must be an object when provided.',
    );
  }

  return {
    actionType: actionType.trim(),
    targetPlayerId: rawTarget ?? null,
    metadata: (rawMetadata as Record<string, unknown> | undefined) ?? {},
  };
}

function resolveIntentPayload(
  type: IntentType,
  payload: unknown,
): VoteIntentPayload | NightActionIntentPayload {
  if (type === IntentType.SUBMIT_VOTE) {
    return parseVoteIntentPayload(payload);
  }

  if (type === IntentType.SUBMIT_NIGHT_ACTION) {
    return parseNightActionIntentPayload(payload);
  }

  throw new DomainError(
    'NOT_IMPLEMENTED',
    `${type} is intentionally not implemented in this milestone.`,
  );
}

async function persistRuntimeEvents(
  logger: FastifyBaseLogger,
  auditRepository: GameAuditRepository,
  gameId: string,
  events: RuntimeEvent[],
): Promise<void> {
  for (const event of events) {
    try {
      if (event.type === 'PHASE_ADVANCED') {
        await auditRepository.appendSessionEvent({
          gameId,
          type: 'PHASE_ADVANCED',
          payload: {
            phase: event.phase,
            cycle: event.cycle,
            at: event.at,
          },
        });
        continue;
      }

      if (event.type === 'PLAYER_ELIMINATED') {
        await auditRepository.appendSessionEvent({
          gameId,
          type: 'PLAYER_ELIMINATED',
          payload: {
            playerId: event.playerId,
            reason: event.reason,
            at: event.at,
          },
        });
        continue;
      }

      await auditRepository.appendSessionEvent({
        gameId,
        type: 'GAME_ENDED',
        payload: {
          winnerTeam: event.winnerTeam,
          status: event.status,
          at: event.at,
        },
      });
    } catch (error) {
      logger.error(
        { err: error, gameId, eventType: event.type },
        'Failed to persist runtime audit event',
      );
    }
  }
}

export function registerFoundationNamespace(
  io: SocketIOServer,
  logger: FastifyBaseLogger,
  dependencies?: RegisterFoundationNamespaceDependencies,
) {
  const namespace = io.of(SOCKET_NAMESPACE);

  if (!dependencies) {
    const clientEvents = Object.values(
      SOCKET_EVENTS.client,
    ) as Array<keyof ClientCommandAcks>;

    namespace.on('connection', (socket) => {
      logger.debug({ socketId: socket.id }, 'Socket connected to foundation namespace');

      updateSocketReady(socket, {
        lobbyCode: null,
        playerId: null,
        sessionId: null,
      });

      for (const eventName of clientEvents) {
        socket.on(
          eventName,
          (
            _payload: unknown,
            ack?: (response: ClientCommandAcks[keyof ClientCommandAcks]) => void,
          ) => {
            const response = notImplementedResponse();
            socket.emit(SOCKET_EVENTS.server.commandError, response.error);
            ack?.(response);
          },
        );
      }
    });

    return namespace;
  }

  const { runtimeRepository, auditRepository } = dependencies;

  async function runCommand<E extends keyof ClientCommandAcks>(
    socket: Socket,
    eventName: E,
    payload: unknown,
    ack: ((response: ClientCommandAcks[E]) => void) | undefined,
    handler: (command: ClientCommandPayloads[E]) => Promise<ClientCommandAcks[E]>,
  ): Promise<void> {
    try {
      const response = await handler(payload as ClientCommandPayloads[E]);

      if (!response.ok) {
        socket.emit(SOCKET_EVENTS.server.commandError, response.error);
      }

      ack?.(response);
    } catch (error) {
      logger.error({ err: error, eventName, socketId: socket.id }, 'Socket command handler failed');
      const response = toCommandFailure(error);
      socket.emit(SOCKET_EVENTS.server.commandError, response.error);
      ack?.(response as ClientCommandAcks[E]);
    }
  }

  namespace.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Socket connected to foundation namespace');

    updateSocketReady(socket, {
      lobbyCode: null,
      playerId: null,
      sessionId: null,
    });

    socket.on(
      SOCKET_EVENTS.client.createLobby,
      async (
        payload: ClientCommandPayloads[typeof SOCKET_EVENTS.client.createLobby],
        ack?: (
          response: ClientCommandAcks[typeof SOCKET_EVENTS.client.createLobby],
        ) => void,
      ) => {
        await runCommand(
          socket,
          SOCKET_EVENTS.client.createLobby,
          payload,
          ack,
          async (command) => {
            const now = new Date().toISOString();
            const lobbyCode = await createUniqueLobbyCode(runtimeRepository);
            const playerId = crypto.randomUUID();
            const reconnectToken = crypto.randomUUID();
            const displayName = validateDisplayName(command.displayName);
            const settings = parseLobbySettings(command.settings);

            const isPublic = command.isPublic ?? false;

            const lobby: LobbyState = {
              code: lobbyCode,
              status: LobbyStatus.WAITING,
              hostPlayerId: playerId,
              players: [
                {
                  playerId,
                  displayName,
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
              isPublic,
              createdAt: now,
              updatedAt: now,
            };

            await runtimeRepository.saveLobby(lobby);

            if (isPublic) {
              await runtimeRepository.addPublicLobby(lobby.code);
            }
            await runtimeRepository.bindSocket({
              socketId: socket.id,
              lobbyCode: lobby.code,
              playerId,
            });

            socket.join(lobbyRoom(lobby.code));
            updateSocketReady(socket, {
              lobbyCode: lobby.code,
              playerId,
              sessionId: null,
            });

            emitLobbyState(namespace, lobby);

            return commandSuccess<LobbyCommandSuccess>({
              lobby: toLobbyView(lobby),
              playerId,
              reconnectToken,
            });
          },
        );
      },
    );

    socket.on(
      SOCKET_EVENTS.client.joinLobby,
      async (
        payload: ClientCommandPayloads[typeof SOCKET_EVENTS.client.joinLobby],
        ack?: (response: ClientCommandAcks[typeof SOCKET_EVENTS.client.joinLobby]) => void,
      ) => {
        await runCommand(
          socket,
          SOCKET_EVENTS.client.joinLobby,
          payload,
          ack,
          async (command) => {
            const lobby = await requireLobby(runtimeRepository, command.lobbyCode);

            if (lobby.status !== LobbyStatus.WAITING) {
              throw new DomainError('LOBBY_IN_GAME', 'Lobby is already in game and cannot be joined.');
            }

            if (lobby.players.length >= lobby.settings.maxPlayers) {
              throw new DomainError('LOBBY_FULL', 'Lobby has reached its maximum player count.');
            }

            const now = new Date().toISOString();
            const playerId = crypto.randomUUID();
            const reconnectToken = crypto.randomUUID();
            const displayName = validateDisplayName(command.displayName);

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
            touchLobby(lobby, now);

            await runtimeRepository.saveLobby(lobby);
            await runtimeRepository.bindSocket({
              socketId: socket.id,
              lobbyCode: lobby.code,
              playerId,
            });

            socket.join(lobbyRoom(lobby.code));
            updateSocketReady(socket, {
              lobbyCode: lobby.code,
              playerId,
              sessionId: lobby.sessionId,
            });

            emitLobbyState(namespace, lobby);

            return commandSuccess<LobbyCommandSuccess>({
              lobby: toLobbyView(lobby),
              playerId,
              reconnectToken,
            });
          },
        );
      },
    );

    socket.on(
      SOCKET_EVENTS.client.reconnect,
      async (
        payload: ClientCommandPayloads[typeof SOCKET_EVENTS.client.reconnect],
        ack?: (response: ClientCommandAcks[typeof SOCKET_EVENTS.client.reconnect]) => void,
      ) => {
        await runCommand(
          socket,
          SOCKET_EVENTS.client.reconnect,
          payload,
          ack,
          async (command) => {
            const lobby = await requireLobby(runtimeRepository, command.lobbyCode);
            const { player } = requirePlayerInLobby(lobby, command.playerId);

            if (!player.alive) {
              throw new DomainError('PLAYER_NOT_ALIVE', 'Eliminated players cannot reconnect.', 403);
            }

            if (player.reconnectToken !== command.reconnectToken) {
              throw new DomainError('INVALID_RECONNECT_TOKEN', 'Reconnect token is invalid.', 403);
            }

            const previousBinding = await runtimeRepository.clearPlayerPresence(
              lobby.code,
              player.playerId,
            );

            if (previousBinding && previousBinding.socketId !== socket.id) {
              namespace.sockets.get(previousBinding.socketId)?.disconnect(true);
            }

            const now = new Date().toISOString();
            player.connected = true;
            touchLobby(lobby, now);

            await runtimeRepository.saveLobby(lobby);
            await runtimeRepository.bindSocket({
              socketId: socket.id,
              lobbyCode: lobby.code,
              playerId: player.playerId,
            });

            socket.join(lobbyRoom(lobby.code));

            let sessionId = lobby.sessionId;
            if (sessionId) {
              socket.join(sessionRoom(sessionId));
              const session = await runtimeRepository.getSession(sessionId);

              if (session) {
                const sessionPlayer = session.players[player.playerId];
                if (sessionPlayer) {
                  sessionPlayer.connected = true;
                  session.updatedAt = now;
                }

                const runtimeEvents = await reconcileRuntime(
                  logger,
                  auditRepository,
                  runtimeRepository,
                  lobby,
                  session,
                );

                if (runtimeEvents.length === 0) {
                  await runtimeRepository.saveSession(session);
                }

                emitSessionState(namespace, session);
              } else {
                sessionId = null;
              }
            }

            updateSocketReady(socket, {
              lobbyCode: lobby.code,
              playerId: player.playerId,
              sessionId,
            });

            emitLobbyState(namespace, lobby);

            return commandSuccess<LobbyCommandSuccess>({
              lobby: toLobbyView(lobby),
              playerId: player.playerId,
              reconnectToken: player.reconnectToken,
            });
          },
        );
      },
    );

    socket.on(
      SOCKET_EVENTS.client.leaveLobby,
      async (
        payload: ClientCommandPayloads[typeof SOCKET_EVENTS.client.leaveLobby],
        ack?: (response: ClientCommandAcks[typeof SOCKET_EVENTS.client.leaveLobby]) => void,
      ) => {
        await runCommand(
          socket,
          SOCKET_EVENTS.client.leaveLobby,
          payload,
          ack,
          async (command) => {
            const lobby = await requireLobby(runtimeRepository, command.lobbyCode);
            const { player, playerIndex } = requirePlayerInLobby(lobby, command.playerId);

            if (player.reconnectToken !== command.reconnectToken) {
              throw new DomainError('INVALID_RECONNECT_TOKEN', 'Reconnect token is invalid.', 403);
            }

            await requireBoundSocket(runtimeRepository, socket, lobby.code, player.playerId);

            const now = new Date().toISOString();

            if (lobby.status === LobbyStatus.WAITING) {
              const [removedPlayer] = lobby.players.splice(playerIndex, 1);
              await runtimeRepository.clearPlayerPresence(lobby.code, removedPlayer.playerId);

              socket.leave(lobbyRoom(lobby.code));

              if (lobby.players.length === 0) {
                lobby.status = LobbyStatus.CLOSED;
                assignHost(lobby, null);

                if (lobby.isPublic) {
                  await runtimeRepository.removePublicLobby(lobby.code);
                }
              } else if (removedPlayer.isHost) {
                assignHost(lobby, selectNextHost(lobby.players));
              }

              touchLobby(lobby, now);
              await runtimeRepository.saveLobby(lobby);

              updateSocketReady(socket, {
                lobbyCode: null,
                playerId: null,
                sessionId: null,
              });

              emitLobbyState(namespace, lobby);
              return commandSuccess<{ lobby: null }>({
                lobby: null,
              });
            }

            if (lobby.status !== LobbyStatus.IN_GAME || !lobby.sessionId) {
              throw new DomainError('INVALID_LOBBY_STATE', 'Lobby is not in a valid state for leave.');
            }

            const session = await requireSession(runtimeRepository, lobby.sessionId);
            await reconcileRuntime(
              logger,
              auditRepository,
              runtimeRepository,
              lobby,
              session,
            );

            const eliminationEvents = processElimination(
              session,
              lobby,
              player.playerId,
              now,
              'PLAYER_LEFT',
            );
            markPlayerPermanentlyRemoved(player);
            if (session.players[player.playerId]) {
              session.players[player.playerId].connected = false;
            }

            if (player.isHost) {
              const candidates = lobby.players.filter(
                (candidate) => candidate.playerId !== player.playerId,
              );
              assignHost(lobby, selectNextHost(candidates));
            }

            touchLobby(lobby, now);

            await runtimeRepository.clearPlayerPresence(lobby.code, player.playerId);
            socket.leave(lobbyRoom(lobby.code));
            socket.leave(sessionRoom(session.gameId));

            await runtimeRepository.saveLobby(lobby);
            await runtimeRepository.saveSession(session);
            await persistRuntimeEvents(
              logger,
              auditRepository,
              session.gameId,
              eliminationEvents,
            );

            updateSocketReady(socket, {
              lobbyCode: null,
              playerId: null,
              sessionId: null,
            });

            emitLobbyState(namespace, lobby);
            emitSessionState(namespace, session);

            return commandSuccess<{ lobby: null }>({
              lobby: null,
            });
          },
        );
      },
    );

    socket.on(
      SOCKET_EVENTS.client.kickPlayer,
      async (
        payload: ClientCommandPayloads[typeof SOCKET_EVENTS.client.kickPlayer],
        ack?: (response: ClientCommandAcks[typeof SOCKET_EVENTS.client.kickPlayer]) => void,
      ) => {
        await runCommand(
          socket,
          SOCKET_EVENTS.client.kickPlayer,
          payload,
          ack,
          async (command) => {
            const lobby = await requireLobby(runtimeRepository, command.lobbyCode);
            const { player: actor } = requirePlayerInLobby(lobby, command.actorPlayerId);

            if (actor.reconnectToken !== command.reconnectToken) {
              throw new DomainError('INVALID_RECONNECT_TOKEN', 'Reconnect token is invalid.', 403);
            }

            await requireBoundSocket(runtimeRepository, socket, lobby.code, actor.playerId);

            if (!actor.isHost) {
              throw new DomainError('NOT_HOST', 'Only the host can kick players.', 403);
            }

            if (command.targetPlayerId === actor.playerId) {
              throw new DomainError('INVALID_TARGET', 'Host cannot kick themselves.');
            }

            const { player: target, playerIndex } = requirePlayerInLobby(lobby, command.targetPlayerId);
            const now = new Date().toISOString();

            if (lobby.status === LobbyStatus.WAITING) {
              lobby.players.splice(playerIndex, 1);

              const targetBinding = await runtimeRepository.clearPlayerPresence(
                lobby.code,
                target.playerId,
              );

              if (targetBinding) {
                namespace.sockets.get(targetBinding.socketId)?.disconnect(true);
              }

              touchLobby(lobby, now);
              await runtimeRepository.saveLobby(lobby);
              emitLobbyState(namespace, lobby);

              return commandSuccess<{ lobby: ReturnType<typeof toLobbyView> }>({
                lobby: toLobbyView(lobby),
              });
            }

            if (lobby.status !== LobbyStatus.IN_GAME || !lobby.sessionId) {
              throw new DomainError('INVALID_LOBBY_STATE', 'Lobby is not in a valid state for kick.');
            }

            const session = await requireSession(runtimeRepository, lobby.sessionId);
            await reconcileRuntime(
              logger,
              auditRepository,
              runtimeRepository,
              lobby,
              session,
            );

            const eliminationEvents = processElimination(
              session,
              lobby,
              target.playerId,
              now,
              'PLAYER_KICKED',
            );
            markPlayerPermanentlyRemoved(target);
            if (session.players[target.playerId]) {
              session.players[target.playerId].connected = false;
            }

            if (target.isHost) {
              const hostCandidates = lobby.players.filter(
                (candidate) => candidate.playerId !== target.playerId,
              );
              assignHost(lobby, selectNextHost(hostCandidates));
            }

            touchLobby(lobby, now);

            const targetBinding = await runtimeRepository.clearPlayerPresence(
              lobby.code,
              target.playerId,
            );

            if (targetBinding) {
              namespace.sockets.get(targetBinding.socketId)?.disconnect(true);
            }

            await runtimeRepository.saveLobby(lobby);
            await runtimeRepository.saveSession(session);
            await persistRuntimeEvents(
              logger,
              auditRepository,
              session.gameId,
              eliminationEvents,
            );

            emitLobbyState(namespace, lobby);
            emitSessionState(namespace, session);

            return commandSuccess<{ lobby: ReturnType<typeof toLobbyView> }>({
              lobby: toLobbyView(lobby),
            });
          },
        );
      },
    );

    socket.on(
      SOCKET_EVENTS.client.startGame,
      async (
        payload: ClientCommandPayloads[typeof SOCKET_EVENTS.client.startGame],
        ack?: (response: ClientCommandAcks[typeof SOCKET_EVENTS.client.startGame]) => void,
      ) => {
        await runCommand(
          socket,
          SOCKET_EVENTS.client.startGame,
          payload,
          ack,
          async (command) => {
            const lobby = await requireLobby(runtimeRepository, command.lobbyCode);
            const { player: actor } = requirePlayerInLobby(lobby, command.actorPlayerId);

            if (actor.reconnectToken !== command.reconnectToken) {
              throw new DomainError('INVALID_RECONNECT_TOKEN', 'Reconnect token is invalid.', 403);
            }

            await requireBoundSocket(runtimeRepository, socket, lobby.code, actor.playerId);

            if (!actor.isHost) {
              throw new DomainError('NOT_HOST', 'Only the host can start the game.', 403);
            }

            if (lobby.status !== LobbyStatus.WAITING) {
              throw new DomainError('LOBBY_NOT_WAITING', 'Only waiting lobbies can start the game.');
            }

            if (lobby.players.length < lobby.settings.minPlayers) {
              throw new DomainError(
                'INSUFFICIENT_PLAYERS',
                `At least ${lobby.settings.minPlayers} players are required to start.`,
              );
            }

            if (lobby.players.length > lobby.settings.maxPlayers) {
              throw new DomainError('TOO_MANY_PLAYERS', 'Lobby exceeds max player count.');
            }

            const now = new Date().toISOString();
            const gameId = crypto.randomUUID();
            const session = buildSessionFromLobby(lobby, gameId, now);
            // Temporary split choice from TechSpec implementation plan; revise after playtest data.
            initializeSessionRuntime(session, lobby.settings, now);

            lobby.status = LobbyStatus.IN_GAME;
            lobby.sessionId = gameId;
            touchLobby(lobby, now);

            await runtimeRepository.saveSession(session);
            await runtimeRepository.saveLobby(lobby);

            if (lobby.isPublic) {
              await runtimeRepository.removePublicLobby(lobby.code);
            }

            try {
              await auditRepository.createGameRecord({
                gameId: session.gameId,
                lobbyCode: lobby.code,
                phase: session.phase,
                cycle: session.cycle,
                players: lobby.players.map((player) => ({
                  playerId: player.playerId,
                  displayName: player.displayName,
                  alive: player.alive,
                  isHost: player.isHost,
                  roleId: null,
                  team: session.players[player.playerId]?.team ?? null,
                })),
              });

              await auditRepository.appendSessionEvent({
                gameId: session.gameId,
                type: SystemEventType.GAME_STARTED,
                payload: {
                  lobbyCode: lobby.code,
                  cycle: session.cycle,
                  phase: session.phase,
                },
              });
            } catch (error) {
              logger.error(
                { err: error, gameId: session.gameId },
                'Failed to persist game audit records',
              );
            }

            namespace.in(lobbyRoom(lobby.code)).socketsJoin(sessionRoom(session.gameId));

            emitLobbyState(namespace, lobby);
            emitSessionState(namespace, session);

            return commandSuccess<StartGameSuccess>({
              lobby: toLobbyView(lobby),
              session: toSessionView(session),
            });
          },
        );
      },
    );

    socket.on(
      SOCKET_EVENTS.client.submitIntent,
      async (
        payload: ClientCommandPayloads[typeof SOCKET_EVENTS.client.submitIntent],
        ack?: (response: ClientCommandAcks[typeof SOCKET_EVENTS.client.submitIntent]) => void,
      ) => {
        await runCommand(
          socket,
          SOCKET_EVENTS.client.submitIntent,
          payload,
          ack,
          async (command) => {
            const lobby = await requireLobby(runtimeRepository, command.lobbyCode);
            const { player: actor } = requirePlayerInLobby(lobby, command.playerId);

            if (actor.reconnectToken !== command.reconnectToken) {
              throw new DomainError('INVALID_RECONNECT_TOKEN', 'Reconnect token is invalid.', 403);
            }

            if (lobby.status !== LobbyStatus.IN_GAME || !lobby.sessionId) {
              throw new DomainError('LOBBY_NOT_IN_GAME', 'Lobby is not in an active game.');
            }

            if (command.gameId !== lobby.sessionId) {
              throw new DomainError('SESSION_MISMATCH', 'Game session does not match lobby session.');
            }

            await requireBoundSocket(runtimeRepository, socket, lobby.code, actor.playerId);

            const session = await requireSession(runtimeRepository, command.gameId);
            const runtimeEvents = await reconcileRuntime(
              logger,
              auditRepository,
              runtimeRepository,
              lobby,
              session,
            );

            if (runtimeEvents.length > 0) {
              emitLobbyState(namespace, lobby);
              emitSessionState(namespace, session);
            }

            if (!session.players[actor.playerId]) {
              throw new DomainError('PLAYER_NOT_FOUND', 'Player is not part of the active session.', 404);
            }

            if (session.status !== SessionStatus.ACTIVE) {
              throw new DomainError('GAME_NOT_ACTIVE', 'Cannot accept intents after game completion.', 409);
            }

            if (!session.players[actor.playerId].alive) {
              throw new DomainError('PLAYER_NOT_ALIVE', 'Eliminated players cannot submit intents.', 403);
            }

            if (command.intent.type === IntentType.SEND_MESSAGE) {
              throw new DomainError(
                'NOT_IMPLEMENTED',
                'SEND_MESSAGE is intentionally not implemented in this milestone.',
              );
            }

            if (
              command.intent.type !== IntentType.SUBMIT_VOTE
              && command.intent.type !== IntentType.SUBMIT_NIGHT_ACTION
            ) {
              throw new DomainError('INVALID_INTENT_TYPE', 'Intent type is not supported.');
            }

            if (!isIntentAllowedInPhase(command.intent.type, session.phase)) {
              throw new DomainError(
                'INTENT_NOT_ALLOWED_IN_PHASE',
                `Intent ${command.intent.type} is not allowed in phase ${session.phase}.`,
              );
            }

            const intentPayload = resolveIntentPayload(command.intent.type, command.intent.payload);

            if (command.intent.type === IntentType.SUBMIT_VOTE) {
              const votePayload = intentPayload as VoteIntentPayload;
              if (votePayload.targetPlayerId !== null) {
                const target = session.players[votePayload.targetPlayerId];
                if (!target || !target.alive) {
                  throw new DomainError('INVALID_VOTE_TARGET', 'Vote target must be an alive player.');
                }
              }
            }

            const now = new Date().toISOString();
            const appendResult = appendIntent(session, {
              playerId: actor.playerId,
              type: command.intent.type,
              payload: intentPayload,
              phase: session.phase,
              cycle: session.cycle,
              createdAt: now,
            });

            if (!appendResult.accepted) {
              throw new DomainError(
                'VOTE_ALREADY_SUBMITTED',
                'Only one vote submission is allowed per alive player each cycle.',
              );
            }

            session.updatedAt = now;
            await runtimeRepository.saveSession(session);
            emitSessionState(namespace, session);

            return commandSuccess<SubmitIntentSuccess>({
              acceptedIntentId: appendResult.intent.id,
              session: toSessionView(session),
            });
          },
        );
      },
    );

    socket.on(
      SOCKET_EVENTS.client.listPublicLobbies,
      async (
        _payload: ClientCommandPayloads[typeof SOCKET_EVENTS.client.listPublicLobbies],
        ack?: (response: ClientCommandAcks[typeof SOCKET_EVENTS.client.listPublicLobbies]) => void,
      ) => {
        await runCommand(
          socket,
          SOCKET_EVENTS.client.listPublicLobbies,
          _payload,
          ack,
          async () => {
            const lobbies = await runtimeRepository.listPublicLobbies();

            const items = lobbies.map((lobby) => {
              const host = lobby.players.find((p) => p.playerId === lobby.hostPlayerId);

              return {
                code: lobby.code,
                hostDisplayName: host?.displayName ?? 'Unknown',
                playerCount: lobby.players.filter((p) => p.alive).length,
                maxPlayers: lobby.settings.maxPlayers,
              };
            });

            return commandSuccess({ lobbies: items });
          },
        );
      },
    );

    socket.on('disconnect', async () => {
      try {
        const binding = await runtimeRepository.clearSocket(socket.id);

        if (!binding) {
          return;
        }

        const lobby = await runtimeRepository.getLobby(binding.lobbyCode);

        if (!lobby) {
          return;
        }

        const player = lobby.players.find(
          (lobbyPlayer) => lobbyPlayer.playerId === binding.playerId,
        );

        if (!player) {
          return;
        }

        const now = new Date().toISOString();
        player.connected = false;
        touchLobby(lobby, now);

        await runtimeRepository.saveLobby(lobby);
        emitLobbyState(namespace, lobby);

        if (!lobby.sessionId) {
          return;
        }

        const session = await runtimeRepository.getSession(lobby.sessionId);

        if (!session) {
          return;
        }

        const sessionPlayer = session.players[player.playerId];

        if (!sessionPlayer) {
          return;
        }

        sessionPlayer.connected = false;
        session.updatedAt = now;

        await runtimeRepository.saveSession(session);
        emitSessionState(namespace, session);
      } catch (error) {
        logger.error({ err: error, socketId: socket.id }, 'Disconnect cleanup failed');
      }
    });
  });

  return namespace;
}
