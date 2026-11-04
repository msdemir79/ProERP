/**
 * DMR Nexus Çekirdek İş Mantığı Birim Testleri
 * 
 * 1. Bordro & Vergi Matrahı Testleri (2026 Standartları, Kuruş Duyarlılığı)
 * 2. Yevmiye & TDHP Denge Testleri
 * 3. Stok & Maliyet Testleri
 */

import { 
  calculatePayroll2026, 
  HR_CONSTANTS_2026, 
  toKurus, 
  fromKurus, 
  calculateProgressiveIncomeTaxKurus 
} from '../lib/payrollCalculator';
import { 
  validateJournalLines, 
  assertBalancedJournalEntry, 
  UnbalancedJournalEntryError 
} from '../lib/accountingValidator';
import {
  calculateNewStock,
  isStockCritical,
  calculateWeightedAverageCost,
  calculateAvailableLotQuantity,
  distributeWithLargestRemainder
} from '../lib/inventoryCalculator';
import { buildMizanRows, compareAccountCodes, type MizanAccount, type MizanRow } from '../lib/accountCodes';
import { distributeAssortment, selectProductionRecipe } from '../lib/productionRules';
import { assertReceiptInput, assertInvoicePayment } from '../lib/financeRules';
import { minimumWageTaxExemptionKurus, grossForNet2026 } from '../lib/payrollCalculator';

