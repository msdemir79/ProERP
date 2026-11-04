import React, { useRef, useState, useMemo } from 'react';
import { 
  Printer, 
  Download, 
  X, 
  CheckSquare, 
  Square, 
  Calendar, 
  Clock, 
  User, 
  Layers, 
  Scissors, 
  Hammer, 
  Sparkles, 
  Package, 
  QrCode, 
  Barcode, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  ExternalLink,
  Camera
} from 'lucide-react';
import Modal from '../Modal';
import { BarcodeSvg } from '../BarcodeSvg';
import type { WorkOrder, Product, ProductionStage, Recipe, Contact } from '../../types';
import { productionService } from '../../services/productionService';
import { showToast } from '../../lib/feedback';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import { sanitizeClonedDocumentColors } from '../../lib/pdfService';

interface ProductionRefakatKartiModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrder | null;
  product?: Product | null;
  recipe?: Recipe | null;
  customer?: Contact | null;
  onStageUpdated?: () => void;
  onStatusUpdated?: () => void;
  onOpenScanner?: (initialCode?: string) => void;
}

export default function ProductionRefakatKartiModal({
  isOpen,
  onClose,
  workOrder,
  product,
  recipe,
  customer,
  onStageUpdated,
  onStatusUpdated,
  onOpenScanner
}: ProductionRefakatKartiModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [updatingStage, setUpdatingStage] = useState<string | null>(null);
  const [printNotice, setPrintNotice] = useState<{ message: string; blobUrl?: string } | null>(null);

  const assortmentTemplate = useApiQuery(async () => {
    if (!product?.assortmentTemplateId) return null;
    return await api.assortmentTemplates.get(product.assortmentTemplateId);
  }, [product?.assortmentTemplateId], ['assortmentTemplates']);

  // Size distribution breakdown - Calculated accurately for production quantity
  const sizeEntries = useMemo<{ size: string; quantity: number }[]>(() => {
    if (!workOrder) return [];

    // 1. Explicit assortmentBreakdown on the work order
    if (workOrder.assortmentBreakdown && workOrder.assortmentBreakdown.length > 0) {
      const valid = workOrder.assortmentBreakdown.filter(item => item && item.size);
      if (valid.length > 0) {
        return valid;
      }
    }

    // 2. Specific single size (e.g. workOrder.size = "42")
    if (workOrder.size && workOrder.size.trim() !== '') {
      return [{ size: workOrder.size.trim(), quantity: workOrder.quantity }];
    }

    // 3. Product direct assortment ratio
    if (product?.assortment && product.assortment.length > 0) {
      const totalAssort = product.assortment.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
      if (totalAssort > 0) {
        const ratio = workOrder.quantity / totalAssort;
        let sum = 0;
        const mapped = product.assortment.map(a => {
          const q = Math.round((Number(a.quantity) || 0) * ratio);
          sum += q;
          return { size: String(a.size), quantity: q };
        });
        const diff = workOrder.quantity - sum;
        if (diff !== 0 && mapped.length > 0) {
          mapped[mapped.length - 1].quantity += diff;
        }
        return mapped;
      }
    }

    // 4. Assortment template
    if (assortmentTemplate && assortmentTemplate.items && assortmentTemplate.items.length > 0) {
      const totalAssort = assortmentTemplate.items.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
      if (totalAssort > 0) {
        const ratio = workOrder.quantity / totalAssort;
        let sum = 0;
        const mapped = assortmentTemplate.items.map(a => {
          const q = Math.round((Number(a.quantity) || 0) * ratio);
          sum += q;
          return { size: String(a.size), quantity: q };
        });
        const diff = workOrder.quantity - sum;
        if (diff !== 0 && mapped.length > 0) {
          mapped[mapped.length - 1].quantity += diff;
        }
        return mapped;
      }
    }

    // 5. Unique sizes from product variant barcodes (without using variant warehouse stock!)
    if (product?.variantBarcodes && product.variantBarcodes.length > 0) {
      const uniqueSizes = Array.from(new Set(product.variantBarcodes.map(v => String(v.size)).filter(Boolean)));
      if (uniqueSizes.length > 0) {
        uniqueSizes.sort((a, b) => {
          const na = parseFloat(a);
          const nb = parseFloat(b);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return a.localeCompare(b);
        });

        const count = uniqueSizes.length;
        let weights: number[] = [];
        if (count === 5) weights = [1, 2, 2, 2, 1];
        else if (count === 6) weights = [1, 2, 2, 2, 2, 1];
        else if (count === 4) weights = [1, 2, 2, 1];
        else weights = new Array(count).fill(1);

        const totalWeight = weights.reduce((s, w) => s + w, 0);
        let allocated = 0;
        const items = uniqueSizes.map((size, idx) => {
          const q = Math.round(workOrder.quantity * (weights[idx] / totalWeight));
          allocated += q;
          return { size, quantity: q };
        });
        const diff = workOrder.quantity - allocated;
        if (diff !== 0 && items.length > 0) {
          items[Math.floor(items.length / 2)].quantity += diff;
        }
        return items;
      }
    }

    // 6. Default standard 40-44 classic shoe distribution (Standard ratio: 1/8, 2/8, 2/8, 2/8, 1/8)
    const defaultSizes = ['40', '41', '42', '43', '44'];
    const weights = [1, 2, 2, 2, 1];
    const totalWeight = 8;
    let allocated = 0;
    const items = defaultSizes.map((size, idx) => {
      const q = Math.round(workOrder.quantity * (weights[idx] / totalWeight));
      allocated += q;
      return { size, quantity: q };
    });
    const diff = workOrder.quantity - allocated;
    if (diff !== 0 && items.length > 2) {
      items[2].quantity += diff;
    }
    return items;
  }, [workOrder, product, assortmentTemplate]);

  if (!isOpen || !workOrder) return null;

  // Stages definition matching factory flow: Kesim ➔ Dikim ➔ Montaj ➔ Finisaj
  const STAGES_FLOW: {
    key: ProductionStage;
    codeSuffix: string;
    title: string;
    subtitle: string;
    icon: any;
    department: string;
    defaultScrapRate: string;
    specs: string;
  }[] = [
    {
      key: 'cutting',
      codeSuffix: 'KES',
      title: '1. KESİM BÖLÜMÜ',
      subtitle: 'Saya Derisi, Astar, Mostra & Taban Kalıp Kesimi',
      icon: Scissors,
      department: 'Kesimhane',
      defaultScrapRate: '%1.5 Fire Payı',
      specs: 'Hakiki deri yönüne ve damarlarına dikkat edilsin. Çiftler ton farklılığı olmaksızın eşleştirilsin.'
    },
    {
      key: 'sewing',
      codeSuffix: 'DIK',
      title: '2. DİKİM & SAYA BÖLÜMÜ',
      subtitle: 'Tıraşlama, Çatım, Dikiş, Etiket & Kapsül',
      icon: Layers,
      department: 'Saya Atölyesi',
      defaultScrapRate: '%1.0 Hata Payı',
      specs: 'İğne no: 110/18, dikiş adımı: 4 mm. Bağcık kapsülleri pres ile eşit hizada çakılsın.'
    },
    {
      key: 'assembly',
      codeSuffix: 'MON',
      title: '3. MONTAJ & KALIPLAMA BÖLÜMÜ',
      subtitle: 'Kalıba Çekme, Taban Astarı, Fırın & Taban Presi',
      icon: Hammer,
      department: 'Montaj Bandı',
      defaultScrapRate: '%0.5 Tolerans',
      specs: 'Fırın ısısı: 75°C (3 dk), Pres basıncı: 4.5 Bar. Taban yapışma kenarlarında taşma olmasın.'
    },
    {
      key: 'finishing',
      codeSuffix: 'FIN',
      title: '4. FİNİSAJ & KALİTE PAKET',
      subtitle: 'Kalıptan Çıkarma, Temizlik, Boya, Bağcık & Kutu',
      icon: Sparkles,
      department: 'Finisaj & Depo Kabul',
      defaultScrapRate: 'Sıfır Hata Hedefi',
      specs: 'İç pelur kağıt serilsin, kutu barkod etiketi kontrol edilsin, silika jel nem alıcı konulsun.'
    }
  ];

  const STAGE_ORDER: ProductionStage[] = [
    'planning',
    'cutting',
    'printing',
    'sewing',
    'assembly',
    'finishing',
    'quality_packing',
    'completed'
  ];

  const getStageState = (stageKey: ProductionStage) => {
    const s = workOrder.stages?.find(item => item.stage === stageKey);
    const currentIdx = STAGE_ORDER.indexOf(workOrder.currentStage);
    const thisIdx = STAGE_ORDER.indexOf(stageKey);
    const isPast = currentIdx > thisIdx || (workOrder.status === 'completed');
    const isCurrent = workOrder.currentStage === stageKey;
    const isCompleted = s?.status === 'completed' || isPast;

    return {
      isCompleted,
      isCurrent,
      operator: s?.operator || (isCompleted ? 'Onaylandı' : 'Bekliyor'),
      completedAt: s?.completedAt || (isCompleted ? workOrder.createdAt : undefined),
      startedAt: s?.startedAt
    };
  };

  const handleToggleStageDigital = async (stageKey: ProductionStage) => {
    if (!workOrder.id) return;
    setUpdatingStage(stageKey);
    try {
      await productionService.advanceWorkOrderStage(workOrder.id, stageKey, {
        operator: 'Refakat Kartı Onaylayıcı'
      });
      if (onStageUpdated) onStageUpdated();
      if (onStatusUpdated) onStatusUpdated();
    } catch (err: any) {
      showToast(`Aşama güncellenirken hata: ${err.message}`, 'error');
    } finally {
      setUpdatingStage(null);
    }
  };

  const handleDirectPrint = async () => {
    if (!printRef.current) return;
    setIsPrinting(true);
    setPrintNotice(null);

    try {
      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          sanitizeClonedDocumentColors(clonedDoc);
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const printWindow = window.open('', '_blank');

      if (!printWindow || printWindow.closed || typeof printWindow.closed === 'undefined') {
        // Pop-up blocked fallback: Create blob URL
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          setPrintNotice({
            message: 'Tarayıcınız doğrudan pencere açılmasını engelledi. Fişi yazdırmak için bağlantıya tıklayabilirsiniz:',
            blobUrl
          });
        } else {
          window.print();
        }
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Refakat Kartı - ${workOrder.barcode}</title>
            <style>
              @page { size: A4 portrait; margin: 10mm; }
              body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: flex-start; background: #fff; }
              img { width: 100%; max-width: 190mm; height: auto; display: block; }
            </style>
          </head>
          <body>
            <img src="${imgData}" onload="window.focus(); window.print();" />
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (error) {
      console.error('Yazdırma hatası:', error);
      window.print();
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    setIsGeneratingPdf(true);

    try {
      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          sanitizeClonedDocumentColors(clonedDoc);
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, 297));
      pdf.save(`Refakat_Karti_${workOrder.barcode}.pdf`);
    } catch (error) {
      console.error('PDF oluşturma hatası:', error);
      showToast('PDF oluşturulurken bir sorun oluştu.', 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Üretim Refakat Kartı (İş Emri & Bant Takip Fişi)"
      className="max-w-4xl max-h-[92vh] overflow-y-auto"
    >
      <div className="space-y-4">
        {/* Print Notice if pop-up blocked */}
        {printNotice && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-amber-950 dark:text-amber-200 p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold">
            <div className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{printNotice.message}</span>
              {printNotice.blobUrl && (
                <a
                  href={printNotice.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-bold text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 inline-flex items-center gap-1 ml-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Yazdırılabilir Görseli Aç
                </a>
              )}
            </div>
            <button
              onClick={() => setPrintNotice(null)}
              className="p-1 hover:bg-amber-200/60 dark:hover:bg-amber-900/60 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Action Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Üretim Refakat Takip No:</span>
            <span className="font-mono font-black text-indigo-600 dark:text-indigo-400 text-sm">
              #{workOrder.barcode}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold">
              {workOrder.quantity} Çift
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenScanner && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenScanner(workOrder.barcode);
                }}
                className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Kamera ile bu refakat kartını ve aşamalarını tara"
              >
                <Camera className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Kamera ile Oku</span>
              </button>
            )}

            <button
              type="button"
              disabled={isGeneratingPdf}
              onClick={handleDownloadPdf}
              className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>PDF...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>A4 PDF İndir</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isPrinting}
              onClick={handleDirectPrint}
              className="py-2 px-4 bg-slate-900 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
            >
              {isPrinting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Hazırlanıyor...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  <span>Fişi Yazdır</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* PRINTABLE A4 REFAKAT KARTI SHEET */}
        <div className="overflow-x-auto p-1">
          <div
            ref={printRef}
            id="production-traveler-card"
            className="w-full min-w-[720px] bg-white text-slate-900 p-6 rounded-2xl border-2 border-slate-950 shadow-sm space-y-4 select-text"
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
          >
            {/* Header: Company, Document Title & Barcodes */}
            <div className="border-b-2 border-slate-950 pb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-950 text-white flex items-center justify-center font-black text-sm">
                      ERP
                    </div>
                    <div>
                      <h2 className="text-sm font-black tracking-wider uppercase text-slate-800">
                        DMR NEXUS
                      </h2>
                      <p className="text-[10px] text-slate-600 font-semibold">
                        Ayakkabı İmalat & Üretim Takip Bandı Sistemi
                      </p>
                    </div>
                  </div>
                  <h1 className="text-xl font-black uppercase tracking-tight text-slate-950 mt-1">
                    ÜRETİM REFAKAT KARTI (İŞ EMRİ FİŞİ)
                  </h1>
                  <p className="text-[11px] text-slate-600">
                    Bu refakat kartı üretim süresince (Kesim ➔ Dikim ➔ Montaj ➔ Finisaj) partinin yanında fiziken bulunmak zorundadır.
                  </p>
                </div>

                {/* Primary Batch Barcode & Tracking Tag */}
                <div className="text-right flex flex-col items-end shrink-0">
                  <div className="bg-slate-100 border border-slate-300 rounded-xl p-2 flex flex-col items-center">
                    <span className="text-[9px] font-black uppercase text-slate-600 mb-1">
                      Parti / İş Emri Takip Barkodu
                    </span>
                    <BarcodeSvg value={workOrder.barcode} height={42} showText={true} />
                  </div>
                  <div className="text-[10px] font-bold text-slate-600 mt-1 flex items-center gap-2">
                    <span>Tarih: {new Date(workOrder.createdAt || Date.now()).toLocaleDateString('tr-TR')}</span>
                    <span>•</span>
                    <span>Vardiya: 1. Vardiya (Gündüz)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Model & Order Specifications Grid */}
            <div className="grid grid-cols-4 gap-3 bg-slate-50 border border-slate-300 p-3.5 rounded-xl text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Model Adı / Kodu</span>
                <span className="text-sm font-black text-slate-950 block leading-tight mt-0.5">
                  {product?.name || 'Klasik Ayakkabı'}
                </span>
                <span className="text-[11px] font-mono font-bold text-indigo-700">
                  Kod: {product?.code || 'MAM-01'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Kalıp / Seri Grubu</span>
                <span className="text-xs font-black text-slate-900 block mt-0.5">
                  Kalıp No: {product?.moldCode || '018 Standart'}
                </span>
                <span className="text-[10px] text-slate-600 font-semibold block">
                  {product?.moldGroup || 'ERKEK KLASİK (40-45)'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Sipariş & Müşteri</span>
                <span className="text-xs font-black text-slate-900 block mt-0.5">
                  {workOrder.orderNumber ? `Sipariş: ${workOrder.orderNumber}` : 'Stok Üretimi'}
                </span>
                <span className="text-[10px] text-slate-700 font-semibold truncate block">
                  {workOrder.customerName || 'Fabrika İç Depo'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Toplam Parti Miktarı</span>
                <span className="text-base font-black text-slate-950 block mt-0.5">
                  {workOrder.quantity} Çift
                </span>
                <span className="text-[10px] font-bold text-slate-700">
                  Renk: {workOrder.color || 'Siyah'} {workOrder.size ? `(${workOrder.size})` : ''}
                </span>
              </div>
            </div>

            {/* Size Matrix Breakdown Table (Ayakkabı Numara Dağılım Çizelgesi) */}
            <div className="border border-slate-300 rounded-xl overflow-hidden">
              <div className="bg-slate-200 px-3 py-1.5 flex items-center justify-between border-b border-slate-300">
                <span className="text-[10px] font-black uppercase text-slate-800 tracking-wider">
                  Parti Beden / Asorti Dağılım Matrisi
                </span>
                <span className="text-[10px] font-bold text-slate-600">
                  Planlanan Toplam: {workOrder.quantity} Çift
                </span>
              </div>
              <div className="flex divide-x divide-slate-300 text-center text-xs overflow-x-auto">
                {sizeEntries.map((item, idx) => (
                  <div key={`matrix-size-${item.size}-${idx}`} className="p-2 bg-white flex-1 min-w-[70px]">
                    <span className="text-[10px] font-bold text-slate-500 block uppercase">No {item.size}</span>
                    <span className="text-sm font-black text-slate-900 block mt-0.5">
                      {item.quantity} Çift
                    </span>
                  </div>
                ))}
                <div className="p-2 bg-slate-100 font-black flex flex-col justify-center items-center min-w-[85px] shrink-0">
                  <span className="text-[9px] text-slate-600 uppercase">Toplam</span>
                  <span className="text-sm text-indigo-900">{workOrder.quantity} Çift</span>
                </div>
              </div>
            </div>

            {/* PRODUCTION LINE STAGES & APPROVAL CHECKBOXES TABLE (4-AŞAMALI TAKİP VE ONAY KUTUCUKLARI) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-950 flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-indigo-700" />
                  Üretim Bandı Proses Aşamaları ve Onay Kutucukları
                </h3>
                <span className="text-[10px] text-slate-500 font-semibold italic">
                  * Her aşama bitiminde ilgili bölüm ustası tarafından onay kutusu işaretlenip paraflanmalıdır.
                </span>
              </div>

              <div className="border-2 border-slate-950 rounded-xl divide-y-2 divide-slate-950 overflow-hidden">
                {STAGES_FLOW.map((st, index) => {
                  const state = getStageState(st.key);
                  const stageBarcodeValue = `${workOrder.barcode}-${st.codeSuffix}`;

                  return (
                    <div 
                      key={st.key} 
                      className={`p-3 transition-colors ${
                        state.isCurrent 
                          ? 'bg-amber-50/50' 
                          : state.isCompleted 
                          ? 'bg-emerald-50/40' 
                          : 'bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Stage Details */}
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-900 text-white font-black text-[11px] flex items-center justify-center shrink-0">
                              {index + 1}
                            </span>
                            <span className="text-sm font-black text-slate-950">
                              {st.title}
                            </span>
                            <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
                              {st.department}
                            </span>
                            {state.isCompleted && (
                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-700" /> Tamamlandı
                              </span>
                            )}
                            {state.isCurrent && (
                              <span className="text-[10px] font-bold text-amber-900 bg-amber-200 px-2 py-0.5 rounded-full animate-pulse">
                                Aktif Bantta
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] font-bold text-slate-700">
                            {st.subtitle}
                          </p>

                          <p className="text-[10px] text-slate-500 leading-relaxed">
                            <span className="font-bold text-slate-700">Teknik Talimat:</span> {st.specs}
                          </p>
                        </div>

                        {/* Physical / Digital Sign-off Boxes */}
                        <div className="flex items-center gap-3 shrink-0">
                          {/* Sign-off Field Box */}
                          <div className="border border-slate-400 bg-white p-2 rounded-lg text-left text-[10px] space-y-1 w-52">
                            <div className="flex justify-between border-b border-slate-200 pb-1">
                              <span className="text-slate-500 font-semibold">Usta / Operatör:</span>
                              <span className="font-bold text-slate-900">{state.operator || '..................'}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-200 pb-1">
                              <span className="text-slate-500 font-semibold">Tarih / Saat:</span>
                              <span className="font-mono font-bold text-slate-800">
                                {state.completedAt ? new Date(state.completedAt).toLocaleString('tr-TR') : '..../..../2026'}
                              </span>
                            </div>
                            <div className="flex justify-between items-center pt-0.5">
                              <span className="text-slate-500 font-semibold">Tamamlanan:</span>
                              <span className="font-bold text-indigo-950 font-mono">
                                [ {workOrder.quantity} ] Çift
                              </span>
                            </div>
                          </div>

                          {/* Interactive Approval Checkbox */}
                          <div className="flex flex-col items-center justify-center p-2 rounded-xl border-2 border-slate-800 bg-slate-50 w-28 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleStageDigital(st.key)}
                              disabled={updatingStage === st.key}
                              className="group flex flex-col items-center gap-1 cursor-pointer transition-transform hover:scale-105"
                              title="Tıklayarak dijital onay durumunu güncelleyebilirsiniz"
                            >
                              {state.isCompleted ? (
                                <CheckSquare className="w-7 h-7 text-emerald-700" />
                              ) : (
                                <Square className="w-7 h-7 text-slate-400 group-hover:text-indigo-600" />
                              )}
                              <span className={`text-[10px] font-black uppercase ${state.isCompleted ? 'text-emerald-800' : 'text-slate-700'}`}>
                                {state.isCompleted ? 'ONAYLANDI' : 'ONAY KUTUSU'}
                              </span>
                            </button>
                            <span className="text-[8px] text-slate-500 font-mono mt-0.5">
                              Paraf: ...........
                            </span>
                          </div>

                          {/* Stage Barcode for Camera Scanner Scan */}
                          <div className="p-1.5 border border-slate-300 rounded-lg bg-white flex flex-col items-center w-28">
                            <span className="text-[7px] font-black uppercase text-slate-500">Aşama Barkodu</span>
                            <BarcodeSvg value={stageBarcodeValue} height={22} showText={false} />
                            <span className="text-[8px] font-mono font-bold text-slate-700">{stageBarcodeValue}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quality Check & Warehouse Receiving Section */}
            <div className="border border-slate-400 rounded-xl p-3 bg-slate-50 grid grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">1. Kalite Sağlam Çift</span>
                <span className="text-sm font-black text-emerald-800 font-mono block">
                  {workOrder.quantity} Çift
                </span>
                <span className="text-[9px] text-slate-500 block">Kusursuz mamul kutulanarak kolilendi.</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Fire / 2. Kalite</span>
                <span className="text-sm font-black text-rose-800 font-mono block">
                  0 Çift (Iskartasız)
                </span>
                <span className="text-[9px] text-slate-500 block">Tolerans limitleri dahilinde tamamlandı.</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Mamul Depo Kabul & İmzası</span>
                <span className="text-xs font-bold text-slate-900 block">
                  Sevkiyat Sorumlusu: ....................
                </span>
                <span className="text-[9px] text-slate-600 block">İmza & Kaşe: [ ☐ DEPOYA ALINDI ]</span>
              </div>
            </div>

            {/* Footer Notice */}
            <div className="border-t border-slate-300 pt-2 flex items-center justify-between text-[9px] text-slate-500 font-medium">
              <span>DMR Nexus Ayakkabı İmalat Takip Modülü • Belge No: REF-{workOrder.barcode}</span>
              <span>Baskı Tarihi: {new Date().toLocaleString('tr-TR')}</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
