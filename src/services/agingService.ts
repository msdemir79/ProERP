/**
 * Accounts Receivable (AR) & Accounts Payable (AP) Aging Analysis
 * and Cash Flow Projection Service for DMR Nexus
 */

import { api } from '../api/client';
import type { Invoice, Contact, CheckNote } from '../types';
import { exportToCsv } from '../lib/exportService';

export interface AgingBucketItem {
  contactId: number;
  contactCode: string;
  contactName: string;
  contactType: 'customer' | 'supplier' | 'both';
  phone?: string;
  city?: string;
  taxNumber?: string;
  
  // Aging buckets in TRY
  notDue: number;       // Vadesi Gelmemiş (Güncel)
  days1_30: number;     // 1 - 30 Gün Gecikmiş
  days31_60: number;    // 31 - 60 Gün Gecikmiş
  days61_90: number;    // 61 - 90 Gün Gecikmiş
  days90Plus: number;   // 90+ Gün Gecikmiş (Kritik / Takip)
  
  totalBalance: number; // Toplam Açık Bakiye
  overdueBalance: number; // Toplam Vadesi Geçmiş Tutar
  oldestOverdueDate?: Date;
  overdueDaysMax: number;
  riskScore: 'low' | 'medium' | 'high' | 'critical';
  unpaidInvoiceCount: number;
}

export interface CashFlowPeriod {
  periodKey: string;
  periodLabel: string;
  expectedInflow: number;  // Beklenen Tahsilat (Faturalar + Portföy Çekleri)
  expectedOutflow: number; // Beklenen Ödeme (Alış Faturaları + Verilen Çekler)
  netFlow: number;         // Net Nakit Değişimi
  projectedBalance: number;// Kümülatif Kasa/Banka Bakiyesi
}

export interface AgingAnalysisResult {
  asOfDate: Date;
  customers: AgingBucketItem[];
  suppliers: AgingBucketItem[];
  summary: {
    totalAR: number;          // Toplam Alacak
    overdueAR: number;        // Vadesi Geçen Alacak
    criticalAR: number;       // 90+ Günlük Kritik Alacak
    totalAP: number;          // Toplam Borç
    overdueAP: number;        // Vadesi Geçen Borç
    criticalAP: number;       // 90+ Günlük Borç
    netLiquidityGap: number;  // Net Likidite Açığı / Fazlası (AR - AP)
    currentCashAndBank: number;// Anlık Mevcut Kasa & Banka Toplamı
    dsoDays: number;          // Ortalama Tahsilat Süresi (Days Sales Outstanding)
  };
  cashFlowProjection: CashFlowPeriod[];
}

