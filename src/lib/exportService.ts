/**
 * Universal Export Service for DMR Nexus
 * Supports CSV and rich styled Microsoft Excel (.xls) spreadsheets with UTF-8 BOM.
 */

import type { Employee, AttendanceRecord, AttendanceStatus, PayrollRecord } from '../types';

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

const DAY_ABBRS = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];

const STATUS_MAP: Record<AttendanceStatus, { code: string; label: string; bg: string; text: string }> = {
  present: { code: 'N', label: 'Normal Çalışma', bg: '#ecfdf5', text: '#065f46' },
  weekly_rest: { code: 'H', label: 'Hafta Tatili', bg: '#f1f5f9', text: '#475569' },
  absent: { code: 'D', label: 'Devamsız', bg: '#fff1f2', text: '#9f1239' },
  paid_leave: { code: 'İ', label: 'Ücretli İzin', bg: '#f0f9ff', text: '#0369a1' },
  unpaid_leave: { code: 'Ü', label: 'Ücretsiz İzin', bg: '#fffbeb', text: '#92400e' },
  sick_leave: { code: 'S', label: 'Sağlık Raporu', bg: '#faf5ff', text: '#6b21a8' },
  public_holiday: { code: 'R', label: 'Resmi Tatil', bg: '#eef2ff', text: '#3730a3' },
  half_day: { code: 'Y', label: 'Yarım Gün', bg: '#f0fdfa', text: '#115e59' }
};

/**
 * Export tabular data to CSV with UTF-8 BOM for Microsoft Excel compatibility (Turkish characters)
 */
