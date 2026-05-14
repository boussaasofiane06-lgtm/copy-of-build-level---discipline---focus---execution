CREATE TABLE `affiliate_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`price` decimal(10,2),
	`affiliateUrl` text NOT NULL,
	`imageUrl` text,
	`category` varchar(64) NOT NULL DEFAULT 'gear',
	`brand` varchar(128),
	`badge` varchar(64),
	`commission` varchar(32),
	`published` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `affiliate_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_videos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`videoUrl` text,
	`thumbnailUrl` text,
	`category` varchar(64) NOT NULL DEFAULT 'motivation',
	`duration` varchar(32),
	`badge` varchar(64),
	`published` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_videos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `membership_tiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`price` decimal(10,2) NOT NULL,
	`interval` enum('monthly','yearly') NOT NULL DEFAULT 'monthly',
	`features` json NOT NULL DEFAULT ('[]'),
	`badge` varchar(64),
	`stripePriceId` varchar(128),
	`published` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `membership_tiers_id` PRIMARY KEY(`id`)
);
