import { Wallet, TrendingUp, TrendingDown, Scale, AlertTriangle } from 'lucide-react';
import { useAppSummary } from '../hooks/useAppSummary';
import { formatTRY, formatNum } from './format';

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'default',
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'good' | 'bad' | 'warn';
}) {
  const toneCls =
    tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'bad'
        ? 'text-rose-600 dark:text-rose-400'
        : tone === 'warn'
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-slate-900 dark:text-slate-100';
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium truncate">{label}</span>
      </div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${toneCls}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">{sub}</div>}
    </div>
  );
}

/** Telefona sığan yönetici özeti: masaüstü Dashboard'un yoğun grafikleri yerine kilit metrikler. */
export default function MobileDashboard() {
  const { stats, loading } = useAppSummary();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 dark:text-slate-400 text-sm">
        Özet yükleniyor…
      </div>
    );
  }

  const net = stats.totalLiquidAssets + stats.openSalesTotal - stats.openPurchaseTotal;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Wallet} label="Likit Varlıklar" value={formatTRY(stats.totalLiquidAssets)} sub={`Kasa + Banka`} />
        <StatCard icon={TrendingUp} label="Bekleyen Alacak" value={formatTRY(stats.openSalesTotal)} sub={`${stats.openSalesInvoicesCount} açık fatura`} tone="good" />
        <StatCard icon={TrendingDown} label="Ödenecek Borç" value={formatTRY(stats.openPurchaseTotal)} sub="Açık alışlar" tone="bad" />
        <StatCard icon={Scale} label="Net Durum" value={formatTRY(net)} tone={net >= 0 ? 'good' : 'bad'} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={TrendingUp} label="Gelir" value={formatTRY(stats.income)} tone="good" />
        <StatCard icon={TrendingDown} label="Gider" value={formatTRY(stats.expense)} tone="bad" />
      </div>

      <button
        type="button"
        className="w-full rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3 text-left"
      >
        <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm font-semibold">Kritik Stok Uyarıları</span>
          <span className="ml-auto rounded-full bg-rose-600 text-white text-xs font-bold px-2 py-0.5 tabular-nums">
            {formatNum(stats.lowStockCount)}
          </span>
        </div>
        <div className="mt-1 text-[11px] text-rose-600/80 dark:text-rose-400/80">
          Stok sekmesinden kritik ürünleri görüntüleyin.
        </div>
      </button>
    </>
  );
}
