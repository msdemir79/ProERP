import { useState, useEffect, useRef } from 'react';
import { Printer, X, Receipt, Ban, ExternalLink, Layers, Sparkles, Download, FileCode2, Code } from 'lucide-react';
import { invoiceService } from '../../services/invoiceService';
import { settingsService } from '../../services/settingsService';
import { printHtml, openPrintWindow } from '../../lib/printService';
import { downloadElementAsPdf } from '../../lib/pdfService';
import { generateUblTrInvoiceXml, downloadXmlFile } from '../../lib/ublTrGenerator';
import { UblXmlViewerModal } from '../Common/UblXmlViewerModal';
import { cn } from '../../lib/utils';
import { showToast } from '../../lib/feedback';
import type { Invoice } from '../../types';
import { GibOfficialTemplate } from './GibOfficialTemplate';
import { CorporateModernTemplate } from './CorporateModernTemplate';
import { CompactDeliveryTemplate } from './CompactDeliveryTemplate';

// =========================================================================================
// HELPER: TÜRKÇE YAZIYLA TUTAR FONKSİYONU (Resmi e-Fatura Zorunluluğu)
// =========================================================================================
export function numberToTurkishWords(num: number): string {
  if (isNaN(num)) return '';
  const isNegative = num < 0;
  const absNum = Math.abs(num);
  const lira = Math.floor(absNum);
  const kurus = Math.round((absNum - lira) * 100);

  const ones = ['', 'BİR', 'İKİ', 'ÜÇ', 'DÖRT', 'BEŞ', 'ALTI', 'YEDİ', 'SEKİZ', 'DOKUZ'];
  const tens = ['', 'ON', 'YİRMİ', 'OTUZ', 'KIRK', 'ELLİ', 'ALTMIŞ', 'YETMİŞ', 'SEKSEN', 'DOKSAN'];

  function threeDigitToWords(n: number): string {
    let result = '';
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const o = n % 10;

    if (h === 1) {
      result += 'YÜZ';
    } else if (h > 1) {
      result += ones[h] + 'YÜZ';
    }

    if (t > 0) {
      result += tens[t];
    }

    if (o > 0) {
      result += ones[o];
    }

    return result;
  }

  function convertInteger(val: number): string {
    if (val === 0) return 'SIFIR';

    const billions = Math.floor(val / 1000000000);
    const millions = Math.floor((val % 1000000000) / 1000000);
    const thousands = Math.floor((val % 1000000) / 1000);
    const remainder = val % 1000;

    let res = '';

    if (billions > 0) {
      res += threeDigitToWords(billions) + 'MİLYAR';
    }

    if (millions > 0) {
      res += threeDigitToWords(millions) + 'MİLYON';
    }

    if (thousands > 0) {
      if (thousands === 1) {
        res += 'BİN';
      } else {
        res += threeDigitToWords(thousands) + 'BİN';
      }
    }

    if (remainder > 0) {
      res += threeDigitToWords(remainder);
    }

    return res;
  }

  const liraText = convertInteger(lira);
  const kurusText = kurus > 0 ? convertInteger(kurus) : 'SIFIR';

  const prefix = isNegative ? 'EKSİ ' : '';
  return `#${prefix}${liraText} TÜRK LİRASI ${kurusText} KURUŞ#`;
}

// Şablon Tipleri
export type InvoiceTemplateType = 'official_gib' | 'corporate_modern' | 'compact_delivery';

interface InvoicePrintModalProps {
  invoiceId: number;
  isOpen: boolean;
  onClose: () => void;
  onOpenActionModal?: (invoice: Invoice) => void;
}

