import { useEffect, useState } from 'react';
import Modal from '../Modal';
import { BarcodeSvg } from '../BarcodeSvg';
import { PRODUCTION_STAGES_CONFIG } from '../../services/productionService';
import { openPrintWindow } from '../../lib/printService';
import { sanitizeCssColor } from '../../lib/pdfService';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { Printer, ExternalLink, X, FileSpreadsheet, Download, Loader2 } from 'lucide-react';
import type { WorkOrder } from '../../types';

interface WorkOrderTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrder | null;
  productName?: string;
  productCode?: string;
  onOpenDetailedSheet: (wo: WorkOrder) => void;
}

export default function WorkOrderTicketModal({
  isOpen,
  onClose,
  workOrder,
  productName,
  productCode,
  onOpenDetailedSheet,
}: WorkOrderTicketModalProps) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [printNotice, setPrintNotice] = useState<{ message: string; blobUrl?: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPrintNotice(null);
  }, [isOpen, workOrder?.id]);

  const handleDownloadPdf = async () => {
    const printArea = document.getElementById('printable-ticket');
    if (!printArea || !workOrder) return;

    setIsDownloadingPdf(true);
    try {
      const canvas = await html2canvas(printArea, {
        scale: 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const printRoot = clonedDoc.getElementById('printable-ticket');
          if (printRoot) {
            printRoot.style.fontFamily = 'Arial, Helvetica, sans-serif';
            printRoot.style.letterSpacing = 'normal';
            printRoot.style.transform = 'none';
          }
          const allElements = clonedDoc.querySelectorAll('*');
          allElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            try {
              htmlEl.style.fontFamily = 'Arial, Helvetica, sans-serif';
              htmlEl.style.letterSpacing = 'normal';
              const computed = window.getComputedStyle(htmlEl);
              const colorProps = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'];
              colorProps.forEach((prop) => {
                const val = (computed as any)[prop];
                if (val && (val.includes('oklch') || val.includes('oklab') || val.includes('color(') || val.includes('lab(') || val.includes('lch('))) {
                  (htmlEl.style as any)[prop] = sanitizeCssColor(val);
                }
              });
            } catch {}
          });
        },
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const imgWidth = 180;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 15, 20, imgWidth, Math.min(imgHeight, 250));

      const cleanBarcode = String(workOrder.barcode || workOrder.id || 'proses').replace(/[^a-zA-Z0-9_-]/g, '_');
      pdf.save(`Is_Emri_Proses_Karti_${cleanBarcode}.pdf`);
    } catch (err) {
      console.error('PDF oluşturulurken hata:', err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handlePrint = async () => {
    const printArea = document.getElementById('printable-ticket');
    if (!printArea || !workOrder) return;

    setIsPrinting(true);
    setPrintNotice(null);

    try {
      const blobUrl = openPrintWindow(
        printArea.outerHTML,
        `İş Emri Proses Kartı - ${workOrder.barcode}`,
        {
          title: `İş Emri Proses Ref Kartı - ${workOrder.barcode}`,
          landscape: false,
          css: `
            body { background: #ffffff !important; padding: 12px !important; }
            #printable-ticket {
              margin: 0 auto !important;
              max-width: 620px !important;
              border: 2px solid #000000 !important;
              border-radius: 16px !important;
              padding: 16px !important;
              background: #ffffff !important;
              box-shadow: none !important;
            }
          `,
        }
      );

      setPrintNotice({
        message: 'İş emri proses kartı yeni yazdırma sekmesinde açıldı ve yazıcı penceresi otomatik tetiklendi.',
        blobUrl: blobUrl || undefined,
      });

      if (window.self === window.top) {
        setTimeout(() => {
          try {
            window.print();
          } catch (e) {
            console.warn('Native window.print failed:', e);
          }
        }, 150);
      }
    } catch (err) {
      console.error('Baskı başlatılırken hata:', err);
      await handleDownloadPdf();
    } finally {
      setTimeout(() => {
        setIsPrinting(false);
      }, 1000);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="İş Emri & Proses Ref Kartı"
      className="max-w-xl"
    >
      {workOrder && (
        <div className="space-y-4">
          {printNotice && (
            <div className="bg-amber-50 border border-amber-300 text-amber-950 p-3 rounded-2xl flex items-center justify-between gap-3 text-xs font-semibold print:hidden shadow-sm">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-amber-700 shrink-0" />
                <span>{printNotice.message}</span>
                {printNotice.blobUrl && (
                  <a
                    href={printNotice.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-bold text-indigo-700 hover:text-indigo-900 ml-1 inline-flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Yazdırma Sayfasını Aç
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPrintNotice(null)}
                className="p-1 hover:bg-amber-200/70 rounded-lg text-slate-600 cursor-pointer"
                title="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div id="printable-ticket" className="bg-white dark:bg-slate-900 p-6 rounded-3xl border-2 border-slate-900 space-y-4 text-black">
            <div className="flex items-center justify-between border-b-2 border-black pb-3">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight">DMR NEXUS İŞ EMRİ REFAKAT KARTI</h3>
                <p className="text-[10px] font-mono font-bold">TAKİP NO: {workOrder.barcode}</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold font-mono">{new Date().toLocaleDateString('tr-TR')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-300">
              <div>
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Model Adı / Kodu</span>
                <span className="text-sm font-black text-black">
                  {productName} ({productCode})
                </span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Üretim Miktarı</span>
                <span className="text-sm font-black text-black">{workOrder.quantity} Çift / Adet</span>
              </div>
              {workOrder.orderNumber && (
                <div>
                  <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Sipariş / Müşteri</span>
                  <span className="text-xs font-black text-black">{workOrder.orderNumber} - {workOrder.customerName || ''}</span>
                </div>
              )}
              {workOrder.color && (
                <div>
                  <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Varyant / Renk</span>
                  <span className="text-xs font-black text-black">{workOrder.color} {workOrder.size ? `(${workOrder.size})` : ''}</span>
                </div>
              )}
            </div>

            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-300 rounded-2xl flex flex-col items-center justify-center">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">İş Emri Ana Barkodu</div>
              <BarcodeSvg value={workOrder.barcode} height={50} showText={true} />
            </div>

            <div className="space-y-2">
              <div className="text-[9px] font-black uppercase tracking-wider text-slate-600">Proses Aşama Ref Kodları</div>
              <div className="grid grid-cols-4 gap-1.5 text-center text-[8px] font-bold font-mono">
                {PRODUCTION_STAGES_CONFIG.slice(1, 7).map((st) => (
                  <div key={st.id} className="p-1.5 rounded-lg border border-slate-300 bg-slate-50 dark:bg-slate-800/50">
                    <div className="text-[8px] font-black uppercase text-slate-800 dark:text-slate-200 mb-0.5">{st.shortLabel}</div>
                    <BarcodeSvg value={`${workOrder.barcode}-${st.id.slice(0, 3).toUpperCase()}`} height={24} showText={false} />
                    <span className="text-[7px] text-slate-500 dark:text-slate-400">{workOrder.barcode}-{st.id.slice(0, 3).toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDetailedSheet(workOrder);
              }}
              className="py-2.5 px-4 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md shadow-amber-400/20 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" /> Detaylı A4 Kartelayı Aç
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isDownloadingPdf}
                onClick={handleDownloadPdf}
                className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
              >
                {isDownloadingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> PDF...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" /> PDF İndir
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isPrinting}
                onClick={handlePrint}
                className="py-2.5 px-5 bg-slate-900 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
              >
                {isPrinting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Yazıcı Açılıyor...
                  </>
                ) : (
                  <>
                    <Printer className="w-4 h-4" /> Barkod Kartını Yazdır
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
