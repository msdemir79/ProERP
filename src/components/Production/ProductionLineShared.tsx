import React from 'react';
import { cn } from '../../lib/utils';
import { formatPairs } from '../Molds/moldConstants';
import type { StageSummary } from '../../services/productionLine';
import { STAGE_ACCENT, stageStatus } from './productionLineStages';

/** Mockup'lardaki dairesel ilerleme göstergesi (ince halka + % merkezde). */
export function Ring({
  pct,
  color,
  size = 56,
  stroke = 6,
  label,
}: {
  pct: number;
  color: string;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" style={{ width: size, height: size }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-line-strong" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-xs font-black text-fg-strong">{clamped}%</span>
        {label && <span className="mt-0.5 text-[8px] font-bold text-fg-muted">{label}</span>}
      </span>
    </div>
  );
}

/** Mockup üst bandındaki bölüm başlığı: "N. BAŞLIK" rozeti + açıklama. */
export function SectionBand({ index, title, desc }: { index: number; title: string; desc: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-2 rounded-control bg-brand-soft px-3 py-1.5 text-sm font-bold text-brand-fg ring-1 ring-brand/20">
        {index}. {title}
      </span>
      <span className="text-xs font-semibold text-fg-muted">{desc}</span>
    </div>
  );
}

/** Süre pill'i: mm:ss / hedef (mockup alt şerit). Gerçek süre yoksa "—". */
export function DurationPill({ ms, accent }: { ms: number | null; accent: string }) {
  const text = ms == null ? '—' : `${Math.floor(ms / 3600000)}:${String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0')}`;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-pill border border-line bg-surface px-2 py-0.5 text-[10px] font-black', accent)}>
      {text}
    </span>
  );
}

/** Kart altı Planlanan/Üretilen çift satırı (mockup #1/#3). */
export function PairsFooter({ s }: { s: StageSummary }) {
  return (
    <div className="grid grid-cols-2 gap-2 border-t border-line px-3 py-2">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wide text-fg-muted">Planlanan</p>
        <p className="text-sm font-black text-fg-strong tabular-nums">{formatPairs(s.plannedPairs)}</p>
      </div>
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wide text-fg-muted">Üretilen</p>
        <p className={cn('text-sm font-black tabular-nums', STAGE_ACCENT[s.stage].text)}>{formatPairs(s.producedPairs)}</p>
      </div>
    </div>
  );
}

/** Küçük durum noktası + etiket (mockup "Çalışıyor/Bitiriliyor"). */
export function StageStatusLine({ s }: { s: StageSummary }) {
  const st = stageStatus(s);
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-black', st.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', STAGE_ACCENT[s.stage].dot, st.tone === 'run' && 'animate-pulse')} />
      {st.label}
    </span>
  );
}
