-- DMR Nexus veritabanı şeması
-- MySQL 8.4+ / InnoDB / utf8mb4 (Türkçe sıralama: utf8mb4_turkish_ci)
--
-- Tasarım: Skaler ve indekslenen alanlar normal kolon; iç içe diziler
-- (journalEntries.lines, recipes.ingredients, workOrders.stages,
-- products.variantBarcodes vb.) JSON kolon olarak saklanır.

CREATE DATABASE IF NOT EXISTS proerp
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_turkish_ci;

USE proerp;

-- ==========================================================
-- CARİ HESAPLAR
-- ==========================================================
CREATE TABLE IF NOT EXISTS contacts (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`              VARCHAR(50)     NULL,
  `name`              VARCHAR(255)    NOT NULL,
  `companyTitle`      VARCHAR(255)    NULL,
  `contactPerson`     VARCHAR(255)    NULL,
  `type`              ENUM('customer','supplier','both') NOT NULL DEFAULT 'customer',
  `category`          VARCHAR(100)    NULL,
  `email`             VARCHAR(255)    NULL,
  `phone`             VARCHAR(50)     NULL,
  `mobile`            VARCHAR(50)     NULL,
  `website`           VARCHAR(255)    NULL,
  `address`           TEXT            NULL,
  `shippingAddress`   TEXT            NULL,
  `city`              VARCHAR(100)    NULL,
  `district`          VARCHAR(100)    NULL,
  `country`           VARCHAR(100)    NULL DEFAULT 'Türkiye',
  `taxOffice`         VARCHAR(100)    NULL,
  `taxNumber`         VARCHAR(30)     NULL,
  `tcKimlik`          VARCHAR(20)     NULL,
  `paymentTermDays`   INT             NULL,
  `creditLimit`       DECIMAL(15,2)   NULL DEFAULT 0,
  `discountRate`      DECIMAL(8,4)    NULL DEFAULT 0,
  `bankName`          VARCHAR(150)    NULL,
  `iban`              VARCHAR(40)     NULL,
  `bankAccountName`   VARCHAR(255)    NULL,
  `balance`           DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `currency`          VARCHAR(10)     NULL DEFAULT 'TRY',
  `accountCode`       VARCHAR(30)     NULL,
  `notes`             TEXT            NULL,
  `createdAt`         DATETIME        NULL,
  `updatedAt`         DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_contacts_name` (`name`),
  KEY `idx_contacts_type` (`type`),
  KEY `idx_contacts_accountCode` (`accountCode`),
  KEY `idx_contacts_code` (`code`),
  KEY `idx_contacts_taxNumber` (`taxNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- STOK: ASORTİ ŞABLONLARI & ETİKET ŞABLONLARI
-- ==========================================================
CREATE TABLE IF NOT EXISTS assortmentTemplates (
  `id`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`      VARCHAR(255)    NOT NULL,
  `items`     JSON            NOT NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_assortmentTemplates_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS barcodeTemplates (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(255)    NOT NULL,
  `description` TEXT            NULL,
  `type`        VARCHAR(50)     NULL,
  `presetSize`  VARCHAR(20)     NULL,
  `widthMm`     DECIMAL(8,2)    NULL,
  `heightMm`    DECIMAL(8,2)    NULL,
  `orientation` VARCHAR(20)     NULL DEFAULT 'portrait',
  `isDefault`   TINYINT(1)      NOT NULL DEFAULT 0,
  `config`      JSON            NOT NULL,
  `createdAt`   DATETIME        NULL,
  `updatedAt`   DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_barcodeTemplates_name` (`name`),
  KEY `idx_barcodeTemplates_type` (`type`),
  KEY `idx_barcodeTemplates_presetSize` (`presetSize`),
  KEY `idx_barcodeTemplates_isDefault` (`isDefault`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- STOK: MERKEZİ RENK TANIMLARI (COLOR MASTER)
-- ----------------------------------------------------------
-- Renk, sistemde TEK DOĞRULUK KAYNAĞI olarak bu tabloda tutulur.
-- Ürün kartları, stok hareketleri, sipariş/irsaliye/fatura satırları,
-- iş emirleri ve reçeteler renge `colorId` ile bağlanır; serbest metin
-- renk girişi yoktur. `code` UNIQUE, `name` UNIQUE DEĞİLDİR (aynı ad
-- farklı üretici kodlarıyla birden çok renk kaydında bulunabilir).
-- Renkler fiziksel silinmez; `isActive = 0` ile pasifleştirilir.
-- ==========================================================
CREATE TABLE IF NOT EXISTS colors (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`             VARCHAR(50)     NOT NULL,
  `name`             VARCHAR(100)    NOT NULL,
  `groupName`        VARCHAR(100)    NULL,
  `hexCode`          VARCHAR(7)      NULL,
  `rgbCode`          VARCHAR(20)     NULL,
  `pantoneCode`      VARCHAR(50)     NULL,
  `manufacturerCode` VARCHAR(50)     NULL,
  `description`      TEXT            NULL,
  `isActive`         TINYINT(1)      NOT NULL DEFAULT 1,
  `createdAt`        DATETIME        NULL,
  `updatedAt`        DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_colors_code` (`code`),
  KEY `idx_colors_name` (`name`),
  KEY `idx_colors_groupName` (`groupName`),
  KEY `idx_colors_isActive` (`isActive`),
  KEY `idx_colors_manufacturerCode` (`manufacturerCode`),
  KEY `idx_colors_pantoneCode` (`pantoneCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- STOK: ÜRÜNLER
-- ==========================================================
CREATE TABLE IF NOT EXISTS products (
  `id`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`                  VARCHAR(80)     NOT NULL,
  `name`                  VARCHAR(255)    NOT NULL,
  `categoryType`          VARCHAR(30)     NULL,
  `hasSizeVariants`       TINYINT(1)      NULL DEFAULT 0,
  `subType`               VARCHAR(80)     NULL,
  `moldCode`              VARCHAR(50)     NULL,
  `moldGroup`             VARCHAR(100)    NULL,
  `documentNo`            VARCHAR(50)     NULL,
  `unit`                  VARCHAR(30)     NOT NULL DEFAULT 'Adet',
  `secondaryUnit`         VARCHAR(30)     NULL,
  `multiplier`            DECIMAL(15,4)   NULL,
  `stock`                 DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `minStock`              DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `buyingPrice`           DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `sellingPrice`          DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `isRawMaterial`         TINYINT(1)      NOT NULL DEFAULT 0,
  `barcode`               VARCHAR(80)     NULL,
  `colorBoxBarcodes`      JSON            NULL,
  `variantBarcodes`       JSON            NULL,
  `isFootwear`            TINYINT(1)      NULL DEFAULT 0,
  `assortmentTemplateId`  BIGINT UNSIGNED NULL,
  `assortment`            JSON            NULL,
  `category`              VARCHAR(100)    NULL,
  `brand`                 VARCHAR(100)    NULL,
  `image`                 LONGTEXT        NULL,
  `colorImages`           JSON            NULL,
  `shelf`                 VARCHAR(50)     NULL,
  `location`              VARCHAR(150)    NULL,
  `accountingCode`        VARCHAR(30)     NULL,
  `salesAccountCode`      VARCHAR(30)     NULL,
  `purchaseAccountCode`   VARCHAR(30)     NULL,
  `vatRate`               DECIMAL(8,4)    NULL,
  `preferredSupplierId`   BIGINT UNSIGNED NULL,
  `preferredSupplierName` VARCHAR(255)    NULL,
  `notes`                 TEXT            NULL,
  `createdAt`             DATETIME        NULL,
  `updatedAt`             DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_products_code` (`code`),
  KEY `idx_products_name` (`name`),
  KEY `idx_products_isRawMaterial` (`isRawMaterial`),
  KEY `idx_products_assortmentTemplateId` (`assortmentTemplateId`),
  KEY `idx_products_categoryType` (`categoryType`),
  KEY `idx_products_accountingCode` (`accountingCode`),
  KEY `idx_products_barcode` (`barcode`),
  KEY `idx_products_preferredSupplierId` (`preferredSupplierId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- Ürün ↔ renk çoktan-çoğa bağı (products.colors JSON dizisinin yerine).
-- colorId ON DELETE RESTRICT: bir üründe kullanılan renk silinemez.
CREATE TABLE IF NOT EXISTS productColors (
  `id`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `productId` BIGINT UNSIGNED NOT NULL,
  `colorId`   BIGINT UNSIGNED NOT NULL,
  `sortOrder` INT             NOT NULL DEFAULT 0,
  `createdAt` DATETIME        NULL,
  `version`   INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_productColors_product_color` (`productId`, `colorId`),
  KEY `idx_productColors_colorId` (`colorId`),
  CONSTRAINT fk_productColors_product FOREIGN KEY (`productId`) REFERENCES products (`id`) ON DELETE CASCADE,
  CONSTRAINT fk_productColors_color   FOREIGN KEY (`colorId`)   REFERENCES colors (`id`)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- ÜRETİM: REÇETELER (BOM) & İŞ EMİRLERİ
-- ==========================================================
CREATE TABLE IF NOT EXISTS recipes (
  `id`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `productId`            BIGINT UNSIGNED NOT NULL,
  `targetColor`          VARCHAR(80)     NULL,
  `targetColorId`        BIGINT UNSIGNED NULL,
  `name`                 VARCHAR(255)    NULL,
  `ingredients`          JSON            NOT NULL,
  `notes`                TEXT            NULL,
  `laborCost`            DECIMAL(15,2)   NULL DEFAULT 0,
  `estimatedTimeMinutes` INT             NULL,
  `createdAt`            DATETIME        NULL,
  `updatedAt`            DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_recipes_productId` (`productId`),
  KEY `idx_recipes_targetColor` (`targetColor`),
  KEY `idx_recipes_targetColorId` (`targetColorId`),
  CONSTRAINT fk_recipes_product FOREIGN KEY (`productId`) REFERENCES products (`id`) ON DELETE CASCADE,
  CONSTRAINT fk_recipes_targetColor FOREIGN KEY (`targetColorId`) REFERENCES colors (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS workOrders (
  `recipeSnapshot` JSON NULL,
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `productId`           BIGINT UNSIGNED NOT NULL,
  `quantity`            DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `status`              ENUM('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  `createdAt`           DATETIME        NOT NULL,
  `completedAt`         DATETIME        NULL,
  `targetDate`          DATETIME        NULL,
  `orderId`             BIGINT UNSIGNED NULL,
  `orderItemId`         BIGINT UNSIGNED NULL,
  `orderNumber`         VARCHAR(50)     NULL,
  `customerName`        VARCHAR(255)    NULL,
  `customerCode`        VARCHAR(50)     NULL,
  `orderDate`           DATETIME        NULL,
  `documentNo`          VARCHAR(50)     NULL,
  `moldCode`            VARCHAR(50)     NULL,
  `moldGroup`           VARCHAR(100)    NULL,
  `color`               VARCHAR(80)     NULL,
  `colorId`             BIGINT UNSIGNED NULL,
  `size`                VARCHAR(50)     NULL,
  `assortmentBreakdown` JSON            NULL,
  `currentStage`        VARCHAR(30)     NOT NULL DEFAULT 'planning',
  `stages`              JSON            NULL,
  `materialStatus`      VARCHAR(30)     NULL,
  `line`                VARCHAR(50)     NULL,
  `recipeId`            BIGINT UNSIGNED NULL,
  `barcode`             VARCHAR(80)     NOT NULL,
  `notes`               TEXT            NULL,
  `operator`            VARCHAR(150)    NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_workOrders_productId` (`productId`),
  KEY `idx_workOrders_orderId` (`orderId`),
  KEY `idx_workOrders_status` (`status`),
  KEY `idx_workOrders_currentStage` (`currentStage`),
  KEY `idx_workOrders_createdAt` (`createdAt`),
  KEY `idx_workOrders_barcode` (`barcode`),
  KEY `idx_workOrders_colorId` (`colorId`),
  CONSTRAINT fk_workOrders_product FOREIGN KEY (`productId`) REFERENCES products (`id`),
  CONSTRAINT fk_workOrders_color FOREIGN KEY (`colorId`) REFERENCES colors (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- STOK HAREKETLERİ
-- ==========================================================
CREATE TABLE IF NOT EXISTS inventoryLogs (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `productId`   BIGINT UNSIGNED NOT NULL,
  `type`        ENUM('in','out','production_in','production_out') NOT NULL,
  `quantity`    DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `date`        DATETIME        NOT NULL,
  `description` TEXT            NULL,
  `color`       VARCHAR(80)     NULL,
  `colorId`     BIGINT UNSIGNED NULL,
  `size`        VARCHAR(50)     NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_inventoryLogs_productId` (`productId`),
  KEY `idx_inventoryLogs_type` (`type`),
  KEY `idx_inventoryLogs_date` (`date`),
  KEY `idx_inventoryLogs_colorId` (`colorId`),
  CONSTRAINT fk_inventoryLogs_product FOREIGN KEY (`productId`) REFERENCES products (`id`) ON DELETE CASCADE,
  CONSTRAINT fk_inventoryLogs_color FOREIGN KEY (`colorId`) REFERENCES colors (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- KALIP (LAST) TAKİP MODÜLÜ
-- Ayakkabı kalıpları çift bazında, numara kırılımlı ve konum
-- kovaları ile takip edilir. Bir çift her anda TEK kovada durur.
-- Numara kümesi asorti şablonlarından türer (assortmentTemplateId).
-- ==========================================================

-- Kalıp ana kartı
CREATE TABLE IF NOT EXISTS molds (
  `id`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`                 VARCHAR(50)     NOT NULL,
  `name`                 VARCHAR(255)    NOT NULL,
  `productId`            BIGINT UNSIGNED NULL,
  `moldType`             VARCHAR(50)     NULL,
  `brand`                VARCHAR(100)    NULL,
  `sizeRange`            VARCHAR(50)     NULL,
  `material`             VARCHAR(50)     NULL,
  `supplierId`           BIGINT UNSIGNED NULL,
  `supplierName`         VARCHAR(255)    NULL,
  `purchaseCost`         DECIMAL(15,2)   NULL,
  `currency`             VARCHAR(10)     NULL DEFAULT 'TRY',
  `firstRecordDate`      DATETIME        NULL,
  `description`          TEXT            NULL,
  `image`                LONGTEXT        NULL,
  `barcode`              VARCHAR(80)     NULL,
  `assortmentTemplateId` BIGINT UNSIGNED NULL,
  `assortment`           JSON            NULL,
  `isActive`             TINYINT(1)      NOT NULL DEFAULT 1,
  `createdAt`            DATETIME        NULL,
  `updatedAt`            DATETIME        NULL,
  `version`              INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_molds_code` (`code`),
  KEY `idx_molds_name` (`name`),
  KEY `idx_molds_productId` (`productId`),
  KEY `idx_molds_supplierId` (`supplierId`),
  KEY `idx_molds_assortmentTemplateId` (`assortmentTemplateId`),
  KEY `idx_molds_isActive` (`isActive`),
  CONSTRAINT fk_molds_product     FOREIGN KEY (`productId`)            REFERENCES products (`id`)            ON DELETE SET NULL,
  CONSTRAINT fk_molds_supplier    FOREIGN KEY (`supplierId`)           REFERENCES contacts (`id`)            ON DELETE SET NULL,
  CONSTRAINT fk_molds_assortment  FOREIGN KEY (`assortmentTemplateId`) REFERENCES assortmentTemplates (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- Kalıp stok kovaları: (kalıp, numara, konum, fason cari, iş emri) başına çift.
-- subcontractId/workOrderId 0 = "yok" (UNIQUE içinde NULL çalışmadığı için).
CREATE TABLE IF NOT EXISTS moldStock (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `moldId`        BIGINT UNSIGNED NOT NULL,
  `size`          VARCHAR(50)     NOT NULL,
  `locationType`  VARCHAR(30)     NOT NULL,
  `subcontractId` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `workOrderId`   BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `pairs`         DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `looseLeft`     INT             NOT NULL DEFAULT 0,
  `looseRight`    INT             NOT NULL DEFAULT 0,
  `updatedAt`     DATETIME        NULL,
  `version`       INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_moldStock_bucket` (`moldId`, `size`, `locationType`, `subcontractId`, `workOrderId`),
  KEY `idx_moldStock_moldId` (`moldId`),
  KEY `idx_moldStock_locationType` (`locationType`),
  CONSTRAINT fk_moldStock_mold FOREIGN KEY (`moldId`) REFERENCES molds (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- Kalıp hareket başlıkları (ledger; yalnızca op'lar yazar)
CREATE TABLE IF NOT EXISTS moldMovements (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `movementNo`        VARCHAR(50)     NOT NULL,
  `type`              VARCHAR(30)     NOT NULL,
  `date`              DATETIME        NOT NULL,
  `moldId`            BIGINT UNSIGNED NOT NULL,
  `fromLocationType`  VARCHAR(30)     NULL,
  `fromSubcontractId` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `fromWorkOrderId`   BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `toLocationType`    VARCHAR(30)     NULL,
  `toSubcontractId`   BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `toWorkOrderId`     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `sendId`            BIGINT UNSIGNED NULL,
  `userId`            BIGINT UNSIGNED NULL,
  `deliveredBy`       VARCHAR(150)    NULL,
  `receivedBy`        VARCHAR(150)    NULL,
  `description`       TEXT            NULL,
  `documentRef`       VARCHAR(80)     NULL,
  `createdAt`         DATETIME        NULL,
  `version`           INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_moldMovements_no` (`movementNo`),
  KEY `idx_moldMovements_moldId` (`moldId`),
  KEY `idx_moldMovements_type` (`type`),
  KEY `idx_moldMovements_date` (`date`),
  CONSTRAINT fk_moldMovements_mold FOREIGN KEY (`moldId`) REFERENCES molds (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- Kalıp hareket satırları (numara bazında çift / tek parça)
CREATE TABLE IF NOT EXISTS moldMovementItems (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `movementId` BIGINT UNSIGNED NOT NULL,
  `moldId`     BIGINT UNSIGNED NOT NULL,
  `size`       VARCHAR(50)     NOT NULL,
  `pairs`      DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `looseLeft`  INT             NOT NULL DEFAULT 0,
  `looseRight` INT             NOT NULL DEFAULT 0,
  `version`    INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_moldMovementItems_movementId` (`movementId`),
  KEY `idx_moldMovementItems_moldId` (`moldId`),
  CONSTRAINT fk_moldMovementItems_movement FOREIGN KEY (`movementId`) REFERENCES moldMovements (`id`) ON DELETE CASCADE,
  CONSTRAINT fk_moldMovementItems_mold     FOREIGN KEY (`moldId`)     REFERENCES molds (`id`)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- Eski basit kasa/banka hareketleri (cari ekstre için geriye dönük uyumluluk)
CREATE TABLE IF NOT EXISTS transactions (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `contactId`     BIGINT UNSIGNED NULL,
  `type`          ENUM('income','expense') NOT NULL,
  `amount`        DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `description`   TEXT            NULL,
  `date`          DATETIME        NOT NULL,
  `category`      VARCHAR(100)    NULL,
  `paymentMethod` VARCHAR(30)     NULL,
  `documentNo`    VARCHAR(50)     NULL,
  `orderId`       BIGINT UNSIGNED NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  `status`        ENUM('posted','cancelled') NOT NULL DEFAULT 'posted',
  `cancelledAt`   DATETIME        NULL,
  `reversalOfId`  BIGINT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  KEY `idx_transactions_contactId` (`contactId`),
  KEY `idx_transactions_type` (`type`),
  KEY `idx_transactions_date` (`date`),
  KEY `idx_transactions_category` (`category`),
  KEY `idx_transactions_status` (`status`),
  KEY `idx_transactions_reversalOfId` (`reversalOfId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- AYARLAR (tek satır: id = 'global_barcode')
-- ==========================================================
CREATE TABLE IF NOT EXISTS settings (
  `id`                  VARCHAR(50)     NOT NULL,
  `barcodeType`         VARCHAR(20)     NULL,
  `barcodePrefix`       VARCHAR(20)     NULL,
  `nextBarcodeSequence` BIGINT          NULL DEFAULT 1000000,
  `movementsReset`      TINYINT(1)      NULL DEFAULT 0,
  `productionReset`     TINYINT(1)      NULL DEFAULT 0,
  `company`             JSON            NULL,
  `stock`               JSON            NULL,
  `order`             JSON            NULL,
  `production`          JSON            NULL,
  `finance`             JSON            NULL,
  `hr`                  JSON            NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- BELGE/FİŞ NUMARASI SAYAÇLARI (atomik, satır kilitli)
-- ==========================================================
CREATE TABLE IF NOT EXISTS documentNumbers (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `scope`      VARCHAR(50)     NOT NULL,
  `prefix`     VARCHAR(20)     NOT NULL,
  `year`       INT             NOT NULL,
  `lastNumber` BIGINT          NOT NULL DEFAULT 0,
  `updatedAt`  DATETIME        NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_documentNumbers_scope_prefix_year` (`scope`, `prefix`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- SİPARİŞLER
-- ==========================================================
CREATE TABLE IF NOT EXISTS orders (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type`             ENUM('purchase','sales') NOT NULL,
  `orderNumber`      VARCHAR(50)     NOT NULL,
  `contactId`        BIGINT UNSIGNED NOT NULL,
  `date`             DATETIME        NOT NULL,
  `deliveryDate`     DATETIME        NULL,
  `status`           ENUM('draft','confirmed','partially_shipped','completed','cancelled') NOT NULL DEFAULT 'draft',
  `invoicingStatus`  ENUM('not_invoiced','partially_invoiced','fully_invoiced') NULL DEFAULT 'not_invoiced',
  `invoicedTotal`    DECIMAL(15,2)   NULL DEFAULT 0,
  `totalAmount`      DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `taxAmount`        DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `discountAmount`   DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `grandTotal`       DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `notes`            TEXT            NULL,
  `currency`         VARCHAR(10)     NOT NULL DEFAULT 'TRY',
  `createdAt`        DATETIME        NULL,
  `updatedAt`        DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_orderNumber` (`orderNumber`),
  KEY `idx_orders_type` (`type`),
  KEY `idx_orders_contactId` (`contactId`),
  KEY `idx_orders_status` (`status`),
  KEY `idx_orders_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS orderItems (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `orderId`           BIGINT UNSIGNED NOT NULL,
  `productId`         BIGINT UNSIGNED NOT NULL,
  `color`             VARCHAR(80)     NULL,
  `colorId`           BIGINT UNSIGNED NULL,
  `size`              VARCHAR(50)     NULL,
  `quantity`          DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `shippedQuantity`   DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `invoicedQuantity`  DECIMAL(15,4)   NULL DEFAULT 0,
  `unitPrice`         DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `taxRate`           DECIMAL(8,4)    NOT NULL DEFAULT 0,
  `discountRate`      DECIMAL(8,4)    NOT NULL DEFAULT 0,
  `total`             DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_orderItems_orderId` (`orderId`),
  KEY `idx_orderItems_productId` (`productId`),
  KEY `idx_orderItems_colorId` (`colorId`),
  CONSTRAINT fk_orderItems_order FOREIGN KEY (`orderId`) REFERENCES orders (`id`) ON DELETE CASCADE,
  CONSTRAINT fk_orderItems_color FOREIGN KEY (`colorId`) REFERENCES colors (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- FATURALAR
-- ==========================================================
CREATE TABLE IF NOT EXISTS invoices (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoiceNumber`     VARCHAR(50)     NOT NULL,
  `type`              ENUM('sales','purchase') NOT NULL,
  `scenario`          ENUM('commercial','basic','return','withholding','export') NULL DEFAULT 'commercial',
  `contactId`         BIGINT UNSIGNED NOT NULL,
  `orderId`           BIGINT UNSIGNED NULL,
  `orderNumber`       VARCHAR(50)     NULL,
  `waybillId`         BIGINT UNSIGNED NULL,
  `waybillNumber`     VARCHAR(50)     NULL,
  `date`              DATETIME        NOT NULL,
  `dueDate`           DATETIME        NULL,
  `ettn`              VARCHAR(50)     NULL,
  `subtotal`          DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `discountTotal`     DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `taxTotal`          DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `withholdingRate`   DECIMAL(8,4)    NULL,
  `withholdingAmount` DECIMAL(15,2)   NULL,
  `grandTotal`        DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `currency`          VARCHAR(10)     NOT NULL DEFAULT 'TRY',
  `exchangeRate`      DECIMAL(15,6)   NULL DEFAULT 1,
  `paymentStatus`     ENUM('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid',
  `paidAmount`        DECIMAL(15,2)   NULL DEFAULT 0,
  `status`            ENUM('draft','issued','cancelled') NOT NULL DEFAULT 'draft',
  `notes`             TEXT            NULL,
  `isStockDeducted`   TINYINT(1)      NULL DEFAULT 0,
  `createdAt`         DATETIME        NULL,
  `updatedAt`         DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoices_invoiceNumber` (`invoiceNumber`),
  KEY `idx_invoices_type` (`type`),
  KEY `idx_invoices_contactId` (`contactId`),
  KEY `idx_invoices_orderId` (`orderId`),
  KEY `idx_invoices_date` (`date`),
  KEY `idx_invoices_status` (`status`),
  KEY `idx_invoices_paymentStatus` (`paymentStatus`),
  KEY `idx_invoices_ettn` (`ettn`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS invoiceItems (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoiceId`      BIGINT UNSIGNED NOT NULL,
  `productId`      BIGINT UNSIGNED NULL,
  `orderItemId`    BIGINT UNSIGNED NULL,
  `productCode`    VARCHAR(80)     NULL,
  `productName`    VARCHAR(255)    NULL,
  `color`          VARCHAR(80)     NULL,
  `colorId`        BIGINT UNSIGNED NULL,
  `size`           VARCHAR(50)     NULL,
  `quantity`       DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `unit`           VARCHAR(30)     NULL,
  `unitPrice`      DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `discountRate`   DECIMAL(8,4)    NOT NULL DEFAULT 0,
  `discountAmount` DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `taxRate`        DECIMAL(8,4)    NOT NULL DEFAULT 0,
  `taxAmount`      DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `total`          DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_invoiceItems_invoiceId` (`invoiceId`),
  KEY `idx_invoiceItems_productId` (`productId`),
  KEY `idx_invoiceItems_orderItemId` (`orderItemId`),
  KEY `idx_invoiceItems_colorId` (`colorId`),
  CONSTRAINT fk_invoiceItems_invoice FOREIGN KEY (`invoiceId`) REFERENCES invoices (`id`) ON DELETE CASCADE,
  CONSTRAINT fk_invoiceItems_color FOREIGN KEY (`colorId`) REFERENCES colors (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- İRSALİYELER
-- ==========================================================
CREATE TABLE IF NOT EXISTS waybills (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `waybillNumber`     VARCHAR(50)     NOT NULL,
  `type`              ENUM('sales','purchase') NOT NULL,
  `scenario`          ENUM('sevk','matbu','konsinye','fason','ihracat') NULL DEFAULT 'sevk',
  `contactId`         BIGINT UNSIGNED NOT NULL,
  `contactName`       VARCHAR(255)    NULL,
  `orderId`           BIGINT UNSIGNED NULL,
  `orderNumber`       VARCHAR(50)     NULL,
  `date`              DATETIME        NOT NULL,
  `shippingDate`      DATETIME        NULL,
  `dispatchDate`      DATETIME        NULL,
  `dispatchTime`      VARCHAR(10)     NULL,
  `carrierTitle`      VARCHAR(255)    NULL,
  `carrierTaxNo`      VARCHAR(30)     NULL,
  `driverName`        VARCHAR(150)    NULL,
  `driverTc`          VARCHAR(20)     NULL,
  `vehiclePlate`      VARCHAR(30)     NULL,
  `trailerPlate`      VARCHAR(30)     NULL,
  `deliveryAddress`   TEXT            NULL,
  `ettn`              VARCHAR(50)     NULL,
  `subtotal`          DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `discountTotal`     DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `taxTotal`          DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `grandTotal`        DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `totalQuantity`     DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `currency`          VARCHAR(10)     NOT NULL DEFAULT 'TRY',
  `status`            ENUM('draft','issued','cancelled') NOT NULL DEFAULT 'draft',
  `isStockDeducted`   TINYINT(1)      NOT NULL DEFAULT 1,
  `invoicedStatus`    ENUM('not_invoiced','invoiced') NULL DEFAULT 'not_invoiced',
  `invoiceId`         BIGINT UNSIGNED NULL,
  `invoiceNumber`     VARCHAR(50)     NULL,
  `notes`             TEXT            NULL,
  `createdAt`         DATETIME        NULL,
  `updatedAt`         DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_waybills_waybillNumber` (`waybillNumber`),
  KEY `idx_waybills_type` (`type`),
  KEY `idx_waybills_contactId` (`contactId`),
  KEY `idx_waybills_orderId` (`orderId`),
  KEY `idx_waybills_date` (`date`),
  KEY `idx_waybills_status` (`status`),
  KEY `idx_waybills_invoicedStatus` (`invoicedStatus`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS waybillItems (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `waybillId`      BIGINT UNSIGNED NOT NULL,
  `productId`      BIGINT UNSIGNED NULL,
  `orderItemId`    BIGINT UNSIGNED NULL,
  `productCode`    VARCHAR(80)     NULL,
  `productName`    VARCHAR(255)    NULL,
  `color`          VARCHAR(80)     NULL,
  `colorId`        BIGINT UNSIGNED NULL,
  `size`           VARCHAR(50)     NULL,
  `quantity`       DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `unit`           VARCHAR(30)     NULL,
  `unitPrice`      DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `discountRate`   DECIMAL(8,4)    NOT NULL DEFAULT 0,
  `discountAmount` DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `taxRate`        DECIMAL(8,4)    NOT NULL DEFAULT 0,
  `taxAmount`      DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `total`          DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_waybillItems_waybillId` (`waybillId`),
  KEY `idx_waybillItems_productId` (`productId`),
  KEY `idx_waybillItems_orderItemId` (`orderItemId`),
  KEY `idx_waybillItems_colorId` (`colorId`),
  CONSTRAINT fk_waybillItems_waybill FOREIGN KEY (`waybillId`) REFERENCES waybills (`id`) ON DELETE CASCADE,
  CONSTRAINT fk_waybillItems_color FOREIGN KEY (`colorId`) REFERENCES colors (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- MUHASEBE: TDHP HESAP PLANI & YEVMIYE
-- ==========================================================
CREATE TABLE IF NOT EXISTS accounts (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(30)     NOT NULL,
  `name`        VARCHAR(255)    NOT NULL,
  `type`        ENUM('asset','liability','equity','revenue','expense','cost') NOT NULL,
  `level`       INT             NOT NULL DEFAULT 1,
  `parentCode`  VARCHAR(30)     NULL,
  `currency`    VARCHAR(10)     NULL DEFAULT 'TRY',
  `description` TEXT            NULL,
  `isSystem`    TINYINT(1)      NULL DEFAULT 0,
  `isActive`    TINYINT(1)      NULL DEFAULT 1,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_accounts_code` (`code`),
  KEY `idx_accounts_name` (`name`),
  KEY `idx_accounts_type` (`type`),
  KEY `idx_accounts_level` (`level`),
  KEY `idx_accounts_parentCode` (`parentCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS journalEntries (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `entryNumber`    VARCHAR(50)     NOT NULL,
  `entryType`      ENUM('mahsup','tahsil','tediye','acilis','kapanis') NOT NULL DEFAULT 'mahsup',
  `date`           DATETIME        NOT NULL,
  `description`    TEXT            NULL,
  `documentType`   VARCHAR(30)     NULL,
  `documentId`     BIGINT UNSIGNED NULL,
  `documentNumber` VARCHAR(80)     NULL,
  `lines`          JSON            NOT NULL,
  `totalDebit`     DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `totalCredit`    DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `isBalanced`     TINYINT(1)      NOT NULL DEFAULT 0,
  `status`         ENUM('approved','draft') NOT NULL DEFAULT 'approved',
  `createdAt`      DATETIME        NOT NULL,
  `updatedAt`      DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_journalEntries_entryNumber` (`entryNumber`),
  KEY `idx_journalEntries_entryType` (`entryType`),
  KEY `idx_journalEntries_date` (`date`),
  KEY `idx_journalEntries_documentType` (`documentType`),
  KEY `idx_journalEntries_documentId` (`documentId`),
  KEY `idx_journalEntries_isBalanced` (`isBalanced`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- FİNANS: KASA, BANKA, ÇEK/SENET, TAHSİLAT
-- ==========================================================
CREATE TABLE IF NOT EXISTS cashBoxes (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`              VARCHAR(50)     NOT NULL,
  `name`              VARCHAR(255)    NOT NULL,
  `accountCode`       VARCHAR(30)     NULL,
  `currency`          VARCHAR(10)     NOT NULL DEFAULT 'TRY',
  `balance`           DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `responsiblePerson` VARCHAR(150)    NULL,
  `notes`             TEXT            NULL,
  `createdAt`         DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cashBoxes_code` (`code`),
  KEY `idx_cashBoxes_name` (`name`),
  KEY `idx_cashBoxes_accountCode` (`accountCode`),
  KEY `idx_cashBoxes_currency` (`currency`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS bankAccounts (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `bankName`      VARCHAR(150)    NOT NULL,
  `branchName`    VARCHAR(150)    NULL,
  `accountNumber` VARCHAR(50)     NULL,
  `iban`          VARCHAR(40)     NOT NULL,
  `accountCode`   VARCHAR(30)     NULL,
  `currency`      VARCHAR(10)     NOT NULL DEFAULT 'TRY',
  `balance`       DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `notes`         TEXT            NULL,
  `createdAt`     DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bankAccounts_iban` (`iban`),
  KEY `idx_bankAccounts_bankName` (`bankName`),
  KEY `idx_bankAccounts_accountCode` (`accountCode`),
  KEY `idx_bankAccounts_currency` (`currency`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS checks (
  `id`                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `type`                  ENUM('received_check','given_check','received_note','given_note') NOT NULL,
  `portfolioNumber`       VARCHAR(50)     NOT NULL,
  `serialNumber`          VARCHAR(50)     NULL,
  `bankName`              VARCHAR(150)    NULL,
  `branchName`            VARCHAR(150)    NULL,
  `accountNumber`         VARCHAR(50)     NULL,
  `drawer`                VARCHAR(255)    NULL,
  `drawerTaxNumber`       VARCHAR(30)     NULL,
  `contactId`             BIGINT UNSIGNED NULL,
  `contactName`           VARCHAR(255)    NULL,
  `endorsedToContactId`   BIGINT UNSIGNED NULL,
  `endorsedToContactName` VARCHAR(255)    NULL,
  `issueDate`             DATETIME        NULL,
  `dueDate`               DATETIME        NULL,
  `amount`                DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `currency`              VARCHAR(10)     NOT NULL DEFAULT 'TRY',
  `status`                ENUM('portfolio','bank_collection','collected','endorsed','bounced','returned') NOT NULL DEFAULT 'portfolio',
  `statusChangeDate`      DATETIME        NULL,
  `statusNotes`           TEXT            NULL,
  `accountCode`           VARCHAR(30)     NULL,
  `journalEntryId`        BIGINT UNSIGNED NULL,
  `targetBankAccountId`   BIGINT UNSIGNED NULL,
  `targetCashBoxId`       BIGINT UNSIGNED NULL,
  `notes`                 TEXT            NULL,
  `createdAt`             DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_checks_type` (`type`),
  KEY `idx_checks_portfolioNumber` (`portfolioNumber`),
  KEY `idx_checks_contactId` (`contactId`),
  KEY `idx_checks_dueDate` (`dueDate`),
  KEY `idx_checks_status` (`status`),
  KEY `idx_checks_serialNumber` (`serialNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS collectionReceipts (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `receiptNumber`  VARCHAR(50)     NOT NULL,
  `type`           ENUM('collection','disbursement') NOT NULL,
  `date`           DATETIME        NOT NULL,
  `contactId`      BIGINT UNSIGNED NULL,
  `contactName`    VARCHAR(255)    NULL,
  `instrument`     ENUM('cash','bank','check','credit_card') NOT NULL DEFAULT 'cash',
  `cashBoxId`      BIGINT UNSIGNED NULL,
  `bankAccountId`  BIGINT UNSIGNED NULL,
  `checkId`        BIGINT UNSIGNED NULL,
  `amount`         DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `currency`       VARCHAR(10)     NOT NULL DEFAULT 'TRY',
  `description`    TEXT            NULL,
  `invoiceId`      BIGINT UNSIGNED NULL,
  `invoiceNumber`  VARCHAR(50)     NULL,
  `journalEntryId` BIGINT UNSIGNED NULL,
  `isAccounted`    TINYINT(1)      NULL DEFAULT 0,
  `createdAt`      DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_collectionReceipts_receiptNumber` (`receiptNumber`),
  KEY `idx_collectionReceipts_type` (`type`),
  KEY `idx_collectionReceipts_date` (`date`),
  KEY `idx_collectionReceipts_contactId` (`contactId`),
  KEY `idx_collectionReceipts_instrument` (`instrument`),
  KEY `idx_collectionReceipts_isAccounted` (`isAccounted`),
  KEY `idx_collectionReceipts_cashBoxId` (`cashBoxId`),
  KEY `idx_collectionReceipts_bankAccountId` (`bankAccountId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- İNSAN KAYNAKLARI
-- ==========================================================
CREATE TABLE IF NOT EXISTS employees (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employeeCode`        VARCHAR(50)     NOT NULL,
  `name`                VARCHAR(255)    NOT NULL,
  `tcNo`                VARCHAR(20)     NULL,
  `phone`               VARCHAR(50)     NULL,
  `email`               VARCHAR(255)    NULL,
  `department`          VARCHAR(100)    NULL,
  `position`            VARCHAR(150)    NULL,
  `hireDate`            DATETIME        NULL,
  `terminationDate`     DATETIME        NULL,
  `status`              ENUM('active','passive') NOT NULL DEFAULT 'active',
  `sgkStatus`           ENUM('sgk_li','sgk_siz') NOT NULL DEFAULT 'sgk_li',
  `salaryType`          ENUM('monthly_net','monthly_gross','daily','hourly') NOT NULL DEFAULT 'monthly_net',
  `baseSalary`          DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `agreedNetSalary`     DECIMAL(15,2)   NULL,
  `paymentMethod`       ENUM('bank','cash') NULL DEFAULT 'bank',
  `bankName`            VARCHAR(150)    NULL,
  `iban`                VARCHAR(40)     NULL,
  `entitledAnnualLeave` INT             NULL DEFAULT 14,
  `usedAnnualLeave`     INT             NULL DEFAULT 0,
  `bloodGroup`          VARCHAR(20)     NULL,
  `emergencyContact`    VARCHAR(255)    NULL,
  `address`             TEXT            NULL,
  `notes`               TEXT            NULL,
  `createdAt`           DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_employees_employeeCode` (`employeeCode`),
  KEY `idx_employees_name` (`name`),
  KEY `idx_employees_tcNo` (`tcNo`),
  KEY `idx_employees_department` (`department`),
  KEY `idx_employees_position` (`position`),
  KEY `idx_employees_status` (`status`),
  KEY `idx_employees_sgkStatus` (`sgkStatus`),
  KEY `idx_employees_hireDate` (`hireDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS attendanceRecords (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employeeId`    BIGINT UNSIGNED NOT NULL,
  `date`          VARCHAR(10)     NOT NULL,
  `month`         INT             NOT NULL,
  `year`          INT             NOT NULL,
  `status`        VARCHAR(30)     NOT NULL DEFAULT 'present',
  `checkInTime`   VARCHAR(10)     NULL,
  `checkOutTime`  VARCHAR(10)     NULL,
  `normalHours`   DECIMAL(8,2)    NOT NULL DEFAULT 0,
  `overtimeHours` DECIMAL(8,2)    NOT NULL DEFAULT 0,
  `notes`         TEXT            NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_employee_date` (`employeeId`, `date`),
  KEY `idx_attendanceRecords_employeeId` (`employeeId`),
  KEY `idx_attendanceRecords_date` (`date`),
  KEY `idx_attendanceRecords_month` (`month`),
  KEY `idx_attendanceRecords_year` (`year`),
  KEY `idx_attendanceRecords_status` (`status`),
  CONSTRAINT fk_attendance_employee FOREIGN KEY (`employeeId`) REFERENCES employees (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS leaveRequests (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employeeId`   BIGINT UNSIGNED NOT NULL,
  `employeeName` VARCHAR(255)    NULL,
  `leaveType`    VARCHAR(30)     NOT NULL,
  `startDate`    VARCHAR(10)     NOT NULL,
  `endDate`      VARCHAR(10)     NOT NULL,
  `days`         DECIMAL(8,2)    NOT NULL DEFAULT 0,
  `status`       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reason`       TEXT            NULL,
  `approvedBy`   VARCHAR(150)    NULL,
  `createdAt`    DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_leaveRequests_employeeId` (`employeeId`),
  KEY `idx_leaveRequests_leaveType` (`leaveType`),
  KEY `idx_leaveRequests_startDate` (`startDate`),
  KEY `idx_leaveRequests_endDate` (`endDate`),
  KEY `idx_leaveRequests_status` (`status`),
  KEY `idx_leaveRequests_createdAt` (`createdAt`),
  CONSTRAINT fk_leaveRequests_employee FOREIGN KEY (`employeeId`) REFERENCES employees (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS advanceRequests (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employeeId`   BIGINT UNSIGNED NOT NULL,
  `employeeName` VARCHAR(255)    NULL,
  `date`         DATETIME        NOT NULL,
  `amount`       DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `description`  TEXT            NULL,
  `month`        INT             NOT NULL,
  `year`         INT             NOT NULL,
  `status`       ENUM('pending','paid','rejected') NOT NULL DEFAULT 'pending',
  `isDeducted`   TINYINT(1)      NOT NULL DEFAULT 0,
  `createdAt`    DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_advanceRequests_employeeId` (`employeeId`),
  KEY `idx_advanceRequests_date` (`date`),
  KEY `idx_advanceRequests_month` (`month`),
  KEY `idx_advanceRequests_year` (`year`),
  KEY `idx_advanceRequests_status` (`status`),
  KEY `idx_advanceRequests_isDeducted` (`isDeducted`),
  CONSTRAINT fk_advanceRequests_employee FOREIGN KEY (`employeeId`) REFERENCES employees (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS payrollRecords (
  `parameterSnapshot` JSON NULL,
  `id`                                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employeeId`                        BIGINT UNSIGNED NOT NULL,
  `employeeName`                      VARCHAR(255)    NULL,
  `employeeCode`                      VARCHAR(50)     NULL,
  `department`                        VARCHAR(100)    NULL,
  `month`                             INT             NOT NULL,
  `year`                              INT             NOT NULL,
  `sgkStatus`                         ENUM('sgk_li','sgk_siz') NOT NULL DEFAULT 'sgk_li',
  `salaryType`                        VARCHAR(30)     NULL,

  `daysWorked`                        DECIMAL(8,2)    NOT NULL DEFAULT 0,
  `weeklyRestDays`                    DECIMAL(8,2)    NOT NULL DEFAULT 0,
  `paidLeaveDays`                     DECIMAL(8,2)    NOT NULL DEFAULT 0,
  `unpaidLeaveDays`                   DECIMAL(8,2)    NOT NULL DEFAULT 0,
  `absentDays`                        DECIMAL(8,2)    NOT NULL DEFAULT 0,
  `totalDays`                         DECIMAL(8,2)    NOT NULL DEFAULT 0,
  `overtimeHours`                     DECIMAL(8,2)    NOT NULL DEFAULT 0,

  `baseSalary`                        DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `basePay`                           DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `overtimePay`                       DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `bonusPay`                          DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `totalGrossPay`                     DECIMAL(15,2)   NOT NULL DEFAULT 0,

  `employeeSgkShare`                  DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `employeeUnemploymentShare`         DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `incomeTaxBase`                     DECIMAL(15,2)   NULL,
  `previousCumulativeTaxBase`         DECIMAL(15,2)   NULL,
  `cumulativeTaxBase`                 DECIMAL(15,2)   NULL,
  `appliedTaxRate`                    DECIMAL(8,4)    NULL,
  `incomeTax`                         DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `stampTax`                          DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `totalLegalDeductions`              DECIMAL(15,2)   NOT NULL DEFAULT 0,

  `totalGrossPayKurus`                BIGINT          NULL,
  `employeeSgkShareKurus`             BIGINT          NULL,
  `employeeUnemploymentShareKurus`    BIGINT          NULL,
  `incomeTaxKurus`                    BIGINT          NULL,
  `stampTaxKurus`                     BIGINT          NULL,
  `netSalaryKurus`                    BIGINT          NULL,
  `totalEmployerCostKurus`            BIGINT          NULL,

  `advanceDeduction`                  DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `otherDeductions`                   DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `netSalary`                         DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `employerSgkShare`                  DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `employerUnemploymentShare`         DECIMAL(15,2)   NOT NULL DEFAULT 0,
  `totalEmployerCost`                 DECIMAL(15,2)   NOT NULL DEFAULT 0,

  `paymentStatus`                     ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid',
  `paidDate`                          DATETIME        NULL,
  `paidFromType`                      ENUM('cash','bank') NULL,
  `paidFromId`                        BIGINT UNSIGNED NULL,
  `isAccounted`                       TINYINT(1)      NULL DEFAULT 0,
  `journalEntryId`                    BIGINT UNSIGNED NULL,
  `notes`                             TEXT            NULL,
  `createdAt`                         DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payroll_employee_period` (`employeeId`, `year`, `month`),
  KEY `idx_payrollRecords_employeeId` (`employeeId`),
  KEY `idx_payrollRecords_month` (`month`),
  KEY `idx_payrollRecords_year` (`year`),
  KEY `idx_payrollRecords_sgkStatus` (`sgkStatus`),
  KEY `idx_payrollRecords_isAccounted` (`isAccounted`),
  KEY `idx_payrollRecords_paymentStatus` (`paymentStatus`),
  CONSTRAINT fk_payrollRecords_employee FOREIGN KEY (`employeeId`) REFERENCES employees (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS periodLocks (
  `id`       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `scope`    ENUM('hr','accounting') NOT NULL DEFAULT 'hr',
  `month`    INT             NOT NULL,
  `year`     INT             NOT NULL,
  `isLocked` TINYINT(1)      NOT NULL DEFAULT 0,
  `lockedAt` DATETIME        NULL,
  `lockedBy` VARCHAR(150)    NULL,
  `notes`    TEXT            NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_periodLocks_scope_month_year` (`scope`, `month`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- KULLANICI & YETKİLENDİRME (RBAC)
-- ==========================================================
CREATE TABLE IF NOT EXISTS roles (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`        VARCHAR(50)     NOT NULL,
  `name`        VARCHAR(150)    NOT NULL,
  `description` TEXT            NULL,
  `color`       VARCHAR(30)     NULL,
  `isSystem`    TINYINT(1)      NULL DEFAULT 0,
  `permissions` JSON            NOT NULL,
  `createdAt`   DATETIME        NULL,
  `updatedAt`   DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_code` (`code`),
  KEY `idx_roles_name` (`name`),
  KEY `idx_roles_isSystem` (`isSystem`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS users (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`         VARCHAR(80)     NOT NULL,
  `fullName`         VARCHAR(255)    NULL,
  `email`            VARCHAR(255)    NULL,
  `phone`            VARCHAR(50)     NULL,
  `title`            VARCHAR(150)    NULL,
  `department`       VARCHAR(100)    NULL,
  `roleId`           BIGINT UNSIGNED NULL,
  `roleCode`         VARCHAR(50)     NULL,
  `roleName`         VARCHAR(150)    NULL,
  `status`           ENUM('active','passive','suspended') NOT NULL DEFAULT 'active',
  `avatar`           TEXT            NULL,
  `color`            VARCHAR(30)     NULL,
  -- Parola yalnızca scrypt türevi olarak saklanır; düz metin/PIN kolonu yoktur.
  -- Bu iki kolon API yanıtlarında hiçbir zaman istemciye gönderilmez.
  `passwordHash`     VARCHAR(255)    NULL,
  `passwordSalt`     VARCHAR(255)    NULL,
  `lastLoginAt`      DATETIME        NULL,
  `createdAt`        DATETIME        NULL,
  `updatedAt`        DATETIME        NULL,
  `notes`            TEXT            NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  KEY `idx_users_email` (`email`),
  KEY `idx_users_roleCode` (`roleCode`),
  KEY `idx_users_status` (`status`),
  KEY `idx_users_department` (`department`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS auditLogs (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId`      BIGINT UNSIGNED NULL,
  `userName`    VARCHAR(255)    NULL,
  `userRole`    VARCHAR(150)    NULL,
  `action`      VARCHAR(30)     NOT NULL,
  `module`      VARCHAR(30)     NULL,
  `entityId`    VARCHAR(50)     NULL,
  `description` TEXT            NULL,
  `details`     TEXT            NULL,
  `reason`      TEXT            NULL,
  `recordSummary` VARCHAR(500)  NULL,
  `ipAddress`   VARCHAR(50)     NULL,
  `timestamp`   DATETIME        NOT NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_auditLogs_userId` (`userId`),
  KEY `idx_auditLogs_action` (`action`),
  KEY `idx_auditLogs_module` (`module`),
  KEY `idx_auditLogs_timestamp` (`timestamp`),
  KEY `idx_auditLogs_action_timestamp` (`action`, `timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ==========================================================
-- YABANCI ANAHTAR (FK) BUTUNLUGU — migration 003 ile birebir ayni.
-- Idempotent: yalnizca yoksa eklenir. SET NULL once oksuz baglari NULL'lar
-- (kayit silinmez); RESTRICT yalnizca oksuz yoksa eklenir; CASCADE ile veri
-- silinmez. Polimorfik referanslara (journalEntries.documentId,
-- payrollRecords.paidFromId) ve accounts.parentCode'a FK EKLENMEZ.
-- ==========================================================

-- orders.contactId -> contacts [fk_orders_contact] (RESTRICT)
SET @orph := (SELECT COUNT(*) FROM `orders` c WHERE c.`contactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`contactId`));
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND CONSTRAINT_NAME='fk_orders_contact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0 AND @orph=0, 'ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_contact` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orderItems.productId -> products [fk_orderItems_product] (RESTRICT)
SET @orph := (SELECT COUNT(*) FROM `orderItems` c WHERE c.`productId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `products` p WHERE p.`id` = c.`productId`));
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orderItems' AND CONSTRAINT_NAME='fk_orderItems_product' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0 AND @orph=0, 'ALTER TABLE `orderItems` ADD CONSTRAINT `fk_orderItems_product` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- invoices.contactId -> contacts [fk_invoices_contact] (RESTRICT)
SET @orph := (SELECT COUNT(*) FROM `invoices` c WHERE c.`contactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`contactId`));
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoices' AND CONSTRAINT_NAME='fk_invoices_contact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0 AND @orph=0, 'ALTER TABLE `invoices` ADD CONSTRAINT `fk_invoices_contact` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- waybills.contactId -> contacts [fk_waybills_contact] (RESTRICT)
SET @orph := (SELECT COUNT(*) FROM `waybills` c WHERE c.`contactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`contactId`));
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='waybills' AND CONSTRAINT_NAME='fk_waybills_contact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0 AND @orph=0, 'ALTER TABLE `waybills` ADD CONSTRAINT `fk_waybills_contact` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- users.roleId -> roles [fk_users_role] (RESTRICT)
SET @orph := (SELECT COUNT(*) FROM `users` c WHERE c.`roleId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `roles` p WHERE p.`id` = c.`roleId`));
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND CONSTRAINT_NAME='fk_users_role' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0 AND @orph=0, 'ALTER TABLE `users` ADD CONSTRAINT `fk_users_role` FOREIGN KEY (`roleId`) REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- invoices.orderId -> orders [fk_invoices_order] (SET NULL)
UPDATE `invoices` c SET c.`orderId` = NULL WHERE c.`orderId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orders` p WHERE p.`id` = c.`orderId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoices' AND CONSTRAINT_NAME='fk_invoices_order' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `invoices` ADD CONSTRAINT `fk_invoices_order` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- invoices.waybillId -> waybills [fk_invoices_waybill] (SET NULL)
UPDATE `invoices` c SET c.`waybillId` = NULL WHERE c.`waybillId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `waybills` p WHERE p.`id` = c.`waybillId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoices' AND CONSTRAINT_NAME='fk_invoices_waybill' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `invoices` ADD CONSTRAINT `fk_invoices_waybill` FOREIGN KEY (`waybillId`) REFERENCES `waybills` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- invoiceItems.productId -> products [fk_invoiceItems_product] (SET NULL)
UPDATE `invoiceItems` c SET c.`productId` = NULL WHERE c.`productId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `products` p WHERE p.`id` = c.`productId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoiceItems' AND CONSTRAINT_NAME='fk_invoiceItems_product' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `invoiceItems` ADD CONSTRAINT `fk_invoiceItems_product` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- invoiceItems.orderItemId -> orderItems [fk_invoiceItems_orderItem] (SET NULL)
UPDATE `invoiceItems` c SET c.`orderItemId` = NULL WHERE c.`orderItemId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orderItems` p WHERE p.`id` = c.`orderItemId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoiceItems' AND CONSTRAINT_NAME='fk_invoiceItems_orderItem' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `invoiceItems` ADD CONSTRAINT `fk_invoiceItems_orderItem` FOREIGN KEY (`orderItemId`) REFERENCES `orderItems` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- waybills.orderId -> orders [fk_waybills_order] (SET NULL)
UPDATE `waybills` c SET c.`orderId` = NULL WHERE c.`orderId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orders` p WHERE p.`id` = c.`orderId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='waybills' AND CONSTRAINT_NAME='fk_waybills_order' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `waybills` ADD CONSTRAINT `fk_waybills_order` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- waybills.invoiceId -> invoices [fk_waybills_invoice] (SET NULL)
UPDATE `waybills` c SET c.`invoiceId` = NULL WHERE c.`invoiceId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `invoices` p WHERE p.`id` = c.`invoiceId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='waybills' AND CONSTRAINT_NAME='fk_waybills_invoice' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `waybills` ADD CONSTRAINT `fk_waybills_invoice` FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- waybillItems.productId -> products [fk_waybillItems_product] (SET NULL)
UPDATE `waybillItems` c SET c.`productId` = NULL WHERE c.`productId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `products` p WHERE p.`id` = c.`productId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='waybillItems' AND CONSTRAINT_NAME='fk_waybillItems_product' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `waybillItems` ADD CONSTRAINT `fk_waybillItems_product` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- waybillItems.orderItemId -> orderItems [fk_waybillItems_orderItem] (SET NULL)
UPDATE `waybillItems` c SET c.`orderItemId` = NULL WHERE c.`orderItemId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orderItems` p WHERE p.`id` = c.`orderItemId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='waybillItems' AND CONSTRAINT_NAME='fk_waybillItems_orderItem' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `waybillItems` ADD CONSTRAINT `fk_waybillItems_orderItem` FOREIGN KEY (`orderItemId`) REFERENCES `orderItems` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- workOrders.orderId -> orders [fk_workOrders_order] (SET NULL)
UPDATE `workOrders` c SET c.`orderId` = NULL WHERE c.`orderId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orders` p WHERE p.`id` = c.`orderId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workOrders' AND CONSTRAINT_NAME='fk_workOrders_order' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `workOrders` ADD CONSTRAINT `fk_workOrders_order` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- workOrders.orderItemId -> orderItems [fk_workOrders_orderItem] (SET NULL)
UPDATE `workOrders` c SET c.`orderItemId` = NULL WHERE c.`orderItemId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orderItems` p WHERE p.`id` = c.`orderItemId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workOrders' AND CONSTRAINT_NAME='fk_workOrders_orderItem' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `workOrders` ADD CONSTRAINT `fk_workOrders_orderItem` FOREIGN KEY (`orderItemId`) REFERENCES `orderItems` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- workOrders.recipeId -> recipes [fk_workOrders_recipe] (SET NULL)
UPDATE `workOrders` c SET c.`recipeId` = NULL WHERE c.`recipeId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `recipes` p WHERE p.`id` = c.`recipeId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workOrders' AND CONSTRAINT_NAME='fk_workOrders_recipe' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `workOrders` ADD CONSTRAINT `fk_workOrders_recipe` FOREIGN KEY (`recipeId`) REFERENCES `recipes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- transactions.contactId -> contacts [fk_transactions_contact] (SET NULL)
UPDATE `transactions` c SET c.`contactId` = NULL WHERE c.`contactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`contactId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='transactions' AND CONSTRAINT_NAME='fk_transactions_contact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `transactions` ADD CONSTRAINT `fk_transactions_contact` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- transactions.orderId -> orders [fk_transactions_order] (SET NULL)
UPDATE `transactions` c SET c.`orderId` = NULL WHERE c.`orderId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orders` p WHERE p.`id` = c.`orderId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='transactions' AND CONSTRAINT_NAME='fk_transactions_order' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `transactions` ADD CONSTRAINT `fk_transactions_order` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- products.assortmentTemplateId -> assortmentTemplates [fk_products_assortmentTemplate] (SET NULL)
UPDATE `products` c SET c.`assortmentTemplateId` = NULL WHERE c.`assortmentTemplateId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `assortmentTemplates` p WHERE p.`id` = c.`assortmentTemplateId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND CONSTRAINT_NAME='fk_products_assortmentTemplate' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `products` ADD CONSTRAINT `fk_products_assortmentTemplate` FOREIGN KEY (`assortmentTemplateId`) REFERENCES `assortmentTemplates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- products.preferredSupplierId -> contacts [fk_products_supplier] (SET NULL)
UPDATE `products` c SET c.`preferredSupplierId` = NULL WHERE c.`preferredSupplierId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`preferredSupplierId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND CONSTRAINT_NAME='fk_products_supplier' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `products` ADD CONSTRAINT `fk_products_supplier` FOREIGN KEY (`preferredSupplierId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- checks.contactId -> contacts [fk_checks_contact] (SET NULL)
UPDATE `checks` c SET c.`contactId` = NULL WHERE c.`contactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`contactId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checks' AND CONSTRAINT_NAME='fk_checks_contact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `checks` ADD CONSTRAINT `fk_checks_contact` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- checks.endorsedToContactId -> contacts [fk_checks_endorsedContact] (SET NULL)
UPDATE `checks` c SET c.`endorsedToContactId` = NULL WHERE c.`endorsedToContactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`endorsedToContactId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checks' AND CONSTRAINT_NAME='fk_checks_endorsedContact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `checks` ADD CONSTRAINT `fk_checks_endorsedContact` FOREIGN KEY (`endorsedToContactId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- checks.journalEntryId -> journalEntries [fk_checks_journalEntry] (SET NULL)
UPDATE `checks` c SET c.`journalEntryId` = NULL WHERE c.`journalEntryId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `journalEntries` p WHERE p.`id` = c.`journalEntryId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checks' AND CONSTRAINT_NAME='fk_checks_journalEntry' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `checks` ADD CONSTRAINT `fk_checks_journalEntry` FOREIGN KEY (`journalEntryId`) REFERENCES `journalEntries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- checks.targetBankAccountId -> bankAccounts [fk_checks_targetBank] (SET NULL)
UPDATE `checks` c SET c.`targetBankAccountId` = NULL WHERE c.`targetBankAccountId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `bankAccounts` p WHERE p.`id` = c.`targetBankAccountId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checks' AND CONSTRAINT_NAME='fk_checks_targetBank' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `checks` ADD CONSTRAINT `fk_checks_targetBank` FOREIGN KEY (`targetBankAccountId`) REFERENCES `bankAccounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- checks.targetCashBoxId -> cashBoxes [fk_checks_targetCashBox] (SET NULL)
UPDATE `checks` c SET c.`targetCashBoxId` = NULL WHERE c.`targetCashBoxId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `cashBoxes` p WHERE p.`id` = c.`targetCashBoxId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checks' AND CONSTRAINT_NAME='fk_checks_targetCashBox' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `checks` ADD CONSTRAINT `fk_checks_targetCashBox` FOREIGN KEY (`targetCashBoxId`) REFERENCES `cashBoxes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- collectionReceipts.contactId -> contacts [fk_collectionReceipts_contact] (SET NULL)
UPDATE `collectionReceipts` c SET c.`contactId` = NULL WHERE c.`contactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`contactId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collectionReceipts' AND CONSTRAINT_NAME='fk_collectionReceipts_contact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `collectionReceipts` ADD CONSTRAINT `fk_collectionReceipts_contact` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- collectionReceipts.cashBoxId -> cashBoxes [fk_collectionReceipts_cashBox] (SET NULL)
UPDATE `collectionReceipts` c SET c.`cashBoxId` = NULL WHERE c.`cashBoxId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `cashBoxes` p WHERE p.`id` = c.`cashBoxId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collectionReceipts' AND CONSTRAINT_NAME='fk_collectionReceipts_cashBox' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `collectionReceipts` ADD CONSTRAINT `fk_collectionReceipts_cashBox` FOREIGN KEY (`cashBoxId`) REFERENCES `cashBoxes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- collectionReceipts.bankAccountId -> bankAccounts [fk_collectionReceipts_bank] (SET NULL)
UPDATE `collectionReceipts` c SET c.`bankAccountId` = NULL WHERE c.`bankAccountId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `bankAccounts` p WHERE p.`id` = c.`bankAccountId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collectionReceipts' AND CONSTRAINT_NAME='fk_collectionReceipts_bank' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `collectionReceipts` ADD CONSTRAINT `fk_collectionReceipts_bank` FOREIGN KEY (`bankAccountId`) REFERENCES `bankAccounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- collectionReceipts.checkId -> checks [fk_collectionReceipts_check] (SET NULL)
UPDATE `collectionReceipts` c SET c.`checkId` = NULL WHERE c.`checkId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `checks` p WHERE p.`id` = c.`checkId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collectionReceipts' AND CONSTRAINT_NAME='fk_collectionReceipts_check' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `collectionReceipts` ADD CONSTRAINT `fk_collectionReceipts_check` FOREIGN KEY (`checkId`) REFERENCES `checks` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- collectionReceipts.invoiceId -> invoices [fk_collectionReceipts_invoice] (SET NULL)
UPDATE `collectionReceipts` c SET c.`invoiceId` = NULL WHERE c.`invoiceId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `invoices` p WHERE p.`id` = c.`invoiceId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collectionReceipts' AND CONSTRAINT_NAME='fk_collectionReceipts_invoice' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `collectionReceipts` ADD CONSTRAINT `fk_collectionReceipts_invoice` FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- collectionReceipts.journalEntryId -> journalEntries [fk_collectionReceipts_journalEntry] (SET NULL)
UPDATE `collectionReceipts` c SET c.`journalEntryId` = NULL WHERE c.`journalEntryId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `journalEntries` p WHERE p.`id` = c.`journalEntryId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collectionReceipts' AND CONSTRAINT_NAME='fk_collectionReceipts_journalEntry' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `collectionReceipts` ADD CONSTRAINT `fk_collectionReceipts_journalEntry` FOREIGN KEY (`journalEntryId`) REFERENCES `journalEntries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- payrollRecords.journalEntryId -> journalEntries [fk_payrollRecords_journalEntry] (SET NULL)
UPDATE `payrollRecords` c SET c.`journalEntryId` = NULL WHERE c.`journalEntryId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `journalEntries` p WHERE p.`id` = c.`journalEntryId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payrollRecords' AND CONSTRAINT_NAME='fk_payrollRecords_journalEntry' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `payrollRecords` ADD CONSTRAINT `fk_payrollRecords_journalEntry` FOREIGN KEY (`journalEntryId`) REFERENCES `journalEntries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- auditLogs.userId -> users [fk_auditLogs_user] (SET NULL)
UPDATE `auditLogs` c SET c.`userId` = NULL WHERE c.`userId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `users` p WHERE p.`id` = c.`userId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='auditLogs' AND CONSTRAINT_NAME='fk_auditLogs_user' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `auditLogs` ADD CONSTRAINT `fk_auditLogs_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE TABLE IF NOT EXISTS operationRequests (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `scope` VARCHAR(100) NOT NULL,
  `requestKey` VARCHAR(100) NOT NULL,
  `payloadHash` CHAR(64) NOT NULL,
  `result` JSON NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_operation_request` (`userId`, `scope`, `requestKey`),
  KEY `idx_operation_completed` (`completedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
CREATE TABLE IF NOT EXISTS stockReservations (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `productId` BIGINT UNSIGNED NOT NULL,
  `orderId` BIGINT UNSIGNED NULL,
  `workOrderId` BIGINT UNSIGNED NULL,
  `color` VARCHAR(80) NULL,
  `size` VARCHAR(50) NULL,
  `quantity` DECIMAL(15,4) NOT NULL,
  `remainingQuantity` DECIMAL(15,4) NOT NULL,
  `status` ENUM('active','consumed','released') NOT NULL DEFAULT 'active',
  `createdBy` BIGINT UNSIGNED NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `releasedAt` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_reservations_product_status` (`productId`,`status`),
  KEY `idx_reservations_order` (`orderId`),
  KEY `idx_reservations_workOrder` (`workOrderId`),
  CONSTRAINT `fk_reservation_product` FOREIGN KEY (`productId`) REFERENCES products (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_reservation_order` FOREIGN KEY (`orderId`) REFERENCES orders (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_reservation_workOrder` FOREIGN KEY (`workOrderId`) REFERENCES workOrders (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS qualityChecks (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `workOrderId` BIGINT UNSIGNED NOT NULL,
  `inspectedQuantity` DECIMAL(15,4) NOT NULL,
  `rejectedQuantity` DECIMAL(15,4) NOT NULL DEFAULT 0,
  `result` ENUM('pass','fail') NOT NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `notes` TEXT NOT NULL,
  `createdBy` BIGINT UNSIGNED NOT NULL,
  `approvedBy` BIGINT UNSIGNED NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `approvedAt` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_quality_workOrder_status` (`workOrderId`,`status`),
  CONSTRAINT `fk_quality_workOrder` FOREIGN KEY (`workOrderId`) REFERENCES workOrders (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS purchaseRequests (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `requestNumber` VARCHAR(50) NOT NULL,
  `supplierId` BIGINT UNSIGNED NOT NULL,
  `items` JSON NOT NULL,
  `totalAmount` DECIMAL(15,2) NOT NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `notes` TEXT NOT NULL,
  `decisionReason` TEXT NULL,
  `createdBy` BIGINT UNSIGNED NOT NULL,
  `approvedBy` BIGINT UNSIGNED NULL,
  `orderId` BIGINT UNSIGNED NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decidedAt` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_purchase_request_number` (`requestNumber`),
  KEY `idx_purchase_requests_status` (`status`),
  CONSTRAINT `fk_purchase_request_supplier` FOREIGN KEY (`supplierId`) REFERENCES contacts (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_purchase_request_order` FOREIGN KEY (`orderId`) REFERENCES orders (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
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