export function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (val: string | number | undefined | null) => {
    if (val === undefined || val === null) return '""';
    let str = String(val);
    // Security: Mitigate CSV Formula Injection (DDE attacks)
    if (/^[=+\-@\t\r]/.test(str) && isNaN(Number(str))) {
      str = `'${str}`;
    }
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerLine = headers.map(escapeCell).join(';');
  const dataLines = rows.map(r => r.map(escapeCell).join(';'));
  const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export full monthly attendance matrix to styled Microsoft Excel (.xls) format
 */
export function exportAttendanceToExcel(
  month: number,
  year: number,
  employees: Employee[],
  records: AttendanceRecord[],
  options?: {
    filterTitle?: string;
    companyName?: string;
  }
) {
  const companyName = options?.companyName ? options.companyName.toUpperCase() : 'FİRMA';
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthName = MONTH_NAMES[month - 1] || `${month}. Ay`;

  // Build record lookup map: `${employeeId}_${date}` => AttendanceRecord
  const recordMap = new Map<string, AttendanceRecord>();
  records.forEach(r => {
    recordMap.set(`${r.employeeId}_${r.date}`, r);
  });

  // Calculate grand totals
  let grandTotalWorked = 0;
  let grandTotalRest = 0;
  let grandTotalPaidLeave = 0;
  let grandTotalUnpaidLeave = 0;
  let grandTotalSickLeave = 0;
  let grandTotalHoliday = 0;
  let grandTotalAbsent = 0;
  let grandTotalPaidDays = 0;
  let grandTotalOvertime = 0;

  // Build Employee Rows HTML
  const employeeRowsHtml = employees.map((emp, index) => {
    let workedCount = 0;
    let restCount = 0;
    let paidLeaveCount = 0;
    let unpaidLeaveCount = 0;
    let sickLeaveCount = 0;
    let holidayCount = 0;
    let halfDayCount = 0;
    let absentCount = 0;
    let empOvertime = 0;

    const daysCellsHtml = daysArray.map(day => {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const rec = recordMap.get(`${emp.id}_${dateStr}`);
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      const isSunday = dayOfWeek === 0;

      const status: AttendanceStatus = rec?.status || (isSunday ? 'weekly_rest' : 'present');
      const cfg = STATUS_MAP[status] || STATUS_MAP.present;
      const overtime = Number(rec?.overtimeHours) || 0;

      // Counters
      if (status === 'present') workedCount++;
      else if (status === 'half_day') { halfDayCount++; workedCount += 0.5; }
      else if (status === 'weekly_rest') restCount++;
      else if (status === 'paid_leave') paidLeaveCount++;
      else if (status === 'unpaid_leave') unpaidLeaveCount++;
      else if (status === 'sick_leave') sickLeaveCount++;
      else if (status === 'public_holiday') holidayCount++;
      else if (status === 'absent') absentCount++;

      empOvertime += overtime;

      const cellText = overtime > 0 ? `${cfg.code} (+${overtime}s)` : cfg.code;
      const cellBg = isSunday && status === 'weekly_rest' ? '#f8fafc' : cfg.bg;
      const cellColor = isSunday && status === 'weekly_rest' ? '#64748b' : cfg.text;

      return `
        <td style="text-align: center; background-color: ${cellBg}; color: ${cellColor}; font-weight: bold; border: 1px solid #cbd5e1; font-size: 11px; padding: 4px;">
          ${cellText}
        </td>
      `;
    }).join('');

    const paidDays = workedCount + restCount + paidLeaveCount + sickLeaveCount + holidayCount;

    grandTotalWorked += workedCount;
    grandTotalRest += restCount;
    grandTotalPaidLeave += paidLeaveCount;
    grandTotalUnpaidLeave += unpaidLeaveCount;
    grandTotalSickLeave += sickLeaveCount;
    grandTotalHoliday += holidayCount;
    grandTotalAbsent += absentCount;
    grandTotalPaidDays += paidDays;
    grandTotalOvertime += empOvertime;

    const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    const sgkBadge = emp.sgkStatus === 'sgk_li' ? 'SGK\'lı' : 'Yevmiyeli';

    return `
      <tr style="background-color: ${rowBg};">
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-weight: bold; color: #64748b;">${index + 1}</td>
        <td style="mso-number-format:'\\@'; text-align: left; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-weight: bold; font-family: monospace;">${emp.employeeCode || '-'}</td>
        <td style="mso-number-format:'\\@'; text-align: left; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace;">${emp.tcNo || '-'}</td>
        <td style="text-align: left; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-weight: bold; color: #0f172a;">${emp.name}</td>
        <td style="text-align: left; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; color: #334155;">${emp.department || '-'}</td>
        <td style="text-align: left; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; color: #334155;">${emp.position || '-'}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-weight: bold; color: ${emp.sgkStatus === 'sgk_li' ? '#047857' : '#b45309'};">${sgkBadge}</td>
        ${daysCellsHtml}
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-weight: bold; background-color: #ecfdf5; color: #047857;">${workedCount}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-weight: bold; background-color: #f1f5f9; color: #475569;">${restCount}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; color: #0369a1; background-color: #f0f9ff;">${paidLeaveCount > 0 ? paidLeaveCount : '-'}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; color: #b45309; background-color: #fffbeb;">${unpaidLeaveCount > 0 ? unpaidLeaveCount : '-'}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; color: #6b21a8; background-color: #faf5ff;">${sickLeaveCount > 0 ? sickLeaveCount : '-'}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; color: #9f1239; background-color: #fff1f2; font-weight: bold;">${absentCount > 0 ? absentCount : '-'}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-weight: 900; background-color: #e0e7ff; color: #3730a3;">${paidDays}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-weight: 900; background-color: #fef3c7; color: #92400e;">${empOvertime > 0 ? `${empOvertime} sa` : '-'}</td>
      </tr>
    `;
  }).join('');

  // Days Header Columns (Row 1: Days, Row 2: Weekday Names)
  const dayColHeaders1 = daysArray.map(day => {
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;
    const bg = isSunday ? '#fee2e2' : isSaturday ? '#f1f5f9' : '#e2e8f0';
    const color = isSunday ? '#991b1b' : '#334155';
    return `<th style="text-align: center; background-color: ${bg}; color: ${color}; border: 1px solid #94a3b8; font-size: 11px; font-weight: bold; width: 34px;">${day}</th>`;
  }).join('');

  const dayColHeaders2 = daysArray.map(day => {
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    const dayName = DAY_ABBRS[dayOfWeek];
    const isSunday = dayOfWeek === 0;
    const bg = isSunday ? '#fecaca' : '#e2e8f0';
    const color = isSunday ? '#b91c1c' : '#475569';
    return `<th style="text-align: center; background-color: ${bg}; color: ${color}; border: 1px solid #94a3b8; font-size: 9px; font-weight: bold;">${dayName}</th>`;
  }).join('');

  const totalCols = 7 + daysInMonth + 8;

  const excelHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Puantaj ${monthName} ${year}</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                  <x:FreezePanes/>
                  <x:FrozenNoSplit/>
                  <x:SplitHeaderRowCount>6</x:SplitHeaderRowCount>
                  <x:SplitLeftColumnCount>4</x:SplitLeftColumnCount>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: Calibri, Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #cbd5e1; }
        </style>
      </head>
      <body>
        <table>
          <!-- Title Banner -->
          <tr>
            <td colspan="${totalCols}" style="background-color: #1e1b4b; color: #ffffff; font-size: 16px; font-weight: 900; text-align: left; padding: 12px 10px;">
              ${options?.companyName ? options.companyName.toUpperCase() : 'FİRMA'} - AYLIK PERSONEL PUANTAJ VE DEVAM ÇİZELGESİ
            </td>
          </tr>
          <tr>
            <td colspan="${totalCols}" style="background-color: #312e81; color: #e0e7ff; font-size: 12px; font-weight: bold; text-align: left; padding: 6px 10px;">
              Dönem: <b>${monthName} ${year}</b> &nbsp;|&nbsp; Personel Sayısı: <b>${employees.length} Kişi</b> &nbsp;|&nbsp; Rapor Tarihi: ${new Date().toLocaleString('tr-TR')} ${options?.filterTitle ? ` &nbsp;|&nbsp; Kapsam: ${options.filterTitle}` : ''}
            </td>
          </tr>
          <tr style="height: 6px;"><td colspan="${totalCols}" style="border: none; background: #ffffff;"></td></tr>

          <!-- Main Table Headers -->
          <thead>
            <tr>
              <th rowspan="2" style="background-color: #0f172a; color: #ffffff; border: 1px solid #475569; font-size: 11px; padding: 6px; width: 35px; text-align: center;">No</th>
              <th rowspan="2" style="background-color: #0f172a; color: #ffffff; border: 1px solid #475569; font-size: 11px; padding: 6px; width: 90px; text-align: left;">Sicil Kodu</th>
              <th rowspan="2" style="background-color: #0f172a; color: #ffffff; border: 1px solid #475569; font-size: 11px; padding: 6px; width: 100px; text-align: left;">TC Kimlik No</th>
              <th rowspan="2" style="background-color: #0f172a; color: #ffffff; border: 1px solid #475569; font-size: 11px; padding: 6px; width: 160px; text-align: left;">Adı Soyadı</th>
              <th rowspan="2" style="background-color: #0f172a; color: #ffffff; border: 1px solid #475569; font-size: 11px; padding: 6px; width: 120px; text-align: left;">Departman</th>
              <th rowspan="2" style="background-color: #0f172a; color: #ffffff; border: 1px solid #475569; font-size: 11px; padding: 6px; width: 110px; text-align: left;">Görevi / Ünvanı</th>
              <th rowspan="2" style="background-color: #0f172a; color: #ffffff; border: 1px solid #475569; font-size: 11px; padding: 6px; width: 85px; text-align: center;">SGK Statüsü</th>
              ${dayColHeaders1}
              <th rowspan="2" style="background-color: #065f46; color: #ffffff; border: 1px solid #047857; font-size: 10px; padding: 6px; text-align: center; width: 50px;">Fiili Çalışma (N)</th>
              <th rowspan="2" style="background-color: #334155; color: #ffffff; border: 1px solid #475569; font-size: 10px; padding: 6px; text-align: center; width: 45px;">Hafta Tatili (H)</th>
              <th rowspan="2" style="background-color: #075985; color: #ffffff; border: 1px solid #0284c7; font-size: 10px; padding: 6px; text-align: center; width: 45px;">Ücretli İzin (İ)</th>
              <th rowspan="2" style="background-color: #92400e; color: #ffffff; border: 1px solid #b45309; font-size: 10px; padding: 6px; text-align: center; width: 45px;">Ücretsiz İzin (Ü)</th>
              <th rowspan="2" style="background-color: #581c87; color: #ffffff; border: 1px solid #7e22ce; font-size: 10px; padding: 6px; text-align: center; width: 45px;">Rapor (S)</th>
              <th rowspan="2" style="background-color: #881337; color: #ffffff; border: 1px solid #be123c; font-size: 10px; padding: 6px; text-align: center; width: 45px;">Devamsız (D)</th>
              <th rowspan="2" style="background-color: #312e81; color: #ffffff; border: 1px solid #4338ca; font-size: 10px; padding: 6px; text-align: center; width: 55px;">Toplam Prim Günü</th>
              <th rowspan="2" style="background-color: #78350f; color: #ffffff; border: 1px solid #92400e; font-size: 10px; padding: 6px; text-align: center; width: 55px;">Fazla Mesai (Saat)</th>
            </tr>
            <tr>
              ${dayColHeaders2}
            </tr>
          </thead>

          <!-- Employee Attendance Rows -->
          <tbody>
            ${employeeRowsHtml}
          </tbody>

          <!-- Grand Summary Footer -->
          <tfoot>
            <tr style="background-color: #e2e8f0; font-weight: 900; color: #0f172a; border-top: 2px solid #0f172a;">
              <td colspan="7" style="text-align: right; padding: 8px; font-size: 11px; border: 1px solid #94a3b8;">GENEL TOPLAM (${employees.length} ÇALIŞAN):</td>
              <td colspan="${daysInMonth}" style="text-align: center; font-size: 10px; border: 1px solid #94a3b8; color: #64748b;">Dönem İçi Toplamlar ➔</td>
              <td style="text-align: center; padding: 8px; font-size: 11px; border: 1px solid #94a3b8; background-color: #d1fae5; color: #065f46;">${grandTotalWorked}</td>
              <td style="text-align: center; padding: 8px; font-size: 11px; border: 1px solid #94a3b8; background-color: #e2e8f0; color: #334155;">${grandTotalRest}</td>
              <td style="text-align: center; padding: 8px; font-size: 11px; border: 1px solid #94a3b8; background-color: #e0f2fe; color: #0369a1;">${grandTotalPaidLeave}</td>
              <td style="text-align: center; padding: 8px; font-size: 11px; border: 1px solid #94a3b8; background-color: #fef3c7; color: #92400e;">${grandTotalUnpaidLeave}</td>
              <td style="text-align: center; padding: 8px; font-size: 11px; border: 1px solid #94a3b8; background-color: #f3e8ff; color: #6b21a8;">${grandTotalSickLeave}</td>
              <td style="text-align: center; padding: 8px; font-size: 11px; border: 1px solid #94a3b8; background-color: #ffe4e6; color: #9f1239;">${grandTotalAbsent}</td>
              <td style="text-align: center; padding: 8px; font-size: 11px; border: 1px solid #94a3b8; background-color: #c7d2fe; color: #312e81;">${grandTotalPaidDays}</td>
              <td style="text-align: center; padding: 8px; font-size: 11px; border: 1px solid #94a3b8; background-color: #fde68a; color: #78350f;">${grandTotalOvertime} sa</td>
            </tr>
          </tfoot>
        </table>

        <br/>
        <!-- Açıklama / Legend Tablosu -->
        <table style="width: 700px; border-collapse: collapse; margin-top: 15px;">
          <tr>
            <th colspan="4" style="background-color: #f1f5f9; color: #1e293b; font-size: 11px; font-weight: bold; text-align: left; padding: 6px; border: 1px solid #cbd5e1;">
              PUANTAJ VE ÇALIŞMA KODLARI LEJANTI (AÇIKLAMA)
            </th>
          </tr>
          <tr>
            <td style="background-color: #ecfdf5; color: #065f46; font-weight: bold; padding: 4px 8px; font-size: 10px; border: 1px solid #cbd5e1; width: 40px; text-align: center;">N</td>
            <td style="font-size: 10px; padding: 4px 8px; border: 1px solid #cbd5e1;">Normal Fiili Çalışma (Tam Gün / 8 Saat)</td>
            <td style="background-color: #f1f5f9; color: #475569; font-weight: bold; padding: 4px 8px; font-size: 10px; border: 1px solid #cbd5e1; width: 40px; text-align: center;">H</td>
            <td style="font-size: 10px; padding: 4px 8px; border: 1px solid #cbd5e1;">Hafta Tatili (Pazar)</td>
          </tr>
          <tr>
            <td style="background-color: #fff1f2; color: #9f1239; font-weight: bold; padding: 4px 8px; font-size: 10px; border: 1px solid #cbd5e1; width: 40px; text-align: center;">D</td>
            <td style="font-size: 10px; padding: 4px 8px; border: 1px solid #cbd5e1;">Devamsız (İzinsiz / Mazeretsiz)</td>
            <td style="background-color: #f0f9ff; color: #0369a1; font-weight: bold; padding: 4px 8px; font-size: 10px; border: 1px solid #cbd5e1; width: 40px; text-align: center;">İ</td>
            <td style="font-size: 10px; padding: 4px 8px; border: 1px solid #cbd5e1;">Yıllık / Ücretli Mazeret İzni</td>
          </tr>
          <tr>
            <td style="background-color: #fffbeb; color: #92400e; font-weight: bold; padding: 4px 8px; font-size: 10px; border: 1px solid #cbd5e1; width: 40px; text-align: center;">Ü</td>
            <td style="font-size: 10px; padding: 4px 8px; border: 1px solid #cbd5e1;">Ücretsiz İzin</td>
            <td style="background-color: #faf5ff; color: #6b21a8; font-weight: bold; padding: 4px 8px; font-size: 10px; border: 1px solid #cbd5e1; width: 40px; text-align: center;">S</td>
            <td style="font-size: 10px; padding: 4px 8px; border: 1px solid #cbd5e1;">Sağlık Raporu / İstirahat</td>
          </tr>
          <tr>
            <td style="background-color: #eef2ff; color: #3730a3; font-weight: bold; padding: 4px 8px; font-size: 10px; border: 1px solid #cbd5e1; width: 40px; text-align: center;">R</td>
            <td style="font-size: 10px; padding: 4px 8px; border: 1px solid #cbd5e1;">Resmi / Dini Tatil</td>
            <td style="background-color: #f0fdfa; color: #115e59; font-weight: bold; padding: 4px 8px; font-size: 10px; border: 1px solid #cbd5e1; width: 40px; text-align: center;">Y</td>
            <td style="font-size: 10px; padding: 4px 8px; border: 1px solid #cbd5e1;">Yarım Gün Çalışma (4 Saat)</td>
          </tr>
          <tr>
            <td style="background-color: #fef3c7; color: #92400e; font-weight: bold; padding: 4px 8px; font-size: 10px; border: 1px solid #cbd5e1; text-align: center;">+Xh</td>
            <td colspan="3" style="font-size: 10px; padding: 4px 8px; border: 1px solid #cbd5e1;">Fazla Mesai Saati (Örn: +2s = 2 saat fazla mesai yapıldı)</td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob(['\uFEFF' + excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const filename = `Puantaj_Cizelgesi_${monthName}_${year}.xls`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export attendance matrix to CSV
 */
export function exportAttendanceToCsv(
  month: number,
  year: number,
  employees: Employee[],
  records: AttendanceRecord[]
) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthName = MONTH_NAMES[month - 1] || `${month}. Ay`;

  const recordMap = new Map<string, AttendanceRecord>();
  records.forEach(r => {
    recordMap.set(`${r.employeeId}_${r.date}`, r);
  });

  const headers = [
    'Sıra No',
    'Sicil Kodu',
    'TC Kimlik No',
    'Personel Adı',
    'Departman',
    'Görevi',
    'SGK Statüsü',
    ...daysArray.map(d => `${d}.${month}.${year}`),
    'Fiili Gün (N)',
    'Hafta Tatili (H)',
    'Ücretli İzin (İ)',
    'Ücretsiz İzin (Ü)',
    'Raporlu Gün (S)',
    'Devamsız Gün (D)',
    'Toplam Prim Günü',
    'Fazla Mesai (Saat)'
  ];

  const rows = employees.map((emp, index) => {
    let workedCount = 0;
    let restCount = 0;
    let paidLeaveCount = 0;
    let unpaidLeaveCount = 0;
    let sickLeaveCount = 0;
    let holidayCount = 0;
    let halfDayCount = 0;
    let absentCount = 0;
    let empOvertime = 0;

    const dayCols = daysArray.map(day => {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const rec = recordMap.get(`${emp.id}_${dateStr}`);
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      const isSunday = dayOfWeek === 0;

      const status: AttendanceStatus = rec?.status || (isSunday ? 'weekly_rest' : 'present');
      const cfg = STATUS_MAP[status] || STATUS_MAP.present;
      const overtime = Number(rec?.overtimeHours) || 0;

      if (status === 'present') workedCount++;
      else if (status === 'half_day') { halfDayCount++; workedCount += 0.5; }
      else if (status === 'weekly_rest') restCount++;
      else if (status === 'paid_leave') paidLeaveCount++;
      else if (status === 'unpaid_leave') unpaidLeaveCount++;
      else if (status === 'sick_leave') sickLeaveCount++;
      else if (status === 'public_holiday') holidayCount++;
      else if (status === 'absent') absentCount++;

      empOvertime += overtime;

      return overtime > 0 ? `${cfg.code} (+${overtime}s)` : cfg.code;
    });

    const paidDays = workedCount + restCount + paidLeaveCount + sickLeaveCount + holidayCount;

    return [
      index + 1,
      emp.employeeCode || '',
      emp.tcNo || '',
      emp.name,
      emp.department || '',
      emp.position || '',
      emp.sgkStatus === 'sgk_li' ? 'SGK\'lı' : 'Yevmiyeli',
      ...dayCols,
      workedCount,
      restCount,
      paidLeaveCount,
      unpaidLeaveCount,
      sickLeaveCount,
      absentCount,
      paidDays,
      empOvertime
    ];
  });

  exportToCsv(`Puantaj_Cizelgesi_${monthName}_${year}.csv`, headers, rows);
}

/**
 * Export Monthly Payroll Records to styled Microsoft Excel (.xls) format
 */
export function exportPayrollToExcel(
  month: number,
  year: number,
  payrolls: PayrollRecord[],
  employees: Employee[],
  options?: {
    filterTitle?: string;
    companyName?: string;
  }
) {
  const monthName = MONTH_NAMES[month - 1] || `${month}. Ay`;
  const companyName = options?.companyName || 'DMR Nexus';
  const filterTitle = options?.filterTitle || 'Tüm Personeller (SGK\'lı & Yevmiyeli)';
  const exportDateStr = new Date().toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Calculate aggregates
  const totalEmployees = payrolls.length;
  const sgkLiCount = payrolls.filter(p => p.sgkStatus === 'sgk_li').length;
  const sgkSizCount = payrolls.filter(p => p.sgkStatus === 'sgk_siz').length;

  const totalBasePay = payrolls.reduce((sum, p) => sum + (p.basePay || 0), 0);
  const totalOvertimePay = payrolls.reduce((sum, p) => sum + (p.overtimePay || 0), 0);
  const totalBonusPay = payrolls.reduce((sum, p) => sum + (p.bonusPay || 0), 0);
  const totalGrossPay = payrolls.reduce((sum, p) => sum + (p.totalGrossPay || 0), 0);

  const totalEmployeeSgk = payrolls.reduce((sum, p) => sum + (p.employeeSgkShare || 0), 0);
  const totalEmployeeUnemp = payrolls.reduce((sum, p) => sum + (p.employeeUnemploymentShare || 0), 0);
  const totalIncomeTax = payrolls.reduce((sum, p) => sum + (p.incomeTax || 0), 0);
  const totalStampTax = payrolls.reduce((sum, p) => sum + (p.stampTax || 0), 0);
  const totalLegalDeductions = payrolls.reduce((sum, p) => sum + (p.totalLegalDeductions || 0), 0);

  const totalAdvanceDeductions = payrolls.reduce((sum, p) => sum + (p.advanceDeduction || 0), 0);
  const totalOtherDeductions = payrolls.reduce((sum, p) => sum + (p.otherDeductions || 0), 0);
  const totalNetSalary = payrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0);

  const totalEmployerSgk = payrolls.reduce((sum, p) => sum + (p.employerSgkShare || 0), 0);
  const totalEmployerUnemp = payrolls.reduce((sum, p) => sum + (p.employerUnemploymentShare || 0), 0);
  const totalEmployerCost = payrolls.reduce((sum, p) => sum + (p.totalEmployerCost || 0), 0);

  const totalDaysWorked = payrolls.reduce((sum, p) => sum + (p.daysWorked || 0), 0);
  const totalOvertimeHours = payrolls.reduce((sum, p) => sum + (p.overtimeHours || 0), 0);

  // Rows HTML
  const rowsHtml = payrolls.map((rec, index) => {
    const emp = employees.find(e => e.id === rec.employeeId);
    const rowBg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    const isSgk = rec.sgkStatus === 'sgk_li';
    const sgkBadge = isSgk ? 'SGK\'lı' : 'Yevmiyeli';
    const sgkColor = isSgk ? '#047857' : '#b45309';

    const salaryTypeLabel = 
      rec.salaryType === 'monthly_net' ? 'Aylık Net' :
      rec.salaryType === 'monthly_gross' ? 'Aylık Brüt' :
      rec.salaryType === 'daily' ? 'Günlük Yevmiye' : 'Saatlik';

    const paymentStatusLabel = rec.paymentStatus === 'paid' ? 'ÖDENDİ' : 'BEKLİYOR';
    const paymentStatusColor = rec.paymentStatus === 'paid' ? '#047857' : '#dc2626';

    const accountStatusLabel = rec.isAccounted ? 'FİŞ KESİLDİ' : 'BEKLİYOR';
    const accountStatusColor = rec.isAccounted ? '#047857' : '#64748b';

    return `
      <tr style="background-color: ${rowBg};">
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-weight: bold; color: #64748b;">${index + 1}</td>
        <td style="mso-number-format:'\\@'; text-align: left; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-weight: bold; font-family: monospace;">${rec.employeeCode || '-'}</td>
        <td style="mso-number-format:'\\@'; text-align: left; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace;">${emp?.tcNo || '-'}</td>
        <td style="text-align: left; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-weight: bold; color: #0f172a;">${rec.employeeName}</td>
        <td style="text-align: left; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; color: #334155;">${rec.department || '-'}</td>
        <td style="text-align: left; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; color: #334155;">${emp?.position || '-'}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-weight: bold; color: ${sgkColor};">${sgkBadge}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 10px; padding: 6px; color: #64748b;">${salaryTypeLabel}</td>
        
        <td style="mso-number-format:'0'; text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-weight: bold; color: #047857; background-color: #ecfdf5;">${rec.daysWorked || 0}</td>
        <td style="mso-number-format:'0'; text-align: center; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; color: #d97706; background-color: #fffbeb;">${rec.overtimeHours > 0 ? rec.overtimeHours : 0}</td>
        
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace;">${rec.basePay.toFixed(2)}</td>
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace; color: #4338ca;">${rec.overtimePay > 0 ? rec.overtimePay.toFixed(2) : '0.00'}</td>
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace; color: #0891b2;">${rec.bonusPay > 0 ? rec.bonusPay.toFixed(2) : '0.00'}</td>
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace; font-weight: bold; background-color: #f1f5f9; color: #0f172a;">${rec.totalGrossPay.toFixed(2)}</td>
        
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace; color: #be123c;">${rec.employeeSgkShare > 0 ? rec.employeeSgkShare.toFixed(2) : '0.00'}</td>
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace; color: #be123c;">${rec.employeeUnemploymentShare > 0 ? rec.employeeUnemploymentShare.toFixed(2) : '0.00'}</td>
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace; color: #be123c;">${rec.incomeTax > 0 ? rec.incomeTax.toFixed(2) : '0.00'}</td>
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace; color: #be123c;">${rec.stampTax > 0 ? rec.stampTax.toFixed(2) : '0.00'}</td>
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace; font-weight: bold; color: #9f1239; background-color: #fff1f2;">${rec.totalLegalDeductions > 0 ? rec.totalLegalDeductions.toFixed(2) : '0.00'}</td>
        
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace; color: #c2410c; background-color: #fff7ed;">${rec.advanceDeduction > 0 ? rec.advanceDeduction.toFixed(2) : '0.00'}</td>
        
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace; font-weight: 900; background-color: #e0e7ff; color: #312e81;">${rec.netSalary.toFixed(2)}</td>
        
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace; color: #047857;">${rec.employerSgkShare > 0 ? rec.employerSgkShare.toFixed(2) : '0.00'}</td>
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace; color: #047857;">${rec.employerUnemploymentShare > 0 ? rec.employerUnemploymentShare.toFixed(2) : '0.00'}</td>
        <td style="mso-number-format:'#,##0.00'; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; font-family: monospace; font-weight: 900; background-color: #ecfdf5; color: #065f46;">${rec.totalEmployerCost.toFixed(2)}</td>
        
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 10px; padding: 6px; font-weight: bold; color: ${paymentStatusColor};">${paymentStatusLabel}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; font-size: 10px; padding: 6px; font-weight: bold; color: ${accountStatusColor};">${accountStatusLabel}</td>
      </tr>
    `;
  }).join('');

  const excelHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" 
          xmlns:x="urn:schemas-microsoft-com:office:excel" 
          xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Bordro İcmali - ${monthName} ${year}</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                  <x:FitToPage/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: Arial, sans-serif; }
          table { border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; }
          .num-currency { mso-number-format:'\\#\\,\\#\\#0\\.00'; text-align: right; font-family: monospace; }
          .num-int { mso-number-format:'0'; text-align: center; }
          .text-code { mso-number-format:'\\@'; }
        </style>
      </head>
      <body>
        <!-- Header Information -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
          <tr>
            <td colspan="26" style="font-size: 16px; font-weight: 900; color: #1e1b4b; background-color: #e0e7ff; padding: 12px; border: 1px solid #c7d2fe; text-align: left;">
              ${companyName} &mdash; AYLIK PERSONEL BORDRO VE HAKEDİŞ İCMALİ
            </td>
          </tr>
          <tr>
            <td colspan="26" style="font-size: 12px; color: #334155; padding: 8px; background-color: #f8fafc; border: 1px solid #e2e8f0;">
              <b>Bordro Dönemi:</b> ${monthName} ${year} &nbsp;|&nbsp; 
              <b>Kapsam:</b> ${filterTitle} &nbsp;|&nbsp; 
              <b>Oluşturulma Tarihi:</b> ${exportDateStr} &nbsp;|&nbsp; 
              <b>Personel Sayısı:</b> ${totalEmployees} (SGK'lı: ${sgkLiCount}, Yevmiyeli: ${sgkSizCount})
            </td>
          </tr>
        </table>

        <!-- Summary KPIs Table -->
        <table style="border-collapse: collapse; margin-bottom: 20px;">
          <tr style="background-color: #0f172a; color: #ffffff; font-weight: bold; font-size: 11px;">
            <th style="padding: 8px 12px; border: 1px solid #334155; text-align: left;">ÖZET GÖSTERGE</th>
            <th style="padding: 8px 12px; border: 1px solid #334155; text-align: right;">TUTAR (TL)</th>
            <th style="padding: 8px 12px; border: 1px solid #334155; text-align: left;">AÇIKLAMA</th>
          </tr>
          <tr style="background-color: #f8fafc; font-size: 11px;">
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1; font-weight: bold;">Toplam Brüt Hakediş / Kazanç</td>
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: bold; mso-number-format:'#,##0.00';">₺${totalGrossPay.toFixed(2)}</td>
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1; color: #64748b;">Tüm personelin taban kazanç + mesai + prim toplamı</td>
          </tr>
          <tr style="background-color: #ffffff; font-size: 11px;">
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1; font-weight: bold; color: #be123c;">Toplam Yasal Kesintiler (SGK + Vergi)</td>
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: bold; color: #be123c; mso-number-format:'#,##0.00';">-₺${totalLegalDeductions.toFixed(2)}</td>
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1; color: #64748b;">SGK İşçi (%14) + İşsizlik (%1) + Gelir V. + Damga V.</td>
          </tr>
          <tr style="background-color: #f8fafc; font-size: 11px;">
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1; font-weight: bold; color: #c2410c;">Toplam Mahsup Edilen Avanslar</td>
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1; text-align: right; font-family: monospace; font-weight: bold; color: #c2410c; mso-number-format:'#,##0.00';">-₺${totalAdvanceDeductions.toFixed(2)}</td>
            <td style="padding: 6px 12px; border: 1px solid #cbd5e1; color: #64748b;">Dönem içi personele nakit ödenmiş avans kesintileri</td>
          </tr>
          <tr style="background-color: #e0e7ff; font-size: 12px; font-weight: 900; color: #312e81;">
            <td style="padding: 8px 12px; border: 1px solid #c7d2fe;">TOPLAM PERSONELE ÖDENECEK NET MAAŞ</td>
            <td style="padding: 8px 12px; border: 1px solid #c7d2fe; text-align: right; font-family: monospace; font-size: 13px; mso-number-format:'#,##0.00';">₺${totalNetSalary.toFixed(2)}</td>
            <td style="padding: 8px 12px; border: 1px solid #c7d2fe;">Banka veya nakit elden personele net tediye edilecek tutar</td>
          </tr>
          <tr style="background-color: #ecfdf5; font-size: 12px; font-weight: 900; color: #065f46;">
            <td style="padding: 8px 12px; border: 1px solid #a7f3d0;">TOPLAM ŞİRKET İŞVEREN MALİYETİ</td>
            <td style="padding: 8px 12px; border: 1px solid #a7f3d0; text-align: right; font-family: monospace; font-size: 13px; mso-number-format:'#,##0.00';">₺${totalEmployerCost.toFixed(2)}</td>
            <td style="padding: 8px 12px; border: 1px solid #a7f3d0;">Brüt Ücret + SGK İşveren (%15.5) + İşveren İşsizlik (%2)</td>
          </tr>
        </table>

        <!-- Main Detailed Table -->
        <table style="border-collapse: collapse; width: 100%;">
          <thead>
            <!-- Group Header -->
            <tr style="font-size: 11px; font-weight: bold; text-align: center; color: #ffffff;">
              <th colspan="8" style="background-color: #1e293b; padding: 6px; border: 1px solid #334155;">PERSONEL BİLGİLERİ</th>
              <th colspan="2" style="background-color: #0f766e; padding: 6px; border: 1px solid #115e59;">PUANTAJ</th>
              <th colspan="4" style="background-color: #1e40af; padding: 6px; border: 1px solid #1e3a8a;">KAZANÇLAR (TL)</th>
              <th colspan="5" style="background-color: #9f1239; padding: 6px; border: 1px solid #881337;">YASAL KESİNTİLER (TL)</th>
              <th colspan="1" style="background-color: #c2410c; padding: 6px; border: 1px solid #9a3412;">AVANS</th>
              <th colspan="1" style="background-color: #312e81; padding: 6px; border: 1px solid #1e1b4b;">NET ÖDENECEK</th>
              <th colspan="3" style="background-color: #065f46; padding: 6px; border: 1px solid #064e3b;">İŞVEREN MALİYETİ (TL)</th>
              <th colspan="2" style="background-color: #475569; padding: 6px; border: 1px solid #334155;">DURUM</th>
            </tr>
            <!-- Column Names -->
            <tr style="background-color: #334155; color: #ffffff; font-size: 11px; font-weight: bold; text-align: center;">
              <th style="padding: 8px; border: 1px solid #475569; width: 35px;">No</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 75px;">Kod</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 95px;">T.C. No</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 150px; text-align: left;">Adı Soyadı</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 110px; text-align: left;">Departman</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 110px; text-align: left;">Görev</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 75px;">SGK</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 85px;">Ücret Tipi</th>
              
              <th style="padding: 8px; border: 1px solid #475569; width: 55px; background-color: #115e59;">Çal. Gün</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 55px; background-color: #115e59;">Mesai (Sa)</th>
              
              <th style="padding: 8px; border: 1px solid #475569; width: 80px; background-color: #2563eb;">Taban Ücret</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 75px; background-color: #2563eb;">Mesai Tutarı</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 70px; background-color: #2563eb;">Prim/Ek</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 85px; background-color: #1d4ed8; font-weight: 900;">Toplam Brüt</th>
              
              <th style="padding: 8px; border: 1px solid #475569; width: 75px; background-color: #be123c;">SGK İşçi</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 65px; background-color: #be123c;">İşsizlik İşçi</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 75px; background-color: #be123c;">Gelir Vergisi</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 65px; background-color: #be123c;">Damga V.</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 85px; background-color: #9f1239; font-weight: 900;">Yasal Kesinti</th>
              
              <th style="padding: 8px; border: 1px solid #475569; width: 80px; background-color: #ea580c;">Avans Kes.</th>
              
              <th style="padding: 8px; border: 1px solid #475569; width: 95px; background-color: #3730a3; font-weight: 900;">Net Maaş</th>
              
              <th style="padding: 8px; border: 1px solid #475569; width: 75px; background-color: #047857;">SGK İşveren</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 65px; background-color: #047857;">İşv. İşsizlik</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 95px; background-color: #065f46; font-weight: 900;">İşveren Maliyet</th>
              
              <th style="padding: 8px; border: 1px solid #475569; width: 70px;">Ödeme</th>
              <th style="padding: 8px; border: 1px solid #475569; width: 75px;">Muhasebe</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr style="background-color: #0f172a; color: #ffffff; font-weight: 900; font-size: 11px; border-top: 3px double #cbd5e1;">
              <td colspan="8" style="text-align: right; padding: 10px; border: 1px solid #334155; font-size: 12px; letter-spacing: 0.5px;">
                GENEL TOPLAMLAR (${totalEmployees} Personel):
              </td>
              <td style="mso-number-format:'0'; text-align: center; padding: 10px; border: 1px solid #334155; color: #6ee7b7; background-color: #064e3b;">${totalDaysWorked}</td>
              <td style="mso-number-format:'0'; text-align: center; padding: 10px; border: 1px solid #334155; color: #fde68a; background-color: #78350f;">${totalOvertimeHours}</td>
              
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace;">${totalBasePay.toFixed(2)}</td>
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace;">${totalOvertimePay.toFixed(2)}</td>
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace;">${totalBonusPay.toFixed(2)}</td>
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace; font-size: 12px; background-color: #1e3a8a; color: #93c5fd;">${totalGrossPay.toFixed(2)}</td>
              
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace;">${totalEmployeeSgk.toFixed(2)}</td>
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace;">${totalEmployeeUnemp.toFixed(2)}</td>
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace;">${totalIncomeTax.toFixed(2)}</td>
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace;">${totalStampTax.toFixed(2)}</td>
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace; font-size: 12px; background-color: #881337; color: #fecdd3;">${totalLegalDeductions.toFixed(2)}</td>
              
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace; color: #fed7aa; background-color: #7c2d12;">${totalAdvanceDeductions.toFixed(2)}</td>
              
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace; font-size: 13px; background-color: #312e81; color: #a5b4fc;">${totalNetSalary.toFixed(2)}</td>
              
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace;">${totalEmployerSgk.toFixed(2)}</td>
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace;">${totalEmployerUnemp.toFixed(2)}</td>
              <td style="mso-number-format:'#,##0.00'; text-align: right; padding: 10px; border: 1px solid #334155; font-family: monospace; font-size: 13px; background-color: #064e3b; color: #6ee7b7;">${totalEmployerCost.toFixed(2)}</td>
              
              <td colspan="2" style="border: 1px solid #334155;"></td>
            </tr>
          </tfoot>
        </table>
      </body>
    </html>
  `;

  const filename = `Bordro_Icmali_${monthName}_${year}.xls`;
  const blob = new Blob(['\uFEFF' + excelHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export Monthly Payroll Records to CSV format
 */
export function exportPayrollToCsv(
  month: number,
  year: number,
  payrolls: PayrollRecord[],
  employees: Employee[]
) {
  const monthName = MONTH_NAMES[month - 1] || `${month}. Ay`;

  const headers = [
    'Sıra No',
    'Personel Kodu',
    'T.C. Kimlik No',
    'Personel Adı Soyadı',
    'Departman',
    'Görev / Pozisyon',
    'SGK Statüsü',
    'Ücret Tipi',
    'Çalışılan Gün',
    'Fazla Mesai Saati',
    'Taban Ücret (TL)',
    'Fazla Mesai Tutarı (TL)',
    'Prim/Ek Kazanç (TL)',
    'Toplam Brüt Kazanç (TL)',
    'SGK İşçi Payı (TL)',
    'İşsizlik İşçi Payı (TL)',
    'Gelir Vergisi (TL)',
    'Damga Vergisi (TL)',
    'Toplam Yasal Kesinti (TL)',
    'Avans Kesintisi (TL)',
    'Diğer Kesintiler (TL)',
    'Net Ödenecek Maaş (TL)',
    'SGK İşveren Payı (TL)',
    'İşveren İşsizlik Payı (TL)',
    'Toplam İşveren Maliyeti (TL)',
    'Ödeme Durumu',
    'Muhasebe Durumu'
  ];

  const rows = payrolls.map((rec, index) => {
    const emp = employees.find(e => e.id === rec.employeeId);
    const isSgk = rec.sgkStatus === 'sgk_li';

    return [
      index + 1,
      rec.employeeCode || '',
      emp?.tcNo || '',
      rec.employeeName,
      rec.department || '',
      emp?.position || '',
      isSgk ? 'SGK\'lı' : 'Yevmiyeli',
      rec.salaryType,
      rec.daysWorked,
      rec.overtimeHours,
      rec.basePay.toFixed(2),
      rec.overtimePay.toFixed(2),
      rec.bonusPay.toFixed(2),
      rec.totalGrossPay.toFixed(2),
      rec.employeeSgkShare.toFixed(2),
      rec.employeeUnemploymentShare.toFixed(2),
      rec.incomeTax.toFixed(2),
      rec.stampTax.toFixed(2),
      rec.totalLegalDeductions.toFixed(2),
      rec.advanceDeduction.toFixed(2),
      (rec.otherDeductions || 0).toFixed(2),
      rec.netSalary.toFixed(2),
      rec.employerSgkShare.toFixed(2),
      rec.employerUnemploymentShare.toFixed(2),
      rec.totalEmployerCost.toFixed(2),
      rec.paymentStatus === 'paid' ? 'Ödendi' : 'Bekliyor',
      rec.isAccounted ? 'Fiş Kesildi' : 'Fiş Bekliyor'
    ];
  });

  exportToCsv(`Bordro_Icmali_${monthName}_${year}.csv`, headers, rows);
}

