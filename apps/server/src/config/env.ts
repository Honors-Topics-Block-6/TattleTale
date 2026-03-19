import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

loadDotEnv();

const envBoolean = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  WEB_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  TRUST_PROXY: envBoolean.default(true),
  ENABLE_STATIC_WEB: envBoolean.default(false),
  STATIC_WEB_DIR: z.string().trim().optional(),
  ENABLE_PLAYTEST_ROUTES: envBoolean.default(true),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(10_000),
  CHAT_MAX_LENGTH: z.coerce.number().int().min(1).max(4000).default(500),
  CHAT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(250).max(60_000).default(5000),
  CHAT_RATE_LIMIT_MAX_MESSAGES: z.coerce.number().int().min(1).max(100).default(8),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}
