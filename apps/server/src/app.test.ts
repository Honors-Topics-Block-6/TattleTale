import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import type { GameAuditRepository, RuntimeRepository } from './domain/repositories.js';

const stubRuntimeRepository: RuntimeRepository = {
  async lobbyCodeExists() {
    return false;
  },
  async getLobby() {
    return null;
  },
  async saveLobby() {},
  async getSession() {
    return null;
  },
  async saveSession() {},
  async bindSocket() {},
  async getPresenceBySocket() {
    return null;
  },
  async clearSocket() {
    return null;
  },
  async clearPlayerPresence() {
    return null;
  },
};

const stubAuditRepository: GameAuditRepository = {
  async createGameRecord() {},
  async appendSessionEvent() {},
  async appendMessageAudit() {},
};

describe('createApp', () => {
  it('serves health and ready endpoints', async () => {
    const { fastify } = await createApp({
      config: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: 0,
        LOG_LEVEL: 'silent',
        WEB_ORIGIN: 'http://localhost:5173',
        DATABASE_URL: 'postgresql://localhost:5432/tattletale',
        REDIS_URL: 'redis://localhost:6379',
      },
      runtimeRepository: stubRuntimeRepository,
      auditRepository: stubAuditRepository,
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

    expect(healthResponse.statusCode).toBe(200);
    expect(readyResponse.statusCode).toBe(200);

    await fastify.close();
  });
});
