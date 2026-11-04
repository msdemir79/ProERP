import React, { useState, useEffect, useRef } from 'react';
import { settingsService } from '../../services/settingsService';
import { hrService } from '../../services/hrService';
import { X, Printer, Download } from 'lucide-react';
import type { PayrollRecord, Employee, HRModuleSettings } from '../../types';
import { downloadElementAsPdf } from '../../lib/pdfService';
import { showToast } from '../../lib/feedback';

interface PayrollSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  payroll: PayrollRecord | null;
  employee?: Employee | null;
}

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

/**
 * Sayısal tutarı Türkçe yazıyla ifade eden yardımcı fonksiyon
 * Örnek: 31979.16 -> "Yalnız Otuz Bir Bin Dokuz Yüz Yetmiş Dokuz Türk Lirası On Altı Kuruştur."
 */
function numberToWordsTR(val: number): string {
  if (val === undefined || val === null || isNaN(val) || val === 0) {
    return 'Yalnız Sıfır Türk Lirasıdır.';
  }

  const units = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz'];
  const tens = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan'];

  function convertGroup(num: number): string {
    let res = '';
    const h = Math.floor(num / 100);
    const t = Math.floor((num % 100) / 10);
    const u = num % 10;

    if (h > 0) {
      if (h === 1) res += 'Yüz ';
      else res += units[h] + ' Yüz ';
    }
    if (t > 0) {
      res += tens[t] + ' ';
    }
    if (u > 0) {
      res += units[u] + ' ';
    }
    return res;
  }

  const rounded = Math.round(val * 100) / 100;
  const intPart = Math.floor(Math.abs(rounded));
  const decPart = Math.round((Math.abs(rounded) - intPart) * 100);

  let result = '';

  const billions = Math.floor(intPart / 1_000_000_000);
  const millions = Math.floor((intPart % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((intPart % 1_000_000) / 1000);
  const remainder = intPart % 1000;

  if (billions > 0) {
    result += convertGroup(billions) + 'Milyar ';
  }
  if (millions > 0) {
    result += convertGroup(millions) + 'Milyon ';
  }
  if (thousands > 0) {
    if (thousands === 1) result += 'Bin ';
    else result += convertGroup(thousands) + 'Bin ';
  }
  if (remainder > 0 || intPart === 0) {
    result += convertGroup(remainder);
  }

  result = result.trim() + ' Türk Lirası';

  if (decPart > 0) {
    const decGroup = convertGroup(decPart).trim();
    result += ' ' + decGroup + ' Kuruştur.';
  } else {
    result += 'dır.';
  }

  return 'Yalnız ' + result;
}

function fmt(n: number | undefined | null): string {
  return Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d?: Date | string | null): string {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('tr-TR');
}

const sectionLabel = 'text-[10px] font-black tracking-wider text-slate-600 mb-1';
const cellBase = 'border border-slate-300 px-2.5 py-1.5 align-top';

function InfoCell({ label, value, sub, mono }: { label: string; value: React.ReactNode; sub?: React.ReactNode; mono?: boolean }) {
  return (
    <td className={cellBase}>
      <span className="block text-[10px] text-slate-500">{label}</span>
      <span className={`block font-semibold text-[11px] text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
      {sub ? <span className="block text-[10px] text-slate-500 font-mono break-all">{sub}</span> : null}
    </td>
  );
}

export default function PayrollSlipModal({ isOpen, onClose, payroll, employee }: PayrollSlipModalProps) {
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [hrParams, setHrParams] = useState<HRModuleSettings | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const slipContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadSettings() {
      if (isOpen) {
        const sysSettings = await settingsService.getSystemSettings();
        if (sysSettings?.company) {
          setCompanySettings(sysSettings.company);
        }
        hrService.getHRParameters()
          .then(setHrParams)
          .catch(err => console.error('İK parametreleri okunamadı:', err));
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

  if (!isOpen || !payroll) return null;

  const isSgk = payroll.sgkStatus === 'sgk_li';
  const isDaily = payroll.salaryType === 'daily';
  const isHourly = payroll.salaryType === 'hourly';

  const compName = companySettings?.companyName || 'DMR Nexus';
  const compTitle = companySettings?.companyTitle || companySettings?.companyName || 'DMR Nexus';
  const compLogo = companySettings?.logo;
  const compAddress = companySettings?.address || 'İkitelli OSB Aykosan Sanayi Sitesi 4. Ada B Blok No:12 Başakşehir / İstanbul';
  const compTaxOffice = companySettings?.taxOffice || 'İkitelli V.D.';
  const compTaxNumber = companySettings?.taxNumber || '7320491820';

  // Dönem bordrosunun hesaplandığı taban ücret (kaydın kendi değeri esastır;
  // personel maaşı sonradan değişmiş olabilir)
  const agreedBaseSalary = payroll.baseSalary || employee?.baseSalary || 0;

  // İK parametreleri (Ayarlar > İK & Bordro) — motor ile aynı kaynak
  const dailyWorkHours = hrParams?.dailyWorkHours ?? 8;
  const sgkMonthlyHours = hrParams?.sgkMonthlyHours ?? 225;
  const nonSgkMonthlyHours = hrParams?.nonSgkMonthlyHours ?? 240;
  const overtimeWeekdayMultiplier = hrParams?.overtimeWeekdayMultiplier ?? 1.5;
  const overtimeWeekendMultiplier = hrParams?.overtimeWeekendMultiplier ?? 2;
  const sgkEmployeeRate = hrParams?.sgkEmployeeRate ?? 14;
  const unemploymentEmployeeRate = hrParams?.unemploymentEmployeeRate ?? 1;
  const incomeTaxRate = hrParams?.incomeTaxRate ?? 15;
  const stampTaxPerMille = hrParams?.stampTaxPerMille ?? 7.59;

  const fmtRate = (n: number) => String(n).replace('.', ',');
  const overtimeWeekdayPct = Math.round((overtimeWeekdayMultiplier - 1) * 100);
  const overtimeWeekendPct = Math.round((overtimeWeekendMultiplier - 1) * 100);
  const overtimeSubLabel = `Zamlı: hafta içi %${overtimeWeekdayPct} (${fmtRate(overtimeWeekdayMultiplier)}×) / hafta tatili %${overtimeWeekendPct} (${fmtRate(overtimeWeekendMultiplier)}×)`;

  // Birim ücretler
  const dailyRate = isDaily
    ? agreedBaseSalary
    : isHourly
      ? agreedBaseSalary * dailyWorkHours
      : agreedBaseSalary / 30;
  const hourlyNormalRate = isDaily
    ? dailyRate / dailyWorkHours
    : isHourly
      ? agreedBaseSalary
      : isSgk
        ? agreedBaseSalary / sgkMonthlyHours
        : agreedBaseSalary / nonSgkMonthlyHours;
  const overtimeUnitRate = payroll.overtimeHours > 0 && payroll.overtimePay > 0
    ? payroll.overtimePay / payroll.overtimeHours
    : hourlyNormalRate * overtimeWeekdayMultiplier;

  // Puantaj sayıları
  const daysWorked = payroll.daysWorked || 0;
  const weeklyRestDays = payroll.weeklyRestDays || 0;
  const paidLeaveDays = payroll.paidLeaveDays || 0;
  const absentDays = payroll.absentDays || 0;
  const unpaidLeaveDays = payroll.unpaidLeaveDays || 0;
  const overtimeHours = payroll.overtimeHours || 0;
  const missingDays = absentDays + unpaidLeaveDays;
  const paidDays = payroll.totalDays || (daysWorked + weeklyRestDays + paidLeaveDays);

  // Tutarlar
  const basePay = payroll.basePay || 0;
  const overtimePay = payroll.overtimePay || 0;
  const bonusPay = payroll.bonusPay || 0;
  const totalGrossPay = payroll.totalGrossPay || 0;
  const employeeSgkShare = payroll.employeeSgkShare || 0;
  const employeeUnemploymentShare = payroll.employeeUnemploymentShare || 0;
  const incomeTax = payroll.incomeTax || 0;
  const stampTax = payroll.stampTax || 0;
  const advanceDeduction = payroll.advanceDeduction || 0;
  const otherDeductions = payroll.otherDeductions || 0;
  const incomeTaxBase = totalGrossPay - employeeSgkShare - employeeUnemploymentShare;
  const totalDeductions = (payroll.totalLegalDeductions || 0) + advanceDeduction + otherDeductions;
  const netSalary = payroll.netSalary || 0;

  // Temel ücret açıklama ve formülü (servis hesabıyla birebir)
  const basePayNote = isDaily
    ? `${daysWorked} gün fiili çalışma${paidLeaveDays > 0 ? ` + ${paidLeaveDays} gün ücretli izin` : ''} karşılığı`
    : isHourly
      ? `${daysWorked} gün × ${dailyWorkHours} saat fiili çalışma karşılığı`
      : missingDays > 0
        ? `30 gün standardından ${missingDays} gün eksik (devamsızlık / ücretsiz izin)`
        : 'Tam ay (30 gün) çalışma karşılığı';
  const basePayFormula = isDaily
    ? `${daysWorked + paidLeaveDays} gün × ₺${fmt(dailyRate)}`
    : isHourly
      ? `${daysWorked * dailyWorkHours} saat × ₺${fmt(agreedBaseSalary)}`
      : `₺${fmt(agreedBaseSalary)} ÷ 30 × ${payroll.totalDays ?? paidDays} gün`;

  const isBank = employee?.paymentMethod === 'bank';

  const handleDownloadPdf = async () => {
    if (!slipContainerRef.current || !payroll) return;
    setDownloadingPdf(true);
    try {
      const filename = `Bordro_${payroll.employeeCode}_${payroll.year}_${String(payroll.month).padStart(2, '0')}.pdf`;
      await downloadElementAsPdf(slipContainerRef.current, {
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

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-2 sm:p-4 md:p-6 flex justify-center items-center print:p-0 print:bg-white print:static print:overflow-visible"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[96vh] overflow-hidden border border-slate-200 print:border-none print:shadow-none print:max-h-none print:my-0 flex flex-col">

        {/* Üst araç çubuğu (yazdırmada gizli) */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-200 print:hidden">
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-slate-800 truncate">Ücret Hesap Pusulası</h3>
            <p className="text-[11px] text-slate-500 truncate">
              {payroll.employeeName} · {payroll.employeeCode} · {MONTH_NAMES[payroll.month - 1]} {payroll.year}
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

        {/* Pusula gövdesi */}
        <div
          ref={slipContainerRef}
          id="printable-payroll-slip"
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
              <p className="font-black uppercase tracking-[0.18em] text-sm">Ücret Hesap Pusulası</p>
              <p className="text-[11px] mt-1">
                Hesap Dönemi: <b>{MONTH_NAMES[payroll.month - 1]} {payroll.year}</b>
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">4857 Sayılı İş Kanunu m.37 uyarınca düzenlenmiştir.</p>
            </div>
          </div>

          {/* 2. Personel bilgileri */}
          <div>
            <p className={sectionLabel}>PERSONEL VE ÖDEME BİLGİLERİ</p>
            <table className="w-full border border-slate-300">
              <tbody>
                <tr>
                  <InfoCell label="Adı Soyadı" value={payroll.employeeName} />
                  <InfoCell label="T.C. Kimlik No" value={employee?.tcNo || '-'} mono />
                  <InfoCell label="Sicil No" value={payroll.employeeCode} mono />
                  <InfoCell label="İşe Giriş Tarihi" value={fmtDate(employee?.hireDate)} mono />
                </tr>
                <tr>
                  <InfoCell label="Departman" value={payroll.department || '-'} />
                  <InfoCell label="Görev" value={employee?.position || 'Çalışan'} />
                  <InfoCell label="SGK Statüsü" value={isSgk ? "4/a Sigortalı (SGK'lı)" : 'Harici / Günlük Yevmiyeli'} />
                  <InfoCell
                    label="Ödeme Kanalı"
                    value={isBank ? `Banka — ${employee?.bankName || 'Banka'}` : 'Nakit (Kasa)'}
                    sub={isBank ? employee?.iban : undefined}
                  />
                </tr>
              </tbody>
            </table>
          </div>

          {/* 3. Ücret esası */}
          <div>
            <p className={sectionLabel}>SÖZLEŞME ÜCRET ESASI</p>
            <table className="w-full border border-slate-300">
              <tbody>
                <tr>
                  <InfoCell
                    label={isDaily ? 'Günlük Yevmiye (Sözleşme)' : isHourly ? 'Saatlik Ücret (Sözleşme)' : isSgk ? 'Aylık Taban Ücret (Sözleşme)' : 'Aylık Sabit Ücret (Sözleşme)'}
                    value={`₺${fmt(agreedBaseSalary)}`}
                    mono
                    sub={isDaily ? 'Günlük anlaşılan' : isHourly ? 'Saatlik anlaşılan' : isSgk ? 'Aylık brüt taban' : 'Aylık sabit net'}
                  />
                  <InfoCell
                    label="Günlük Birim Hak Ediş"
                    value={`₺${fmt(dailyRate)} / gün`}
                    mono
                    sub={isDaily ? 'Anlaşılan yevmiye' : isHourly ? `Saat ücreti × ${dailyWorkHours}` : 'Taban ÷ 30 gün'}
                  />
                  <InfoCell
                    label="Normal Saat Ücreti"
                    value={`₺${fmt(hourlyNormalRate)} / saat`}
                    mono
                    sub={isDaily ? `Yevmiye ÷ ${dailyWorkHours}` : isHourly ? 'Anlaşılan saat ücreti' : isSgk ? `Taban ÷ ${sgkMonthlyHours} saat` : `Taban ÷ ${nonSgkMonthlyHours} saat`}
                  />
                  <InfoCell
                    label="Fazla Mesai Saat Ücreti"
                    value={`₺${fmt(overtimeUnitRate)} / saat`}
                    mono
                    sub={overtimeSubLabel}
                  />
                </tr>
              </tbody>
            </table>
          </div>

          {/* 4. Puantaj dökümü */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className={sectionLabel}>DÖNEM PUANTAJ DÖKÜMÜ</p>
              <p className="text-[11px] text-slate-600">
                Ücretli Toplam Gün: <b className="font-mono">{paidDays}</b>
              </p>
            </div>
            <table className="w-full border border-slate-300 text-center">
              <thead>
                <tr className="bg-slate-100 text-[10px] font-bold tracking-wide">
                  <th className="border border-slate-300 px-2 py-1.5">FİİLİ ÇALIŞMA (GÜN)</th>
                  <th className="border border-slate-300 px-2 py-1.5">HAFTA TATİLİ (GÜN)</th>
                  <th className="border border-slate-300 px-2 py-1.5">ÜCRETLİ İZİN (GÜN)</th>
                  <th className="border border-slate-300 px-2 py-1.5">DEVAMSIZLIK (GÜN)</th>
                  <th className="border border-slate-300 px-2 py-1.5">ÜCRETSİZ İZİN (GÜN)</th>
                  <th className="border border-slate-300 px-2 py-1.5">FAZLA MESAİ (SAAT)</th>
                </tr>
              </thead>
              <tbody>
                <tr className="font-mono font-bold text-[13px]">
                  <td className="border border-slate-300 px-2 py-1.5">{daysWorked}</td>
                  <td className="border border-slate-300 px-2 py-1.5">{weeklyRestDays}</td>
                  <td className="border border-slate-300 px-2 py-1.5">{paidLeaveDays}</td>
                  <td className="border border-slate-300 px-2 py-1.5">{absentDays}</td>
                  <td className="border border-slate-300 px-2 py-1.5">{unpaidLeaveDays}</td>
                  <td className="border border-slate-300 px-2 py-1.5">{overtimeHours}</td>
                </tr>
                <tr className="text-[10px] text-slate-500">
                  <td className="border border-slate-300 px-2 py-1">mesai günü</td>
                  <td className="border border-slate-300 px-2 py-1">hafta tatili</td>
                  <td className="border border-slate-300 px-2 py-1">hak edilmiş izin</td>
                  <td className="border border-slate-300 px-2 py-1">{absentDays > 0 ? 'ücretten kesildi' : 'yok'}</td>
                  <td className="border border-slate-300 px-2 py-1">{unpaidLeaveDays > 0 ? 'ücretten kesildi' : 'yok'}</td>
                  <td className="border border-slate-300 px-2 py-1">{overtimeHours > 0 ? 'zamlı ödendi' : 'yok'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 5. Ücret hesap dökümü */}
          <div>
            <p className={sectionLabel}>ÜCRET HESAP DÖKÜMÜ</p>
            <table className="w-full border border-slate-300">
              <thead>
                <tr className="bg-slate-100 text-[10px] font-bold uppercase tracking-wide">
                  <th className="border border-slate-300 px-2.5 py-1.5 text-left w-[26%]">Kalem</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-left">Açıklama</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-right w-[24%]">Hesaplama</th>
                  <th className="border border-slate-300 px-2.5 py-1.5 text-right w-[14%]">Tutar (₺)</th>
                </tr>
              </thead>
              <tbody>
                {/* Hak edişler */}
                <tr>
                  <td colSpan={4} className="border border-slate-300 bg-slate-50 px-2.5 py-1 text-[10px] font-bold tracking-wider text-slate-700">
                    HAK EDİŞLER
                  </td>
                </tr>
                <tr>
                  <td className={`${cellBase} font-semibold`}>
                    {isDaily ? 'Temel Yevmiye Hak Edişi' : isHourly ? 'Saat Ücreti Hak Edişi' : 'Temel Ücret (Taban Maaş)'}
                  </td>
                  <td className={`${cellBase} text-slate-600`}>{basePayNote}</td>
                  <td className={`${cellBase} text-right font-mono text-slate-600`}>{basePayFormula}</td>
                  <td className={`${cellBase} text-right font-mono font-semibold`}>{fmt(basePay)}</td>
                </tr>
                {overtimeHours > 0 && (
                  <tr>
                    <td className={`${cellBase} font-semibold`}>Fazla Mesai Ücreti</td>
                    <td className={`${cellBase} text-slate-600`}>{overtimeHours} saat fazla mesai (hafta içi %{overtimeWeekdayPct} / hafta tatili %{overtimeWeekendPct} zamlı)</td>
                    <td className={`${cellBase} text-right font-mono text-slate-600`}>{overtimeHours} saat × ₺{fmt(overtimeUnitRate)}</td>
                    <td className={`${cellBase} text-right font-mono font-semibold`}>{fmt(overtimePay)}</td>
                  </tr>
                )}
                {bonusPay > 0 && (
                  <tr>
                    <td className={`${cellBase} font-semibold`}>Prim / İkramiye</td>
                    <td className={`${cellBase} text-slate-600`}>Performans primi, yol/yemek yardımı vb.</td>
                    <td className={`${cellBase} text-right font-mono text-slate-600`}>—</td>
                    <td className={`${cellBase} text-right font-mono font-semibold`}>{fmt(bonusPay)}</td>
                  </tr>
                )}
                <tr className="bg-slate-50">
                  <td colSpan={3} className={`${cellBase} text-right font-bold`}>Toplam Brüt Kazanç</td>
                  <td className={`${cellBase} text-right font-mono font-bold`}>{fmt(totalGrossPay)}</td>
                </tr>

                {/* Kesintiler */}
                <tr>
                  <td colSpan={4} className="border border-slate-300 bg-slate-50 px-2.5 py-1 text-[10px] font-bold tracking-wider text-slate-700">
                    KESİNTİLER
                  </td>
                </tr>
                {isSgk ? (
                  <>
                    <tr>
                      <td className={`${cellBase} font-semibold`}>SGK İşçi Primi (%{fmtRate(sgkEmployeeRate)})</td>
                      <td className={`${cellBase} text-slate-600`}>Brüt kazanç üzerinden sigorta primi</td>
                      <td className={`${cellBase} text-right font-mono text-slate-600`}>₺{fmt(totalGrossPay)} × %{fmtRate(sgkEmployeeRate)}</td>
                      <td className={`${cellBase} text-right font-mono font-semibold`}>−{fmt(employeeSgkShare)}</td>
                    </tr>
                    <tr>
                      <td className={`${cellBase} font-semibold`}>İşsizlik Sigortası Primi (%{fmtRate(unemploymentEmployeeRate)})</td>
                      <td className={`${cellBase} text-slate-600`}>Brüt kazanç üzerinden işsizlik primi</td>
                      <td className={`${cellBase} text-right font-mono text-slate-600`}>₺{fmt(totalGrossPay)} × %{fmtRate(unemploymentEmployeeRate)}</td>
                      <td className={`${cellBase} text-right font-mono font-semibold`}>−{fmt(employeeUnemploymentShare)}</td>
                    </tr>
                    <tr>
                      <td className={`${cellBase} font-semibold`}>Gelir Vergisi</td>
                      <td className={`${cellBase} text-slate-600`}>Asgari ücret vergi istisnası düşülmüş</td>
                      <td className={`${cellBase} text-right font-mono text-slate-600`}>₺{fmt(incomeTaxBase)} × %{fmtRate(incomeTaxRate)} − istisna</td>
                      <td className={`${cellBase} text-right font-mono font-semibold`}>−{fmt(incomeTax)}</td>
                    </tr>
                    <tr>
                      <td className={`${cellBase} font-semibold`}>Damga Vergisi</td>
                      <td className={`${cellBase} text-slate-600`}>Asgari ücret damga istisnası düşülmüş</td>
                      <td className={`${cellBase} text-right font-mono text-slate-600`}>Brüt × binde {fmtRate(stampTaxPerMille)} − istisna</td>
                      <td className={`${cellBase} text-right font-mono font-semibold`}>−{fmt(stampTax)}</td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={4} className={`${cellBase} text-slate-500 italic`}>
                      Harici / SGK'sız personel: yasal SGK primi ve vergi stopajı kesintisi bulunmamaktadır.
                    </td>
                  </tr>
                )}
                {advanceDeduction > 0 && (
                  <tr>
                    <td className={`${cellBase} font-semibold`}>Personel Avansı Mahsubu</td>
                    <td className={`${cellBase} text-slate-600`}>Dönem içinde alınan avansın mahsubu</td>
                    <td className={`${cellBase} text-right font-mono text-slate-600`}>Mahsup</td>
                    <td className={`${cellBase} text-right font-mono font-semibold`}>−{fmt(advanceDeduction)}</td>
                  </tr>
                )}
                {otherDeductions > 0 && (
                  <tr>
                    <td className={`${cellBase} font-semibold`}>Diğer Kesintiler</td>
                    <td className={`${cellBase} text-slate-600`}>BES, icra vb. kesintiler</td>
                    <td className={`${cellBase} text-right font-mono text-slate-600`}>—</td>
                    <td className={`${cellBase} text-right font-mono font-semibold`}>−{fmt(otherDeductions)}</td>
                  </tr>
                )}
                <tr className="bg-slate-50">
                  <td colSpan={3} className={`${cellBase} text-right font-bold`}>Toplam Kesintiler</td>
                  <td className={`${cellBase} text-right font-mono font-bold`}>−{fmt(totalDeductions)}</td>
                </tr>

                {/* Net */}
                <tr>
                  <td colSpan={3} className="border-2 border-slate-900 px-2.5 py-2 text-right font-bold uppercase tracking-wide text-[11px]">
                    Net Ödenecek Tutar
                  </td>
                  <td className="border-2 border-slate-900 px-2.5 py-2 text-right font-mono font-black text-sm">
                    {fmt(netSalary)}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11px] text-slate-600">
              <span>
                Yazıyla: <b className="text-slate-900">{numberToWordsTR(netSalary)}</b>
              </span>
              <span>
                {isBank
                  ? `Ödeme: Banka havalesi — ${employee?.bankName || 'Banka'}${employee?.iban ? ` (${employee.iban})` : ''}`
                  : 'Ödeme: Nakit (şirket kasası)'}
              </span>
            </div>
          </div>

          {/* 6. SGK ve vergi matrahı dökümü */}
          {isSgk && (
            <div>
              <p className={sectionLabel}>SGK VE VERGİ MATRAHI DÖKÜMÜ</p>
              <table className="w-full border border-slate-300">
                <tbody>
                  <tr>
                    <InfoCell label="SGK Matrahı (SPEK)" value={`₺${fmt(totalGrossPay)}`} mono sub="Brüt kazanç" />
                    <InfoCell label="Gelir Vergisi Matrahı" value={`₺${fmt(incomeTaxBase)}`} mono sub="Brüt − SGK − işsizlik" />
                    <InfoCell label="Asgari Ücret Vergi İstisnası" value="Uygulandı" sub="7349 s.K. muafiyeti" />
                    <InfoCell label="İşveren Toplam Maliyeti" value={`₺${fmt(payroll.totalEmployerCost)}`} mono sub="Brüt + işveren SGK payı" />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* 7. Yasal bildirim ve imzalar */}
          <div className="pt-3 border-t border-slate-300">
            <p className="text-[10px] text-slate-600 leading-relaxed italic">
              <b>Yasal Bildirim:</b> İşbu ücret hesap pusulası, 4857 sayılı İş Kanunu'nun 37. maddesi uyarınca düzenlenmiştir.
              Pusuladaki çalışma günleri, fazla mesai saatleri ve kesinti kalemleri incelenmiş olup; tarafıma ödenecek net tutar
              yukarıda dökümü yapıldığı şekildedir. Varsa itirazlar en geç 3 iş günü içinde İnsan Kaynakları departmanına bildirilmelidir.
            </p>
            <div className="grid grid-cols-2 gap-10 mt-8 text-center text-[11px]">
              <div>
                <div className="h-16 border-b border-dashed border-slate-400" />
                <p className="font-semibold mt-1">İşveren / Şirket Yetkilisi</p>
                <p className="text-[10px] text-slate-500 uppercase">{compTitle}</p>
              </div>
              <div>
                <div className="h-16 border-b border-dashed border-slate-400" />
                <p className="font-semibold mt-1">Personel (Teslim Alan)</p>
                <p className="text-[10px] text-slate-500">{payroll.employeeName} · {payroll.employeeCode}</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
