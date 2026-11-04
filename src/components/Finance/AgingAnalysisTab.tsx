import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  ShieldAlert,
  Clock,
  Download,
  FileText,
  Building2,
  Phone,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  BarChart3,
  Printer
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  CartesianGrid, 
  AreaChart, 
  Area, 
  Line 
} from 'recharts';
import { agingService, AgingAnalysisResult, AgingBucketItem, CashFlowPeriod } from '../../services/agingService';
import { cn } from '../../lib/utils';
import { printHtml } from '../../lib/printService';
import DataGrid, { StatusPill, type PillTone } from '../Common/DataGrid';

interface AgingAnalysisTabProps {
  onOpenReceiptModal?: (contactId: number, type: 'collection' | 'disbursement') => void;
  onOpenStatementModal?: (contactId: number) => void;
}

export const AgingAnalysisTab: React.FC<AgingAnalysisTabProps> = ({
  onOpenReceiptModal,
  onOpenStatementModal
}) => {
  const [loading, setLoading] = useState(true);
  const [agingData, setAgingData] = useState<AgingAnalysisResult | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'customers' | 'suppliers' | 'cash_flow'>('customers');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [riskFilter, setRiskFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await agingService.getAgingAnalysis();
      setAgingData(data);
    } catch (err) {
      console.error('Yaşlandırma analizi yüklenirken hata:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter items
  const currentList = activeSubTab === 'customers' ? (agingData?.customers || []) : (agingData?.suppliers || []);

  const filteredItems = useMemo(() => {
    return currentList.filter(item => {
      if (onlyOverdue && item.overdueBalance <= 0) return false;
      if (riskFilter !== 'all' && item.riskScore !== riskFilter) return false;
      return true;
    });
  }, [currentList, onlyOverdue, riskFilter]);

  // Chart data for Aging Buckets
  const agingChartData = useMemo(() => {
    if (!agingData) return [];
    
    const c = agingData.customers;
    const s = agingData.suppliers;

    return [
      {
        name: 'Vadesi Gelmemiş',
        'Müşteri Alacağı': c.reduce((sum, it) => sum + it.notDue, 0),
        'Tedarikçi Borcu': s.reduce((sum, it) => sum + it.notDue, 0),
      },
      {
        name: '1 - 30 Gün',
        'Müşteri Alacağı': c.reduce((sum, it) => sum + it.days1_30, 0),
        'Tedarikçi Borcu': s.reduce((sum, it) => sum + it.days1_30, 0),
      },
      {
        name: '31 - 60 Gün',
        'Müşteri Alacağı': c.reduce((sum, it) => sum + it.days31_60, 0),
        'Tedarikçi Borcu': s.reduce((sum, it) => sum + it.days31_60, 0),
      },
      {
        name: '61 - 90 Gün',
        'Müşteri Alacağı': c.reduce((sum, it) => sum + it.days61_90, 0),
        'Tedarikçi Borcu': s.reduce((sum, it) => sum + it.days61_90, 0),
      },
      {
        name: '90+ Gün (Kritik)',
        'Müşteri Alacağı': c.reduce((sum, it) => sum + it.days90Plus, 0),
        'Tedarikçi Borcu': s.reduce((sum, it) => sum + it.days90Plus, 0),
      },
    ];
  }, [agingData]);

  const handleExportCsv = () => {
    if (!agingData) return;
    const itemsToExport = activeSubTab === 'customers' ? agingData.customers : agingData.suppliers;
    const title = activeSubTab === 'customers' ? 'Musteri_Alacak_Yaslandirma' : 'Tedarikci_Borc_Yaslandirma';
    agingService.exportAgingToCsv(itemsToExport, title);
  };

  const handlePrintTable = () => {
    const title = activeSubTab === 'customers' ? 'Müşteri Alacak Yaşlandırma Raporu' : 'Tedarikçi Borç Yaşlandırma Raporu';
    const rowsHtml = filteredItems.map(it => `
      <tr>
        <td style="padding: 6px; border: 1px solid #ddd; font-weight: bold;">${it.contactCode}</td>
        <td style="padding: 6px; border: 1px solid #ddd;">${it.contactName}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">₺${it.notDue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">₺${it.days1_30.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">₺${it.days31_60.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">₺${it.days61_90.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right; color: #b91c1c; font-weight: bold;">₺${it.days90Plus.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: right; font-weight: bold;">₺${it.totalBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
        <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${it.riskScore.toUpperCase()}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="margin-bottom: 4px;">DMR NEXUS - ${title}</h2>
        <p style="color: #666; font-size: 12px; margin-bottom: 16px;">Tarih: ${new Date().toLocaleDateString('tr-TR')}</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background-color: #f1f5f9;">
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">Cari Kodu</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: left;">Cari Ünvanı</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Vadesi Gelmemiş</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">1-30 Gün</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">31-60 Gün</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">61-90 Gün</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">90+ Gün</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Toplam Bakiye</th>
              <th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">Risk</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    printHtml(htmlContent, { title, landscape: true });
  };

  const riskMeta: Record<AgingBucketItem['riskScore'], { tone: PillTone; label: string }> = {
    critical: { tone: 'red', label: 'KRİTİK (90+ GÜN)' },
    high: { tone: 'amber', label: 'YÜKSEK RİSK' },
    medium: { tone: 'blue', label: 'DİKKAT (30+ GÜN)' },
    low: { tone: 'green', label: 'GÜNCEL / DÜŞÜK' },
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm font-semibold">Vade ve yaşlandırma verileri hesaplanıyor...</p>
      </div>
    );
  }

  const s = agingData?.summary;

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      
      {/* 1. EXECUTIVE PATRON KPI KARTLARI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Toplam Alacak (AR) */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Toplam Alacak (AR)</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-xl font-black font-mono text-slate-900 dark:text-slate-100">
              ₺{s?.totalAR.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}
            </div>
          </div>
          <div className="mt-1 flex items-center text-xs text-rose-600 font-medium">
            <span>Vadesi Geçen: ₺{s?.overdueAR.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
            <span className="text-slate-400 mx-1">•</span>
            <span className="text-slate-500">
              %{s?.totalAR ? Math.round(((s?.overdueAR || 0) / s.totalAR) * 100) : 0}
            </span>
          </div>
        </div>

        {/* 90+ Gün Kritik Alacak */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-rose-200 dark:border-rose-900/40 shadow-2xs bg-rose-50/20">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider">90+ Gün Kritik Alacak</span>
            <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-black font-mono text-rose-700 dark:text-rose-400">
            ₺{s?.criticalAR.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}
          </div>
          <p className="mt-1 text-[11px] text-rose-600/80">Acil tahsilat & hukuk takibi gerektiren bakiye</p>
        </div>

        {/* Toplam Tedarikçi Borcu (AP) */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tedarikçi Borcu (AP)</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-black font-mono text-slate-900 dark:text-slate-100">
            ₺{s?.totalAP.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}
          </div>
          <div className="mt-1 text-xs text-amber-600 font-medium">
            <span>Vadesi Geçen Borç: ₺{s?.overdueAP.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        {/* Net Likidite Dengesi */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Net Likidite Farkı</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className={cn(
            "mt-2 text-xl font-black font-mono",
            (s?.netLiquidityGap || 0) >= 0 ? "text-emerald-600" : "text-rose-600"
          )}>
            ₺{s?.netLiquidityGap.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Mevcut Kasa & Banka: ₺{s?.currentCashAndBank.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</p>
        </div>

        {/* DSO - Ortalama Tahsilat Süresi */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ort. Tahsilat Süresi (DSO)</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-black font-mono text-purple-700 dark:text-purple-400">
            {s?.dsoDays || 38} <span className="text-sm font-sans font-normal text-slate-500">Gün</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Sektör ortalaması: 45 gün</p>
        </div>

      </div>

      {/* 2. SUB-TAB BAR & TOOLBAR */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          
          {/* Sub Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveSubTab('customers')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                activeSubTab === 'customers'
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Müşteri Alacak Yaşlandırma ({agingData?.customers.length || 0})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('suppliers')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                activeSubTab === 'suppliers'
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Tedarikçi Borç Yaşlandırma ({agingData?.suppliers.length || 0})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('cash_flow')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer",
                activeSubTab === 'cash_flow'
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              )}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Nakit Akış Projeksiyonu</span>
            </button>
          </div>

          {/* Action Export Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
              title="Excel / CSV Olarak İndir"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel İndir</span>
            </button>
            <button
              onClick={handlePrintTable}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
              title="Raporu Yazdır"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Yazdır</span>
            </button>
            <button
              onClick={loadData}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              title="Yenile"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>

      {/* 3. VISUAL CHARTS SECTION */}
      {activeSubTab === 'cash_flow' ? (
        /* Nakit Akış Projeksiyon Görünümü */
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                Dönemsel Nakit Akış Projeksiyonu & Likidite Seyri
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Müşteri vadeleri, tedarikçi ödemeleri ve vadeli çeklerin dönemlere göre net nakit dengesi.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500">Başlangıç Likit Fon:</span>
              <span className="text-sm font-black font-mono ml-1.5 text-slate-900 dark:text-slate-100">
                ₺{s?.currentCashAndBank.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) || '0,00'}
              </span>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={agingData?.cashFlowProjection || []} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorInflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorOutflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="periodLabel" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}k`} />
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <Tooltip 
                  formatter={(val: any) => [`₺${Number(val).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, '']}
                />
                <Legend />
                <Area type="monotone" dataKey="expectedInflow" name="Beklenen Giriş (Tahsilat)" stroke="#10b981" fillOpacity={1} fill="url(#colorInflow)" />
                <Area type="monotone" dataKey="expectedOutflow" name="Beklenen Çıkış (Ödeme)" stroke="#f59e0b" fillOpacity={1} fill="url(#colorOutflow)" />
                <Line type="monotone" dataKey="projectedBalance" name="Tahmini Kasa/Banka Sonu" stroke="#6366f1" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Cash Flow Forecast Table */}
          <DataGrid<CashFlowPeriod>
            columns={[
              { key: 'periodLabel', title: 'Dönem / Vade Aralığı', render: (period) => <span className="font-semibold text-slate-800 dark:text-slate-200">{period.periodLabel}</span> },
              { key: 'expectedInflow', title: 'Beklenen Tahsilat (Giriş)', align: 'right', render: (period) => <span className="font-mono text-emerald-600 font-bold">₺{period.expectedInflow.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> },
              { key: 'expectedOutflow', title: 'Beklenen Ödeme (Çıkış)', align: 'right', render: (period) => <span className="font-mono text-amber-600 font-bold">₺{period.expectedOutflow.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> },
              { key: 'netFlow', title: 'Net Dönem Akışı', align: 'right', render: (period) => <span className={cn('font-mono font-bold', period.netFlow >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{period.netFlow >= 0 ? '+' : ''}₺{period.netFlow.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> },
              { key: 'projectedBalance', title: 'Tahmini Kasa/Banka Dengesi', align: 'right', render: (period) => <span className="font-mono font-black text-indigo-700 dark:text-indigo-400">₺{period.projectedBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> },
            ]}
            data={agingData?.cashFlowProjection || []}
            rowKey="periodKey"
            emptyMessage="Nakit akış projeksiyonu hesaplanamadı."
          />
        </div>
      ) : (
        /* Yaşlandırma Dağılım Çubuk Grafiği */
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                Vade Gruplarına Göre Borç & Alacak Dağılımı
              </h4>
              <p className="text-xs text-slate-500">0-30 Gün, 31-60 Gün, 61-90 Gün ve 90+ Gün yaşlandırma dilimleri</p>
            </div>
          </div>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingChartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}k`} />
                <Tooltip 
                  formatter={(val: any) => [`₺${Number(val).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, '']}
                />
                <Legend />
                <Bar dataKey="Müşteri Alacağı" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Tedarikçi Borcu" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 4. DETAYLI YAŞLANDIRMA TABLOSU */}
      {activeSubTab !== 'cash_flow' && (
        <DataGrid<AgingBucketItem>
          columns={[
            {
              key: 'contactName', title: 'Cari Kodu & Ünvanı',
              render: (item) => (
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100">{item.contactName}</div>
                  <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                    <span>{item.contactCode}</span>
                    {item.phone && (
                      <span className="flex items-center gap-0.5 text-slate-400">
                        <Phone className="w-2.5 h-2.5" />
                        {item.phone}
                      </span>
                    )}
                    <span className="text-indigo-600 font-semibold">{item.unpaidInvoiceCount} Açık Belge</span>
                  </div>
                </div>
              ),
              filterValue: (item) => `${item.contactCode} ${item.contactName} ${item.phone || ''}`,
            },
            { key: 'notDue', title: 'Vadesi Gelmemiş (Güncel)', align: 'right', render: (item) => <span className="font-mono text-slate-700 dark:text-slate-300">{item.notDue > 0 ? `₺${item.notDue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '-'}</span> },
            { key: 'days1_30', title: '1 - 30 Gün', align: 'right', render: (item) => <span className="font-mono">{item.days1_30 > 0 ? <span className="text-amber-700 font-semibold">₺{item.days1_30.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> : '-'}</span> },
            { key: 'days31_60', title: '31 - 60 Gün', align: 'right', render: (item) => <span className="font-mono">{item.days31_60 > 0 ? <span className="text-orange-700 font-semibold">₺{item.days31_60.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> : '-'}</span> },
            { key: 'days61_90', title: '61 - 90 Gün', align: 'right', render: (item) => <span className="font-mono">{item.days61_90 > 0 ? <span className="text-rose-600 font-bold">₺{item.days61_90.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> : '-'}</span> },
            { key: 'days90Plus', title: '90+ Gün (Kritik)', align: 'right', render: (item) => <span className="font-mono">{item.days90Plus > 0 ? <span className="text-rose-700 dark:text-rose-400 font-black bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900">₺{item.days90Plus.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> : '-'}</span> },
            { key: 'totalBalance', title: 'Toplam Açık Bakiye', align: 'right', render: (item) => <span className="font-mono font-black text-slate-900 dark:text-slate-100">₺{item.totalBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span> },
            {
              key: 'riskScore', title: 'Risk Seviyesi', align: 'center',
              render: (item) => <StatusPill tone={riskMeta[item.riskScore].tone}>{riskMeta[item.riskScore].label}</StatusPill>,
              filterValue: (item) => riskMeta[item.riskScore].label,
            },
          ]}
          data={filteredItems}
          rowKey="contactId"
          toolbar={
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyOverdue}
                  onChange={(e) => setOnlyOverdue(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Yalnızca Vadesi Geçenler</span>
              </label>

              <div className="flex items-center gap-1 text-slate-500">
                <span>Risk:</span>
                <select
                  value={riskFilter}
                  onChange={(e: any) => setRiskFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
                >
                  <option value="all">Tüm Risk Düzeyleri</option>
                  <option value="critical">Kritik (90+ Gün)</option>
                  <option value="high">Yüksek (61-90 Gün)</option>
                  <option value="medium">Dikkat (31-60 Gün)</option>
                  <option value="low">Düşük / Güncel</option>
                </select>
              </div>
            </div>
          }
          rowActions={(item) => (
            <div className="flex items-center gap-1">
              {onOpenReceiptModal && (
                <button
                  onClick={() => onOpenReceiptModal(item.contactId, activeSubTab === 'customers' ? 'collection' : 'disbursement')}
                  className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 rounded text-[11px] font-bold transition-colors cursor-pointer"
                  title={activeSubTab === 'customers' ? 'Tahsilat Makbuzu Kes' : 'Tediye Makbuzu Kes'}
                >
                  {activeSubTab === 'customers' ? 'Tahsilat' : 'Tediye'}
                </button>
              )}
              {onOpenStatementModal && (
                <button
                  onClick={() => onOpenStatementModal(item.contactId)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Cari Ekstresi"
                >
                  <FileText className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
          emptyMessage="Filtre kriterlerine uygun cari kayıt bulunamadı."
        />
      )}

    </div>
  );
};
