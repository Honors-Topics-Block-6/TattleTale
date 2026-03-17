import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';

import type { AppConfig } from './config/env.js';
import type { GameAuditRepository, RuntimeRepository } from './domain/repositories.js';
import { registerOperationalRoutes, type HealthChecker } from './transport/http/register-operational-routes.js';
import { registerFoundationNamespace } from './transport/socket/register-foundation-namespace.js';

export interface AppDependencies {
  config: AppConfig;
  healthChecker: HealthChecker;
  runtimeRepository: RuntimeRepository;
  auditRepository: GameAuditRepository;
}

export interface AppWithRealtime {
  fastify: FastifyInstance;
  io: SocketIOServer;
}

export async function createApp(
  dependencies: AppDependencies,
): Promise<AppWithRealtime> {
  const fastify = Fastify({
    logger: {
      level: dependencies.config.LOG_LEVEL,
    },
  });

  await fastify.register(cors, {
    origin: dependencies.config.WEB_ORIGIN,
    credentials: true,
  });

  await registerOperationalRoutes(fastify, dependencies.healthChecker);

  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: dependencies.config.WEB_ORIGIN,
      credentials: true,
    },
  });

  registerFoundationNamespace(io, fastify.log, {
    runtimeRepository: dependencies.runtimeRepository,
    auditRepository: dependencies.auditRepository,
  });

  fastify.addHook('onClose', async () => {
    io.close();
  });

  return {
    fastify,
    io,
  };
}
