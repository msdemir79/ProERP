import type { ProductionStage } from '../../types';
import type { StageSummary } from '../../services/productionLine';

/**
 * Üretim Kontrol Merkezi görsel sabitleri (DMR NEXUS koyu tema).
 * Yerleşim, onaylı 1-6 nolu mockup şartnamesine birebir uyar; tüm sayısal
 * değerler ERP iş emirlerinden türetilir (sahte veri yok).
 */

/** Mockup'taki proses kartı renkleri (numara rozeti + halka + çubuk + etiket). */
export const STAGE_ACCENT: Record<ProductionStage, { text: string; soft: string; bar: string; ring: string; dot: string }> = {
  planning: { text: 'text-teal-700 dark:text-teal-300', soft: 'bg-teal-500/15', bar: 'bg-teal-400', ring: '#2dd4bf', dot: 'bg-teal-400' },
  cutting: { text: 'text-cyan-700 dark:text-cyan-300', soft: 'bg-cyan-500/15', bar: 'bg-cyan-400', ring: '#22d3ee', dot: 'bg-cyan-400' },
  printing: { text: 'text-violet-700 dark:text-violet-300', soft: 'bg-violet-500/15', bar: 'bg-violet-400', ring: '#a78bfa', dot: 'bg-violet-400' },
  sewing: { text: 'text-emerald-700 dark:text-emerald-300', soft: 'bg-emerald-500/15', bar: 'bg-emerald-400', ring: '#34d399', dot: 'bg-emerald-400' },
  assembly: { text: 'text-fuchsia-700 dark:text-fuchsia-300', soft: 'bg-fuchsia-500/15', bar: 'bg-fuchsia-400', ring: '#e879f9', dot: 'bg-fuchsia-400' },
  finishing: { text: 'text-rose-700 dark:text-rose-300', soft: 'bg-rose-500/15', bar: 'bg-rose-400', ring: '#fb7185', dot: 'bg-rose-400' },
  quality_packing: { text: 'text-amber-700 dark:text-amber-300', soft: 'bg-amber-500/15', bar: 'bg-amber-400', ring: '#fbbf24', dot: 'bg-amber-400' },
  completed: { text: 'text-slate-700 dark:text-slate-300', soft: 'bg-slate-500/15', bar: 'bg-slate-400', ring: '#94a3b8', dot: 'bg-slate-400' },
};

export interface StageStatus {
  label: string;
  text: string;
  tone: 'ok' | 'run' | 'warn' | 'idle';
}

/** Mockup durak metinleri: Tamamlanıyor / Çalışıyor / Bekliyor / Bitiriliyor / Boşta. */
export function stageStatus(s: StageSummary): StageStatus {
  if (s.completionPct >= 100 && s.targetPairs > 0) return { label: 'Tamamlandı', text: 'text-emerald-700 dark:text-emerald-400', tone: 'ok' };
  if (s.isBottleneck) return { label: 'Bitiriliyor', text: 'text-rose-700 dark:text-rose-400', tone: 'warn' };
  if (s.inProgressCount > 0) return { label: 'Çalışıyor', text: 'text-emerald-700 dark:text-emerald-400', tone: 'run' };
  if (s.waitingCount > 0) return { label: 'Bekliyor', text: 'text-fg-muted', tone: 'idle' };
  return { label: 'Boşta', text: 'text-fg-muted', tone: 'idle' };
}

/** SVG halka rengi (mockup: prosesin kendi rengi; tamamsa yeşil). */
export function ringColor(s: StageSummary): string {
  if (s.completionPct >= 100 && s.targetPairs > 0) return '#34d399';
  return STAGE_ACCENT[s.stage].ring;
}
