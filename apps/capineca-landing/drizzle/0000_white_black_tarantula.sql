CREATE TABLE `personalizations` (
	`id` text PRIMARY KEY NOT NULL,
	`public_token` text NOT NULL,
	`model_id` integer NOT NULL,
	`model_title` text NOT NULL,
	`source_image` text DEFAULT '' NOT NULL,
	`art_name` text NOT NULL,
	`phrase` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_phone` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`mode` text DEFAULT 'live' NOT NULL,
	`provider_job_id` text,
	`art_image_url` text,
	`mug_mockup_url` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personalizations_public_token_unique` ON `personalizations` (`public_token`);