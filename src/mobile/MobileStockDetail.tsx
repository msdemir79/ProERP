import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useApiQueryFull } from '../hooks/useApiQuery';
import { inventoryService } from '../services/inventoryService';
import { showToast } from '../lib/feedback';
import type { Product, InventoryLog } from '../types';
import { formatNum, formatDate } from './format';
import MobileSheet from './MobileSheet';
import { cn } from '../lib/utils';

const CAT_LABEL: Record<string, string> = {
  finished: 'Mamul',
  semi_finished: 'Yarı Mamul',
  raw_material: 'Hammadde',
  accessory: 'Aksesuar',
};

function signed(l: InventoryLog): number {
  const q = Math.abs(l.quantity || 0);
  return l.type === 'in' || l.type === 'production_in' ? q : -q;
}

/** Stok detayı: renk/beden kırılımı + son hareketler + hızlı stok düzeltme. */
export default function MobileStockDetail({ product, onClose }: { product: Product; onClose: () => void }) {
  const pid = product.id ?? -1;
  const { data, loading, refetch } = useApiQueryFull<InventoryLog[]>(
    () => (pid >= 0 ? api.inventoryLogs.list({ where: { productId: pid } }) : Promise.resolve([])),
    [pid],
    ['inventoryLogs'],
  );

  const variants = product.hasSizeVariants || product.isFootwear;
  const [form, setForm] = useState({ type: 'in' as 'in' | 'out', quantity: 1, color: '', size: '', description: '' });
  const [busy, setBusy] = useState(false);

  const { breakdown, recent } = useMemo(() => {
    const logs = data ?? [];
    const map = new Map<string, number>();
    for (const l of logs) {
      const key = `${(l.color || '-').toLocaleUpperCase('tr-TR')} / ${l.size || '-'}`;
      map.set(key, (map.get(key) || 0) + signed(l));
    }
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const rec = [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);
    return { breakdown: rows, recent: rec };
  }, [data]);

  async function submit() {
    const qty = Number(form.quantity) || 0;
    if (qty <= 0) {
      showToast('Miktar sıfırdan büyük olmalı.', 'warning');
      return;
    }
    if (variants && (!form.color.trim() || !form.size.trim())) {
      showToast('Renk ve beden zorunlu.', 'warning');
      return;
    }
    setBusy(true);
    try {
      await inventoryService.adjustStock(
        pid,
        qty,
        form.type,
        form.description.trim() || 'Mobil stok düzeltme',
        variants ? { color: form.color.trim(), size: form.size.trim() } : undefined,
      );
      showToast('Stok güncellendi.', 'success');
      setForm({ type: 'in', quantity: 1, color: '', size: '', description: '' });
      refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : err, 'error');
    } finally {
      setBusy(false);
    }
  }

  const critical = (product.stock || 0) <= (product.minStock || 0);
  const inputCls =
    'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <MobileSheet title={product.name} subtitle={`${product.code}${product.categoryType ? ' · ' + (CAT_LABEL[product.categoryType] ?? product.categoryType) : ''}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Mevcut Stok</div>
            <div className={cn('text-lg font-bold tabular-nums', critical ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100')}>
              {formatNum(product.stock || 0)} <span className="text-xs font-medium">{product.unit}</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Min. Stok</div>
            <div className="text-lg font-bold tabular-nums">{formatNum(product.minStock || 0)}</div>
          </div>
        </div>

        {variants && breakdown.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Renk / Beden Dağılımı</h3>
            <div className="grid grid-cols-2 gap-2">
              {breakdown.map(([key, qty]) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5">
                  <span className="text-[11px] truncate">{key}</span>
                  <span className={cn('text-xs font-bold tabular-nums', qty > 0 ? 'text-slate-900 dark:text-slate-100' : 'text-rose-600 dark:text-rose-400')}>{formatNum(qty)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">Stok Düzelt</h3>
          <div className="grid grid-cols-2 gap-2">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'in' | 'out' })} className={inputCls}>
              <option value="in">Giriş (+)</option>
              <option value="out">Çıkış (−)</option>
            </select>
            <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className={inputCls} placeholder="Miktar" />
          </div>
          {variants && (
            <div className="grid grid-cols-2 gap-2">
              <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className={inputCls} placeholder="Renk" />
              <input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className={inputCls} placeholder="Beden" />
            </div>
          )}
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="Açıklama (opsiyonel)" />
          <button type="button" disabled={busy} onClick={submit} className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </section>

        <section>
          <h3 className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Son Hareketler</h3>
          {loading && <div className="py-4 text-center text-xs text-slate-500">Yükleniyor…</div>}
          {!loading && recent.length === 0 && <div className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">Hareket yok.</div>}
          <div className="space-y-1.5">
            {recent.map((l) => {
              const s = signed(l);
              return (
                <div key={l.id} className="flex items-center gap-2 rounded-lg border border-slate-100 dark:border-slate-800 px-2.5 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs truncate">{l.description || l.type}</div>
                    <div className="text-[10px] text-slate-400">{formatDate(l.date)}{(l.color || l.size) ? ` · ${l.color ?? ''} ${l.size ?? ''}`.trim() : ''}</div>
                  </div>
                  <span className={cn('text-xs font-bold tabular-nums shrink-0', s >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                    {s >= 0 ? '+' : ''}{formatNum(s)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </MobileSheet>
  );
}
