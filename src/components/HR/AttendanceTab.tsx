import React, { useState, useEffect, useRef } from 'react';
import { settingsService } from '../../services/settingsService';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  Filter,
  Info,
  Shield,
  DollarSign,
  Layers,
  Zap,
  CheckSquare,
  X,
  Users,
  FileSpreadsheet,
  FileDown,
  ChevronDown,
  Lock,
  Unlock,
} from 'lucide-react';
import type { Employee, AttendanceRecord, AttendanceStatus, SgkStatus, AttendancePeriodLock } from '../../types';
import { hrService } from '../../services/hrService';
import { exportAttendanceToExcel, exportAttendanceToCsv } from '../../lib/exportService';
import { MONTH_NAMES, formatWeekendDays, STATUS_CONFIG } from './attendanceConstants';
import { BulkAttendanceModal, LockPeriodModal, CellEditorModal, type ActiveCell } from './AttendanceModals';
import { showToast as showFeedbackToast } from '../../lib/feedback';

interface AttendanceTabProps {
  employees: Employee[];
  onAttendanceChanged?: () => void;
}


export default function AttendanceTab({ employees, onAttendanceChanged }: AttendanceTabProps) {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1); // 1-12
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [periodLock, setPeriodLock] = useState<AttendancePeriodLock | null>(null);
  const [weekendDays, setWeekendDays] = useState<number[]>([0]);
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [lockNotes, setLockNotes] = useState('');
  const [lockOperatorName, setLockOperatorName] = useState('İK Yöneticisi');
  const [isLocking, setIsLocking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  // Filters
  const [sgkFilter, setSgkFilter] = useState<'all' | SgkStatus>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  // Multi-selection
  const [selectedEmpIds, setSelectedEmpIds] = useState<number[]>([]);

  // Bulk modal state
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkScope, setBulkScope] = useState<'all' | 'selected_single' | 'selected_multiple'>('all');
  const [bulkTargetEmployeeId, setBulkTargetEmployeeId] = useState<number>(employees[0]?.id || 0);
  const [bulkTargetStatus, setBulkTargetStatus] = useState<AttendanceStatus>('present');
  const [bulkRespectWeekend, setBulkRespectWeekend] = useState<boolean>(true);

  // Quick edit single cell modal
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [editStatus, setEditStatus] = useState<AttendanceStatus>('present');
  const [editOvertime, setEditOvertime] = useState<number>(0);
  const [isSavingCell, setIsSavingCell] = useState(false);
  const [saveCellError, setSaveCellError] = useState<string | null>(null);
  const [isPopulating, setIsPopulating] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Is current period locked
  const isLocked = Boolean(periodLock?.isLocked);

  // Close export dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle Export to Excel or CSV
  const handleExport = async (format: 'xls' | 'csv' = 'xls', scope: 'filtered' | 'selected' | 'all' = 'filtered') => {
    let targetEmployees: Employee[] = [];
    let scopeTitle = '';

    if (scope === 'selected' && selectedEmpIds.length > 0) {
      targetEmployees = employees.filter(e => selectedEmpIds.includes(e.id!));
      scopeTitle = `${targetEmployees.length} Seçili Personel`;
    } else if (scope === 'all') {
      targetEmployees = employees;
      scopeTitle = `Tüm Personel (${employees.length} Kişi)`;
    } else {
      targetEmployees = filteredEmployees;
      scopeTitle = sgkFilter !== 'all' 
        ? (sgkFilter === 'sgk_li' ? 'SGK\'lı Personeller' : 'Yevmiyeli Personeller') 
        : `Tüm Personel (${employees.length} Kişi)`;
    }

    if (targetEmployees.length === 0) {
      showToast('Dışa aktarılacak personel kaydı bulunamadı.');
      return;
    }

    if (format === 'xls') {
      const sysSettings = await settingsService.getSystemSettings();
      const companyName = sysSettings?.company?.companyTitle || sysSettings?.company?.companyName;
      exportAttendanceToExcel(selectedMonth, selectedYear, targetEmployees, records, { filterTitle: scopeTitle, companyName });
      showToast(`${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} puantaj çizelgesi Excel (.xls) formatında dışa aktarıldı (${targetEmployees.length} personel).`);
    } else {
      exportAttendanceToCsv(selectedMonth, selectedYear, targetEmployees, records);
      showToast(`${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} puantaj verileri CSV formatında dışa aktarıldı (${targetEmployees.length} personel).`);
    }
    setIsExportMenuOpen(false);
  };

  // Load attendance records and lock status
  const loadAttendance = async () => {
    try {
      setLoading(true);
      const [attendanceData, lockData, hrParams] = await Promise.all([
        hrService.getAttendanceForMonth(selectedMonth, selectedYear),
        hrService.getPeriodLock(selectedMonth, selectedYear),
        hrService.getHRParameters()
      ]);
      setRecords(attendanceData);
      setPeriodLock(lockData || null);
      setWeekendDays(hrParams.weekendDays ?? [0]);
      if (lockData?.notes) {
        setLockNotes(lockData.notes);
      } else {
        setLockNotes('');
      }
    } catch (err) {
      console.error('Puantaj yükleme hatası:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, [selectedMonth, selectedYear]);

  // Handle Lock / Unlock Period
  const handleToggleLock = async (targetLocked: boolean) => {
    try {
      setIsLocking(true);
      const updated = await hrService.setPeriodLock(
        selectedMonth,
        selectedYear,
        targetLocked,
        lockOperatorName || 'İK Yöneticisi',
        lockNotes
      );
      setPeriodLock(updated);
      setIsLockModalOpen(false);
      if (targetLocked) {
        showToast(`🔒 ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} dönemi kilitlendi. Puantaj kayıtları üzerinde değişiklik yapılamaz.`);
      } else {
        showToast(`🔓 ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} dönem kilidi açıldı. Puantaj düzenlemelerine izin verildi.`);
      }
      onAttendanceChanged?.();
    } catch (err: any) {
      console.error('Dönem kilitleme hatası:', err);
      showToast(err?.message || 'İşlem sırasında bir hata oluştu.');
    } finally {
      setIsLocking(false);
    }
  };

  // Flash status message
  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  };

  // Days in selected month
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Filtered employees
  const departments = Array.from(new Set(employees.map(e => e.department)));
  const filteredEmployees = employees.filter(emp => {
    if (sgkFilter !== 'all' && emp.sgkStatus !== sgkFilter) return false;
    if (deptFilter !== 'all' && emp.department !== deptFilter) return false;
    return true;
  });

  /**
   * PERF: Matris hücreleri daha önce her render'da personel başına
   * `records.filter(...)` ve (personel × gün) başına `empRecords.find(...)`
   * çalıştırıyordu → 100 personel × 31 gün ve 3.100 kayıtta render başına
   * ~9,6 milyon karşılaştırma. Kayıtlar bir kez indekslenir ve satır özetleri
   * (çalıştı/tatil/izin/devamsız/mesai) önceden hesaplanır; hücreler artık
   * O(1) sözlük araması yapar.
   */
  const recordsByEmployee = React.useMemo(() => {
    const byEmp = new Map<number, Map<string, AttendanceRecord>>();
    for (const r of records) {
      const empId = Number(r.employeeId);
      if (!Number.isFinite(empId)) continue;
      let byDate = byEmp.get(empId);
      if (!byDate) {
        byDate = new Map<string, AttendanceRecord>();
        byEmp.set(empId, byDate);
      }
      if (r.date) byDate.set(r.date, r);
    }
    return byEmp;
  }, [records]);

  /** Gün başına önceden hesaplanmış tarih anahtarı ve hafta tatili bayrağı. */
  const dayMeta = React.useMemo(
    () =>
      daysArray.map((day) => {
        const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayOfWeek = new Date(selectedYear, selectedMonth - 1, day).getDay();
        return { day, dateStr, isWeekend: weekendDays.includes(dayOfWeek) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daysInMonth, selectedYear, selectedMonth, weekendDays.join(',')]
  );

  /** Personel başına satır özetleri: hücre render'ı sırasında yan etki yok. */
  const rowSummaries = React.useMemo(() => {
    const summaries = new Map<number, {
      worked: number; rest: number; leave: number; unpaid: number; absent: number; overtime: number;
    }>();
    for (const emp of filteredEmployees) {
      if (emp.id === undefined || emp.id === null) continue;
      const byDate = recordsByEmployee.get(Number(emp.id));
      let worked = 0, rest = 0, leave = 0, unpaid = 0, absent = 0, overtime = 0;
      for (const meta of dayMeta) {
        const rec = byDate?.get(meta.dateStr);
        const status: AttendanceStatus = rec?.status || (meta.isWeekend ? 'weekly_rest' : 'present');
        if (status === 'present') worked += 1;
        else if (status === 'half_day') worked += 0.5;
        else if (status === 'weekly_rest') rest += 1;
        else if (status === 'paid_leave' || status === 'public_holiday' || status === 'sick_leave') leave += 1;
        else if (status === 'unpaid_leave') { unpaid += 1; leave += 1; }
        else if (status === 'absent') absent += 1;
        overtime += rec?.overtimeHours || 0;
      }
      summaries.set(Number(emp.id), { worked, rest, leave, unpaid, absent, overtime });
    }
    return summaries;
  }, [filteredEmployees, recordsByEmployee, dayMeta]);

  // Handle month navigation
  const prevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const nextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  // 1-Click: Tüm aktif personelin puantajını otomatik doldur (hafta tatili günleri ayardan okunur, diğer günler geldi)
  const handleAutoPopulate = async () => {
    if (isLocked) {
      showToast(`🔒 ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} dönemi kilitlidir. Otomatik doldurma yapmak için önce dönem kilidini açınız.`);
      return;
    }
    try {
      setIsPopulating(true);
      await hrService.autoPopulateMonthAttendance(selectedMonth, selectedYear, true);
      // Bordroyu anında güncelle
      await hrService.generateMonthlyPayroll(selectedMonth, selectedYear);
      await loadAttendance();
      onAttendanceChanged?.();
      showToast(`${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} için tüm çalışanların puantajı ve bordroları başarıyla güncellendi.`);
    } catch (err: any) {
      console.error('Puantaj doldurma hatası:', err);
      showToast(err?.message || 'Puantaj doldurulurken bir hata oluştu.');
    } finally {
      setIsPopulating(false);
    }
  };

  // Tek bir personeli anında tüm ay "Geldi (N)" yap (hafta tatili günleri korunur)
  const handleMakeSingleEmployeePresent = async (empId: number, empName: string) => {
    if (isLocked) {
      showToast(`🔒 ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} dönemi kilitlidir. Değişiklik yapmak için önce dönem kilidini açınız.`);
      return;
    }
    try {
      setIsPopulating(true);
      await hrService.bulkSetAttendanceForEmployees([empId], selectedMonth, selectedYear, 'present', true);
      // Bordroyu anında güncelle
      await hrService.generateMonthlyPayroll(selectedMonth, selectedYear);
      await loadAttendance();
      onAttendanceChanged?.();
      showToast(`${empName} personeli için tüm ay 'Geldi (N)' olarak güncellendi.`);
    } catch (err: any) {
      console.error('Puantaj güncelleme hatası:', err);
      showToast(err?.message || 'Puantaj güncellenirken hata oluştu.');
    } finally {
      setIsPopulating(false);
    }
  };

  // Toplu popup modalı içinden işlem çalıştırma
  const handleExecuteBulkAction = async () => {
    if (isLocked) {
      showToast(`🔒 ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} dönemi kilitlidir. Değişiklik yapmak için önce dönem kilidini açınız.`);
      return;
    }
    try {
      setIsPopulating(true);
      let targetIds: number[] = [];

      if (bulkScope === 'all') {
        targetIds = employees.map(e => e.id!).filter(Boolean);
      } else if (bulkScope === 'selected_single') {
        if (!bulkTargetEmployeeId) return;
        targetIds = [bulkTargetEmployeeId];
      } else if (bulkScope === 'selected_multiple') {
        targetIds = selectedEmpIds;
      }

      if (targetIds.length === 0) {
        showFeedbackToast('Lütfen en az bir personel seçiniz.', 'warning');
        return;
      }

      await hrService.bulkSetAttendanceForEmployees(
        targetIds,
        selectedMonth,
        selectedYear,
        bulkTargetStatus,
        bulkRespectWeekend
      );

      // Bordroyu anında güncelle
      await hrService.generateMonthlyPayroll(selectedMonth, selectedYear);
      await loadAttendance();
      onAttendanceChanged?.();
      setIsBulkModalOpen(false);
      showToast(`${targetIds.length} personel için puantaj ve bordro toplu olarak güncellendi.`);
    } catch (err: any) {
      console.error('Toplu puantaj işlemi hatası:', err);
      showToast(err?.message || 'Toplu işlem hatası.');
    } finally {
      setIsPopulating(false);
    }
  };

  // Seçili personelleri doğrudan tüm ay "Geldi" yap
  const handleSetSelectedPresent = async () => {
    if (isLocked) {
      showToast(`🔒 ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} dönemi kilitlidir. Değişiklik yapmak için önce dönem kilidini açınız.`);
      return;
    }
    if (selectedEmpIds.length === 0) return;
    try {
      setIsPopulating(true);
      await hrService.bulkSetAttendanceForEmployees(
        selectedEmpIds,
        selectedMonth,
        selectedYear,
        'present',
        true
      );
      // Bordroyu anında güncelle
      await hrService.generateMonthlyPayroll(selectedMonth, selectedYear);
      await loadAttendance();
      onAttendanceChanged?.();
      showToast(`${selectedEmpIds.length} seçili personelin tamamı 'Geldi' olarak işaretlendi.`);
    } catch (err: any) {
      console.error('Toplu güncelleme hatası:', err);
      showToast(err?.message || 'Güncelleme hatası.');
    } finally {
      setIsPopulating(false);
    }
  };

  // Ayın puantajını temizle
  const handleClearAttendance = async () => {
    if (isLocked) {
      showToast(`🔒 ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} dönemi kilitlidir. Puantajı temizlemek için önce dönem kilidini açınız.`);
      return;
    }
    try {
      setIsPopulating(true);
      const targetIds = selectedEmpIds.length > 0 ? selectedEmpIds : undefined;
      await hrService.bulkClearMonthAttendance(selectedMonth, selectedYear, targetIds);
      // Bordroyu anında güncelle
      await hrService.generateMonthlyPayroll(selectedMonth, selectedYear);
      await loadAttendance();
      onAttendanceChanged?.();
      setIsBulkModalOpen(false);
      showToast(targetIds ? `${targetIds.length} personelin puantajı temizlendi.` : 'Tüm personellerin puantajı temizlendi.');
    } catch (err: any) {
      console.error('Puantaj temizleme hatası:', err);
      showToast(err?.message || 'Puantaj temizlenirken hata oluştu.');
    } finally {
      setIsPopulating(false);
    }
  };

  // Selection toggle
  const toggleSelectAll = () => {
    if (selectedEmpIds.length === filteredEmployees.length) {
      setSelectedEmpIds([]);
    } else {
      setSelectedEmpIds(filteredEmployees.map(e => e.id!).filter(Boolean));
    }
  };

  const toggleSelectEmployee = (id: number) => {
    setSelectedEmpIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Open quick cell modal
  const handleCellClick = (emp: Employee, day: number) => {
    if (isLocked) {
      showToast(`🔒 ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} dönemi kilitlidir. Puantaj hücreleri salt okunur moddadır. Değişiklik için dönem kilidini açınız.`);
      return;
    }

    const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const rec = records.find(r => r.employeeId === emp.id && r.date === dateStr);
    
    // Varsayılan durum: hafta tatili günü ise 'Hafta Tatili', değilse 'Geldi'
    const dayOfWeek = new Date(selectedYear, selectedMonth - 1, day).getDay();
    const defaultStatus: AttendanceStatus = weekendDays.includes(dayOfWeek) ? 'weekly_rest' : 'present';

    setActiveCell({
      employeeId: emp.id!,
      employeeName: emp.name,
      date: dateStr,
      day,
      currentRecord: rec
    });
    setEditStatus(rec?.status || defaultStatus);
    setEditOvertime(rec?.overtimeHours || 0);
    setSaveCellError(null);
    setIsSavingCell(false);
  };

  // Save single attendance cell
  const handleSaveCell = async () => {
    if (!activeCell || isSavingCell) return;
    if (isLocked) {
      showToast(`🔒 ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} dönemi kilitlidir.`);
      setActiveCell(null);
      return;
    }
    try {
      setIsSavingCell(true);
      setSaveCellError(null);
      await hrService.saveAttendanceRecord({
        employeeId: activeCell.employeeId,
        date: activeCell.date,
        status: editStatus,
        overtimeHours: Number(editOvertime) || 0,
        normalHours: editStatus === 'present' ? 8 : editStatus === 'half_day' ? 4 : 0
      });
      // Puantaj hücresi değiştiğinde bordroyu otomatik güncelle
      await hrService.generateMonthlyPayroll(selectedMonth, selectedYear);
      await loadAttendance();
      onAttendanceChanged?.();
      setActiveCell(null);
    } catch (err: any) {
      console.error('Hücre kaydetme hatası:', err);
      const msg = err?.message || 'Kayıt sırasında hata oluştu.';
      // Modal açıkken üstteki toast görünmediği için hata modal içinde de gösterilir.
      setSaveCellError(msg);
      showToast(msg);
    } finally {
      setIsSavingCell(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast / Status Banner */}
      {statusMessage && (
        <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header & Month Controls */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        
        {/* Month Picker & Lock Status Indicator */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={prevMonth}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-600 transition-colors"
              title="Önceki Ay"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-black text-slate-800 dark:text-slate-200 tracking-wide">
                {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
              </span>
            </div>
            <button
              onClick={nextMonth}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-600 transition-colors"
              title="Sonraki Ay"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Period Lock Badge & Button */}
          {isLocked ? (
            <button
              onClick={() => setIsLockModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg font-bold text-xs transition-colors cursor-pointer shadow-2xs"
              title="Dönem kilitli. Kilidi açmak veya detayları görmek için tıklayınız."
            >
              <Lock className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
              <span>Dönem Kilitli</span>
              <span className="text-[10px] text-rose-600 underline ml-0.5 font-normal">Aç</span>
            </button>
          ) : (
            <button
              onClick={() => setIsLockModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 border border-slate-300 rounded-lg font-semibold text-xs transition-colors cursor-pointer"
              title="Puantaj tamamlandığında dönemi kilitleyerek yanlışlıkla değiştirilmesini önleyin"
            >
              <Lock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Dönemi Kilitle</span>
            </button>
          )}
        </div>

        {/* Filter & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs w-full lg:w-auto">
          {/* SGK Status Filter */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              onClick={() => setSgkFilter('all')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                sgkFilter === 'all' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              Tümü ({employees.length})
            </button>
            <button
              onClick={() => setSgkFilter('sgk_li')}
              className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 transition-colors ${
                sgkFilter === 'sgk_li' ? 'bg-white dark:bg-slate-900 text-emerald-700 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              <Shield className="w-3 h-3 text-emerald-600" />
              SGK'lı ({employees.filter(e => e.sgkStatus === 'sgk_li').length})
            </button>
            <button
              onClick={() => setSgkFilter('sgk_siz')}
              className={`px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 transition-colors ${
                sgkFilter === 'sgk_siz' ? 'bg-white dark:bg-slate-900 text-amber-700 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              <DollarSign className="w-3 h-3 text-amber-600" />
              SGK'sız ({employees.filter(e => e.sgkStatus === 'sgk_siz').length})
            </button>
          </div>

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none shrink-0"
          >
            <option value="all">Tüm Departmanlar</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Quick Auto Populate 1-Click */}
          <button
            onClick={handleAutoPopulate}
            disabled={isPopulating || isLocked}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            title={isLocked ? "Dönem kilitli olduğu için otomatik doldurma devre dışıdır" : `Tüm personelin puantajını doldurur (${formatWeekendDays(weekendDays)} hafta tatili, diğer günler normal çalışma)`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isPopulating ? 'İşleniyor...' : 'Otomatik Doldur'}
          </button>

          {/* Excel'e Aktar (Export) Button with Dropdown Menu */}
          <div className="relative" ref={exportMenuRef}>
            <div className="flex items-center">
              <button
                onClick={() => handleExport('xls', 'filtered')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-l-lg font-bold text-xs shadow-xs transition-colors cursor-pointer"
                title={`${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} puantajını biçimlendirilmiş Excel (.xls) olarak indir`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Excel'e Aktar</span>
              </button>
              <button
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="px-1.5 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-r-lg border-l border-emerald-600 transition-colors cursor-pointer"
                title="Dışa aktarma seçenekleri"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Dropdown Options */}
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95">
                <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  Puantaj Dışa Aktarma Seçenekleri
                </div>

                <button
                  onClick={() => handleExport('xls', 'filtered')}
                  className="w-full px-3 py-2 text-left flex items-start gap-2 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">Excel Formatı (.xls)</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Renkli 1-31 puantaj matrisi, lejant ve genel toplamlar</div>
                  </div>
                </button>

                <button
                  onClick={() => handleExport('csv', 'filtered')}
                  className="w-full px-3 py-2 text-left flex items-start gap-2 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  <FileDown className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">CSV Tablosu (.csv)</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Standart UTF-8 BOM virgüllü veri seti</div>
                  </div>
                </button>

                {selectedEmpIds.length > 0 && (
                  <>
                    <div className="my-1 border-t border-slate-100 dark:border-slate-800"></div>
                    <button
                      onClick={() => handleExport('xls', 'selected')}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-indigo-50 text-indigo-900 font-bold transition-colors cursor-pointer"
                    >
                      <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>Yalnızca Seçili {selectedEmpIds.length} Personeli Aktar</span>
                    </button>
                  </>
                )}

                {employees.length !== filteredEmployees.length && (
                  <button
                    onClick={() => handleExport('xls', 'all')}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800"
                  >
                    <Users className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    <span>Tüm Aktif Personelleri Aktar ({employees.length})</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Toplu İşlemler Popup Menu Trigger */}
          <button
            onClick={() => {
              if (isLocked) {
                showToast(`🔒 ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} dönemi kilitlidir. Toplu işlem yapmak için önce kilidi açınız.`);
                return;
              }
              if (selectedEmpIds.length > 0) {
                setBulkScope('selected_multiple');
              } else {
                setBulkScope('all');
              }
              setIsBulkModalOpen(true);
            }}
            disabled={isLocked}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title={isLocked ? "Dönem kilitli" : "Toplu puantaj işlemleri"}
          >
            <Layers className="w-3.5 h-3.5" />
            Toplu İşlem
          </button>
        </div>
      </div>

      {/* Period Lock Warning Banner if Locked */}
      {isLocked && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-gradient-to-r from-rose-50 via-amber-50 to-rose-50 border border-rose-200/90 rounded-xl text-xs text-rose-950 shadow-2xs animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-rose-100/90 text-rose-800 rounded-lg shrink-0 mt-0.5">
              <Lock className="w-4 h-4 text-rose-700" />
            </div>
            <div>
              <div className="font-black text-rose-900 flex items-center gap-2 flex-wrap">
                <span>{MONTH_NAMES[selectedMonth - 1]} {selectedYear} Puantaj Dönemi Kilitlidir</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-200 text-rose-900">
                  Salt Okunur (Kesinleşti)
                </span>
              </div>
              <p className="text-rose-800/90 mt-0.5 text-xs">
                Bu dönemin puantaj verileri kesinleştirilmiştir. Yanlışlıkla değişiklik yapılmasını önlemek için hücre düzenleme ve otomatik işlemler kilitlenmiştir.
                {periodLock?.lockedBy && ` • Kitleyen: ${periodLock.lockedBy}`}
                {periodLock?.lockedAt && ` • Tarih: ${new Date(periodLock.lockedAt).toLocaleString('tr-TR')}`}
                {periodLock?.notes && ` • Not: "${periodLock.notes}"`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsLockModalOpen(true)}
            className="shrink-0 px-3.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-rose-100 text-rose-900 font-bold rounded-lg border border-rose-300 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 text-xs"
          >
            <Unlock className="w-3.5 h-3.5 text-rose-700" />
            Dönem Kilidini Aç
          </button>
        </div>
      )}

      {/* Dynamic Multi-Selection Bar */}
      {selectedEmpIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs animate-in fade-in">
          <div className="flex items-center gap-2 text-indigo-900 font-bold">
            <CheckSquare className="w-4 h-4 text-indigo-600" />
            <span>{selectedEmpIds.length} personel seçildi</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleExport('xls', 'selected')}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold transition-colors shadow-2xs cursor-pointer"
              title="Seçili personellerin puantajını Excel olarak indir"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Seçilenleri Excel'e Aktar ({selectedEmpIds.length})
            </button>

            <button
              onClick={handleSetSelectedPresent}
              disabled={isPopulating || isLocked}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title={isLocked ? "Dönem kilitli" : "Seçili personelleri 'Geldi' yap"}
            >
              <Zap className="w-3.5 h-3.5" />
              Tüm Ay 'Geldi' Yap
            </button>

            <button
              onClick={() => {
                if (isLocked) {
                  showToast(`🔒 ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} dönemi kilitlidir.`);
                  return;
                }
                setBulkScope('selected_multiple');
                setIsBulkModalOpen(true);
              }}
              disabled={isLocked}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title={isLocked ? "Dönem kilitli" : "Toplu durum ata"}
            >
              Diğer Durumu Ata...
            </button>

            <button
              onClick={() => setSelectedEmpIds([])}
              className="px-2.5 py-1.5 text-slate-600 hover:bg-indigo-100 rounded-lg font-semibold transition-colors cursor-pointer"
            >
              Seçimi Kaldır
            </button>
          </div>
        </div>
      )}

      {/* Status Legend (Renk Açıklaması) */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">
        <span className="font-bold text-slate-600 mr-2 flex items-center gap-1">
          <Info className="w-3 h-3" /> Kodlar:
        </span>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1">
            <span className={`w-5 h-5 flex items-center justify-center font-bold text-[10px] rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
              {cfg.code}
            </span>
            <span className="text-slate-600 text-[10px]">{cfg.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-3 pl-3 border-l border-slate-300">
          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
            +2h
          </span>
          <span className="text-slate-600 text-[10px]">Fazla Mesai</span>
        </div>
      </div>

      {/* Puantaj Matrisi (Calendar Matrix Table) */}
      <div className="relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-x-auto">
        {loading && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/70 dark:bg-slate-900/70 rounded-xl">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider">Puantaj Yükleniyor...</span>
            </div>
          </div>
        )}
        <table className="w-full text-xs text-left border-collapse min-w-[1100px]">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 font-bold">
              {/* Checkbox Select All */}
              <th className="p-2 w-8 text-center bg-slate-100 dark:bg-slate-800 sticky left-0 z-20 shadow-xs border-r border-slate-200 dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={selectedEmpIds.length > 0 && selectedEmpIds.length === filteredEmployees.length}
                  onChange={toggleSelectAll}
                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  title="Tüm personeli seç / kaldır"
                />
              </th>
              
              <th className="p-3 sticky left-8 bg-slate-100 dark:bg-slate-800 z-10 w-52 min-w-[200px] shadow-xs">
                Personel & Hızlı İşlem
              </th>
              <th className="p-2 w-20 text-center">Statü</th>
              
              {/* Day Headers 1-31 */}
              {daysArray.map((day) => {
                const dayOfWeek = new Date(selectedYear, selectedMonth - 1, day).getDay();
                const isWeekend = weekendDays.includes(dayOfWeek);
                const dayName = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'][dayOfWeek];

                return (
                  <th
                    key={day}
                    className={`p-1 text-center w-8 min-w-[32px] border-l border-slate-200 dark:border-slate-700 ${
                      isWeekend ? 'bg-slate-200/70 text-rose-600 font-black' : ''
                    }`}
                  >
                    <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">{dayName}</div>
                    <div className="text-xs font-bold">{day}</div>
                  </th>
                );
              })}

              {/* Summary Headers */}
              <th className="p-2 text-center bg-slate-100 dark:bg-slate-800 border-l border-slate-300 w-12 text-[11px]">Fiili</th>
              <th className="p-2 text-center bg-slate-100 dark:bg-slate-800 w-12 text-[11px]">Tatil</th>
              <th className="p-2 text-center bg-slate-100 dark:bg-slate-800 w-12 text-[11px]">İzin</th>
              <th className="p-2 text-center bg-slate-100 dark:bg-slate-800 w-12 text-[11px] text-rose-600">Devam.</th>
              <th className="p-2 text-center bg-indigo-50 text-indigo-700 border-l border-indigo-200 w-14 text-[11px]">FM (Sa)</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={daysInMonth + 8} className="p-8 text-center text-slate-400">
                  Kayıtlı personel bulunamadı veya filtreye uygun çalışan yok.
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => {
                const empId = Number(emp.id);
                const byDate = recordsByEmployee.get(empId);
                const summary = rowSummaries.get(empId) || { worked: 0, rest: 0, leave: 0, unpaid: 0, absent: 0, overtime: 0 };
                const isSelected = selectedEmpIds.includes(emp.id!);

                return (
                  <tr key={emp.id} className={`transition-colors ${isSelected ? 'bg-indigo-50/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'}`}>
                    {/* Checkbox */}
                    <td className="p-2 text-center sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:bg-slate-800/50 z-20 border-r border-slate-200 dark:border-slate-700 shadow-xs">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectEmployee(emp.id!)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>

                    {/* Employee info with Quick Action Button */}
                    <td className="p-3 sticky left-8 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:bg-slate-800/50 z-10 border-r border-slate-200 dark:border-slate-700 shadow-xs">
                      <div className="flex items-center justify-between gap-1">
                        <div className="truncate">
                          <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{emp.name}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{emp.employeeCode}</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 font-medium truncate">
                              {emp.department}
                            </span>
                          </div>
                        </div>

                        {/* Quick 1-Click: Bu personeli tüm ay 'Geldi' yap */}
                        <button
                          onClick={() => handleMakeSingleEmployeePresent(emp.id!, emp.name)}
                          disabled={isPopulating || isLocked}
                          className="shrink-0 p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          title={isLocked ? "Dönem kilitli" : "Bu personeli ay boyunca 'Geldi (N)' yap (hafta tatili günleri korunur)"}
                        >
                          <Zap className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* SGK Status Tag */}
                    <td className="p-2 text-center">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        emp.sgkStatus === 'sgk_li' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {emp.sgkStatus === 'sgk_li' ? 'SGK\'lı' : 'SGK\'sız'}
                      </span>
                    </td>

                    {/* Day Cells 1-31 */}
                    {dayMeta.map(({ day, dateStr, isWeekend }) => {
                      const rec = byDate?.get(dateStr);

                      // Status fallback if no explicit record
                      const status: AttendanceStatus = rec?.status || (isWeekend ? 'weekly_rest' : 'present');
                      const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.present;
                      const overtime = rec?.overtimeHours || 0;

                      return (
                        <td
                          key={day}
                          onClick={() => handleCellClick(emp, day)}
                          className={`p-1 text-center border-l border-slate-150 transition-all ${
                            isLocked 
                              ? 'cursor-not-allowed opacity-95' 
                              : 'cursor-pointer hover:ring-2 hover:ring-indigo-400 hover:z-20'
                          } ${
                            isWeekend && status === 'weekly_rest' ? 'bg-slate-50 dark:bg-slate-800/50' : ''
                          }`}
                          title={`${emp.name} - ${day} ${MONTH_NAMES[selectedMonth - 1]}: ${cfg.label} ${overtime > 0 ? `(${overtime} sa mesai)` : ''}${isLocked ? ' [Dönem Kilitli]' : ''}`}
                        >
                          <div className="flex flex-col items-center justify-center">
                            <span className={`w-6 h-6 rounded flex items-center justify-center font-bold text-[11px] transition-transform ${isLocked ? '' : 'active:scale-90'} ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                              {cfg.code}
                            </span>
                            {overtime > 0 && (
                              <span className="text-[9px] font-bold text-indigo-600 leading-none mt-0.5">
                                +{overtime}h
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Summary Counters */}
                    <td className="p-2 text-center font-bold text-emerald-700 bg-emerald-50/30 border-l border-slate-300">
                      {summary.worked}
                    </td>
                    <td className="p-2 text-center font-medium text-slate-600 bg-slate-50 dark:bg-slate-800/50">
                      {summary.rest}
                    </td>
                    <td className="p-2 text-center font-medium text-sky-700 bg-sky-50/30">
                      {summary.leave > 0 ? (
                        summary.unpaid > 0 ? (
                          <span title={`${summary.unpaid} gün ücretsiz izin`}>
                            {summary.leave} <span className="text-[10px] text-amber-600 font-bold">({summary.unpaid} Ü.İ)</span>
                          </span>
                        ) : (
                          summary.leave
                        )
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-2 text-center font-bold text-rose-600 bg-rose-50/30">
                      {summary.absent > 0 ? summary.absent : '-'}
                    </td>
                    <td className="p-2 text-center font-bold text-indigo-700 bg-indigo-50/60 border-l border-indigo-200">
                      {summary.overtime > 0 ? `${summary.overtime}s` : '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ============================================================ */}
      {/* TOPLU PUANTAJ İŞLEMLERİ POPUP MODAL                          */}
      {/* ============================================================ */}
      {isBulkModalOpen && (
        <BulkAttendanceModal
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          weekendDays={weekendDays}
          employees={employees}
          selectedEmpIds={selectedEmpIds}
          bulkScope={bulkScope}
          setBulkScope={setBulkScope}
          bulkTargetEmployeeId={bulkTargetEmployeeId}
          setBulkTargetEmployeeId={setBulkTargetEmployeeId}
          bulkTargetStatus={bulkTargetStatus}
          setBulkTargetStatus={setBulkTargetStatus}
          bulkRespectWeekend={bulkRespectWeekend}
          setBulkRespectWeekend={setBulkRespectWeekend}
          isPopulating={isPopulating}
          setIsBulkModalOpen={setIsBulkModalOpen}
          handleAutoPopulate={handleAutoPopulate}
          handleClearAttendance={handleClearAttendance}
          handleExecuteBulkAction={handleExecuteBulkAction}
        />
      )}

      {/* ============================================================ */}
      {/* DÖNEM KİLİTLEME / KİLİT AÇMA ONAY MODALI                     */}
      {/* ============================================================ */}
      {isLockModalOpen && (
        <LockPeriodModal
          isLocked={isLocked}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          periodLock={periodLock}
          lockOperatorName={lockOperatorName}
          setLockOperatorName={setLockOperatorName}
          lockNotes={lockNotes}
          setLockNotes={setLockNotes}
          isLocking={isLocking}
          setIsLockModalOpen={setIsLockModalOpen}
          handleToggleLock={handleToggleLock}
        />
      )}

      {/* ============================================================ */}
      {/* TEK HÜCRE DÜZENLEME MODAL                                   */}
      {/* ============================================================ */}
      {activeCell && (
        <CellEditorModal
          activeCell={activeCell}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          editStatus={editStatus}
          setEditStatus={setEditStatus}
          editOvertime={editOvertime}
          setEditOvertime={setEditOvertime}
          saveCellError={saveCellError}
          isSavingCell={isSavingCell}
          setActiveCell={setActiveCell}
          handleSaveCell={handleSaveCell}
        />
      )}
    </div>
  );
}
