import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createDependencyHealthChecker } from './infra/persistence/health-check.js';
import { createPrismaClient } from './infra/persistence/prisma-client.js';
import { createRedisClient } from './infra/persistence/redis-client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const prisma = createPrismaClient();
  const redis = createRedisClient(config.REDIS_URL);

  try {
    await redis.connect();
  } catch (error) {
    console.error('[startup] Failed to connect to Redis:', config.REDIS_URL);
    console.error('[startup] Make sure Redis is running: brew services start redis');
    process.exitCode = 1;
    return;
  }

  const { fastify } = await createApp({
    config,
    prisma,
    redis,
    healthChecker: createDependencyHealthChecker(prisma, redis),
  });

  try {
    await fastify.listen({
      host: config.HOST,
      port: config.PORT,
    });
  } catch (error) {
    fastify.log.error({ err: error }, 'Failed to start server');
    await prisma.$disconnect();
    redis.disconnect();
    process.exitCode = 1;
    return;
  }

  const shutdown = async () => {
    await fastify.close();
    await prisma.$disconnect();
    redis.disconnect();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void main();
