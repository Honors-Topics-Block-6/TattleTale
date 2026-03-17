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
});
