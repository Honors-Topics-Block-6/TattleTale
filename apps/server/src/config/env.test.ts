import { describe, expect, it } from 'vitest';

import { loadConfig } from './env.js';

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://localhost:5432/tattletale',
      REDIS_URL: 'redis://localhost:6379',
    });

    expect(config.PORT).toBe(3001);
    expect(config.WEB_ORIGIN).toBe('http://localhost:5173');
    expect(config.TRUST_PROXY).toBe(true);
    expect(config.ENABLE_STATIC_WEB).toBe(false);
    expect(config.ENABLE_PLAYTEST_ROUTES).toBe(true);
    expect(config.CHAT_MAX_LENGTH).toBe(500);
  });

  it('rejects invalid ports', () => {
    expect(() =>
      loadConfig({
        PORT: '99999',
        DATABASE_URL: 'postgresql://localhost:5432/tattletale',
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toThrow();
  });

  it('parses boolean and numeric overrides', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://localhost:5432/tattletale',
      REDIS_URL: 'redis://localhost:6379',
      TRUST_PROXY: 'false',
      ENABLE_STATIC_WEB: 'true',
      ENABLE_PLAYTEST_ROUTES: '0',
      CHAT_MAX_LENGTH: '1024',
      CHAT_RATE_LIMIT_WINDOW_MS: '4000',
      CHAT_RATE_LIMIT_MAX_MESSAGES: '3',
      SHUTDOWN_TIMEOUT_MS: '15000',
    });

    expect(config.TRUST_PROXY).toBe(false);
    expect(config.ENABLE_STATIC_WEB).toBe(true);
    expect(config.ENABLE_PLAYTEST_ROUTES).toBe(false);
    expect(config.CHAT_MAX_LENGTH).toBe(1024);
    expect(config.CHAT_RATE_LIMIT_WINDOW_MS).toBe(4000);
    expect(config.CHAT_RATE_LIMIT_MAX_MESSAGES).toBe(3);
    expect(config.SHUTDOWN_TIMEOUT_MS).toBe(15000);
  });
});
