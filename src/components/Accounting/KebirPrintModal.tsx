import React, { useRef, useState, useEffect } from 'react';
import { Printer, X, ExternalLink, Calendar, BookOpen, Layers } from 'lucide-react';
import { printHtml, openPrintWindow } from '../../lib/printService';
import { settingsService } from '../../services/settingsService';
import type { Account } from '../../types';

interface KebirLine {
  entryId: number;
  entryNumber: string;
  date: Date;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  accountCode: string;
  account?: Account;
  lines: KebirLine[];
}

export default function KebirPrintModal({
  isOpen,
  onClose,
  accountCode,
  account,
  lines
}: Props) {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [isPrinting, setIsPrinting] = useState(false);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const printContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadSettings() {
      if (isOpen) {
        const sysSettings = await settingsService.getSystemSettings();
        if (sysSettings?.company) {
          setCompanySettings(sysSettings.company);
        }
      }
    }
    loadSettings();
  }, [isOpen]);

  if (!isOpen) return null;

  // Calculate totals
  const totalDebit = lines.reduce((acc, l) => acc + (l.debit || 0), 0);
  const totalCredit = lines.reduce((acc, l) => acc + (l.credit || 0), 0);
  const lastBalance = lines.length > 0 ? lines[lines.length - 1].balance : 0;
  const isDebitBalance = lastBalance >= 0;

  const accountName = account?.name || `${accountCode} Hesabı`;
  const accountType = account?.type || 'Aktif / Pasif';
  const currency = account?.currency || 'TRY';

  const getPrintCss = () => `
    @page {
      size: ${orientation === 'landscape' ? 'landscape' : 'portrait'};
      margin: 8mm 6mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      font-size: 10px;
      color: #0f172a;
      background: #ffffff !important;
      margin: 0;
      padding: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: auto;
    }
    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }
    thead {
      display: table-header-group;
    }
    tfoot {
      display: table-footer-group;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 5px 6px;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .font-bold { font-weight: 700; }
  `;

  const handlePrintDirect = async () => {
    if (!printContentRef.current) return;
    setIsPrinting(true);
    try {
      const html = printContentRef.current.innerHTML;
      await printHtml(html, {
        title: `DMR Nexus_Defteri_Kebir_${accountCode}_${new Date().toISOString().slice(0, 10)}`,
        css: getPrintCss(),
        landscape: orientation === 'landscape'
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleOpenNewTab = () => {
    if (!printContentRef.current) return;
    const html = printContentRef.current.innerHTML;
    openPrintWindow(html, `DMR Nexus Defter-i Kebir (${accountCode})`, {
      css: getPrintCss(),
      landscape: orientation === 'landscape'
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[96vh] overflow-hidden my-auto animate-in fade-in zoom-in duration-150">
        
        {/* TOP CONTROL BAR (Hidden on print) */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-500/20 border border-indigo-400/30 rounded-xl flex items-center justify-center text-indigo-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Defter-i Kebir / Muavin Ekstre Baskı Önizleme
                </span>
                <span className="text-[10px] font-mono font-bold bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded border border-indigo-400/20">
                  {accountCode}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Resmi yevmiye ve büyük defter standartlarında hesap ekstresi
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Sayfa Yönü Seçimi */}
            <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  orientation === 'portrait'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Dikey (Standart)
              </button>
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  orientation === 'landscape'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Yatay
              </button>
            </div>

            {/* Yeni Sekmede Aç / Yazdır */}
            <button
              type="button"
              onClick={handleOpenNewTab}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-bold transition-colors border border-slate-700"
              title="Ayrı tarayıcı sekmesinde açarak yazdır veya PDF olarak kaydet"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Yeni Sekmede Aç
            </button>

            {/* Doğrudan Yazdır Butonu */}
            <button
              type="button"
              onClick={handlePrintDirect}
              disabled={isPrinting}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              {isPrinting ? 'Yazdırılıyor...' : 'Yazdır / PDF'}
            </button>

            {/* Kapat Butonu */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ml-1"
              title="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINTABLE CANVAS CONTAINER */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-800/80">
          <div 
            ref={printContentRef}
            className="bg-white dark:bg-slate-900 mx-auto shadow-md border border-slate-300 p-6 sm:p-8 text-slate-900 dark:text-slate-100 rounded-sm"
            style={{ maxWidth: orientation === 'landscape' ? '1040px' : '820px' }}
          >
            {/* 1. KURUMSAL VE RAPOR BAŞLIĞI */}
            <div className="border-b-2 border-slate-900 pb-4 mb-4">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="flex items-center gap-3">
                  {companySettings?.logo ? (
                    <div className="w-12 h-12 rounded bg-white dark:bg-slate-900 border border-slate-300 p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
                      <img src={companySettings.logo} alt={companySettings.companyName} className="max-w-full max-h-full object-contain" />
                    </div>
                  ) : null}
                  <div>
                    <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-widest">
                      T.C. MALİYE MEVZUATINA UYGUN DEFTER-İ KEBİR / MUAVİN DEFTER
                    </div>
                    <h1 className="text-base sm:text-lg font-black text-slate-950 uppercase tracking-tight mt-0.5">
                      {companySettings?.companyTitle || companySettings?.companyName || 'DMR Nexus'}
                    </h1>
                    <p className="text-[11px] text-slate-600 font-medium">
                      {companySettings?.address || 'İkitelli OSB Mah. Aykosan Sanayi Sitesi 4. Ada A Blok No: 12-14 Başakşehir / İSTANBUL'}
                    </p>
                    <p className="text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">Vergi Dairesi:</span> {companySettings?.taxOffice || 'İkitelli V.D.'} &bull; <span className="font-semibold text-slate-800 dark:text-slate-200">VKN:</span> {companySettings?.taxNumber || '7320491820'}
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-700">
                  <span className="inline-block bg-indigo-950 text-white font-black text-xs px-3 py-1 uppercase tracking-wider rounded">
                    DEFTER-İ KEBİR EKSTRESİ
                  </span>
                  <div className="text-[11px] text-slate-600 mt-2 space-y-0.5">
                    <div><strong>Dönem:</strong> 01.01.2026 - 31.12.2026</div>
                    <div><strong>Baskı Tarihi:</strong> {new Date().toLocaleDateString('tr-TR')} {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              </div>

              {/* 2. SEÇİLİ HESAP DETAYLARI KUTUSU */}
              <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-300 rounded grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Hesap Kodu</div>
                  <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{accountCode}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Hesap Adı / Tanımı</div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-0.5">{accountName}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Para Birimi / Tür</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs mt-0.5">{currency} &bull; {accountType.toUpperCase()}</div>
                </div>
              </div>
            </div>

            {/* 3. ÖZET İSTATİSTİKLER */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5 text-xs">
              <div className="border border-slate-300 rounded p-2 bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Hareket Sayısı</div>
                <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {lines.length} işlem
                </div>
              </div>
              <div className="border border-slate-300 rounded p-2 bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Toplam Borç Tutarı</div>
                <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  ₺{totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="border border-slate-300 rounded p-2 bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Toplam Alacak Tutarı</div>
                <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  ₺{totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className={`border rounded p-2 ${
                isDebitBalance ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900' : 'bg-rose-50/70 border-rose-300 text-rose-900'
              }`}>
                <div className="text-[10px] uppercase font-bold">
                  {isDebitBalance ? 'Kapanış Borç Bakiyesi' : 'Kapanış Alacak Bakiyesi'}
                </div>
                <div className="text-sm font-mono font-bold mt-0.5">
                  ₺{Math.abs(lastBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {isDebitBalance ? '(B)' : '(A)'}
                </div>
              </div>
            </div>

            {/* 4. DEFTER-İ KEBİR HAREKET TABLOSU */}
            <div className="border border-slate-300 rounded overflow-hidden">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider">
                    <th className="py-2 px-2 text-center border border-slate-800 w-10">Sıra</th>
                    <th className="py-2 px-2.5 text-left border border-slate-800 w-24">Tarih</th>
                    <th className="py-2 px-2.5 text-left border border-slate-800 w-28">Yevmiye No</th>
                    <th className="py-2 px-2.5 text-left border border-slate-800">Muamele / Açıklama</th>
                    <th className="py-2 px-2.5 text-right border border-slate-800 w-28">Borç (₺)</th>
                    <th className="py-2 px-2.5 text-right border border-slate-800 w-28">Alacak (₺)</th>
                    <th className="py-2 px-2.5 text-right border border-slate-800 w-32">Kümülatif Bakiye (₺)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                        Bu hesap için henüz yevmiye hareketi bulunmuyor.
                      </td>
                    </tr>
                  ) : (
                    lines.map((row, idx) => (
                      <tr key={`print-kebir-${row.entryId}-${idx}`} className="hover:bg-slate-50 dark:bg-slate-800/50">
                        <td className="py-1.5 px-2 text-center font-mono text-slate-500 dark:text-slate-400 border border-slate-300 text-[10px]">
                          {idx + 1}
                        </td>
                        <td className="py-1.5 px-2.5 border border-slate-300 whitespace-nowrap text-slate-700 dark:text-slate-200">
                          {new Date(row.date).toLocaleDateString('tr-TR')}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-slate-900 dark:text-slate-100 border border-slate-300 whitespace-nowrap">
                          {row.entryNumber}
                        </td>
                        <td className="py-1.5 px-2.5 border border-slate-300 text-slate-800 dark:text-slate-200">
                          {row.description || '-'}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono border border-slate-300 whitespace-nowrap">
                          {row.debit > 0 ? row.debit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-mono border border-slate-300 whitespace-nowrap">
                          {row.credit > 0 ? row.credit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className={`py-1.5 px-2.5 text-right font-mono border border-slate-300 whitespace-nowrap font-bold ${
                          row.balance >= 0 ? 'text-emerald-800' : 'text-rose-800'
                        }`}>
                          ₺{Math.abs(row.balance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {row.balance >= 0 ? '(B)' : '(A)'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-950">
                  <tr>
                    <td colSpan={4} className="py-2.5 px-3 text-right uppercase tracking-wider border border-slate-800">
                      GENEL HESAP TOPLAMI VE KAPANIŞ BAKİYESİ:
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono border border-slate-800 whitespace-nowrap">
                      ₺{totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono border border-slate-800 whitespace-nowrap">
                      ₺{totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono border border-slate-800 whitespace-nowrap text-emerald-300">
                      ₺{Math.abs(lastBalance).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {isDebitBalance ? '(B)' : '(A)'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* 5. İMZA VE ONAY ALANLARI */}
            <div className="mt-8 pt-4 border-t-2 border-slate-300 grid grid-cols-2 gap-8 text-center text-xs">
              <div className="p-3 border border-slate-300 rounded bg-slate-50 dark:bg-slate-800/50">
                <div className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">DÜZENLEYEN</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Muhasebe ve Finans Sorumlusu</div>
                <div className="h-14 mt-2 border-b border-dashed border-slate-400"></div>
                <div className="text-[10px] text-slate-400 mt-1">İmza / Kaşe</div>
              </div>

              <div className="p-3 border border-slate-300 rounded bg-slate-50 dark:bg-slate-800/50">
                <div className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">İNCELEYEN VE ONAYLAYAN</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Mali Müşavir / Şirket Müdürü</div>
                <div className="h-14 mt-2 border-b border-dashed border-slate-400"></div>
                <div className="text-[10px] text-slate-400 mt-1">İmza / Kaşe</div>
              </div>
            </div>

            {/* 6. DİPNOT */}
            <div className="mt-4 text-[9px] text-slate-500 dark:text-slate-400 flex justify-between items-center border-t border-slate-200 dark:border-slate-700 pt-2">
              <span>DMR Nexus Büyük Defter (Defter-i Kebir) Sistemi &bull; Belge No: DK-{accountCode}</span>
              <span>213 Sayılı V.U.K. ve TTK Hükümlerine Uygundur</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
