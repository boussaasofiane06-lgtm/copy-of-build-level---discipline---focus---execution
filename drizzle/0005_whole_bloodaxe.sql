CREATE TABLE `digital_product_translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`language` varchar(8) NOT NULL,
	`languageName` varchar(64) NOT NULL,
	`status` enum('pending','translating','generating_audio','ready','error') NOT NULL DEFAULT 'pending',
	`translatedText` text,
	`pdfUrl` text,
	`audioUrl` text,
	`audioDuration` varchar(32),
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `digital_product_translations_id` PRIMARY KEY(`id`)
);
