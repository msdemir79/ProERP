import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Printer, 
  FileDown, 
  Search, 
  Calendar, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Building2, 
  RefreshCw,
  Filter,
  CheckCircle2,
  Receipt,
  FileText,
  Copy,
  Check
} from 'lucide-react';
import { financeService } from '../../services/financeService';
import { printTabularReport } from '../../lib/printService';
import { exportToCsv } from '../../lib/exportService';
import type { BankAccount } from '../../types';

interface BankStatementModalProps {
  bankAccount: BankAccount | null;
  isOpen: boolean;
  onClose: () => void;
}

type QuickDateRange = 'all' | 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

export default function BankStatementModal({ bankAccount, isOpen, onClose }: BankStatementModalProps) {
  const [quickDate, setQuickDate] = useState<QuickDateRange>('this_month');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copiedIban, setCopiedIban] = useState<boolean>(false);
  const [statementData, setStatementData] = useState<{
    accountInfo: {
      id: number;
      title: string;
      code: string;
      accountCode: string;
      currency: string;
      currentBalance: number;
      extra?: string;
    };
    initialBalance: number;
    totalDebit: number;
    totalCredit: number;
    periodBalance: number;
    items: any[];
  } | null>(null);

  // Set date ranges
  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (quickDate === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (quickDate === 'this_week') {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      setStartDate(monday.toISOString().split('T')[0]);
      setEndDate(new Date().toISOString().split('T')[0]);
    } else if (quickDate === 'this_month') {
      const firstDay = new Date(y, m, 1);
      const lastDay = new Date(y, m + 1, 0);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(lastDay.toISOString().split('T')[0]);
    } else if (quickDate === 'last_month') {
      const firstDay = new Date(y, m - 1, 1);
      const lastDay = new Date(y, m, 0);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(lastDay.toISOString().split('T')[0]);
    } else if (quickDate === 'this_year') {
      const firstDay = new Date(y, 0, 1);
      const lastDay = new Date(y, 11, 31);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(lastDay.toISOString().split('T')[0]);
    } else if (quickDate === 'all') {
      setStartDate('');
      setEndDate('');
    }
  }, [quickDate]);

  // Load statement data
  const loadStatement = async () => {
    if (!bankAccount || !bankAccount.id) return;
    setIsLoading(true);
    try {
      const sDate = startDate ? new Date(startDate + 'T00:00:00') : undefined;
      const eDate = endDate ? new Date(endDate + 'T23:59:59') : undefined;
      const result = await financeService.getBankAccountStatement(bankAccount.id, {
        startDate: sDate,
        endDate: eDate,
        search: searchTerm,
        typeFilter: typeFilter !== 'all' ? typeFilter : undefined
      });
      setStatementData(result);
    } catch (err) {
      console.error('Banka ekstresi yüklenirken hata:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && bankAccount?.id) {
      loadStatement();
    }
  }, [isOpen, bankAccount?.id, startDate, endDate, searchTerm, typeFilter]);

  if (!isOpen || !bankAccount) return null;

  const copyIban = () => {
    if (bankAccount.iban) {
      navigator.clipboard.writeText(bankAccount.iban);
      setCopiedIban(true);
      setTimeout(() => setCopiedIban(false), 2000);
    }
  };

  // Print Report
  const handlePrint = () => {
    if (!statementData) return;
    const dateRangeStr = startDate && endDate 
      ? `${new Date(startDate).toLocaleDateString('tr-TR')} - ${new Date(endDate).toLocaleDateString('tr-TR')}`
      : 'Tüm Zamanlar';

    const headers = ['TARİH', 'İŞLEM NO / REF', 'İŞLEM TÜRÜ', 'AÇIKLAMA', 'GÖNDEREN / ALICI CARİ', 'YATAN / BORÇ (₺)', 'ÇEKİLEN / ALACAK (₺)', 'BAKİYE (₺)'];
    
    const rows: (string | number)[][] = [];

    // Devir row
    rows.push([
      startDate ? new Date(startDate).toLocaleDateString('tr-TR') : '-',
      '-',
      'DEVİR',
      'Dönem Başı Devir Bakiyesi',
      '-',
      statementData.initialBalance > 0 ? statementData.initialBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-',
      statementData.initialBalance < 0 ? Math.abs(statementData.initialBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-',
      statementData.initialBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })
    ]);

    statementData.items.forEach(item => {
      rows.push([
        new Date(item.date).toLocaleDateString('tr-TR'),
        item.documentNo || '-',
        item.typeLabel || item.type,
        item.description || '-',
        item.contactName || '-',
        item.debit > 0 ? item.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-',
        item.credit > 0 ? item.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-',
        item.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })
      ]);
    });

    const stats = [
      { label: 'DEVİR BAKİYESİ', value: `₺${statementData.initialBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
      { label: 'TOPLAM GELEN (HAVALE/EFT)', value: `₺${statementData.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
      { label: 'TOPLAM GİDEN (HAVALE/EFT)', value: `₺${statementData.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` },
      { label: 'DÖNEM SONU BAKİYE', value: `₺${statementData.periodBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` }
    ];

    printTabularReport(
      `BANKA HESAP EKSTRESİ: ${bankAccount.bankName.toUpperCase()} (${bankAccount.branchName || 'Merkez'})`,
      `IBAN: ${bankAccount.iban} | TDHP Hesap: ${bankAccount.accountCode || '102.01'} | Tarih Aralığı: ${dateRangeStr}`,
      headers,
      rows,
      stats
    );
  };

  // Export CSV
  const handleExportCsv = () => {
    if (!statementData) return;
    const headers = ['Tarih', 'İşlem No', 'İşlem Türü', 'Açıklama', 'Gönderen / Alıcı Cari', 'Yatan (Borç ₺)', 'Çekilen (Alacak ₺)', 'Bakiye (₺)'];
    const rows = [
      [
        startDate || '',
        '',
        'DEVİR',
        'Dönem Başı Devir Bakiyesi',
        '',
        statementData.initialBalance > 0 ? statementData.initialBalance : 0,
        statementData.initialBalance < 0 ? Math.abs(statementData.initialBalance) : 0,
        statementData.initialBalance
      ],
      ...statementData.items.map(item => [
        new Date(item.date).toLocaleDateString('tr-TR'),
        item.documentNo || '',
        item.typeLabel || item.type,
        item.description || '',
        item.contactName || '',
        item.debit || 0,
        item.credit || 0,
        item.balance || 0
      ])
    ];

    exportToCsv(`Banka_Ekstresi_${bankAccount.bankName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  const getTypeBadge = (type: string, typeLabel: string) => {
    switch (type) {
      case 'collection':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"><ArrowDownLeft className="w-3 h-3 text-emerald-600" />{typeLabel}</span>;
      case 'disbursement':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800"><ArrowUpRight className="w-3 h-3 text-rose-600" />{typeLabel}</span>;
      case 'virman_in':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><RefreshCw className="w-3 h-3 text-blue-600" />{typeLabel}</span>;
      case 'virman_out':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"><RefreshCw className="w-3 h-3 text-indigo-600" />{typeLabel}</span>;
      case 'check_in':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"><Receipt className="w-3 h-3 text-amber-600" />{typeLabel}</span>;
      case 'payroll':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800"><FileText className="w-3 h-3 text-purple-600" />{typeLabel}</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{typeLabel}</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col border border-gray-200 overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center shadow-inner">
              <Building2 className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">{bankAccount.bankName}</h2>
                <span className="text-xs text-blue-200 bg-blue-900/60 px-2 py-0.5 rounded border border-blue-700/50">
                  {bankAccount.branchName || 'Merkez Şube'}
                </span>
                <span className="text-xs text-slate-400 font-mono">TDHP: {bankAccount.accountCode || '102.01'}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-xs text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700 select-all">
                  {bankAccount.iban}
                </span>
                <button
                  type="button"
                  onClick={copyIban}
                  className="text-slate-400 hover:text-white transition-colors"
                  title="IBAN Kopyala"
                >
                  {copiedIban ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
              title="Resmi Banka Ekstresi Yazdır"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Yazdır</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 shadow-sm transition-colors cursor-pointer"
              title="Excel / CSV Olarak İndir"
            >
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline">CSV İndir</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-gray-200">
          <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-gray-200 shadow-xs">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Devir Bakiyesi</div>
            <div className="text-lg font-bold text-gray-800 mt-1 font-mono">
              ₺{(statementData?.initialBalance || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">Dönem Başı Öncesi</div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-emerald-100 shadow-xs">
            <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
              Toplam Yatan (Havale/EFT)
            </div>
            <div className="text-lg font-bold text-emerald-600 mt-1 font-mono">
              ₺{(statementData?.totalDebit || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-emerald-600/70 mt-0.5">Dönem İçi Gelenler</div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-rose-100 shadow-xs">
            <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
              Toplam Çekilen (Havale/EFT)
            </div>
            <div className="text-lg font-bold text-rose-600 mt-1 font-mono">
              ₺{(statementData?.totalCredit || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-rose-600/70 mt-0.5">Dönem İçi Çıkışlar</div>
          </div>

          <div className="bg-blue-50/60 p-3.5 rounded-xl border border-blue-200 shadow-xs">
            <div className="text-[11px] font-bold text-blue-900 uppercase tracking-wider">Dönem Sonu Bakiye</div>
            <div className="text-lg font-bold text-blue-700 mt-1 font-mono">
              ₺{(statementData?.periodBalance || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-blue-600/70 mt-0.5">Mevcut Mevduat Bakiyesi</div>
          </div>
        </div>

        {/* FILTERS TOOLBAR */}
        <div className="p-4 bg-white dark:bg-slate-900 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          {/* Quick Date Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {[
              { id: 'today', label: 'Bugün' },
              { id: 'this_week', label: 'Bu Hafta' },
              { id: 'this_month', label: 'Bu Ay' },
              { id: 'last_month', label: 'Geçen Ay' },
              { id: 'this_year', label: 'Bu Yıl' },
              { id: 'all', label: 'Tümü' }
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setQuickDate(d.id as QuickDateRange)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  quickDate === d.id
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Date Pickers & Type Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-xs bg-gray-50 border border-gray-300 rounded-lg px-2 py-1">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setQuickDate('custom');
                }}
                className="bg-transparent border-none text-xs focus:ring-0 p-0 text-gray-700"
              />
              <span className="text-gray-400">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setQuickDate('custom');
                }}
                className="bg-transparent border-none text-xs focus:ring-0 p-0 text-gray-700"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-900 text-gray-700"
            >
              <option value="all">Tüm Hareket Türleri</option>
              <option value="collection">Gelen Havale/EFT</option>
              <option value="disbursement">Giden Havale/EFT</option>
              <option value="virman_in">Virman (Gelen)</option>
              <option value="virman_out">Virman (Giden)</option>
              <option value="check_in">Çek Tahsilatı (Takas)</option>
              <option value="payroll">Maaş Transferleri</option>
            </select>

            <div className="relative min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Evrak, cari, açıklama..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1 text-xs border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={loadStatement}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-gray-200 transition-colors"
              title="Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* TRANSACTIONS TABLE */}
        <div className="flex-1 overflow-y-auto min-h-[320px]">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm font-medium text-gray-600">Banka hareketleri ve bakiye hesaplanıyor...</p>
            </div>
          ) : !statementData || statementData.items.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-2" />
              <p className="text-base font-semibold text-gray-700">Seçilen aralıkta banka hareketi bulunamadı.</p>
              <p className="text-xs text-gray-400 mt-1">Farklı bir tarih aralığı veya filtre deneyebilirsiniz.</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800/80 sticky top-0 z-10 text-gray-600 font-bold tracking-wider">
                <tr>
                  <th className="py-2.5 px-3.5 text-left">Tarih</th>
                  <th className="py-2.5 px-3.5 text-left">İşlem / Fiş No</th>
                  <th className="py-2.5 px-3.5 text-left">İşlem Türü</th>
                  <th className="py-2.5 px-3.5 text-left">Açıklama</th>
                  <th className="py-2.5 px-3.5 text-left">Gönderen / Alıcı Cari</th>
                  <th className="py-2.5 px-3.5 text-right text-emerald-700">Yatan (Borç ₺)</th>
                  <th className="py-2.5 px-3.5 text-right text-rose-700">Çekilen (Alacak ₺)</th>
                  <th className="py-2.5 px-3.5 text-right text-blue-900">Yürüyen Bakiye (₺)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {/* Devir Row */}
                <tr className="bg-slate-50 dark:bg-slate-800/70 font-semibold text-gray-700">
                  <td className="py-2 px-3.5 text-gray-500">
                    {startDate ? new Date(startDate).toLocaleDateString('tr-TR') : '-'}
                  </td>
                  <td className="py-2 px-3.5 font-mono text-gray-400">-</td>
                  <td className="py-2 px-3.5">
                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 dark:text-slate-200 text-[11px] font-bold">
                      DEVİR
                    </span>
                  </td>
                  <td className="py-2 px-3.5 text-gray-600 italic">Dönem Başı Devir Bakiyesi</td>
                  <td className="py-2 px-3.5 text-gray-400">-</td>
                  <td className="py-2 px-3.5 text-right font-mono text-emerald-700">
                    {statementData.initialBalance > 0 ? `₺${statementData.initialBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td className="py-2 px-3.5 text-right font-mono text-rose-700">
                    {statementData.initialBalance < 0 ? `₺${Math.abs(statementData.initialBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td className="py-2 px-3.5 text-right font-mono font-bold text-gray-900 bg-slate-100 dark:bg-slate-800/50">
                    ₺{statementData.initialBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>

                {/* Period Movement Rows */}
                {statementData.items.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-2.5 px-3.5 whitespace-nowrap text-gray-600">
                      {new Date(item.date).toLocaleDateString('tr-TR')}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono font-medium text-blue-700 whitespace-nowrap">
                      {item.documentNo || '-'}
                    </td>
                    <td className="py-2.5 px-3.5 whitespace-nowrap">
                      {getTypeBadge(item.type, item.typeLabel)}
                    </td>
                    <td className="py-2.5 px-3.5 max-w-xs truncate text-gray-800" title={item.description}>
                      {item.description}
                    </td>
                    <td className="py-2.5 px-3.5 max-w-xs truncate text-gray-600 font-medium" title={item.contactName}>
                      {item.contactName || '-'}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-emerald-600 whitespace-nowrap">
                      {item.debit > 0 ? `₺${item.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-rose-600 whitespace-nowrap">
                      {item.credit > 0 ? `₺${item.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-bold text-blue-950 bg-blue-50/20 whitespace-nowrap">
                      ₺{item.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2 border-slate-300 text-gray-900 sticky bottom-0">
                <tr>
                  <td colSpan={5} className="py-2.5 px-3.5 text-right uppercase tracking-wider text-xs">
                    Dönem Toplamları & Kapanış Bakiyesi:
                  </td>
                  <td className="py-2.5 px-3.5 text-right font-mono text-emerald-700 text-xs">
                    ₺{(statementData.totalDebit || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-3.5 text-right font-mono text-rose-700 text-xs">
                    ₺{(statementData.totalCredit || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-3.5 text-right font-mono text-blue-700 text-sm bg-blue-100/50">
                    ₺{(statementData.periodBalance || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
          <div>
            Toplam <span className="font-bold text-gray-800">{statementData?.items.length || 0}</span> adet hareket listeleniyor.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white dark:bg-slate-900 hover:bg-gray-100 text-gray-700 font-semibold rounded-lg border border-gray-300 transition-colors shadow-xs cursor-pointer"
          >
            Kapat
          </button>
        </div>

      </div>
    </div>
  );
}
