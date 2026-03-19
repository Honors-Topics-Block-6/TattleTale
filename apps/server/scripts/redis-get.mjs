/**
 * Get or delete Redis keys. Loads REDIS_URL from apps/server/.env.
 * Use when redis-cli is not installed.
 *
 * Usage:
 *   node scripts/redis-get.mjs <key>                    → GET key
 *   node scripts/redis-get.mjs del <key>                → DEL key
 *   node scripts/redis-get.mjs del-pattern <pattern>     → SCAN + DEL all matching
 *
 * Examples:
 *   node scripts/redis-get.mjs lobby:ABC123
 *   node scripts/redis-get.mjs del lobby:ABC123
 *   node scripts/redis-get.mjs del-pattern "presence:player:RQQQZK:*"
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Redis from 'ioredis';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

const arg1 = process.argv[2];
const arg2 = process.argv[3];
const isDel = arg1 === 'del';
const isDelPattern = arg1 === 'del-pattern';
const key = isDelPattern ? arg2 : (isDel ? arg2 : arg1);

if (!key || (isDel && !arg2) || (isDelPattern && !arg2)) {
  console.error('Usage: node scripts/redis-get.mjs [del | del-pattern] <key-or-pattern>');
  console.error('  get:   node scripts/redis-get.mjs lobby:ABC123');
  console.error('  del:   node scripts/redis-get.mjs del lobby:ABC123');
  console.error('  pattern: node scripts/redis-get.mjs del-pattern "presence:player:CODE:*"');
  process.exitCode = 1;
  process.exit(1);
}

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error('REDIS_URL not set (e.g. in apps/server/.env)');
  process.exitCode = 1;
  process.exit(1);
}

const redis = new Redis(redisUrl);

async function main() {
  try {
    if (isDelPattern) {
      const keys = [];
      const stream = redis.scanStream({ match: key, count: 100 });
      for await (const batch of stream) {
        keys.push(...batch);
      }
      if (keys.length === 0) {
        console.log(`No keys matched pattern "${key}".`);
        return;
      }
      const n = await redis.del(...keys);
      console.log(`Deleted ${n} key(s) matching "${key}".`);
      return;
    }
    if (isDel) {
      const n = await redis.del(key);
      console.log(n ? `Deleted "${key}" (${n} key(s)).` : `Key "${key}" did not exist.`);
      return;
    }
    const value = await redis.get(key);
    if (value === null) {
      console.log('(nil)');
      return;
    }
    try {
      const parsed = JSON.parse(value);
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log(value);
    }
  } finally {
    redis.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
