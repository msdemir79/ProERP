import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Printer,
  Layers,
  Sliders,
  Check,
  Tag,
  RotateCw,
  FileText,
  QrCode,
} from 'lucide-react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { BarcodeTemplate, LabelPresetSize, LabelUsageType, Product } from '../../types';
import { barcodeTemplateService, SampleLabelData, DEFAULT_SAMPLE_SHOE_IMAGE } from '../../services/barcodeTemplateService';
import { BarcodeSvg } from '../BarcodeSvg';
import { cn } from '../../lib/utils';
import { INITIAL_BARCODE_TEMPLATES } from '../../data/initialBarcodeTemplates';
import DesignerPreviewPanel from './DesignerPreviewPanel';

interface LabelTemplateDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  templateToEdit?: BarcodeTemplate | null;
  onSaved?: () => void;
}

const PRESET_OPTIONS: { id: LabelPresetSize; label: string; width: number; height: number; desc: string; icon: string }[] = [
  { id: '100x150', label: '100 x 150 mm', width: 100, height: 150, desc: 'Lojistik, Kargo & Koli Sevkiyat (Thermal A6)', icon: '📦' },
  { id: '100x80', label: '100 x 80 mm', width: 100, height: 80, desc: 'Standart Ayakkabı Koli & Asorti Etiketi', icon: '🏷️' },
  { id: '80x60', label: '80 x 60 mm', width: 80, height: 60, desc: 'Orta Boy Koli & Depo Raf Etiketi', icon: '🗄️' },
  { id: '60x40', label: '60 x 40 mm', width: 60, height: 40, desc: 'Tekil Ayakkabı Kutu Barkodu (Tekil Çift)', icon: '👟' },
  { id: '50x30', label: '50 x 30 mm', width: 50, height: 30, desc: 'Kompakt Fiyat & Ürün Barkod Etiketi', icon: '🏷️' },
  { id: '40x25', label: '40 x 25 mm', width: 40, height: 25, desc: 'Taban & Minik Aksesuar Etiketi', icon: '🔖' },
  { id: 'custom', label: 'Özel Ölçü (Custom mm)', width: 100, height: 100, desc: 'İstediğiniz milimetrik boyutu manuel girin', icon: '📐' }
];

