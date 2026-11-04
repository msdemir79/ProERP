import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import {
  Barcode,
  Printer,
  Layers,
  Package,
  Sparkles,
  Settings2,
  Tag,
  Check,
  Plus,
  Minus,
  Image as ImageIcon,
  Upload,
  Trash2,
  ExternalLink,
  Loader2,
  Search,
  X,
  Sliders,
  Type,
  Ruler,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import PageHeader from '../PageHeader';
import LabelPreviewPanel from './BarcodeCenter/LabelPreviewPanel';
import ColorSwatch from '../Colors/ColorSwatch';
import { useColorHexByName } from '../Colors/useColorMaster';
import { printHtml, openPrintWindow } from '../../lib/printService';
import { resizeAndOptimizeImage } from '../../utils/imageUtils';

type PresetSize = '100x80' | '100x150' | '80x60' | '60x40' | '50x30' | '40x25';

const PRESETS: { id: PresetSize; label: string; desc: string }[] = [
  { id: '100x150', label: '100×150 mm', desc: 'Lojistik Koli' },
  { id: '100x80', label: '100×80 mm', desc: 'Standart Koli' },
  { id: '80x60', label: '80×60 mm', desc: 'Kompakt Koli' },
  { id: '60x40', label: '60×40 mm', desc: 'Tekil Kutu' },
  { id: '50x30', label: '50×30 mm', desc: 'Fiyat / Tekil' },
  { id: '40x25', label: '40×25 mm', desc: 'Mini Etiket' },
];

export default function BarcodeCenter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const productIdParam = searchParams.get('product');

  const products = useApiQuery(() => api.products.list(), [], ['products']) || [];
  const templates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']) || [];
  const dbBarcodeTemplates = useApiQuery(() => api.barcodeTemplates.list(), [], ['barcodeTemplates']) || [];
  const hexOf = useColorHexByName();

  const product = useMemo(
    () => products.find(p => String(p.id) === productIdParam) || null,
    [products, productIdParam]
  );

  // --- Product picker ---
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filteredPickerProducts = useMemo(() => {
    const q = pickerQuery.trim().toLocaleLowerCase('tr');
    if (!q) return products.slice(0, 50);
    return products
      .filter(p =>
        p.name?.toLocaleLowerCase('tr').includes(q) ||
        p.code?.toLocaleLowerCase('tr').includes(q) ||
        p.brand?.toLocaleLowerCase('tr').includes(q) ||
        p.barcode?.includes(q)
      )
      .slice(0, 50);
  }, [products, pickerQuery]);

  const selectProduct = (id?: number) => {
    if (id) setSearchParams({ product: String(id) });
    else setSearchParams({});
    setPickerOpen(false);
    setPickerQuery('');
  };

  // --- Mode / Tab ---
  const [activeTab, setActiveTab] = useState<'box' | 'variant'>('box');

  // --- Paper size ---
  const [labelSize, setLabelSize] = useState<PresetSize | 'custom'>('100x80');
  const [customWidthMm, setCustomWidthMm] = useState<number>(100);
  const [customHeightMm, setCustomHeightMm] = useState<number>(80);
  const [selectedDbTemplateId, setSelectedDbTemplateId] = useState<number | ''>('');

  // --- Label content ---
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showBoxSerial, setShowBoxSerial] = useState<boolean>(true);
  const [companyHeader, setCompanyHeader] = useState<string>('DMR Nexus SHOES');
  const [showImage, setShowImage] = useState<boolean>(true);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [imageFit, setImageFit] = useState<'contain' | 'cover'>('contain');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Design sliders ---
  const [fontScale, setFontScale] = useState<number>(1);
  const [barcodeHeight, setBarcodeHeight] = useState<number>(48);
  const [labelPadding, setLabelPadding] = useState<number>(10);
  const [previewZoom, setPreviewZoom] = useState<number>(1);

  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // --- Quantity state ---
  const availableColors = useMemo(() => {
    if (product?.colors && product.colors.length > 0) return product.colors;
    return ['Genel'];
  }, [product?.colors]);

  const [boxCounts, setBoxCounts] = useState<Record<string, number>>({});
  const [globalBoxInput, setGlobalBoxInput] = useState<number>(10);
  const [selectedVariantColors, setSelectedVariantColors] = useState<string[]>([]);
  const [variantQuantities, setVariantQuantities] = useState<Record<string, number>>({});
  const [assortmentBoxMultiplier, setAssortmentBoxMultiplier] = useState<number>(10);

  const effectiveAssortment = useMemo(() => {
    if (!product) return [{ size: 'Standart', quantity: 1 }];
    if (product.assortment && product.assortment.length > 0) return product.assortment;
    if (product.assortmentTemplateId && templates) {
      const tmpl = templates.find(t => t.id === product.assortmentTemplateId);
      if (tmpl && tmpl.items?.length > 0) return tmpl.items;
    }
    if (product.isFootwear) {
      return [
        { size: '40', quantity: 1 },
        { size: '41', quantity: 2 },
        { size: '42', quantity: 2 },
        { size: '43', quantity: 2 },
        { size: '44', quantity: 1 }
      ];
    }
    return [{ size: 'Standart', quantity: 1 }];
  }, [product, templates]);

  const totalPairsPerBox = useMemo(
    () => effectiveAssortment.reduce((acc, curr) => acc + (curr.quantity || 1), 0),
    [effectiveAssortment]
  );

  const applyAssortmentMultiplier = (boxes: number, activeColors = selectedVariantColors) => {
    const newQty: Record<string, number> = {};
    activeColors.forEach(color => {
      effectiveAssortment.forEach(item => {
        newQty[`${color}_${item.size}`] = (item.quantity || 1) * Math.max(1, boxes);
      });
    });
    setVariantQuantities(newQty);
  };

  // Reset quantities & image when the selected product changes
  useEffect(() => {
    if (!product) return;
    const colors = product.colors && product.colors.length > 0 ? product.colors : ['Genel'];
    setSelectedVariantColors(colors);
    const bQty: Record<string, number> = {};
    colors.forEach(c => { bQty[c] = 1; });
    setBoxCounts(bQty);
    setCustomImage(null);
    setShowImage(Boolean(product.image || (product.colorImages && product.colorImages.length > 0)));
    const newQty: Record<string, number> = {};
    colors.forEach(color => {
      effectiveAssortment.forEach(item => {
        newQty[`${color}_${item.size}`] = (item.quantity || 1) * assortmentBoxMultiplier;
      });
    });
    setVariantQuantities(newQty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, effectiveAssortment]);

  // --- Dimensions ---
  const getEffectiveDimensions = (): { width: number; height: number } => {
    if (labelSize === 'custom') {
      return {
        width: Math.max(20, Math.min(300, Number(customWidthMm) || 100)),
        height: Math.max(15, Math.min(300, Number(customHeightMm) || 80))
      };
    }
    const [w, h] = labelSize.split('x').map(Number);
    return { width: w || 100, height: h || 80 };
  };
  const dims = getEffectiveDimensions();

  const handleSelectPresetSize = (preset: PresetSize) => {
    setLabelSize(preset);
    setSelectedDbTemplateId('');
    const [w, h] = preset.split('x').map(Number);
    setCustomWidthMm(w);
    setCustomHeightMm(h);
    setLabelPadding(h <= 35 ? 6 : h <= 60 ? 10 : 14);
  };

  const handleCustomWidthChange = (val: number) => {
    setCustomWidthMm(val);
    setLabelSize('custom');
  };

  const handleCustomHeightChange = (val: number) => {
    setCustomHeightMm(val);
    setLabelSize('custom');
  };

  const handleApplyDbTemplate = (templateId: number | '') => {
    setSelectedDbTemplateId(templateId);
    if (!templateId) return;
    const tmpl = dbBarcodeTemplates.find(t => t.id === templateId);
    if (tmpl) {
      setLabelSize(tmpl.presetSize as any);
      setCustomWidthMm(tmpl.widthMm);
      setCustomHeightMm(tmpl.heightMm);
      if (tmpl.config) {
        if (tmpl.config.companyHeaderText) setCompanyHeader(tmpl.config.companyHeaderText);
        if (tmpl.config.showPrice !== undefined) setShowPrice(tmpl.config.showPrice);
        if (tmpl.config.showBoxSerial !== undefined) setShowBoxSerial(tmpl.config.showBoxSerial);
        if (tmpl.config.showProductImage !== undefined) setShowImage(tmpl.config.showProductImage);
        if (tmpl.config.imageFit) setImageFit(tmpl.config.imageFit);
      }
    }
  };

  const switchTab = (tab: 'box' | 'variant') => {
    setActiveTab(tab);
    if (tab === 'box') handleSelectPresetSize('100x80');
    else handleSelectPresetSize('60x40');
  };

  // --- Images & barcodes ---
  const getLabelImageForColor = (color?: string): string | null => {
    if (!showImage) return null;
    if (customImage) return customImage;
    if (!product) return null;
    if (color && product.colorImages && product.colorImages.length > 0) {
      const found = product.colorImages.find(ci => ci.color.toLowerCase() === color.toLowerCase());
      if (found && found.image) return found.image;
    }
    return product.image || null;
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const optimized = await resizeAndOptimizeImage(file, { maxWidth: 600, maxHeight: 600, quality: 0.85 });
        setCustomImage(optimized);
        setShowImage(true);
      } catch (err) {
        console.error('Etiket görseli optimize hatası:', err);
      }
    }
  };

  const getBoxBarcode = (color: string) => {
    if (!product) return `BOX-${color}`;
    const found = product.colorBoxBarcodes?.find(b => b.color === color);
    if (found && found.barcode) return found.barcode;
    return `BOX-${product.code || 'PROD'}-${color.slice(0, 3).toUpperCase()}`;
  };

  const getVariantBarcode = (color: string, size: string) => {
    if (!product) return `BAR-${color}-${size}`;
    const found = product.variantBarcodes?.find(v => v.color === color && v.size === size);
    if (found && found.barcode) return found.barcode;
    return `${product.code || 'PROD'}-${color.slice(0, 3).toUpperCase()}-${size}`;
  };

  // --- Labels to print ---
  const boxLabelsToPrint = useMemo(() => {
    const labels: Array<{ color: string; barcode: string; boxIndex: number; totalBoxesForColor: number; image: string | null }> = [];
    if (!product) return labels;
    availableColors.forEach(color => {
      const count = boxCounts[color] || 0;
      const barcode = getBoxBarcode(color);
      const image = getLabelImageForColor(color);
      for (let i = 1; i <= count; i++) {
        labels.push({ color, barcode, boxIndex: i, totalBoxesForColor: count, image });
      }
    });
    return labels;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableColors, boxCounts, product, showImage, customImage]);

  const variantLabelsToPrint = useMemo(() => {
    const labels: Array<{ color: string; size: string; barcode: string; ratio: number; index: number; image: string | null }> = [];
    if (!product) return labels;
    selectedVariantColors.forEach(color => {
      const img = getLabelImageForColor(color);
      effectiveAssortment.forEach(item => {
        const key = `${color}_${item.size}`;
        const count = variantQuantities[key] || 0;
        const barcode = getVariantBarcode(color, item.size);
        for (let i = 1; i <= count; i++) {
          labels.push({ color, size: item.size, barcode, ratio: item.quantity, index: i, image: img });
        }
      });
    });
    return labels;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVariantColors, effectiveAssortment, variantQuantities, product, showImage, customImage]);

  const totalLabelsCount = activeTab === 'box' ? boxLabelsToPrint.length : variantLabelsToPrint.length;

  // --- Print ---
  const generatePrintCss = (wMm: number, hMm: number) => `
    @page {
      size: ${wMm}mm ${hMm}mm;
      margin: 0;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
    }
    .print-card {
      page-break-after: always !important;
      break-after: page !important;
      border: 1.5px solid #000000 !important;
      margin: 0 auto !important;
      padding: ${labelPadding}px !important;
      background: #ffffff !important;
      width: ${wMm}mm !important;
      min-height: ${hMm}mm !important;
      max-height: ${hMm}mm !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
    }
    .label-img-frame {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      background-color: #ffffff !important;
      border: 1.5px solid #000000 !important;
      border-radius: 6px !important;
      overflow: hidden !important;
      padding: 2px !important;
      box-sizing: border-box !important;
      flex-shrink: 0 !important;
    }
    .label-img-frame img {
      max-width: 100% !important;
      max-height: 100% !important;
      width: 100% !important;
      height: 100% !important;
      object-fit: ${imageFit === 'cover' ? 'cover' : 'contain'} !important;
      object-position: center !important;
      display: block !important;
      margin: auto !important;
    }
  `;

  const handlePrint = async () => {
    if (totalLabelsCount === 0 || !product) return;
    setIsPrinting(true);
    try {
      const printContainer = document.getElementById('barcode-printable-area');
      if (!printContainer) {
        window.print();
        return;
      }
      await printHtml(printContainer.innerHTML, {
        title: `${product.name} - ${activeTab === 'box' ? 'Koli Barkodları' : 'Asorti Barkodları'} (${totalLabelsCount} Adet)`,
        widthMm: dims.width,
        heightMm: dims.height,
        css: generatePrintCss(dims.width, dims.height)
      });
    } catch (err) {
      console.error('Direct print failed, invoking standard print:', err);
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  const handleOpenInNewTab = () => {
    if (totalLabelsCount === 0 || !product) return;
    const printContainer = document.getElementById('barcode-printable-area');
    if (printContainer) {
      openPrintWindow(
        printContainer.innerHTML,
        `${product.name} - ${activeTab === 'box' ? 'Koli Barkodları' : 'Asorti / Beden Barkodları'}`,
        { widthMm: dims.width, heightMm: dims.height, css: generatePrintCss(dims.width, dims.height) }
      );
    }
  };

  const imageFramePx = imageSize === 'sm' ? 52 : imageSize === 'lg' ? 92 : 72;

  return (
    <div className="space-y-4 font-sans">
      <PageHeader
        title="Barkod Merkezi"
        subtitle="Stok kartı seçin, koli ve asorti/beden etiketlerini tasarlayıp yazdırın"
        icon={Barcode}
        iconColor="purple"
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileChange}
      />

      {/* ================================================================ */}
      {/* TOP STRIP: Product picker + tabs + actions                        */}
      {/* ================================================================ */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs flex flex-wrap items-center gap-3">
        {/* Product combobox */}
        <div ref={pickerRef} className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={pickerOpen ? pickerQuery : (product ? `${product.code} · ${product.name}` : '')}
            onChange={e => { setPickerQuery(e.target.value); setPickerOpen(true); }}
            onFocus={() => { setPickerOpen(true); setPickerQuery(''); }}
            placeholder="Ürün ara (kod, ad, marka, barkod)..."
            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-400"
          />
          {pickerOpen && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-40 max-h-80 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl custom-scrollbar">
              {filteredPickerProducts.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs font-bold text-slate-400 uppercase">
                  Eşleşen ürün bulunamadı
                </div>
              ) : (
                filteredPickerProducts.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => selectProduct(p.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-purple-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800/60 last:border-b-0",
                      product?.id === p.id && "bg-purple-50 dark:bg-slate-800"
                    )}
                  >
                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center shrink-0 p-0.5">
                      {p.image ? (
                        <img src={p.image} alt="" className="max-w-full max-h-full object-contain" />
                      ) : (
                        <Package className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase truncate">
                        {p.name}
                      </div>
                      <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono truncate">
                        {p.code}{p.brand ? ` · ${p.brand}` : ''}{p.colors?.length ? ` · ${p.colors.length} renk` : ''}
                      </div>
                    </div>
                    {product?.id === p.id && <Check className="w-4 h-4 text-purple-600 shrink-0" />}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Selected product chip */}
        {product && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 rounded-xl">
            <span className="text-[10px] font-mono font-black bg-purple-600 text-white px-1.5 py-0.5 rounded uppercase">
              {product.code}
            </span>
            <span className="text-xs font-black text-purple-900 dark:text-purple-100 uppercase max-w-[160px] truncate">
              {product.name}
            </span>
            {product.isFootwear && (
              <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 uppercase">
                Asorti
              </span>
            )}
            <button
              type="button"
              onClick={() => selectProduct(undefined)}
              className="text-purple-500 hover:text-rose-600 transition-colors"
              title="Ürünü kaldır"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Mode tabs */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => switchTab('box')}
            disabled={!product}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide transition-all disabled:opacity-40",
              activeTab === 'box'
                ? "bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            <Package className="w-3.5 h-3.5" />
            Koli {product && `(${boxLabelsToPrint.length})`}
          </button>
          <button
            type="button"
            onClick={() => switchTab('variant')}
            disabled={!product}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide transition-all disabled:opacity-40",
              activeTab === 'variant'
                ? "bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            <Tag className="w-3.5 h-3.5" />
            Beden {product && `(${variantLabelsToPrint.length})`}
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="text-right hidden md:block">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Etiket Toplamı</div>
            <div className="text-lg font-black font-mono text-purple-600 dark:text-purple-400 leading-none">
              {totalLabelsCount}
            </div>
          </div>
          <button
            type="button"
            onClick={handleOpenInNewTab}
            disabled={totalLabelsCount === 0}
            className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3.5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wide transition-all border border-slate-200 dark:border-slate-700 disabled:opacity-40"
            title="Yazdırma penceresinde aç"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Yeni Sekmede</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={totalLabelsCount === 0 || isPrinting}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md shadow-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
            Yazdır ({totalLabelsCount})
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* EMPTY STATE                                                       */}
      {/* ================================================================ */}
      {!product ? (
        <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl py-24 text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 flex items-center justify-center">
            <Barcode className="w-8 h-8 text-purple-500" />
          </div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
            Bir stok kartı seçin
          </h3>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Yukarıdaki arama kutusundan ürün seçtikten sonra koli ve asorti/beden barkodlarını
            tasarlayabilir, kağıt boyutunu ayarlayabilir ve canlı önizleme ile yazdırabilirsiniz.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">

          {/* ============================================================== */}
          {/* LEFT: Settings panel (scrollable)                               */}
          {/* ============================================================== */}
          <div className="xl:col-span-5 space-y-4 xl:max-h-[calc(100vh-15rem)] xl:overflow-y-auto xl:pr-1 custom-scrollbar">

            {/* --- Quantities (per tab) --- */}
            {activeTab === 'box' ? (
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="p-1.5 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-300 rounded-lg">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">
                      Koli Miktarları
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                      Renk bazında basılacak koli etiketi adetleri
                    </p>
                  </div>
                </div>

                <div className="bg-purple-50/60 dark:bg-purple-950/30 p-3 rounded-xl border border-purple-100 dark:border-purple-900/50 space-y-2.5">
                  <div className="text-[10px] font-black uppercase tracking-widest text-purple-900 dark:text-purple-200">
                    Hızlı Toplu Belirle <span className="font-bold text-purple-500 normal-case">(her renk için)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={globalBoxInput}
                      onChange={e => setGlobalBoxInput(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-20 bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 rounded-lg p-2 text-center font-mono font-black text-purple-700 dark:text-purple-300 outline-none text-sm shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated: Record<string, number> = {};
                        availableColors.forEach(c => { updated[c] = globalBoxInput; });
                        setBoxCounts(updated);
                      }}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-3 rounded-lg font-black text-[10px] uppercase tracking-wide transition-all shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Tüm Renklere Uygula
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 5, 10, 20, 50, 100].map(cnt => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => {
                          setGlobalBoxInput(cnt);
                          const updated: Record<string, number> = {};
                          availableColors.forEach(c => { updated[c] = cnt; });
                          setBoxCounts(updated);
                        }}
                        className="px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-purple-100 dark:hover:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-lg text-[10px] font-black transition-all"
                      >
                        +{cnt} Koli
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Renk Bazlı Koli Adetleri
                  </div>
                  <div className="space-y-1.5">
                    {availableColors.map(color => {
                      const count = boxCounts[color] || 0;
                      const barcode = getBoxBarcode(color);
                      return (
                        <div
                          key={color}
                          className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-purple-300 transition-all"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <ColorSwatch name={color} hexCode={hexOf(color)} size={12} className="rounded-full" />
                              <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase">
                                {color}
                              </span>
                            </div>
                            <div className="text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 truncate" title={barcode}>
                              {barcode}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setBoxCounts(prev => ({ ...prev, [color]: Math.max(0, (prev[color] || 0) - 1) }))}
                              className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={count}
                              onChange={e => {
                                const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                                setBoxCounts(prev => ({ ...prev, [color]: v }));
                              }}
                              className="w-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1 text-center font-mono font-black text-slate-900 dark:text-slate-100 text-sm outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setBoxCounts(prev => ({ ...prev, [color]: (prev[color] || 0) + 1 }))}
                              className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {product.isFootwear && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                      <span>1 Koli İçeriği (Asorti)</span>
                      <span className="font-mono font-black text-purple-600 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded">
                        {totalPairsPerBox} Çift / Koli
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {effectiveAssortment.map((a, i) => (
                        <div key={i} className="bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{a.size}</div>
                          <div className="text-xs font-mono font-black text-slate-800 dark:text-slate-200">{a.quantity} Ad.</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="p-1.5 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-300 rounded-lg">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">
                      Asorti / Beden Dağıtıcısı
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                      Koli sayısına göre beden adetlerini otomatik hesaplar
                    </p>
                  </div>
                </div>

                <div className="bg-purple-50/60 dark:bg-purple-950/30 p-3 rounded-xl border border-purple-100 dark:border-purple-900/50 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wide text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-purple-600 dark:text-purple-300" />
                      Otomatik Dağıt
                    </span>
                    <span className="text-[9px] font-black text-purple-600 dark:text-purple-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800 uppercase">
                      1 Koli = {totalPairsPerBox} Çift
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={assortmentBoxMultiplier}
                      onChange={e => {
                        const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                        setAssortmentBoxMultiplier(val);
                        applyAssortmentMultiplier(val);
                      }}
                      className="w-24 bg-white dark:bg-slate-900 border-2 border-purple-300 dark:border-purple-700 focus:border-purple-600 rounded-xl p-2.5 text-center font-mono font-black text-purple-900 dark:text-purple-100 outline-none text-base shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => applyAssortmentMultiplier(assortmentBoxMultiplier)}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wide transition-all shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Hesapla
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 5, 10, 20, 50].map(boxes => (
                      <button
                        key={boxes}
                        type="button"
                        onClick={() => {
                          setAssortmentBoxMultiplier(boxes);
                          applyAssortmentMultiplier(boxes);
                        }}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[10px] font-black transition-all border",
                          assortmentBoxMultiplier === boxes
                            ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                            : "bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-950/50"
                        )}
                      >
                        {boxes} Koli ({boxes * totalPairsPerBox} Çift)
                      </button>
                    ))}
                  </div>
                </div>

                {availableColors.length > 1 && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Yazdırılacak Renkler
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {availableColors.map(color => {
                        const isSelected = selectedVariantColors.includes(color);
                        return (
                          <button
                            key={color}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                if (selectedVariantColors.length > 1) {
                                  setSelectedVariantColors(prev => prev.filter(c => c !== color));
                                }
                              } else {
                                const next = [...selectedVariantColors, color];
                                setSelectedVariantColors(next);
                                applyAssortmentMultiplier(assortmentBoxMultiplier, next);
                              }
                            }}
                            className={cn(
                              "px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all flex items-center gap-1.5 border",
                              isSelected
                                ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400"
                            )}
                          >
                            <ColorSwatch name={color} hexCode={hexOf(color)} size={10} className="rounded-full" />
                            {color}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span>Beden Bazında Adetler</span>
                    <button
                      type="button"
                      onClick={() => setVariantQuantities({})}
                      className="text-rose-500 hover:text-rose-700 font-bold normal-case"
                    >
                      Sıfırla
                    </button>
                  </div>
                  <div className="space-y-2.5">
                    {selectedVariantColors.map(color => {
                      return (
                        <div key={color} className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                          <div className="text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase flex items-center gap-1.5">
                            <ColorSwatch name={color} hexCode={hexOf(color)} size={10} className="rounded-full" />
                            Renk: {color}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                            {effectiveAssortment.map(item => {
                              const key = `${color}_${item.size}`;
                              const qty = variantQuantities[key] || 0;
                              const barcode = getVariantBarcode(color, item.size);
                              return (
                                <div
                                  key={item.size}
                                  className="bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1 hover:border-purple-300 transition-all shadow-xs"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                                      No: {item.size}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                                      oran: {item.quantity}
                                    </span>
                                  </div>
                                  <input
                                    type="number"
                                    min="0"
                                    value={qty}
                                    onChange={e => {
                                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                      setVariantQuantities(prev => ({ ...prev, [key]: val }));
                                    }}
                                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md p-1 text-center font-mono font-black text-purple-600 dark:text-purple-300 text-xs outline-none"
                                  />
                                  <div className="text-[9px] font-mono font-semibold text-slate-500 dark:text-slate-400 truncate" title={barcode}>
                                    {barcode}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* --- Label content --- */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="p-1.5 bg-pink-50 dark:bg-pink-950/50 text-pink-600 dark:text-pink-300 rounded-lg">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">
                    Etiket İçeriği
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                    Başlık, fiyat, koli no ve görsel seçenekleri
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block mb-1">
                    Firma Başlığı
                  </label>
                  <input
                    type="text"
                    value={companyHeader}
                    onChange={e => setCompanyHeader(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-black text-slate-800 dark:text-slate-100 uppercase outline-none focus:ring-2 focus:ring-purple-500/40"
                  />
                </div>
                <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:border-slate-300">
                  <input type="checkbox" checked={showPrice} onChange={e => setShowPrice(e.target.checked)} className="w-4 h-4 rounded text-purple-600" />
                  Fiyat Göster
                </label>
                <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:border-slate-300">
                  <input type="checkbox" checked={showBoxSerial} onChange={e => setShowBoxSerial(e.target.checked)} className="w-4 h-4 rounded text-purple-600" />
                  Koli No / Sıra
                </label>
                <label className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:border-slate-300 sm:col-span-2">
                  <input type="checkbox" checked={showImage} onChange={e => setShowImage(e.target.checked)} className="w-4 h-4 rounded text-purple-600" />
                  Ürün Görseli Ekle
                </label>
              </div>

              {showImage && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center gap-3 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="w-14 h-14 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 overflow-hidden flex items-center justify-center shrink-0 shadow-xs p-1">
                      {getLabelImageForColor() ? (
                        <img
                          src={getLabelImageForColor()!}
                          alt="Etiket görseli"
                          className={cn("max-w-full max-h-full", imageFit === 'cover' ? "w-full h-full object-cover" : "object-contain")}
                        />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-200">
                        {customImage ? 'Özel Yüklenen Görsel' : product.image ? 'Ürün Ana Görseli' : 'Görsel Bulunamadı'}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-[9px] font-black uppercase text-slate-700 dark:text-slate-200 transition-all shadow-xs"
                        >
                          <Upload className="w-3 h-3 text-purple-600" />
                          {customImage || product.image ? 'Değiştir / Yükle' : 'Resim Yükle'}
                        </button>
                        {customImage && (
                          <button
                            type="button"
                            onClick={() => setCustomImage(null)}
                            className="flex items-center gap-1 px-2 py-1 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-600 rounded-lg text-[9px] font-bold transition-all"
                            title="Özel resmi kaldır, ürün görseline dön"
                          >
                            <Trash2 className="w-3 h-3" />
                            Sıfırla
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-300">
                    <span>Çerçeveye Uyum:</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setImageFit('contain')}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all border",
                          imageFit === 'contain'
                            ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        )}
                        title="Görselin tamamı çerçeve içine sığdırılır"
                      >
                        Sığdır
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageFit('cover')}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all border",
                          imageFit === 'cover'
                            ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                        )}
                        title="Çerçeveyi tam doldurur"
                      >
                        Doldur
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-300">
                    <span>Görsel Boyutu:</span>
                    <div className="flex gap-1.5">
                      {[{ id: 'sm', label: 'Küçük' }, { id: 'md', label: 'Standart' }, { id: 'lg', label: 'Geniş' }].map(sz => (
                        <button
                          key={sz.id}
                          type="button"
                          onClick={() => setImageSize(sz.id as any)}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase transition-all border",
                            imageSize === sz.id
                              ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          )}
                        >
                          {sz.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* --- Paper & size --- */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 rounded-lg">
                    <Settings2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">
                      Kağıt & Boyut
                    </h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                      Etiket ölçüsü ve kayıtlı şablonlar
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 px-2.5 py-1 rounded-lg font-mono">
                  {dims.width} × {dims.height} mm
                </span>
              </div>

              {dbBarcodeTemplates.length > 0 && (
                <div className="p-2.5 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900/60 space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wide text-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                    <Sliders className="w-3 h-3 text-indigo-600 dark:text-indigo-300" />
                    Kayıtlı Termal Şablon:
                  </label>
                  <select
                    value={selectedDbTemplateId}
                    onChange={e => handleApplyDbTemplate(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Özel / Manuel Seçim --</option>
                    {dbBarcodeTemplates.map(tmpl => (
                      <option key={tmpl.id} value={tmpl.id}>
                        {tmpl.name} ({tmpl.widthMm}x{tmpl.heightMm} mm - {tmpl.type === 'shipping' ? 'Lojistik Koli' : tmpl.type === 'shoe_box' ? 'Tekil Kutu' : 'Koli'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-3 gap-1.5">
                {PRESETS.map(size => (
                  <button
                    key={size.id}
                    type="button"
                    onClick={() => handleSelectPresetSize(size.id)}
                    className={cn(
                      "p-2 rounded-xl text-center border transition-all",
                      labelSize === size.id
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                        : "bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                  >
                    <div className="text-[10px] font-black">{size.label}</div>
                    <div className={cn("text-[9px] truncate", labelSize === size.id ? "opacity-90" : "opacity-70")}>{size.desc}</div>
                  </button>
                ))}
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                  <span>Elle Ölçü Gir (mm)</span>
                  {labelSize === 'custom' && (
                    <span className="text-[9px] bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 font-bold px-2 py-0.5 rounded-md">
                      Özel Ölçü Aktif
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase">Genişlik</label>
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-600 p-1">
                      <button type="button" onClick={() => handleCustomWidthChange(Math.max(20, customWidthMm - 5))} className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs">-</button>
                      <input
                        type="number"
                        min={20}
                        max={300}
                        value={customWidthMm}
                        onChange={e => handleCustomWidthChange(Number(e.target.value))}
                        className="w-full text-center text-xs font-black text-slate-900 dark:text-slate-100 outline-none bg-transparent"
                      />
                      <button type="button" onClick={() => handleCustomWidthChange(Math.min(300, customWidthMm + 5))} className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs">+</button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase">Yükseklik</label>
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-600 p-1">
                      <button type="button" onClick={() => handleCustomHeightChange(Math.max(15, customHeightMm - 5))} className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs">-</button>
                      <input
                        type="number"
                        min={15}
                        max={300}
                        value={customHeightMm}
                        onChange={e => handleCustomHeightChange(Number(e.target.value))}
                        className="w-full text-center text-xs font-black text-slate-900 dark:text-slate-100 outline-none bg-transparent"
                      />
                      <button type="button" onClick={() => handleCustomHeightChange(Math.min(300, customHeightMm + 5))} className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs">+</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* --- Design sliders --- */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="p-1.5 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-300 rounded-lg">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wide text-slate-800 dark:text-slate-200">
                    Tasarım Ayarları
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                    Yazı boyutu, barkod yüksekliği ve kenar boşluğu
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    <span className="flex items-center gap-1.5 uppercase"><Type className="w-3.5 h-3.5 text-amber-500" /> Yazı Boyutu Ölçeği</span>
                    <span className="font-mono font-black text-amber-600 dark:text-amber-400">{Math.round(fontScale * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.8}
                    max={1.4}
                    step={0.05}
                    value={fontScale}
                    onChange={e => setFontScale(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    <span className="flex items-center gap-1.5 uppercase"><Barcode className="w-3.5 h-3.5 text-amber-500" /> Barkod Yüksekliği</span>
                    <span className="font-mono font-black text-amber-600 dark:text-amber-400">{barcodeHeight} px</span>
                  </div>
                  <input
                    type="range"
                    min={24}
                    max={80}
                    step={2}
                    value={barcodeHeight}
                    onChange={e => setBarcodeHeight(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    <span className="flex items-center gap-1.5 uppercase"><Ruler className="w-3.5 h-3.5 text-amber-500" /> Etiket İç Boşluğu</span>
                    <span className="font-mono font-black text-amber-600 dark:text-amber-400">{labelPadding} px</span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={24}
                    step={1}
                    value={labelPadding}
                    onChange={e => setLabelPadding(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* RIGHT: Live mm-scale WYSIWYG preview                            */}
          {/* ============================================================== */}
          <LabelPreviewPanel
            activeTab={activeTab}
            product={product}
            dims={dims}
            totalLabelsCount={totalLabelsCount}
            previewZoom={previewZoom}
            setPreviewZoom={setPreviewZoom}
            boxLabelsToPrint={boxLabelsToPrint}
            variantLabelsToPrint={variantLabelsToPrint}
            labelPadding={labelPadding}
            fontScale={fontScale}
            imageFramePx={imageFramePx}
            imageFit={imageFit}
            companyHeader={companyHeader}
            showPrice={showPrice}
            showBoxSerial={showBoxSerial}
            effectiveAssortment={effectiveAssortment}
            totalPairsPerBox={totalPairsPerBox}
            barcodeHeight={barcodeHeight}
          />
        </div>
      )}
    </div>
  );
}
