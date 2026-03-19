import {
  LobbyStatus,
  SOCKET_EVENTS,
  SOCKET_NAMESPACE,
  SystemEventType,
  type ClientCommandAcks,
  type ClientCommandPayloads,
  type CommandFailure,
  type LobbyCommandSuccess,
  type StartGameSuccess,
} from '@tattletale/shared';
import type { FastifyBaseLogger } from 'fastify';
import { Server as SocketIOServer, type Socket } from 'socket.io';

import { DomainError } from '../../domain/errors.js';
import { applyFirstNightAfterGameStart } from '../../domain/game/night-cycle.js';
import { buildSessionFromLobby } from '../../domain/game/session-domain.js';
import type { GameState } from '../../domain/game/types.js';
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
import { toLobbyView, toSessionViewForPlayer } from '../../domain/projections.js';
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
      message: 'Lobby and game runtime flows are not implemented in this foundation skeleton.',
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

async function emitSessionStateToParticipants(
  namespace: ReturnType<SocketIOServer['of']>,
  runtimeRepository: RuntimeRepository,
  session: GameState,
): Promise<void> {
  const roomName = sessionRoom(session.gameId);
  const socketIds = namespace.adapter.rooms.get(roomName);
  if (!socketIds || socketIds.size === 0) {
    return;
  }

  for (const socketId of socketIds) {
    const binding = await runtimeRepository.getPresenceBySocket(socketId);
    const viewerPlayerId = binding?.playerId ?? null;
    namespace.to(socketId).emit(
      SOCKET_EVENTS.server.sessionState,
      toSessionViewForPlayer(session, viewerPlayerId),
    );
  }
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

function removePlayerFromSession(session: GameState, playerId: string, now: string): void {
  const sessionPlayer = session.players[playerId];

  if (sessionPlayer) {
    sessionPlayer.alive = false;
    sessionPlayer.connected = false;
  }

  for (const channel of Object.values(session.channels)) {
    channel.members = channel.members.filter((memberId) => memberId !== playerId);
  }

  session.updatedAt = now;
}

function touchLobby(lobby: LobbyState, now: string): void {
  lobby.updatedAt = now;
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
              createdAt: now,
              updatedAt: now,
            };

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
                  await runtimeRepository.saveSession(session);
                }

                await emitSessionStateToParticipants(namespace, runtimeRepository, session);
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

            const session = await runtimeRepository.getSession(lobby.sessionId);

            if (!session) {
              throw new DomainError('SESSION_NOT_FOUND', 'Active session was not found.', 404);
            }

            markPlayerPermanentlyRemoved(player);
            removePlayerFromSession(session, player.playerId, now);

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

            updateSocketReady(socket, {
              lobbyCode: null,
              playerId: null,
              sessionId: null,
            });

            emitLobbyState(namespace, lobby);
            await emitSessionStateToParticipants(namespace, runtimeRepository, session);

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

            const session = await runtimeRepository.getSession(lobby.sessionId);

            if (!session) {
              throw new DomainError('SESSION_NOT_FOUND', 'Active session was not found.', 404);
            }

            markPlayerPermanentlyRemoved(target);
            removePlayerFromSession(session, target.playerId, now);

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

            emitLobbyState(namespace, lobby);
            await emitSessionStateToParticipants(namespace, runtimeRepository, session);

            return commandSuccess<{ lobby: ReturnType<typeof toLobbyView> }>({
              lobby: toLobbyView(lobby),
            });
          },
        );
      },
    );

    socket.on(
      SOCKET_EVENTS.client.setLobbyReady,
      async (
        payload: ClientCommandPayloads[typeof SOCKET_EVENTS.client.setLobbyReady],
        ack?: (response: ClientCommandAcks[typeof SOCKET_EVENTS.client.setLobbyReady]) => void,
      ) => {
        await runCommand(
          socket,
          SOCKET_EVENTS.client.setLobbyReady,
          payload,
          ack,
          async (command) => {
            const lobby = await requireLobby(runtimeRepository, command.lobbyCode);
            const { player } = requirePlayerInLobby(lobby, command.playerId);

            if (player.reconnectToken !== command.reconnectToken) {
              throw new DomainError('INVALID_RECONNECT_TOKEN', 'Reconnect token is invalid.', 403);
            }

            await requireBoundSocket(runtimeRepository, socket, lobby.code, player.playerId);

            if (lobby.status !== LobbyStatus.WAITING) {
              throw new DomainError(
                'LOBBY_NOT_WAITING',
                'Ready state can only be changed while the lobby is waiting.',
              );
            }

            const now = new Date().toISOString();
            player.ready = command.ready;
            touchLobby(lobby, now);

            await runtimeRepository.saveLobby(lobby);
            emitLobbyState(namespace, lobby);

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

            if (!lobby.players.every((lobbyPlayer) => lobbyPlayer.ready)) {
              throw new DomainError(
                'PLAYERS_NOT_READY',
                'All players must be ready before starting the game.',
              );
            }

            const now = new Date().toISOString();
            const gameId = crypto.randomUUID();
            const session = buildSessionFromLobby(lobby, gameId, now);
            applyFirstNightAfterGameStart(session, lobby, now);

            lobby.status = LobbyStatus.IN_GAME;
            lobby.sessionId = gameId;
            touchLobby(lobby, now);

            await runtimeRepository.saveSession(session);
            await runtimeRepository.saveLobby(lobby);

            try {
              await auditRepository.createGameRecord({
                gameId: session.gameId,
                lobbyCode: lobby.code,
                phase: session.phase,
                cycle: session.cycle,
                players: Object.values(session.players).map((sessionPlayer) => {
                  const lobbyPlayer = lobby.players.find(
                    (entry) => entry.playerId === sessionPlayer.playerId,
                  );
                  return {
                    playerId: sessionPlayer.playerId,
                    displayName: sessionPlayer.displayName,
                    alive: sessionPlayer.alive,
                    isHost: lobbyPlayer?.isHost ?? false,
                    roleId: sessionPlayer.roleId,
                    team: sessionPlayer.team,
                  };
                }),
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
            await emitSessionStateToParticipants(namespace, runtimeRepository, session);

            return commandSuccess<StartGameSuccess>({
              lobby: toLobbyView(lobby),
              session: toSessionViewForPlayer(session, actor.playerId),
            });
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
        await emitSessionStateToParticipants(namespace, runtimeRepository, session);
      } catch (error) {
        logger.error({ err: error, socketId: socket.id }, 'Disconnect cleanup failed');
      }
    });
  });

  return namespace;
}
