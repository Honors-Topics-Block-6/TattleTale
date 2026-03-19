import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';

import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createDependencyHealthChecker } from './infra/persistence/health-check.js';
import { createPrismaClient } from './infra/persistence/prisma-client.js';
import { createRedisClient } from './infra/persistence/redis-client.js';

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function closeRedisWithTimeout(
  redis: Redis,
  timeoutMs: number,
): Promise<void> {
  if (redis.status === 'end') {
    return;
  }

  try {
    await withTimeout(redis.quit(), timeoutMs, 'redis.quit');
  } catch {
    redis.disconnect();
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const prisma = createPrismaClient();
  const redis = createRedisClient(config.REDIS_URL);
  let fastify: FastifyInstance | null = null;
  let shutdownPromise: Promise<void> | null = null;

  async function shutdown(reason: string, error?: unknown): Promise<void> {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      if (fastify) {
        if (error) {
          fastify.log.error({ err: error, reason }, 'Shutting down due to fatal error');
        } else {
          fastify.log.info({ reason }, 'Shutting down server');
        }
      } else if (error) {
        console.error('Fatal startup error', { reason, err: error });
      }

      const timeoutMs = config.SHUTDOWN_TIMEOUT_MS;

      try {
        if (fastify) {
          await withTimeout(fastify.close(), timeoutMs, 'fastify.close');
        }
      } catch (shutdownError) {
        if (fastify) {
          fastify.log.error({ err: shutdownError }, 'Fastify shutdown failed');
        } else {
          console.error('Fastify shutdown failed', shutdownError);
        }
      }

      try {
        await withTimeout(prisma.$disconnect(), timeoutMs, 'prisma.$disconnect');
      } catch (shutdownError) {
        if (fastify) {
          fastify.log.error({ err: shutdownError }, 'Prisma disconnect failed');
        } else {
          console.error('Prisma disconnect failed', shutdownError);
        }
      }

      await closeRedisWithTimeout(redis, timeoutMs);
    })();

    return shutdownPromise;
  }

  try {
    await withTimeout(redis.connect(), config.SHUTDOWN_TIMEOUT_MS, 'redis.connect');

    const appBundle = await createApp({
      config,
      prisma,
      redis,
      healthChecker: createDependencyHealthChecker(prisma, redis),
    });
    fastify = appBundle.fastify;

    await fastify.listen({
      host: config.HOST,
      port: config.PORT,
    });

    fastify.log.info(
      {
        host: config.HOST,
        port: config.PORT,
        nodeEnv: config.NODE_ENV,
      },
      'Server started',
    );
  } catch (error) {
    await shutdown('startup', error);
    process.exitCode = 1;
    return;
  }

  const signalHandler = (signal: NodeJS.Signals) => {
    void shutdown(signal).finally(() => {
      process.exitCode = 0;
    });
  };

  process.on('SIGINT', signalHandler);
  process.on('SIGTERM', signalHandler);
  process.on('uncaughtException', (error) => {
    void shutdown('uncaughtException', error).finally(() => {
      process.exitCode = 1;
    });
  });
  process.on('unhandledRejection', (reason) => {
    void shutdown('unhandledRejection', reason).finally(() => {
      process.exitCode = 1;
    });
  });
}

void main();
