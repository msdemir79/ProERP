CREATE TABLE IF NOT EXISTS stockCounts (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `countNumber` VARCHAR(50) NOT NULL,
  `items` JSON NOT NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `notes` TEXT NOT NULL,
  `decisionReason` TEXT NULL,
  `createdBy` BIGINT UNSIGNED NOT NULL,
  `decidedBy` BIGINT UNSIGNED NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decidedAt` DATETIME NULL,
  `version` INT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stock_count_number` (`countNumber`),
  KEY `idx_stock_count_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
