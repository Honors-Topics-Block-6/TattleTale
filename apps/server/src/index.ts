import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createDependencyHealthChecker } from './infra/persistence/health-check.js';
import {
  InMemoryAuditRepository,
  InMemoryRuntimeRepository,
} from './infra/persistence/in-memory-repositories.js';
import { createPrismaClient } from './infra/persistence/prisma-client.js';
import { PrismaGameAuditRepository } from './infra/persistence/prisma-game-audit-repository.js';
import { createRedisClient } from './infra/persistence/redis-client.js';
import { RedisRuntimeRepository } from './infra/persistence/redis-runtime-repository.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const hasExternalDependencies = Boolean(config.DATABASE_URL && config.REDIS_URL);

  let prisma: ReturnType<typeof createPrismaClient> | null = null;
  let redis: ReturnType<typeof createRedisClient> | null = null;

  if (hasExternalDependencies) {
    prisma = createPrismaClient();
    redis = createRedisClient(config.REDIS_URL as string);
    await redis.connect();
  }

  const runtimeRepository = hasExternalDependencies
    ? new RedisRuntimeRepository(redis as NonNullable<typeof redis>)
    : new InMemoryRuntimeRepository();
  const auditRepository = hasExternalDependencies
    ? new PrismaGameAuditRepository(prisma as NonNullable<typeof prisma>)
    : new InMemoryAuditRepository();
  const healthChecker = hasExternalDependencies
    ? createDependencyHealthChecker(
      prisma as NonNullable<typeof prisma>,
      redis as NonNullable<typeof redis>,
    )
    : {
      async check() {
        return {
          ok: true,
          checks: {
            postgres: 'ok' as const,
            redis: 'ok' as const,
          },
        };
      },
    };

  const { fastify } = await createApp({
    config,
    healthChecker,
    runtimeRepository,
    auditRepository,
  });

  if (!hasExternalDependencies) {
    fastify.log.warn(
      'DATABASE_URL/REDIS_URL not set; running in local in-memory mode (non-persistent).',
    );
  }

  try {
    await fastify.listen({
      host: config.HOST,
      port: config.PORT,
    });
  } catch (error) {
    fastify.log.error({ err: error }, 'Failed to start server');
    await prisma?.$disconnect();
    redis?.disconnect();
    process.exitCode = 1;
    return;
  }

  const shutdown = async () => {
    await fastify.close();
    await prisma?.$disconnect();
    redis?.disconnect();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
