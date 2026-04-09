CREATE TABLE `game_players` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`player_id` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`team` text NOT NULL,
	`alive` integer DEFAULT 1 NOT NULL,
	`eliminated_cycle` integer,
	`eliminated_phase` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`lobby_code` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`phase` text DEFAULT 'day_open' NOT NULL,
	`cycle` integer DEFAULT 1 NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`settings` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `installed_apps` (
	`device_id` text NOT NULL,
	`app_id` text NOT NULL,
	`installed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`raw_content` text NOT NULL,
	`delivered_content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
