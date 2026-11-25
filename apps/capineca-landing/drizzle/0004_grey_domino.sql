CREATE TABLE `b2b_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`sector` text NOT NULL,
	`purpose` text NOT NULL,
	`quantity` integer NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`business_phone` text DEFAULT '' NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`customization_idea` text DEFAULT '' NOT NULL,
	`contact_name` text NOT NULL,
	`contact_phone` text NOT NULL,
	`job_id` text,
	`status` text DEFAULT 'new' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `github_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`encrypted_token` text NOT NULL,
	`iv` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `site_content` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
