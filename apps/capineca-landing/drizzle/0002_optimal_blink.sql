ALTER TABLE `orders` ADD `tracking_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `tracking_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `admin_notes` text DEFAULT '' NOT NULL;