import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ChevronRight, MapPin, AlertTriangle, Palette, CheckCircle2, Check, Copy } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getColorSwatch, formatColorQty, hexFromColorRefs } from '../../lib/colorSwatches';
import { CATEGORY_TYPE_META } from './stockCategoryMeta';
import type { Product, StockCategoryType } from '../../types';

export interface ProcessedColorRow {
  color: string;
  colorImage?: string;
  boxBarcode?: string;
  sizeList: { size: string; barcode?: string; stock: number; templateRatio?: number }[];
  colorTotalStock: number;
  estimatedBoxes: number;
  isColorBroken: boolean;
  sizesWithStockCount: number;
  sizesWithoutStockCount: number;
  totalSizesCount: number;
}

export interface ProcessedStockRow extends Product {
  catType: StockCategoryType;
  isMamul: boolean;
  isFootwear?: boolean;
  templateName: string;
  templateMultiplier: number;
  colorRows: ProcessedColorRow[];
  finalStock: number;
  hasBrokenSize: boolean;
  isCritical: boolean;
  isOutOfStock: boolean;
  totalColorsCount: number;
}

interface StockDetailRowProps {
  p: ProcessedStockRow;
  isExpanded: boolean;
  rowDensity: 'compact' | 'normal';
  copiedBarcode: string | null;
  onToggleExpand: (id?: number) => void;
  onCopyBarcode: (barcode: string) => void;
}