export const LabelTemplateDesignerModal: React.FC<LabelTemplateDesignerModalProps> = ({
  isOpen,
  onClose,
  templateToEdit,
  onSaved
}) => {
  // Query existing products and assortment templates for sample preview
  const products = useApiQuery(() => api.products.list(), [], ['products']) || [];
  const assortmentTemplates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']) || [];
  const systemSettings = useApiQuery(() => api.settings.get('global_settings'), [], ['settings']);
  const companyName = systemSettings?.company?.companyTitle || systemSettings?.company?.companyName || 'DMR Nexus';

  // Form State
  const [name, setName] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [type, setType] = useState<LabelUsageType>('shipping');
  const [presetSize, setPresetSize] = useState<LabelPresetSize>('100x150');
  const [widthMm, setWidthMm] = useState<number>(100);
  const [heightMm, setHeightMm] = useState<number>(150);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [isDefault, setIsDefault] = useState<boolean>(false);

  // Config Elements State
  const [showCompanyHeader, setShowCompanyHeader] = useState<boolean>(true);
  const [companyHeaderText, setCompanyHeaderText] = useState<string>('DMR NEXUS SHOES & LOGISTICS');
  const [showProductCode, setShowProductCode] = useState<boolean>(true);
  const [showProductName, setShowProductName] = useState<boolean>(true);
  const [showColor, setShowColor] = useState<boolean>(true);
  const [showMaterial, setShowMaterial] = useState<boolean>(true);
  const [showAssortmentTable, setShowAssortmentTable] = useState<boolean>(true);
  const [showBarcode, setShowBarcode] = useState<boolean>(true);
  const [barcodeType, setBarcodeType] = useState<'CODE-128' | 'EAN-13' | 'QR'>('CODE-128');
  const [barcodeHeight, setBarcodeHeight] = useState<number>(44);
  const [showBarcodeText, setShowBarcodeText] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(false);
  const [priceCurrency, setPriceCurrency] = useState<string>('TL');
  const [showBoxSerial, setShowBoxSerial] = useState<boolean>(true);
  const [showOrderInfo, setShowOrderInfo] = useState<boolean>(true);
  const [showLogisticsIcons, setShowLogisticsIcons] = useState<boolean>(true);
  const [showProductImage, setShowProductImage] = useState<boolean>(true);
  const [imageSizeMm, setImageSizeMm] = useState<number>(24);
  const [imagePosition, setImagePosition] = useState<'top' | 'right' | 'left'>('right');
  const [imageFit, setImageFit] = useState<'contain' | 'cover'>('contain');
  const [showWeightDesi, setShowWeightDesi] = useState<boolean>(true);
  const [showCustomNote, setShowCustomNote] = useState<boolean>(true);
  const [customNoteText, setCustomNoteText] = useState<string>('DİKKAT: NEMDEN VE SU DAN KORUYUNUZ. DİK İSTİFLEYİNİZ.');
  const [borderStyle, setBorderStyle] = useState<'solid' | 'dashed' | 'none'>('solid');

  // Preview State
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  const [selectedAssortmentTemplateId, setSelectedAssortmentTemplateId] = useState<number | ''>('');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // Initialize or reset when templateToEdit changes
  useEffect(() => {
    if (templateToEdit) {
      setName(templateToEdit.name);
      setDescription(templateToEdit.description || '');
      setType(templateToEdit.type || 'shipping');
      setPresetSize(templateToEdit.presetSize || '100x150');
      setWidthMm(templateToEdit.widthMm || 100);
      setHeightMm(templateToEdit.heightMm || 150);
      setOrientation(templateToEdit.orientation || 'portrait');
      setIsDefault(Boolean(templateToEdit.isDefault));

      const c = templateToEdit.config;
      if (c) {
        setShowCompanyHeader(c.showCompanyHeader ?? true);
        setCompanyHeaderText(c.companyHeaderText || 'DMR NEXUS SHOES & LOGISTICS');
        setShowProductCode(c.showProductCode ?? true);
        setShowProductName(c.showProductName ?? true);
        setShowColor(c.showColor ?? true);
        setShowMaterial(c.showMaterial ?? true);
        setShowAssortmentTable(c.showAssortmentTable ?? true);
        setShowBarcode(c.showBarcode ?? true);
        setBarcodeType(c.barcodeType || 'CODE-128');
        setBarcodeHeight(c.barcodeHeight || 44);
        setShowBarcodeText(c.showBarcodeText ?? true);
        setShowPrice(c.showPrice ?? false);
        setPriceCurrency(c.priceCurrency || 'TL');
        setShowBoxSerial(c.showBoxSerial ?? true);
        setShowOrderInfo(c.showOrderInfo ?? true);
        setShowLogisticsIcons(c.showLogisticsIcons ?? true);
        setShowProductImage(c.showProductImage ?? true);
        setImageSizeMm(c.imageSizeMm || 24);
        setImagePosition(c.imagePosition || 'right');
        setImageFit(c.imageFit || 'contain');
        setShowWeightDesi(c.showWeightDesi ?? true);
        setShowCustomNote(c.showCustomNote ?? true);
        setCustomNoteText(c.customNoteText || '');
        setBorderStyle(c.borderStyle || 'solid');
      }
    } else {
      // Default to 100x150 mm
      const def = INITIAL_BARCODE_TEMPLATES[0];
      setName('Yeni 100x150 mm Koli Etiketi');
      setDescription('100x150 mm standart termal koli ve sevkiyat barkod şablonu.');
      setType('shipping');
      setPresetSize('100x150');
      setWidthMm(100);
      setHeightMm(150);
      setOrientation('portrait');
      setIsDefault(false);
      
      setShowCompanyHeader(true);
      setCompanyHeaderText(companyName || 'DMR NEXUS SHOES');
      setShowProductCode(true);
      setShowProductName(true);
      setShowColor(true);
      setShowMaterial(true);
      setShowAssortmentTable(true);
      setShowBarcode(true);
      setBarcodeType('CODE-128');
      setBarcodeHeight(46);
      setShowBarcodeText(true);
      setShowPrice(false);
      setShowBoxSerial(true);
      setShowOrderInfo(true);
      setShowLogisticsIcons(true);
      setShowProductImage(true);
      setImageFit('contain');
      setShowWeightDesi(true);
      setShowCustomNote(true);
      setCustomNoteText('DİKKAT: NEMDEN VE SU DAN KORUYUNUZ. DİK İSTİFLEYİNİZ.');
      setBorderStyle('solid');
    }
  }, [templateToEdit, isOpen, companyName]);

  // Handle Preset Selection
  const handlePresetSelect = (preset: LabelPresetSize) => {
    setPresetSize(preset);
    const opt = PRESET_OPTIONS.find(p => p.id === preset);
    if (opt && preset !== 'custom') {
      setWidthMm(opt.width);
      setHeightMm(opt.height);

      // Auto-adjust defaults based on label size
      if (preset === '100x150') {
        setType('shipping');
        setOrientation('portrait');
        setShowAssortmentTable(true);
        setShowLogisticsIcons(true);
        setShowWeightDesi(true);
        setShowCustomNote(true);
        setShowProductImage(true);
        setBarcodeHeight(48);
      } else if (preset === '60x40') {
        setType('shoe_box');
        setOrientation('landscape');
        setShowAssortmentTable(false);
        setShowLogisticsIcons(false);
        setShowWeightDesi(false);
        setShowCustomNote(false);
        setShowProductImage(false);
        setShowPrice(true);
        setBarcodeHeight(30);
      } else if (preset === '100x80') {
        setType('box');
        setOrientation('landscape');
        setShowAssortmentTable(true);
        setShowLogisticsIcons(true);
        setBarcodeHeight(38);
      } else if (preset === '50x30' || preset === '40x25') {
        setType('custom');
        setOrientation('landscape');
        setShowAssortmentTable(false);
        setShowLogisticsIcons(false);
        setShowWeightDesi(false);
        setShowCustomNote(false);
        setShowProductImage(false);
        setBarcodeHeight(22);
      }
    }
  };

  // Sample Product / Data for Preview
  const selectedProduct = useMemo(() => {
    if (selectedProductId && products.length > 0) {
      return products.find(p => p.id === selectedProductId) || null;
    }
    return null;
  }, [selectedProductId, products]);

  const sampleData: SampleLabelData = useMemo(() => {
    let assortmentMatrix: Record<string, number> = {};
    let totalPairs = 0;

    let itemsToUse: { size: string; quantity: number }[] | null = null;

    if (selectedProduct) {
      if (selectedProduct.assortment && selectedProduct.assortment.length > 0) {
        itemsToUse = selectedProduct.assortment;
      } else if (selectedAssortmentTemplateId && assortmentTemplates.length > 0) {
        const tmpl = assortmentTemplates.find(t => t.id === selectedAssortmentTemplateId);
        if (tmpl && tmpl.items && tmpl.items.length > 0) {
          itemsToUse = tmpl.items;
        }
      } else if (selectedProduct.assortmentTemplateId && assortmentTemplates.length > 0) {
        const tmpl = assortmentTemplates.find(t => t.id === selectedProduct.assortmentTemplateId);
        if (tmpl && tmpl.items && tmpl.items.length > 0) {
          itemsToUse = tmpl.items;
        }
      } else if (selectedProduct.variantBarcodes && selectedProduct.variantBarcodes.length > 0) {
        const matrix: Record<string, number> = {};
        selectedProduct.variantBarcodes.forEach(v => {
          if (v.size) {
            matrix[v.size] = (matrix[v.size] || 0) + 1;
          }
        });
        const entries = Object.entries(matrix);
        if (entries.length > 0) {
          itemsToUse = entries.map(([size, quantity]) => ({ size, quantity }));
        }
      }
    } else if (selectedAssortmentTemplateId && assortmentTemplates.length > 0) {
      const tmpl = assortmentTemplates.find(t => t.id === selectedAssortmentTemplateId);
      if (tmpl && tmpl.items && tmpl.items.length > 0) {
        itemsToUse = tmpl.items;
      }
    }

    if (itemsToUse && itemsToUse.length > 0) {
      itemsToUse.forEach(it => {
        if (it.size) {
          const qty = Number(it.quantity) || 0;
          assortmentMatrix[it.size] = qty;
          totalPairs += qty;
        }
      });
    } else {
      // Default 12-pair standard matrix
      assortmentMatrix = { '40': 1, '41': 2, '42': 3, '43': 3, '44': 2, '45': 1 };
      totalPairs = 12;
    }

    if (selectedProduct) {
      return {
        companyName: companyHeaderText || companyName,
        productCode: selectedProduct.code,
        productName: selectedProduct.name,
        color: selectedProduct.colors?.[0] || 'Siyah',
        material: selectedProduct.categoryType === 'finished' ? 'Hakiki Deri' : selectedProduct.subType || 'Hakiki Deri',
        size: Object.keys(assortmentMatrix)[0] || '42',
        assortmentMatrix,
        totalPairs,
        barcode: selectedProduct.barcode || '8690020260101',
        price: selectedProduct.sellingPrice || 1450,
        currency: priceCurrency,
        orderNumber: 'SIP-2026-0042',
        customerName: 'METRO AYAKKABI DERİ LTD.',
        boxNumber: 1,
        totalBoxes: 10,
        weightKg: 14.5,
        desi: 18,
        productImage: selectedProduct.image || DEFAULT_SAMPLE_SHOE_IMAGE,
        customNote: customNoteText
      };
    }

    return {
      companyName: companyHeaderText || companyName,
      productCode: 'AYK-OXF-2026',
      productName: 'Hakiki Deri Erkek Klasik Oxford',
      color: 'SİYAH / BLACK',
      material: 'Dana Derisi / Kauçuk Taban',
      size: Object.keys(assortmentMatrix)[0] || '42',
      assortmentMatrix,
      totalPairs,
      barcode: '8690123456789',
      price: 1850,
      currency: priceCurrency,
      orderNumber: 'SIP-2026-0042',
      customerName: 'METRO AYAKKABI VE DERİ MAMULLERİ SAN. TİC. LTD. ŞTİ.',
      boxNumber: 1,
      totalBoxes: 10,
      weightKg: 14.5,
      desi: 18,
      productImage: DEFAULT_SAMPLE_SHOE_IMAGE,
      customNote: customNoteText
    };
  }, [selectedProduct, selectedAssortmentTemplateId, assortmentTemplates, companyHeaderText, companyName, priceCurrency, customNoteText]);

  // Construct active template object for preview & save
  const currentTemplate: BarcodeTemplate = useMemo(() => ({
    id: templateToEdit?.id,
    name: name || 'İsimsiz Şablon',
    description,
    type,
    presetSize,
    widthMm: Number(widthMm) || 100,
    heightMm: Number(heightMm) || 150,
    orientation,
    isDefault,
    config: {
      showCompanyHeader,
      companyHeaderText,
      showProductCode,
      showProductName,
      showColor,
      showMaterial,
      showAssortmentTable,
      showBarcode,
      barcodeType,
      barcodeHeight: Number(barcodeHeight) || 36,
      showBarcodeText,
      showPrice,
      priceCurrency,
      showBoxSerial,
      showOrderInfo,
      showLogisticsIcons,
      showProductImage,
      imageSizeMm: Number(imageSizeMm) || 24,
      imagePosition,
      imageFit,
      showWeightDesi,
      showCustomNote,
      customNoteText,
      borderStyle
    }
  }), [
    templateToEdit?.id, name, description, type, presetSize, widthMm, heightMm,
    orientation, isDefault, showCompanyHeader, companyHeaderText, showProductCode,
    showProductName, showColor, showMaterial, showAssortmentTable, showBarcode,
    barcodeType, barcodeHeight, showBarcodeText, showPrice, priceCurrency,
    showBoxSerial, showOrderInfo, showLogisticsIcons, showProductImage,
    imageSizeMm, imagePosition, imageFit, showWeightDesi, showCustomNote, customNoteText, borderStyle
  ]);

  // Save Handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      if (templateToEdit?.id) {
        await barcodeTemplateService.update(templateToEdit.id, currentTemplate);
      } else {
        await barcodeTemplateService.create(currentTemplate);
      }
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Şablon kaydedilirken hata:', err);
    }
  };

  // Test Print Handler
  const handleTestPrint = async () => {
    setIsPrinting(true);
    try {
      await barcodeTemplateService.printDirect(currentTemplate, sampleData);
    } catch (err) {
      console.error('Baskı hatası:', err);
    } finally {
      setIsPrinting(false);
    }
  };

  if (!isOpen) return null;

  const isLandscape = orientation === 'landscape';
  const effectiveW = isLandscape ? Math.max(widthMm, heightMm) : Math.min(widthMm, heightMm);
  const effectiveH = isLandscape ? Math.min(widthMm, heightMm) : Math.max(widthMm, heightMm);
  const isSmall = effectiveH <= 45 || effectiveW <= 60;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                {templateToEdit ? 'Barkod Etiket Şablonunu Düzenle' : 'Yeni Termal Barkod Şablonu Tasarla'}
                <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono">
                  {effectiveW} x {effectiveH} mm
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                100x150 mm koli, 60x40 mm kutu ve özel termal yazıcı formatları için hassas milimetrik tasarım.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestPrint}
              disabled={isPrinting}
              className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Mevcut ayarlarla termal yazıcıya test çıktısı gönder"
            >
              <Printer className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span>{isPrinting ? 'Yazdırılıyor...' : 'Test Yazdır'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY (Grid: Sol Ayarlar Formu / Sağ Canlı Önizleme) */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
          
          {/* SOL PANEL: AYARLAR FORMU (7 Kolon) */}
          <div className="lg:col-span-7 p-6 space-y-6 overflow-y-auto">
            
            {/* 1. Şablon Adı & Temel Bilgiler */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                1. Genel Şablon Bilgileri
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Şablon Adı *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Örn: 100x150 mm Lojistik Koli Barkodu"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Kullanım Amacı / Tür
                  </label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as LabelUsageType)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="shipping">📦 Lojistik / Koli Sevkiyat</option>
                    <option value="box">🏷️ Asortili Ayakkabı Koli</option>
                    <option value="shoe_box">👟 Tekil Kutu Barkodu (Tek Çift)</option>
                    <option value="shelf">🗄️ Raf & Depo Lokasyon</option>
                    <option value="custom">🔖 Özel / Genel Amaçlı</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Kağıt Yönü (Orientation)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOrientation('portrait')}
                      className={cn(
                        "py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer",
                        orientation === 'portrait' 
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" 
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                      )}
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Dikey</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientation('landscape')}
                      className={cn(
                        "py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer",
                        orientation === 'landscape' 
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" 
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                      )}
                    >
                      <RotateCw className="w-3.5 h-3.5 rotate-90" />
                      <span>Yatay</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Kağıt Boyutu & Standart Termal Presets */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                2. Termal Kağıt Boyutu (Preset & Milimetre)
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PRESET_OPTIONS.map((opt) => {
                  const isSelected = presetSize === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handlePresetSelect(opt.id)}
                      className={cn(
                        "p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between",
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 ring-1 ring-indigo-600"
                          : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm">{opt.icon}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                      </div>
                      <div className="text-xs font-black text-slate-900 dark:text-slate-100">
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                        {opt.desc}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Manuel mm Girişi */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Özel Boyut:</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={20}
                      max={300}
                      value={widthMm}
                      onChange={e => {
                        setWidthMm(Number(e.target.value));
                        setPresetSize('custom');
                      }}
                      className="w-16 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold text-center"
                    />
                    <span className="text-xs text-slate-500">mm (En)</span>
                  </div>
                  <span className="text-slate-400 font-bold">×</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={15}
                      max={300}
                      value={heightMm}
                      onChange={e => {
                        setHeightMm(Number(e.target.value));
                        setPresetSize('custom');
                      }}
                      className="w-16 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-xs font-bold text-center"
                    />
                    <span className="text-xs text-slate-500">mm (Boy)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Dahil Edilecek Alanlar & Katmanlar */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                3. Etikette Gösterilecek Alanlar (Katmanlar)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                
                {/* Firma Başlığı */}
                <label className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Firma Ünvanı / Başlık</span>
                  <input
                    type="checkbox"
                    checked={showCompanyHeader}
                    onChange={e => setShowCompanyHeader(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                {/* Model Kodu */}
                <label className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Model Kodu (SKU)</span>
                  <input
                    type="checkbox"
                    checked={showProductCode}
                    onChange={e => setShowProductCode(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                {/* Model Adı */}
                <label className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Model / Ürün Adı</span>
                  <input
                    type="checkbox"
                    checked={showProductName}
                    onChange={e => setShowProductName(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                {/* Renk Bilgisi */}
                <label className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Renk / Varyant</span>
                  <input
                    type="checkbox"
                    checked={showColor}
                    onChange={e => setShowColor(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                {/* Malzeme & Saya */}
                <label className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Saya & Malzeme</span>
                  <input
                    type="checkbox"
                    checked={showMaterial}
                    onChange={e => setShowMaterial(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                {/* Asorti Matrisi Tablosu */}
                <label className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Asorti / Beden Tablosu</span>
                  <input
                    type="checkbox"
                    checked={showAssortmentTable}
                    onChange={e => setShowAssortmentTable(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                {/* Koli Sıra No (Koli X/Y) */}
                <label className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Koli No / Toplam (Koli 1/10)</span>
                  <input
                    type="checkbox"
                    checked={showBoxSerial}
                    onChange={e => setShowBoxSerial(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                {/* Sipariş & Müşteri */}
                <label className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Sipariş & Alıcı Bilgisi</span>
                  <input
                    type="checkbox"
                    checked={showOrderInfo}
                    onChange={e => setShowOrderInfo(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                {/* Lojistik Piktogramlar */}
                <label className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Taşıma Piktogramları (🍷 ☔ ⬆️)</span>
                  <input
                    type="checkbox"
                    checked={showLogisticsIcons}
                    onChange={e => setShowLogisticsIcons(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                {/* Ağırlık / Desi */}
                <label className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Ağırlık & Desi</span>
                  <input
                    type="checkbox"
                    checked={showWeightDesi}
                    onChange={e => setShowWeightDesi(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                {/* Fiyat */}
                <label className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Fiyat Göster</span>
                  <input
                    type="checkbox"
                    checked={showPrice}
                    onChange={e => setShowPrice(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                {/* Ürün Görseli */}
                <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl sm:col-span-2">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="font-bold text-slate-800 dark:text-slate-200">Ürün Minyatür Görseli</span>
                    <input
                      type="checkbox"
                      checked={showProductImage}
                      onChange={e => setShowProductImage(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                  </label>

                  {showProductImage && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                            Görsel Boyutu: <span className="font-mono text-indigo-600 font-black">{imageSizeMm} mm</span>
                          </label>
                          <input
                            type="range"
                            min={12}
                            max={45}
                            value={imageSizeMm}
                            onChange={e => setImageSizeMm(Number(e.target.value))}
                            className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                            Çerçeve Uyum Modu
                          </label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setImageFit('contain')}
                              className={cn(
                                "flex-1 py-1 rounded-lg text-xs font-bold border transition-all",
                                imageFit === 'contain' ? "bg-indigo-600 text-white border-indigo-600 shadow-xs" : "bg-white dark:bg-slate-900 border-slate-200 text-slate-700"
                              )}
                            >
                              Sığdır
                            </button>
                            <button
                              type="button"
                              onClick={() => setImageFit('cover')}
                              className={cn(
                                "flex-1 py-1 rounded-lg text-xs font-bold border transition-all",
                                imageFit === 'cover' ? "bg-indigo-600 text-white border-indigo-600 shadow-xs" : "bg-white dark:bg-slate-900 border-slate-200 text-slate-700"
                              )}
                            >
                              Doldur
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                          Görsel Konumu / Hizalama
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setImagePosition('right')}
                            className={cn(
                              "flex-1 py-1 rounded-lg text-xs font-bold border transition-all",
                              imagePosition === 'right' ? "bg-indigo-600 text-white border-indigo-600 shadow-xs" : "bg-white dark:bg-slate-900 border-slate-200 text-slate-700"
                            )}
                          >
                            Sağ Üstte
                          </button>
                          <button
                            type="button"
                            onClick={() => setImagePosition('left')}
                            className={cn(
                              "flex-1 py-1 rounded-lg text-xs font-bold border transition-all",
                              imagePosition === 'left' ? "bg-indigo-600 text-white border-indigo-600 shadow-xs" : "bg-white dark:bg-slate-900 border-slate-200 text-slate-700"
                            )}
                          >
                            Solda
                          </button>
                          <button
                            type="button"
                            onClick={() => setImagePosition('top')}
                            className={cn(
                              "flex-1 py-1 rounded-lg text-xs font-bold border transition-all",
                              imagePosition === 'top' ? "bg-indigo-600 text-white border-indigo-600 shadow-xs" : "bg-white dark:bg-slate-900 border-slate-200 text-slate-700"
                            )}
                          >
                            Üstte Ortada
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Alt Uyarı Notu */}
                <label className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors sm:col-span-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Özel Uyarı / Sevk Notu Metni</span>
                  <input
                    type="checkbox"
                    checked={showCustomNote}
                    onChange={e => setShowCustomNote(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

              </div>
            </div>

            {/* 4. Barkod ve Çerçeve Ayarları */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5" />
                4. Barkod Biçimi & Çerçeve
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Barkod Standardı
                  </label>
                  <select
                    value={barcodeType}
                    onChange={e => setBarcodeType(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                  >
                    <option value="CODE-128">CODE-128 (Tavsiye Edilen)</option>
                    <option value="EAN-13">EAN-13 (Perakende)</option>
                    <option value="QR">QR Kod</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Barkod Çubuk Yüksekliği
                  </label>
                  <input
                    type="range"
                    min={18}
                    max={65}
                    value={barcodeHeight}
                    onChange={e => setBarcodeHeight(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="text-[10px] text-slate-500 text-right font-mono">{barcodeHeight} px</div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Etiket Dış Çerçevesi
                  </label>
                  <select
                    value={borderStyle}
                    onChange={e => setBorderStyle(e.target.value as any)}
                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                  >
                    <option value="solid">Düz Siyah Çerçeve (Solid)</option>
                    <option value="dashed">Kesikli Çizgi (Dashed)</option>
                    <option value="none">Çerçevesiz (None)</option>
                  </select>
                </div>
              </div>
            </div>

          </div>

          {/* SAĞ PANEL: CANLI TERMAL ÖNİZLEME */}
          <DesignerPreviewPanel
            effectiveW={effectiveW}
            effectiveH={effectiveH}
            selectedProductId={selectedProductId}
            setSelectedProductId={setSelectedProductId}
            products={products}
            selectedAssortmentTemplateId={selectedAssortmentTemplateId}
            setSelectedAssortmentTemplateId={setSelectedAssortmentTemplateId}
            assortmentTemplates={assortmentTemplates}
            borderStyle={borderStyle}
            showCompanyHeader={showCompanyHeader}
            companyHeaderText={companyHeaderText}
            sampleData={sampleData}
            showBoxSerial={showBoxSerial}
            showProductImage={showProductImage}
            imagePosition={imagePosition}
            imageSizeMm={imageSizeMm}
            imageFit={imageFit}
            showProductCode={showProductCode}
            showProductName={showProductName}
            showColor={showColor}
            showMaterial={showMaterial}
            showPrice={showPrice}
            priceCurrency={priceCurrency}
            showAssortmentTable={showAssortmentTable}
            showOrderInfo={showOrderInfo}
            showLogisticsIcons={showLogisticsIcons}
            showWeightDesi={showWeightDesi}
            showBarcode={showBarcode}
            barcodeHeight={barcodeHeight}
            showBarcodeText={showBarcodeText}
            showCustomNote={showCustomNote}
            customNoteText={customNoteText}
            onClose={onClose}
            handleSave={handleSave}
            templateToEdit={templateToEdit}
          />

        </div>

      </div>
    </div>
  );
};
