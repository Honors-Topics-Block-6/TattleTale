import cors from '@fastify/cors';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import Fastify, { type FastifyInstance } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';

import type { AppConfig } from './config/env.js';
import { PrismaGameAuditRepository } from './infra/persistence/prisma-game-audit-repository.js';
import { RedisRuntimeRepository } from './infra/persistence/redis-runtime-repository.js';
import { registerOperationalRoutes, type HealthChecker } from './transport/http/register-operational-routes.js';
import { registerStoreRoutes } from './transport/http/register-store-routes.js';
import { registerWebRoutes } from './transport/http/register-web-routes.js';
import { registerFoundationNamespace } from './transport/socket/register-foundation-namespace.js';

export interface AppDependencies {
  config: AppConfig;
  prisma: PrismaClient;
  redis: Redis;
  healthChecker: HealthChecker;
}

export interface AppWithRealtime {
  fastify: FastifyInstance;
  io: SocketIOServer;
}

function parseWebOrigins(input: string): string[] {
  return input
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export async function createApp(
  dependencies: AppDependencies,
): Promise<AppWithRealtime> {
  const webOrigins = parseWebOrigins(dependencies.config.WEB_ORIGIN);
  if (webOrigins.length === 0) {
    throw new Error('WEB_ORIGIN must include at least one origin.');
  }

  const fastify = Fastify({
    trustProxy: dependencies.config.TRUST_PROXY,
    logger: {
      level: dependencies.config.LOG_LEVEL,
    },
  });

  await fastify.register(cors, {
    origin: webOrigins,
    credentials: true,
  });

  await registerOperationalRoutes(fastify, dependencies.healthChecker);
  await registerStoreRoutes(fastify, dependencies.redis);
  await registerWebRoutes(fastify, {
    enableStaticWeb: dependencies.config.ENABLE_STATIC_WEB,
    staticWebDir: dependencies.config.STATIC_WEB_DIR,
    enablePlaytestRoutes: dependencies.config.ENABLE_PLAYTEST_ROUTES,
  });

  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: webOrigins,
      credentials: true,
    },
  });

  registerFoundationNamespace(io, fastify.log, {
    runtimeRepository: new RedisRuntimeRepository(dependencies.redis),
    auditRepository: new PrismaGameAuditRepository(dependencies.prisma),
    chatConfig: {
      maxLength: dependencies.config.CHAT_MAX_LENGTH,
      rateLimitWindowMs: dependencies.config.CHAT_RATE_LIMIT_WINDOW_MS,
      rateLimitMaxMessages: dependencies.config.CHAT_RATE_LIMIT_MAX_MESSAGES,
    },
  });

  fastify.addHook('onClose', async () => {
    io.close();
  });

  return {
    fastify,
    io,
  };
}