let passedTests = 0;
let failedTests = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    HATA: ${err.message}`);
    failedTests++;
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Beklenen: ${expected}, Alınan: ${actual}`);
      }
    },
    toBeCloseTo(expected: number, delta: number = 0.05) {
      if (Math.abs(actual - expected) > delta) {
        throw new Error(`Beklenen: ~${expected} (±${delta}), Alınan: ${actual}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) {
        throw new Error(`Beklenen: > ${expected}, Alınan: ${actual}`);
      }
    }
  };
}

console.log('\n======================================================');
console.log(' DMR NEXUS BİRİM TESTLERİ ÇALIŞTIRILIYOR (UNIT TESTS)');
console.log('======================================================\n');

// -----------------------------------------------------------------
// 1. BORDRO & VERGİ MATRAHI TESTLERİ (2026 STANDARTLARI)
// -----------------------------------------------------------------
console.log('📌 1. BORDRO VE 2026 VERGİ MATRAHI TESTLERİ');

test('Kuruş dönüştürücüleri (toKurus & fromKurus) hassas çalışmalı', () => {
  expect(toKurus(1234.56)).toBe(123456);
  expect(fromKurus(123456)).toBe(1234.56);
  expect(toKurus(0.01)).toBe(1);
  expect(fromKurus(1)).toBe(0.01);
});

test('2026 Asgari ücretli SGK primi ve net maaş kuruş bazında hesaplanmalı', () => {
  const result = calculatePayroll2026({
    grossSalaryTL: HR_CONSTANTS_2026.MIN_WAGE_GROSS_TL,
    daysWorked: 26,
    weeklyRestDays: 4,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    absentDays: 0,
    overtimeHours: 0,
    sgkStatus: 'sgk_li',
    advanceDeductionTL: 0
  });

  // Brüt asgari ücret için işçi payı: %14 SGK + %1 İşsizlik = %15
  const expectedWorkerSgkAndUnemp = HR_CONSTANTS_2026.MIN_WAGE_GROSS_TL * 0.15;
  expect(result.employeeSgkShare + result.employeeUnemploymentShare).toBeCloseTo(expectedWorkerSgkAndUnemp, 0.05);

  // Asgari ücret istisnası ile net asgari ücret tam kuruş eşleşmeli
  expect(result.netSalary).toBeCloseTo(HR_CONSTANTS_2026.MIN_WAGE_NET_TL, 1.0);
  expect(result.totalGrossPayKurus).toBe(toKurus(HR_CONSTANTS_2026.MIN_WAGE_GROSS_TL));
});

test('Kümülatif vergi matrahı arttığında vergi dilimi %15\'ten %20\'ye geçmeli', () => {
  // İlk dilim tavanı: 158.000 TL (15.800.000 Kuruş)
  // 1. Durum: Matrah 50.000 TL (5.000.000 Kuruş), Aylık 20.000 TL (2.000.000 Kuruş) -> %15
  const tax1 = calculateProgressiveIncomeTaxKurus(5000000, 2000000);
  expect(tax1.effectiveRate).toBe(15);
  expect(tax1.taxKurus).toBe(300000); // 20.000 TL * 0.15 = 3.000 TL (300.000 Kuruş)

  // 2. Durum: Önceki kümülatif 150.000 TL, yeni matrah 20.000 TL -> 158.000 TL sınırını aşar
  // 8.000 TL'si %15'ten (1.200 TL = 120.000 Kuruş), kalan 12.000 TL'si %20'den (2.400 TL = 240.000 Kuruş)
  // Toplam: 360.000 Kuruş
  const tax2 = calculateProgressiveIncomeTaxKurus(18200000, 2000000);
  expect(tax2.taxKurus).toBe(360000);
  expect(tax2.effectiveRate).toBe(18); // 360.000 / 2.000.000 = %18 efektif oran
});

test('Avans kesintisi net ödemeden tam olarak düşmeli', () => {
  const resultWithAdvance = calculatePayroll2026({
    grossSalaryTL: 45000,
    daysWorked: 26,
    weeklyRestDays: 4,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    absentDays: 0,
    overtimeHours: 0,
    sgkStatus: 'sgk_li',
    advanceDeductionTL: 5000
  });

  const resultWithoutAdvance = calculatePayroll2026({
    grossSalaryTL: 45000,
    daysWorked: 26,
    weeklyRestDays: 4,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    absentDays: 0,
    overtimeHours: 0,
    sgkStatus: 'sgk_li',
    advanceDeductionTL: 0
  });

  expect(resultWithAdvance.netSalary).toBeCloseTo(resultWithoutAdvance.netSalary - 5000, 0.05);
  expect(resultWithAdvance.advanceDeduction).toBe(5000);
});

// -----------------------------------------------------------------
// 2. YEVMİYE VE TDHP DENGE TESTLERİ
// -----------------------------------------------------------------
console.log('\n📌 2. GENEL MUHASEBE YEVMİYE FİŞİ DENGE TESTLERİ');

test('Borç ve Alacak eşit olduğunda yevmiye geçerli sayılmalı', () => {
  const lines = [
    { accountCode: '100.01', debit: 15000, credit: 0 },
    { accountCode: '120.01', debit: 0, credit: 15000 }
  ];

  const validation = validateJournalLines(lines);
  expect(validation.isBalanced).toBe(true);
  expect(validation.difference).toBe(0);

  const assertion = assertBalancedJournalEntry(lines);
  expect(assertion.totalDebit).toBe(15000);
  expect(assertion.totalCredit).toBe(15000);
});

test('Borç ve Alacak dengesiz olduğunda UnbalancedJournalEntryError fırlatılmalı', () => {
  const lines = [
    { accountCode: '100.01', debit: 20000, credit: 0 },
    { accountCode: '120.01', debit: 0, credit: 18000 } // 2000 TL eksik alacak
  ];

  const validation = validateJournalLines(lines);
  expect(validation.isBalanced).toBe(false);
  expect(validation.difference).toBe(2000);

  let threwExpected = false;
  try {
    assertBalancedJournalEntry(lines);
  } catch (err: any) {
    if (err instanceof UnbalancedJournalEntryError) {
      threwExpected = true;
    }
  }

  if (!threwExpected) {
    throw new Error('Dengesiz yevmiye kaydında UnbalancedJournalEntryError fırlatılmadı!');
  }
});

test('Sıfır tutarlı veya boş fişler reddedilmeli', () => {
  let threwEmpty = false;
  try {
    assertBalancedJournalEntry([]);
  } catch {
    threwEmpty = true;
  }
  expect(threwEmpty).toBe(true);

  let threwZero = false;
  try {
    assertBalancedJournalEntry([
      { debit: 0, credit: 0 },
      { debit: 0, credit: 0 }
    ]);
  } catch {
    threwZero = true;
  }
  expect(threwZero).toBe(true);
});

// -----------------------------------------------------------------
// 3. STOK VE MALİYET HESAPLAMA TESTLERİ
// -----------------------------------------------------------------
console.log('\n📌 3. STOK HAREKETİ VE MALİYET TESTLERİ');

test('Stok girişi ve çıkışı doğru hesaplanmalı', () => {
  const stockAfterIn = calculateNewStock(100, 'in', 50);
  expect(stockAfterIn).toBe(150);

  const stockAfterOut = calculateNewStock(150, 'out', 30);
  expect(stockAfterOut).toBe(120);

  const stockAfterProdIn = calculateNewStock(120, 'production_in', 40);
  expect(stockAfterProdIn).toBe(160);
});

test('Yetersiz stokta negatif izin verilmediğinde hata fırlatmalı', () => {
  let threwInsufficient = false;
  try {
    calculateNewStock(20, 'out', 50, false);
  } catch (err: any) {
    if (err.message.includes('Yetersiz stok')) {
      threwInsufficient = true;
    }
  }
  expect(threwInsufficient).toBe(true);
});

test('Ağırlıklı Ortalama Maliyet (AOM) doğru hesaplanmalı', () => {
  // Mevcut: 100 adet @ 50 TL = 5.000 TL
  // Giren: 50 adet @ 80 TL = 4.000 TL
  // Toplam: 150 adet, 9.000 TL -> Yeni birim maliyet: 9.000 / 150 = 60 TL
  const newCost = calculateWeightedAverageCost(100, 50, 50, 80);
  expect(newCost).toBe(60);
});

test('Kritik stok seviyesi doğru tespit edilmeli', () => {
  expect(isStockCritical(10, 15)).toBe(true);  // 10 <= 15 -> Kritik
  expect(isStockCritical(15, 15)).toBe(true);  // 15 <= 15 -> Kritik
  expect(isStockCritical(20, 15)).toBe(false); // 20 > 15 -> Normal
});

test('Parti ve lot rezervasyonu hesaplaması doğru olmalı', () => {
  expect(calculateAvailableLotQuantity(500, 150)).toBe(350);
  expect(calculateAvailableLotQuantity(100, 120)).toBe(0); // Negatife düşmez, 0 döner
});

// -----------------------------------------------------------------
// 4. MİZAN (TRIAL BALANCE) SUNUCU TARAFI AGREGASYON EŞDEĞERLİĞİ
// -----------------------------------------------------------------
console.log('\n📌 4. MİZAN EŞDEĞERLİK TESTLERİ (buildMizanRows)');

/**
 * Eski istemci tarafı mizan algoritmasının birebir replikası: tüm yevmiye
 * satırları üzerinde döngüyle kesin kod + üst kodlara (ana/grup/sınıf) yayar.
 * Yeni buildMizanRows ise SQL GROUP BY'ı taklit eden KOD BAZLI ön-agregasyon alır.
 * İkisi aynı sonucu vermelidir (toplama birleşmeli).
 */
function legacyMizan(
  accounts: MizanAccount[],
  lines: { accountCode: string; debit: number; credit: number }[],
  options?: { onlyWithBalance?: boolean; levelFilter?: 'all' | 'class' | 'group' | 'main' | 'sub' },
): MizanRow[] {
  const uniqueMap = new Map<string, MizanAccount>();
  accounts.forEach((acc) => {
    const k = acc.code.trim();
    if (!uniqueMap.has(k)) uniqueMap.set(k, acc);
  });
  const uniqAccounts = Array.from(uniqueMap.values());
  const totalsMap = new Map<string, { totalDebit: number; totalCredit: number }>();
  lines.forEach((line) => {
    const code = line.accountCode;
    const d = Number(line.debit) || 0;
    const c = Number(line.credit) || 0;
    const cur = totalsMap.get(code) || { totalDebit: 0, totalCredit: 0 };
    cur.totalDebit += d; cur.totalCredit += c; totalsMap.set(code, cur);
    const mainCode = code.split('.')[0];
    if (mainCode && mainCode !== code) {
      const m = totalsMap.get(mainCode) || { totalDebit: 0, totalCredit: 0 };
      m.totalDebit += d; m.totalCredit += c; totalsMap.set(mainCode, m);
    }
    if (mainCode.length >= 2) {
      const groupCode = mainCode.substring(0, 2);
      if (groupCode !== mainCode) {
        const g = totalsMap.get(groupCode) || { totalDebit: 0, totalCredit: 0 };
        g.totalDebit += d; g.totalCredit += c; totalsMap.set(groupCode, g);
      }
    }
    const classCode = mainCode.substring(0, 1);
    if (classCode !== mainCode) {
      const cl = totalsMap.get(classCode) || { totalDebit: 0, totalCredit: 0 };
      cl.totalDebit += d; cl.totalCredit += c; totalsMap.set(classCode, cl);
    }
  });
  const rows: MizanRow[] = uniqAccounts.map((acc) => {
    const t = totalsMap.get(acc.code) || { totalDebit: 0, totalCredit: 0 };
    const totalDebit = Number(t.totalDebit.toFixed(2));
    const totalCredit = Number(t.totalCredit.toFixed(2));
    const diff = totalDebit - totalCredit;
    return {
      code: acc.code, name: acc.name, type: acc.type, level: acc.level,
      totalDebit, totalCredit,
      debitBalance: diff > 0 ? Number(diff.toFixed(2)) : 0,
      creditBalance: diff < 0 ? Number(Math.abs(diff).toFixed(2)) : 0,
    };
  });
  rows.sort((a, b) => compareAccountCodes(a.code, b.code));
  return rows.filter((r) => {
    if (options?.onlyWithBalance && r.totalDebit === 0 && r.totalCredit === 0) return false;
    if (options?.levelFilter && options.levelFilter !== 'all') {
      if (options.levelFilter === 'class' && r.level !== 1) return false;
      if (options.levelFilter === 'group' && r.level !== 2) return false;
      if (options.levelFilter === 'main' && r.level !== 3) return false;
      if (options.levelFilter === 'sub' && r.level < 4) return false;
    }
    return true;
  });
}

const mizanAccounts: MizanAccount[] = [
  { code: '1', name: 'Dönen Varlıklar', type: 'asset', level: 1 },
  { code: '10', name: 'Hazır Değerler', type: 'asset', level: 2 },
  { code: '100', name: 'Kasa', type: 'asset', level: 3 },
  { code: '100.01', name: 'Kasa TL', type: 'asset', level: 4 },
  { code: '3', name: 'K.V. Yabancı Kaynaklar', type: 'liability', level: 1 },
  { code: '39', name: 'Diğer K.V. Y.K.', type: 'liability', level: 2 },
  { code: '391', name: 'Hesaplanan KDV', type: 'liability', level: 3 },
  { code: '600', name: 'Yurtiçi Satışlar', type: 'revenue', level: 3 },
];
const mizanLines = [
  { accountCode: '100.01', debit: 1500, credit: 0 },
  { accountCode: '600', debit: 0, credit: 1200 },
  { accountCode: '391', debit: 0, credit: 300 },
  { accountCode: '100.01', debit: 500, credit: 0 },   // aynı kod ikinci satır → agregasyon testi
  { accountCode: '600', debit: 0, credit: 100 },
];
/** SQL GROUP BY accountCode karşılığı: kesin kod bazında ön-agregasyon. */
function aggregateByCode(lines: typeof mizanLines): Map<string, { debit: number; credit: number }> {
  const m = new Map<string, { debit: number; credit: number }>();
  lines.forEach((l) => {
    const cur = m.get(l.accountCode) || { debit: 0, credit: 0 };
    cur.debit += l.debit; cur.credit += l.credit; m.set(l.accountCode, cur);
  });
  return m;
}

test('buildMizanRows eski satır-satır algoritmayla birebir aynı sonucu vermeli', () => {
  const expected = legacyMizan(mizanAccounts, mizanLines);
  const actual = buildMizanRows(mizanAccounts, aggregateByCode(mizanLines));
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
});

test('Mizan üst kodlara (ana/grup/sınıf) doğru yuvarlamalı', () => {
  const rows = buildMizanRows(mizanAccounts, aggregateByCode(mizanLines));
  const byCode = new Map(rows.map((r) => [r.code, r]));
  // 100.01 = 2000 borç → 100, 10, 1 de 2000 borç almalı
  expect(byCode.get('100.01')!.totalDebit).toBe(2000);
  expect(byCode.get('100')!.totalDebit).toBe(2000);
  expect(byCode.get('10')!.totalDebit).toBe(2000);
  expect(byCode.get('1')!.totalDebit).toBe(2000);
  // 600 = 1300 alacak, 391 = 300 alacak → sınıf 3 toplam alacak 300, sınıf 6 gelir 1300
  expect(byCode.get('600')!.totalCredit).toBe(1300);
  expect(byCode.get('391')!.totalCredit).toBe(300);
  expect(byCode.get('3')!.totalCredit).toBe(300);
});

test('Mizan onlyWithBalance ve levelFilter filtreleri eski davranışla eşleşmeli', () => {
  const onlyBalanceExpected = legacyMizan(mizanAccounts, mizanLines, { onlyWithBalance: true });
  const onlyBalanceActual = buildMizanRows(mizanAccounts, aggregateByCode(mizanLines), { onlyWithBalance: true });
  expect(JSON.stringify(onlyBalanceActual)).toBe(JSON.stringify(onlyBalanceExpected));

  const classExpected = legacyMizan(mizanAccounts, mizanLines, { levelFilter: 'class' });
  const classActual = buildMizanRows(mizanAccounts, aggregateByCode(mizanLines), { levelFilter: 'class' });
  expect(JSON.stringify(classActual)).toBe(JSON.stringify(classExpected));
  // Sınıf filtresi yalnızca level===1 satırları bırakır (1 ve 3)
  expect(classActual.length).toBe(2);
});

console.log('\n📌 4. ÜRETİM BORDRO YOLU — ARTAN ORANLI VERGİ');

/**
 * Regresyon: üretim bordro yolu (hrService.calculatePayrollForEmployee) bir dönem
 * düz oranlı `matrah * incomeTaxRate` kullanıyordu. Bu, yıl içinde kümülatif matrah
 * dilim sınırını aştığında vergiyi EKSİK hesaplar. Aşağıdaki test, artan oranlı
 * motorun düz orandan ayrıştığı ilk ayı kanıtlar; ayrışma yoksa motor devre dışı
 * kalmış demektir ve test kırmızıya döner.
 */
test('Artan oranlı vergi, yıl içinde düz orandan AYRIŞMALI (dilim geçişi)', () => {
  const SGK_WORKER = 0.14;
  const UNEMP_WORKER = 0.01;
  const FLAT_RATE = 0.15;
  const GROSS = 100000;
  const EXEMPTION = HR_CONSTANTS_2026.MIN_WAGE_INCOME_TAX_EXEMPTION_TL;

  // Aylık gelir vergisi matrahı (brüt − SGK işçi − işsizlik işçi)
  const monthlyBase = GROSS - GROSS * SGK_WORKER - GROSS * UNEMP_WORKER;
  // Düz oranlı (hatalı) hesap her ay aynı vergiyi verir
  const flatTax = Math.max(0, monthlyBase * FLAT_RATE - EXEMPTION);

  let cumulative = 0;
  let flatTotal = 0;
  let progressiveTotal = 0;
  let firstDivergenceMonth = 0;

  for (let month = 1; month <= 12; month++) {
    const { taxKurus, newCumulativeBaseKurus } = calculateProgressiveIncomeTaxKurus(
      toKurus(cumulative),
      toKurus(monthlyBase)
    );
    const progressiveTax = Math.max(0, fromKurus(taxKurus) - EXEMPTION);

    if (!firstDivergenceMonth && Math.abs(progressiveTax - flatTax) > 0.5) {
      firstDivergenceMonth = month;
    }

    flatTotal += flatTax;
    progressiveTotal += progressiveTax;
    cumulative = fromKurus(newCumulativeBaseKurus);
  }

  // Ayrışma mutlaka bir noktada başlamalı (aksi halde artan oranlılık çalışmıyor)
  expect(firstDivergenceMonth).toBeGreaterThan(0);
  // Düz oran vergiyi olduğundan DÜŞÜK gösterir → yıl toplamı daha küçüktür
  expect(progressiveTotal).toBeGreaterThan(flatTotal);
  // Yıl sonunda kümülatif matrah 12 aylık matrahı aşmamalı (sınır kontrolü)
  expect(cumulative).toBeCloseTo(monthlyBase * 12, 1);
});

test('Kümülatif matrah arttıkça efektif vergi oranı monoton artmalı', () => {
  const bases = [0, 50_000_000, 100_000_000, 200_000_000, 400_000_000]; // kuruş
  let previousRate = -1;
  for (const prev of bases) {
    const { effectiveRate, taxKurus } = calculateProgressiveIncomeTaxKurus(prev, 8_500_000);
    if (effectiveRate < previousRate) throw new Error('Efektif oran azalmamalı');
    previousRate = effectiveRate;
    expect(taxKurus).toBeGreaterThan(0);
  }
});

// -----------------------------------------------------------------
// 5. BEDEN/ASORTİ DAĞITIMI — TOPLAM KORUNMASI (REGRESYON)
// -----------------------------------------------------------------
console.log('\n📌 5. BEDEN/ASORTİ DAĞITIMI — TOPLAM KORUNMASI');

/**
 * Regresyon: dağıtım satır başına `Math.round(toplam / adet)` kullanıyordu ve
 * toplamı AŞABİLİYORDU (5 çift / 8 beden → 7 çift). Bu, ürün stoğu ile beden
 * kırılımını sessizce ayrıştırıyordu.
 */
test('5 miktar 8 bedene dağıtıldığında toplam TAM 5 kalmalı (taşma olmamalı)', () => {
  const shares = distributeWithLargestRemainder(5, new Array(8).fill(1));
  const sum = shares.reduce((a, b) => a + b, 0);
  expect(sum).toBe(5);
  // Eski hatalı yöntem 7 üretiyordu; her pay 0 veya 1 olmalı
  shares.forEach((s) => {
    if (s !== 0 && s !== 1) throw new Error(`Beklenen 0 veya 1, alınan ${s}`);
  });
});

test('Dağıtım toplamı her koşulda korunmalı (kapsamlı tarama)', () => {
  const cases: Array<{ total: number; n: number }> = [
    { total: 5, n: 8 }, { total: 1, n: 3 }, { total: 7, n: 3 },
    { total: 100, n: 7 }, { total: 0, n: 4 }, { total: 3, n: 1 },
    { total: 12, n: 5 }, { total: 1000, n: 33 }, { total: 0.5, n: 4 },
  ];
  for (const c of cases) {
    const shares = distributeWithLargestRemainder(c.total, new Array(c.n).fill(1));
    const sum = shares.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - c.total) > 1e-9) {
      throw new Error(`total=${c.total} n=${c.n} → dağıtım toplamı ${sum}`);
    }
  }
});

test('Asorti ağırlıklı dağıtım oranı korumalı ve toplamı aşmamalı', () => {
  // 12'li koli asortisi: 40:1, 41:2, 42:3, 43:3, 44:2, 45:1 → 5 koli = 60 çift
  const weights = [1, 2, 3, 3, 2, 1];
  const shares = distributeWithLargestRemainder(60, weights);
  const sum = shares.reduce((a, b) => a + b, 0);
  expect(sum).toBe(60);
  // Oran korunmalı: 42 ve 43 en yüksek payı almalı, 40 ve 45 en düşüğü
  if (!(shares[2] > shares[0] && shares[3] > shares[5])) {
    throw new Error(`Asorti oranı korunmadı: ${JSON.stringify(shares)}`);
  }
  // Tam oransal beklenti: 5,10,15,15,10,5
  const expected = [5, 10, 15, 15, 10, 5];
  shares.forEach((s, i) => {
    if (Math.abs(s - expected[i]) > 1e-9) {
      throw new Error(`Beklenen ${expected[i]}, alınan ${s} (index ${i})`);
    }
  });
});

test('Negatif dağıtımda (çıkış) işaret ve toplam korunmalı', () => {
  const shares = distributeWithLargestRemainder(-5, new Array(8).fill(1));
  const sum = shares.reduce((a, b) => a + b, 0);
  expect(sum).toBe(-5);
  shares.forEach((s) => {
    if (s > 0) throw new Error(`Negatif dağıtımda pozitif pay: ${s}`);
  });
});

console.log('\n======================================================');
test('Üretim beden dağıtımı negatif ve kesirli çift oluşturmaz', () => {
  const assortment = Array.from({ length: 8 }, (_, index) => ({ size: String(index + 36), quantity: 1 }));
  for (let total = 1; total < 100; total++) {
    const distribution = distributeAssortment({ unit: 'Çift', assortment }, total);
    expect(distribution.reduce((sum, item) => sum + item.quantity, 0)).toBe(total);
    if (distribution.some(item => item.quantity < 0 || !Number.isInteger(item.quantity))) throw new Error('Geçersiz beden miktarı');
  }
});
test('Ölçülebilen malzemeler açık hassasiyetle kesirli paylaştırılır', () => {
  expect(JSON.stringify(distributeWithLargestRemainder(5, Array(8).fill(1), 4))).toBe(JSON.stringify(Array(8).fill(0.625)));
});
test('Başka renk reçetesi sessizce seçilmez', () => {
  expect(selectProductionRecipe([{ productId: 1, targetColor: 'Kırmızı' }], 1, 'Mavi')).toBe(null);
});
test('Kasa seçilmemiş tahsilat reddedilir', () => {
  let rejected = false;
  try { assertReceiptInput({ type: 'collection', instrument: 'cash', amount: 10 }); } catch { rejected = true; }
  expect(rejected).toBe(true);
});
test('Fatura ve ödeme carisi uyuşmalıdır', () => {
  let rejected = false;
  try { assertInvoicePayment({ contactId: 1, type: 'sales', status: 'issued', grandTotal: 100, paidAmount: 0 }, { contactId: 2, type: 'collection', amount: 10 }); } catch { rejected = true; }
  expect(rejected).toBe(true);
});
test('2026 resmî asgari ücret ve işveren maliyeti bağımsız tutarla uyuşur', () => {
  const result = calculatePayroll2026({ grossSalaryTL: 33030, daysWorked: 26, weeklyRestDays: 4, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0, overtimeHours: 0 });
  expect(result.netSalary).toBe(28075.50);
  expect(result.totalEmployerCost).toBe(39223.13);
  expect(HR_CONSTANTS_2026.SGK_CEILING_TL).toBe(297270);
});
test('Asgari ücret vergi istisnası yılın ilerleyen ayında dilime göre artar', () => {
  expect(minimumWageTaxExemptionKurus(1)).toBe(421133);
  expect(minimumWageTaxExemptionKurus(12)).toBe(561510);
});
test('Netten brüte hesap kümülatif dilimde net tutarı korur', () => {
  const gross = grossForNet2026(50000, 1_000_000, 9);
  const result = calculatePayroll2026({ grossSalaryTL: gross, daysWorked: 30, weeklyRestDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0, overtimeHours: 0, previousCumulativeTaxBaseTL: 1_000_000, month: 9 });
  expect(result.netSalary).toBeCloseTo(50000, 0.01);
});
console.log(` TEST RAPORU: ${passedTests} BAŞARILI, ${failedTests} HATALI`);
console.log('======================================================\n');
if (failedTests > 0) {
  process.exit(1);
}
