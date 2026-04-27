-- Drop the unused `user_points` table created in 0001.
-- Points are tracked directly on the `users` table (added in 0002) — the
-- separate table was never read or written to. Removing it reclaims the
-- index and prevents schema drift.
DROP INDEX IF EXISTS `idx_user_points_total_points`;
--> statement-breakpoint
DROP TABLE IF EXISTS `user_points`;
