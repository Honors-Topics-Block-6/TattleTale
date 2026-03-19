import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';

const querySchema = z.object({
  deviceId: z.string().uuid(),
});

const installSchema = z.object({
  deviceId: z.string().uuid(),
  appId: z.string().min(1).max(64),
});

function keyForDevice(deviceId: string): string {
  return `store:installed-apps:${deviceId}`;
}

export async function registerStoreRoutes(
  fastify: FastifyInstance,
  redis: Redis,
): Promise<void> {
  fastify.get('/store/installed-apps', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return {
        ok: false,
        error: {
          code: 'INVALID_QUERY',
          message: 'deviceId must be a valid UUID.',
        },
      };
    }

    const { deviceId } = parsed.data;
    const appIds = await redis.smembers(keyForDevice(deviceId));

    return {
      ok: true,
      deviceId,
      installedAppIds: appIds,
    };
  });

  fastify.post('/store/install', async (request, reply) => {
    const parsed = installSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        ok: false,
        error: {
          code: 'INVALID_BODY',
          message: 'deviceId (uuid) and appId (string) are required.',
        },
      };
    }

    const { deviceId, appId } = parsed.data;
    const key = keyForDevice(deviceId);
    await redis.sadd(key, appId);

    const installedAppIds = await redis.smembers(key);
    return {
      ok: true,
      deviceId,
      installedAppIds,
    };
  });
}

