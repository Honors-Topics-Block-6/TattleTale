import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { attachDisconnectHandler, attachIntentHandler } from './session/intents.js';

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const app = Fastify({ logger: true });
await app.register(cors, {
  origin: clientOrigin,
  credentials: true,
});

app.get('/health', async () => ({ ok: true, service: 'tattletale-chat-server' }));

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
