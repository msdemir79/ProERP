import {
  api,
  callOp,
} from '../api/client';
import type {
  Product,
  AppSettings,
  BarcodeVariant,
} from '../types';

/**
 * Sistem ve barkod ayarları servisi. erpService'ten bölündü (#46).
 */

export const settingsService = {
  // --- Barcode & Modular Settings ---
  async getSystemSettings(): Promise<AppSettings> {
    const settings = await api.settings.get('global_settings') || await api.settings.get('global_barcode');
    const defaultSettings: AppSettings = {
      id: 'global_settings',
      barcodeType: 'CODE-128',
      barcodePrefix: '869',
      nextBarcodeSequence: 1000000,
      company: {
        companyName: 'DMR Nexus',
        companyTitle: 'DMR Nexus',
        taxOffice: 'Güngören Vergi Dairesi',
        taxNumber: '7340981245',
        tradeRegistryNo: '458921-5',
        phone: '+90 212 555 44 33',
        email: '',
        website: '',
        address: 'Sanayi Cad. Ayakkabıcılar Sanayi Sitesi No: 42 Kat: 3 Güngören',
        city: 'İstanbul / TÜRKİYE',
        bankName: 'Garanti BBVA - Merter Kurumsal',
        iban: 'TR12 0006 2000 1234 5678 9012 34',
        currency: 'TRY'
      },
      stock: {
        barcodeType: 'CODE-128',
        barcodePrefix: '869',
        nextBarcodeSequence: 1000000,
        autoBarcodeOnProductCreate: true,
        defaultCriticalStockThreshold: 10,
        defaultShoeSizes: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46']
      },
      order: {
        salesOrderPrefix: 'SIP-2026-',
        purchaseOrderPrefix: 'SAT-2026-',
        waybillSalesPrefix: 'IRS-2026-',
        waybillPurchasePrefix: 'GIR-2026-',
        invoiceSalesPrefix: 'EFT-2026-',
        invoicePurchasePrefix: 'ALS-2026-',
        defaultVatRate: 20,
        defaultCurrency: 'TRY',
        defaultPaymentTermDays: 30,
        autoCreateWorkOrdersOnConfirm: true,
        autoDeductStockOnWaybill: true
      },
      production: {
        workOrderPrefix: 'WO-',
        defaultDailyCapacityPairs: 650,
        scrapTolerancePercentage: 2,
        autoConsumeMaterialsOnStart: true
      },
      finance: {
        defaultCurrency: 'TRY',
        checkAlertDaysBeforeDue: 7,
        defaultCustomerAccountCode: '120.01',
        defaultSupplierAccountCode: '320.01',
        defaultFinishedStockAccountCode: '157.01',
        defaultRawMaterialAccountCode: '150.01',
        defaultSalesRevenueAccountCode: '600.01',
        defaultVatCalculatedAccountCode: '391.01',
        defaultVatDeductibleAccountCode: '191.01'
      },
      hr: {
        weeklyWorkHours: 45,
        dailyWorkHours: 8,
        weekendDays: [0],
        overtimeWeekdayMultiplier: 1.5,
        overtimeWeekendMultiplier: 2.0,
        annualLeaveBaseDays: 14,
        sgkEmployeeRate: 14,
        unemploymentEmployeeRate: 1,
        sgkEmployerRate: 16.75,
        unemploymentEmployerRate: 2,
        incomeTaxRate: 15,
        stampTaxPerMille: 7.59,
        minWageGross: 33030,
        minWageNet: 28075.50,
        minWageIncomeTaxExemption: 4211.33,
        minWageStampTaxExemption: 250.70,
        sgkMonthlyHours: 225,
        nonSgkMonthlyHours: 240
      }
    };

    if (!settings) {
      await api.settings.save(defaultSettings);
      return defaultSettings;
    }

    return {
      ...defaultSettings,
      ...settings,
      company: { ...defaultSettings.company, ...settings.company },
      stock: { ...defaultSettings.stock, ...settings.stock },
      order: { ...defaultSettings.order, ...settings.order },
      production: { ...defaultSettings.production, ...settings.production },
      finance: { ...defaultSettings.finance, ...settings.finance },
      hr: { ...defaultSettings.hr, ...settings.hr },
    };
  },

  async updateSystemSettings(settings: AppSettings) {
    const updated = {
      ...settings,
      id: 'global_settings',
      barcodeType: settings.stock?.barcodeType || settings.barcodeType || 'CODE-128',
      barcodePrefix: settings.stock?.barcodePrefix || settings.barcodePrefix || '869',
      nextBarcodeSequence: settings.stock?.nextBarcodeSequence || settings.nextBarcodeSequence || 1000000
    };
    return callOp<AppSettings>('save-settings', { settings: updated, expectedVersion: settings.version });
  },

  async getBarcodeSettings(): Promise<AppSettings> {
    return await this.getSystemSettings();
  },

  async updateBarcodeSettings(settings: AppSettings) {
    return await this.updateSystemSettings(settings);
  },

  async generateAutomatedBarcodes(product: Partial<Product>) {
    const settings = await this.getBarcodeSettings();
    let nextSeq = settings.nextBarcodeSequence || 1000000;
    const prefix = settings.barcodePrefix || '';
    
    const generateBarcode = () => {
      let code = `${prefix}${nextSeq}`;
      if (settings.barcodeType === 'EAN-13') {
        const numPart = `${nextSeq}`.padStart(Math.max(0, 12 - prefix.length), '0');
        const raw12 = `${prefix}${numPart}`.slice(0, 12).padStart(12, '0');
        let sum = 0;
        for (let i = 0; i < 12; i++) {
          sum += parseInt(raw12[i], 10) * (i % 2 === 0 ? 1 : 3);
        }
        const checkDigit = (10 - (sum % 10)) % 10;
        code = `${raw12}${checkDigit}`;
      }
      nextSeq++;
      return code;
    };

    const colorBoxBarcodes: { color: string, barcode: string }[] = [];
    const variantBarcodes: BarcodeVariant[] = [];

    const effectiveColors = product.colors && product.colors.length > 0 ? product.colors : ['Genel'];

    if ((product.isFootwear || product.hasSizeVariants) && product.assortment && product.assortment.length > 0) {
      for (const color of effectiveColors) {
        // One box barcode per color
        colorBoxBarcodes.push({
          color: color,
          barcode: generateBarcode()
        });

        // Variant barcodes
        for (const item of product.assortment) {
          variantBarcodes.push({
            size: item.size,
            color: color,
            barcode: generateBarcode(),
            stock: 0
          });
        }
      }
    } else {
      // General item or items without assortment
      for (const color of effectiveColors) {
        colorBoxBarcodes.push({ color: color, barcode: generateBarcode() });
      }
    }

    await this.updateBarcodeSettings({ ...settings, nextBarcodeSequence: nextSeq });

    return { colorBoxBarcodes, variantBarcodes };
  },
};
