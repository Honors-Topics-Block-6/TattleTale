import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';

describe('createApp', () => {
  it('serves health and ready endpoints', async () => {
    const { fastify } = await createApp({
      config: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: 0,
        LOG_LEVEL: 'silent',
        WEB_ORIGIN: 'http://localhost:5173',
        TRUST_PROXY: true,
        ENABLE_STATIC_WEB: false,
        STATIC_WEB_DIR: undefined,
        ENABLE_PLAYTEST_ROUTES: true,
        SHUTDOWN_TIMEOUT_MS: 10000,
        CHAT_MAX_LENGTH: 500,
        CHAT_RATE_LIMIT_WINDOW_MS: 5000,
        CHAT_RATE_LIMIT_MAX_MESSAGES: 8,
        DATABASE_URL: 'postgresql://localhost:5432/tattletale',
        DIRECT_URL: undefined,
        REDIS_URL: 'redis://localhost:6379',
      },
      prisma: {} as never,
      redis: {} as never,
      healthChecker: {
        async check() {
          return {
            ok: true,
            checks: {
              postgres: 'ok' as const,
              redis: 'ok' as const,
            },
          };
        },
      },
    });

    const healthResponse = await fastify.inject({
      method: 'GET',
      url: '/health',
    });
    const readyResponse = await fastify.inject({
      method: 'GET',
      url: '/ready',
    });
    const playtestResponse = await fastify.inject({
      method: 'GET',
      url: '/playtest',
    });

    expect(healthResponse.statusCode).toBe(200);
    expect(readyResponse.statusCode).toBe(200);
    expect(playtestResponse.statusCode).toBe(200);
    expect(playtestResponse.headers['content-type']).toContain('text/html');

    await fastify.close();
  });
});
