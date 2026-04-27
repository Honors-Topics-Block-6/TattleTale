CREATE TABLE `user_points` (
	`account_id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`total_points` integer DEFAULT 0 NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_user_points_total_points` ON `user_points` (`total_points` DESC, `updated_at` ASC, `account_id` ASC);
