import React, { useRef, useState, useEffect } from 'react';
import { Printer, X, ExternalLink } from 'lucide-react';
import { printHtml, openPrintWindow } from '../../lib/printService';
import { settingsService } from '../../services/settingsService';
import type { JournalEntry } from '../../types';

interface Props {
  entry: JournalEntry | null;
  onClose: () => void;
}

export default function JournalEntryPrintModal({ entry, onClose }: Props) {
  const [isPrinting, setIsPrinting] = useState(false);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const printContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadSettings() {
      const sysSettings = await settingsService.getSystemSettings();
      if (sysSettings?.company) {
        setCompanySettings(sysSettings.company);
      }
    }
    loadSettings();
  }, []);

  if (!entry) return null;

  const getPrintCss = () => `
    @page {
      size: portrait;
      margin: 10mm 8mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 11px;
      color: #111827;
      background: #ffffff !important;
      margin: 0;
      padding: 0;
    }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #111827; padding: 6px 8px; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, monospace; }
  `;

  const handlePrintDirect = async () => {
    if (!printContentRef.current || !entry) return;
    setIsPrinting(true);
    try {
      const html = printContentRef.current.innerHTML;
      await printHtml(html, {
        title: `Yevmiye_Fisi_${entry.entryNumber}`,
        css: getPrintCss(),
        landscape: false
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleOpenNewTab = () => {
    if (!printContentRef.current || !entry) return;
    const html = printContentRef.current.innerHTML;
    openPrintWindow(html, `Yevmiye Fişi: ${entry.entryNumber}`, {
      css: getPrintCss(),
      landscape: false
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-3xl w-full p-6 sm:p-8 space-y-6 my-8 max-h-[90vh] flex flex-col print:p-0 print:m-0 print:shadow-none">
        {/* Top Control Bar (Hidden on print) */}
        <div className="flex items-center justify-between border-b pb-4 print:hidden shrink-0">
          <div>
            <span className="text-sm font-bold text-gray-900">Resmi Yevmiye Fişi Çıktısı</span>
            <span className="ml-2 text-xs font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded border border-gray-300">
              {entry.entryNumber}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenNewTab}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold border border-gray-300 transition-colors"
              title="Ayrı sekmede açarak yazdır veya PDF olarak kaydet"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Yeni Sekmede Aç
            </button>
            <button
              type="button"
              onClick={handlePrintDirect}
              disabled={isPrinting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              {isPrinting ? 'Yazdırılıyor...' : 'Yazdır / PDF Kaydet'}
            </button>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 ml-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Canvas */}
        <div ref={printContentRef} className="border-2 border-gray-900 p-6 space-y-5 rounded bg-white dark:bg-slate-900 flex-1 min-h-0 overflow-y-auto">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-gray-900 pb-3 gap-4">
            <div className="flex items-center gap-3">
              {companySettings?.logo ? (
                <div className="w-10 h-10 rounded bg-white dark:bg-slate-900 border border-gray-300 p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
                  <img src={companySettings.logo} alt={companySettings.companyName} className="max-w-full max-h-full object-contain" />
                </div>
              ) : null}
              <div>
                <h1 className="text-lg font-black text-gray-900 uppercase">
                  {companySettings?.companyTitle || companySettings?.companyName || 'DMR Nexus'}
                </h1>
                <p className="text-xs text-gray-600 mt-0.5">{companySettings?.address || 'İkitelli OSB Aykosan Sanayi Sitesi Başakşehir / İstanbul'}</p>
                <p className="text-xs text-gray-600">Vergi Dairesi: {companySettings?.taxOffice || 'İkitelli V.D.'} - {companySettings?.taxNumber || '7320491820'}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block border-2 border-gray-900 px-3 py-0.5 text-sm font-black uppercase tracking-wider">
                {entry.entryType.toUpperCase()} FİŞİ
              </span>
              <p className="text-xs font-mono font-bold mt-1.5">Fiş No: {entry.entryNumber}</p>
              <p className="text-xs text-gray-600">Tarih: {new Date(entry.date).toLocaleDateString('tr-TR')}</p>
            </div>
          </div>

          {/* Description & Document */}
          <div className="grid grid-cols-2 gap-4 text-xs bg-gray-50 p-2.5 rounded border border-gray-200">
            <div>
              <span className="font-bold text-gray-700">Fiş Açıklaması: </span>
              <span className="text-gray-900 font-medium">{entry.description}</span>
            </div>
            {entry.documentNumber && (
              <div className="text-right">
                <span className="font-bold text-gray-700">Belge No: </span>
                <span className="font-mono text-gray-900 font-bold">{entry.documentNumber}</span>
              </div>
            )}
          </div>

          {/* Table of Accounting Lines */}
          <table className="min-w-full border border-gray-900 text-xs">
            <thead className="bg-gray-100 border-b border-gray-900 font-bold text-gray-800">
              <tr>
                <th className="py-2 px-3 text-left border-r border-gray-400 w-24">Hesap Kodu</th>
                <th className="py-2 px-3 text-left border-r border-gray-400">Hesap Adı</th>
                <th className="py-2 px-3 text-left border-r border-gray-400">Açıklama</th>
                <th className="py-2 px-3 text-right border-r border-gray-400 w-28">Borç (₺)</th>
                <th className="py-2 px-3 text-right w-28">Alacak (₺)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-gray-800">
              {entry.lines.map((l, i) => (
                <tr key={`print-line-${l.id || i}-${l.accountCode}`}>
                  <td className="py-2 px-3 font-mono font-bold border-r border-gray-300">{l.accountCode}</td>
                  <td className="py-2 px-3 font-medium border-r border-gray-300">{l.accountName}</td>
                  <td className="py-2 px-3 border-r border-gray-300">{l.description || '-'}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold border-r border-gray-300">
                    {l.debit > 0 ? l.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold">
                    {l.credit > 0 ? l.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-100 border-t-2 border-gray-900 font-bold text-gray-900">
              <tr>
                <td colSpan={3} className="py-2.5 px-3 text-right border-r border-gray-400 uppercase">
                  TOPLAM (DENK FİŞ):
                </td>
                <td className="py-2.5 px-3 text-right font-mono border-r border-gray-400 text-sm">
                  ₺{entry.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-sm">
                  ₺{entry.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-6 pt-8 border-t border-gray-400 text-center text-xs">
            <div>
              <p className="font-bold text-gray-800">Düzenleyen</p>
              <div className="h-14 mt-1 border-b border-dashed border-gray-400"></div>
              <p className="text-gray-500 mt-1">Muhasebe Sorumlusu</p>
            </div>
            <div>
              <p className="font-bold text-gray-800">Kontrol Eden</p>
              <div className="h-14 mt-1 border-b border-dashed border-gray-400"></div>
              <p className="text-gray-500 mt-1">Mali İşler Müdürü</p>
            </div>
            <div>
              <p className="font-bold text-gray-800">Onaylayan</p>
              <div className="h-14 mt-1 border-b border-dashed border-gray-400"></div>
              <p className="text-gray-500 mt-1">Mali Müşavir / Genel Müdür</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
