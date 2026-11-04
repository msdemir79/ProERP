import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCw,
  Play,
  Pause,
  AlertTriangle,
  Clock,
  ArrowRight,
  Layers3,
  X,
  CheckCircle2,
  Users,
  Camera,
  Wrench,
  FlaskConical,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import DetailPanel from '../Common/DetailPanel';
import Tabs from '../Common/Tabs';
import { getWorkflowSummary } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { formatPairs } from '../Molds/moldConstants';
import { ingredientPerUnit, roundMaterialQuantity } from '../../lib/inventoryCalculator';
import type { ColorMaster, Order, Product, ProductionStage, WorkOrder } from '../../types';
import {
  buildLineSummary,
  filterWorkOrders,
  workOrdersAtStage,
  distinctLines,
  type LineFilters,
  type StageSummary,
} from '../../services/productionLine';
import { PRODUCTION_STAGES_CONFIG } from '../../services/productionService';
import { STAGE_ACCENT } from './productionLineStages';
import { Ring, SectionBand, DurationPill, PairsFooter, StageStatusLine } from './ProductionLineShared';

const REFRESH_MS = 30000;

function NoData({ icon: Icon, text }: { icon: typeof Camera; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-surface-raised py-10 text-center">
      <Icon className="h-7 w-7 text-fg-muted" />
      <p className="max-w-xs text-xs font-semibold text-fg-muted">{text}</p>
    </div>
  );
}

interface ProductionLineViewProps {
  workOrders: WorkOrder[];
  products: Product[];
  orders: Order[];
  colors: ColorMaster[];
  loading?: boolean;
  onRefresh: () => void;
}

