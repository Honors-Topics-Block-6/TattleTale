import {
  SOCKET_EVENTS,
  SOCKET_NAMESPACE,
  type ClientCommandAcks,
  type CommandFailure,
} from '@tattletale/shared';
import type { FastifyBaseLogger } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';

function notImplementedResponse(): CommandFailure {
  return {
    ok: false as const,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Lobby and game runtime flows are not implemented in this foundation skeleton.',
    },
  };
}

export function registerFoundationNamespace(
  io: SocketIOServer,
  logger: FastifyBaseLogger,
) {
  const namespace = io.of(SOCKET_NAMESPACE);
  const clientEvents = Object.values(
    SOCKET_EVENTS.client,
  ) as Array<keyof ClientCommandAcks>;

  namespace.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'Socket connected to foundation namespace');

    socket.emit(SOCKET_EVENTS.server.ready, {
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
