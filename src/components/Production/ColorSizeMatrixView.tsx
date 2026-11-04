import React, { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { formatPairs } from '../Molds/moldConstants';
import type { Product, ProductionStage, WorkOrder } from '../../types';
import { buildColorSizeMatrix, buildLineSummary, type MatrixCell } from '../../services/productionLine';
import { STAGE_ACCENT } from './productionLineStages';
import { Ring, SectionBand } from './ProductionLineShared';
import Tabs from '../Common/Tabs';

function heat(pct: number, has: boolean): string {
  if (!has) return 'bg-surface text-fg-muted';
  if (pct >= 100) return 'bg-success/25 text-emerald-900 dark:text-emerald-100';
  if (pct >= 66) return 'bg-success-soft text-success';
  if (pct >= 33) return 'bg-warning/25 text-amber-900 dark:text-amber-100';
  if (pct > 0) return 'bg-warning-soft text-warning';
  return 'bg-surface-hover text-fg-muted';
}

interface Props {
  workOrders: WorkOrder[];
  products: Product[];
}

/**
 * #4 Siparişe Özel Matris ve Proses Takip: model künyesi + renk×beden ısı
 * haritası (seçilen prosese göre) + toplam ilerleme halkası.
 */
export default function ColorSizeMatrixView({ workOrders, products }: Props) {
  const [productId, setProductId] = useState<number | null>(null);
  const [stageTab, setStageTab] = useState<'matrix' | ProductionStage>('matrix');

  const scoped = useMemo(
    () => (productId != null ? workOrders.filter((w) => w.productId === productId) : workOrders),
    [workOrders, productId],
  );
  const matrixStage: ProductionStage = stageTab === 'matrix' ? 'quality_packing' : stageTab;
  const matrix = useMemo(() => buildColorSizeMatrix(scoped, matrixStage), [scoped, matrixStage]);
  const summary = useMemo(() => buildLineSummary(scoped), [scoped]);
  const product = productId != null ? products.find((p) => p.id === productId) : undefined;

  const meta = useMemo(() => {
    const colors = scoped.map((w) => w.color).filter(Boolean);
    const sizes = scoped.map((w) => w.size).filter(Boolean);
    const target = scoped.filter((w) => w.status !== 'cancelled').reduce((a, w) => a + (Number(w.quantity) || 0), 0);
    const deadline = scoped
      .map((w) => w.targetDate)
      .filter(Boolean)
      .sort()[0];
    return {
      colorCount: new Set(colors).size,
      sizeCount: new Set(sizes).size,
      target,
      deadline: deadline ? new Date(deadline as string).toLocaleDateString('tr-TR') : '—',
      inProduction: scoped.some((w) => w.status === 'in_progress' || w.status === 'pending'),
    };
  }, [scoped]);

  const cellAt = (color: string, size: string): MatrixCell | undefined =>
    matrix.cells.find((c) => c.color === color && c.size === size);

  const stageTabs: { id: 'matrix' | ProductionStage; label: string }[] = [
    { id: 'matrix', label: 'Renk - Beden Matrisi' },
    ...summary.stages.map((s) => ({ id: s.stage as ProductionStage, label: s.shortLabel })),
  ];

  return (
    <div className="rounded-card border border-line bg-surface p-4 text-fg sm:p-6">
      <SectionBand index={4} title="Siparişe Özel Matris ve Proses Takip" desc="Model, renk, beden bazında üretim ilerleme" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[240px_1fr_220px]">
        {/* Sol rail: künye + proses durumu (mockup sol panel) */}
        <div className="space-y-3">
          <div className="rounded-card border border-line bg-surface-raised p-3">
            <select
              aria-label="Model"
              value={productId ?? ''}
              onChange={(e) => setProductId(e.target.value ? Number(e.target.value) : null)}
              className="mb-3 h-9 w-full rounded-control border border-line bg-surface px-2 text-xs font-bold text-fg outline-none focus:border-brand cursor-pointer"
            >
              <option value="">Tüm Modeller</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {product ? (
              <>
                <div className="mb-2 h-24 w-full overflow-hidden rounded-xl bg-surface-raised">
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xs font-bold text-fg-muted">görsel yok</div>
                  )}
                </div>
                <p className="text-sm font-black text-fg-strong">{product.code || '—'}</p>
                <p className="text-xs font-bold text-fg">{product.name}</p>
                {product.brand && <p className="text-2xs font-semibold text-fg-muted">{product.brand}</p>}
                <div className="mt-2 space-y-0.5 text-2xs font-semibold text-fg-muted">
                  <p>Renk / Beden: <b className="text-fg">{meta.colorCount} / {meta.sizeCount}</b></p>
                  <p>Miktar: <b className="text-fg">{formatPairs(meta.target)} çift</b></p>
                  <p>Termin: <b className="text-fg">{meta.deadline}</b></p>
                </div>
                {meta.inProduction && (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-pill border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-2xs font-black text-success">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Üretimde
                  </span>
                )}
              </>
            ) : (
              <p className="py-6 text-center text-2xs font-semibold text-fg-muted">
                Künye için model seçin; matris tüm modeller üzerinden de görüntülenir.
              </p>
            )}
          </div>

          <div className="rounded-card border border-line bg-surface-raised p-3">
            <p className="mb-2 text-2xs font-black uppercase tracking-wide text-fg-muted">Proses Durumu</p>
            <div className="space-y-1.5">
              {summary.stages.map((s) => (
                <p key={s.stage} className="flex items-center justify-between text-2xs font-bold">
                  <span className="inline-flex items-center gap-1.5 text-fg">
                    <span className={cn('h-2 w-2 rounded-full', STAGE_ACCENT[s.stage].dot)} />
                    {s.shortLabel}
                  </span>
                  <span className="tabular-nums text-fg-muted">%{s.completionPct}</span>
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Orta: sekmeler + matris */}
        <div className="min-w-0">
          <Tabs
            items={stageTabs.map((t) => ({ key: `stage-${t.id}`, label: t.label }))}
            value={`stage-${stageTab}`}
            onChange={(key) => setStageTab(key.slice('stage-'.length) as 'matrix' | ProductionStage)}
            size="sm"
            ariaLabel="Matris prosesleri"
            className="mb-3"
          />

          {matrix.colors.length === 0 ? (
            <div className="rounded-card border border-dashed border-line bg-surface-raised py-16 text-center">
              <p className="text-sm font-black text-fg">Bu kapsamda gerçek üretim verisi yok</p>
              <p className="mt-1 text-xs font-semibold text-fg-muted">Seçili model için iş emri bulunamadı.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-surface-raised p-3">
              <table className="w-full border-separate border-spacing-1 text-center">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface-raised px-2 py-1.5 text-left text-2xs font-black uppercase text-fg-muted">
                      Renk \ Beden
                    </th>
                    {matrix.sizes.map((s) => (
                      <th key={s} className="px-2 py-1.5 text-2xs font-black text-fg">{s}</th>
                    ))}
                    <th className="px-2 py-1.5 text-2xs font-black text-brand-fg">Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.colors.map((color) => {
                    const rowCells = matrix.sizes.map((s) => cellAt(color, s));
                    const rowTarget = rowCells.reduce((a, c) => a + (c?.targetPairs || 0), 0);
                    const rowDone = rowCells.reduce((a, c) => a + (c?.donePairs || 0), 0);
                    return (
                      <tr key={color}>
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-surface-raised px-2 py-1.5 text-left text-xs font-black text-fg-strong">
                          {color}
                        </td>
                        {matrix.sizes.map((s, i) => {
                          const c = rowCells[i];
                          const has = !!c && c.targetPairs > 0;
                          return (
                            <td
                              key={s}
                              className={cn('min-w-[46px] rounded-md px-1.5 py-1.5 text-xs font-black tabular-nums', heat(c?.pct || 0, has))}
                              title={c ? `${c.donePairs}/${c.targetPairs} çift (%${c.pct})` : 'kayıt yok'}
                            >
                              {has ? formatPairs(c!.donePairs) : '—'}
                            </td>
                          );
                        })}
                        <td className="rounded-md bg-surface-hover px-2 py-1.5 text-xs font-black text-fg-strong tabular-nums">
                          {formatPairs(rowDone)}<span className="text-2xs font-bold text-fg-muted">/{formatPairs(rowTarget)}</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td className="sticky left-0 z-10 bg-surface-raised px-2 py-1.5 text-left text-2xs font-black uppercase text-fg-muted">Toplam</td>
                    {matrix.sizes.map((s) => {
                      const col = matrix.cells.filter((c) => c.size === s);
                      const done = col.reduce((a, c) => a + c.donePairs, 0);
                      return (
                        <td key={s} className="rounded-md bg-surface-hover px-1.5 py-1.5 text-2xs font-black text-fg tabular-nums">
                          {formatPairs(done)}
                        </td>
                      );
                    })}
                    <td className="rounded-md bg-brand-soft px-2 py-1.5 text-xs font-black text-brand-fg tabular-nums">
                      {formatPairs(matrix.cells.reduce((a, c) => a + c.donePairs, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-2xs font-semibold text-fg-muted">
                <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500/30" /> Tamamlandı</span>
                <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-500/25" /> Devam ediyor</span>
                <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-surface-hover" /> Planlandı / 0</span>
                <span className="ml-auto">
                  Hücre = {stageTab === 'matrix' ? 'kalite/paketten geçen' : `${stageTabs.find((t) => t.id === stageTab)?.label} prosesinde tamamlanan`} çift
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Sağ rail: toplam ilerleme + proses legend (mockup sağ panel) */}
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface-raised p-4">
            <p className="text-2xs font-black uppercase tracking-wide text-fg-muted">Toplam İlerleme</p>
            <Ring pct={summary.overallPct} color={summary.overallPct >= 100 ? '#34d399' : '#22d3ee'} size={92} stroke={9} />
            <p className="text-2xs font-semibold text-fg-muted tabular-nums">
              {formatPairs(summary.completedPairs)} / {formatPairs(summary.totalPairs)} çift
            </p>
          </div>
          <div className="rounded-card border border-line bg-surface-raised p-3">
            <div className="space-y-1.5">
              {summary.stages.map((s) => (
                <p key={s.stage} className="flex items-center justify-between text-2xs font-bold">
                  <span className="inline-flex items-center gap-1.5 text-fg">
                    <span className={cn('h-2 w-2 rounded-full', STAGE_ACCENT[s.stage].dot)} />
                    {s.shortLabel}
                  </span>
                  <span className="tabular-nums text-fg">%{s.completionPct}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
