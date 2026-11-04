import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, AlertTriangle, Search, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatPairs } from '../Molds/moldConstants';
import type { Product, WorkOrder } from '../../types';
import { LINE_PROCESS_STAGES, stageOrderOf, filterWorkOrders, type LineFilters } from '../../services/productionLine';
import { PRODUCTION_STAGES_CONFIG } from '../../services/productionService';
import { STAGE_ACCENT } from './productionLineStages';
import { SectionBand } from './ProductionLineShared';
import Tabs from '../Common/Tabs';

function fmt(d?: string | Date): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) + ' ' + dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDur(start?: string | Date, end?: string | Date): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!isFinite(ms) || ms <= 0) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}s ${m}dk`;
}

interface Props {
  workOrders: WorkOrder[];
  products: Product[];
}

/**
 * #2 Süreç Zaman Çizelgesi: seçili sipariş/iş emrinin 7 proseslik yatay akışı.
 * Yalnızca gerçek aşama logları (başlangıç/bitiş/üretilen/fire/personel) gösterilir.
 */
export default function OrderProcessTimeline({ workOrders, products }: Props) {
  const productMap = useMemo(() => new Map(products.map((p) => [p.id!, p])), [products]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tab, setTab] = useState<'flow' | 'detail'>('flow');

  const list = useMemo(() => {
    const f: LineFilters = { search: search || undefined, status: 'all' };
    return filterWorkOrders(workOrders, f).slice(0, 60);
  }, [workOrders, search]);

  const selected = useMemo(() => {
    if (selectedId != null) return workOrders.find((w) => w.id === selectedId) || null;
    return list.find((w) => w.status !== 'completed') || list[0] || null;
  }, [selectedId, workOrders, list]);

  const stageCfg = (id: string) => PRODUCTION_STAGES_CONFIG.find((s) => s.id === id);

  const rows = useMemo(() => {
    if (!selected) return [];
    const target = Number(selected.quantity) || 0;
    const cur = stageOrderOf(selected.currentStage);
    return LINE_PROCESS_STAGES.map((stageId) => {
      const log = selected.stages?.find((l) => l.stage === stageId);
      const done = log?.status === 'completed' || cur > stageOrderOf(stageId) || selected.status === 'completed';
      const running = !done && cur === stageOrderOf(stageId) && selected.status !== 'pending';
      const produced = done ? target : running ? Math.min(target, Number(log?.completedQuantity) || 0) : 0;
      return {
        stageId,
        cfg: stageCfg(stageId),
        log,
        done,
        running,
        produced,
        pct: target > 0 ? Math.min(100, Math.round((produced / target) * 100)) : 0,
      };
    });
  }, [selected]);

  return (
    <div className="rounded-card border border-line bg-surface p-4 text-fg sm:p-6">
      <SectionBand index={2} title="Süreç Zaman Çizelgesi" desc="İş emri özelinde proses akışı ve durum takibi — gerçek aşama kayıtları" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
        {/* Sol: iş emri seçici */}
        <div className="rounded-card border border-line bg-surface-raised p-2">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
            <input
              aria-label="İş emri ara"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="İş emri / sipariş / renk ara..."
              className="h-9 w-full rounded-control border border-line bg-surface pl-8 pr-2 text-xs font-bold text-fg-strong outline-none placeholder:text-fg-muted focus:border-brand"
            />
          </div>
          <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
            {list.length === 0 && <p className="p-3 text-center text-xs font-semibold text-fg-muted">İş emri yok.</p>}
            {list.map((wo) => {
              const p = productMap.get(wo.productId);
              const active = selected?.id === wo.id;
              return (
                <button
                  key={wo.id}
                  type="button"
                  onClick={() => setSelectedId(wo.id!)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left transition-colors cursor-pointer',
                    active ? 'bg-brand-soft ring-1 ring-brand/30' : 'hover:bg-surface-hover',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-fg-strong">{wo.barcode}</p>
                    <p className="truncate text-2xs font-semibold text-fg-muted">
                      {p?.name || '—'} · {[wo.color, wo.size].filter(Boolean).join('/')}
                    </p>
                  </div>
                  <span className="shrink-0 text-2xs font-bold text-fg-muted">{stageCfg(wo.currentStage)?.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sağ: çizelge */}
        <div className="space-y-4">
          {!selected ? (
            <div className="rounded-card border border-line bg-surface-raised p-4">
              <p className="py-16 text-center text-sm font-semibold text-fg-muted">Görüntülemek için bir iş emri seçin.</p>
            </div>
          ) : (
            <>
              {/* Künye kartı (mockup #2 üst bandı) */}
              <div className="rounded-card border border-line bg-surface-raised p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-black tracking-tight text-fg-strong">{selected.barcode}</h3>
                    <span
                      className={cn(
                        'rounded-pill border px-2.5 py-0.5 text-2xs font-black',
                        selected.status === 'completed'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-success'
                          : selected.status === 'in_progress'
                            ? 'border-cyan-500/30 bg-cyan-500/10 text-brand-fg'
                            : 'border-slate-500/30 bg-slate-500/10 text-fg',
                      )}
                    >
                      {selected.status === 'completed' ? 'Tamamlandı' : selected.status === 'in_progress' ? 'Üretimde' : 'Planlandı'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 sm:grid-cols-4">
                    {[
                      { label: 'Cari', value: selected.customerName || '—' },
                      { label: 'Model', value: productMap.get(selected.productId)?.name || '—' },
                      { label: 'Sipariş Miktarı', value: `${formatPairs(selected.quantity)} çift` },
                      { label: 'Termin', value: selected.targetDate ? new Date(selected.targetDate).toLocaleDateString('tr-TR') : '—' },
                    ].map((b) => (
                      <div key={b.label}>
                        <p className="text-[9px] font-bold uppercase tracking-wide text-fg-muted">{b.label}</p>
                        <p className="truncate text-xs font-black text-fg-strong">{b.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-2xs font-semibold text-fg-muted">
                  {[selected.orderNumber && `Sipariş ${selected.orderNumber}`, selected.color, selected.size, selected.line && `Hat: ${selected.line}`]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
              </div>

              {/* Sekme şeridi */}
              <Tabs
                items={[{ key: 'flow', label: 'Proses Akışı' }, { key: 'detail', label: 'Proses Detayları' }]}
                value={tab}
                onChange={(key) => setTab(key as 'flow' | 'detail')}
                size="sm"
                ariaLabel="İş emri süreç görünümleri"
              />

              {tab === 'flow' ? (
                /* Yatay stepper (mockup #2) */
                <div className="overflow-x-auto rounded-card border border-line bg-surface-raised p-4">
                  <div className="flex min-w-max items-start">
                    {rows.map((r, i) => {
                      const a = STAGE_ACCENT[r.stageId as keyof typeof STAGE_ACCENT];
                      const p = productMap.get(selected.productId);
                      return (
                        <React.Fragment key={r.stageId}>
                          <div className="flex w-[120px] flex-col items-center text-center">
                            <div
                              className={cn(
                                'relative h-[84px] w-[104px] overflow-hidden rounded-xl border bg-surface-raised',
                                r.done ? 'border-emerald-500/40' : r.running ? 'border-cyan-500/50' : 'border-line',
                              )}
                            >
                              {p?.image ? (
                                <img src={p.image} alt={p.name} loading="lazy" className={cn('h-full w-full object-cover', !r.done && !r.running && 'opacity-40 grayscale')} />
                              ) : (
                                <span className={cn('flex h-full w-full items-center justify-center text-2xl font-black', a.soft, a.text, !r.done && !r.running && 'opacity-40')}>
                                  {(r.cfg?.shortLabel || '?').slice(0, 1)}
                                </span>
                              )}
                              {r.done && (
                                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-slate-950">
                                  <CheckCircle2 className="h-3 w-3" />
                                </span>
                              )}
                              {r.running && (
                                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-slate-950">
                                  <Clock className="h-3 w-3 animate-pulse" />
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-xs font-black text-fg-strong">{r.cfg?.shortLabel}</p>
                            <p className={cn('text-sm font-black tabular-nums', r.done ? 'text-success' : r.running ? a.text : 'text-fg-muted')}>
                              %{r.pct}
                            </p>
                            <p className={cn('text-[10px] font-bold', r.done ? 'text-success' : r.running ? a.text : 'text-fg-muted')}>
                              {r.done ? 'Tamamlandı' : r.running ? 'Devam Ediyor' : 'Bekliyor'}
                            </p>
                            <p className="mt-0.5 text-[9px] font-semibold text-fg-muted">
                              {r.log?.startedAt ? fmt(r.log.startedAt) : '—'}
                            </p>
                            <p className="text-[9px] font-semibold text-fg-muted tabular-nums">
                              {formatPairs(r.produced)}/{formatPairs(selected.quantity)} ç
                            </p>
                          </div>
                          {i < rows.length - 1 && (
                            <div className="mt-[42px] flex w-6 shrink-0 items-center justify-center">
                              <ArrowRight className={cn('h-4 w-4', r.done ? 'text-emerald-500' : 'text-fg-muted')} />
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Proses detay tablosu */
                <div className="overflow-x-auto rounded-card border border-line bg-surface-raised p-3">
                  <table className="w-full text-left text-2xs font-bold">
                    <thead>
                      <tr className="border-b border-line text-fg-muted">
                        {['Proses', 'Durum', 'Başlangıç', 'Bitiş', 'Süre', 'Üretilen', 'Fire', 'Personel'].map((h) => (
                          <th key={h} className="px-2 py-1.5 whitespace-nowrap uppercase">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const a = STAGE_ACCENT[r.stageId as keyof typeof STAGE_ACCENT];
                        return (
                          <tr key={r.stageId} className="border-b border-line/60 last:border-0">
                            <td className="px-2 py-2">
                              <span className={cn('inline-flex items-center gap-1.5 font-black text-fg-strong')}>
                                <span className={cn('h-2 w-2 rounded-full', a.dot)} />
                                {r.cfg?.label}
                              </span>
                            </td>
                            <td className="px-2 py-2">
                              <span
                                className={cn(
                                  'rounded-pill px-2 py-0.5 text-[10px] font-black',
                                  r.done ? 'bg-success-soft text-success' : r.running ? 'bg-brand-soft text-brand-fg' : 'bg-surface-hover text-fg-muted',
                                )}
                              >
                                {r.done ? 'Tamamlandı' : r.running ? 'Devam Ediyor' : 'Bekliyor'}
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-fg">{fmt(r.log?.startedAt)}</td>
                            <td className="px-2 py-2 whitespace-nowrap text-fg">{fmt(r.log?.completedAt)}</td>
                            <td className="px-2 py-2 whitespace-nowrap text-fg">{fmtDur(r.log?.startedAt, r.log?.completedAt)}</td>
                            <td className="px-2 py-2 tabular-nums text-fg-strong">
                              {formatPairs(r.produced)} <span className="text-fg-muted">/ {formatPairs(selected.quantity)}</span>
                            </td>
                            <td className="px-2 py-2 tabular-nums">
                              {r.log?.scrapQuantity ? (
                                <span className="inline-flex items-center gap-1 font-black text-warning">
                                  <AlertTriangle className="h-3 w-3" /> {formatPairs(r.log.scrapQuantity)}
                                </span>
                              ) : (
                                <span className="text-fg-muted">—</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-fg">{r.log?.operator || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