export const agingService = {
  /**
   * Computes multi-bucket aging analysis and cash flow projection
   */
  async getAgingAnalysis(asOfDate: Date = new Date()): Promise<AgingAnalysisResult> {
    const today = new Date(asOfDate);
    today.setHours(23, 59, 59, 999);

    // Fetch relevant data from Dexie DB
    const [invoices, contacts, checks, cashBoxes, bankAccounts] = await Promise.all([
      api.invoices.list(),
      api.contacts.list(),
      api.checks.list(),
      api.cashBoxes.list(),
      api.bankAccounts.list()
    ]);

    const contactMap = new Map<number, Contact>();
    contacts.forEach(c => {
      if (c.id) contactMap.set(c.id, c);
    });

    // Current liquid funds in Cash & Bank
    const totalCash = cashBoxes.reduce((sum, cb) => sum + (cb.balance || 0), 0);
    const totalBank = bankAccounts.reduce((sum, ba) => sum + (ba.balance || 0), 0);
    const currentCashAndBank = totalCash + totalBank;

    // Filter unpaid or partially paid active invoices
    const activeInvoices = invoices.filter(inv => 
      inv.status !== 'cancelled' && 
      inv.paymentStatus !== 'paid'
    );

    // Map by Contact for Customer (Sales) and Supplier (Purchase)
    const customerBucketMap = new Map<number, AgingBucketItem>();
    const supplierBucketMap = new Map<number, AgingBucketItem>();

    const getOrCreateBucket = (contactId: number, isCustomer: boolean): AgingBucketItem => {
      const targetMap = isCustomer ? customerBucketMap : supplierBucketMap;
      if (targetMap.has(contactId)) {
        return targetMap.get(contactId)!;
      }

      const contact = contactMap.get(contactId);
      const item: AgingBucketItem = {
        contactId,
        contactCode: contact?.code || `C-${contactId}`,
        contactName: contact?.companyTitle || contact?.name || 'Bilinmeyen Cari',
        contactType: contact?.type || (isCustomer ? 'customer' : 'supplier'),
        phone: contact?.phone || contact?.mobile,
        city: contact?.city,
        taxNumber: contact?.taxNumber || contact?.tcKimlik,
        notDue: 0,
        days1_30: 0,
        days31_60: 0,
        days61_90: 0,
        days90Plus: 0,
        totalBalance: 0,
        overdueBalance: 0,
        overdueDaysMax: 0,
        riskScore: 'low',
        unpaidInvoiceCount: 0
      };
      targetMap.set(contactId, item);
      return item;
    };

    activeInvoices.forEach(inv => {
      const isSales = inv.type === 'sales';
      const bucket = getOrCreateBucket(inv.contactId, isSales);

      // Remaining open amount for this invoice
      const paid = inv.paidAmount || 0;
      const openAmount = Math.max(0, inv.grandTotal - paid);
      if (openAmount <= 0.01) return;

      bucket.totalBalance += openAmount;
      bucket.unpaidInvoiceCount += 1;

      // Determine due date vs today
      const invoiceDate = new Date(inv.date);
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(invoiceDate.getTime() + 30 * 86400000);

      const diffTime = today.getTime() - dueDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        // Not due yet (Güncel)
        bucket.notDue += openAmount;
      } else if (diffDays <= 30) {
        // 1 - 30 days overdue
        bucket.days1_30 += openAmount;
        bucket.overdueBalance += openAmount;
      } else if (diffDays <= 60) {
        // 31 - 60 days overdue
        bucket.days31_60 += openAmount;
        bucket.overdueBalance += openAmount;
      } else if (diffDays <= 90) {
        // 61 - 90 days overdue
        bucket.days61_90 += openAmount;
        bucket.overdueBalance += openAmount;
      } else {
        // 90+ days overdue
        bucket.days90Plus += openAmount;
        bucket.overdueBalance += openAmount;
      }

      if (diffDays > bucket.overdueDaysMax) {
        bucket.overdueDaysMax = diffDays;
        bucket.oldestOverdueDate = dueDate;
      }
    });

    // Calculate risk scores for each contact
    const evaluateRisk = (b: AgingBucketItem) => {
      if (b.days90Plus > 0 || b.overdueDaysMax > 90) {
        b.riskScore = 'critical';
      } else if (b.days61_90 > 0 || b.overdueDaysMax > 60) {
        b.riskScore = 'high';
      } else if (b.days31_60 > 0 || b.overdueDaysMax > 30) {
        b.riskScore = 'medium';
      } else {
        b.riskScore = 'low';
      }
    };

    const customers = Array.from(customerBucketMap.values())
      .filter(c => c.totalBalance > 0.01)
      .sort((a, b) => b.totalBalance - a.totalBalance);
    customers.forEach(evaluateRisk);

    const suppliers = Array.from(supplierBucketMap.values())
      .filter(s => s.totalBalance > 0.01)
      .sort((a, b) => b.totalBalance - a.totalBalance);
    suppliers.forEach(evaluateRisk);

    // Totals
    const totalAR = customers.reduce((sum, c) => sum + c.totalBalance, 0);
    const overdueAR = customers.reduce((sum, c) => sum + c.overdueBalance, 0);
    const criticalAR = customers.reduce((sum, c) => sum + c.days90Plus, 0);

    const totalAP = suppliers.reduce((sum, s) => sum + s.totalBalance, 0);
    const overdueAP = suppliers.reduce((sum, s) => sum + s.overdueBalance, 0);
    const criticalAP = suppliers.reduce((sum, s) => sum + s.days90Plus, 0);

    const netLiquidityGap = totalAR - totalAP;

    // Days Sales Outstanding (DSO) estimate
    const past90DaysSales = invoices
      .filter(i => i.type === 'sales' && i.status !== 'cancelled' && (today.getTime() - new Date(i.date).getTime()) <= 90 * 86400000)
      .reduce((sum, i) => sum + i.grandTotal, 0);
    const dsoDays = past90DaysSales > 0 ? Math.round((totalAR / past90DaysSales) * 90) : 38;

    // --- Cash Flow Projection (Next 6 periods) ---
    const projectionPeriods: CashFlowPeriod[] = [
      { periodKey: 'w1', periodLabel: '1. Hafta (0 - 7 Gün)', expectedInflow: 0, expectedOutflow: 0, netFlow: 0, projectedBalance: 0 },
      { periodKey: 'w2', periodLabel: '2. Hafta (8 - 14 Gün)', expectedInflow: 0, expectedOutflow: 0, netFlow: 0, projectedBalance: 0 },
      { periodKey: 'm1', periodLabel: '3 - 4. Hafta (15 - 30 Gün)', expectedInflow: 0, expectedOutflow: 0, netFlow: 0, projectedBalance: 0 },
      { periodKey: 'm2', periodLabel: '2. Ay (31 - 60 Gün)', expectedInflow: 0, expectedOutflow: 0, netFlow: 0, projectedBalance: 0 },
      { periodKey: 'm3', periodLabel: '3. Ay (61 - 90 Gün)', expectedInflow: 0, expectedOutflow: 0, netFlow: 0, projectedBalance: 0 },
      { periodKey: 'future', periodLabel: '3+ Ay (90+ Gün)', expectedInflow: 0, expectedOutflow: 0, netFlow: 0, projectedBalance: 0 }
    ];

    const assignToPeriod = (futureDays: number, amount: number, isInflow: boolean) => {
      let idx = 0;
      if (futureDays <= 7) idx = 0;
      else if (futureDays <= 14) idx = 1;
      else if (futureDays <= 30) idx = 2;
      else if (futureDays <= 60) idx = 3;
      else if (futureDays <= 90) idx = 4;
      else idx = 5;

      if (isInflow) {
        projectionPeriods[idx].expectedInflow += amount;
      } else {
        projectionPeriods[idx].expectedOutflow += amount;
      }
    };

    // 1. Inflow from active sales invoices
    activeInvoices.forEach(inv => {
      const openAmount = Math.max(0, inv.grandTotal - (inv.paidAmount || 0));
      if (openAmount <= 0.01) return;

      const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(new Date(inv.date).getTime() + 30 * 86400000);
      const daysAhead = Math.max(0, Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

      assignToPeriod(daysAhead, openAmount, inv.type === 'sales');
    });

    // 2. Inflow / Outflow from Checks (Portföydeki Alınan/Verilen Çekler & Senetler)
    checks.forEach(chk => {
      // Sadece henüz tahsil edilmemiş veya ödenmemiş aktif portföy/tahsilattaki çekleri dahil et
      if (chk.status !== 'portfolio' && chk.status !== 'bank_collection') return;

      const dueDate = new Date(chk.dueDate);
      const daysAhead = Math.max(0, Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
      const isInflow = chk.type === 'received_check' || chk.type === 'received_note'; // Alınan çek = tahsilat (inflow), Verilen çek = ödeme (outflow)

      assignToPeriod(daysAhead, chk.amount, isInflow);
    });

    // Calculate cumulative projected balance
    let runningBalance = currentCashAndBank;
    projectionPeriods.forEach(p => {
      p.netFlow = p.expectedInflow - p.expectedOutflow;
      runningBalance += p.netFlow;
      p.projectedBalance = runningBalance;
    });

    return {
      asOfDate: today,
      customers,
      suppliers,
      summary: {
        totalAR,
        overdueAR,
        criticalAR,
        totalAP,
        overdueAP,
        criticalAP,
        netLiquidityGap,
        currentCashAndBank,
        dsoDays
      },
      cashFlowProjection: projectionPeriods
    };
  },

  /**
   * Export aging report to Excel/CSV with Turkish characters support
   */
  exportAgingToCsv(items: AgingBucketItem[], title: string = 'Alacak_Yaslandirma_Raporu') {
    const headers = [
      'Cari Kodu',
      'Cari Ünvanı',
      'Vadesi Gelmemiş (Güncel)',
      '1-30 Gün Gecikmiş',
      '31-60 Gün Gecikmiş',
      '61-90 Gün Gecikmiş',
      '90+ Gün Gecikmiş (Kritik)',
      'Toplam Açık Bakiye',
      'Vadesi Geçmiş Tutar',
      'Risk Durumu',
      'Açık Fatura Sayısı'
    ];

    const rows = items.map(it => [
      it.contactCode,
      it.contactName,
      it.notDue.toFixed(2),
      it.days1_30.toFixed(2),
      it.days31_60.toFixed(2),
      it.days61_90.toFixed(2),
      it.days90Plus.toFixed(2),
      it.totalBalance.toFixed(2),
      it.overdueBalance.toFixed(2),
      it.riskScore.toUpperCase(),
      it.unpaidInvoiceCount
    ]);

    exportToCsv(title, headers, rows);
  }
};
