-- Remove the obsolete plaintext `token` column on `user_sessions`.
-- Migration 0003 introduced `token_hash` (SHA-256) and revoked all existing
-- sessions so nothing downstream still reads the plaintext column. The code
-- in router.ts already writes an empty string on insert and never reads it.
-- Drop the uniqueness index first, then the column itself.
DROP INDEX IF EXISTS `idx_user_sessions_token`;
--> statement-breakpoint
ALTER TABLE `user_sessions` DROP COLUMN `token`;
