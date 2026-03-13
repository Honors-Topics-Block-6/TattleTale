import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { attachDisconnectHandler, attachIntentHandler } from './session/intents.js';
import { pushSystemEvent } from './session/events.js';
import {
  getAdminSessionSnapshots,
  getPresenceSnapshot,
  getSession,
  removePlayerFromSession,
} from './session/state.js';

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

const app = Fastify({ logger: true });
await app.register(cors, {
  origin: clientOrigin,
  credentials: true,
});

app.get('/health', async () => ({ ok: true, service: 'tattletale-chat-server' }));

function isAdminAuthorized(headerValue: string | string[] | undefined): boolean {
  if (Array.isArray(headerValue)) {
    return headerValue.includes(adminPassword);
  }
  return headerValue === adminPassword;
}

app.get('/admin/sessions', async (request, reply) => {
  if (!isAdminAuthorized(request.headers['x-admin-password'])) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  return { sessions: getAdminSessionSnapshots() };
});

app.delete<{
  Params: { sessionId: string; playerId: string };
}>('/admin/sessions/:sessionId/users/:playerId', async (request, reply) => {
  if (!isAdminAuthorized(request.headers['x-admin-password'])) {
    return reply.status(401).send({ message: 'Unauthorized' });
  }

  const { sessionId, playerId } = request.params;
  const session = getSession(sessionId);
  if (!session) {
    return reply.status(404).send({ message: 'Session not found.' });
  }

  const removedPlayer = removePlayerFromSession(session, playerId);
  if (!removedPlayer) {
    return reply.status(404).send({ message: 'User not found.' });
  }

  if (removedPlayer.socketId) {
    io.sockets.sockets.get(removedPlayer.socketId)?.disconnect(true);
  }

  const event = pushSystemEvent(
    session.systemEvents,
    'PLAYER_REMOVED_BY_ADMIN',
    `${removedPlayer.name} was removed by admin.`
  );
  io.to(`session:${session.id}`).emit('system.event', event);
  io.to(`session:${session.id}`).emit('user.presence', {
    users: getPresenceSnapshot(session),
  });

  return {
    ok: true,
    removed: { id: removedPlayer.id, name: removedPlayer.name, sessionId: session.id },
  };
});

const io = new Server(app.server, {
  cors: {
    origin: clientOrigin,
    credentials: true,
  },
});

io.on('connection', (socket) => {
  attachIntentHandler(io, socket);
  attachDisconnectHandler(io, socket);
});

try {
  await app.listen({ port, host });
  app.log.info(`Chat server listening on ${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
