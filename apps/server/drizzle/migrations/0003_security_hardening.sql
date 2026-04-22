-- Revoke all existing sessions (plaintext tokens cannot be rehashed; clients re-login)
UPDATE user_sessions SET revoked_at = datetime('now') WHERE revoked_at IS NULL;
--> statement-breakpoint

-- Replace plaintext token column with SHA-256 hash (C2)
ALTER TABLE user_sessions ADD COLUMN token_hash text;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_sessions_token_hash` ON `user_sessions` (`token_hash`) WHERE token_hash IS NOT NULL;
--> statement-breakpoint

-- Short-lived WS auth tickets so the DO can receive a server-verified accountId (C1)
CREATE TABLE `ws_tickets` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL,
  `used` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ws_tickets_expires` ON `ws_tickets` (`expires_at`);
--> statement-breakpoint

-- Per-IP rate limits for auth endpoints (C4)
CREATE TABLE `auth_rate_limits` (
  `ip` text NOT NULL,
  `action` text NOT NULL,
  `window_start` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
  PRIMARY KEY (`ip`, `action`, `window_start`)
);
