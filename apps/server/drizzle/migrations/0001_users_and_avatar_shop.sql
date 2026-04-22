CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`avatar` text DEFAULT '🙂' NOT NULL,
	`total_points` integer DEFAULT 0 NOT NULL,
	`games_played` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_users_total_points` ON `users` (`total_points` DESC, `id` ASC);
--> statement-breakpoint
CREATE TABLE `user_avatar_unlocks` (
	`user_id` text NOT NULL,
	`avatar_id` text NOT NULL,
	`unlocked_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_avatar_unlocks_unique` ON `user_avatar_unlocks` (`user_id`, `avatar_id`);
