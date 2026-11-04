import { useEffect, useMemo, useState } from 'react';
import { Search, AlertTriangle, ChevronRight, ScanBarcode } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useApiQueryFull } from '../hooks/useApiQuery';
import type { Product } from '../types';
import { formatNum } from './format';
import { cn } from '../lib/utils';
import MobileStockDetail from './MobileStockDetail';
import CameraBarcodeScannerModal from '../components/Common/CameraBarcodeScannerModal';
import { isNativeApp, scanBarcodeNative } from './nativeBridge';

/** Mobil stok listesi: kritik (stok<=min) uyarıları + arama + kamera barkod okuyucu; karta dokununca detay açılır. */
export default function MobileInventory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedProductId = searchParams.get('productId');
  const [q, setQ] = useState('');
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [sel, setSel] = useState<Product | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const { data, loading, refetch } = useApiQueryFull<Product[]>(() => api.products.list(), [], ['products']);

  useEffect(() => {
    if (!requestedProductId) { setSel(null); return; }
    const id = Number(requestedProductId);
    if (!Number.isSafeInteger(id) || id <= 0) { setSel(null); return; }
    const listedProduct = data?.find((product) => product.id === id);
    if (listedProduct) { setSel(listedProduct); return; }
    let active = true;
    api.products.get(id)
      .then((product) => { if (active) setSel(product ?? null); })
      .catch(() => { if (active) setSel(null); });
    return () => { active = false; };
  }, [requestedProductId, data]);

  const openProduct = (product: Product) => {
    setSel(product);
    if (product.id != null) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('productId', String(product.id));
        return next;
      });
    }
  };

  const closeProduct = () => {
    setSel(null);
    if (requestedProductId) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('productId');
        return next;
      }, { replace: true });
    }
  };

  const handleOpenScanner = async () => {
    if (isNativeApp()) {
      const code = await scanBarcodeNative();
      if (code) {
        const found = (data ?? []).find(
          (p) =>
            p.barcode === code ||
            p.code === code ||
            p.variantBarcodes?.some((vb) => vb.barcode === code),
        );
        if (found) {
          openProduct(found);
        } else {
          setQ(code);
        }
      }
      return;
    }
    setScannerOpen(true);
  };

  const { rows, criticalCount } = useMemo(() => {
    const all = data ?? [];
    const critical = all.filter((p) => (p.stock || 0) <= (p.minStock || 0));
    const term = q.trim().toLocaleLowerCase('tr-TR');
    let list = onlyCritical ? critical : all;
    if (term) {
      list = list.filter((p) => `${p.name} ${p.code}`.toLocaleLowerCase('tr-TR').includes(term));
    }
    return { rows: list.slice(0, 200), criticalCount: critical.length };
  }, [data, q, onlyCritical]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOnlyCritical((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2 rounded-xl border p-3 text-left',
          onlyCritical
            ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40'
            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',
        )}
      >
        <AlertTriangle className="w-4 h-4 text-rose-500" />
        <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">Kritik Stok</span>
        <span className="ml-auto rounded-full bg-rose-600 text-white text-xs font-bold px-2 py-0.5 tabular-nums">
          {formatNum(criticalCount)}
        </span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{onlyCritical ? 'gizleniyor' : 'filtrele'}</span>
      </button>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Stok ara (ad, kod)"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button
          type="button"
          onClick={handleOpenScanner}
          title="Kamera ile Barkod Oku"
          aria-label="Kamera ile barkod oku"
          className="flex items-center justify-center p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95 transition-all shadow-xs shrink-0"
        >
          <ScanBarcode className="w-5 h-5" />
        </button>
      </div>

      {loading && <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Yükleniyor…</div>}
      {!loading && rows.length === 0 && (
        <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Sonuç bulunamadı.</div>
      )}

      <div className="space-y-2">
        {rows.map((p) => {
          const critical = (p.stock || 0) <= (p.minStock || 0);
          return (
            <button
              type="button"
              key={p.id ?? p.code}
              onClick={() => openProduct(p)}
              className={cn(
                'w-full text-left rounded-xl border bg-white dark:bg-slate-900 px-3 py-3',
                critical ? 'border-rose-300 dark:border-rose-900' : 'border-slate-200 dark:border-slate-800',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{p.name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{p.code}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <div className="text-right">
                    <div className={cn('text-sm font-bold tabular-nums', critical ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100')}>
                      {formatNum(p.stock || 0)} {p.unit}
                    </div>
                    <div className="text-[10px] text-slate-400 tabular-nums">Min: {formatNum(p.minStock || 0)}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                </div>
              </div>
              {critical && (
                <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[10px] font-semibold px-2 py-0.5">
                  <AlertTriangle className="w-3 h-3" /> Kritik seviye
                </div>
              )}
            </button>
          );
        })}
      </div>

      {sel && <MobileStockDetail product={sel} onClose={closeProduct} />}

      {scannerOpen && (
        <CameraBarcodeScannerModal
          isOpen={scannerOpen}
          onClose={() => setScannerOpen(false)}
          initialMode="stock_count"
          onProductScanned={(scannedProduct) => {
            setScannerOpen(false);
            openProduct(scannedProduct);
            void refetch();
          }}
          onSuccess={() => {
            void refetch();
          }}
        />
      )}
    </>
  );
}
