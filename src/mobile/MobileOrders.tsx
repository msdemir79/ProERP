import { useMemo, useState } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { useApiQueryFull } from '../hooks/useApiQuery';
import type { Order, OrderStatus } from '../types';
import { formatTRY, formatDate } from './format';
import { cn } from '../lib/utils';
import MobileOrderDetail from './MobileOrderDetail';

const STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  draft: { label: 'Taslak', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  confirmed: { label: 'Onaylandı', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  partially_shipped: { label: 'Kısmi Sevk', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  completed: { label: 'Tamamlandı', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  cancelled: { label: 'İptal', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
};

/** Mobil sipariş listesi: tarihe göre sıralı; satıra dokununca detay + onay açılır. */
export default function MobileOrders() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Order | null>(null);
  const { data, loading } = useApiQueryFull<Order[]>(() => api.orders.list(), [], ['orders']);

  const rows = useMemo(() => {
    const all = data ?? [];
    const term = q.trim().toLocaleLowerCase('tr-TR');
    const list = term ? all.filter((o) => o.orderNumber.toLocaleLowerCase('tr-TR').includes(term)) : all;
    return [...list]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 200);
  }, [data, q]);

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Sipariş no ara"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {loading && <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Yükleniyor…</div>}
      {!loading && rows.length === 0 && (
        <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Sonuç bulunamadı.</div>
      )}

      <div className="space-y-2">
        {rows.map((o) => {
          const st = STATUS[o.status] ?? STATUS.draft;
          return (
            <button
              type="button"
              key={o.id ?? o.orderNumber}
              onClick={() => setSel(o)}
              className="w-full flex items-start justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 text-left"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{o.orderNumber}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatDate(o.date)} · {o.type === 'sales' ? 'Satış' : 'Alış'}
                </div>
                <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold', st.cls)}>
                  {st.label}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <div className="text-sm font-bold tabular-nums">{formatTRY(o.grandTotal || 0)}</div>
                <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
              </div>
            </button>
          );
        })}
      </div>

      {sel && <MobileOrderDetail order={sel} onClose={() => setSel(null)} />}
    </>
  );
}