export function InvoicePrintModal({ 
  invoiceId, 
  isOpen, 
  onClose, 
  onOpenActionModal 
}: InvoicePrintModalProps) {
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<InvoiceTemplateType>('official_gib');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [xmlModalOpen, setXmlModalOpen] = useState(false);
  const [currentXmlContent, setCurrentXmlContent] = useState('');
  const printContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);
      const [data, sysSettings] = await Promise.all([
        invoiceService.getInvoice(invoiceId),
        settingsService.getSystemSettings()
      ]);
      setInvoiceDetail(data);
      if (sysSettings?.company) {
        setCompanySettings(sysSettings.company);
      }
      setLoading(false);
    }
    if (invoiceId) {
      fetchDetail();
    }
  }, [invoiceId]);

  if (!isOpen) return null;

  // KDV Oranlarına Göre Dağılım Hesabı
  const taxBreakdown: { [rate: number]: { matrah: number; tax: number; total: number } } = {};
  if (invoiceDetail?.items) {
    invoiceDetail.items.forEach((item: any) => {
      const rate = Number(item.taxRate) || 0;
      const itemMatrah = (Number(item.quantity) * Number(item.unitPrice)) - (Number(item.discountAmount) || 0);
      const itemTax = Number(item.taxAmount) || (itemMatrah * (rate / 100));
      
      if (!taxBreakdown[rate]) {
        taxBreakdown[rate] = { matrah: 0, tax: 0, total: 0 };
      }
      taxBreakdown[rate].matrah += itemMatrah;
      taxBreakdown[rate].tax += itemTax;
      taxBreakdown[rate].total += (itemMatrah + itemTax);
    });
  }

  // Fatura Tarihi ve Saati Formatlama
  const invoiceDate = invoiceDetail?.date ? new Date(invoiceDetail.date) : new Date();
  const formattedDate = invoiceDate.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formattedTime = invoiceDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const dueDateFormatted = invoiceDetail?.dueDate ? new Date(invoiceDetail.dueDate).toLocaleDateString('tr-TR') : null;

  // Türkçe Yazıyla Tutar
  const amountInWords = invoiceDetail ? numberToTurkishWords(invoiceDetail.grandTotal || 0) : '';

  // Firma Bilgileri (Dinamik Ayarlardan)
  const compName = companySettings?.companyName || 'DMR Nexus';
  const compTitle = companySettings?.companyTitle || companySettings?.companyName || 'DMR Nexus';
  const compLogo = companySettings?.logo;
  const compAddress = companySettings?.address || 'Organize Sanayi Bölgesi 12. Cadde No: 45 / Başakşehir / İSTANBUL';
  const compTaxOffice = companySettings?.taxOffice || 'İkitelli V.D.';
  const compTaxNumber = companySettings?.taxNumber || '7340592811';
  const compTradeReg = companySettings?.tradeRegistryNo || '948123-5';
  const compPhone = companySettings?.phone || '(0212) 555 01 99';
  const compEmail = companySettings?.email || '';
  const compWebsite = companySettings?.website || '';
  const compBank = companySettings?.bankName || 'T.C. Ziraat Bankası - İkitelli Şubesi';
  const compIban = companySettings?.iban || 'TR33 0001 0002 0003 0004 0005 01';

  // Yazdırma İşlemi (Universal Print Service)
  const handlePrint = (openInNewTab: boolean = false) => {
    if (!printContainerRef.current) {
      window.print();
      return;
    }

    const htmlContent = printContainerRef.current.innerHTML;
    const pageTitle = `Fatura_${invoiceDetail?.invoiceNumber || 'Belge'}`;

    const printCss = `
      @page {
        size: A4 portrait;
        margin: 8mm 10mm;
      }
      @media print {
        body {
          background-color: #ffffff !important;
          color: #000000 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .no-print { display: none !important; }
      }
      body {
        font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
        color: #111827;
        margin: 0;
        padding: 0;
        background: #fff;
      }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #d1d5db; }
    `;

    if (openInNewTab) {
      openPrintWindow(htmlContent, pageTitle, { css: printCss, landscape: false });
    } else {
      printHtml(htmlContent, { title: pageTitle, css: printCss, landscape: false });
    }
  };

  const handleDownloadDirectPdf = async () => {
    if (!printContainerRef.current || !invoiceDetail) return;
    setDownloadingPdf(true);
    try {
      const invNo = invoiceDetail.invoiceNumber || 'FATURA';
      await downloadElementAsPdf(printContainerRef.current, {
        filename: `${invNo}.pdf`,
        format: 'a4',
        orientation: 'portrait',
        marginMm: 6
      });
    } catch (err) {
      console.error('PDF indirme hatası:', err);
      showToast('PDF oluşturulamadı.', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadUblXml = () => {
    if (!invoiceDetail) return;
    const xml = generateUblTrInvoiceXml(invoiceDetail, companySettings);
    const invNo = invoiceDetail.invoiceNumber || 'FATURA';
    downloadXmlFile(xml, `${invNo}_UBL_TR12.xml`);
  };

  const handleOpenXmlPreview = () => {
    if (!invoiceDetail) return;
    const xml = generateUblTrInvoiceXml(invoiceDetail, companySettings);
    setCurrentXmlContent(xml);
    setXmlModalOpen(true);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[96vh] overflow-hidden my-auto animate-in fade-in zoom-in duration-150">
        
        {/* ========================================================================= */}
        {/* ÜST EYLEM VE ŞABLON SEÇİM ÇUBUĞU (Ekranda görünür, baskıda gizlenir) */}
        {/* ========================================================================= */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 print:hidden">
          
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-500/20 border border-indigo-400/30 rounded-xl flex items-center justify-center text-indigo-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Resmi Fatura Önizleme & Baskı
                </span>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-300 font-mono px-2 py-0.5 rounded border border-indigo-400/20">
                  {invoiceDetail?.invoiceNumber || '...'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                GİB standartlarına tam uyumlu A4 resmi baskı tasarımı
              </p>
            </div>
          </div>

          {/* Şablon Seçici (Tasarım Seçenekleri - Tamamı GİB Resmi Standartlarında) */}
          <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setTemplate('official_gib')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                template === 'official_gib'
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              )}
              title="Gelir İdaresi Başkanlığı resmi standart e-Arşiv / e-Fatura formatı (Kırmızı GİB Rozetli Klasik)"
            >
              <div className="w-2 h-2 rounded-full bg-white dark:bg-slate-900 animate-pulse" />
              1. GİB Klasik Resmi
            </button>

            <button
              onClick={() => setTemplate('corporate_modern')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                template === 'corporate_modern'
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              )}
              title="GİB resmi standardında, kurumsal lacivert ve üst düzey yönetici e-Fatura düzeni"
            >
              <Sparkles className="w-3.5 h-3.5" />
              2. GİB Kurumsal Lacivert
            </button>

            <button
              onClick={() => setTemplate('compact_delivery')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                template === 'compact_delivery'
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-300 hover:text-white hover:bg-slate-700/50"
              )}
              title="GİB resmi standardında, VUK 509 İrsaliye Yerine Geçen Sevk ve Lojistik e-Arşiv Fatura"
            >
              <Layers className="w-3.5 h-3.5" />
              3. GİB İrsaliyeli Resmi (Sevk)
            </button>
          </div>

          {/* Eylem Butonları */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {onOpenActionModal && invoiceDetail && (
              <button
                onClick={() => onOpenActionModal(invoiceDetail)}
                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
              >
                <Ban className="w-3.5 h-3.5" />
                {invoiceDetail.status === 'issued' ? 'İptal Et' : 'Sil'}
              </button>
            )}

            {/* GİB UBL-TR XML Butonları */}
            <button
              onClick={handleOpenXmlPreview}
              className="bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-300 px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all"
              title="GİB UBL-TR 1.2 e-Fatura XML Kodunu Önizle / Doğrula"
            >
              <Code className="w-3.5 h-3.5 text-emerald-400" />
              <span>XML Önizle</span>
            </button>

            <button
              onClick={handleDownloadUblXml}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
              title="GİB UBL-TR 1.2 formatında e-Fatura XML dosyasını indir"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>GİB XML İndir</span>
            </button>

            {/* Tek Tıkla Doğrudan PDF İndir */}
            <button
              onClick={handleDownloadDirectPdf}
              disabled={downloadingPdf}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs active:scale-95"
              title="Tek tıkla kurumsal A4 formatında PDF olarak indir"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingPdf ? 'Hazırlanıyor...' : 'PDF İndir'}</span>
            </button>

            <button
              onClick={() => handlePrint(true)}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs"
              title="Tam ekran A4 sekmesinde açarak tarayıcıdan yazdırma"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-300" />
              <span className="hidden sm:inline">Yeni Sekme</span>
            </button>

            <button
              onClick={() => handlePrint(false)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/30 active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Yazdır</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl flex items-center justify-center transition-colors border border-slate-700 ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* BELGE GÖRÜNTÜLEME ALANI */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200/60 print:p-0 print:bg-white dark:bg-slate-900 print:overflow-visible">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-500 dark:text-slate-400 gap-3">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <div className="text-xs font-bold uppercase tracking-wider">Fatura detayları yükleniyor...</div>
            </div>
          ) : !invoiceDetail ? (
            <div className="text-center py-24 text-slate-400 text-sm">Fatura kaydı bulunamadı.</div>
          ) : (
            <div 
              ref={printContainerRef}
              className="max-w-[210mm] mx-auto bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-xl border border-slate-300 shadow-md print:border-none print:shadow-none print:p-0 text-slate-900 dark:text-slate-100 relative print:m-0"
              style={{ minHeight: '270mm' }}
            >
              
              {/* İptal Edilmiş Fatura Damgası */}
              {invoiceDetail.status === 'cancelled' && (
                <div className="mb-4 bg-rose-50 border-2 border-rose-500 p-3 rounded-xl text-center space-y-0.5 print:border-rose-600">
                  <div className="flex items-center justify-center gap-2 text-rose-800 font-black tracking-widest text-sm uppercase">
                    <Ban className="w-5 h-5 text-rose-600" />
                    BU FATURA İPTAL EDİLMİŞTİR
                  </div>
                  <p className="text-[11px] text-rose-700 font-medium">
                    Bu belge resmi geçerliliğini yitirmiştir. Bakiyeler, sipariş adetleri ve stok hareketleri ters kayıtla iade edilmiştir.
                  </p>
                </div>
              )}

              {/* Seçilen Şablona Göre İçerik Gösterimi */}
              {template === 'official_gib' && (
                <GibOfficialTemplate 
                  invoice={invoiceDetail}
                  taxBreakdown={taxBreakdown}
                  formattedDate={formattedDate}
                  formattedTime={formattedTime}
                  dueDateFormatted={dueDateFormatted}
                  amountInWords={amountInWords}
                  companySettings={companySettings}
                />
              )}

              {template === 'corporate_modern' && (
                <CorporateModernTemplate 
                  invoice={invoiceDetail}
                  taxBreakdown={taxBreakdown}
                  formattedDate={formattedDate}
                  formattedTime={formattedTime}
                  dueDateFormatted={dueDateFormatted}
                  amountInWords={amountInWords}
                  companySettings={companySettings}
                />
              )}

              {template === 'compact_delivery' && (
                <CompactDeliveryTemplate 
                  invoice={invoiceDetail}
                  taxBreakdown={taxBreakdown}
                  formattedDate={formattedDate}
                  formattedTime={formattedTime}
                  dueDateFormatted={dueDateFormatted}
                  amountInWords={amountInWords}
                  companySettings={companySettings}
                />
              )}

            </div>
          )}
        </div>

      </div>

      {/* GİB UBL-TR XML Görüntüleyici ve İndirici Modalı */}
      <UblXmlViewerModal
        isOpen={xmlModalOpen}
        onClose={() => setXmlModalOpen(false)}
        xmlContent={currentXmlContent}
        filename={`${invoiceDetail?.invoiceNumber || 'FATURA'}_UBL_TR12.xml`}
        documentType="invoice"
        documentNumber={invoiceDetail?.invoiceNumber || ''}
      />
    </div>
  );
}