export default function StockDetailRow({ p, isExpanded, rowDensity, copiedBarcode, onToggleExpand, onCopyBarcode }: StockDetailRowProps) {
  const meta = CATEGORY_TYPE_META[p.catType];
  const Icon = meta.icon;

  return (
              <div 
                id={`product-card-${p.id}`}
                className={cn(
                  "bg-white dark:bg-slate-900 rounded-xl border transition-all duration-150 overflow-hidden",
                  isExpanded 
                    ? "border-indigo-300 ring-2 ring-indigo-500/10 shadow-sm" 
                    : "border-slate-200 dark:border-slate-700/90 hover:border-slate-300 shadow-2xs hover:shadow-xs"
                )}
              >
                {/* ────────────────────────────────────────────────────────────
                    KOMPAKT & ŞIK ÜST SATIR (Daraltılmış Hal)
                   ──────────────────────────────────────────────────────────── */}
                <div 
                  onClick={() => onToggleExpand(p.id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 cursor-pointer select-none transition-colors",
                    rowDensity === 'compact' ? "py-2 px-3 sm:px-3.5" : "py-2.5 px-3.5 sm:px-4",
                    isExpanded 
                      ? "bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-900 dark:text-slate-100"
                  )}
                >
                  {/* SOL TARAF: Ok, Resim, Kod, Kategori Türü, İsim ve Etiketler */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Aç / Kapat Butonu */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpand(p.id);
                      }}
                      className={cn(
                        "w-6 h-6 rounded-md flex items-center justify-center transition-transform shrink-0 cursor-pointer",
                        isExpanded ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200"
                      )}
                      title={isExpanded ? "Detayı Kapat" : "Detayı Aç"}
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>

                    {/* Mini Küçük Resim */}
                    <div className={cn(
                      "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs",
                      rowDensity === 'compact' ? "w-8 h-8" : "w-10 h-10"
                    )}>
                      {p.image ? (
                        <img 
                          src={p.image} 
                          alt={p.name} 
                          className="w-full h-full object-contain p-0.5" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Icon className="w-4 h-4 text-slate-400" />
                      )}
                    </div>

                    {/* Stok Kodu */}
                    <span className="font-mono text-xs font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/90 px-2 py-0.5 rounded shrink-0">
                      {p.code}
                    </span>

                    {/* Kategori Türü Rozeti (MAMÜL / YARI MAMÜL / HAMMADDE / AKSESUAR) */}
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0",
                      meta.badgeClass
                    )}>
                      {meta.badgeLabel}
                    </span>

                    {/* Model / Ürün Adı & Ek İpuçları */}
                    <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-2">
                      <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                        {p.name}
                      </span>

                      {/* Kompakt Yan Etiketler */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5 sm:mt-0 shrink-0">
                        {p.brand && (
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded hidden sm:inline-block">
                            {p.brand}
                          </span>
                        )}

                        {p.subType && (
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.2 rounded hidden md:inline-block">
                            {p.subType}
                          </span>
                        )}

                        {p.shelf && (
                          <span className="text-[10px] font-medium text-slate-400 items-center gap-0.5 hidden lg:inline-flex">
                            <MapPin className="w-2.5 h-2.5" />
                            {p.shelf}
                          </span>
                        )}

                        {p.hasBrokenSize && (
                          <span className="text-[9px] font-black uppercase text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded inline-flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Kırık Beden
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* SAĞ TARAF: Stok Rakamı, Renk Bazlı Dağılım ve Koli Bilgisi */}
                  <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    {/* Renk Bazlı Stok Dağılımı (Varyant Stoklarından) */}
                    {p.variantBarcodes && p.variantBarcodes.length > 0 && p.colorRows.length > 0 ? (
                      <div className="hidden md:flex flex-wrap items-center gap-1 max-w-[430px] justify-end">
                        {p.colorRows.slice(0, 4).map(c => {
                          const sw = getColorSwatch(c.color);
                          return (
                            <span
                              key={c.color}
                              title={`${c.color}: ${formatColorQty(c.colorTotalStock, p.templateMultiplier, p.unit || 'Çift')}${p.templateMultiplier > 1 ? ` (${c.colorTotalStock} ${p.unit || 'Çift'})` : ''}`}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5",
                                c.colorTotalStock <= 0
                                  ? "border-rose-200 bg-rose-50/70"
                                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                              )}
                            >
                              <span className="w-2 h-2 rounded-full border shrink-0" style={{ backgroundColor: hexFromColorRefs(p.colorRefs, c.color) || sw.bg, borderColor: sw.border }} />
                              <span className="text-[9px] font-black uppercase text-slate-600 dark:text-slate-300">{c.color}</span>
                              <span className={cn(
                                "text-[9px] font-mono font-black",
                                c.colorTotalStock <= 0 ? "text-rose-600" : "text-slate-900 dark:text-slate-100"
                              )}>
                                {formatColorQty(c.colorTotalStock, p.templateMultiplier, p.unit || 'Çift')}
                              </span>
                            </span>
                          );
                        })}
                        {p.colorRows.length > 4 && (
                          <span
                            title={p.colorRows.slice(4).map(c => `${c.color}: ${formatColorQty(c.colorTotalStock, p.templateMultiplier, p.unit || 'Çift')}${p.templateMultiplier > 1 ? ` (${c.colorTotalStock} ${p.unit || 'Çift'})` : ''}`).join('\n')}
                            className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-black text-indigo-700 cursor-help"
                          >
                            +{p.colorRows.length - 4} renk
                          </span>
                        )}
                      </div>
                    ) : p.colorRows.length > 1 && (
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50/80 border border-indigo-100 px-2 py-0.5 rounded-full hidden sm:inline-flex items-center gap-1">
                        <Palette className="w-3 h-3 text-indigo-500" />
                        {p.colorRows.length} Renk
                      </span>
                    )}

                    {/* Koli / Multiplier Tahmini (Ayakkabılar İçin) */}
                    {p.templateMultiplier > 1 && (
                      <span className="text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded hidden md:inline-block">
                        ~{(p.finalStock / p.templateMultiplier).toFixed(1)} Koli
                      </span>
                    )}

                    {/* Stok Miktarı */}
                    <div className="text-right min-w-[70px]">
                      <div className="flex items-baseline justify-end gap-1">
                        <span className={cn(
                          "font-mono font-black",
                          rowDensity === 'compact' ? "text-sm" : "text-base",
                          p.finalStock <= 0 
                            ? "text-rose-600" 
                            : p.isCritical 
                              ? "text-amber-600" 
                              : "text-emerald-700"
                        )}>
                          {p.finalStock}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                          {p.unit || 'Çift'}
                        </span>
                      </div>

                      {p.finalStock <= 0 ? (
                        <div className="text-[8px] font-black uppercase tracking-wider text-rose-600">Tükendi</div>
                      ) : p.isCritical ? (
                        <div className="text-[8px] font-black uppercase tracking-wider text-amber-600">Kritik Stok</div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* ────────────────────────────────────────────────────────────
                    GENİŞLETİLMİŞ ALT DETAY: RENKLER, ASORTİ TABLOSU VEYA MALZEME BİLGİSİ
                   ──────────────────────────────────────────────────────────── */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      key={`expanded-detail-${p.id}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 sm:p-4 space-y-3"
                    >
                      {/* Üst Bilgi Şeridi */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border",
                            meta.badgeExpandedClass
                          )}>
                            {meta.label}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 font-medium">
                            Şablon / Paket: <b>{p.templateName}</b> ({p.templateMultiplier} {p.secondaryUnit || p.unit}/Koli)
                          </span>
                          {p.shelf && (
                            <>
                              <span className="text-slate-400">•</span>
                              <span className="text-slate-600 font-medium">
                                Depo/Raf: <b>{p.shelf} {p.location ? `(${p.location})` : ''}</b>
                              </span>
                            </>
                          )}
                        </div>

                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          Alış: <b className="text-slate-800 dark:text-slate-200">₺{p.buyingPrice || 0}</b> • Satış: <b className="text-slate-800 dark:text-slate-200">₺{p.sellingPrice || 0}</b> • Min: <b className="text-slate-800 dark:text-slate-200">{p.minStock || 0} {p.unit}</b>
                        </div>
                      </div>

                      {/* Renk ve Beden Matrisi */}
                      <div className="space-y-2.5">
                        {p.colorRows.map((c, cIdx) => (
                          <div 
                            key={`${p.id}-${c.color}-${cIdx}`}
                            className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden"
                          >
                            {/* Renk Başlık Şeridi */}
                            <div className="p-2 sm:px-3 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                {/* Color Swatch / Mini image */}
                                {c.colorImage ? (
                                  <div className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center">
                                    <img 
                                      src={c.colorImage} 
                                      alt={c.color} 
                                      className="w-full h-full object-contain p-0.5" 
                                      referrerPolicy="no-referrer" 
                                    />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-black text-[10px] shrink-0">
                                    {c.color.slice(0, 2).toUpperCase()}
                                  </div>
                                )}

                                <span className="text-xs font-black uppercase text-slate-900 dark:text-slate-100">
                                  {c.color}
                                </span>

                                {c.isColorBroken && (
                                  <span className="text-[9px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    Kırık Beden ({c.sizesWithoutStockCount} Beden 0)
                                  </span>
                                )}

                                {!c.isColorBroken && c.colorTotalStock > 0 && (
                                  <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                    Tam Seri
                                  </span>
                                )}

                                {/* Koli Barkodu */}
                                {c.boxBarcode && (
                                  <div className="flex items-center gap-1 ml-2 text-[10px]">
                                    <span className="text-slate-400 font-bold uppercase">Barkod:</span>
                                    <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                                      {c.boxBarcode}
                                    </span>
                                    <button 
                                      onClick={() => onCopyBarcode(c.boxBarcode!)}
                                      className="text-slate-400 hover:text-indigo-600 transition-colors p-0.5 cursor-pointer"
                                      title="Barkodu Kopyala"
                                    >
                                      {copiedBarcode === c.boxBarcode ? (
                                        <Check className="w-3 h-3 text-emerald-600" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Renk Toplam Stoğu */}
                              <div className="flex items-center gap-1 self-end sm:self-center font-mono text-xs">
                                <span className="text-slate-400 font-bold uppercase text-[10px]">Varyant Stoğu:</span>
                                <span className={cn(
                                  "font-black",
                                  c.colorTotalStock <= 0 ? "text-rose-600" : "text-slate-900 dark:text-slate-100"
                                )}>
                                  {c.colorTotalStock} {p.unit || 'Çift'}
                                </span>
                                {c.estimatedBoxes > 0 && (
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    (~{c.estimatedBoxes.toFixed(1)} Koli)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Beden Matrisi Tablosu */}
                            {p.isFootwear && c.sizeList.length > 1 ? (
                              <div className="p-2 overflow-x-auto">
                                <table className="w-full text-center border-collapse min-w-[450px]">
                                  <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-600 text-[10px] font-black uppercase tracking-wider border border-slate-200 dark:border-slate-700">
                                      <th className="py-1.5 px-2 text-left w-28 border-r border-slate-200 dark:border-slate-700 bg-slate-200/70">
                                        Beden / Numara
                                      </th>
                                      {c.sizeList.map((s, sIdx) => (
                                        <th 
                                          key={`${s.size}-${sIdx}`}
                                          className="py-1.5 px-2 border-r border-slate-200 dark:border-slate-700 last:border-r-0 font-mono text-xs font-black text-slate-900 dark:text-slate-100"
                                        >
                                          {s.size}
                                        </th>
                                      ))}
                                      <th className="py-1.5 px-2 bg-indigo-50/80 text-indigo-900 border-l border-indigo-100 font-black w-20">
                                        TOPLAM
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {/* Koli Şablon Dağılımı */}
                                    {c.sizeList.some(s => (s.templateRatio || 0) > 0) && (
                                      <tr className="border-b border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40">
                                        <td className="py-1.5 px-2 text-left font-bold text-[9px] uppercase tracking-wider text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                                          Koli Şablonu
                                        </td>
                                        {c.sizeList.map((s, sIdx) => (
                                          <td 
                                            key={`ratio-${s.size}-${sIdx}`}
                                            className="py-1.5 px-2 border-r border-slate-100 dark:border-slate-800 last:border-r-0 font-mono font-bold text-slate-400 text-xs"
                                          >
                                            {s.templateRatio || '-'}
                                          </td>
                                        ))}
                                        <td className="py-1.5 px-2 border-l border-indigo-100 bg-indigo-50/40 font-mono font-black text-indigo-600 text-xs">
                                          {p.templateMultiplier}
                                        </td>
                                      </tr>
                                    )}

                                    {/* Mevcut Stok */}
                                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                      <td className="py-2 px-2 text-left font-black text-xs uppercase tracking-wider text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                                        Mevcut Stok
                                      </td>
                                      {c.sizeList.map((s, sIdx) => {
                                        const isZero = (s.stock || 0) === 0;
                                        return (
                                          <td 
                                            key={`stock-${s.size}-${sIdx}`}
                                            className={cn(
                                              "py-2 px-2 border-r border-slate-200 dark:border-slate-700 last:border-r-0 font-mono text-xs font-black transition-colors",
                                              isZero 
                                                ? "bg-rose-50/80 text-rose-600" 
                                                : "bg-emerald-50/40 text-emerald-800"
                                            )}
                                          >
                                            {isZero ? (
                                              <span className="text-[10px] font-bold text-rose-500">0</span>
                                            ) : (
                                              <span>{s.stock}</span>
                                            )}
                                          </td>
                                        );
                                      })}
                                      <td className="py-2 px-2 border-l border-indigo-200 bg-indigo-50 font-mono text-sm font-black text-indigo-700">
                                        {c.colorTotalStock}
                                      </td>
                                    </tr>

                                    {/* Beden Tekil Barkodu */}
                                    <tr className="text-[9px] text-slate-400 bg-slate-50 dark:bg-slate-800/30">
                                      <td className="py-1 px-2 text-left font-bold text-[8px] uppercase tracking-wider text-slate-400 border-r border-slate-200 dark:border-slate-700">
                                        Beden Barkod
                                      </td>
                                      {c.sizeList.map((s, sIdx) => (
                                        <td 
                                          key={`bc-${s.size}-${sIdx}`}
                                          className="py-1 px-1.5 border-r border-slate-100 dark:border-slate-800 last:border-r-0 font-mono text-[9px]"
                                        >
                                          {s.barcode ? (
                                            <span 
                                              onClick={() => onCopyBarcode(s.barcode!)}
                                              className="cursor-pointer hover:text-indigo-600 hover:underline inline-flex items-center gap-0.5"
                                              title={`Kopyala: ${s.barcode}`}
                                            >
                                              {s.barcode.length > 8 ? `...${s.barcode.slice(-6)}` : s.barcode}
                                              {copiedBarcode === s.barcode && <Check className="w-2.5 h-2.5 text-emerald-600" />}
                                            </span>
                                          ) : (
                                            <span className="text-slate-300">-</span>
                                          )}
                                        </td>
                                      ))}
                                      <td className="py-1 px-2 border-l border-indigo-100 bg-indigo-50/20 text-slate-400 text-[9px]">
                                        {c.sizeList.length} Beden
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              /* Standart / Boyutsuz Stok Bilgi Çubuğu */
                              <div className="p-2.5 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900">
                                <div className="flex items-center gap-3">
                                  <span>Birim: <b className="text-slate-900 dark:text-slate-100">{p.unit}</b></span>
                                  <span>•</span>
                                  <span>Mevcut Miktar: <b className="text-emerald-700 font-mono font-black">{c.colorTotalStock} {p.unit}</b></span>
                                  {p.minStock > 0 && (
                                    <>
                                      <span>•</span>
                                      <span>Kritik Eşik: <b className="text-slate-900 dark:text-slate-100">{p.minStock} {p.unit}</b></span>
                                    </>
                                  )}
                                </div>
                                {c.boxBarcode && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400 text-[10px] uppercase font-bold">Stok Barkodu:</span>
                                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                      {c.boxBarcode}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
  );
}
