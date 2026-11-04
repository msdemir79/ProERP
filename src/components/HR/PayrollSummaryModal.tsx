import React, { useState, useEffect, useRef } from 'react';
import { settingsService } from '../../services/settingsService';
import { hrService } from '../../services/hrService';
import { X, Printer, Download, Landmark, Banknote, ShieldCheck, Receipt } from 'lucide-react';
import type { Employee, PayrollRecord, HRModuleSettings } from '../../types';
import type { PayrollPaymentSummary } from '../../lib/payrollSummary';
import { downloadElementAsPdf } from '../../lib/pdfService';
import { showToast } from '../../lib/feedback';

interface PayrollSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  month: number;
  year: number;
  payrolls: PayrollRecord[];
  employees: Employee[];
  summary: PayrollPaymentSummary;
}

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

function fmt(n: number | undefined | null): string {
  return Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtRate(n: number): string {
  return String(n).replace('.', ',');
}

const sectionLabel = 'text-[10px] font-black tracking-wider text-slate-600 mb-1';
const cellBase = 'border border-slate-300 px-2.5 py-1.5 align-top';

export default function PayrollSummaryModal({
  isOpen,
  onClose,
  month,
  year,
  payrolls,
  employees,
  summary
}: PayrollSummaryModalProps) {
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [hrParams, setHrParams] = useState<HRModuleSettings | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const reportContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadSettings() {
      if (isOpen) {
        const sysSettings = await settingsService.getSystemSettings();
        if (sysSettings?.company) {
          setCompanySettings(sysSettings.company);
        }
        setHrParams(await hrService.getHRParameters());
      }
    }
    loadSettings();
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const compName = companySettings?.companyName || 'DMR Nexus';
  const compTitle = companySettings?.companyTitle || companySettings?.companyName || 'DMR Nexus';
  const compLogo = companySettings?.logo;
  const compAddress = companySettings?.address || 'İkitelli OSB Aykosan Sanayi Sitesi 4. Ada B Blok No:12 Başakşehir / İstanbul';
  const compTaxOffice = companySettings?.taxOffice || 'İkitelli V.D.';
  const compTaxNumber = companySettings?.taxNumber || '7320491820';

  const sgkEmployeeRate = hrParams?.sgkEmployeeRate ?? 14;
  const unemploymentEmployeeRate = hrParams?.unemploymentEmployeeRate ?? 1;
  const sgkEmployerRate = hrParams?.sgkEmployerRate ?? 15.5;
  const unemploymentEmployerRate = hrParams?.unemploymentEmployerRate ?? 2;
  const incomeTaxRate = hrParams?.incomeTaxRate ?? 15;
  const stampTaxPerMille = hrParams?.stampTaxPerMille ?? 7.59;

  const sortedPayrolls = [...payrolls].sort((a, b) => a.employeeName.localeCompare(b.employeeName, 'tr'));
  const listedAdvanceTotal = sortedPayrolls.reduce((sum, p) => sum + (p.advanceDeduction || 0), 0);
  const listedNetTotal = sortedPayrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0);

  const handleDownloadPdf = async () => {
    if (!reportContainerRef.current) return;
    setDownloadingPdf(true);
    try {
      const filename = `Bordro_Odeme_Ozeti_${year}_${String(month).padStart(2, '0')}.pdf`;
      await downloadElementAsPdf(reportContainerRef.current, {
        filename,
        format: 'a4',
        orientation: 'portrait',
        marginMm: 8
      });
    } catch (err) {
      console.error('PDF indirme hatası:', err);
      showToast('PDF oluşturulamadı.', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const summaryRow = (label: string, value: number, strong = false) => (
    <div className={`flex justify-between ${strong ? 'font-black text-slate-900' : 'text-slate-600'}`}>
      <span>{label}</span>
      <span className="font-mono">₺{fmt(value)}</span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-2 sm:p-4 md:p-6 flex justify-center items-center print:p-0 print:bg-white print:static print:overflow-visible"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[96vh] overflow-hidden border border-slate-200 print:border-none print:shadow-none print:max-h-none print:my-0 flex flex-col">

        {/* Üst araç çubuğu (yazdırmada gizli) */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-200 print:hidden">
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-slate-800 truncate">Bordro Ödeme Özet Raporu</h3>
            <p className="text-[11px] text-slate-500 truncate">
              {MONTH_NAMES[month - 1]} {year} · {payrolls.length} personel · Banka/Nakit dağılımı ve SGK prim dökümü
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingPdf ? 'Hazırlanıyor...' : 'PDF İndir'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md text-xs font-semibold transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Yazdır</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
              title="Kapat (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Rapor gövdesi */}
        <div
          ref={reportContainerRef}
          id="printable-payroll-summary"
          className="bg-white text-slate-900 overflow-y-auto flex-1 p-5 sm:p-7 space-y-4 text-xs print:overflow-visible print:p-2 print:space-y-3"
        >

          {/* 1. Kurumsal başlık */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 border-b-2 border-slate-900 pb-3">
            <div className="flex items-start gap-3">
              {compLogo ? (
                <img src={compLogo} alt={compName} className="w-12 h-12 object-contain shrink-0" />
              ) : null}
              <div>
                <p className="font-black uppercase tracking-wide text-[13px]">{compTitle}</p>
                <p className="text-[11px] text-slate-600 mt-0.5">{compAddress}</p>
                <p className="text-[11px] text-slate-600">
                  Vergi Dairesi: {compTaxOffice} · VKN: {compTaxNumber} · SGK İşyeri Sicil: 2.1029384.034.34.45
                </p>
              </div>
            </div>
            <div className="sm:text-right shrink-0">
              <p className="font-black uppercase tracking-[0.18em] text-sm">Bordro Ödeme Özet Raporu</p>
              <p className="text-[11px] mt-1">
                Dönem: <b>{MONTH_NAMES[month - 1]} {year}</b>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Banka / Nakit ödeme dağılımı ve SGK prim dökümü
              </p>
            </div>
          </div>

          {/* 2. Genel özet */}
          <div>
            <p className={sectionLabel}>GENEL ÖZET</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="border border-slate-300 px-3 py-2">
                <p className="text-[10px] text-slate-500">Personele Ödenecek Net</p>
                <p className="font-mono font-black text-[13px]">₺{fmt(summary.totalNet)}</p>
                <p className="text-[10px] text-slate-500">{payrolls.length} personel</p>
              </div>
              <div className="border border-slate-300 px-3 py-2">
                <p className="text-[10px] text-slate-500">SGK'ya Ödenecek Prim</p>
                <p className="font-mono font-black text-[13px]">₺{fmt(summary.totalSgkPremium)}</p>
                <p className="text-[10px] text-slate-500">{summary.sgkLiCount} sigortalı personel</p>
              </div>
              <div className="border border-slate-300 px-3 py-2">
                <p className="text-[10px] text-slate-500">Vergi Dairesine Ödenecek</p>
                <p className="font-mono font-black text-[13px]">₺{fmt(summary.totalTaxes)}</p>
                <p className="text-[10px] text-slate-500">Gelir + damga vergisi</p>
              </div>
              <div className="border border-slate-300 px-3 py-2 bg-slate-50">
                <p className="text-[10px] text-slate-500">Toplam İşveren Maliyeti</p>
                <p className="font-mono font-black text-[13px]">₺{fmt(summary.totalEmployerCost)}</p>
                <p className="text-[10px] text-slate-500">Tüm yasal yükler dahil</p>
              </div>
            </div>
          </div>

          {/* 3. Ödeme kanalı & SGK/vergi dökümü */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border border-slate-300 p-3">
              <p className="text-[10px] font-black tracking-wider text-slate-600 mb-2">ÖDEME KANALI DAĞILIMI</p>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <Landmark className="w-3.5 h-3.5 text-emerald-700" />
                    Bankaya Ödenecek
                  </span>
                  <span className="font-mono font-bold">₺{fmt(summary.bank.netTotal)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Havale / EFT yapılacak personel</span>
                  <span>{summary.bank.count} kişi</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-slate-200">
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <Banknote className="w-3.5 h-3.5 text-amber-700" />
                    Nakit Ödenecek (Kasa)
                  </span>
                  <span className="font-mono font-bold">₺{fmt(summary.cash.netTotal)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Elden / kasadan ödenecek personel</span>
                  <span>{summary.cash.count} kişi</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t-2 border-slate-900 font-black text-[12px]">
                  <span>TOPLAM ÖDENECEK NET</span>
                  <span className="font-mono">₺{fmt(summary.totalNet)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 pt-1">
                  <span>Mahsup edilen avans (netten düşülmüş)</span>
                  <span className="font-mono">₺{fmt(summary.advanceTotal)}</span>
                </div>
              </div>
            </div>

            <div className="border border-slate-300 p-3">
              <p className="text-[10px] font-black tracking-wider text-slate-600 mb-2">SGK'YA ÖDENECEK PRİMLER</p>
              <div className="space-y-1.5">
                {summaryRow(`SGK İşçi Primi (%${fmtRate(sgkEmployeeRate)})`, summary.sgkEmployeeShare)}
                {summaryRow(`İşsizlik İşçi Primi (%${fmtRate(unemploymentEmployeeRate)})`, summary.unemploymentEmployeeShare)}
                {summaryRow(`SGK İşveren Primi (%${fmtRate(sgkEmployerRate)})`, summary.sgkEmployerShare)}
                {summaryRow(`İşsizlik İşveren Primi (%${fmtRate(unemploymentEmployerRate)})`, summary.unemploymentEmployerShare)}
                <div className="flex justify-between items-center pt-1.5 border-t-2 border-slate-900 font-black text-[12px]">
                  <span>TOPLAM SGK PRİMİ</span>
                  <span className="font-mono">₺{fmt(summary.totalSgkPremium)}</span>
                </div>
                <p className="text-[10px] text-slate-500 pt-1">
                  Aylık prim ve hizmet belgesi (APHB) tahakkuk tutarı esas alınır.
                </p>
              </div>
            </div>

            <div className="border border-slate-300 p-3">
              <p className="text-[10px] font-black tracking-wider text-slate-600 mb-2">VERGİ DAİRESİNE ÖDENECEK</p>
              <div className="space-y-1.5">
                {summaryRow(`Gelir Vergisi (Stopaj %${fmtRate(incomeTaxRate)})`, summary.incomeTax)}
                {summaryRow(`Damga Vergisi (binde ${fmtRate(stampTaxPerMille)})`, summary.stampTax)}
                <div className="flex justify-between items-center pt-1.5 border-t-2 border-slate-900 font-black text-[12px]">
                  <span>TOPLAM VERGİ</span>
                  <span className="font-mono">₺{fmt(summary.totalTaxes)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-600 pt-2 border-t border-slate-200">
                  <span>Toplam Brüt Kazanç</span>
                  <span className="font-mono">₺{fmt(summary.totalGrossPay)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>Toplam İşveren Maliyeti</span>
                  <span className="font-mono font-bold">₺{fmt(summary.totalEmployerCost)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Personel bazlı ödeme listesi */}
          <div>
            <p className={sectionLabel}>PERSONEL BAZLI ÖDEME LİSTESİ</p>
            <table className="w-full border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-[10px] font-bold tracking-wide">
                  <th className="border border-slate-300 px-2 py-1.5 text-left w-[8%]">Sicil</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left w-[20%]">Adı Soyadı</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-center w-[10%]">SGK</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-left">Ödeme Kanalı</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-center w-[7%]">Gün</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right w-[12%]">Avans</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-right w-[13%]">Net Ödenecek</th>
                </tr>
              </thead>
              <tbody>
                {sortedPayrolls.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="border border-slate-300 px-2 py-3 text-center text-slate-400">
                      Bu dönem için bordro kaydı bulunamadı.
                    </td>
                  </tr>
                ) : (
                  sortedPayrolls.map((rec) => {
                    const emp = employees.find(e => e.id === rec.employeeId);
                    const isBank = emp?.paymentMethod === 'bank';
                    return (
                      <tr key={rec.id} className="text-[11px]">
                        <td className={`${cellBase} font-mono`}>{rec.employeeCode}</td>
                        <td className={`${cellBase} font-semibold`}>{rec.employeeName}</td>
                        <td className={`${cellBase} text-center`}>
                          {rec.sgkStatus === 'sgk_li' ? "SGK'lı" : "SGK'sız"}
                        </td>
                        <td className={cellBase}>
                          {isBank ? (
                            <>
                              <span className="font-semibold">Banka — {emp?.bankName || 'Banka'}</span>
                              {emp?.iban ? <span className="block text-[9px] text-slate-500 font-mono break-all">{emp.iban}</span> : null}
                            </>
                          ) : (
                            <span className="font-semibold">Nakit (Kasa)</span>
                          )}
                        </td>
                        <td className={`${cellBase} text-center font-mono`}>{rec.daysWorked}</td>
                        <td className={`${cellBase} text-right font-mono ${rec.advanceDeduction > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                          {rec.advanceDeduction > 0 ? `−${fmt(rec.advanceDeduction)}` : '—'}
                        </td>
                        <td className={`${cellBase} text-right font-mono font-bold`}>{fmt(rec.netSalary)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {sortedPayrolls.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-black text-[11px]">
                    <td colSpan={5} className="border border-slate-300 px-2 py-1.5 text-right">
                      TOPLAM ({sortedPayrolls.length} personel)
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-mono">
                      −{fmt(listedAdvanceTotal)}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 text-right font-mono">
                      {fmt(listedNetTotal)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* 5. Not ve imzalar */}
          <div className="pt-3 border-t border-slate-300">
            <p className="text-[10px] text-slate-600 leading-relaxed italic">
              <b>Not:</b> Bu rapor, puantaj ve bordro hesaplamaları tamamlanan dönem için ödeme icmalidir. Bankaya ödenecek
              tutarlar personel IBAN'larına havale/EFT ile, nakit ödenecek tutarlar şirket kasasından ödenir. SGK prim ve
              vergi tutarları ilgili kurumlara beyan/tahakkuk üzerinden ödenir.
            </p>
            <div className="grid grid-cols-2 gap-10 mt-8 text-center text-[11px]">
              <div>
                <div className="h-16 border-b border-dashed border-slate-400" />
                <p className="font-semibold mt-1">Hazırlayan (İnsan Kaynakları)</p>
              </div>
              <div>
                <div className="h-16 border-b border-dashed border-slate-400" />
                <p className="font-semibold mt-1">Onaylayan (Şirket Yetkilisi)</p>
                <p className="text-[10px] text-slate-500 uppercase">{compTitle}</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
