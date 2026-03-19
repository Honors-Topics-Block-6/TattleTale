import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';

export interface DependencyHealthSummary {
  ok: boolean;
  checks: {
    postgres: 'ok' | 'error';
    redis: 'ok' | 'error';
  };
}

export function createDependencyHealthChecker(
  prisma: PrismaClient,
  redis: Redis,
) {
  return {
    async check(): Promise<DependencyHealthSummary> {
      let postgres: 'ok' | 'error' = 'ok';
      let redisStatus: 'ok' | 'error' = 'ok';

      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        postgres = 'error';
      }

      try {
        if (redis.status !== 'ready') {
          await redis.connect();
        }

        await redis.ping();
      } catch {
        redisStatus = 'error';
      }

      return {
        ok: postgres === 'ok' && redisStatus === 'ok',
        checks: {
          postgres,
          redis: redisStatus,
        },
      };
    },
  };
}
