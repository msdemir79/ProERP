import { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../api/client';
import { useApiQueryFull } from '../hooks/useApiQuery';
import { orderService } from '../services/orderService';
import { showToast } from '../lib/feedback';
import type { Order, OrderItem, Product, OrderStatus } from '../types';
import { formatTRY, formatNum, formatDate } from './format';
import MobileSheet from './MobileSheet';
import { cn } from '../lib/utils';

const STATUS: Record<OrderStatus, string> = {
  draft: 'Taslak',
  confirmed: 'Onaylandı',
  partially_shipped: 'Kısmi Sevk',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

/** Sipariş detayı: satırlar + toplamlar; taslaksa onaylama aksiyonu. */
export default function MobileOrderDetail({ order, onClose }: { order: Order; onClose: () => void }) {
  const oid = order.id ?? -1;
  const [busy, setBusy] = useState(false);

  const { data: items, loading: loadingItems } = useApiQueryFull<OrderItem[]>(
    () => (oid >= 0 ? api.orderItems.list({ where: { orderId: oid } }) : Promise.resolve([])),
    [oid],
    ['orderItems'],
  );
  const { data: products } = useApiQueryFull<Product[]>(() => api.products.list(), [], ['products']);

  const nameOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of products ?? []) if (p.id != null) m.set(p.id, p.name);
    return m;
  }, [products]);

  async function confirm() {
    setBusy(true);
    try {
      await orderService.updateOrder(oid, { status: 'confirmed' });
      showToast(`${order.orderNumber} onaylandı.`, 'success');
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : err, 'error');
    } finally {
      setBusy(false);
    }
  }

  const rows = items ?? [];

  return (
    <MobileSheet title={order.orderNumber} subtitle={`${formatDate(order.date)} · ${order.type === 'sales' ? 'Satış' : 'Alış'} · ${STATUS[order.status] ?? order.status}`} onClose={onClose}>
      <div className="space-y-4">
        {loadingItems && <div className="py-4 text-center text-xs text-slate-500">Yükleniyor…</div>}
        {!loadingItems && rows.length === 0 && <div className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">Satır yok.</div>}

        <div className="space-y-1.5">
          {rows.map((it) => (
            <div key={it.id} className="rounded-lg border border-slate-100 dark:border-slate-800 px-2.5 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{nameOf.get(it.productId) ?? `Ürün #${it.productId}`}</div>
                  {(it.color || it.size) && <div className="text-[10px] text-slate-400 truncate">{[it.color, it.size].filter(Boolean).join(' / ')}</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-bold tabular-nums">{formatTRY(it.total || 0)}</div>
                  <div className="text-[10px] text-slate-400 tabular-nums">{formatNum(it.quantity || 0)} × {formatTRY(it.unitPrice || 0)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-1 text-sm">
          <div className="flex justify-between text-slate-600 dark:text-slate-300"><span>Ara Toplam</span><span className="tabular-nums">{formatTRY(order.totalAmount || 0)}</span></div>
          {!!order.discountAmount && <div className="flex justify-between text-slate-600 dark:text-slate-300"><span>İskonto</span><span className="tabular-nums">−{formatTRY(order.discountAmount)}</span></div>}
          <div className="flex justify-between text-slate-600 dark:text-slate-300"><span>KDV</span><span className="tabular-nums">{formatTRY(order.taxAmount || 0)}</span></div>
          <div className="flex justify-between border-t border-slate-100 dark:border-slate-800 pt-1 font-bold"><span>Genel Toplam</span><span className="tabular-nums">{formatTRY(order.grandTotal || 0)}</span></div>
        </div>

        {order.status === 'draft' && (
          <button type="button" disabled={busy} onClick={confirm} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            <CheckCircle2 className="w-4 h-4" /> {busy ? 'Onaylanıyor…' : 'Siparişi Onayla'}
          </button>
        )}
      </div>
    </MobileSheet>
  );
}
