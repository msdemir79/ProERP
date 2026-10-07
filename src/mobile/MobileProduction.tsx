import { useMemo, useState } from 'react';
import { Search, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import { useApiQueryFull } from '../hooks/useApiQuery';
import { PRODUCTION_STAGES_CONFIG } from '../services/productionService';
import type { WorkOrder, Product } from '../types';
import { formatNum } from './format';
import { cn } from '../lib/utils';

const MATERIAL_LABEL: Record<string, { text: string; cls: string }> = {
  materials_ready: { text: 'Malzeme Hazır', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  po_created: { text: 'Sipariş Yolda', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  materials_shortage: { text: 'Hammadde Eksik', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
  materials_consumed: { text: 'Harcandı', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  no_recipe: { text: 'Reçete Yok', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
};

/** Mobil üretim listesi: iş emirlerini kompakt grid (tablo) satırlarıyla gösterir. */
export default function MobileProduction() {
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<string>('all');
  const { data: workOrders, loading } = useApiQueryFull<WorkOrder[]>(() => api.workOrders.list(), [], ['workOrders']);
  const { data: products } = useApiQueryFull<Product[]>(() => api.products.list(), [], ['products']);

  const nameOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of products ?? []) if (p.id != null) m.set(p.id, p.name);
    return m;
  }, [products]);

  const rows = useMemo(() => {
    const all = (workOrders ?? []).filter((w) => w.status !== 'cancelled');
    const term = q.trim().toLocaleLowerCase('tr-TR');
    let list = stage === 'all' ? all : all.filter((w) => w.currentStage === stage);
    if (term) {
      list = list.filter((w) =>
        `${w.barcode} ${nameOf.get(w.productId) || ''} ${w.orderNumber || ''} ${w.customerName || ''}`
          .toLocaleLowerCase('tr-TR')
          .includes(term),
      );
    }
    return list.slice(0, 200);
  }, [workOrders, q, stage, nameOf]);

  const stageLabel = (id: string) => PRODUCTION_STAGES_CONFIG.find((s) => s.id === id)?.shortLabel ?? id;

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="İş emri, model, sipariş ara"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          type="button"
          onClick={() => setStage('all')}
          className={cn(
            'shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold border',
            stage === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
          )}
        >
          Tümü
        </button>
        {PRODUCTION_STAGES_CONFIG.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStage(stage === s.id ? 'all' : s.id)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold border',
              stage === s.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
            )}
          >
            {s.shortLabel}
          </button>
        ))}
      </div>

      {loading && <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Yükleniyor…</div>}
      {!loading && rows.length === 0 && (
        <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Sonuç bulunamadı.</div>
      )}

      <div className="space-y-2">
        {rows.map((wo) => {
          const mat = wo.materialStatus ? MATERIAL_LABEL[wo.materialStatus] : undefined;
          return (
            <div key={wo.id ?? wo.barcode} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{nameOf.get(wo.productId) || '-'}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {wo.barcode}{wo.orderNumber ? ` · ${wo.orderNumber}` : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold tabular-nums">{formatNum(wo.quantity || 0)}</div>
                  <div className="text-[10px] text-slate-400">{[wo.color, wo.size].filter(Boolean).join('/') || '-'}</div>
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 text-[10px] font-semibold">
                  {stageLabel(wo.currentStage)}
                </span>
                {mat && (
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', mat.cls)}>
                    {wo.materialStatus === 'materials_shortage' && <AlertTriangle className="w-3 h-3" />}
                    {mat.text}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
