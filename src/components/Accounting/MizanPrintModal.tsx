import React, { useRef, useState, useEffect } from 'react';
import { Printer, X, ExternalLink, CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react';
import { printHtml, openPrintWindow } from '../../lib/printService';
import { settingsService } from '../../services/settingsService';
import type { MizanRow } from '../../services/accountingService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  mizanRows: MizanRow[];
  options?: {
    onlyWithBalance?: boolean;
    levelFilter?: string;
  };
}

export default function MizanPrintModal({ isOpen, onClose, mizanRows, options }: Props) {
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
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

  // Üst seviye satırlar (sınıf/grup/ana) alt hesapların toplamlarını zaten içerir;
  // genel toplam ve denklik yalnızca en alt kırılım (yaprak) satırlardan hesaplanır.
  const leafRows = mizanRows.filter(
    r => !mizanRows.some(o => o !== r && o.code.startsWith(r.code + '.'))
  );

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const totalDebit = round2(leafRows.reduce((acc, r) => acc + (r.totalDebit || 0), 0));
  const totalCredit = round2(leafRows.reduce((acc, r) => acc + (r.totalCredit || 0), 0));
  const totalDebitBalance = round2(leafRows.reduce((acc, r) => acc + (r.debitBalance || 0), 0));
  const totalCreditBalance = round2(leafRows.reduce((acc, r) => acc + (r.creditBalance || 0), 0));

  const debitCreditDiff = Math.abs(totalDebit - totalCredit);
  const balanceDiff = Math.abs(totalDebitBalance - totalCreditBalance);
  const isDenk = debitCreditDiff < 0.01 && balanceDiff < 0.01;

  const levelLabels: Record<string, string> = {
    all: 'Tüm Hesap Seviyeleri (Sınıf, Grup, Ana, Muavin)',
    class: 'Sadece Hesap Sınıfları (1, 2, 3...)',
    group: 'Grup Düzeyinde (10, 12, 15...)',
    main: 'Ana Kebir Hesapları (100, 120, 320...)',
    sub: 'Alt / Muavin Hesaplar (100.01, 120.01...)'
  };

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
      padding: 4px 6px;
    }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .font-bold { font-weight: 700; }
    .bg-class { background-color: #0f172a !important; color: #ffffff !important; font-weight: 800; }
    .bg-group { background-color: #f1f5f9 !important; color: #0f172a !important; font-weight: 700; }
    .bg-main { background-color: #ffffff !important; color: #0f172a !important; font-weight: 600; }
    .bg-sub { background-color: #ffffff !important; color: #334155 !important; }
  `;

  const handlePrintDirect = async () => {
    if (!printContentRef.current) return;
    setIsPrinting(true);
    try {
      const html = printContentRef.current.innerHTML;
      await printHtml(html, {
        title: `DMR Nexus_Mizan_Raporu_${new Date().toISOString().slice(0, 10)}`,
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
    openPrintWindow(html, `DMR Nexus Mizan Raporu`, {
      css: getPrintCss(),
      landscape: orientation === 'landscape'
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-6xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[96vh] overflow-hidden my-auto animate-in fade-in zoom-in duration-150">
        
        {/* TOP CONTROL BAR (Hidden on print) */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500/20 border border-emerald-400/30 rounded-xl flex items-center justify-center text-emerald-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white">
                  Resmi Mizan Raporu Baskı Önizleme
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                  isDenk 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' 
                    : 'bg-rose-500/20 text-rose-300 border-rose-400/30'
                }`}>
                  {isDenk ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  {isDenk ? 'Mizan Denk (Fark Yok)' : 'Mizan Denk Değil!'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Tek Düzen Hesap Planı resmi formatında A4 çıktı
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Sayfa Yönü Seçimi */}
            <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  orientation === 'landscape'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Yatay (Önerilen)
              </button>
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  orientation === 'portrait'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Dikey
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
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50"
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
            style={{ maxWidth: orientation === 'landscape' ? '1080px' : '820px' }}
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
                      T.C. MALİYE MEVZUATINA VE V.U.K.'A UYGUN RESMİ BELGE
                    </div>
                    <h1 className="text-base sm:text-lg font-black text-slate-950 uppercase tracking-tight mt-0.5">
                      {companySettings?.companyTitle || companySettings?.companyName || 'DMR Nexus'}
                    </h1>
                    <p className="text-[11px] text-slate-600 font-medium">
                      {companySettings?.address || 'İkitelli OSB Mah. Aykosan Sanayi Sitesi 4. Ada A Blok No: 12-14 Başakşehir / İSTANBUL'}
                    </p>
                    <p className="text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">Vergi Dairesi:</span> {companySettings?.taxOffice || 'İkitelli V.D.'} &bull; <span className="font-semibold text-slate-800 dark:text-slate-200">VKN:</span> {companySettings?.taxNumber || '7320491820'} &bull; <span className="font-semibold text-slate-800 dark:text-slate-200">Ticaret Sicil No:</span> {companySettings?.tradeRegistryNo || '948210'}
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-700">
                  <span className="inline-block bg-slate-900 text-white font-black text-xs px-3 py-1 uppercase tracking-wider rounded">
                    GENEL MİZAN CETVELİ
                  </span>
                  <div className="text-[11px] text-slate-600 mt-2 space-y-0.5">
                    <div><strong>Rapor Tarihi:</strong> {new Date().toLocaleDateString('tr-TR')}</div>
                    <div><strong>Yazdırma Saati:</strong> {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
                    <div><strong>Hesap Sayısı:</strong> {mizanRows.length} adet</div>
                  </div>
                </div>
              </div>

              {/* Rapor Filtre ve Kapsam Bilgisi */}
              <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between text-[11px] text-slate-600 gap-2 bg-slate-50 dark:bg-slate-800/50 p-2 rounded">
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200">Rapor Kapsamı:</span> {options?.onlyWithBalance ? 'Yalnızca Bakiyesi Bulunan Hesaplar' : 'Tüm Hesaplar (Bakiyeli ve Bakiyesiz)'}
                </div>
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200">Filtre Seviyesi:</span> {levelLabels[options?.levelFilter || 'all'] || 'Tümü'}
                </div>
              </div>
            </div>

            {/* 2. ÖZET İSTATİSTİK ŞERİDİ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5 text-xs">
              <div className="border border-slate-300 rounded p-2 bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Toplam Borç Hareketi</div>
                <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  ₺{totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="border border-slate-300 rounded p-2 bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Toplam Alacak Hareketi</div>
                <div className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  ₺{totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="border border-slate-300 rounded p-2 bg-emerald-50/60 border-emerald-200">
                <div className="text-[10px] uppercase font-bold text-emerald-800">Borç Bakiye Toplamı</div>
                <div className="text-sm font-mono font-bold text-emerald-900 mt-0.5">
                  ₺{totalDebitBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="border border-slate-300 rounded p-2 bg-indigo-50/60 border-indigo-200">
                <div className="text-[10px] uppercase font-bold text-indigo-800">Alacak Bakiye Toplamı</div>
                <div className="text-sm font-mono font-bold text-indigo-900 mt-0.5">
                  ₺{totalCreditBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* 3. MİZAN TABLOSU */}
            <div className="border border-slate-300 rounded overflow-hidden">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider">
                    <th className="py-2 px-2.5 text-left border border-slate-800 w-28">Hesap Kodu</th>
                    <th className="py-2 px-2.5 text-left border border-slate-800">Hesap Adı (TDHP Açıklaması)</th>
                    <th className="py-2 px-2.5 text-right border border-slate-800 w-28">Borç Tutarı (₺)</th>
                    <th className="py-2 px-2.5 text-right border border-slate-800 w-28">Alacak Tutarı (₺)</th>
                    <th className="py-2 px-2.5 text-right border border-slate-800 w-28">Borç Bakiyesi (₺)</th>
                    <th className="py-2 px-2.5 text-right border border-slate-800 w-28">Alacak Bakiyesi (₺)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {mizanRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                        Kriterlere uygun mizan kaydı bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    mizanRows.map((r, i) => {
                      const isClass = r.level === 1;
                      const isGroup = r.level === 2;
                      const isMain = r.level === 3;
                      const isSub = r.level === 4;
                      const isMuavin = r.level >= 5;

                      let rowClass = "hover:bg-slate-50 dark:bg-slate-800/50";
                      let codePadding = "";
                      let namePadding = "";

                      if (isClass) {
                        rowClass = "bg-slate-800 text-white font-black";
                      } else if (isGroup) {
                        rowClass = "bg-slate-100 dark:bg-slate-800 font-bold text-slate-950";
                        codePadding = "pl-2";
                        namePadding = "pl-2";
                      } else if (isMain) {
                        rowClass = "bg-white dark:bg-slate-900 font-bold text-slate-900 dark:text-slate-100";
                        codePadding = "pl-3";
                        namePadding = "pl-4";
                      } else if (isSub) {
                        rowClass = "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200";
                        codePadding = "pl-4";
                        namePadding = "pl-6";
                      } else if (isMuavin) {
                        rowClass = "bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200";
                        codePadding = "pl-6";
                        namePadding = "pl-8";
                      }

                      return (
                        <tr key={`print-mizan-${r.code}-${i}`} className={rowClass}>
                          <td className={`py-1.5 px-2.5 font-mono border border-slate-300 ${codePadding}`}>
                            {r.code}
                          </td>
                          <td className={`py-1.5 px-2.5 border border-slate-300 ${namePadding}`}>
                            {r.name}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono border border-slate-300 whitespace-nowrap">
                            {r.totalDebit > 0 ? r.totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono border border-slate-300 whitespace-nowrap">
                            {r.totalCredit > 0 ? r.totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono border border-slate-300 whitespace-nowrap font-bold text-emerald-800">
                            {r.debitBalance > 0 ? r.debitBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono border border-slate-300 whitespace-nowrap font-bold text-indigo-800">
                            {r.creditBalance > 0 ? r.creditBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-950">
                  <tr>
                    <td colSpan={2} className="py-2.5 px-3 text-right uppercase tracking-wider border border-slate-800">
                      GENEL TOPLAM (MİZAN DENKLİĞİ):
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono border border-slate-800 whitespace-nowrap">
                      ₺{totalDebit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono border border-slate-800 whitespace-nowrap">
                      ₺{totalCredit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono border border-slate-800 whitespace-nowrap text-emerald-300">
                      ₺{totalDebitBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono border border-slate-800 whitespace-nowrap text-indigo-300">
                      ₺{totalCreditBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* 4. İMZA VE ONAY ALANLARI */}
            <div className="mt-8 pt-4 border-t-2 border-slate-300 grid grid-cols-3 gap-6 text-center text-xs">
              <div className="p-3 border border-slate-300 rounded bg-slate-50 dark:bg-slate-800/50">
                <div className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">DÜZENLEYEN</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Muhasebe Yetkilisi</div>
                <div className="h-14 mt-2 border-b border-dashed border-slate-400"></div>
                <div className="text-[10px] text-slate-400 mt-1">İmza / Kaşe</div>
              </div>

              <div className="p-3 border border-slate-300 rounded bg-slate-50 dark:bg-slate-800/50">
                <div className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">KONTROL EDEN</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Mali Müşavir / SMMM</div>
                <div className="h-14 mt-2 border-b border-dashed border-slate-400"></div>
                <div className="text-[10px] text-slate-400 mt-1">İmza / Kaşe</div>
              </div>

              <div className="p-3 border border-slate-300 rounded bg-slate-50 dark:bg-slate-800/50">
                <div className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">ONAYLAYAN</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Şirket Müdürü / Yönetim</div>
                <div className="h-14 mt-2 border-b border-dashed border-slate-400"></div>
                <div className="text-[10px] text-slate-400 mt-1">İmza / Kaşe</div>
              </div>
            </div>

            {/* 5. DİPNOT */}
            <div className="mt-4 text-[9px] text-slate-500 dark:text-slate-400 flex justify-between items-center border-t border-slate-200 dark:border-slate-700 pt-2">
              <span>DMR Nexus Entegre Muhasebe ve Üretim Sistemi &bull; Tek Düzen Hesap Planı Resmi Mizan Çıktısı</span>
              <span>213 Sayılı V.U.K. Standartlarına Uygundur</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
