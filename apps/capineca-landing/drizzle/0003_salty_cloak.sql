CREATE TABLE `models` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_job_id` text,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`phrase` text NOT NULL,
	`accent` text DEFAULT 'blue' NOT NULL,
	`status` text DEFAULT 'review' NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `models_source_job_id_unique` ON `models` (`source_job_id`);