export default function ProductionLineView({
  workOrders,
  products,
  orders,
  colors,
  loading,
  onRefresh,
}: ProductionLineViewProps) {
  const [filters, setFilters] = useState<LineFilters>({ status: 'all' });
  const [selectedStage, setSelectedStage] = useState<ProductionStage | null>(null);
  const [drawerTab, setDrawerTab] = useState('orders');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      refreshRef.current();
      setLastUpdated(new Date());
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh]);

  const qualityChecks = useApiQuery(
    async () => (await getWorkflowSummary()).qualityChecks,
    [],
    ['qualityChecks'],
  );

  const productMap = useMemo(() => new Map(products.map((p) => [p.id!, p])), [products]);
  const filtered = useMemo(() => filterWorkOrders(workOrders, filters), [workOrders, filters]);
  const summary = useMemo(() => buildLineSummary(filtered), [filtered]);

  const lines = useMemo(() => distinctLines(workOrders), [workOrders]);

  const manualRefresh = () => {
    onRefresh();
    setLastUpdated(new Date());
  };

  const set = <K extends keyof LineFilters>(k: K, v: LineFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const activeFilterCount =
    (filters.search ? 1 : 0) +
    (filters.orderId ? 1 : 0) +
    (filters.colorId ? 1 : 0) +
    (filters.size ? 1 : 0) +
    (filters.line ? 1 : 0) +
    (filters.status !== 'all' ? 1 : 0);

  const selectedSummary = selectedStage ? summary.stages.find((s) => s.stage === selectedStage) || null : null;
  const selectedWos = selectedStage ? workOrdersAtStage(filtered, selectedStage) : [];
  const selectedCfg = selectedStage ? PRODUCTION_STAGES_CONFIG.find((s) => s.id === selectedStage) : undefined;

  // Seçili proseste üretilen toplam çift (malzeme tüketimi türetmesi için).
  const stageProduced = selectedSummary?.producedPairs || 0;
  const materialRows = useMemo(() => {
    if (!selectedStage) return [];
    const map = new Map<string, { name: string; qty: number; unit: string }>();
    for (const wo of selectedWos) {
      const ing = wo.recipeSnapshot?.ingredients || [];
      const produced = Math.min(
        Number(wo.quantity) || 0,
        wo.status === 'completed'
          ? Number(wo.quantity) || 0
          : (wo.stages?.find((l) => l.stage === selectedStage)?.completedQuantity ?? 0),
      );
      for (const i of ing) {
        const per = ingredientPerUnit(i as never);
        if (!per) continue;
        const key = String(i.productId);
        const prev = map.get(key);
        const add = roundMaterialQuantity(per * produced, i.unit);
        if (prev) prev.qty = roundMaterialQuantity(prev.qty + add, i.unit);
        else map.set(key, { name: productMap.get(i.productId)?.name || `Hammadde #${i.productId}`, qty: add, unit: i.unit || 'ADET' });
      }
    }
    return Array.from(map.values()).filter((r) => r.qty > 0).sort((a, b) => b.qty - a.qty).slice(0, 30);
  }, [selectedStage, selectedWos, productMap]);

  const stageQuality = useMemo(() => {
    if (!selectedStage || !qualityChecks) return [];
    const ids = new Set(selectedWos.map((w) => Number(w.id)));
    return qualityChecks.filter((q) => ids.has(Number(q.workOrderId)));
  }, [selectedStage, qualityChecks, selectedWos]);

  return (
    <div className="rounded-card border border-line bg-surface p-4 text-fg sm:p-6">
      <SectionBand index={1} title="3D Hat Görünümü" desc="Gerçek fabrikayı andıran 3D görsel akış — veriler ERP iş emirlerinden türetilir" />

      {/* Başlık şeridi (mockup üst bar) */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-2xs font-bold text-fg-muted">Üretim / Hat İzleme</p>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-black tracking-tight text-fg-strong">Ayakkabı Üretim Hattı</h2>
              <span className={cn('inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-2xs font-black', autoRefresh ? 'border-success/30 bg-success-soft text-success' : 'border-line bg-surface-raised text-fg-muted')}>
                <span className={cn('h-1.5 w-1.5 rounded-full', autoRefresh ? 'animate-pulse bg-emerald-400' : 'bg-slate-500')} />
                Canlı İzleme
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden items-center gap-1 text-2xs font-semibold text-fg-muted lg:inline-flex">
            <Clock className="h-3.5 w-3.5" /> {lastUpdated.toLocaleString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          <button
            type="button"
            onClick={() => setAutoRefresh((v) => !v)}
            title={autoRefresh ? 'Otomatik yenilemeyi duraklat' : 'Otomatik yenilemeyi başlat'}
            className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-xs font-bold text-fg hover:bg-surface-hover cursor-pointer"
          >
            {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span className="hidden md:inline">{autoRefresh ? 'Duraklat' : 'Devam'}</span>
          </button>
          <button
            type="button"
            onClick={manualRefresh}
            className="inline-flex h-9 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-xs font-bold text-fg hover:bg-surface-hover cursor-pointer"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            <span className="hidden md:inline">Yenile</span>
          </button>
        </div>
      </div>

      {/* Filtre çubuğu */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface-raised p-2.5">
        <input
          type="text"
          aria-label="Üretim hattında ara"
          value={filters.search || ''}
          onChange={(e) => set('search', e.target.value)}
          placeholder="İş emri / sipariş / cari / renk / hat ara..."
          className="h-9 min-w-[180px] flex-1 rounded-control border border-line bg-surface px-3 text-xs font-bold text-fg-strong outline-none placeholder:text-fg-muted focus:border-brand"
        />
        {lines.length > 0 && (
          <select
            aria-label="Üretim hattı"
            value={filters.line ?? ''}
            onChange={(e) => set('line', e.target.value || null)}
            className="h-9 max-w-[170px] rounded-control border border-line bg-surface px-2.5 text-xs font-bold text-fg outline-none focus:border-brand cursor-pointer"
          >
            <option value="">Tüm Hatlar</option>
            {lines.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Model"
          value={filters.productId ?? ''}
          onChange={(e) => set('productId', e.target.value ? Number(e.target.value) : null)}
          className="h-9 max-w-[160px] rounded-control border border-line bg-surface px-2.5 text-xs font-bold text-fg outline-none focus:border-brand cursor-pointer"
        >
          <option value="">Tüm Modeller</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Sipariş"
          value={filters.orderId ?? ''}
          onChange={(e) => set('orderId', e.target.value ? Number(e.target.value) : null)}
          className="h-9 max-w-[150px] rounded-control border border-line bg-surface px-2.5 text-xs font-bold text-fg outline-none focus:border-brand cursor-pointer"
        >
          <option value="">Tüm Siparişler</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.orderNumber || `Sipariş #${o.id}`}
            </option>
          ))}
        </select>
        <select
          aria-label="Renk"
          value={filters.colorId ?? ''}
          onChange={(e) => set('colorId', e.target.value ? Number(e.target.value) : null)}
          className="h-9 max-w-[140px] rounded-control border border-line bg-surface px-2.5 text-xs font-bold text-fg outline-none focus:border-brand cursor-pointer"
        >
          <option value="">Tüm Renkler</option>
          {colors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Beden"
          value={filters.size ?? ''}
          onChange={(e) => set('size', e.target.value || null)}
          className="h-9 rounded-control border border-line bg-surface px-2.5 text-xs font-bold text-fg outline-none focus:border-brand cursor-pointer"
        >
          <option value="">Tüm Bedenler</option>
          {Array.from(new Set(workOrders.map((w) => w.size).filter(Boolean) as string[]))
            .sort((a, b) => (Number(a) || 0) - (Number(b) || 0))
            .map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
        </select>
        <div className="flex items-center gap-1 rounded-control bg-surface-raised p-1 ring-1 ring-line">
          {([
            { id: 'all', label: 'Tümü' },
            { id: 'active', label: 'Aktif' },
            { id: 'completed', label: 'Biten' },
          ] as const).map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => set('status', o.id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-2xs font-black uppercase cursor-pointer',
                filters.status === o.id ? 'bg-brand-soft text-brand-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => setFilters({ status: 'all' })}
            className="inline-flex h-9 items-center gap-1 rounded-control px-2.5 text-2xs font-black uppercase text-fg-muted hover:text-danger cursor-pointer"
          >
            <X className="h-3.5 w-3.5" /> Temizle ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Ring şeridi (mockup üst % halkaları) */}
      <div className="mb-4 overflow-x-auto pb-1">
        <div className="flex min-w-max items-stretch gap-2">
          {summary.stages.map((s) => {
            const a = STAGE_ACCENT[s.stage];
            return (
              <div key={s.stage} className="flex w-[132px] shrink-0 flex-col items-center gap-1 rounded-card border border-line bg-surface-raised px-2 py-2.5">
                <Ring pct={s.completionPct} color={s.completionPct >= 100 && s.targetPairs > 0 ? '#34d399' : a.ring} size={46} stroke={5} />
                <p className={cn('text-2xs font-black', a.text)}>{s.shortLabel}</p>
                <p className="text-[10px] font-bold text-fg-muted tabular-nums">
                  {formatPairs(s.producedPairs)} <span className="text-fg-muted">/</span> {formatPairs(s.targetPairs)} ç
                </p>
                <div className="h-1 w-full overflow-hidden rounded-full bg-line-strong">
                  <div className={cn('h-full rounded-full', a.bar)} style={{ width: `${s.completionPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {summary.totalWorkOrders === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-surface-raised py-16 text-center">
          <Layers3 className="h-10 w-10 text-fg-muted" />
          <p className="text-sm font-black text-fg">Seçili filtrelerde gerçek üretim verisi yok</p>
          <p className="max-w-md text-xs font-semibold text-fg-muted">
            Hat, yalnızca ERP'deki iş emirlerinden beslenir. Veri yokken sahte değer gösterilmez. Filtreleri
            temizleyin veya üretime iş emri alın.
          </p>
        </div>
      ) : (
        /* Hat — 3D istasyon kartları (mockup #1) */
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max items-stretch gap-0">
            {summary.stages.map((s, idx) => {
              const a = STAGE_ACCENT[s.stage];
              return (
                <React.Fragment key={s.stage}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStage(s.stage);
                      setDrawerTab('orders');
                    }}
                    className={cn(
                      'group relative flex w-[210px] shrink-0 flex-col overflow-hidden rounded-card border border-t-2 border-line bg-surface text-left transition-all hover:border-line-strong hover:shadow-[0_0_0_1px_rgba(34,211,238,0.2)]',
                    )}
                    style={{ borderTopColor: a.ring }}
                  >
                    {/* Kart başlığı: no + etiket + % */}
                    <div className="flex items-center justify-between px-3 pt-2.5">
                      <div className="flex items-center gap-2">
                        <span className={cn('flex h-6 w-6 items-center justify-center rounded-lg text-2xs font-black', a.soft, a.text)}>
                          {idx + 1}
                        </span>
                        <span className="text-sm font-black text-fg-strong">{s.shortLabel}</span>
                      </div>
                      <span className={cn('text-base font-black tabular-nums', a.text)}>%{s.completionPct}</span>
                    </div>
                    <div className="px-3 pb-1.5 pt-0.5">
                      <StageStatusLine s={s} />
                    </div>

                    {/* 3D görsel */}
                    <div className="relative h-[118px] w-full overflow-hidden">
                      <img
                        src={s.image}
                        alt={s.shortLabel}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                      {s.isBottleneck && (
                        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-pill border border-danger/30 bg-danger-soft px-2 py-0.5 text-[9px] font-black uppercase text-danger">
                          <AlertTriangle className="h-3 w-3" /> darboğaz
                        </span>
                      )}
                    </div>

                    {/* İlerleme çubuğu */}
                    <div className="px-3 pt-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line-strong">
                        <div className={cn('h-full rounded-full transition-all duration-700', a.bar)} style={{ width: `${s.completionPct}%` }} />
                      </div>
                    </div>

                    <div className="mt-1.5">
                      <PairsFooter s={s} />
                    </div>
                  </button>

                  {idx < summary.stages.length - 1 && (
                    <div className="flex w-9 shrink-0 flex-col items-center justify-center gap-1.5">
                      <DurationPill ms={s.durationMs} accent={STAGE_ACCENT[s.stage].text} />
                      <ArrowRight
                        className={cn('h-4 w-4 text-slate-700', s.inProgressCount > 0 && 'animate-pulse text-cyan-500')}
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-2xs font-semibold text-fg-muted">
        <Clock className="h-3 w-3" /> Süre pill'leri gerçek aşama başlangıç/bitiş kayıtlarından türetilir; kayıt yoksa "—".
        Veriler ERP iş emirlerinden beslenir, makine/sensör verisi içermez.
      </p>

      {/* #5 Detaylı İş Emri Akışı — sekmalı çekmece */}
      <DetailPanel
        isOpen={!!selectedStage}
        onClose={() => setSelectedStage(null)}
        widthClass="max-w-[560px]"
        title={selectedCfg ? `${selectedCfg.label} — Üretim Emirleri` : ''}
        badge={
          selectedSummary && (
            <span className="text-2xs font-black text-fg-muted">
              {selectedWos.length} iş emri · {formatPairs(stageProduced)} çift üretilen
            </span>
          )
        }
      >
        {selectedSummary && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Hedef', value: `${formatPairs(selectedSummary.targetPairs)} ç` },
                { label: 'Üretilen', value: `${formatPairs(selectedSummary.producedPairs)} ç` },
                { label: 'Kalan', value: `${formatPairs(selectedSummary.remainingPairs)} ç` },
              ].map((t) => (
                <div key={t.label} className="rounded-control border border-line bg-surface-hover/50 px-3 py-2">
                  <p className="text-2xs font-bold uppercase text-fg-muted">{t.label}</p>
                  <p className="text-sm font-black text-fg-strong">{t.value}</p>
                </div>
              ))}
            </div>

            <Tabs
              value={drawerTab}
              onChange={setDrawerTab}
              size="sm"
              ariaLabel="Proses ayrıntıları"
              items={[
                { key: 'orders', label: 'İş Emirleri' },
                { key: 'machine', label: 'Makine Planı' },
                { key: 'staff', label: 'Personel' },
                { key: 'material', label: 'Malzeme Tüketimi' },
                { key: 'quality', label: 'Kalite' },
                { key: 'photos', label: 'Fotoğraflar' },
              ]}
            />

            {drawerTab === 'orders' &&
              (selectedWos.length === 0 ? (
                <p className="py-8 text-center text-xs font-semibold text-fg-muted">Bu proseste bekleyen iş emri yok.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-2xs font-bold">
                    <thead>
                      <tr className="border-b border-line text-fg-muted">
                        {['İş Emri', 'Model / Renk', 'Beden', 'Plan', 'Üretilen', 'Kalan', 'Durum'].map((h) => (
                          <th key={h} className="px-1.5 py-1.5 whitespace-nowrap uppercase">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedWos.map((wo) => {
                        const p = productMap.get(wo.productId);
                        const log = wo.stages?.find((l) => l.stage === selectedStage);
                        const done = wo.status === 'completed' ? Number(wo.quantity) || 0 : Number(log?.completedQuantity) || 0;
                        const target = Number(wo.quantity) || 0;
                        return (
                          <tr key={wo.id} className="border-b border-line/60 last:border-0">
                            <td className="px-1.5 py-2 font-mono font-black text-fg-strong">{wo.barcode}</td>
                            <td className="max-w-[130px] truncate px-1.5 py-2 text-fg-strong">{p?.name || '—'} · {wo.color || '—'}</td>
                            <td className="px-1.5 py-2 text-fg-muted">{wo.size || '—'}</td>
                            <td className="px-1.5 py-2 tabular-nums text-fg-strong">{formatPairs(target)}</td>
                            <td className="px-1.5 py-2 tabular-nums text-fg-strong">{formatPairs(done)}</td>
                            <td className="px-1.5 py-2 tabular-nums text-fg-muted">{formatPairs(Math.max(0, target - done))}</td>
                            <td className="px-1.5 py-2">
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10px] font-black',
                                  log?.status === 'completed' || wo.status === 'completed'
                                    ? 'bg-success-soft text-success'
                                    : wo.status === 'in_progress'
                                      ? 'bg-brand-soft text-brand-fg'
                                      : 'bg-surface-hover text-fg',
                                )}
                              >
                                {log?.status === 'completed' || wo.status === 'completed' ? (
                                  <CheckCircle2 className="h-3 w-3" />
                                ) : null}
                                {log?.status === 'completed' || wo.status === 'completed'
                                  ? 'Tamamlandı'
                                  : wo.status === 'in_progress'
                                    ? 'Devam Ediyor'
                                    : 'Planlandı'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}

            {drawerTab === 'machine' && (
              <NoData icon={Wrench} text='ERP modelinde makine/hat ekipmanı kaydı tutulmuyor. Makine takibi istenirse ayrı bir varlık (machines) modülü gerekir.' />
            )}

            {drawerTab === 'staff' &&
              (selectedSummary.operators.length === 0 ? (
                <p className="py-8 text-center text-xs font-semibold text-fg-muted">Bu proses için kayıtlı personel bilgisi yok.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {selectedSummary.operators.map((op) => (
                    <span key={op} className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface-hover px-2.5 py-1 text-2xs font-bold text-fg-strong">
                      <Users className="h-3 w-3 text-fg-muted" /> {op}
                    </span>
                  ))}
                </div>
              ))}

            {drawerTab === 'material' &&
              (materialRows.length === 0 ? (
                <p className="py-8 text-center text-xs font-semibold text-fg-muted">
                  Bu prosesteki iş emirleri için reçete/malzeme kaydı bulunamadı.
                </p>
              ) : (
                <div className="space-y-1">
                  {materialRows.map((r) => (
                    <div key={r.name} className="flex items-center justify-between gap-2 rounded-control border border-line bg-surface-hover/50 px-3 py-1.5">
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold text-fg-strong">
                        <FlaskConical className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
                        <span className="truncate">{r.name}</span>
                      </span>
                      <span className="shrink-0 text-xs font-black tabular-nums text-fg-strong">
                        {formatPairs(r.qty)} <span className="text-2xs font-bold text-fg-muted">{r.unit}</span>
                      </span>
                    </div>
                  ))}
                  <p className="pt-1 text-2xs font-semibold text-fg-muted">Tüketim = reçete birim miktarı × proseste üretilen çift.</p>
                </div>
              ))}

            {drawerTab === 'quality' &&
              (stageQuality.length === 0 ? (
                <p className="py-8 text-center text-xs font-semibold text-fg-muted">Bu prosesteki iş emirleri için kalite kontrol kaydı yok.</p>
              ) : (
                <div className="space-y-1">
                  {stageQuality.map((q) => (
                    <div key={q.id} className="flex items-center justify-between gap-2 rounded-control border border-line bg-surface-hover/50 px-3 py-1.5">
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold text-fg-strong">
                        <ShieldCheck className={cn('h-3.5 w-3.5 shrink-0', q.result === 'pass' ? 'text-success' : 'text-danger')} />
                        <span className="truncate font-mono">{q.barcode}</span>
                      </span>
                      <span className="shrink-0 text-2xs font-bold text-fg-muted">
                        kontrol {formatPairs(q.inspectedQuantity)} · red {formatPairs(q.rejectedQuantity)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}

            {drawerTab === 'photos' && (
              <NoData icon={Camera} text='Üretim aşaması fotoğraf kaydı ERP modelinde tutulmuyor; sahte görsel gösterilmez.' />
            )}
          </div>
        )}
      </DetailPanel>
    </div>
  );
}
