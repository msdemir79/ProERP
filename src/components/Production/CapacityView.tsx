import React, { useMemo, useState } from 'react';
import { AlertTriangle, Gauge, Boxes } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatPairs } from '../Molds/moldConstants';
import type { WorkOrder } from '../../types';
import { buildLineSummary, filterWorkOrders, distinctLines, type LineFilters } from '../../services/productionLine';
import { STAGE_ACCENT, stageStatus } from './productionLineStages';
import { Ring, SectionBand } from './ProductionLineShared';

const DATE_PRESETS = [
  { id: 'all', label: 'Tümü' },
  { id: 'today', label: 'Bugün' },
  { id: 'week', label: 'Bu Hafta' },
] as const;

function dateFrom(preset: (typeof DATE_PRESETS)[number]['id']): string | null {
  if (preset === 'all') return null;
  const now = new Date();
  if (preset === 'today') return now.toISOString().slice(0, 10);
  const day = (now.getDay() + 6) % 7; // pazartesi=0
  const monday = new Date(now);
  monday.setDate(now.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

interface Props {
  workOrders: WorkOrder[];
}

/** #3 Kapasite odaklı görünüm: proses başına anlık yük, ilerleme ve birikme. */
export default function CapacityView({ workOrders }: Props) {
  const [line, setLine] = useState<string | null>(null);
  const [preset, setPreset] = useState<(typeof DATE_PRESETS)[number]['id']>('all');

  const lines = useMemo(() => distinctLines(workOrders), [workOrders]);
  const filters: LineFilters = { line, status: 'all', dateFrom: dateFrom(preset) };
  const summary = useMemo(() => buildLineSummary(filterWorkOrders(workOrders, filters)), [workOrders, line, preset]);

  return (
    <div className="rounded-card border border-line bg-surface p-4 text-fg sm:p-6">
      <SectionBand index={3} title="Kapasite Odaklı Görünüm" desc="Her prosesin anlık kapasitesi, verimlilik ve darboğaz bilgisi" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {lines.length > 0 && (
          <select
            aria-label="Üretim hattı"
            value={line ?? ''}
            onChange={(e) => setLine(e.target.value || null)}
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
        <div className="flex items-center gap-1 rounded-control bg-surface-raised p-1 ring-1 ring-line">
          {DATE_PRESETS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setPreset(o.id)}
              className={cn(
                'rounded-md px-3 py-1 text-2xs font-black uppercase cursor-pointer',
                preset === o.id ? 'bg-brand-soft text-brand-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-2xs font-semibold text-fg-muted">
          {summary.totalWorkOrders} iş emri · {formatPairs(summary.totalPairs)} çift planlanan
        </span>
      </div>

      {summary.totalWorkOrders === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line bg-surface-raised py-16 text-center">
          <Gauge className="h-10 w-10 text-fg-muted" />
          <p className="text-sm font-black text-fg">Seçili kapsamda gerçek üretim verisi yok</p>
          <p className="max-w-md text-xs font-semibold text-fg-muted">Kartlar yalnızca ERP iş emirlerinden türetilir; sahte kapasite değeri gösterilmez.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {summary.stages.map((s) => {
            const a = STAGE_ACCENT[s.stage];
            const st = stageStatus(s);
            return (
              <div key={s.stage} className="overflow-hidden rounded-card border border-line bg-surface">
                {/* Renkli başlık şeridi */}
                <div className="flex items-center justify-between px-3 py-2" style={{ background: `linear-gradient(90deg, ${a.ring}22, transparent)` }}>
                  <span className="flex items-center gap-2">
                    <span className={cn('flex h-6 w-6 items-center justify-center rounded-lg text-2xs font-black', a.soft, a.text)}>
                      <Boxes className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm font-black text-fg-strong">{s.shortLabel}</span>
                  </span>
                  {s.isBottleneck && (
                    <span className="inline-flex items-center gap-1 rounded-pill border border-danger/30 bg-danger-soft px-2 py-0.5 text-[9px] font-black uppercase text-danger">
                      <AlertTriangle className="h-3 w-3" /> darboğaz
                    </span>
                  )}
                </div>

                <div className="relative h-[110px] overflow-hidden">
                  <img src={s.image} alt={s.shortLabel} loading="lazy" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/30 to-transparent" />
                </div>

                <div className="flex items-center gap-3 p-3">
                  <Ring pct={s.completionPct} color={s.completionPct >= 100 && s.targetPairs > 0 ? '#34d399' : a.ring} size={54} stroke={6} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-fg-strong tabular-nums">
                      {formatPairs(s.producedPairs)} <span className="text-fg-muted">/</span> {formatPairs(s.targetPairs)}
                    </p>
                    <p className="text-2xs font-semibold text-fg-muted">çift üretilen / planlanan</p>
                    <p className={cn('mt-1 inline-flex items-center gap-1 text-[11px] font-black', st.text)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', a.dot, st.tone === 'run' && 'animate-pulse')} />
                      {st.label}
                    </p>
                  </div>
                </div>

                {/* Alt metrikler */}
                <div className="grid grid-cols-3 gap-px border-t border-line bg-surface-hover text-center">
                  {[
                    { label: 'İş emri', value: String(s.workOrderCount) },
                    { label: 'Bekleyen', value: String(s.waitingCount) },
                    { label: 'Fire', value: formatPairs(s.scrapPairs) },
                  ].map((m) => (
                    <div key={m.label} className="bg-surface px-1 py-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-fg-muted">{m.label}</p>
                      <p className="text-xs font-black text-fg tabular-nums">{m.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
