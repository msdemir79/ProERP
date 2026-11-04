import { withOperation } from './idempotency.js';
/**
 * Sunucu tarafı işlem (business operation) uçları.
 *
 * Stok ve cari bakiye gibi türetilmiş/agregat veriler burada, tek bir MySQL
 * transaction'ı ve satır kilidi (`SELECT ... FOR UPDATE`) içinde güncellenir.
 * Böylece istemcideki "oku → hesapla → yaz" zincirinden kaynaklanan kayıp
 * güncelleme (lost update) ve yarım kalmış çok adımlı işlem riski ortadan kalkar.
 */
import express, { type Request, type Response, type Router } from 'express';
import { withTransaction, query, queryOne } from './db.js';
import type { PoolConnection } from 'mysql2/promise';
import { clientIp, can, type AuthContext } from './auth.js';
import { versionSupported } from './schema.js';
import { broadcast } from './sse.js';
import { writeAuditInTx } from './audit.js';
import { allocateDocumentNumber, journalPrefixFor, allocateBarcodeSequences, formatBarcodeValue } from './numbering.js';
import { HttpError as OpError } from './errors.js';
import type { DeleteEffects } from './deletePolicy.js';
import { resolveColorIdByName } from './colorService.js';
import { calculateWeightedAverageCost, ingredientPerUnit, requiredIngredientQuantity, roundUpQuantity, distributeWithLargestRemainder } from '../src/lib/inventoryCalculator.js';
import { assertBalancedJournalEntry } from '../src/lib/accountingValidator.js';
import { buildMizanRows, type MizanLevelFilter } from '../src/lib/accountCodes.js';
import type { AppModule, PermissionAction } from '../src/types.js';
import { assertOpenPeriod } from './periods.js';
import { assertReceiptInput, assertInvoicePayment } from '../src/lib/financeRules.js';
import { quantityDecimals } from '../src/lib/inventoryCalculator.js';
import { selectProductionRecipe } from '../src/lib/productionRules.js';
import { registerDocumentOps } from './documentOps.js';
import { assertUnreservedStock, assertReservedVariants } from './reservations.js';

/**
 * Ürün renkleri merkezi renk kartına taşındı (productColors ⋈ colors).
 * Eski `products.colors` JSON kolonu yerine bu alt sorgu okunur; böylece
 * stok hareketi/varyant senkronu aynı `string[]` biçimini görmeye devam eder.
 *
 * GROUP_CONCAT + ORDER BY kullanılıyor çünkü MySQL'de JSON_ARRAYAGG sıralama
 * desteklemez (LATERAL alt sorguda da sıra korunmuyor); renk sırası varyant
 * matrisini ve varsayılan rengi belirlediği için deterministik olmalı.
 * Sonuç JSON metni olarak döner ve parseList ile çözülür.
 */
const PRODUCT_COLORS_SQL =
  '(SELECT CONCAT(\'[\', GROUP_CONCAT(JSON_QUOTE(`c`.`name`) ORDER BY `pc`.`sortOrder` ASC), \']\') FROM `productColors` `pc` JOIN `colors` `c` ON `c`.`id` = `pc`.`colorId` WHERE `pc`.`productId` = `products`.`id`)';

const STOCK_MOVEMENT_TYPES = ['in', 'out', 'production_in', 'production_out'] as const;
type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/** Stok hareketi ve reçete sarfiyatı, ilgili operasyonel modüllerin yetkisiyle yapılabilir. */
function assertAnyPermission(
  auth: AuthContext | undefined,
  pairs: [AppModule, PermissionAction][],
  message: string,
): void {
  const allowed = pairs.some(([module, action]) => can(auth?.role || null, module, action));
  if (!allowed) throw new OpError(403, message, 'FORBIDDEN');
}

function actorName(auth: AuthContext | undefined): string {
  return auth?.user.fullName || 'Sistem';
}

/** Yıkıcı toplu işlemler (reset) yalnızca Süper Admin'e açıktır. */
function assertSuperAdmin(auth: AuthContext | undefined, message: string): void {
  const isSuper = Boolean(auth?.role?.code === 'super_admin' || auth?.user.roleCode === 'super_admin');
  if (!isSuper) throw new OpError(403, message, 'SUPER_ADMIN_REQUIRED');
}

async function lockProduct(conn: PoolConnection, productId: number) {
  const rows = await conn.query<any[]>(
    `SELECT \`id\`, \`code\`, \`name\`, \`unit\`, \`stock\`, \`buyingPrice\`, \`variantBarcodes\`, ${PRODUCT_COLORS_SQL} AS \`colors\`, \`categoryType\`, \`isFootwear\`, \`isRawMaterial\` FROM \`products\` WHERE \`id\` = ? FOR UPDATE`,
    [productId],
  );
  const row = (rows[0] as any[])[0];
  if (!row) throw new OpError(404, 'Ürün bulunamadı.', 'PRODUCT_NOT_FOUND');
  return row;
}

function parseVariants(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((v) => ({ ...v }));
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((v) => ({ ...v })) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Ürün renk listesi düz metin dizisidir (`productColors` alt sorgusu JSON metni
 * döner). parseVariants string öğeleri karakter nesnesine çevirdiği için renkler
 * ayrı çözülür; sıra `sortOrder`'ı korur ve varsayılan rengi belirler.
 */
function parseColorNames(raw: unknown): string[] {
  if (!raw) return [];
  let list: unknown = raw;
  if (typeof raw === 'string') {
    try { list = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(list)) return [];
  return list.map((v) => (typeof v === 'string' ? v.trim() : String(v ?? '').trim())).filter(Boolean);
}

async function writeProductStock(
  conn: PoolConnection,
  productId: number,
  stock: number,
  variants: any[] | null,
  buyingPrice: number | null,
  withVersion: boolean,
): Promise<void> {
  const sets = ['`stock` = ?', '`updatedAt` = NOW()'];
  if (withVersion) sets.push('`version` = `version` + 1');
  const params: any[] = [stock];
  if (variants) {
    sets.push('`variantBarcodes` = ?');
    params.push(JSON.stringify(variants));
  }
  if (buyingPrice !== null) {
    sets.push('`buyingPrice` = ?');
    params.push(buyingPrice);
  }
  params.push(productId);
  await conn.query(`UPDATE \`products\` SET ${sets.join(', ')} WHERE \`id\` = ?`, params);
}

async function insertInventoryLog(
  conn: PoolConnection,
  input: {
    productId: number;
    type: StockMovementType;
    quantity: number;
    description: string;
    color?: string | null;
    colorId?: number | null;
    size?: string | null;
    date?: Date | null;
  },
): Promise<number> {
  // `color` metni tarihsel kayıt olarak korunur; merkezi kart bağı (colorId) da
  await assertOpenPeriod(conn, 'accounting', input.date ?? new Date());
  // aynı satıra yazılır ki stok ekstresi/raporlar renk kartına bağlanabilsin.
  const colorId = input.colorId ?? (input.color ? await resolveColorIdByName(conn, input.color) : null);
  const [result] = await conn.query(
    'INSERT INTO `inventoryLogs` (`productId`, `type`, `quantity`, `date`, `description`, `color`, `colorId`, `size`) VALUES (?, ?, ?, COALESCE(?, NOW()), ?, ?, ?, ?)',
    [input.productId, input.type, input.quantity, input.date ?? null, input.description, input.color ?? null, colorId, input.size ?? null],
  );
  return Number((result as any)?.insertId || 0);
}

/* ==================================================================== */
/* Fatura muhasebesi (TDHP) — sunucu tarafı, transaction içi yardımcılar  */
/*                                                                      */
/* İstemcideki accountingService.createInvoiceJournalEntry mantığının     */
/* birebir sunucu karşılığıdır; böylece fatura → yevmiye kaydı fatura     */
/* transaction'ı içinde atomik olarak yazılır ve iptalde ters kayıtla     */
/* geri alınır. Hesap (TDHP) kodları yoksa hiyerarşiyle birlikte açılır.  */
/* ==================================================================== */

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost';

interface JournalLine {
  id: string;
  accountCode: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
  contactId?: number | null;
}

const STANDARD_ACCOUNT_NAMES: Record<string, string> = {
  '1': 'DÖNEN VARLIKLAR', '10': 'HAZIR DEĞERLER', '100': 'KASA', '100.01': 'Merkez TL Kasası',
  '101': 'ALINAN ÇEKLER', '101.01': 'Portföydeki Çekler', '102': 'BANKALAR', '102.01': 'Vadesiz TL Mevduat Hesabı',
  '103': 'VERİLEN ÇEKLER VE ÖDEME EMİRLERİ (-)', '108': 'DİĞER HAZIR DEĞERLER', '12': 'TİCARİ ALACAKLAR',
  '120': 'ALICILAR (MÜŞTERİLER)', '120.01': 'Yurtiçi Müşteriler Cari Hesabı', '120.02': 'Yurtdışı Müşteriler Cari Hesabı',
  '121': 'ALACAK SENETLERİ', '15': 'STOKLAR', '150': 'İLK MADDE VE MALZEME', '150.01': 'Deri ve Suni Deri Stokları',
  '150.02': 'Taban, Fuspet ve Ökçe Stokları', '150.03': 'Astar ve Tekstil Malzemeleri', '150.04': 'Yardımcı Malzeme ve Aksesuarlar',
  '151': 'YARI MAMULLER - ÜRETİM', '151.01': 'Kesim ve Saya Yarı Mamulleri', '152': 'MAMULLER',
  '152.01': 'Biten Ayakkabı Mamul Deposu', '153': 'TİCARİ MALLAR', '153.01': 'Satın Alınan Ticari Mallar',
  '191': 'İNDİRİLECEK KDV', '191.01': '%1 İndirilecek KDV', '191.10': '%10 İndirilecek KDV', '191.20': '%20 İndirilecek KDV',
  '3': 'KISA VADELİ YABANCI KAYNAKLAR', '30': 'MALİ BORÇLAR', '32': 'TİCARİ BORÇLAR', '320': 'SATICILAR (TEDARİKÇİLER)',
  '320.01': 'Yurtiçi Mal ve Hizmet Tedarikçileri', '320.02': 'Fason Saya ve Taban Atölyeleri', '321': 'BORÇ SENETLERİ',
  '391': 'HESAPLANAN KDV', '391.01': '%1 Hesaplanan KDV', '391.10': '%10 Hesaplanan KDV', '391.20': '%20 Hesaplanan KDV',
  '6': 'GELİR TABLOSU HESAPLARI', '60': 'BRÜT SATIŞLAR', '600': 'YURTİÇİ SATIŞLAR', '600.01': '%1 KDV Yurtiçi Satışlar',
  '600.10': '%10 KDV Yurtiçi Satışlar', '600.20': '%20 KDV Yurtiçi Satışlar', '601': 'YURTDIŞI SATIŞLAR (İHRACAT)',
  '620': 'SATILAN MAMULLER MALİYETİ (-)', '621': 'SATILAN TİCARİ MALLAR MALİYETİ (-)', '7': 'MALİYET HESAPLARI',
  '710': 'DİREKT İLK MADDE VE MALZEME GİDERLERİ', '720': 'DİREKT İŞÇİLİK GİDERLERİ', '730': 'GENEL ÜRETİM GİDERLERİ',
  '760': 'PAZARLAMA, SATIŞ VE DAĞITIM GİDERLERİ', '770': 'GENEL YÖNETİM GİDERLERİ', '780': 'FİNANSMAN GİDERLERİ',
};

function standardAccountName(code: string): string {
  return STANDARD_ACCOUNT_NAMES[code] || `${code} Hesabı`;
}

function inferAccountType(code: string): AccountType {
  const t = code.trim();
  if (t.startsWith('1') || t.startsWith('2')) return 'asset';
  if (t.startsWith('3') || t.startsWith('4')) return 'liability';
  if (t.startsWith('5')) return 'equity';
  if (t.startsWith('6')) {
    if (t.startsWith('60') || t.startsWith('64') || t.startsWith('67')) return 'revenue';
    if (t.startsWith('61')) return 'revenue';
    if (t.startsWith('62')) return 'cost';
    return 'expense';
  }
  if (t.startsWith('7')) {
    if (t.startsWith('71') || t.startsWith('72') || t.startsWith('73')) return 'cost';
    return 'expense';
  }
  return 'asset';
}

async function findAccount(conn: PoolConnection, code: string): Promise<{ id: number; name: string } | null> {
  const rows = await conn.query<any[]>('SELECT `id`, `name` FROM `accounts` WHERE `code` = ? LIMIT 1', [code]);
  const row = (rows[0] as any[])[0];
  return row ? { id: Number(row.id), name: String(row.name) } : null;
}

async function insertAccountIgnore(
  conn: PoolConnection,
  acc: { code: string; name: string; type: AccountType; level: number; parentCode?: string | null; isSystem: number },
): Promise<void> {
  await conn.query(
    'INSERT IGNORE INTO `accounts` (`code`, `name`, `type`, `level`, `parentCode`, `currency`, `isSystem`, `isActive`) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
    [acc.code, acc.name, acc.type, acc.level, acc.parentCode ?? null, 'TRY', acc.isSystem],
  );
}

/**
 * Bir TDHP hesabını (ve eksik üst hiyerarşisini) transaction içinde garanti eder;
 * hesabın adını döndürür. İstemcideki registerAccountFromCode'un karşılığıdır.
 */
async function ensureAccountInTx(conn: PoolConnection, rawCode: string, name: string, type?: AccountType): Promise<string> {
  const code = (rawCode || '').trim();
  if (!code) return name;
  const cleanName = (name || '').replace(/^undefined\s*[-–:]\s*/i, '').replace(/undefined/gi, '').trim() || `${code} Hesabı`;
  const inferredType: AccountType = type || inferAccountType(code);
  const parts = code.split('.');

  if (parts.length > 1) {
    const mainCode = parts[0];
    if (!(await findAccount(conn, mainCode))) {
      await insertAccountIgnore(conn, { code: mainCode, name: standardAccountName(mainCode), type: inferredType, level: 3, parentCode: mainCode.substring(0, 2), isSystem: 1 });
    }
    if (parts.length >= 3) {
      const subCode = `${parts[0]}.${parts[1]}`;
      if (!(await findAccount(conn, subCode))) {
        await insertAccountIgnore(conn, { code: subCode, name: standardAccountName(subCode), type: inferredType, level: 4, parentCode: mainCode, isSystem: 0 });
      }
    }
  }

  const existing = await findAccount(conn, code);
  if (existing) return existing.name;

  let parentCode: string | undefined;
  let level = 4;
  if (parts.length > 1) {
    parentCode = parts.slice(0, parts.length - 1).join('.');
    level = Math.min(6, 3 + parts.length - 1);
  } else if (code.length === 3) {
    parentCode = code.substring(0, 2);
    level = 3;
  }
  await insertAccountIgnore(conn, { code, name: cleanName, type: inferredType, level, parentCode, isSystem: 0 });
  return cleanName;
}

async function nextEntryNumber(conn: PoolConnection, prefix: string, year: number): Promise<string> {
  return allocateDocumentNumber(conn, { table: 'journalEntries', prefix, pad: 6, year });
}

function vatAccountCodes(taxRate: number, isSales: boolean): { code: string; name: string } {
  if (isSales) {
    if (taxRate === 1) return { code: '391.01', name: '%1 Hesaplanan KDV' };
    if (taxRate === 10) return { code: '391.10', name: '%10 Hesaplanan KDV' };
    if (taxRate === 0) return { code: '391.00', name: '%0 Hesaplanan KDV' };
    return { code: '391.20', name: '%20 Hesaplanan KDV' };
  }
  if (taxRate === 1) return { code: '191.01', name: '%1 İndirilecek KDV' };
  if (taxRate === 10) return { code: '191.10', name: '%10 İndirilecek KDV' };
  if (taxRate === 0) return { code: '191.00', name: '%0 İndirilecek KDV' };
  return { code: '191.20', name: '%20 İndirilecek KDV' };
}

/**
 * Fatura satırlarından TDHP yevmiye satırlarını kurar (satış/alış dalları).
 * İstemcideki createInvoiceJournalEntry ile aynı hesap eşlemesini uygular.
 */
async function buildInvoiceJournalLines(
  conn: PoolConnection,
  invoice: { id: number; type: string; invoiceNumber: string; contactId: number | null; subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number },
  items: any[],
): Promise<JournalLine[]> {
  const isSales = invoice.type === 'sales';
  const contactRows = invoice.contactId
    ? await conn.query<any[]>('SELECT `id`, `name`, `accountCode` FROM `contacts` WHERE `id` = ?', [invoice.contactId])
    : [[]];
  const contact = (contactRows[0] as any[])[0];
  const contactName = contact ? String(contact.name) : 'Genel Cari';
  const defaultContactCode = isSales ? '120.01' : '320.01';
  const contactAccountCode = (contact?.accountCode && String(contact.accountCode).trim()) || defaultContactCode;
  const contactAccountName = await ensureAccountInTx(
    conn,
    contactAccountCode,
    isSales ? `Alıcılar - ${contactName}` : `Satıcılar - ${contactName}`,
    isSales ? 'asset' : 'liability',
  );

  const productIds = [...new Set(items.map((it) => Number(it.productId)).filter((n) => Number.isFinite(n) && n > 0))];
  const productMap = new Map<number, { salesAccountCode: string | null; purchaseAccountCode: string | null; accountingCode: string | null }>();
  if (productIds.length) {
    const pRows = await conn.query<any[]>(
      `SELECT \`id\`, \`salesAccountCode\`, \`purchaseAccountCode\`, \`accountingCode\` FROM \`products\` WHERE \`id\` IN (${productIds.map(() => '?').join(',')})`,
      productIds,
    );
    for (const p of pRows[0] as any[]) {
      productMap.set(Number(p.id), {
        salesAccountCode: p.salesAccountCode ? String(p.salesAccountCode) : null,
        purchaseAccountCode: p.purchaseAccountCode ? String(p.purchaseAccountCode) : null,
        accountingCode: p.accountingCode ? String(p.accountingCode) : null,
      });
    }
  }

  const lines: JournalLine[] = [];
  const grandTotal = Number((invoice.grandTotal || 0).toFixed(2));
  const stamp = Date.now();

  const accMap = new Map<string, { amount: number; name: string }>();
  const vatMap = new Map<string, { amount: number; name: string }>();

  if (items.length > 0) {
    for (const item of items) {
      let accCode = isSales ? '600.01' : '150.01';
      let accName = isSales ? 'Mamul ve Ürün Satışları' : 'İlk Madde ve Malzeme Stokları';
      const pid = Number(item.productId);
      if (Number.isFinite(pid) && productMap.has(pid)) {
        const p = productMap.get(pid)!;
        if (isSales) {
          if (p.salesAccountCode?.trim()) accCode = p.salesAccountCode.trim();
        } else if (p.purchaseAccountCode?.trim()) {
          accCode = p.purchaseAccountCode.trim();
        } else if (p.accountingCode?.trim()) {
          accCode = p.accountingCode.trim();
        }
      }
      const taxRate = item.taxRate !== undefined && item.taxRate !== null ? Number(item.taxRate) : 20;
      const vat = vatAccountCodes(taxRate, isSales);
      const lineNet = Number(((Number(item.quantity) * Number(item.unitPrice)) - (Number(item.discountAmount) || 0)).toFixed(2));
      const lineTax = Number((Number(item.taxAmount) || 0).toFixed(2));
      if (lineNet > 0) {
        const ex = accMap.get(accCode);
        if (ex) ex.amount += lineNet; else accMap.set(accCode, { amount: lineNet, name: accName });
      }
      if (lineTax > 0) {
        const ex = vatMap.get(vat.code);
        if (ex) ex.amount += lineTax; else vatMap.set(vat.code, { amount: lineTax, name: vat.name });
      }
    }
  } else {
    const netAmount = Number(((invoice.subtotal || 0) - (invoice.discountTotal || 0)).toFixed(2));
    const vatAmount = Number((invoice.taxTotal || 0).toFixed(2));
    if (netAmount > 0) accMap.set(isSales ? '600.01' : '150.01', { amount: netAmount, name: isSales ? 'Mamul ve Ürün Satışları' : 'İlk Madde ve Malzeme Stokları' });
    if (vatAmount > 0) { const v = vatAccountCodes(20, isSales); vatMap.set(v.code, { amount: vatAmount, name: v.name }); }
  }

  if (isSales) {
    lines.push({
      id: `line-${stamp}-contact`, accountCode: contactAccountCode, accountName: contactAccountName,
      description: `Satış Faturası: ${invoice.invoiceNumber} - ${contactName}`, debit: grandTotal, credit: 0, contactId: invoice.contactId,
    });
    let i = 1;
    for (const [code, data] of accMap.entries()) {
      const amt = Number(data.amount.toFixed(2));
      if (amt > 0) {
        const nm = await ensureAccountInTx(conn, code, data.name, 'revenue');
        lines.push({ id: `line-${stamp}-rev-${i++}`, accountCode: code, accountName: nm, description: `Satış Geliri (Fatura: ${invoice.invoiceNumber})`, debit: 0, credit: amt });
      }
    }
    for (const [code, data] of vatMap.entries()) {
      const amt = Number(data.amount.toFixed(2));
      if (amt > 0) {
        const nm = await ensureAccountInTx(conn, code, data.name, 'liability');
        lines.push({ id: `line-${stamp}-vat-${i++}`, accountCode: code, accountName: nm, description: `Hesaplanan KDV (Fatura: ${invoice.invoiceNumber})`, debit: 0, credit: amt });
      }
    }
    const td = lines.reduce((s, l) => s + l.debit, 0);
    const tc = lines.reduce((s, l) => s + l.credit, 0);
    const diff = Number((td - tc).toFixed(2));
    if (Math.abs(diff) > 0 && Math.abs(diff) < 0.10) {
      const revLine = lines.find((l) => l.credit > 0);
      if (revLine) revLine.credit = Number((revLine.credit + diff).toFixed(2));
    }
  } else {
    let i = 1;
    for (const [code, data] of accMap.entries()) {
      const amt = Number(data.amount.toFixed(2));
      if (amt > 0) {
        const nm = await ensureAccountInTx(conn, code, data.name, 'asset');
        lines.push({ id: `line-${stamp}-stock-${i++}`, accountCode: code, accountName: nm, description: `Alış Girişi (Fatura: ${invoice.invoiceNumber})`, debit: amt, credit: 0 });
      }
    }
    for (const [code, data] of vatMap.entries()) {
      const amt = Number(data.amount.toFixed(2));
      if (amt > 0) {
        const nm = await ensureAccountInTx(conn, code, data.name, 'asset');
        lines.push({ id: `line-${stamp}-vat-${i++}`, accountCode: code, accountName: nm, description: `İndirilecek KDV (Fatura: ${invoice.invoiceNumber})`, debit: amt, credit: 0 });
      }
    }
    lines.push({
      id: `line-${stamp}-contact`, accountCode: contactAccountCode, accountName: contactAccountName,
      description: `Tedarikçi Borç Tahakkuku: ${invoice.invoiceNumber} - ${contactName}`, debit: 0, credit: grandTotal, contactId: invoice.contactId,
    });
    const td = lines.reduce((s, l) => s + l.debit, 0);
    const tc = lines.reduce((s, l) => s + l.credit, 0);
    const diff = Number((td - tc).toFixed(2));
    if (Math.abs(diff) > 0 && Math.abs(diff) < 0.10) {
      const stockLine = lines.find((l) => l.debit > 0);
      if (stockLine) stockLine.debit = Number((stockLine.debit - diff).toFixed(2));
    }
  }
  return lines;
}

async function insertJournalEntry(
  conn: PoolConnection,
  entry: { entryType: string; date: Date; description: string; documentType: string; documentId: number | null; documentNumber: string | null; lines: JournalLine[]; totalDebit: number; totalCredit: number },
): Promise<number> {
  await assertOpenPeriod(conn, 'accounting', entry.date);
  const entryNumber = await nextEntryNumber(conn, entry.entryType === 'tahsil' ? 'THS' : entry.entryType === 'tediye' ? 'TDY' : 'YEV', entry.date.getFullYear());
  const [result] = await conn.query(
    'INSERT INTO `journalEntries` (`entryNumber`, `entryType`, `date`, `description`, `documentType`, `documentId`, `documentNumber`, `lines`, `totalDebit`, `totalCredit`, `isBalanced`, `status`, `createdAt`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW())',
    [entryNumber, entry.entryType, entry.date, entry.description, entry.documentType, entry.documentId, entry.documentNumber, JSON.stringify(entry.lines), entry.totalDebit, entry.totalCredit, 'approved'],
  );
  return Number((result as any)?.insertId || 0);
}

/**
 * Fatura için yevmiye kaydını transaction içinde yazar (idempotent: aynı fatura
 * için zaten kayıt varsa onu döndürür, çift post etmez).
 */
async function postInvoiceJournalInTx(
  conn: PoolConnection,
  invoice: { id: number; type: string; invoiceNumber: string; contactId: number | null; date: Date; subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number },
  items: any[],
): Promise<number | null> {
  const existing = await conn.query<any[]>(
    "SELECT `id` FROM `journalEntries` WHERE `documentType` = 'invoice' AND `documentId` = ? LIMIT 1",
    [invoice.id],
  );
  const ex = (existing[0] as any[])[0];
  if (ex) return Number(ex.id);

  const lines = await buildInvoiceJournalLines(conn, invoice, items);
  if (lines.length < 2) return null;
  const { totalDebit, totalCredit } = assertBalancedJournalEntry(lines);
  return insertJournalEntry(conn, {
    entryType: 'mahsup',
    date: invoice.date instanceof Date ? invoice.date : new Date(invoice.date),
    description: `${invoice.type === 'sales' ? 'Satış' : 'Alış'} Faturası Muhasebe Kaydı (${invoice.invoiceNumber})`,
    documentType: 'invoice',
    documentId: invoice.id,
    documentNumber: invoice.invoiceNumber,
    lines,
    totalDebit,
    totalCredit,
  });
}

/**
 * Faturaya ait yevmiye kaydını ters kayıtla (reversing entry) geri alır.
 * Orijinal kayıt silinmez; borç/alacak yer değiştirmiş yeni bir 'invoice_reversal'
 * kaydı eklenir (idempotent: zaten ters kayıt varsa tekrar oluşturmaz).
 */
async function reverseInvoiceJournalInTx(conn: PoolConnection, invoiceId: number, invoiceNumber: string): Promise<number | null> {
  const already = await conn.query<any[]>(
    "SELECT `id` FROM `journalEntries` WHERE `documentType` = 'invoice_reversal' AND `documentId` = ? LIMIT 1",
    [invoiceId],
  );
  if ((already[0] as any[]).length) return Number((already[0] as any[])[0].id);

  const orig = await conn.query<any[]>(
    "SELECT `id`, `lines`, `date` FROM `journalEntries` WHERE `documentType` = 'invoice' AND `documentId` = ? ORDER BY `id` DESC LIMIT 1",
    [invoiceId],
  );
  const original = (orig[0] as any[])[0];
  if (!original) return null;

  let originalLines: JournalLine[] = [];
  try {
    const raw = original.lines;
    originalLines = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
  } catch { originalLines = []; }
  if (!originalLines.length) return null;

  const reversedLines: JournalLine[] = originalLines.map((l, idx) => ({
    id: `rev-${Date.now()}-${idx}`,
    accountCode: l.accountCode,
    accountName: l.accountName,
    description: `İPTAL/TERS KAYIT — ${invoiceNumber}`,
    debit: Number(l.credit) || 0,
    credit: Number(l.debit) || 0,
    contactId: l.contactId ?? null,
  }));
  const totalDebit = Number(reversedLines.reduce((s, l) => s + l.debit, 0).toFixed(2));
  const totalCredit = Number(reversedLines.reduce((s, l) => s + l.credit, 0).toFixed(2));

  return insertJournalEntry(conn, {
    entryType: 'mahsup',
    date: new Date(),
    description: `Fatura İptali Ters Kaydı (${invoiceNumber})`,
    documentType: 'invoice_reversal',
    documentId: invoiceId,
    documentNumber: invoiceNumber,
    lines: reversedLines,
    totalDebit,
    totalCredit,
  });
}

/**
 * Manuel/onaylı bir yevmiye fişini ters kayıtla (reversing entry) geri alır.
 * Orijinal fiş SİLİNMEZ; borç/alacak yer değiştirmiş yeni bir 'journal_reversal'
 * kaydı eklenir (idempotent: aynı fiş için ters kayıt varsa tekrar üretmez).
 * Belgeye bağlı otomatik fişler (invoice/check/receipt/opening) buradan değil,
 * kendi kontrollü op'ları üzerinden iptal edilir.
 */
async function reverseJournalEntryInTx(conn: PoolConnection, entryId: number): Promise<number | null> {
  const already = await conn.query<any[]>(
    "SELECT `id` FROM `journalEntries` WHERE `documentType` = 'journal_reversal' AND `documentId` = ? LIMIT 1",
    [entryId],
  );
  if ((already[0] as any[]).length) return Number((already[0] as any[])[0].id);

  const orig = await conn.query<any[]>(
    'SELECT `id`, `entryNumber`, `lines` FROM `journalEntries` WHERE `id` = ? LIMIT 1',
    [entryId],
  );
  const original = (orig[0] as any[])[0];
  if (!original) return null;

  let originalLines: JournalLine[] = [];
  try {
    const raw = original.lines;
    originalLines = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
  } catch { originalLines = []; }
  if (!originalLines.length) return null;

  const reversedLines: JournalLine[] = originalLines.map((l, idx) => ({
    id: `rev-${Date.now()}-${idx}`,
    accountCode: l.accountCode,
    accountName: l.accountName,
    description: `İPTAL/TERS KAYIT — ${original.entryNumber}`,
    debit: Number(l.credit) || 0,
    credit: Number(l.debit) || 0,
    contactId: l.contactId ?? null,
  }));
  const totalDebit = Number(reversedLines.reduce((s, l) => s + l.debit, 0).toFixed(2));
  const totalCredit = Number(reversedLines.reduce((s, l) => s + l.credit, 0).toFixed(2));

  return insertJournalEntry(conn, {
    entryType: 'mahsup',
    date: new Date(),
    description: `Yevmiye Fişi İptali Ters Kaydı (${original.entryNumber})`,
    documentType: 'journal_reversal',
    documentId: entryId,
    documentNumber: original.entryNumber,
    lines: reversedLines,
    totalDebit,
    totalCredit,
  });
}

/* ------------------------------------------------------------------ */
/* Kalıp (last) takip motoru — sabitler ve yardımcılar                 */
/* ------------------------------------------------------------------ */

/** Kalıp konum kovaları. Bir çift her anda TEK kovada durur. */
const MOLD_LOCATION_TYPES = [
  'factory_warehouse',
  'factory_line',
  'factory_other',
  'subcontract',
  'subcontract_warehouse',
  'maintenance',
  'scrap_lost',
  'allocated',
] as const;
type MoldLocationType = (typeof MOLD_LOCATION_TYPES)[number];

const MOLD_LOCATION_LABELS: Record<MoldLocationType, string> = {
  factory_warehouse: 'Fabrika Deposu',
  factory_line: 'Üretim Hattı',
  factory_other: 'Fabrika İçi Diğer',
  subcontract: 'Fason Firma',
  subcontract_warehouse: 'Fason Deposu',
  maintenance: 'Bakım/Onarım',
  scrap_lost: 'Hurda/Kayıp',
  allocated: 'İş Emrine Tahsis',
};

/** Kullanılabilir çift hesabına girmeyen konumlar (bakım + hurda/kayıp). */
const MOLD_UNAVAILABLE_LOCATIONS: MoldLocationType[] = ['maintenance', 'scrap_lost'];
const MOLD_FACTORY_LOCATIONS: MoldLocationType[] = ['factory_warehouse', 'factory_line', 'factory_other'];
const MOLD_SUBCONTRACT_LOCATIONS: MoldLocationType[] = ['subcontract', 'subcontract_warehouse'];

/** /mold-move ucunun kabul ettiği fiziksel hareket türleri. count_adjust, allocate ve deallocate ayrı uçlarda işlenir. */
const MOLD_MOVE_TYPES = [
  'initial_entry',
  'to_line',
  'from_line_return',
  'to_subcontract',
  'from_subcontract_return',
  'subcontract_transfer',
  'warehouse_transfer',
  'to_maintenance',
  'from_maintenance',
  'damage',
  'loss',
  'scrap',
] as const;
type MoldMoveType = (typeof MOLD_MOVE_TYPES)[number];

const MOLD_MOVE_LABELS: Record<MoldMoveType | 'count_adjust' | 'allocate' | 'deallocate', string> = {
  initial_entry: 'İlk Kalıp Girişi',
  to_line: 'Üretim Hattına Transfer',
  from_line_return: 'Hattan Depoya İade',
  to_subcontract: 'Fasona Gönderim',
  from_subcontract_return: 'Fasondan İade',
  subcontract_transfer: 'Fasonlar Arası Transfer',
  warehouse_transfer: 'Fabrika İçi Transfer',
  to_maintenance: 'Bakıma Gönderim',
  from_maintenance: 'Bakımdan Dönüş',
  damage: 'Hasarlı Kalıp',
  loss: 'Kayıp Kalıp',
  scrap: 'Hurdaya Ayırma',
  count_adjust: 'Sayım Düzeltmesi',
  allocate: 'İş Emrine Tahsis',
  deallocate: 'Tahsis İptali',
};

interface MoldBucketKey {
  locationType: MoldLocationType;
  subcontractId: number;
}

interface MoldMoveEndpoint {
  locationType: MoldLocationType;
  subcontractId: number;
}

/**
 * Hareket türüne göre kaynak/hedef konumu çözer. Fason işlemlerinde ilgili cari
 * (subcontractId) zorunludur; factory→factory transferlerinde açık konum gerekir.
 */
function resolveMoldMove(type: MoldMoveType, body: any): { from: MoldMoveEndpoint | null; to: MoldMoveEndpoint } {
  const fromSub = Number(body.fromSubcontractId) || 0;
  const toSub = Number(body.toSubcontractId) || 0;
  const explicitFrom = String(body.fromLocationType || '') as MoldLocationType;
  const explicitTo = String(body.toLocationType || '') as MoldLocationType;
  const factoryFrom = (fallback: MoldLocationType): MoldMoveEndpoint => ({
    locationType: MOLD_FACTORY_LOCATIONS.includes(explicitFrom) ? explicitFrom : fallback,
    subcontractId: 0,
  });

  switch (type) {
    case 'initial_entry':
      return { from: null, to: { locationType: MOLD_FACTORY_LOCATIONS.includes(explicitTo) ? explicitTo : 'factory_warehouse', subcontractId: 0 } };
    case 'to_line':
      return { from: factoryFrom('factory_warehouse'), to: { locationType: 'factory_line', subcontractId: 0 } };
    case 'from_line_return':
      return { from: { locationType: 'factory_line', subcontractId: 0 }, to: { locationType: 'factory_warehouse', subcontractId: 0 } };
    case 'to_subcontract': {
      if (!toSub) throw new OpError(400, 'Fasona gönderim için hedef fason firma (cari) seçilmelidir.', 'SUBCONTRACT_REQUIRED');
      return { from: factoryFrom('factory_warehouse'), to: { locationType: 'subcontract', subcontractId: toSub } };
    }
    case 'from_subcontract_return': {
      if (!fromSub) throw new OpError(400, 'Fason iadesi için kaynak fason firma (cari) seçilmelidir.', 'SUBCONTRACT_REQUIRED');
      return { from: { locationType: 'subcontract', subcontractId: fromSub }, to: { locationType: 'factory_warehouse', subcontractId: 0 } };
    }
    case 'subcontract_transfer': {
      if (!fromSub || !toSub) throw new OpError(400, 'Fasonlar arası transfer için kaynak ve hedef fason firma seçilmelidir.', 'SUBCONTRACT_REQUIRED');
      if (fromSub === toSub) throw new OpError(400, 'Kaynak ve hedef fason firma aynı olamaz.', 'SUBCONTRACT_SAME');
      return { from: { locationType: 'subcontract', subcontractId: fromSub }, to: { locationType: 'subcontract', subcontractId: toSub } };
    }
    case 'warehouse_transfer': {
      if (!MOLD_FACTORY_LOCATIONS.includes(explicitFrom) || !MOLD_FACTORY_LOCATIONS.includes(explicitTo)) {
        throw new OpError(400, 'Fabrika içi transfer için kaynak ve hedef fabrika konumu seçilmelidir.', 'INVALID_LOCATION');
      }
      if (explicitFrom === explicitTo) throw new OpError(400, 'Kaynak ve hedef konum aynı olamaz.', 'SAME_LOCATION');
      return { from: { locationType: explicitFrom, subcontractId: 0 }, to: { locationType: explicitTo, subcontractId: 0 } };
    }
    case 'to_maintenance':
      return { from: factoryFrom('factory_warehouse'), to: { locationType: 'maintenance', subcontractId: 0 } };
    case 'from_maintenance':
      return { from: { locationType: 'maintenance', subcontractId: 0 }, to: { locationType: 'factory_warehouse', subcontractId: 0 } };
    case 'damage':
    case 'loss':
    case 'scrap':
      return { from: factoryFrom('factory_warehouse'), to: { locationType: 'scrap_lost', subcontractId: 0 } };
    default:
      throw new OpError(400, `Geçersiz kalıp hareketi türü: ${type}`, 'INVALID_MOLD_MOVE');
  }
}

/** Kalıp stok kovasını satır kilidiyle okur (yoksa null). */
async function lockMoldBucket(
  conn: PoolConnection,
  moldId: number,
  size: string,
  loc: { locationType: string; subcontractId: number },
  workOrderId = 0,
): Promise<any | null> {
  const rows = await conn.query<any[]>(
    'SELECT * FROM `moldStock` WHERE `moldId` = ? AND `size` = ? AND `locationType` = ? AND `subcontractId` = ? AND `workOrderId` = ? LIMIT 1 FOR UPDATE',
    [moldId, size, loc.locationType, loc.subcontractId, workOrderId],
  );
  return (rows[0] as any[])[0] || null;
}

/** Hedef kovaya çift/tek parça ekler (yoksa oluşturur). Kalıp satır kilidi altında çağrılır. */
async function addMoldBucket(
  conn: PoolConnection,
  moldId: number,
  size: string,
  loc: { locationType: string; subcontractId: number },
  pairs: number,
  looseLeft: number,
  looseRight: number,
  workOrderId = 0,
): Promise<void> {
  await conn.query(
    `INSERT INTO \`moldStock\` (\`moldId\`, \`size\`, \`locationType\`, \`subcontractId\`, \`workOrderId\`, \`pairs\`, \`looseLeft\`, \`looseRight\`, \`updatedAt\`, \`version\`)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)
     ON DUPLICATE KEY UPDATE
       \`pairs\` = \`pairs\` + VALUES(\`pairs\`),
       \`looseLeft\` = \`looseLeft\` + VALUES(\`looseLeft\`),
       \`looseRight\` = \`looseRight\` + VALUES(\`looseRight\`),
       \`updatedAt\` = NOW(),
       \`version\` = \`version\` + 1`,
    [moldId, size, loc.locationType, loc.subcontractId, workOrderId, pairs, looseLeft, looseRight],
  );
}

/** Kalıp ana kartını satır kilidiyle okur; tüm kalıp hareketleri bu kilitte sıraya girer. */
async function lockMold(conn: PoolConnection, moldId: number): Promise<any> {
  const rows = await conn.query<any[]>('SELECT * FROM `molds` WHERE `id` = ? LIMIT 1 FOR UPDATE', [moldId]);
  const mold = (rows[0] as any[])[0];
  if (!mold) throw new OpError(404, 'Kalıp bulunamadı.', 'MOLD_NOT_FOUND');
  return mold;
}

/** Hareket satırlarını doğrular: [{size, pairs, looseLeft?, looseRight?}], en az bir satır, çift ≥ 0. */
function parseMoldItems(body: any): { size: string; pairs: number; looseLeft: number; looseRight: number }[] {
  const raw = Array.isArray(body?.items) ? body.items : [];
  if (!raw.length) throw new OpError(400, 'En az bir numara satırı gereklidir.', 'NO_ITEMS');
  const items: { size: string; pairs: number; looseLeft: number; looseRight: number }[] = [];
  for (const it of raw) {
    const size = String(it?.size ?? '').trim();
    if (!size) throw new OpError(400, 'Numara (beden) zorunludur.', 'INVALID_SIZE');
    const pairs = Number(it?.pairs) || 0;
    const looseLeft = Math.max(0, Math.floor(Number(it?.looseLeft) || 0));
    const looseRight = Math.max(0, Math.floor(Number(it?.looseRight) || 0));
    if (pairs < 0) throw new OpError(400, `Çift miktarı negatif olamaz (${size}).`, 'INVALID_PAIRS');
    if (pairs === 0 && looseLeft === 0 && looseRight === 0) continue;
    items.push({ size, pairs: Number(pairs.toFixed(4)), looseLeft, looseRight });
  }
  if (!items.length) throw new OpError(400, 'Hareket miktarı sıfırdan büyük olmalıdır.', 'NO_QUANTITY');
  return items;
}

export function createBusinessOpsRouter(): { router: Router; deleteEffects: DeleteEffects } {
  const router = express.Router();

  /**
   * Silme motorunun (deletePolicy.ts) ihtiyaç duyduğu finansal yan etkiler.
   * Bu yardımcılar aşağıda closure olarak tanımlı; stok/bakiye matematiğinin
   * ikinci bir kopyası olmasın diye enjeksiyonla dışarı açılır.
   */
  const deleteEffects: DeleteEffects = {
    adjustBalance,
    lockContact,
    lockCashBox,
    lockBankAccount,
    applyInvoiceBalance,
    applyInvoiceOrderLink,
    resetWaybillsForInvoice,
    revertWaybillOrderShipments,
    applyWaybillStockReverse,
    applyInvoiceStock,
  };

  /* ---------------------------------------------------------------- */
  /* Atomik stok hareketi                                             */
  /* ---------------------------------------------------------------- */
  router.post('/stock-movement', async (req, res, next) => {
    try {
      const body = req.body || {};
      const productId = Number(body.productId);
      const quantity = Math.abs(Number(body.quantity));
      const type = String(body.type) as StockMovementType;

      if (!Number.isFinite(productId)) throw new OpError(400, 'Geçerli bir ürün seçilmelidir.');
      if (!Number.isFinite(quantity) || quantity <= 0) throw new OpError(400, 'Hareket miktarı sıfırdan büyük olmalıdır.');
      if (!STOCK_MOVEMENT_TYPES.includes(type)) {
        throw new OpError(400, `Geçersiz hareket tipi: ${type}. Geçerli değerler: ${STOCK_MOVEMENT_TYPES.join(', ')}`);
      }
      if (!String(body.description || '').trim()) throw new OpError(400, 'Hareket açıklaması zorunludur.');

      // Üretim giriş/çıkışları hem stok hem üretim modülünden tetiklenebilir.
      if (type === 'production_in' || type === 'production_out') {
        assertAnyPermission(
          req.auth,
          [
            ['inventory', 'edit'],
            ['production', 'edit'],
          ],
          'Stok hareketi için "Stok" veya "Üretim" modülünde düzenleme yetkisi gerekir.',
        );
      } else {
        assertAnyPermission(
          req.auth,
          [['inventory', 'edit']],
          'Stok hareketi için "Stok" modülünde düzenleme yetkisi gerekir.',
        );
      }

      const incoming = type === 'in' || type === 'production_in';
      const delta = incoming ? quantity : -quantity;
      const allowNegative = body.allowNegative === true;
      const unitCost = Number(body.unitCost);
      const variant = body.variant && typeof body.variant === 'object' ? body.variant : null;

      const withVersion = await versionSupported('products');

      const result = await withOperation(req, async (conn) => {
        await assertOpenPeriod(conn, 'accounting', new Date());
        const product = await lockProduct(conn, productId);
        const previousStock = Number(product.stock) || 0;
        await applySignedStockTx(conn, { productId, signedQuantity: delta, color: variant?.color || null, size: variant?.size || null, type, description: String(body.description).trim(), date: new Date(), writeLog: false, withVersion });
        const updated = await lockProduct(conn, productId);
        let cost = Number(product.buyingPrice) || 0;
        if (incoming && Number.isFinite(unitCost) && unitCost > 0) {
          cost = calculateWeightedAverageCost(previousStock, cost, quantity, unitCost);
          await writeProductStock(conn, productId, Number(updated.stock), null, cost, withVersion);
        }
        const logId = await insertInventoryLog(conn, { productId, type, quantity, description: String(body.description).trim(), color: variant?.color || null, size: variant?.size || null });
        await writeAuditInTx(conn, { action: 'update', module: 'inventory', entityId: productId, description: `Stok hareketi: ${product.name}, ${delta} ${product.unit}` }, { auth: req.auth, ip: clientIp(req) });
        const match = variant ? parseVariants(updated.variantBarcodes).find(item => (!variant.color || item.color === variant.color) && (!variant.size || item.size === variant.size)) : undefined;
        return { productId, productName: product.name, type, quantity, stock: Number(updated.stock), previousStock, variantStock: match ? Number(match.stock) : null, unitCost: cost || null, shortfall: 0, clamped: false, logId };
      });

      broadcast('products', 'update', [String(productId)]);
      broadcast('inventoryLogs', 'update', []);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Reçete (BOM) sarfiyatı + mamul girişi — tek transaction          */
  /* ---------------------------------------------------------------- */
  router.post('/consume-recipe', async (req, res, next) => {
    try {
      const body = req.body || {};
      const productId = Number(body.productId);
      const quantity = Number(body.quantity);

      if (!Number.isFinite(productId)) throw new OpError(400, 'Geçerli bir mamul ürün seçilmelidir.');
      if (!Number.isFinite(quantity) || quantity <= 0) throw new OpError(400, 'Üretim miktarı sıfırdan büyük olmalıdır.');

      assertAnyPermission(
        req.auth,
        [
          ['inventory', 'edit'],
          ['production', 'edit'],
        ],
        'Reçete sarfiyatı için "Stok" veya "Üretim" modülünde düzenleme yetkisi gerekir.',
      );

      const color = body.color ? String(body.color) : undefined;
      const size = body.size ? String(body.size) : undefined;
      const operator = body.operator ? String(body.operator) : undefined;
      const notes = body.notes ? String(body.notes) : undefined;
      const orderBarcode = body.orderBarcode ? String(body.orderBarcode) : undefined;
      const withVersion = await versionSupported('products');

      const result = await withOperation(req, async (conn) => {
        // 1) Reçeteyi seç: renk eşleşmesi → genel reçete → ilk reçete
        const recipeRows = await conn.query<any[]>(
          'SELECT `id`, `targetColor`, `ingredients` FROM `recipes` WHERE `productId` = ? ORDER BY `id` ASC',
          [productId],
        );
        const recipes = (recipeRows[0] as any[]) || [];
        const parseIngredients = (r: any): any[] => {
          const raw = r?.ingredients;
          if (Array.isArray(raw)) return raw;
          if (typeof raw === 'string') {
            try {
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          }
          return [];
        };

        const recipe = selectProductionRecipe(recipes.map(recipe => ({ ...recipe, productId })), productId, color);

        const ingredients = parseIngredients(recipe);
        if (!recipe || !ingredients.length) {
          throw new OpError(404, 'Bu model için tanımlı bir BOM (ürün reçetesi) bulunamadı.', 'RECIPE_NOT_FOUND');
        }

        const finished = await lockProduct(conn, productId);
        const now = new Date();
        const consumedList: any[] = [];

        for (const ingredient of ingredients.sort((a, b) => Number(a.productId) - Number(b.productId))) {
          const raw = await lockProduct(conn, Number(ingredient.productId));
          const needed = requiredIngredientQuantity(ingredient, quantity, raw.unit);
          if (!(needed > 0)) throw new OpError(400, 'Reçete sarfiyat miktarı geçersiz.');
          await applySignedStockTx(conn, { productId: raw.id, signedQuantity: -needed, color: ingredient.color || null, size: size || null, type: 'production_out', description: `Reçete sarfiyatı: ${finished.name}${orderBarcode ? ' | ' + orderBarcode : ''}`, date: now, writeLog: true, withVersion });
          const after = await lockProduct(conn, raw.id);
          consumedList.push({ productId: raw.id, name: raw.name, code: raw.code, unit: raw.unit, quantityPerPair: ingredientPerUnit(ingredient), totalConsumed: needed, remainingStock: Number(after.stock) });
        }
        await applySignedStockTx(conn, { productId, signedQuantity: quantity, color: color || null, size: size || null, type: 'production_in', description: `Reçeteli üretim: ${finished.name}${orderBarcode ? ' | ' + orderBarcode : ''}`, date: now, writeLog: true, withVersion });
        const finishedNewStock = Number((await lockProduct(conn, productId)).stock);
        await writeAuditInTx(conn, { action: 'create', module: 'production', entityId: productId, description: `Reçeteli üretim: ${quantity} ${finished.unit}; ${ingredients.length} malzeme` }, { auth: req.auth, ip: clientIp(req) });
        return {
          success: true,
          finishedProduct: {
            productId,
            name: finished.name,
            code: finished.code,
            quantityAdded: quantity,
            newStock: finishedNewStock,
          },
          consumedIngredients: consumedList,
          reference: { orderBarcode: orderBarcode ?? null, operator: operator ?? null, notes: notes ?? null, actor: actorName(req.auth) },
          timestamp: now.toISOString(),
        };
      });

      broadcast('products', 'update', []);
      broadcast('inventoryLogs', 'update', []);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Cari bakiye yeniden hesaplama (türetilmiş veri)                  */
  /* ---------------------------------------------------------------- */
  async function recalculateContactBalance(conn: PoolConnection, contactId: number, withVersion: boolean) {
    // Kilit, aynı cari için eşzamanlı hesaplamaların iç içe geçmesini engeller.
    const contactRows = await conn.query<any[]>(
      'SELECT `id` FROM `contacts` WHERE `id` = ? FOR UPDATE',
      [contactId],
    );
    if (!((contactRows[0] as any[]) || []).length) {
      throw new OpError(404, 'Cari bulunamadı.', 'CONTACT_NOT_FOUND');
    }

    const invoiceRows = await conn.query<any[]>(
      "SELECT `type`, `grandTotal`, `status` FROM `invoices` WHERE `contactId` = ?",
      [contactId],
    );
    const transactionRows = await conn.query<any[]>(
      'SELECT `type`, `amount`, `category`, `description` FROM `transactions` WHERE `contactId` = ?',
      [contactId],
    );

    let debit = 0;
    let credit = 0;

    for (const inv of (invoiceRows[0] as any[]) || []) {
      if (inv.status === 'cancelled' || inv.status === 'draft') continue;
      const total = Number(inv.grandTotal) || 0;
      if (inv.type === 'sales') debit += total;
      else credit += total;
    }

    for (const tx of (transactionRows[0] as any[]) || []) {
      const amount = Number(tx.amount) || 0;
      const isIncome = tx.type === 'income';
      const isOpening = tx.category === 'Açılış Bakiyesi' || String(tx.description || '').includes('Açılış');
      if (isOpening) {
        if (amount > 0 && isIncome) debit += amount;
        else credit += amount;
      } else if (isIncome) {
        credit += amount;
      } else {
        debit += amount;
      }
    }

    const balance = Number((debit - credit).toFixed(2));
    await conn.query(
      `UPDATE \`contacts\` SET \`balance\` = ?${withVersion ? ', `version` = `version` + 1' : ''}, \`updatedAt\` = NOW() WHERE \`id\` = ?`,
      [balance, contactId],
    );

    return { contactId, balance, debit: Number(debit.toFixed(2)), credit: Number(credit.toFixed(2)) };
  }

  router.post('/recalculate-contact-balance', async (req, res, next) => {
    try {
      const contactId = Number(req.body?.contactId);
      if (!Number.isFinite(contactId)) throw new OpError(400, 'Geçerli bir cari seçilmelidir.');

      assertAnyPermission(
        req.auth,
        [
          ['contacts', 'edit'],
          ['finance', 'edit'],
        ],
        'Cari bakiye hesaplaması için "Cari Hesaplar" veya "Finans" modülünde düzenleme yetkisi gerekir.',
      );

      const withVersion = await versionSupported('contacts');
      const result = await withTransaction((conn) => recalculateContactBalance(conn, contactId, withVersion));
      res.json({ data: { ...result, actor: actorName(req.auth), ip: clientIp(req) } });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Finansal işlemler: tahsilat/tediye, virman, çek durumu           */
  /*                                                                  */
  /* Cari + kasa/banka + çek + makbuz + transaction + muhasebe fişi    */
  /* ve denetim kaydı TEK transaction içinde, satır kilitleri altında  */
  /* ve göreli (balance = balance ± ?) deltas ile yazılır.             */
  /* ---------------------------------------------------------------- */

  const RECEIPT_TYPES = ['collection', 'disbursement'] as const;
  const INSTRUMENTS = ['cash', 'bank', 'check', 'credit_card'] as const;
  const CHECK_STATUSES = ['portfolio', 'bank_collection', 'collected', 'endorsed', 'bounced', 'returned'] as const;

  async function nextDocumentNumber(conn: PoolConnection, table: string, prefix: string, pad: number): Promise<string> {
    return allocateDocumentNumber(conn, { table, prefix, pad });
  }

  interface JournalLineInput {
    accountCode: string;
    accountName: string;
    description: string;
    debit: number;
    credit: number;
    contactId?: number | null;
  }

  /** Dengeli yevmiye fişini transaction içinde oluşturur; fiş numarasını sunucu üretir. */
  async function insertJournalEntry(
    conn: PoolConnection,
    input: {
      entryType: string;
      date: Date;
      description: string;
      documentType?: string | null;
      documentId?: number | null;
      documentNumber?: string | null;
      lines: JournalLineInput[];
    },
  ): Promise<number> {
    await assertOpenPeriod(conn, 'accounting', input.date);
    const { totalDebit, totalCredit } = assertBalancedJournalEntry(input.lines as any);
    const prefix = journalPrefixFor(input.entryType);
    const entryNumber = await nextDocumentNumber(conn, 'journalEntries', prefix, 6);
    const stamp = Date.now();
    const lines = input.lines.map((l, i) => ({
      id: `line-${stamp}-${i + 1}`,
      accountCode: l.accountCode,
      accountName: l.accountName,
      description: l.description,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      ...(l.contactId ? { contactId: l.contactId } : {}),
    }));
    const [result] = await conn.query(
      `INSERT INTO \`journalEntries\`
         (\`entryNumber\`, \`entryType\`, \`date\`, \`description\`, \`documentType\`, \`documentId\`, \`documentNumber\`, \`lines\`, \`totalDebit\`, \`totalCredit\`, \`isBalanced\`, \`status\`, \`createdAt\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'approved', NOW())`,
      [
        entryNumber,
        input.entryType,
        input.date,
        input.description,
        input.documentType ?? null,
        input.documentId ?? null,
        input.documentNumber ?? null,
        JSON.stringify(lines),
        totalDebit,
        totalCredit,
      ],
    );
    return Number((result as any)?.insertId || 0);
  }

  async function lockContact(conn: PoolConnection, id: number) {
    const rows = await conn.query<any[]>(
      'SELECT `id`, `name`, `type`, `balance`, `accountCode` FROM `contacts` WHERE `id` = ? FOR UPDATE',
      [id],
    );
    const row = (rows[0] as any[])[0];
    if (!row) throw new OpError(404, 'Cari hesap bulunamadı.', 'CONTACT_NOT_FOUND');
    return row;
  }

  async function lockCashBox(conn: PoolConnection, id: number) {
    const rows = await conn.query<any[]>(
      'SELECT `id`, `name`, `currency`, `accountCode`, `balance` FROM `cashBoxes` WHERE `id` = ? FOR UPDATE',
      [id],
    );
    const row = (rows[0] as any[])[0];
    if (!row) throw new OpError(404, 'Kasa bulunamadı.', 'CASHBOX_NOT_FOUND');
    return row;
  }

  async function lockBankAccount(conn: PoolConnection, id: number) {
    const rows = await conn.query<any[]>(
      'SELECT `id`, `bankName`, `branchName`, `iban`, `currency`, `accountCode`, `balance` FROM `bankAccounts` WHERE `id` = ? FOR UPDATE',
      [id],
    );
    const row = (rows[0] as any[])[0];
    if (!row) throw new OpError(404, 'Banka hesabı bulunamadı.', 'BANK_NOT_FOUND');
    return row;
  }

  /**
   * Göreli bakiye güncellemesi: `balance = balance ± delta` satır kilidi altında
   * uygulandığından eşzamanlı işlemler birbirinin yazmasını ezmez (lost update yok).
   */
  async function adjustBalance(
    conn: PoolConnection,
    table: 'cashBoxes' | 'bankAccounts' | 'contacts',
    id: number,
    delta: number,
    withVersion: boolean,
  ): Promise<void> {
    const touch = table === 'contacts' ? ', `updatedAt` = NOW()' : '';
    await conn.query(
      `UPDATE \`${table}\` SET \`balance\` = ROUND(\`balance\` + ?, 2)${withVersion ? ', `version` = `version` + 1' : ''}${touch} WHERE \`id\` = ?`,
      [delta, id],
    );
  }

  /* ---------------------- Tahsilat / Tediye ------------------------ */
  router.post('/receipt', async (req, res, next) => {
    try {
      const body = req.body || {};
      const type = String(body.type);
      const instrument = String(body.instrument);
      const contactId = Number(body.contactId);
      const amount = Number(body.amount);

      if (!(RECEIPT_TYPES as readonly string[]).includes(type)) throw new OpError(400, 'Geçersiz makbuz tipi.');
      if (!(INSTRUMENTS as readonly string[]).includes(instrument)) throw new OpError(400, 'Geçersiz ödeme aracı.');
      if (!Number.isFinite(contactId)) throw new OpError(400, 'Geçerli bir cari hesap seçilmelidir.');
      if (!Number.isFinite(amount) || amount <= 0) throw new OpError(400, 'Tutar sıfırdan büyük olmalıdır.');
      if (!can(req.auth?.role || null, 'finance', 'create')) {
        throw new OpError(403, 'Tahsilat/tediye kaydı için "Finans" modülünde oluşturma yetkisi gerekir.', 'FORBIDDEN');
      }

      const receiptDate = body.date ? new Date(body.date) : new Date();
      if (Number.isNaN(receiptDate.getTime())) throw new OpError(400, 'Geçersiz işlem tarihi.');
      const currency = body.currency ? String(body.currency) : 'TRY';
      const cashBoxId = body.cashBoxId ? Number(body.cashBoxId) : null;
      const bankAccountId = body.bankAccountId ? Number(body.bankAccountId) : null;
      const invoiceId = body.invoiceId ? Number(body.invoiceId) : null;
      try { assertReceiptInput({ type, instrument, amount, cashBoxId, bankAccountId, currency }); }
      catch (error) { throw new OpError(400, (error as Error).message, 'INVALID_RECEIPT'); }

      const withVersionCash = await versionSupported('cashBoxes');
      const withVersionBank = await versionSupported('bankAccounts');
      const withVersionContact = await versionSupported('contacts');

      const result = await withOperation(req, async (conn) => {
        await assertOpenPeriod(conn, 'accounting', receiptDate);
        const contact = await lockContact(conn, contactId);
        const isCollection = type === 'collection';

        // 1) Çek/Senet: portföy kaydı aynı transaction içinde oluşturulur
        let checkId: number | null = null;
        if (instrument === 'check') {
          const cd = body.checkData && typeof body.checkData === 'object' ? body.checkData : null;
          if (!cd) throw new OpError(400, 'Çek/Senet bilgileri girilmelidir.');
          const dueDate = cd.dueDate ? new Date(cd.dueDate) : null;
          if (!dueDate || Number.isNaN(dueDate.getTime())) throw new OpError(400, 'Çek/Senet vade tarihi zorunludur.');
          const issueDate = cd.issueDate ? new Date(cd.issueDate) : receiptDate;
          const checkType = isCollection ? 'received_check' : 'given_check';
          const portfolioNumber = await nextDocumentNumber(conn, 'checks', 'CEK', 4);
          const [checkResult] = await conn.query(
            `INSERT INTO \`checks\`
               (\`type\`, \`portfolioNumber\`, \`serialNumber\`, \`bankName\`, \`branchName\`, \`drawer\`, \`contactId\`, \`contactName\`, \`issueDate\`, \`dueDate\`, \`amount\`, \`currency\`, \`status\`, \`accountCode\`, \`notes\`, \`createdAt\`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'portfolio', ?, ?, NOW())`,
            [
              checkType,
              portfolioNumber,
              String(cd.serialNumber || ''),
              cd.bankName ?? null,
              cd.branchName ?? null,
              String(cd.drawer || contact.name),
              contactId,
              contact.name,
              issueDate,
              dueDate,
              amount,
              currency,
              isCollection ? '101.01' : '103.01',
              cd.notes ?? null,
            ],
          );
          checkId = Number((checkResult as any)?.insertId || 0);
        }

        // 2) Kasa/Banka bakiyesi: satır kilidi + göreli delta
        let cashRow: any = null;
        let bankRow: any = null;
        const signedDelta = isCollection ? amount : -amount;
        if (instrument === 'cash' && cashBoxId) {
          cashRow = await lockCashBox(conn, cashBoxId);
          if ((cashRow.currency || 'TRY') !== currency) throw new OpError(400, 'Kasa para birimi işlemle uyuşmuyor.', 'CURRENCY_MISMATCH');
          await adjustBalance(conn, 'cashBoxes', cashBoxId, signedDelta, withVersionCash);
        } else if (instrument === 'bank' && bankAccountId) {
          bankRow = await lockBankAccount(conn, bankAccountId);
          if ((bankRow.currency || 'TRY') !== currency) throw new OpError(400, 'Banka para birimi işlemle uyuşmuyor.', 'CURRENCY_MISMATCH');
          await adjustBalance(conn, 'bankAccounts', bankAccountId, signedDelta, withVersionBank);
        }

        // 3) Cari bakiye (müşteri/tedarikçi ayrımı matematiksel olarak aynı deltaya iner)
        await adjustBalance(conn, 'contacts', contactId, isCollection ? -amount : amount, withVersionContact);

        // 4) Fatura ödeme durumu
        if (invoiceId) {
          const invRows = await conn.query<any[]>(
            'SELECT `id`, `contactId`, `type`, `status`, `currency`, `grandTotal`, `paidAmount` FROM `invoices` WHERE `id` = ? FOR UPDATE',
            [invoiceId],
          );
          const inv = (invRows[0] as any[])[0];
          if (!inv) throw new OpError(404, 'Ödenecek fatura bulunamadı.', 'INVOICE_NOT_FOUND');
          try { assertInvoicePayment(inv, { contactId, type, amount, currency }); }
          catch (error) { throw new OpError(400, (error as Error).message, 'INVALID_INVOICE_PAYMENT'); }
          if (inv) {
            const newPaid = Number(((Number(inv.paidAmount) || 0) + amount).toFixed(2));
            const grandTotal = Number(inv.grandTotal) || 0;
            const paymentStatus = newPaid >= grandTotal ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
            await conn.query(
              'UPDATE `invoices` SET `paidAmount` = ?, `paymentStatus` = ?, `updatedAt` = NOW() WHERE `id` = ?',
              [newPaid, paymentStatus, invoiceId],
            );
          }
        }

        // 5) Makbuz numarası + hareket kaydı (geriye dönük uyumluluk tablosu)
        const receiptNumber = await nextDocumentNumber(conn, 'collectionReceipts', isCollection ? 'THS' : 'TED', 6);
        await conn.query(
          `INSERT INTO \`transactions\` (\`contactId\`, \`type\`, \`amount\`, \`description\`, \`category\`, \`paymentMethod\`, \`documentNo\`, \`date\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            contactId,
            isCollection ? 'income' : 'expense',
            amount,
            String(body.description || `${isCollection ? 'Tahsilat' : 'Tediye'} - Makbuz No: ${receiptNumber}`),
            isCollection ? 'Tahsilat' : 'Ödeme',
            instrument === 'cash' ? 'cash' : instrument === 'bank' ? 'bank_transfer' : instrument === 'check' ? 'check' : 'credit_card',
            receiptNumber,
            receiptDate,
          ],
        );

        // 6) Tahsilat/Tediye makbuzu
        const [receiptResult] = await conn.query(
          `INSERT INTO \`collectionReceipts\`
             (\`receiptNumber\`, \`type\`, \`date\`, \`contactId\`, \`contactName\`, \`instrument\`, \`cashBoxId\`, \`bankAccountId\`, \`checkId\`, \`amount\`, \`currency\`, \`description\`, \`invoiceId\`, \`invoiceNumber\`, \`isAccounted\`, \`createdAt\`)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())`,
          [
            receiptNumber,
            type,
            receiptDate,
            contactId,
            contact.name,
            instrument,
            cashBoxId,
            bankAccountId,
            checkId,
            amount,
            currency,
            body.description ?? null,
            invoiceId,
            body.invoiceNumber ?? null,
          ],
        );
        const receiptId = Number((receiptResult as any)?.insertId || 0);

        // 7) TDHP muhasebe fişi — makbuzla aynı transaction içinde
        let assetAccountCode = '100.01';
        let assetAccountName = 'Merkez TL Kasası';
        if (instrument === 'bank') {
          assetAccountCode = bankRow?.accountCode || '102.01';
          assetAccountName = bankRow ? `${bankRow.bankName} (${bankRow.iban})` : 'Garanti BBVA Vadesiz TL Hesabı';
        } else if (instrument === 'check') {
          assetAccountCode = isCollection ? '101.01' : '103.01';
          assetAccountName = isCollection ? 'Portföydeki Alınan Çekler' : 'Verilen Firma Çekleri';
        } else if (instrument === 'credit_card') {
          assetAccountCode = '108.01';
          assetAccountName = 'Kredi Kartı Slip Alacakları';
        } else if (cashRow) {
          assetAccountCode = cashRow.accountCode || '100.01';
          assetAccountName = cashRow.name;
        }

        let contactAccountCode = isCollection ? '120.01' : '320.01';
        let contactAccountName = isCollection
          ? `Yurtiçi Müşteriler Cari Hesabı (${contact.name})`
          : `Yurtiçi Mal ve Hizmet Tedarikçileri (${contact.name})`;
        const accCode = String(contact.accountCode || '').trim();
        if (accCode) {
          contactAccountCode = accCode;
          const accRows = await conn.query<any[]>('SELECT `name` FROM `accounts` WHERE `code` = ? LIMIT 1', [accCode]);
          const acc = (accRows[0] as any[])[0];
          contactAccountName = acc?.name || `${isCollection ? 'Alıcılar' : 'Satıcılar'} - ${contact.name}`;
        }

        const description = String(body.description || '');
        const lines: JournalLineInput[] = isCollection
          ? [
              { accountCode: assetAccountCode, accountName: assetAccountName, description: `Tahsilat (${receiptNumber}): ${description || contact.name}`, debit: amount, credit: 0 },
              { accountCode: contactAccountCode, accountName: contactAccountName, description: `Müşteri Tahsilatı - Makbuz No: ${receiptNumber}`, debit: 0, credit: amount, contactId },
            ]
          : [
              { accountCode: contactAccountCode, accountName: contactAccountName, description: `Tedarikçi Ödemesi - Makbuz No: ${receiptNumber}`, debit: amount, credit: 0, contactId },
              { accountCode: assetAccountCode, accountName: assetAccountName, description: `Tediye (${receiptNumber}): ${description || contact.name}`, debit: 0, credit: amount },
            ];

        const journalEntryId = await insertJournalEntry(conn, {
          entryType: instrument === 'cash' ? (isCollection ? 'tahsil' : 'tediye') : 'mahsup',
          date: receiptDate,
          description: `${isCollection ? 'Tahsilat' : 'Tediye'} Fişi: ${contact.name} (${receiptNumber})`,
          documentType: isCollection ? 'collection' : 'disbursement',
          documentId: receiptId,
          documentNumber: receiptNumber,
          lines,
        });

        await conn.query(
          'UPDATE `collectionReceipts` SET `journalEntryId` = ?, `isAccounted` = 1 WHERE `id` = ?',
          [journalEntryId, receiptId],
        );

        // 8) Denetim kaydı (aynı transaction)
        await writeAuditInTx(conn, {
          action: 'create',
          module: 'finance',
          description: `${isCollection ? 'Tahsilat' : 'Tediye'} makbuzu ${receiptNumber}: ${contact.name} — ${amount.toLocaleString('tr-TR')} ${currency} (${instrument})`,
          entityId: receiptId,
        }, { auth: req.auth, ip: clientIp(req) });

        return { receiptId, receiptNumber, checkId, journalEntryId };
      });

      // Açık ekranlara değişikliği duyur (SSE)
      for (const r of ['collectionReceipts', 'transactions', 'contacts', 'journalEntries']) broadcast(r, 'update', []);
      if (instrument === 'cash') broadcast('cashBoxes', 'update', []);
      if (instrument === 'bank') broadcast('bankAccounts', 'update', []);
      if (instrument === 'check') broadcast('checks', 'update', []);
      if (invoiceId) broadcast('invoices', 'update', []);

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* --------------------------- Virman ------------------------------ */
  router.post('/transfer', async (req, res, next) => {
    try {
      const body = req.body || {};
      const fromType = String(body.fromType);
      const toType = String(body.toType);
      const fromId = Number(body.fromId);
      const toId = Number(body.toId);
      const amount = Number(body.amount);

      if (!['cash', 'bank'].includes(fromType) || !['cash', 'bank'].includes(toType)) {
        throw new OpError(400, 'Kaynak/hedef hesap tipi geçersiz.');
      }
      if (!Number.isFinite(fromId) || !Number.isFinite(toId)) throw new OpError(400, 'Kaynak ve hedef hesap seçilmelidir.');
      if (!Number.isFinite(amount) || amount <= 0) throw new OpError(400, 'Virman tutarı sıfırdan büyük olmalıdır.');
      if (!can(req.auth?.role || null, 'finance', 'create')) {
        throw new OpError(403, 'Virman için "Finans" modülünde oluşturma yetkisi gerekir.', 'FORBIDDEN');
      }

      const transferDate = body.date ? new Date(body.date) : new Date();
      if (Number.isNaN(transferDate.getTime())) throw new OpError(400, 'Geçersiz işlem tarihi.');

      const withVersionCash = await versionSupported('cashBoxes');
      const withVersionBank = await versionSupported('bankAccounts');

      const result = await withOperation(req, async (conn) => {
        // Kilitler sabit sırada alınır: eşzamanlı ters yönlü virmanlarda deadlock olmaz.
        await assertOpenPeriod(conn, 'accounting', transferDate);
        if (fromType === toType && fromId === toId) throw new OpError(400, 'Kaynak ve hedef hesap aynı olamaz.');
        const targets = [
          { kind: fromType, id: fromId },
          { kind: toType, id: toId },
        ].sort((a, b) => (a.kind === b.kind ? a.id - b.id : a.kind === 'bank' ? -1 : 1));

        const locked = new Map<string, any>();
        for (const t of targets) {
          const key = `${t.kind}:${t.id}`;
          if (locked.has(key)) continue;
          locked.set(key, t.kind === 'cash' ? await lockCashBox(conn, t.id) : await lockBankAccount(conn, t.id));
        }
        const fromRow = locked.get(`${fromType}:${fromId}`);
        const toRow = locked.get(`${toType}:${toId}`);
        if ((fromRow.currency || 'TRY') !== 'TRY' || (toRow.currency || 'TRY') !== 'TRY') throw new OpError(400, 'Dövizli virman etkin değil. TRY hesaplar seçilmelidir.', 'CURRENCY_MISMATCH');

        if ((Number(fromRow.balance) || 0) < amount) {
          throw new OpError(
            400,
            fromType === 'cash'
              ? 'Kaynak kasada yeterli bakiye bulunmamaktadır.'
              : 'Kaynak banka hesabında yeterli bakiye bulunmamaktadır.',
          );
        }

        const describe = (kind: string, row: any) => (kind === 'cash' ? String(row.name) : `${row.bankName} (${row.iban})`);
        const accountOf = (kind: string, row: any) => String(row.accountCode || (kind === 'cash' ? '100.01' : '102.01'));

        const fromName = describe(fromType, fromRow);
        const toName = describe(toType, toRow);

        await adjustBalance(conn, fromType === 'cash' ? 'cashBoxes' : 'bankAccounts', fromId, -amount, fromType === 'cash' ? withVersionCash : withVersionBank);
        await adjustBalance(conn, toType === 'cash' ? 'cashBoxes' : 'bankAccounts', toId, amount, toType === 'cash' ? withVersionCash : withVersionBank);

        const label = String(body.description || '') || `${fromName} -> ${toName}`;
        const entryId = await insertJournalEntry(conn, {
          entryType: 'mahsup',
          date: transferDate,
          description: `Hesaplar Arası Virman: ${fromName} -> ${toName} (₺${amount.toLocaleString('tr-TR')})`,
          documentType: 'manual',
          lines: [
            { accountCode: accountOf(toType, toRow), accountName: toName, description: `Virman Girişi: ${label}`, debit: amount, credit: 0 },
            { accountCode: accountOf(fromType, fromRow), accountName: fromName, description: `Virman Çıkışı: ${label}`, debit: 0, credit: amount },
          ],
        });

        await writeAuditInTx(conn, {
          action: 'create',
          module: 'finance',
          description: `Virman: ${fromName} → ${toName} (${amount.toLocaleString('tr-TR')} ₺)`,
          entityId: entryId,
        }, { auth: req.auth, ip: clientIp(req) });

        return { entryId, fromName, toName, amount };
      });

      broadcast('cashBoxes', 'update', []);
      broadcast('bankAccounts', 'update', []);
      broadcast('journalEntries', 'update', []);

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* --------------------- Çek/Senet durum geçişi -------------------- */
  router.post('/check-status', async (req, res, next) => {
    try {
      const body = req.body || {};
      const checkId = Number(body.checkId);
      const newStatus = String(body.newStatus);

      if (!Number.isFinite(checkId)) throw new OpError(400, 'Geçerli bir çek/senet seçilmelidir.');
      if (!(CHECK_STATUSES as readonly string[]).includes(newStatus)) throw new OpError(400, `Geçersiz çek durumu: ${newStatus}`);
      if (!can(req.auth?.role || null, 'finance', 'edit')) {
        throw new OpError(403, 'Çek durumu güncellemesi için "Finans" modülünde düzenleme yetkisi gerekir.', 'FORBIDDEN');
      }

      const actionDate = body.date ? new Date(body.date) : new Date();
      if (Number.isNaN(actionDate.getTime())) throw new OpError(400, 'Geçersiz işlem tarihi.');

      const targetBankAccountId = body.targetBankAccountId ? Number(body.targetBankAccountId) : null;
      const targetCashBoxId = body.targetCashBoxId ? Number(body.targetCashBoxId) : null;
      const endorsedToContactId = body.endorsedToContactId ? Number(body.endorsedToContactId) : null;

      const withVersionCash = await versionSupported('cashBoxes');
      const withVersionBank = await versionSupported('bankAccounts');
      const withVersionContact = await versionSupported('contacts');
      const withVersionCheck = await versionSupported('checks');

      const result = await withOperation(req, async (conn) => {
        const checkRows = await conn.query<any[]>(
          'SELECT `id`, `type`, `amount`, `portfolioNumber`, `serialNumber`, `drawer`, `statusNotes`, `endorsedToContactId`, `endorsedToContactName` FROM `checks` WHERE `id` = ? FOR UPDATE',
          [checkId],
        );
        const check = (checkRows[0] as any[])[0];
        if (!check) throw new OpError(404, 'Çek/Senet kaydı bulunamadı.', 'CHECK_NOT_FOUND');
        const amount = Number(check.amount) || 0;

        let destAccountCode = '102.01';
        let destAccountName = 'Bankalar';
        let endorsedName = check.endorsedToContactName;

        // 1) Alınan çek tahsil edildi: banka/kasa girişi
        if (check.type === 'received_check' && newStatus === 'collected') {
          if (targetBankAccountId) {
            const bank = await lockBankAccount(conn, targetBankAccountId);
            await adjustBalance(conn, 'bankAccounts', targetBankAccountId, amount, withVersionBank);
            destAccountCode = bank.accountCode || '102.01';
            destAccountName = `${bank.bankName} (${bank.iban})`;
          } else if (targetCashBoxId) {
            const cash = await lockCashBox(conn, targetCashBoxId);
            await adjustBalance(conn, 'cashBoxes', targetCashBoxId, amount, withVersionCash);
            destAccountCode = cash.accountCode || '100.01';
            destAccountName = cash.name;
          }
        }

        // 2) Alınan çek ciro edildi: tedarikçi borcu azalır
        let endorsedTarget: any = null;
        if (check.type === 'received_check' && newStatus === 'endorsed' && endorsedToContactId) {
          endorsedTarget = await lockContact(conn, endorsedToContactId);
          await adjustBalance(conn, 'contacts', endorsedToContactId, amount, withVersionContact);
          endorsedName = endorsedTarget.name;
        }

        // 3) Verilen çek bankadan ödendi
        let givenBank: any = null;
        if (check.type === 'given_check' && newStatus === 'collected' && targetBankAccountId) {
          givenBank = await lockBankAccount(conn, targetBankAccountId);
          await adjustBalance(conn, 'bankAccounts', targetBankAccountId, -amount, withVersionBank);
        }

        // 4) Çek kaydı güncelle
        await conn.query(
          `UPDATE \`checks\` SET \`status\` = ?, \`statusChangeDate\` = ?, \`statusNotes\` = ?, \`endorsedToContactId\` = ?, \`endorsedToContactName\` = ?${withVersionCheck ? ', `version` = `version` + 1' : ''} WHERE \`id\` = ?`,
          [
            newStatus,
            actionDate,
            body.notes ? String(body.notes) : check.statusNotes,
            endorsedToContactId || check.endorsedToContactId || null,
            endorsedName ?? null,
            checkId,
          ],
        );

        // 5) Muhasebe fişleri — aynı transaction
        if (check.type === 'received_check' && newStatus === 'collected') {
          await insertJournalEntry(conn, {
            entryType: 'mahsup',
            date: actionDate,
            description: `Alınan Çek Tahsilatı: ${check.portfolioNumber} (${check.drawer})`,
            documentType: 'check',
            documentId: checkId,
            documentNumber: check.portfolioNumber,
            lines: [
              { accountCode: destAccountCode, accountName: destAccountName, description: `Çek Tahsilat Bedeli - ${check.portfolioNumber}`, debit: amount, credit: 0 },
              { accountCode: '101.01', accountName: 'Portföydeki Çekler', description: `Tahsil Edilen Çek Çıkışı - ${check.serialNumber}`, debit: 0, credit: amount },
            ],
          });
        }
        if (check.type === 'received_check' && newStatus === 'endorsed' && endorsedTarget) {
          await insertJournalEntry(conn, {
            entryType: 'mahsup',
            date: actionDate,
            description: `Çek Cirosu: ${check.portfolioNumber} -> ${endorsedTarget.name}`,
            documentType: 'check',
            documentId: checkId,
            documentNumber: check.portfolioNumber,
            lines: [
              { accountCode: '320.01', accountName: `Yurtiçi Mal ve Hizmet Tedarikçileri (${endorsedTarget.name})`, description: `Çek Cirosu ile Borç Ödemesi - ${check.portfolioNumber}`, debit: amount, credit: 0, contactId: endorsedTarget.id },
              { accountCode: '101.01', accountName: 'Portföydeki Çekler', description: `Ciro Edilen Çek Çıkışı - ${check.serialNumber}`, debit: 0, credit: amount },
            ],
          });
        }
        if (check.type === 'given_check' && newStatus === 'collected' && givenBank) {
          await insertJournalEntry(conn, {
            entryType: 'mahsup',
            date: actionDate,
            description: `Verilen Çek Bankadan Ödendi: ${check.portfolioNumber} (${givenBank.bankName})`,
            documentType: 'check',
            documentId: checkId,
            documentNumber: check.portfolioNumber,
            lines: [
              { accountCode: '103.01', accountName: 'Verilen Firma Çekleri', description: `Ödenen Çek Kapanışı - ${check.serialNumber}`, debit: amount, credit: 0 },
              { accountCode: givenBank.accountCode || '102.01', accountName: `${givenBank.bankName} (${givenBank.iban})`, description: `Çek Ödemesi - ${check.portfolioNumber}`, debit: 0, credit: amount },
            ],
          });
        }

        // 6) Denetim kaydı (aynı transaction)
        await writeAuditInTx(conn, {
          action: 'update',
          module: 'finance',
          description: `Çek/Senet durumu güncellendi: ${check.portfolioNumber} → ${newStatus}`,
          entityId: checkId,
        }, { auth: req.auth, ip: clientIp(req) });

        return { checkId, status: newStatus };
      });

      broadcast('checks', 'update', []);
      broadcast('journalEntries', 'update', []);
      if (targetBankAccountId) broadcast('bankAccounts', 'update', []);
      if (targetCashBoxId) broadcast('cashBoxes', 'update', []);
      if (endorsedToContactId) broadcast('contacts', 'update', []);

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Fatura / irsaliye stok düşümü — türetilmiş alanlar için tek uç    */
  /*                                                                  */
  /* products.stock + variantBarcodes artık generic CRUD'a kapalı;     */
  /* fatura akışı stok değişimini yalnızca buradan yapar. İstemcideki   */
  /* applyItemStockMovement'in birebir sunucu portudur.                */
  /* ---------------------------------------------------------------- */

  const SIZE_AGNOSTIC = ['Asorti', 'Tüm Bedenler', 'Standart', 'Tümü'];

  /**
   * İmzalı bir stok miktarını (signedQuantity) ürün satırını kilitleyerek uygular;
   * varyant (renk × beden) dağılımı, asorti oranı ve kenar durumlar istemcideki
   * eski `applyItemStockMovement` mantığıyla birebir aynıdır. Fatura, irsaliye ve
   * üretim akışlarının tümü bu ortak çekirdeği kullanır.
   */
  async function applySignedStockTx(
    conn: PoolConnection,
    input: {
      productId: number;
      signedQuantity: number;
      color?: string | null;
      size?: string | null;
      type: StockMovementType;
      description: string;
      date?: Date | null;
      writeLog: boolean;
      withVersion: boolean;
    },
  ): Promise<void> {
    const productId = Number(input.productId);
    const signedQuantity = Number(input.signedQuantity) || 0;
    const quantity = Math.abs(signedQuantity);
    if (!Number.isFinite(productId) || quantity <= 0) return;
    await assertOpenPeriod(conn, 'accounting', input.date ?? new Date());
    const deltaSign = signedQuantity < 0 ? -1 : 1;

    const rows = await conn.query<any[]>(
      `SELECT \`id\`, \`name\`, \`unit\`, \`stock\`, \`variantBarcodes\`, ${PRODUCT_COLORS_SQL} AS \`colors\`, \`assortment\`, \`assortmentTemplateId\`, \`isFootwear\`, \`hasSizeVariants\`
       FROM \`products\` WHERE \`id\` = ? FOR UPDATE`,
      [productId],
    );
    const product = (rows[0] as any[])[0];
    if (!product) throw new OpError(404, 'Ürün bulunamadı.', 'PRODUCT_NOT_FOUND');

    if (quantityDecimals(product.unit) === 0 && !Number.isInteger(quantity)) throw new OpError(400, 'Adet/çift miktarı tam sayı olmalıdır.', 'INVALID_QUANTITY');
    if (signedQuantity < 0 && Number(product.stock) + signedQuantity < -0.00001) throw new OpError(409, `${product.name}: yetersiz stok.`, 'INSUFFICIENT_STOCK');
    if (signedQuantity < 0) await assertUnreservedStock(conn, product as any, quantity);

    const moveType: StockMovementType = input.type;
    const baseDescription = input.description;

    const parseList = (raw: unknown): any[] => {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw.map((v) => ({ ...v }));
      if (typeof raw === 'string') {
        try { const p = JSON.parse(raw); return Array.isArray(p) ? p.map((v: any) => ({ ...v })) : []; } catch { return []; }
      }
      return [];
    };

    const hasVariants = product.isFootwear || product.hasSizeVariants || parseList(product.variantBarcodes).length > 0;

    if (!hasVariants) {
      const newStock = Math.max(0, Math.round(((Number(product.stock) || 0) + deltaSign * quantity) * 10000) / 10000);
      await writeProductStock(conn, productId, newStock, null, null, input.withVersion);
      if (input.writeLog) {
        await insertInventoryLog(conn, {
          productId,
          type: moveType,
          quantity,
          date: input.date ?? null,
          description: `${baseDescription} (${deltaSign > 0 ? '+' : '-'}${quantity} ${product.unit || 'Adet'})`,
          color: input.color ?? null,
          size: input.size ?? null,
        });
      }
      return;
    }

    const variants = parseList(product.variantBarcodes);

    if (Math.abs(variants.reduce((sum: number, variant: any) => sum + Number(variant.stock || 0), 0) - Number(product.stock || 0)) > 0.0001) {
      throw new OpError(409, `${product.name}: ürün toplamı ile varyant stokları farklı. Önce varyant stoklarını uzlaştırın.`, 'VARIANT_RECONCILIATION_REQUIRED');
    }

    let assortment = parseList(product.assortment);
    if ((!assortment || assortment.length === 0) && product.assortmentTemplateId) {
      const tRows = await conn.query<any[]>(
        'SELECT `items` FROM `assortmentTemplates` WHERE `id` = ?',
        [product.assortmentTemplateId],
      );
      const tmpl = (tRows[0] as any[])[0];
      if (tmpl) assortment = parseList(tmpl.items);
    }

    const colorsList: string[] = parseColorNames(product.colors);

    if (variants.length === 0) {
      const colors = colorsList.length > 0 ? colorsList : ['Genel'];
      if (assortment && assortment.length > 0) {
        for (const color of colors) {
          for (const it of assortment) {
            variants.push({ size: it.size, color, barcode: '', stock: 0 });
          }
        }
      }
    }

    const effectiveColor = (input.color && String(input.color).trim()) || (colorsList.length > 0 ? colorsList[0] : (variants[0]?.color || 'Genel'));
    const sizeTrim = input.size ? String(input.size).trim() : '';
    const isSpecificSize = Boolean(sizeTrim) && !SIZE_AGNOSTIC.includes(sizeTrim);

    let logDetailText = '';

    if (isSpecificSize) {
      const targetSize = sizeTrim;
      let targetVar = variants.find((v) => v.size === targetSize && v.color === effectiveColor);
      if (!targetVar && !input.color) targetVar = variants.find((v) => v.size === targetSize);
      if (targetVar) {
        targetVar.stock = (Number(targetVar.stock) || 0) + deltaSign * quantity;
      } else {
        variants.push({ size: targetSize, color: effectiveColor, barcode: '', stock: deltaSign * quantity });
      }
      logDetailText = `${effectiveColor ? effectiveColor + ' ' : ''}Beden ${targetSize}: ${deltaSign > 0 ? '+' : ''}${deltaSign * quantity} ${product.unit || 'Çift'}`;
    } else {
      let colorVariants = variants.filter((v) => v.color === effectiveColor);
      if (colorVariants.length === 0 && !input.color) colorVariants = variants;
      if (colorVariants.length === 0 && signedQuantity < 0) throw new OpError(409, 'Seçilen renkte yeterli varyant stoğu bulunamadı.', 'INSUFFICIENT_VARIANT_STOCK');

      if (assortment && assortment.length > 0) {
        const totalRatio = assortment.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0);
        if (totalRatio > 0) {
          // Ağırlıklı (asorti oranlı) dağıtım; toplam her zaman `quantity`e tam eşit.
          const shares = distributeWithLargestRemainder(
            quantity,
            assortment.map((it: any) => Number(it.quantity) || 0),
            quantityDecimals(product.unit),
          );
          const distributions: { size: string; qty: number }[] = assortment.map((it: any, idx: number) => ({
            size: it.size,
            qty: Number((shares[idx] || 0).toFixed(4)),
          }));
          distributions.forEach((d) => {
            const matchVar = colorVariants.find((v) => v.size === d.size);
            if (matchVar) {
              matchVar.stock = (Number(matchVar.stock) || 0) + deltaSign * d.qty;
            } else {
              variants.push({ size: d.size, color: effectiveColor, barcode: '', stock: deltaSign * d.qty });
            }
          });
          logDetailText = `${effectiveColor ? effectiveColor + ' ' : ''}Asorti Dağılımı [${distributions.map((d) => `${d.size}: ${deltaSign > 0 ? '+' : '-'}${d.qty}`).join(', ')}]`;
        }
      } else if (colorVariants.length > 0) {
        // Bedenlere eşit dağıtım; toplam her zaman `quantity`e tam eşit.
        const shares = distributeWithLargestRemainder(quantity, colorVariants.map(() => 1), quantityDecimals(product.unit));
        const distSummary: string[] = [];
        colorVariants.forEach((v, idx) => {
          const sizeQty = Number((shares[idx] || 0).toFixed(4));
          v.stock = (Number(v.stock) || 0) + deltaSign * sizeQty;
          distSummary.push(`${v.size}: ${deltaSign > 0 ? '+' : '-'}${sizeQty}`);
        });
        logDetailText = `${effectiveColor ? effectiveColor + ' ' : ''}Beden Dağılımı [${distSummary.join(', ')}]`;
      }
    }

    if (variants.some((variant: any) => Number(variant.stock) < -0.00001)) throw new OpError(409, 'Beden/renk stoğu yetersiz.', 'INSUFFICIENT_VARIANT_STOCK');
    await assertReservedVariants(conn, productId, variants);
    let calculatedTotalStock = variants.reduce((sum: number, v: any) => sum + (Number(v.stock) || 0), 0);
    if (variants.length === 0 || (!isSpecificSize && (!assortment || assortment.length === 0) && variants.filter((v) => v.color === effectiveColor).length === 0)) {
      calculatedTotalStock = Math.max(0, roundUpQuantity((Number(product.stock) || 0) + deltaSign * quantity, 2));
    }

    await writeProductStock(conn, productId, calculatedTotalStock, variants.length > 0 ? variants : null, null, input.withVersion);
    if (input.writeLog) {
      await insertInventoryLog(conn, {
        productId,
        type: moveType,
        quantity,
        date: input.date ?? null,
        description: `${baseDescription}${logDetailText ? ` (${logDetailText})` : ''}`,
        // Renk/beden kolonları stok kartı ekstresinin gruplama anahtarıdır;
        // description metnine gömmek ekstrede renk kırılımını kaybettiriyordu.
        color: effectiveColor || null,
        size: sizeTrim || null,
      });
    }
  }

  router.post('/invoice-stock', async (req, res, next) => {
    try {
      const body = req.body || {};
      const items = Array.isArray(body.items) ? body.items : [];
      const isSales = body.isSales === true;
      const reverse = body.reverse === true;
      const writeLog = body.writeLog !== false;
      const purgeDocumentLogs = body.purgeDocumentLogs === true;
      const documentNumber = String(body.documentNumber || '').trim();

      if (!documentNumber) throw new OpError(400, 'Belge numarası zorunludur.');
      if (!items.length && !purgeDocumentLogs) throw new OpError(400, 'En az bir fatura satırı gereklidir.');

      assertAnyPermission(
        req.auth,
        [
          ['inventory', 'edit'],
          ['invoices', 'edit'],
          ['waybills', 'edit'],
        ],
        'Fatura stok hareketi için "Stok", "Fatura" veya "İrsaliye" modülünde düzenleme yetkisi gerekir.',
      );

      const documentDate = body.documentDate ? new Date(body.documentDate) : null;
      if (documentDate && Number.isNaN(documentDate.getTime())) throw new OpError(400, 'Geçersiz belge tarihi.');
      const withVersion = await versionSupported('products');

      const result = await withOperation(req, async (conn) => {
        const touched: number[] = [];
        const deltaSign = isSales ? (reverse ? 1 : -1) : (reverse ? -1 : 1);
        const moveType: StockMovementType = deltaSign < 0 ? 'out' : 'in';
        const baseDescription = `${documentNumber} No'lu ${isSales ? 'Satış' : 'Alış'} Faturası ${reverse ? 'Geri Alma' : 'Stok Hareketi'}`;
        for (const item of items) {
          const pid = Number(item?.productId);
          if (!Number.isFinite(pid)) continue;
          const qty = Math.abs(Number(item.quantity) || 0);
          await applySignedStockTx(conn, {
            productId: pid,
            signedQuantity: deltaSign * qty,
            color: item.color ?? null,
            size: item.size ?? null,
            type: moveType,
            description: baseDescription,
            date: documentDate,
            writeLog,
            withVersion,
          });
          touched.push(pid);
        }

        let purged = 0;
        if (purgeDocumentLogs) {
          const [del] = await conn.query(
            'DELETE FROM `inventoryLogs` WHERE `description` LIKE CONCAT(\'%\', ?, \'%\')',
            [documentNumber],
          );
          purged = Number((del as any)?.affectedRows || 0);
        }

        await writeAuditInTx(conn, {
          action: reverse ? 'update' : 'create',
          module: 'inventory',
          description: `Fatura stok hareketi: ${documentNumber} (${isSales ? 'Satış' : 'Alış'}${reverse ? ', geri alma' : ''})`,
          details: `${items.length} satır, ${touched.length} ürün${purged ? `, ${purged} kayıt temizlendi` : ''}`,
          entityId: null,
        }, { auth: req.auth, ip: clientIp(req) });

        return { documentNumber, products: touched, purged };
      });

      broadcast('products', 'update', result.products.map(String));
      broadcast('inventoryLogs', 'update', []);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Üretim stok hareketleri (iş emri sarf + mamul girişi)             */
  /*                                                                  */
  /* İş emri aşama geçişlerindeki hammade çıkışı ve mamul girişi; ürün  */
  /* satırları kilitlenerek, varyant/asorti dağılımı sunucuda yapılır.  */
  /* ---------------------------------------------------------------- */
  router.post('/production-stock', async (req, res, next) => {
    try {
      const body = req.body || {};
      const movements = Array.isArray(body.movements) ? body.movements : [];
      if (!movements.length) throw new OpError(400, 'En az bir üretim stok hareketi gereklidir.');
      assertAnyPermission(
        req.auth,
        [
          ['production', 'edit'],
          ['inventory', 'edit'],
        ],
        'Üretim stok hareketi için "Üretim" veya "Stok" modülünde düzenleme yetkisi gerekir.',
      );

      const withVersion = await versionSupported('products');
      const result = await withOperation(req, async (conn) => {
        const touched: number[] = [];
        for (const m of movements) {
          const pid = Number(m?.productId);
          const signed = Number(m?.signedQuantity) || 0;
          if (!Number.isFinite(pid) || signed === 0) continue;
          const rawType = String(m?.type || (signed < 0 ? 'production_out' : 'production_in'));
          const type: StockMovementType = (STOCK_MOVEMENT_TYPES as readonly string[]).includes(rawType)
            ? (rawType as StockMovementType)
            : (signed < 0 ? 'out' : 'in');
          const mDate = m?.date ? new Date(m.date) : null;
          await applySignedStockTx(conn, {
            productId: pid,
            signedQuantity: signed,
            color: m?.color ?? null,
            size: m?.size ?? null,
            type,
            description: String(m?.description || 'Üretim stok hareketi'),
            date: mDate && !Number.isNaN(mDate.getTime()) ? mDate : null,
            writeLog: m?.writeLog !== false,
            withVersion,
          });
          touched.push(pid);
        }

        await writeAuditInTx(conn, {
          action: 'update',
          module: 'production',
          description: `Üretim stok hareketleri uygulandı (${movements.length} hareket)`,
          details: touched.length ? `Ürünler: ${touched.join(', ')}` : null,
          entityId: body.workOrderId ?? null,
        }, { auth: req.auth, ip: clientIp(req) });

        return { products: touched };
      });

      broadcast('products', 'update', result.products.map(String));
      broadcast('inventoryLogs', 'update', []);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Varyant stoklarını ürün toplam stoğuna göre senkronize et         */
  /* ---------------------------------------------------------------- */
  router.post('/sync-variant-stocks', async (req, res, next) => {
    try {
      const body = req.body || {};
      assertAnyPermission(
        req.auth,
        [['inventory', 'edit']],
        'Varyant stok senkronizasyonu için "Stok" modülünde düzenleme yetkisi gerekir.',
      );
      const withVersion = await versionSupported('products');

      const result = await withOperation(req, async (conn) => {
        const pRows = await conn.query<any[]>(
          `SELECT \`id\`, \`stock\`, \`variantBarcodes\`, ${PRODUCT_COLORS_SQL} AS \`colors\`, \`assortment\`, \`assortmentTemplateId\`, \`isFootwear\` FROM \`products\` FOR UPDATE`,
        );
        const products = pRows[0] as any[];
        const parseList = (raw: unknown): any[] => {
          if (!raw) return [];
          if (Array.isArray(raw)) return raw.map((v) => ({ ...v }));
          if (typeof raw === 'string') { try { const p = JSON.parse(raw); return Array.isArray(p) ? p.map((v: any) => ({ ...v })) : []; } catch { return []; } }
          return [];
        };
        const colorsOf = (product: any): string[] => parseColorNames(product.colors);

        const changed: number[] = [];
        for (const product of products) {
          if (!product.isFootwear && parseList(product.variantBarcodes).length === 0) continue;

          let variants = parseList(product.variantBarcodes);

          if (variants.length === 0 && product.isFootwear) {
            const colors = colorsOf(product).length ? colorsOf(product) : ['Genel'];
            let assortment = parseList(product.assortment);
            if ((!assortment || assortment.length === 0) && product.assortmentTemplateId) {
              const tRows = await conn.query<any[]>('SELECT `items` FROM `assortmentTemplates` WHERE `id` = ?', [product.assortmentTemplateId]);
              const tmpl = (tRows[0] as any[])[0];
              if (tmpl) assortment = parseList(tmpl.items);
            }
            if (assortment && assortment.length > 0) {
              for (const color of colors) for (const it of assortment) variants.push({ size: it.size, color, barcode: '', stock: 0 });
            }
          }

          if (variants.length === 0) continue;
          const totalStock = Number(product.stock) || 0;
          const sumVariantStock = variants.reduce((s: number, v: any) => s + (Number(v.stock) || 0), 0);

          if (sumVariantStock === 0 && totalStock !== 0) {
            const colors = colorsOf(product);
            const targetColor = colors.length > 0 ? colors[0] : (variants[0]?.color || 'Genel');
            let assortment = parseList(product.assortment);
            if ((!assortment || assortment.length === 0) && product.assortmentTemplateId) {
              const tRows = await conn.query<any[]>('SELECT `items` FROM `assortmentTemplates` WHERE `id` = ?', [product.assortmentTemplateId]);
              const tmpl = (tRows[0] as any[])[0];
              if (tmpl) assortment = parseList(tmpl.items);
            }
            const targetVariants = variants.filter((v) => v.color === targetColor);
            const effectiveVariants = targetVariants.length > 0 ? targetVariants : variants;

            const weights = effectiveVariants.map(variant => Number(assortment.find((item: any) => String(item.size) === String(variant.size))?.quantity ?? 1));
            const shares = distributeWithLargestRemainder(totalStock, weights, quantityDecimals(product.unit));
            effectiveVariants.forEach((variant, index) => { variant.stock = shares[index]; });            const updatedSum = variants.reduce((s: number, v: any) => s + (Number(v.stock) || 0), 0);
            await writeProductStock(conn, product.id, updatedSum, variants, null, withVersion);
            changed.push(product.id);
          } else if (totalStock !== sumVariantStock) {
            const shares = distributeWithLargestRemainder(totalStock, variants.map(variant => Math.max(0, Number(variant.stock) || 0)), quantityDecimals(product.unit));
            variants.forEach((variant, index) => { variant.stock = shares[index]; });
            await writeProductStock(conn, product.id, totalStock, variants, null, withVersion);
            changed.push(product.id);
          }
        }
        if (changed.length) {
          await writeAuditInTx(conn, {
            action: 'update',
            module: 'inventory',
            description: `Varyant stok senkronizasyonu: ${changed.length} ürün güncellendi`,
            entityId: null,
          }, { auth: req.auth, ip: clientIp(req) });
        }
        return { changed };
      });

      if (result.changed.length) broadcast('products', 'update', result.changed.map(String));
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Ürün varyant matrisi düzenleme (barkod + varyant stoğu)           */
  /* ---------------------------------------------------------------- */
  router.post('/product-variants', async (req, res, next) => {
    try {
      const body = req.body || {};
      const productId = Number(body.productId);
      if (!Number.isFinite(productId)) throw new OpError(400, 'Geçerli bir ürün seçilmelidir.');
      assertAnyPermission(
        req.auth,
        [['inventory', 'edit']],
        'Ürün varyant/stok düzenlemesi için "Stok" modülünde düzenleme yetkisi gerekir.',
      );

      const hasStock = body.stock !== undefined && body.stock !== null;
      const hasVariants = body.variantBarcodes !== undefined;
      const logDelta = body.logDelta !== false;
      if (!hasStock && !hasVariants) throw new OpError(400, 'Güncellenecek bir alan yok.');

      const withVersion = await versionSupported('products');
      const description = body.description ? String(body.description) : 'Varyant/stok düzenlemesi';

      const result = await withOperation(req, async (conn) => {
        const product = await lockProduct(conn, productId);
        const prevStock = Number(product.stock) || 0;
        const nextStock = hasStock ? Number(body.stock) : prevStock;
        const nextVariants = hasVariants ? (Array.isArray(body.variantBarcodes) ? body.variantBarcodes : parseVariants(body.variantBarcodes)) : null;

        await assertOpenPeriod(conn, 'accounting', new Date());
        const effectiveVariants = nextVariants ?? parseVariants(product.variantBarcodes);
        if (!Number.isFinite(nextStock) || nextStock < 0 || (quantityDecimals(product.unit) === 0 && !Number.isInteger(nextStock))) throw new OpError(400, 'Geçersiz stok miktarı.');
        if (effectiveVariants.some((v: any) => !Number.isFinite(Number(v.stock)) || Number(v.stock) < 0 || (quantityDecimals(product.unit) === 0 && !Number.isInteger(Number(v.stock))))) throw new OpError(400, 'Geçersiz varyant stok miktarı.');
        if (effectiveVariants.length && Math.abs(effectiveVariants.reduce((sum: number, v: any) => sum + Number(v.stock), 0) - nextStock) > 0.0001) throw new OpError(400, 'Varyant toplamı ürün stoğuyla eşleşmelidir.');
        if (nextStock < prevStock) await assertUnreservedStock(conn, product as any, prevStock - nextStock);
        await assertReservedVariants(conn, productId, effectiveVariants);

        await writeProductStock(conn, productId, nextStock, nextVariants, null, withVersion);

        const delta = nextStock - prevStock;
        if (logDelta && delta !== 0) {
          await insertInventoryLog(conn, {
            productId,
            type: delta > 0 ? 'in' : 'out',
            quantity: Math.abs(delta),
            description,
          });
        }

        await writeAuditInTx(conn, {
          action: 'update',
          module: 'inventory',
          description: `Ürün varyant/stok güncellendi: ${product.name} (${product.code})`,
          details: `Stok ${prevStock} → ${nextStock}${nextVariants ? `, ${nextVariants.length} varyant` : ''}`,
          entityId: productId,
        }, { auth: req.auth, ip: clientIp(req) });

        return { productId, stock: nextStock };
      });

      broadcast('products', 'update', [String(productId)]);
      if (logDelta) broadcast('inventoryLogs', 'update', []);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Açılış bakiyesi düzenleme (cari / kasa / banka)                   */
  /*                                                                  */
  /* Bakiye mutlak değere set edilir; cari için 'Açılış Bakiyesi'      */
  /* hareketi yazılır. Not: muhasebe yevmiye fişi OTOMATİK üretilmez    */
  /* (karşı hesap doğrulanamadığından); ayrı bir özellik olarak ele alınır. */
  /* ---------------------------------------------------------------- */
  router.post('/opening-balance', async (req, res, next) => {
    try {
      const body = req.body || {};
      const resource = String(body.resource || '');
      const id = Number(body.id);
      const amount = Number(body.amount);
      if (!['contacts', 'cashBoxes', 'bankAccounts'].includes(resource)) throw new OpError(400, 'Geçersiz kaynak.');
      if (!Number.isFinite(id)) throw new OpError(400, 'Geçerli bir kayıt seçilmelidir.');
      if (!Number.isFinite(amount)) throw new OpError(400, 'Geçerli bir tutar girilmelidir.');

      const isContact = resource === 'contacts';
      assertAnyPermission(
        req.auth,
        isContact ? [['contacts', 'edit'], ['finance', 'edit']] : [['finance', 'edit']],
        'Açılış bakiyesi düzenlemesi için ilgili modülde düzenleme yetkisi gerekir.',
      );

      const actionDate = body.date ? new Date(body.date) : new Date();
      if (Number.isNaN(actionDate.getTime())) throw new OpError(400, 'Geçersiz tarih.');
      const withVersion = await versionSupported(resource);

      const result = await withOperation(req, async (conn) => {
        let label = '';
        let delta = 0;
        if (resource === 'contacts') {
          const c = await lockContact(conn, id);
          delta = amount - (Number(c.balance) || 0);
          await conn.query(`UPDATE \`contacts\` SET \`balance\` = ?${withVersion ? ', `version` = `version` + 1' : ''}, \`updatedAt\` = NOW() WHERE \`id\` = ?`, [amount, id]);
          if (delta !== 0) {
            await conn.query(
              `INSERT INTO \`transactions\` (\`contactId\`, \`type\`, \`amount\`, \`description\`, \`category\`, \`paymentMethod\`, \`documentNo\`, \`date\`) VALUES (?, ?, ?, 'Açılış Bakiyesi', 'Açılış', 'other', ?, ?)`,
              [id, delta > 0 ? 'income' : 'expense', Math.abs(delta), `DVR-${id}`, actionDate],
            );
          }
          label = c.name;
        } else if (resource === 'cashBoxes') {
          const c = await lockCashBox(conn, id);
          delta = amount - (Number(c.balance) || 0);
          await conn.query(`UPDATE \`cashBoxes\` SET \`balance\` = ?${withVersion ? ', `version` = `version` + 1' : ''} WHERE \`id\` = ?`, [amount, id]);
          label = c.name;
        } else {
          const b = await lockBankAccount(conn, id);
          delta = amount - (Number(b.balance) || 0);
          await conn.query(`UPDATE \`bankAccounts\` SET \`balance\` = ?${withVersion ? ', `version` = `version` + 1' : ''} WHERE \`id\` = ?`, [amount, id]);
          label = `${b.bankName}${b.iban ? ` (${b.iban})` : ''}`;
        }

        await writeAuditInTx(conn, {
          action: 'update',
          module: isContact ? 'contacts' : 'finance',
          description: `Açılış bakiyesi düzenlendi: ${label} → ${amount}`,
          details: delta !== 0 ? `Değişim: ${delta > 0 ? '+' : ''}${delta}` : 'Değişim yok',
          entityId: id,
        }, { auth: req.auth, ip: clientIp(req) });

        return { resource, id, balance: amount, delta };
      });

      broadcast(resource, 'update', [String(id)]);
      if (isContact && result.delta !== 0) broadcast('transactions', 'update', []);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Bordro muhasebeleştirme işareti (isAccounted + journalEntryId)     */
  /* Bu alanlar protectedColumns olduğundan generic PATCH ile yazılamaz; */
  /* yalnızca bu kontrollü op (satır kilidi + audit) ile işaretlenir.   */
  /* ---------------------------------------------------------------- */
  router.post('/account-payroll', async (req, res, next) => {
    try {
      const body = req.body || {};
      const payrollId = Number(body.payrollId);
      const journalEntryId = Number(body.journalEntryId);
      if (!Number.isFinite(payrollId) || payrollId <= 0) throw new OpError(400, 'Geçerli bir bordro kaydı seçilmelidir.');
      if (!Number.isFinite(journalEntryId) || journalEntryId <= 0) throw new OpError(400, 'Geçerli bir yevmiye fişi belirtilmelidir.');
      assertAnyPermission(
        req.auth,
        [['hr', 'edit'], ['accounting', 'edit']],
        'Bordro muhasebeleştirme için "İK" veya "Muhasebe" modülünde düzenleme yetkisi gerekir.',
      );

      const withVersion = await versionSupported('payrollRecords');
      const result = await withOperation(req, async (conn) => {
        const jeRows = await conn.query<any[]>('SELECT `id` FROM `journalEntries` WHERE `id` = ? LIMIT 1', [journalEntryId]);
        if (!((jeRows[0] as any[]) || []).length) throw new OpError(404, 'Yevmiye fişi bulunamadı.', 'JOURNAL_NOT_FOUND');

        const prRows = await conn.query<any[]>('SELECT `id`, `isAccounted` FROM `payrollRecords` WHERE `id` = ? FOR UPDATE', [payrollId]);
        const pr = (prRows[0] as any[])[0];
        if (!pr) throw new OpError(404, 'Bordro kaydı bulunamadı.', 'PAYROLL_NOT_FOUND');
        if (Number(pr.isAccounted) === 1) throw new OpError(409, 'Bu bordro kaydı zaten muhasebeleştirilmiş.', 'PAYROLL_ALREADY_ACCOUNTED');

        await conn.query(
          `UPDATE \`payrollRecords\` SET \`isAccounted\` = 1, \`journalEntryId\` = ?${withVersion ? ', `version` = `version` + 1' : ''} WHERE \`id\` = ?`,
          [journalEntryId, payrollId],
        );
        await writeAuditInTx(conn, {
          action: 'update',
          module: 'hr',
          description: `Bordro muhasebeleştirildi (yevmiye fişi: ${journalEntryId})`,
          entityId: payrollId,
        }, { auth: req.auth, ip: clientIp(req) });

        return { payrollId, journalEntryId, isAccounted: true };
      });

      broadcast('payrollRecords', 'update', [String(payrollId)]);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Cari hareket (transaction) oluştur/güncelle/sil + bakiye           */
  /* ---------------------------------------------------------------- */
  router.post('/contact-transaction', async (req, res, next) => {
    try {
      const body = req.body || {};
      const mode = String(body.mode || 'create');
      if (!['create', 'update'].includes(mode)) throw new OpError(400, 'Geçersiz işlem modu.');
      assertAnyPermission(
        req.auth,
        [['contacts', 'edit'], ['finance', 'edit']],
        'Cari hareket için "Cari Hesaplar" veya "Finans" modülünde düzenleme yetkisi gerekir.',
      );

      const withVersion = await versionSupported('contacts');
      // income → alacak tahsilatı (bakiye düşer), expense → ödeme (bakiye artar)
      const impact = (type: string, amount: number): number => (type === 'income' ? -amount : amount);

      const result = await withOperation(req, async (conn) => {
        if (mode === 'create') {
          const contactId = Number(body.contactId);
          if (!Number.isFinite(contactId)) throw new OpError(400, 'Geçerli bir cari hesap seçilmelidir.');
          const type = String(body.type || 'income');
          const amount = Number(body.amount) || 0;
          const contact = await lockContact(conn, contactId);
          const txDate = body.date ? new Date(body.date) : new Date();
          await assertOpenPeriod(conn, 'accounting', txDate);
          const [ins] = await conn.query(
            `INSERT INTO \`transactions\` (\`contactId\`, \`type\`, \`amount\`, \`description\`, \`category\`, \`paymentMethod\`, \`documentNo\`, \`date\`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              contactId,
              type,
              amount,
              body.description ?? null,
              body.category ?? (type === 'income' ? 'Tahsilat' : 'Ödeme'),
              body.paymentMethod ?? 'cash',
              body.documentNo ?? null,
              Number.isNaN(txDate.getTime()) ? new Date() : txDate,
            ],
          );
          const txId = Number((ins as any)?.insertId || 0);
          await adjustBalance(conn, 'contacts', contactId, impact(type, amount), withVersion);
          await writeAuditInTx(conn, { action: 'create', module: 'finance', description: `Cari hareket oluşturuldu: ${contact.name} (${type}, ${amount})`, entityId: txId }, { auth: req.auth, ip: clientIp(req) });
          return { id: txId, contactId };
        }

        const id = Number(body.id);
        if (!Number.isFinite(id)) throw new OpError(400, 'Geçerli bir hareket seçilmelidir.');
        const txRows = await conn.query<any[]>(
          'SELECT `id`, `contactId`, `type`, `amount`, `category`, `paymentMethod`, `documentNo`, `description`, `date` FROM `transactions` WHERE `id` = ? FOR UPDATE',
          [id],
        );
        const oldTx = (txRows[0] as any[])[0];
        if (!oldTx) throw new OpError(404, 'Finansal hareket bulunamadı.', 'TX_NOT_FOUND');
        await assertOpenPeriod(conn, 'accounting', oldTx.date);
        if (body.date) await assertOpenPeriod(conn, 'accounting', body.date);

        // update: eski etkiyi geri al, yeni etkiyi uygula
        const nextContactId = body.contactId !== undefined ? Number(body.contactId) : oldTx.contactId;
        const nextType = body.type !== undefined ? String(body.type) : oldTx.type;
        const nextAmount = body.amount !== undefined ? Number(body.amount) || 0 : Number(oldTx.amount) || 0;
        if (oldTx.contactId) {
          await lockContact(conn, oldTx.contactId);
          await adjustBalance(conn, 'contacts', oldTx.contactId, -impact(oldTx.type, Number(oldTx.amount) || 0), withVersion);
        }
        const nextDate = body.date ? new Date(body.date) : null;
        await conn.query(
          `UPDATE \`transactions\` SET \`contactId\` = ?, \`type\` = ?, \`amount\` = ?${body.description !== undefined ? ', `description` = ?' : ''}${body.category !== undefined ? ', `category` = ?' : ''}${body.paymentMethod !== undefined ? ', `paymentMethod` = ?' : ''}${body.documentNo !== undefined ? ', `documentNo` = ?' : ''}${nextDate && !Number.isNaN(nextDate.getTime()) ? ', `date` = ?' : ''} WHERE \`id\` = ?`,
          (() => {
            const p: any[] = [nextContactId ?? null, nextType, nextAmount];
            if (body.description !== undefined) p.push(body.description);
            if (body.category !== undefined) p.push(body.category);
            if (body.paymentMethod !== undefined) p.push(body.paymentMethod);
            if (body.documentNo !== undefined) p.push(body.documentNo);
            if (nextDate && !Number.isNaN(nextDate.getTime())) p.push(nextDate);
            p.push(id);
            return p;
          })(),
        );
        if (nextContactId) {
          await lockContact(conn, nextContactId);
          await adjustBalance(conn, 'contacts', nextContactId, impact(nextType, nextAmount), withVersion);
        }
        await writeAuditInTx(conn, { action: 'update', module: 'finance', description: `Cari hareket güncellendi (id: ${id})`, entityId: id }, { auth: req.auth, ip: clientIp(req) });
        return { id, contactId: nextContactId };
      });

      broadcast('transactions', 'update', []);
      broadcast('contacts', 'update', result.contactId ? [String(result.contactId)] : []);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Süper Admin: bakiye/stok toplu sıfırlama (reset)                  */
  /* ---------------------------------------------------------------- */
  router.post('/reset-balances', async (req, res, next) => {
    try {
      assertSuperAdmin(req.auth, 'Bakiye/stok sıfırlama yalnızca Süper Admin tarafından yapılabilir.');
      const body = req.body || {};
      const doProducts = body.products !== false;
      const doContacts = body.contacts !== false;
      const doCash = body.cashBoxes !== false;
      const doBank = body.bankAccounts !== false;

      const result = await withOperation(req, async (conn) => {
        const summary: Record<string, number> = {};
        if (doProducts) {
          await assertOpenPeriod(conn, 'accounting', new Date());
          const [reserved] = await conn.query<any[]>("SELECT id FROM stockReservations WHERE status='active' LIMIT 1 FOR UPDATE");
          if (reserved.length) throw new OpError(409, 'Aktif rezervasyonlar varken stok sıfırlanamaz.');
          const [r] = await conn.query('UPDATE `products` SET `stock` = 0');
          summary.products = Number((r as any)?.affectedRows || 0);
          const vRows = await conn.query<any[]>("SELECT `id`, `variantBarcodes` FROM `products` WHERE `variantBarcodes` IS NOT NULL AND `variantBarcodes` <> '[]'");
          for (const p of vRows[0] as any[]) {
            const variants = parseVariants(p.variantBarcodes);
            if (!variants.length) continue;
            const zeroed = variants.map((v) => ({ ...v, stock: 0 }));
            await conn.query('UPDATE `products` SET `variantBarcodes` = ? WHERE `id` = ?', [JSON.stringify(zeroed), p.id]);
          }
        }
        if (doContacts) {
          const [r] = await conn.query('UPDATE `contacts` SET `balance` = 0, `updatedAt` = NOW()');
          summary.contacts = Number((r as any)?.affectedRows || 0);
        }
        if (doCash) {
          const [r] = await conn.query('UPDATE `cashBoxes` SET `balance` = 0');
          summary.cashBoxes = Number((r as any)?.affectedRows || 0);
        }
        if (doBank) {
          const [r] = await conn.query('UPDATE `bankAccounts` SET `balance` = 0');
          summary.bankAccounts = Number((r as any)?.affectedRows || 0);
        }

        await writeAuditInTx(conn, {
          action: 'system',
          module: 'system',
          description: 'Bakiye/stok toplu sıfırlama (reset) çalıştırıldı',
          details: Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join(', ') || '-',
          entityId: null,
        }, { auth: req.auth, ip: clientIp(req) });

        return { summary };
      });

      if (doProducts) broadcast('products', 'update', []);
      if (doContacts) broadcast('contacts', 'update', []);
      if (doCash) broadcast('cashBoxes', 'update', []);
      if (doBank) broadcast('bankAccounts', 'update', []);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ================================================================== */
  /* FATURA: oluştur / iptal / sil — uçtan uca TEK transaction           */
  /*                                                                    */
  /* Fatura → kalemler → sipariş/irsaliye bağı → cari bakiye → stok →    */
  /* KDV/muhasebe (yevmiye) zinciri tek withTransaction içinde, satır     */
  /* kilitleriyle uygulanır. Toplamlar/KDV/satır tutarları sunucuda       */
  /* yeniden hesaplanır ve doğrulanır; fatura no benzersizliği ve çift    */
  /* iptal kilit altında korunur.                                        */
  /* ================================================================== */

  async function applyInvoiceBalance(
    conn: PoolConnection,
    invoice: { type: string; contactId: number | null; grandTotal: number },
    mode: 'apply' | 'reverse',
    withVersion: boolean,
  ): Promise<void> {
    if (!invoice.contactId) return;
    await lockContact(conn, invoice.contactId);
    const sign = invoice.type === 'sales' ? 1 : -1;
    const total = Number(invoice.grandTotal) || 0;
    const delta = mode === 'apply' ? sign * total : -sign * total;
    await adjustBalance(conn, 'contacts', invoice.contactId, delta, withVersion);
  }

  async function applyInvoiceOrderLink(
    conn: PoolConnection,
    orderId: number,
    items: any[],
    grandTotal: number,
    direction: 1 | -1,
  ): Promise<void> {
    const orderRows = await conn.query<any[]>('SELECT `id`, `invoicedTotal` FROM `orders` WHERE `id` = ? FOR UPDATE', [orderId]);
    const order = (orderRows[0] as any[])[0];
    if (!order) {
      if (direction === 1) throw new OpError(404, 'Faturanın bağlı olduğu sipariş bulunamadı.', 'INVOICE_ORDER_NOT_FOUND');
      return;
    }
    const oiRows = await conn.query<any[]>('SELECT `id`, `quantity`, `invoicedQuantity` FROM `orderItems` WHERE `orderId` = ? FOR UPDATE', [orderId]);
    const orderItems = (oiRows[0] as any[]) || [];
    for (const it of items) {
      if (!it?.orderItemId) continue;
      const t = orderItems.find((oi) => Number(oi.id) === Number(it.orderItemId));
      if (!t) {
        if (direction === 1) throw new OpError(409, 'Fatura satırı bağlı siparişe ait değil.', 'INVOICE_ORDER_ITEM_MISMATCH');
        continue;
      }
      const prev = Number(t.invoicedQuantity) || 0;
      const nextQ = Math.max(0, prev + direction * (Number(it.quantity) || 0));
      if (direction === 1 && nextQ > Number(t.quantity) + 0.00001) {
        throw new OpError(409, 'Fatura miktarı siparişin kalan miktarını aşıyor.', 'INVOICE_ORDER_QUANTITY_EXCEEDED');
      }
      await conn.query('UPDATE `orderItems` SET `invoicedQuantity` = ? WHERE `id` = ?', [nextQ, t.id]);
      t.invoicedQuantity = nextQ;
    }
    const totalOrdered = orderItems.reduce((s, oi) => s + (Number(oi.quantity) || 0), 0);
    const totalInvoiced = orderItems.reduce((s, oi) => s + (Number(oi.invoicedQuantity) || 0), 0);
    let invoicingStatus: 'not_invoiced' | 'partially_invoiced' | 'fully_invoiced' = 'not_invoiced';
    if (totalOrdered > 0 && totalInvoiced >= totalOrdered) invoicingStatus = 'fully_invoiced';
    else if (totalInvoiced > 0) invoicingStatus = 'partially_invoiced';
    const newInvoicedTotal = Math.max(0, (Number(order.invoicedTotal) || 0) + direction * grandTotal);
    await conn.query('UPDATE `orders` SET `invoicingStatus` = ?, `invoicedTotal` = ?, `updatedAt` = NOW() WHERE `id` = ?', [invoicingStatus, newInvoicedTotal, orderId]);
  }

  async function resetWaybillsForInvoice(conn: PoolConnection, invoiceId: number, waybillId: number | null): Promise<void> {
    if (waybillId) {
      await conn.query("UPDATE `waybills` SET `invoicedStatus` = 'not_invoiced', `invoiceId` = NULL, `invoiceNumber` = NULL, `updatedAt` = NOW() WHERE `id` = ?", [waybillId]);
    }
    await conn.query("UPDATE `waybills` SET `invoicedStatus` = 'not_invoiced', `invoiceId` = NULL, `invoiceNumber` = NULL, `updatedAt` = NOW() WHERE `invoiceId` = ?", [invoiceId]);
  }

  /**
   * İrsaliyeyi faturaya bağlamadan önce satır kilidiyle doğrular:
   * aynı irsaliyenin ikinci bir faturaya aktarılmasını, iptal edilmiş
    * irsaliyenin bağlanmasını, cari/tip uyuşmazlığını ve çift stok hareketini reddeder.
   */
  async function lockWaybillForInvoice(
    conn: PoolConnection,
    waybillId: number,
    invoice: { contactId: number; type: string; isStockDeducted: boolean },
    selfInvoiceId?: number,
  ): Promise<{ id: number; waybillNumber: string; orderId: number | null }> {
    const rows = await conn.query<any[]>(
      'SELECT `id`, `waybillNumber`, `status`, `invoicedStatus`, `invoiceId`, `invoiceNumber`, `contactId`, `type`, `orderId`, `isStockDeducted` FROM `waybills` WHERE `id` = ? FOR UPDATE',
      [waybillId],
    );
    const wb = (rows[0] as any[])[0];
    if (!wb) throw new OpError(404, 'Faturaya bağlanacak irsaliye bulunamadı.', 'WAYBILL_NOT_FOUND');
    if (wb.status === 'cancelled') {
      throw new OpError(409, `"${wb.waybillNumber}" irsaliyesi iptal edilmiş; faturaya bağlanamaz.`, 'WAYBILL_CANCELLED');
    }
    const linkedInvoiceId = wb.invoiceId != null ? Number(wb.invoiceId) : null;
    if (wb.invoicedStatus === 'invoiced' || (linkedInvoiceId != null && linkedInvoiceId !== (selfInvoiceId ?? null))) {
      throw new OpError(
        409,
        `"${wb.waybillNumber}" irsaliyesi zaten ${wb.invoiceNumber ? `"${wb.invoiceNumber}" faturasına` : 'bir faturaya'} bağlı. Aynı irsaliye iki faturaya aktarılamaz.`,
        'WAYBILL_ALREADY_INVOICED',
      );
    }
    if (Number(wb.contactId) !== Number(invoice.contactId)) {
      throw new OpError(400, `"${wb.waybillNumber}" irsaliyesi farklı bir cari hesaba ait; fatura cari hesabı irsaliye ile eşleşmelidir.`, 'WAYBILL_CONTACT_MISMATCH');
    }
    if (String(wb.type) !== String(invoice.type)) {
      throw new OpError(400, `"${wb.waybillNumber}" irsaliyesi ${wb.type === 'sales' ? 'satış' : 'alış'} tipinde; fatura tipi irsaliye ile eşleşmelidir.`, 'WAYBILL_TYPE_MISMATCH');
    }
    // İrsaliye taslak olsa bile kesinleştiğinde stok hareketi üretebilir.
    // İki belgenin aynı fiziksel hareketi işlemesine hiçbir yaşam döngüsünde izin verme.
    if (Number(wb.isStockDeducted) === 1 && invoice.isStockDeducted) {
      throw new OpError(409, `"${wb.waybillNumber}" irsaliyesi stok hareketini zaten üstleniyor; bağlı faturada stok hareketini kapatın.`, 'INVOICE_WAYBILL_STOCK_ALREADY_APPLIED');
    }
    return { id: Number(wb.id), waybillNumber: String(wb.waybillNumber), orderId: wb.orderId == null ? null : Number(wb.orderId) };
  }

  /** Kesinleşen faturanın belge satırlarını kilit altında doğrular. */
  async function validateInvoiceLinks(
    conn: PoolConnection,
    invoice: { orderId: number | null; waybillId: number | null; contactId: number; type: string },
    items: any[],
    waybill?: { id: number; waybillNumber: string; orderId: number | null },
  ): Promise<void> {
    const variant = (line: any) => `${String(line.color ?? '')}\u0000${String(line.size ?? '')}`;
    if (invoice.waybillId) {
      if (!waybill) throw new OpError(409, 'İrsaliye bağlantısı doğrulanamadı.', 'INVOICE_WAYBILL_MISMATCH');
      if (waybill.orderId !== invoice.orderId) {
        throw new OpError(409, 'Fatura siparişi ile irsaliyenin siparişi farklı.', 'INVOICE_WAYBILL_ORDER_MISMATCH');
      }
      const [rawWaybillItems] = await conn.query<any[]>(
        'SELECT `productId`, `orderItemId`, `color`, `size`, `quantity`, `productCode`, `productName` FROM `waybillItems` WHERE `waybillId` = ? FOR UPDATE',
        [waybill.id],
      );
      const waybillItems = (rawWaybillItems as any[]) || [];
      const keyOf = (line: any) => JSON.stringify([
        line.productId == null ? null : Number(line.productId),
        line.orderItemId == null ? null : Number(line.orderItemId),
        variant(line),
        line.productId == null ? String(line.productCode ?? '') : '',
        line.productId == null ? String(line.productName ?? '') : '',
      ]);
      const received = new Map<string, number>();
      const invoiced = new Map<string, number>();
      for (const line of waybillItems) received.set(keyOf(line), (received.get(keyOf(line)) || 0) + Number(line.quantity));
      for (const line of items) {
        const key = keyOf(line);
        if (!received.has(key)) {
          // İrsaliyeye ek olarak yalnız stoksuz hizmet/gider satırları faturalanabilir.
          if (line.productId == null && line.orderItemId == null) continue;
          throw new OpError(409, 'Faturadaki ürün/renk/beden irsaliye satırlarıyla uyuşmuyor.', 'INVOICE_WAYBILL_ITEM_MISMATCH');
        }
        invoiced.set(key, (invoiced.get(key) || 0) + Number(line.quantity));
      }
      for (const [key, quantity] of received) {
        if (Math.abs((invoiced.get(key) || 0) - quantity) > 0.00001) {
          throw new OpError(409, 'İrsaliye miktarı faturaya eksik veya fazla aktarıldı.', 'INVOICE_WAYBILL_QUANTITY_MISMATCH');
        }
      }
    }

    if (!invoice.orderId) {
      if (items.some(line => line.orderItemId != null)) {
        throw new OpError(409, 'Fatura satırında sipariş kalemi var ancak sipariş bağlantısı yok.', 'INVOICE_ORDER_REQUIRED');
      }
      return;
    }
    const [orderRows] = await conn.query<any[]>(
      'SELECT `id`, `contactId`, `type`, `status` FROM `orders` WHERE `id` = ? FOR UPDATE',
      [invoice.orderId],
    );
    const order = (orderRows as any[])[0];
    if (!order) throw new OpError(404, 'Faturaya bağlı sipariş bulunamadı.', 'INVOICE_ORDER_NOT_FOUND');
    if (Number(order.contactId) !== invoice.contactId || String(order.type) !== invoice.type) {
      throw new OpError(409, 'Fatura ve siparişin cari hesabı veya tipi uyuşmuyor.', 'INVOICE_ORDER_MISMATCH');
    }
    if (order.status === 'draft' || order.status === 'cancelled') {
      throw new OpError(409, 'Taslak veya iptal edilmiş sipariş faturalanamaz.', 'INVOICE_ORDER_INACTIVE');
    }
    const [rawOrderItems] = await conn.query<any[]>(
      'SELECT `id`, `productId`, `color`, `size`, `quantity`, `invoicedQuantity` FROM `orderItems` WHERE `orderId` = ? FOR UPDATE',
      [invoice.orderId],
    );
    const orderItems = new Map<number, any>((rawOrderItems as any[]).map(line => [Number(line.id), line]));
    const quantities = new Map<number, number>();
    for (const line of items) {
      if (line.orderItemId == null) {
        if (line.productId != null) throw new OpError(409, 'Sipariş bağlantılı üründe sipariş kalemi zorunludur.', 'INVOICE_ORDER_ITEM_REQUIRED');
        continue;
      }
      const id = Number(line.orderItemId);
      const ordered = orderItems.get(id);
      if (!ordered || Number(ordered.productId) !== Number(line.productId) || variant(ordered) !== variant(line)) {
        throw new OpError(409, 'Fatura satırı sipariş ürünü/renk/bedeniyle uyuşmuyor.', 'INVOICE_ORDER_ITEM_MISMATCH');
      }
      quantities.set(id, (quantities.get(id) || 0) + Number(line.quantity));
    }
    for (const [id, quantity] of quantities) {
      const ordered = orderItems.get(id)!;
      if (Number(ordered.invoicedQuantity) + quantity > Number(ordered.quantity) + 0.00001) {
        throw new OpError(409, 'Fatura miktarı siparişin kalan miktarını aşıyor.', 'INVOICE_ORDER_QUANTITY_EXCEEDED');
      }
    }
  }

  /**
   * İrsaliye iptali/silmesinde sipariş sevk miktarlarını kilit altında geri alır
   * ve sipariş durumunu yeniden hesaplar.
   */
  async function revertWaybillOrderShipments(conn: PoolConnection, orderId: number, items: any[]): Promise<void> {
    const orderRows = await conn.query<any[]>('SELECT `id`, `status` FROM `orders` WHERE `id` = ? FOR UPDATE', [orderId]);
    if (!(orderRows[0] as any[]).length) return;
    const [oiRows] = await conn.query('SELECT `id`, `quantity`, `shippedQuantity` FROM `orderItems` WHERE `orderId` = ? FOR UPDATE', [orderId]);
    const orderItems = (oiRows as any[]) || [];
    for (const it of items) {
      if (it.orderItemId == null) continue;
      const t = orderItems.find((oi) => Number(oi.id) === Number(it.orderItemId));
      if (!t) continue;
      const nextQ = Math.max(0, (Number(t.shippedQuantity) || 0) - (Number(it.quantity) || 0));
      await conn.query('UPDATE `orderItems` SET `shippedQuantity` = ? WHERE `id` = ?', [nextQ, t.id]);
      t.shippedQuantity = nextQ;
    }
    const totalOrdered = orderItems.reduce((s, oi) => s + (Number(oi.quantity) || 0), 0);
    const totalShipped = orderItems.reduce((s, oi) => s + (Number(oi.shippedQuantity) || 0), 0);
    let status = 'partially_shipped';
    if (totalOrdered > 0 && totalShipped >= totalOrdered) status = 'completed';
    else if (totalShipped === 0) status = 'confirmed';
    await conn.query('UPDATE `orders` SET `status` = ?, `updatedAt` = NOW() WHERE `id` = ?', [status, orderId]);
  }

  /**
   * İrsaliye stok etkisini geri alır (iade yönünde hareket). writeLog=false
   * olduğunda yalnızca ürün stoğu düzeltilir; belge hareket kayıtları
   * ayrıca purge edilir (silme akışı).
   */
  async function applyWaybillStockReverse(
    conn: PoolConnection,
    items: any[],
    isSales: boolean,
    waybillNumber: string,
    withVersion: boolean,
    writeLog: boolean,
  ): Promise<number[]> {
    const touched: number[] = [];
    const deltaSign = isSales ? 1 : -1;
    const moveType: StockMovementType = deltaSign < 0 ? 'out' : 'in';
    const desc = `${waybillNumber} No'lu ${isSales ? 'Satış' : 'Alış'} İrsaliyesi Stok İadesi`;
    for (const it of items) {
      const pid = Number(it?.productId);
      const qty = Math.abs(Number(it?.quantity) || 0);
      if (!Number.isFinite(pid) || pid <= 0 || qty <= 0) continue;
      await applySignedStockTx(conn, {
        productId: pid,
        signedQuantity: deltaSign * qty,
        color: it.color ?? null,
        size: it.size ?? null,
        type: moveType,
        description: desc,
        date: null,
        writeLog,
        withVersion,
      });
      touched.push(pid);
    }
    return touched;
  }

  /**
   * Fatura stok etkisini uygular veya geri alır. writeLog=false olduğunda
   * yalnızca ürün stoğu düzeltilir; belge hareket kayıtları ayrıca purge
   * edilir (silme akışı), böylece hareket defteri şişmez.
   */
  async function applyInvoiceStock(
    conn: PoolConnection,
    items: any[],
    isSales: boolean,
    invoiceNumber: string,
    documentDate: Date | null,
    reverse: boolean,
    withVersion: boolean,
    writeLog: boolean,
  ): Promise<number[]> {
    const touched: number[] = [];
    const baseSign = isSales ? -1 : 1;
    const moveType: StockMovementType = (baseSign * (reverse ? -1 : 1)) < 0 ? 'out' : 'in';
    const desc = `${invoiceNumber} No'lu ${isSales ? 'Satış' : 'Alış'} Faturası ${reverse ? 'Geri Alma' : 'Stok Hareketi'}`;
    for (const it of items) {
      const pid = Number(it?.productId);
      const qty = Math.abs(Number(it?.quantity) || 0);
      if (!Number.isFinite(pid) || pid <= 0 || qty <= 0) continue;
      await applySignedStockTx(conn, {
        productId: pid,
        signedQuantity: baseSign * qty * (reverse ? -1 : 1),
        color: it.color ?? null,
        size: it.size ?? null,
        type: moveType,
        description: desc,
        date: documentDate,
        writeLog,
        withVersion,
      });
      touched.push(pid);
    }
    return touched;
  }

  function computeInvoiceLines(rawItems: any[]) {
    const items = rawItems.map((raw) => {
      const quantity = Number(raw.quantity) || 0;
      const unitPrice = Number(raw.unitPrice) || 0;
      const discountRate = Number(raw.discountRate) || 0;
      const taxRate = Number(raw.taxRate) || 0;
      const sub = quantity * unitPrice;
      const discountAmount = Number(((sub * discountRate) / 100).toFixed(2));
      const taxable = sub - discountAmount;
      const taxAmount = Number(((taxable * taxRate) / 100).toFixed(2));
      const total = Number((taxable + taxAmount).toFixed(2));
      return {
        productId: raw.productId != null && Number.isFinite(Number(raw.productId)) ? Number(raw.productId) : null,
        orderItemId: raw.orderItemId != null && Number.isFinite(Number(raw.orderItemId)) ? Number(raw.orderItemId) : null,
        productCode: raw.productCode ?? null,
        productName: raw.productName ?? null,
        color: raw.color ?? null,
        colorId: raw.colorId != null && Number.isFinite(Number(raw.colorId)) ? Number(raw.colorId) : null,
        size: raw.size ?? null,
        quantity,
        unit: raw.unit ?? null,
        unitPrice,
        discountRate,
        discountAmount,
        taxRate,
        taxAmount,
        total,
      };
    });
    const subtotal = Number(items.reduce((s, it) => s + it.quantity * it.unitPrice, 0).toFixed(2));
    const discountTotal = Number(items.reduce((s, it) => s + it.discountAmount, 0).toFixed(2));
    const taxTotal = Number(items.reduce((s, it) => s + it.taxAmount, 0).toFixed(2));
    return { items, subtotal, discountTotal, taxTotal };
  }

  router.post('/create-invoice', async (req, res, next) => {
    try {
      const body = req.body || {};
      const invoice = body.invoice || {};
      const rawItems = Array.isArray(body.items) ? body.items : [];

      assertAnyPermission(req.auth, [['invoices', 'create']], 'Fatura oluşturmak için "Fatura" modülünde oluşturma yetkisi gerekir.');

      const type = String(invoice.type);
      if (!['sales', 'purchase'].includes(type)) throw new OpError(400, 'Geçersiz fatura tipi.');
      const scenario = invoice.scenario ? String(invoice.scenario) : 'commercial';
      if (!['commercial', 'basic', 'return', 'withholding', 'export'].includes(scenario)) throw new OpError(400, 'Geçersiz fatura senaryosu.');
      const contactId = Number(invoice.contactId);
      if (!Number.isFinite(contactId) || contactId <= 0) throw new OpError(400, 'Geçerli bir cari hesap seçilmelidir.');
      let invoiceNumber = String(invoice.invoiceNumber || '').trim();
      if (type === 'purchase' && !invoiceNumber) throw new OpError(400, 'Tedarikçi fatura numarası zorunludur.');
      const status = invoice.status == null ? 'issued' : String(invoice.status);
      if (!['draft', 'issued'].includes(status)) {
        throw new OpError(400, 'Yeni fatura yalnızca taslak veya kesinleşmiş durumda oluşturulabilir; iptal için mevcut faturayı iptal edin.', 'INVALID_INVOICE_STATUS');
      }
      if (!rawItems.length) throw new OpError(400, 'Fatura en az bir satır içermelidir.');
      const date = invoice.date ? new Date(invoice.date) : new Date();
      if (Number.isNaN(date.getTime())) throw new OpError(400, 'Geçersiz fatura tarihi.');
      const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
      if (dueDate && Number.isNaN(dueDate.getTime())) throw new OpError(400, 'Geçersiz vade tarihi.');

      const { items, subtotal, discountTotal, taxTotal } = computeInvoiceLines(rawItems);
      for (const it of items) {
        if (it.quantity <= 0) throw new OpError(400, `"${it.productName || 'Satır'}" miktarı sıfırdan büyük olmalıdır.`);
        if (it.unitPrice < 0) throw new OpError(400, `"${it.productName || 'Satır'}" birim fiyatı negatif olamaz.`);
        if (it.taxRate < 0 || it.taxRate > 100) throw new OpError(400, `"${it.productName || 'Satır'}" KDV oranı 0-100 arasında olmalıdır.`);
        if (it.discountRate < 0 || it.discountRate > 100) throw new OpError(400, `"${it.productName || 'Satır'}" iskonto oranı 0-100 arasında olmalıdır.`);
      }
      const withholdingAmount = scenario === 'withholding' ? Number((taxTotal * 0.5).toFixed(2)) : 0;
      const withholdingRate = scenario === 'withholding' ? 5 : null;
      const grandTotal = Number((subtotal - discountTotal + taxTotal - withholdingAmount).toFixed(2));

      // İstemci toplamıyla sunucu hesabı karşılaştır — tutarsızlık reddedilir.
      // Tolerans satır sayısıyla ölçeklenir (istemci satır bazında yuvarlamaz;
      // birikimli kuruş farkları yanlış reddine yol açmamalı).
      if (invoice.grandTotal !== undefined && invoice.grandTotal !== null) {
        const clientGrand = Number(invoice.grandTotal);
        const tolerance = Math.max(0.05, items.length * 0.01);
        if (Number.isFinite(clientGrand) && Math.abs(clientGrand - grandTotal) > tolerance) {
          throw new OpError(400, `Fatura toplamı tutarsız: istemci ${clientGrand.toFixed(2)}, hesaplanan ${grandTotal.toFixed(2)}.`, 'TOTAL_MISMATCH');
        }
      }

      const orderId = invoice.orderId != null && Number.isFinite(Number(invoice.orderId)) ? Number(invoice.orderId) : null;
      const waybillId = invoice.waybillId != null && Number.isFinite(Number(invoice.waybillId)) ? Number(invoice.waybillId) : null;
      const isStockDeducted = invoice.isStockDeducted === true || invoice.isStockDeducted === 1;
      const currency = invoice.currency ? String(invoice.currency) : 'TRY';
      if (currency !== 'TRY') throw new OpError(400, 'Dövizli muhasebe etkin değil. Fatura TRY olarak düzenlenmelidir.', 'UNSUPPORTED_CURRENCY');

      const withVersionContact = await versionSupported('contacts');
      const withVersionProduct = await versionSupported('products');

      const result = await withOperation(req, async (conn) => {
        await assertOpenPeriod(conn, 'accounting', date);
        if (type === 'sales') {
          const [configRows] = await conn.query<any[]>("SELECT `order` FROM settings WHERE id='global_settings'");
          const rawConfig = configRows[0]?.order;
          const config = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig || {};
          const prefix = String(config.invoiceSalesPrefix || 'SAT').replace(/-\d{4}-?$/, '').replace(/-$/, '');
          invoiceNumber = await allocateDocumentNumber(conn, { table: 'invoices', prefix, year: date.getFullYear(), pad: 6 });
        }
        const dup = await conn.query<any[]>('SELECT `id` FROM `invoices` WHERE `invoiceNumber` = ? LIMIT 1', [invoiceNumber]);
        if ((dup[0] as any[]).length) throw new OpError(409, `"${invoiceNumber}" fatura numarası zaten kullanılıyor.`, 'DUPLICATE_INVOICE_NUMBER');

        await lockContact(conn, contactId);

        // İrsaliye bağı: satır kilidi altında doğrula (çift faturalama, iptal,
        // cari/tip uyuşmazlığı). İrsaliye numarası istemciden değil DB'den alınır.
        let waybillNumber = invoice.waybillNumber ?? null;
        let lockedWaybill: Awaited<ReturnType<typeof lockWaybillForInvoice>> | undefined;
        if (waybillId) {
          lockedWaybill = await lockWaybillForInvoice(conn, waybillId, { contactId, type, isStockDeducted });
          waybillNumber = lockedWaybill.waybillNumber;
        }
        if (status !== 'draft') await validateInvoiceLinks(conn, { orderId, waybillId, contactId, type }, items, lockedWaybill);

        const [invRes] = await conn.query(
          `INSERT INTO \`invoices\`
            (\`invoiceNumber\`, \`type\`, \`scenario\`, \`contactId\`, \`orderId\`, \`orderNumber\`, \`waybillId\`, \`waybillNumber\`,
             \`date\`, \`dueDate\`, \`ettn\`, \`subtotal\`, \`discountTotal\`, \`taxTotal\`, \`withholdingRate\`, \`withholdingAmount\`,
             \`grandTotal\`, \`currency\`, \`exchangeRate\`, \`paymentStatus\`, \`paidAmount\`, \`status\`, \`notes\`, \`isStockDeducted\`, \`createdAt\`, \`updatedAt\`)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            invoiceNumber, type, scenario, contactId, orderId, invoice.orderNumber ?? null, waybillId, waybillNumber,
            date, dueDate, invoice.ettn ?? null, subtotal, discountTotal, taxTotal, withholdingRate, withholdingAmount,
            grandTotal, currency, invoice.exchangeRate ?? 1, 'unpaid', 0, status, invoice.notes ?? null, isStockDeducted ? 1 : 0, date, date,
          ],
        );
        const invoiceId = Number((invRes as any)?.insertId || 0);
        if (!invoiceId) throw new OpError(500, 'Fatura kaydı oluşturulamadı.');

        for (const it of items) {
          await conn.query(
            `INSERT INTO \`invoiceItems\`
              (\`invoiceId\`, \`productId\`, \`orderItemId\`, \`productCode\`, \`productName\`, \`color\`, \`colorId\`, \`size\`,
               \`quantity\`, \`unit\`, \`unitPrice\`, \`discountRate\`, \`discountAmount\`, \`taxRate\`, \`taxAmount\`, \`total\`)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [invoiceId, it.productId, it.orderItemId, it.productCode, it.productName, it.color,
             it.colorId ?? (it.color ? await resolveColorIdByName(conn, it.color) : null), it.size,
             it.quantity, it.unit, it.unitPrice, it.discountRate, it.discountAmount, it.taxRate, it.taxAmount, it.total],
          );
        }

        // Taslak faturanın hiçbir yan etkisi yoktur. Sipariş/irsaliye bağı, cari
        // bakiye, stok ve muhasebe yalnızca 'issued' durumunda uygulanır; iptal/silme
        // de aynı koşula bağlı olarak geri alır (tutarlı yaşam döngüsü).
        let touched: number[] = [];
        if (status !== 'draft') {
          if (orderId) await applyInvoiceOrderLink(conn, orderId, items, grandTotal, 1);
          if (waybillId) {
            await conn.query("UPDATE `waybills` SET `invoicedStatus` = 'invoiced', `invoiceId` = ?, `invoiceNumber` = ?, `updatedAt` = NOW() WHERE `id` = ?", [invoiceId, invoiceNumber, waybillId]);
          }
          await applyInvoiceBalance(conn, { type, contactId, grandTotal }, 'apply', withVersionContact);
          if (isStockDeducted) {
            touched = await applyInvoiceStock(conn, items, type === 'sales', invoiceNumber, date, false, withVersionProduct, true);
          }
          await postInvoiceJournalInTx(conn, {
            id: invoiceId, type, invoiceNumber, contactId, date, subtotal, discountTotal, taxTotal, grandTotal,
          }, items);
        }

        await writeAuditInTx(conn, {
          action: 'create',
          module: 'invoices',
          description: `${type === 'sales' ? 'Satış' : 'Alış'} faturası oluşturuldu: ${invoiceNumber}`,
          details: `${items.length} satır, toplam ${grandTotal.toFixed(2)} ${currency}${status !== 'draft' ? ', cari+stok+muhasebe işlendi' : ' (taslak)'}`,
          entityId: invoiceId,
        }, { auth: req.auth, ip: clientIp(req) });

        return { invoiceId, invoiceNumber, grandTotal, status, products: touched };
      });

      if (result.status !== 'draft') broadcast('contacts', 'update', [String(contactId)]);
      if (result.products.length) { broadcast('products', 'update', result.products.map(String)); broadcast('inventoryLogs', 'update', []); }
      broadcast('invoices', 'create', [String(result.invoiceId)]);
      broadcast('invoiceItems', 'create', []);
      if (orderId) broadcast('orders', 'update', [String(orderId)]);
      if (waybillId) broadcast('waybills', 'update', [String(waybillId)]);
      broadcast('journalEntries', 'create', []);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  router.post('/issue-invoice', async (req, res, next) => {
    try {
      const body = req.body || {};
      const invoiceId = Number(body.invoiceId);
      if (!Number.isFinite(invoiceId) || invoiceId <= 0) throw new OpError(400, 'Geçerli bir fatura seçilmelidir.');
      assertAnyPermission(req.auth, [['invoices', 'edit']], 'Fatura düzenlemek için "Fatura" modülünde düzenleme yetkisi gerekir.');

      const withVersionContact = await versionSupported('contacts');
      const withVersionProduct = await versionSupported('products');

      const result = await withOperation(req, async (conn) => {
        const invRows = await conn.query<any[]>(
          'SELECT `id`, `invoiceNumber`, `type`, `contactId`, `orderId`, `waybillId`, `grandTotal`, `status`, `isStockDeducted`, `date`, `subtotal`, `discountTotal`, `taxTotal` FROM `invoices` WHERE `id` = ? FOR UPDATE',
          [invoiceId],
        );
        const invoice = (invRows[0] as any[])[0];
        if (!invoice) throw new OpError(404, 'Fatura bulunamadı.', 'INVOICE_NOT_FOUND');
        if (invoice.status === 'cancelled') throw new OpError(409, 'İptal edilmiş fatura düzenlenemez.', 'ALREADY_CANCELLED');
        if (invoice.status === 'issued') return { invoiceId, alreadyIssued: true, products: [] as number[] };

        const itemRows = await conn.query<any[]>('SELECT `productId`, `orderItemId`, `quantity`, `color`, `size`, `productName`, `unitPrice`, `discountAmount`, `taxRate`, `taxAmount` FROM `invoiceItems` WHERE `invoiceId` = ?', [invoiceId]);
        const items = (itemRows[0] as any[]) || [];
        const grandTotal = Number(invoice.grandTotal) || 0;

        let lockedWaybill: Awaited<ReturnType<typeof lockWaybillForInvoice>> | undefined;
        if (invoice.waybillId) {
          // Taslak oluşturulduktan sonra irsaliye başka bir faturaya bağlanmış
          // veya iptal edilmiş olabilir; bağlamadan önce kilit altında doğrula.
          lockedWaybill = await lockWaybillForInvoice(conn, Number(invoice.waybillId), {
            contactId: Number(invoice.contactId), type: String(invoice.type), isStockDeducted: Number(invoice.isStockDeducted) === 1,
          }, invoiceId);
        }
        await validateInvoiceLinks(conn, {
          orderId: invoice.orderId == null ? null : Number(invoice.orderId),
          waybillId: invoice.waybillId == null ? null : Number(invoice.waybillId),
          contactId: Number(invoice.contactId), type: String(invoice.type),
        }, items, lockedWaybill);
        if (invoice.orderId) await applyInvoiceOrderLink(conn, Number(invoice.orderId), items, grandTotal, 1);
        if (invoice.waybillId) {
          await conn.query("UPDATE `waybills` SET `invoicedStatus` = 'invoiced', `invoiceId` = ?, `invoiceNumber` = ?, `updatedAt` = NOW() WHERE `id` = ?", [invoiceId, invoice.invoiceNumber, Number(invoice.waybillId)]);
        }

        await applyInvoiceBalance(conn, { type: invoice.type, contactId: invoice.contactId, grandTotal }, 'apply', withVersionContact);

        let touched: number[] = [];
        if (invoice.isStockDeducted) {
          touched = await applyInvoiceStock(conn, items, invoice.type === 'sales', invoice.invoiceNumber, invoice.date ? new Date(invoice.date) : null, false, withVersionProduct, true);
        }

        await postInvoiceJournalInTx(conn, {
          id: invoiceId, type: invoice.type, invoiceNumber: invoice.invoiceNumber, contactId: invoice.contactId,
          date: invoice.date ? new Date(invoice.date) : new Date(),
          subtotal: Number(invoice.subtotal) || 0, discountTotal: Number(invoice.discountTotal) || 0,
          taxTotal: Number(invoice.taxTotal) || 0, grandTotal,
        }, items);

        await conn.query("UPDATE `invoices` SET `status` = 'issued', `updatedAt` = NOW(), `version` = `version` + 1 WHERE `id` = ?", [invoiceId]);

        await writeAuditInTx(conn, {
          action: 'update',
          module: 'invoices',
          description: `Fatura düzenlendi (taslak → düzenlendi): ${invoice.invoiceNumber}`,
          details: 'Cari+stok+muhasebe işlendi.',
          entityId: invoiceId,
        }, { auth: req.auth, ip: clientIp(req) });

        return { invoiceId, alreadyIssued: false, products: touched };
      });

      if (!result.alreadyIssued) {
        broadcast('contacts', 'update', []);
        broadcast('invoices', 'update', [String(invoiceId)]);
        broadcast('journalEntries', 'create', []);
        if (result.products.length) { broadcast('products', 'update', result.products.map(String)); broadcast('inventoryLogs', 'update', []); }
      }
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  router.post('/reverse-journal', async (req, res, next) => {
    try {
      const body = req.body || {};
      const journalEntryId = Number(body.journalEntryId);
      if (!Number.isFinite(journalEntryId) || journalEntryId <= 0) throw new OpError(400, 'Geçerli bir yevmiye fişi seçilmelidir.');
      const reason = body.reason ? String(body.reason) : '';
      assertAnyPermission(req.auth, [['accounting', 'edit'], ['accounting', 'delete']], 'Yevmiye fişi iptali için "Muhasebe" modülünde düzenleme/silme yetkisi gerekir.');

      const result = await withOperation(req, async (conn) => {
        const rows = await conn.query<any[]>(
          'SELECT `id`, `entryNumber`, `status`, `documentType` FROM `journalEntries` WHERE `id` = ? FOR UPDATE',
          [journalEntryId],
        );
        const entry = (rows[0] as any[])[0];
        if (!entry) throw new OpError(404, 'Yevmiye fişi bulunamadı.', 'JOURNAL_NOT_FOUND');

        // Otomatik üretilen fişler (fatura/çek/makbuz/açılış ve ters kayıtlar)
        // buradan iptal edilmez; ilgili belgenin kendi kontrollü op'u kullanılmalıdır.
        if (entry.documentType && entry.documentType !== 'manual') {
          throw new OpError(409, `Bu yevmiye fişi otomatik üretilmiştir (${entry.documentType}). İptal için ilgili belgeyi (fatura/irsaliye/çek/makbuz) iptal edin.`, 'JOURNAL_AUTO_NO_REVERSE');
        }

        // Taslak (muhasebeye işlenmemiş) fiş gerçekten silinebilir.
        if (entry.status === 'draft') {
          await conn.query('DELETE FROM `journalEntries` WHERE `id` = ?', [journalEntryId]);
          await writeAuditInTx(conn, {
            action: 'delete',
            module: 'accounting',
            description: `Taslak yevmiye fişi silindi: ${entry.entryNumber}`,
            details: reason ? `Sebep: ${reason}` : undefined,
            entityId: journalEntryId,
          }, { auth: req.auth, ip: clientIp(req) });
          return { journalEntryId, entryNumber: entry.entryNumber, deleted: true, reversed: false as const };
        }

        // Onaylı fiş: ters kayıt eklenir, orijinal korunur (idempotent).
        const reversalEntryId = await reverseJournalEntryInTx(conn, journalEntryId);
        await writeAuditInTx(conn, {
          action: 'update',
          module: 'accounting',
          description: `Yevmiye fişi iptal edildi (ters kayıt): ${entry.entryNumber}`,
          details: reason ? `Sebep: ${reason}` : undefined,
          entityId: journalEntryId,
        }, { auth: req.auth, ip: clientIp(req) });
        return { journalEntryId, entryNumber: entry.entryNumber, deleted: false, reversed: true as const, reversalEntryId };
      });

      broadcast('journalEntries', result.deleted ? 'delete' : 'create', [String(journalEntryId)]);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  router.post('/cancel-invoice', async (req, res, next) => {
    try {
      const body = req.body || {};
      const invoiceId = Number(body.invoiceId);
      if (!Number.isFinite(invoiceId) || invoiceId <= 0) throw new OpError(400, 'Geçerli bir fatura seçilmelidir.');
      const reason = body.reason ? String(body.reason) : '';
      assertAnyPermission(req.auth, [['invoices', 'edit'], ['invoices', 'delete']], 'Fatura iptali için "Fatura" modülünde düzenleme/silme yetkisi gerekir.');

      const withVersionContact = await versionSupported('contacts');
      const withVersionProduct = await versionSupported('products');

      const result = await withOperation(req, async (conn) => {
        const invRows = await conn.query<any[]>(
          'SELECT `id`, `invoiceNumber`, `type`, `contactId`, `orderId`, `waybillId`, `grandTotal`, `status`, `isStockDeducted`, `date`, `notes` FROM `invoices` WHERE `id` = ? FOR UPDATE',
          [invoiceId],
        );
        const invoice = (invRows[0] as any[])[0];
        if (!invoice) throw new OpError(404, 'Fatura bulunamadı.', 'INVOICE_NOT_FOUND');
        if (invoice.status === 'cancelled') throw new OpError(409, 'Bu fatura zaten iptal edilmiş.', 'ALREADY_CANCELLED');

        const itemRows = await conn.query<any[]>('SELECT `productId`, `orderItemId`, `quantity`, `color`, `size`, `productName` FROM `invoiceItems` WHERE `invoiceId` = ?', [invoiceId]);
        const items = (itemRows[0] as any[]) || [];
        const wasIssued = invoice.status === 'issued';
        const grandTotal = Number(invoice.grandTotal) || 0;

        let touched: number[] = [];
        // Yan etkiler yalnızca 'issued' faturada uygulanmıştı; geri alım da aynı
        // koşula bağlı (taslak faturanın sipariş/irsaliye/cari/stok etkisi yoktur).
        if (wasIssued) {
          if (invoice.orderId) await applyInvoiceOrderLink(conn, Number(invoice.orderId), items, grandTotal, -1);
          await resetWaybillsForInvoice(conn, invoiceId, invoice.waybillId ? Number(invoice.waybillId) : null);
          await applyInvoiceBalance(conn, { type: invoice.type, contactId: invoice.contactId, grandTotal }, 'reverse', withVersionContact);
          if (invoice.isStockDeducted) {
            touched = await applyInvoiceStock(conn, items, invoice.type === 'sales', invoice.invoiceNumber, invoice.date ? new Date(invoice.date) : null, true, withVersionProduct, true);
          }
          await reverseInvoiceJournalInTx(conn, invoiceId, invoice.invoiceNumber);
        }

        const now = new Date();
        const stamp = `${now.toLocaleDateString('tr-TR')} ${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
        const cancelNote = reason ? `[İPTAL EDİLDİ: ${stamp} - Sebep: ${reason}]` : `[İPTAL EDİLDİ: ${stamp}]`;
        const notes = invoice.notes ? `${invoice.notes}\n${cancelNote}` : cancelNote;
        await conn.query("UPDATE `invoices` SET `status` = 'cancelled', `notes` = ?, `updatedAt` = NOW(), `version` = `version` + 1 WHERE `id` = ?", [notes, invoiceId]);

        await writeAuditInTx(conn, {
          action: 'update',
          module: 'invoices',
          description: `Fatura iptal edildi: ${invoice.invoiceNumber}`,
          details: `${reason ? `Sebep: ${reason}. ` : ''}Cari+stok+muhasebe geri alındı.`,
          entityId: invoiceId,
        }, { auth: req.auth, ip: clientIp(req) });

        return { invoiceId, invoiceNumber: invoice.invoiceNumber, products: touched, wasIssued };
      });

      if (result.wasIssued) broadcast('contacts', 'update', []);
      if (result.products.length) { broadcast('products', 'update', result.products.map(String)); broadcast('inventoryLogs', 'update', []); }
      broadcast('invoices', 'update', [String(invoiceId)]);
      broadcast('journalEntries', 'create', []);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  router.post('/cancel-waybill', async (req, res, next) => {
    try {
      const body = req.body || {};
      const waybillId = Number(body.waybillId);
      if (!Number.isFinite(waybillId) || waybillId <= 0) throw new OpError(400, 'Geçerli bir irsaliye seçilmelidir.');
      const reason = body.reason ? String(body.reason) : '';
      assertAnyPermission(req.auth, [['waybills', 'edit'], ['waybills', 'delete']], 'İrsaliye iptali için "İrsaliye" modülünde düzenleme/silme yetkisi gerekir.');

      const withVersionProduct = await versionSupported('products');
      const withVersionWaybill = await versionSupported('waybills');

      const result = await withOperation(req, async (conn) => {
        const wbRows = await conn.query<any[]>(
          'SELECT `id`, `waybillNumber`, `type`, `status`, `orderId`, `invoicedStatus`, `invoiceId`, `invoiceNumber`, `isStockDeducted`, `notes` FROM `waybills` WHERE `id` = ? FOR UPDATE',
          [waybillId],
        );
        const waybill = (wbRows[0] as any[])[0];
        if (!waybill) throw new OpError(404, 'İrsaliye bulunamadı.', 'WAYBILL_NOT_FOUND');
        if (waybill.status === 'cancelled') return { waybillId, alreadyCancelled: true, products: [] as number[] };
        if (waybill.invoicedStatus === 'invoiced' || waybill.invoiceId != null) {
          throw new OpError(409, `Bu irsaliye faturalandırılmıştır (${waybill.invoiceNumber || 'bağlı fatura'}). İrsaliyeyi iptal etmek için önce faturayı iptal ediniz.`, 'WAYBILL_INVOICED');
        }

        const itemRows = await conn.query<any[]>('SELECT `productId`, `orderItemId`, `quantity`, `color`, `size`, `productName` FROM `waybillItems` WHERE `waybillId` = ?', [waybillId]);
        const items = (itemRows[0] as any[]) || [];
        // Yan etkiler yalnızca 'issued' irsaliyede uygulanmıştır; geri alım da
        // aynı koşula bağlı (taslak irsaliyenin sipariş/stok etkisi yoktur).
        const wasIssued = waybill.status === 'issued';

        if (wasIssued && waybill.orderId) await revertWaybillOrderShipments(conn, Number(waybill.orderId), items);

        let touched: number[] = [];
        if (wasIssued && Number(waybill.isStockDeducted ?? 1) !== 0) {
          touched = await applyWaybillStockReverse(conn, items, waybill.type === 'sales', waybill.waybillNumber, withVersionProduct, true);
        }

        const now = new Date();
        const stamp = `${now.toLocaleDateString('tr-TR')} ${now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
        const cancelNote = reason ? `[İPTAL EDİLDİ: ${stamp} - Sebep: ${reason}]` : `[İPTAL EDİLDİ: ${stamp}]`;
        const notes = waybill.notes ? `${waybill.notes}\n${cancelNote}` : cancelNote;
        await conn.query(
          `UPDATE \`waybills\` SET \`status\` = 'cancelled', \`notes\` = ?${withVersionWaybill ? ', \`version\` = \`version\` + 1' : ''}, \`updatedAt\` = NOW() WHERE \`id\` = ?`,
          [notes, waybillId],
        );

        await writeAuditInTx(conn, {
          action: 'update',
          module: 'waybills',
          description: `İrsaliye iptal edildi: ${waybill.waybillNumber}`,
          details: `${reason ? `Sebep: ${reason}. ` : ''}${wasIssued ? 'Sipariş sevk miktarları ve stok geri alındı.' : 'Yan etki geri alımı gerekmedi (taslak).'}`,
          entityId: waybillId,
        }, { auth: req.auth, ip: clientIp(req) });

        return { waybillId, waybillNumber: waybill.waybillNumber, alreadyCancelled: false, wasIssued, products: touched };
      });

      if (result.alreadyCancelled) {
        res.json({ data: result });
        return;
      }
      broadcast('waybills', 'update', [String(waybillId)]);
      if (result.wasIssued) broadcast('orders', 'update', []);
      if (result.products.length) { broadcast('products', 'update', result.products.map(String)); broadcast('inventoryLogs', 'update', []); }
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Yönetici panosu özeti (salt okunur agregasyon)                    */
  /*                                                                  */
  /* Pano eskiden ~14 tabloyu TAM çekip istemcide döngülerle           */
  /* toplulaştırıyordu. Burada tüm özetler SQL SUM/COUNT/GROUP BY ile   */
  /* sunucuda hesaplanır; istemciye yalnızca küçük bir özet + son 5'lik  */
  /* listeler döner. Her bölüm kullanıcının görüntüleme yetkisine göre  */
  /* koşullu çalışır (yetkisiz modül → sıfır/boş, 403 yok).            */
  /* ---------------------------------------------------------------- */
  router.get('/dashboard-summary', async (req, res, next) => {
    try {
      const role = req.auth?.role || null;
      const canView = (m: AppModule) => can(role, m, 'view');

      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth() + 1;

      const financeSection = async () => {
        const empty = { income: 0, expense: 0, cashBalance: 0, bankBalance: 0, customerChecksCount: 0, customerChecksTotal: 0, issuedChecksTotal: 0, recentTransactions: [] as any[], cashFlowByDay: [] as any[] };
        if (!canView('finance')) return empty;
        const [tx, cash, bank, chk, recent, byDay] = await Promise.all([
          queryOne<any>("SELECT COALESCE(SUM(CASE WHEN `type`='income' THEN `amount` END),0) AS income, COALESCE(SUM(CASE WHEN `type`='expense' THEN `amount` END),0) AS expense FROM `transactions`"),
          queryOne<any>("SELECT COALESCE(SUM(`balance`),0) AS bal FROM `cashBoxes`"),
          queryOne<any>("SELECT COALESCE(SUM(`balance`),0) AS bal FROM `bankAccounts`"),
          queryOne<any>("SELECT COALESCE(SUM(CASE WHEN `type` IN ('received_check','received_note') AND `status` IN ('portfolio','bank_collection') THEN `amount` END),0) AS custTotal, COALESCE(SUM(CASE WHEN `type` IN ('received_check','received_note') AND `status` IN ('portfolio','bank_collection') THEN 1 END),0) AS custCount, COALESCE(SUM(CASE WHEN `type` IN ('given_check','given_note') AND `status`='portfolio' THEN `amount` END),0) AS issuedTotal FROM `checks`"),
          query<any>("SELECT `id`, `type`, `amount`, `date`, `description` FROM `transactions` ORDER BY `date` DESC, `id` DESC LIMIT 5"),
          query<any>("SELECT DAYOFWEEK(`date`) AS dw, `type`, COALESCE(SUM(`amount`),0) AS total FROM `transactions` GROUP BY DAYOFWEEK(`date`), `type`"),
        ]);
        const incomeByDw: Record<number, number> = {};
        const expenseByDw: Record<number, number> = {};
        for (const r of byDay || []) {
          const dw = Number(r.dw);
          if (r.type === 'income') incomeByDw[dw] = Number(r.total) || 0;
          else if (r.type === 'expense') expenseByDw[dw] = Number(r.total) || 0;
        }
        const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
        const cashFlowByDay = dayNames.map((name, i) => {
          const dw = ((i + 1) % 7) + 1; // JS getDay=(i+1)%7 → MySQL DAYOFWEEK=getDay+1
          return { name, gelir: incomeByDw[dw] || 0, gider: expenseByDw[dw] || 0 };
        });
        return {
          income: Number(tx?.income) || 0,
          expense: Number(tx?.expense) || 0,
          cashBalance: Number(cash?.bal) || 0,
          bankBalance: Number(bank?.bal) || 0,
          customerChecksCount: Number(chk?.custCount) || 0,
          customerChecksTotal: Number(chk?.custTotal) || 0,
          issuedChecksTotal: Number(chk?.issuedTotal) || 0,
          recentTransactions: recent || [],
          cashFlowByDay,
        };
      };

      const hrSection = async () => {
        const empty = { activeEmployeesCount: 0, sgkEmployees: 0, dailyEmployees: 0, totalNetPayroll: 0, totalEmployerCost: 0, unpaidPayrollsCount: 0, unaccountedPayrollsCount: 0, pendingAdvancesCount: 0, pendingAdvanceTotal: 0 };
        if (!canView('hr')) return empty;
        const [emp, pay, adv] = await Promise.all([
          queryOne<any>("SELECT COUNT(*) AS active, COALESCE(SUM(CASE WHEN `sgkStatus`='sgk_li' THEN 1 END),0) AS sgk FROM `employees` WHERE `status`='active'"),
          queryOne<any>("SELECT COALESCE(SUM(`netSalary`),0) AS net, COALESCE(SUM(`totalEmployerCost`),0) AS cost, COALESCE(SUM(CASE WHEN `paymentStatus`<>'paid' THEN 1 END),0) AS unpaid, COALESCE(SUM(CASE WHEN `isAccounted` IS NULL OR `isAccounted`=0 THEN 1 END),0) AS unaccounted FROM `payrollRecords` WHERE `year`=? AND `month`=?", [curYear, curMonth]),
          queryOne<any>("SELECT COUNT(*) AS cnt, COALESCE(SUM(`amount`),0) AS total FROM `advanceRequests` WHERE `status`='pending'"),
        ]);
        const active = Number(emp?.active) || 0;
        const sgk = Number(emp?.sgk) || 0;
        return {
          activeEmployeesCount: active, sgkEmployees: sgk, dailyEmployees: active - sgk,
          totalNetPayroll: Number(pay?.net) || 0, totalEmployerCost: Number(pay?.cost) || 0,
          unpaidPayrollsCount: Number(pay?.unpaid) || 0, unaccountedPayrollsCount: Number(pay?.unaccounted) || 0,
          pendingAdvancesCount: Number(adv?.cnt) || 0, pendingAdvanceTotal: Number(adv?.total) || 0,
        };
      };

      const inventorySection = async () => {
        const empty = { productCount: 0, lowStockCount: 0, lowStockProducts: [] as any[], categoryStats: { finished: 0, semi_finished: 0, raw_material: 0, accessory: 0 } };
        if (!canView('inventory')) return empty;
        const [cnt, lowCnt, lowSample, catRows] = await Promise.all([
          queryOne<any>("SELECT COUNT(*) AS n FROM `products`"),
          queryOne<any>("SELECT COUNT(*) AS n FROM `products` WHERE `stock` <= `minStock`"),
          query<any>("SELECT `id`, `code`, `name`, `stock`, `minStock`, `unit` FROM `products` WHERE `stock` <= `minStock` ORDER BY (`stock` - `minStock`) ASC LIMIT 10"),
          query<any>("SELECT CASE WHEN `categoryType`='semi_finished' THEN 'semi' WHEN `isRawMaterial`=1 OR `categoryType`='raw_material' THEN 'raw' WHEN `categoryType`='accessory' THEN 'acc' ELSE 'finished' END AS cat, COUNT(*) AS n FROM `products` GROUP BY cat"),
        ]);
        const categoryStats = { finished: 0, semi_finished: 0, raw_material: 0, accessory: 0 };
        for (const r of catRows || []) {
          const n = Number(r.n) || 0;
          if (r.cat === 'semi') categoryStats.semi_finished += n;
          else if (r.cat === 'raw') categoryStats.raw_material += n;
          else if (r.cat === 'acc') categoryStats.accessory += n;
          else categoryStats.finished += n;
        }
        return { productCount: Number(cnt?.n) || 0, lowStockCount: Number(lowCnt?.n) || 0, lowStockProducts: lowSample || [], categoryStats };
      };

      const ordersSection = async () => {
        const empty = { salesOrdersCount: 0, totalOrderQty: 0, totalShippedQty: 0, remainingToShip: 0, recentOrders: [] as any[] };
        if (!canView('orders')) return empty;
        const [c, oi, recent] = await Promise.all([
          queryOne<any>("SELECT COALESCE(SUM(CASE WHEN `type`='sales' THEN 1 END),0) AS n FROM `orders`"),
          queryOne<any>("SELECT COALESCE(SUM(`quantity`),0) AS q, COALESCE(SUM(COALESCE(NULLIF(`shippedQuantity`,0), NULLIF(`invoicedQuantity`,0), 0)),0) AS s FROM `orderItems`"),
          query<any>("SELECT `id`, `orderNumber`, `date`, `grandTotal` FROM `orders` ORDER BY `date` DESC, `id` DESC LIMIT 5"),
        ]);
        const totalOrderQty = Number(oi?.q) || 0;
        const totalShippedQty = Number(oi?.s) || 0;
        return { salesOrdersCount: Number(c?.n) || 0, totalOrderQty, totalShippedQty, remainingToShip: Math.max(0, totalOrderQty - totalShippedQty), recentOrders: recent || [] };
      };

      const productionSection = async () => {
        const empty = { activeWorkOrdersCount: 0, totalProducedQty: 0, totalInProductionQty: 0, stageCounts: { kesim: 0, dikim: 0, montaj: 0, finisaj: 0 } };
        if (!canView('production')) return empty;
        const wo = await queryOne<any>("SELECT COALESCE(SUM(CASE WHEN `status` IN ('in_progress','pending') THEN 1 END),0) AS active, COALESCE(SUM(CASE WHEN `status` IN ('in_progress','pending') THEN `quantity` END),0) AS inProd, COALESCE(SUM(CASE WHEN `status`='completed' THEN `quantity` END),0) AS produced, COALESCE(SUM(CASE WHEN `currentStage`='cutting' THEN 1 END),0) AS kesim, COALESCE(SUM(CASE WHEN `currentStage` IN ('sewing','printing') THEN 1 END),0) AS dikim, COALESCE(SUM(CASE WHEN `currentStage`='assembly' THEN 1 END),0) AS montaj, COALESCE(SUM(CASE WHEN `currentStage` IN ('finishing','quality_packing') THEN 1 END),0) AS finisaj FROM `workOrders`");
        return {
          activeWorkOrdersCount: Number(wo?.active) || 0,
          totalInProductionQty: Number(wo?.inProd) || 0,
          totalProducedQty: Number(wo?.produced) || 0,
          stageCounts: { kesim: Number(wo?.kesim) || 0, dikim: Number(wo?.dikim) || 0, montaj: Number(wo?.montaj) || 0, finisaj: Number(wo?.finisaj) || 0 },
        };
      };

      const accountingSection = async () => {
        const empty = { totalJournals: 0, unbalancedJournals: 0, kdv191Debit: 0, kdv391Credit: 0, netKdvDifference: 0 };
        if (!canView('accounting')) return empty;
        const [meta, kdv] = await Promise.all([
          queryOne<any>("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN `isBalanced`=0 THEN 1 END),0) AS unbalanced FROM `journalEntries`"),
          queryOne<any>("SELECT COALESCE(SUM(CASE WHEN jt.accountCode LIKE '191%' THEN jt.debit END),0) AS kdv191, COALESCE(SUM(CASE WHEN jt.accountCode LIKE '391%' THEN jt.credit END),0) AS kdv391 FROM `journalEntries` je, JSON_TABLE(je.`lines`, '$[*]' COLUMNS (accountCode VARCHAR(50) PATH '$.accountCode', debit DECIMAL(15,2) PATH '$.debit', credit DECIMAL(15,2) PATH '$.credit')) AS jt"),
        ]);
        const kdv191Debit = Number(kdv?.kdv191) || 0;
        const kdv391Credit = Number(kdv?.kdv391) || 0;
        return { totalJournals: Number(meta?.total) || 0, unbalancedJournals: Number(meta?.unbalanced) || 0, kdv191Debit, kdv391Credit, netKdvDifference: kdv391Credit - kdv191Debit };
      };

      const invoicesSection = async () => {
        const empty = { openSalesInvoicesCount: 0, openSalesTotal: 0, openPurchaseTotal: 0 };
        if (!canView('invoices')) return empty;
        const inv = await queryOne<any>("SELECT COALESCE(SUM(CASE WHEN `type`='sales' AND `paymentStatus`<>'paid' THEN 1 END),0) AS cnt, COALESCE(SUM(CASE WHEN `type`='sales' AND `paymentStatus`<>'paid' THEN `grandTotal`-`paidAmount` END),0) AS salesTotal, COALESCE(SUM(CASE WHEN `type`='purchase' AND `paymentStatus`<>'paid' THEN `grandTotal`-`paidAmount` END),0) AS purchaseTotal FROM `invoices`");
        return { openSalesInvoicesCount: Number(inv?.cnt) || 0, openSalesTotal: Number(inv?.salesTotal) || 0, openPurchaseTotal: Number(inv?.purchaseTotal) || 0 };
      };

      const waybillsSection = async () => {
        if (!canView('waybills')) return { uninvoicedWaybillsCount: 0 };
        const wb = await queryOne<any>("SELECT COUNT(*) AS n FROM `waybills` WHERE `invoicedStatus`='not_invoiced'");
        return { uninvoicedWaybillsCount: Number(wb?.n) || 0 };
      };

      const [fin, hr, invn, ord, prod, acc, invs, wb] = await Promise.all([
        financeSection(), hrSection(), inventorySection(), ordersSection(),
        productionSection(), accountingSection(), invoicesSection(), waybillsSection(),
      ]);

      const stats = {
        income: fin.income, expense: fin.expense, profit: fin.income - fin.expense,
        cashBalance: fin.cashBalance, bankBalance: fin.bankBalance, totalLiquidAssets: fin.cashBalance + fin.bankBalance,
        customerChecksCount: fin.customerChecksCount, customerChecksTotal: fin.customerChecksTotal, issuedChecksTotal: fin.issuedChecksTotal,
        activeEmployeesCount: hr.activeEmployeesCount, sgkEmployees: hr.sgkEmployees, dailyEmployees: hr.dailyEmployees,
        totalNetPayroll: hr.totalNetPayroll, totalEmployerCost: hr.totalEmployerCost, unpaidPayrollsCount: hr.unpaidPayrollsCount, unaccountedPayrollsCount: hr.unaccountedPayrollsCount,
        pendingAdvancesCount: hr.pendingAdvancesCount, pendingAdvanceTotal: hr.pendingAdvanceTotal,
        totalJournals: acc.totalJournals, unbalancedJournals: acc.unbalancedJournals, netKdvDifference: acc.netKdvDifference, kdv191Debit: acc.kdv191Debit, kdv391Credit: acc.kdv391Credit,
        openSalesInvoicesCount: invs.openSalesInvoicesCount, openSalesTotal: invs.openSalesTotal, openPurchaseTotal: invs.openPurchaseTotal,
        uninvoicedWaybillsCount: wb.uninvoicedWaybillsCount,
        lowStockProducts: invn.lowStockProducts, lowStockCount: invn.lowStockCount,
        salesOrdersCount: ord.salesOrdersCount, totalOrderQty: ord.totalOrderQty, totalShippedQty: ord.totalShippedQty, remainingToShip: ord.remainingToShip,
        activeWorkOrdersCount: prod.activeWorkOrdersCount, totalProducedQty: prod.totalProducedQty, totalInProductionQty: prod.totalInProductionQty, stageCounts: prod.stageCounts, categoryStats: invn.categoryStats,
      };

      res.json({
        data: {
          stats,
          productCount: invn.productCount,
          recentTransactions: fin.recentTransactions,
          recentOrders: ord.recentOrders,
          cashFlowByDay: fin.cashFlowByDay,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Mizan (trial balance) — sunucu tarafı agregasyon                  */
  /*                                                                  */
  /* Eskiden istemci tüm accounts + journalEntries'yi (tüm satırlarla)  */
  /* indirip her filtre değişiminde döngülerle topluyordu. Burada satır  */
  /* toplamları SQL GROUP BY + JSON_TABLE ile kesin hesap kodu bazında   */
  /* hesaplanır; üst kodlara yuvarlama ve satır üretimi paylaşılan       */
  /* buildMizanRows ile yapılır. İstemciye yalnızca hazır MizanRow[] döner.*/
  /* ---------------------------------------------------------------- */
  router.get('/mizan', async (req, res, next) => {
    try {
      const role = req.auth?.role || null;
      if (!can(role, 'accounting', 'view')) {
        res.json({ data: [] });
        return;
      }

      const onlyWithBalance = req.query.onlyWithBalance === '1' || req.query.onlyWithBalance === 'true';
      const levelFilterRaw = String(req.query.levelFilter || 'all');
      const levelFilter = (
        ['all', 'class', 'group', 'main', 'sub'].includes(levelFilterRaw) ? levelFilterRaw : 'all'
      ) as MizanLevelFilter;

      const conds: string[] = [];
      const params: any[] = [];
      if (req.query.startDate) {
        conds.push('je.`date` >= ?');
        params.push(new Date(String(req.query.startDate)));
      }
      if (req.query.endDate) {
        conds.push('je.`date` <= ?');
        params.push(new Date(String(req.query.endDate)));
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      const [acctRows, totalRows] = await Promise.all([
        query<any>('SELECT `code`, `name`, `type`, `level` FROM `accounts` ORDER BY `id` ASC'),
        query<any>(
          `SELECT jt.\`accountCode\` AS \`code\`, COALESCE(SUM(jt.\`debit\`),0) AS \`debit\`, COALESCE(SUM(jt.\`credit\`),0) AS \`credit\`
             FROM \`journalEntries\` je,
                  JSON_TABLE(je.\`lines\`, '$[*]' COLUMNS (
                    accountCode VARCHAR(50) PATH '$.accountCode',
                    debit DECIMAL(15,2) PATH '$.debit',
                    credit DECIMAL(15,2) PATH '$.credit'
                  )) AS jt
             ${where}
            GROUP BY jt.\`accountCode\``,
          params,
        ),
      ]);

      const perCodeTotals = new Map<string, { debit: number; credit: number }>();
      for (const r of totalRows || []) {
        perCodeTotals.set(String(r.code), { debit: Number(r.debit) || 0, credit: Number(r.credit) || 0 });
      }
      const accounts = (acctRows || []).map((a: any) => ({
        code: String(a.code ?? ''),
        name: String(a.name ?? ''),
        type: String(a.type ?? ''),
        level: Number(a.level) || 0,
      }));

      const rows = buildMizanRows(accounts, perCodeTotals, { onlyWithBalance, levelFilter });
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Raporlar ana sayfa (Genel Yönetim Özeti) KPI'ları                 */
  /*                                                                  */
  /* Reports/index eskiden 9 tam tabloyu indirip reduce ile özet        */
  /* çıkarıyordu. Burada her KPI SQL ile sunucuda hesaplanır ve bölüm    */
  /* kullanıcının görüntüleme yetkisine göre koşullu çalışır (yetkisiz → 0).*/
  /* ---------------------------------------------------------------- */
  router.get('/reports-summary', async (req, res, next) => {
    try {
      const role = req.auth?.role || null;
      const canView = (m: AppModule) => can(role, m, 'view');

      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth() + 1;

      const inventorySection = async () => {
        if (!canView('inventory')) return { totalStockCount: 0, criticalStockCount: 0 };
        const r = await queryOne<any>(
          'SELECT COALESCE(SUM(`stock`),0) AS totalStock, COALESCE(SUM(CASE WHEN `stock` <= `minStock` THEN 1 END),0) AS critical FROM `products`',
        );
        return { totalStockCount: Number(r?.totalStock) || 0, criticalStockCount: Number(r?.critical) || 0 };
      };

      const productionSection = async () => {
        if (!canView('production')) return { activeWorkOrdersCount: 0, activePairsInProduction: 0 };
        // İstemcideki `w.currentStage !== 'completed'` karşılığı: NULL de "aktif" sayılır.
        const r = await queryOne<any>(
          "SELECT COALESCE(SUM(CASE WHEN `currentStage` IS NULL OR `currentStage` <> 'completed' THEN 1 END),0) AS cnt, COALESCE(SUM(CASE WHEN `currentStage` IS NULL OR `currentStage` <> 'completed' THEN `quantity` END),0) AS qty FROM `workOrders`",
        );
        return { activeWorkOrdersCount: Number(r?.cnt) || 0, activePairsInProduction: Number(r?.qty) || 0 };
      };

      const financeSection = async () => {
        if (!canView('finance')) return { totalLiquidity: 0 };
        const r = await queryOne<any>(
          'SELECT (SELECT COALESCE(SUM(`balance`),0) FROM `cashBoxes`) + (SELECT COALESCE(SUM(`balance`),0) FROM `bankAccounts`) AS liq',
        );
        return { totalLiquidity: Number(r?.liq) || 0 };
      };

      const hrSection = async () => {
        if (!canView('hr')) return { totalEmployeesCount: 0, currentMonthEmployerCost: 0 };
        const r = await queryOne<any>(
          "SELECT (SELECT COUNT(*) FROM `employees` WHERE `status` = 'active') AS emp, (SELECT COALESCE(SUM(`totalEmployerCost`),0) FROM `payrollRecords` WHERE `year` = ? AND `month` = ?) AS cost",
          [curYear, curMonth],
        );
        return { totalEmployeesCount: Number(r?.emp) || 0, currentMonthEmployerCost: Number(r?.cost) || 0 };
      };

      const accountingSection = async () => {
        if (!canView('accounting')) return { kdv191: 0, kdv391: 0, netKdvDiff: 0 };
        const r = await queryOne<any>(
          "SELECT COALESCE(SUM(CASE WHEN jt.accountCode LIKE '191%' THEN COALESCE(jt.debit,0) - COALESCE(jt.credit,0) END),0) AS kdv191, COALESCE(SUM(CASE WHEN jt.accountCode LIKE '391%' THEN COALESCE(jt.credit,0) - COALESCE(jt.debit,0) END),0) AS kdv391 FROM `journalEntries` je, JSON_TABLE(je.`lines`, '$[*]' COLUMNS (accountCode VARCHAR(50) PATH '$.accountCode', debit DECIMAL(15,2) PATH '$.debit', credit DECIMAL(15,2) PATH '$.credit')) AS jt",
        );
        const kdv191 = Number(r?.kdv191) || 0;
        const kdv391 = Number(r?.kdv391) || 0;
        return { kdv191, kdv391, netKdvDiff: kdv391 - kdv191 };
      };

      const ordersSection = async () => {
        if (!canView('orders')) return { salesOrdersCount: 0 };
        const r = await queryOne<any>("SELECT COUNT(*) AS n FROM `orders` WHERE `type` = 'sales'");
        return { salesOrdersCount: Number(r?.n) || 0 };
      };

      const [inventory, production, finance, hr, accounting, orders] = await Promise.all([
        inventorySection(), productionSection(), financeSection(), hrSection(), accountingSection(), ordersSection(),
      ]);

      res.json({ data: { inventory, production, finance, hr, accounting, orders } });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Toplu barkod üretimi (seçili kartlar veya barkodu olmayanlar)     */
  /*                                                                  */
  /* Sıra numaraları `documentNumbers` (scope='barcodes') üzerinde tek  */
  /* atomik adımda rezerve edilir; böylece eşzamanlı istekler çakışmaz. */
  /* Yalnızca barkodu OLMAYAN ürünlere yazılır: mevcut koli/varyant     */
  /* barkodları (ve içindeki stok) asla ezilmez.                        */
  /* ---------------------------------------------------------------- */
  router.post('/generate-barcodes', async (req, res, next) => {
    try {
      const body = req.body || {};
      assertAnyPermission(
        req.auth,
        [['inventory', 'edit']],
        'Toplu barkod üretimi için "Stok" modülünde düzenleme yetkisi gerekir.',
      );

      const onlyMissing = body.onlyMissing === true;
      const rawIds = Array.isArray(body.productIds)
        ? body.productIds.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0)
        : [];
      if (!onlyMissing && rawIds.length === 0) {
        throw new OpError(400, 'Barkod üretilecek ürünler seçilmelidir veya "yalnızca barkodu olmayanlar" belirtilmelidir.');
      }

      const withVersion = await versionSupported('products');

      const result = await withOperation(req, async (conn) => {
        // 1) Barkod ayarları: tip, önek ve mevcut sayaç (istemci üreteciyle süreklilik için seed).
        const sRows = await conn.query<any[]>(
          `SELECT \`barcodeType\`, \`barcodePrefix\`, \`nextBarcodeSequence\` FROM \`settings\`
            WHERE \`id\` IN ('global_settings', 'global_barcode')
            ORDER BY (\`id\` = 'global_settings') DESC LIMIT 1`,
        );
        const sRow = (sRows[0] as any[])[0] || {};
        const barcodeType = String(sRow.barcodeType || 'CODE-128');
        const barcodePrefix = sRow.barcodePrefix != null ? String(sRow.barcodePrefix) : '869';
        const seedSeq = Number(sRow.nextBarcodeSequence) || 1000000;

        // 2) Hedef ürünleri satır kilidiyle seç. Her iki durumda da YALNIZCA barkodu
        //    olmayanlar alınır; seçili kartlardan zaten barkodu olanlar atlanır.
        const missing =
          '(`barcode` IS NULL OR `barcode` = \'\') AND (`colorBoxBarcodes` IS NULL OR JSON_LENGTH(`colorBoxBarcodes`) = 0) AND (`variantBarcodes` IS NULL OR JSON_LENGTH(`variantBarcodes`) = 0)';
        const params: any[] = [];
        let where: string;
        if (rawIds.length) {
          where = `WHERE \`id\` IN (${rawIds.map(() => '?').join(', ')}) AND ${missing}`;
          params.push(...rawIds);
        } else {
          where = `WHERE ${missing}`;
        }
        const pRows = await conn.query<any[]>(
          `SELECT \`id\`, \`code\`, \`name\`, \`isFootwear\`, \`hasSizeVariants\`, \`assortment\`, \`assortmentTemplateId\`, ${PRODUCT_COLORS_SQL} AS \`colors\`
             FROM \`products\` ${where} FOR UPDATE`,
          params,
        );
        const products = (pRows[0] as any[]) || [];
        const skipped = rawIds.length ? Math.max(0, rawIds.length - products.length) : 0;
        if (!products.length) {
          return { generated: [] as number[], skipped, totalBarcodes: 0, barcodeType, barcodePrefix };
        }

        // 3) Her ürün için gereken barkod sayısı ve yapısını planla
        //    (istemcideki generateAutomatedBarcodes ile aynı mantık).
        const plans: { id: number; colors: string[]; assortment: any[]; variantMode: boolean; need: number }[] = [];
        let total = 0;
        for (const product of products) {
          const colors = parseColorNames(product.colors);
          const effectiveColors = colors.length ? colors : ['Genel'];
          const wantsVariants = Boolean(product.isFootwear || product.hasSizeVariants);
          let assortment = parseVariants(product.assortment);
          if (wantsVariants && assortment.length === 0 && product.assortmentTemplateId) {
            const tRows = await conn.query<any[]>('SELECT `items` FROM `assortmentTemplates` WHERE `id` = ?', [product.assortmentTemplateId]);
            const tmpl = (tRows[0] as any[])[0];
            if (tmpl) assortment = parseVariants(tmpl.items);
          }
          const variantMode = wantsVariants && assortment.length > 0;
          const perColor = variantMode ? 1 + assortment.length : 1;
          const need = effectiveColors.length * perColor;
          plans.push({ id: Number(product.id), colors: effectiveColors, assortment: variantMode ? assortment : [], variantMode, need });
          total += need;
        }

        // 4) Tüm parti için sıraları tek atomik adımda rezerve et.
        const seqs = await allocateBarcodeSequences(conn, total, seedSeq);
        let cursor = 0;
        const nextBarcode = () => formatBarcodeValue(seqs[cursor++], barcodeType, barcodePrefix);

        const generated: number[] = [];
        for (const plan of plans) {
          const colorBoxBarcodes: { color: string; barcode: string }[] = [];
          const variantBarcodes: { size: string; color: string; barcode: string; stock: number }[] = [];
          for (const color of plan.colors) {
            colorBoxBarcodes.push({ color, barcode: nextBarcode() });
            if (plan.variantMode) {
              for (const it of plan.assortment) {
                variantBarcodes.push({ size: String(it.size ?? ''), color, barcode: nextBarcode(), stock: 0 });
              }
            }
          }
          const sets = ['`colorBoxBarcodes` = ?', '`updatedAt` = NOW()'];
          const up: any[] = [JSON.stringify(colorBoxBarcodes)];
          if (plan.variantMode) { sets.push('`variantBarcodes` = ?'); up.push(JSON.stringify(variantBarcodes)); }
          if (withVersion) sets.push('`version` = `version` + 1');
          up.push(plan.id);
          await conn.query(`UPDATE \`products\` SET ${sets.join(', ')} WHERE \`id\` = ?`, up);
          generated.push(plan.id);
        }

        // 5) Sayaç köprüsü: istemcideki tekil üreteç bu aralıktan SONRA devam etsin.
        const lastSeq = seqs[seqs.length - 1];
        if (Number.isFinite(lastSeq)) {
          await conn.query(
            `UPDATE \`settings\` SET \`nextBarcodeSequence\` = ? WHERE \`id\` IN ('global_settings', 'global_barcode')`,
            [lastSeq + 1],
          );
        }

        // 6) Tek özet audit kaydı.
        await writeAuditInTx(conn, {
          action: 'update',
          module: 'inventory',
          description: `Toplu barkod üretimi: ${generated.length} ürün, ${total} barkod (${barcodeType})`,
          details: `Ürün ID'leri: ${generated.slice(0, 50).join(', ')}`.slice(0, 1000),
        }, { auth: req.auth, ip: clientIp(req) });

        return { generated, skipped, totalBarcodes: total, barcodeType, barcodePrefix };
      });

      if (result.generated.length) broadcast('products', 'update', result.generated.map(String));
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Kalıp (last) takip motoru                                         */
  /* ---------------------------------------------------------------- */

  /** Kalıp envanter özeti: KPI toplamları + kalıp başına konum kırılımı (çift). */
  router.get('/mold-summary', async (req, res, next) => {
    try {
      assertAnyPermission(req.auth, [['molds', 'view']], 'Kalıp özeti için "Kalıp Takibi" modülünde görüntüleme yetkisi gerekir.');
      const rows = await query<any>(
        `SELECT m.id, m.code, m.name, m.sizeRange, m.moldType, m.brand, m.isActive, m.productId, m.image,
                COALESCE(SUM(s.pairs), 0) AS totalPairs,
                COALESCE(SUM(CASE WHEN s.locationType IN ('factory_warehouse','factory_line','factory_other') THEN s.pairs END), 0) AS factoryPairs,
                COALESCE(SUM(CASE WHEN s.locationType IN ('subcontract','subcontract_warehouse') THEN s.pairs END), 0) AS subcontractPairs,
                COALESCE(SUM(CASE WHEN s.locationType = 'maintenance' THEN s.pairs END), 0) AS maintenancePairs,
                COALESCE(SUM(CASE WHEN s.locationType = 'scrap_lost' THEN s.pairs END), 0) AS scrapPairs,
                COALESCE(SUM(CASE WHEN s.workOrderId > 0 THEN s.pairs END), 0) AS allocatedPairs,
                COALESCE(SUM(s.looseLeft), 0) AS looseLeft,
                COALESCE(SUM(s.looseRight), 0) AS looseRight
           FROM molds m
           LEFT JOIN moldStock s ON s.moldId = m.id
          GROUP BY m.id, m.code, m.name, m.sizeRange, m.moldType, m.brand, m.isActive, m.productId, m.image
          ORDER BY m.name ASC`,
      );
      const perMold = rows.map((r) => {
        const totalPairs = Number(r.totalPairs) || 0;
        const maintenancePairs = Number(r.maintenancePairs) || 0;
        const scrapPairs = Number(r.scrapPairs) || 0;
        return {
          ...r,
          totalPairs,
          factoryPairs: Number(r.factoryPairs) || 0,
          subcontractPairs: Number(r.subcontractPairs) || 0,
          maintenancePairs,
          scrapPairs,
          allocatedPairs: Number(r.allocatedPairs) || 0,
          looseLeft: Number(r.looseLeft) || 0,
          looseRight: Number(r.looseRight) || 0,
          availablePairs: Number((totalPairs - maintenancePairs - scrapPairs).toFixed(4)),
          isActive: Boolean(r.isActive),
        };
      });
      const totals = perMold.reduce(
        (acc, m) => ({
          moldCount: acc.moldCount + 1,
          activeMoldCount: acc.activeMoldCount + (m.isActive ? 1 : 0),
          totalPairs: acc.totalPairs + m.totalPairs,
          factoryPairs: acc.factoryPairs + m.factoryPairs,
          subcontractPairs: acc.subcontractPairs + m.subcontractPairs,
          maintenancePairs: acc.maintenancePairs + m.maintenancePairs,
          scrapPairs: acc.scrapPairs + m.scrapPairs,
          allocatedPairs: acc.allocatedPairs + m.allocatedPairs,
          availablePairs: acc.availablePairs + m.availablePairs,
          looseLeft: acc.looseLeft + m.looseLeft,
          looseRight: acc.looseRight + m.looseRight,
        }),
        { moldCount: 0, activeMoldCount: 0, totalPairs: 0, factoryPairs: 0, subcontractPairs: 0, maintenancePairs: 0, scrapPairs: 0, allocatedPairs: 0, availablePairs: 0, looseLeft: 0, looseRight: 0 },
      );
      res.json({ data: { totals, perMold } });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Kalıp hareketi: bir çift kaynaktan hedefe atomik taşınır (initial_entry'de
   * kaynak yoktur). Kalıp satırı FOR UPDATE ile kilitlenir → aynı kalıba yönelik
   * eşzamanlı hareketler sıraya girer, fazla çıkış engellenir. Stok kovası ve
   * hareket kaydı TEK transaction'da yazılır.
   */
  router.post('/mold-move', async (req, res, next) => {
    try {
      const body = req.body || {};
      const moldId = Number(body.moldId);
      const type = String(body.type) as MoldMoveType;
      if (!Number.isFinite(moldId) || moldId <= 0) throw new OpError(400, 'Geçerli bir kalıp seçilmelidir.');
      if (!(MOLD_MOVE_TYPES as readonly string[]).includes(type)) {
        throw new OpError(400, `Geçersiz kalıp hareketi türü: ${type}.`, 'INVALID_MOLD_MOVE');
      }
      assertAnyPermission(req.auth, [['molds', 'edit']], 'Kalıp hareketi için "Kalıp Takibi" modülünde düzenleme yetkisi gerekir.');

      const items = parseMoldItems(body);
      const endpoints = resolveMoldMove(type, body);
      const moveDate = body.date ? new Date(body.date) : new Date();
      if (Number.isNaN(moveDate.getTime())) throw new OpError(400, 'Geçersiz hareket tarihi.');
      const workOrderId = Number(body.workOrderId) || 0;
      const description = String(body.description || '').trim();
      if (!description) throw new OpError(400, 'Hareket açıklaması zorunludur.', 'DESCRIPTION_REQUIRED');

      const result = await withOperation(req, async (conn) => {
        const mold = await lockMold(conn, moldId);

        if (endpoints.from) {
          for (const it of items) {
            const src = await lockMoldBucket(conn, moldId, it.size, endpoints.from);
            const have = Number(src?.pairs) || 0;
            if (have + 1e-9 < it.pairs) {
              throw new OpError(
                409,
                `Yetersiz kalıp: ${it.size} numarasında "${MOLD_LOCATION_LABELS[endpoints.from.locationType]}" konumunda ${have} çift var, ${it.pairs} çift istendi.`,
                'MOLD_INSUFFICIENT',
              );
            }
            const leftHave = Number(src?.looseLeft) || 0;
            const rightHave = Number(src?.looseRight) || 0;
            if (leftHave < it.looseLeft || rightHave < it.looseRight) {
              throw new OpError(409, `Yetersiz tek parça kalıp: ${it.size} numarasında sol/sağ miktarı yeterli değil.`, 'MOLD_INSUFFICIENT_LOOSE');
            }
            const newPairs = Number((have - it.pairs).toFixed(4));
            const newLeft = leftHave - it.looseLeft;
            const newRight = rightHave - it.looseRight;
            if (newPairs === 0 && newLeft === 0 && newRight === 0) {
              await conn.query('DELETE FROM `moldStock` WHERE `id` = ?', [src.id]);
            } else {
              await conn.query(
                'UPDATE `moldStock` SET `pairs` = ?, `looseLeft` = ?, `looseRight` = ?, `updatedAt` = NOW(), `version` = `version` + 1 WHERE `id` = ?',
                [newPairs, newLeft, newRight, src.id],
              );
            }
          }
        }

        for (const it of items) {
          await addMoldBucket(conn, moldId, it.size, endpoints.to, it.pairs, it.looseLeft, it.looseRight);
        }

        const movementNo = await allocateDocumentNumber(conn, { table: 'moldMovements', prefix: 'MV', pad: 5 });
        const [mvRes] = await conn.query(
          `INSERT INTO \`moldMovements\`
             (\`movementNo\`, \`type\`, \`date\`, \`moldId\`, \`fromLocationType\`, \`fromSubcontractId\`, \`fromWorkOrderId\`,
              \`toLocationType\`, \`toSubcontractId\`, \`toWorkOrderId\`, \`sendId\`, \`userId\`, \`deliveredBy\`, \`receivedBy\`,
              \`description\`, \`documentRef\`, \`createdAt\`, \`version\`)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)`,
          [
            movementNo, type, moveDate, moldId,
            endpoints.from?.locationType ?? null, endpoints.from?.subcontractId ?? 0,
            endpoints.to.locationType, endpoints.to.subcontractId, workOrderId,
            body.sendId ? Number(body.sendId) : null, req.auth?.user?.id ?? null,
            body.deliveredBy ? String(body.deliveredBy).trim() : null,
            body.receivedBy ? String(body.receivedBy).trim() : null,
            description, body.documentRef ? String(body.documentRef).trim() : null,
          ],
        );
        const movementId = (mvRes as any).insertId;
        for (const it of items) {
          await conn.query(
            'INSERT INTO `moldMovementItems` (`movementId`, `moldId`, `size`, `pairs`, `looseLeft`, `looseRight`, `version`) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [movementId, moldId, it.size, it.pairs, it.looseLeft, it.looseRight],
          );
        }

        const totalPairs = Number(items.reduce((s, i) => s + i.pairs, 0).toFixed(4));
        await writeAuditInTx(
          conn,
          {
            action: 'create',
            module: 'molds',
            description: `Kalıp hareketi: ${MOLD_MOVE_LABELS[type]} — ${mold.code} ${mold.name} (${totalPairs} çift)${endpoints.from ? ` ${MOLD_LOCATION_LABELS[endpoints.from.locationType]} →` : ''} ${MOLD_LOCATION_LABELS[endpoints.to.locationType]}`,
            entityId: movementId,
            recordSummary: `${movementNo} — ${MOLD_MOVE_LABELS[type]} (${totalPairs} çift)`,
          },
          { auth: req.auth, ip: clientIp(req) },
        );

        return { movementId, movementNo, moldId, type, totalPairs };
      });

      broadcast('molds', 'update', [String(moldId)]);
      broadcast('moldStock', 'update', []);
      broadcast('moldMovements', 'create', [String(result.movementId)]);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Fiziki sayım düzeltmesi: seçilen konumdaki kova SAYILAN mutlak değere
   * ayarlanır (fark hareket satırına delta olarak yazılır). Gerekçe zorunludur
   * ve onay yetkisi ister; böylece sayım farkları denetlenebilir biçimde düzeltilir.
   */
  router.post('/mold-count-adjust', async (req, res, next) => {
    try {
      const body = req.body || {};
      const moldId = Number(body.moldId);
      if (!Number.isFinite(moldId) || moldId <= 0) throw new OpError(400, 'Geçerli bir kalıp seçilmelidir.');
      assertAnyPermission(req.auth, [['molds', 'approve']], 'Sayım düzeltmesi için "Kalıp Takibi" modülünde onay yetkisi gerekir.');
      const locationType = String(body.locationType || 'factory_warehouse') as MoldLocationType;
      if (!(MOLD_LOCATION_TYPES as readonly string[]).includes(locationType)) throw new OpError(400, 'Geçersiz konum.', 'INVALID_LOCATION');
      const isSub = MOLD_SUBCONTRACT_LOCATIONS.includes(locationType);
      const subcontractId = isSub ? Number(body.subcontractId) || 0 : 0;
      if (isSub && !subcontractId) throw new OpError(400, 'Fason konumu için cari seçilmelidir.', 'SUBCONTRACT_REQUIRED');
      const reason = String(body.reason || '').trim();
      if (reason.length < 3) throw new OpError(400, 'Sayım düzeltmesi için gerekçe zorunludur (en az 3 karakter).', 'REASON_REQUIRED');
      const raw = Array.isArray(body.items) ? body.items : [];
      if (!raw.length) throw new OpError(400, 'Sayılan numara satırları gereklidir.', 'NO_ITEMS');
      const moveDate = body.date ? new Date(body.date) : new Date();
      if (Number.isNaN(moveDate.getTime())) throw new OpError(400, 'Geçersiz tarih.');

      const result = await withOperation(req, async (conn) => {
        const mold = await lockMold(conn, moldId);
        const diffs: { size: string; before: number; after: number; delta: number; looseLeft: number; looseRight: number }[] = [];
        for (const it of raw) {
          const size = String(it?.size ?? '').trim();
          if (!size) throw new OpError(400, 'Numara zorunludur.', 'INVALID_SIZE');
          const counted = Math.max(0, Number(it?.pairs) || 0);
          const looseLeft = Math.max(0, Math.floor(Number(it?.looseLeft) || 0));
          const looseRight = Math.max(0, Math.floor(Number(it?.looseRight) || 0));
          const bucket = await lockMoldBucket(conn, moldId, size, { locationType, subcontractId });
          const before = Number(bucket?.pairs) || 0;
          const delta = Number((counted - before).toFixed(4));
          const leftBefore = Number(bucket?.looseLeft) || 0;
          const rightBefore = Number(bucket?.looseRight) || 0;
          if (delta === 0 && looseLeft === leftBefore && looseRight === rightBefore) continue;
          if (counted === 0 && looseLeft === 0 && looseRight === 0 && bucket) {
            await conn.query('DELETE FROM `moldStock` WHERE `id` = ?', [bucket.id]);
          } else {
            await conn.query(
              `INSERT INTO \`moldStock\` (\`moldId\`, \`size\`, \`locationType\`, \`subcontractId\`, \`workOrderId\`, \`pairs\`, \`looseLeft\`, \`looseRight\`, \`updatedAt\`, \`version\`)
               VALUES (?, ?, ?, ?, 0, ?, ?, ?, NOW(), 1)
               ON DUPLICATE KEY UPDATE \`pairs\` = VALUES(\`pairs\`), \`looseLeft\` = VALUES(\`looseLeft\`), \`looseRight\` = VALUES(\`looseRight\`), \`updatedAt\` = NOW(), \`version\` = \`version\` + 1`,
              [moldId, size, locationType, subcontractId, counted, looseLeft, looseRight],
            );
          }
          diffs.push({ size, before, after: counted, delta, looseLeft, looseRight });
        }
        if (!diffs.length) throw new OpError(400, 'Sayım sonucu mevcut kayıtlarla aynı; düzeltilecek fark yok.', 'NO_DIFF');

        const movementNo = await allocateDocumentNumber(conn, { table: 'moldMovements', prefix: 'MV', pad: 5 });
        const [mvRes] = await conn.query(
          `INSERT INTO \`moldMovements\`
             (\`movementNo\`, \`type\`, \`date\`, \`moldId\`, \`fromLocationType\`, \`fromSubcontractId\`, \`fromWorkOrderId\`,
              \`toLocationType\`, \`toSubcontractId\`, \`toWorkOrderId\`, \`userId\`, \`description\`, \`createdAt\`, \`version\`)
           VALUES (?, 'count_adjust', ?, ?, ?, ?, 0, ?, ?, 0, ?, ?, NOW(), 1)`,
          [movementNo, moveDate, moldId, locationType, subcontractId, locationType, subcontractId, req.auth?.user?.id ?? null, `Sayım düzeltmesi: ${reason}`],
        );
        const movementId = (mvRes as any).insertId;
        for (const d of diffs) {
          await conn.query(
            'INSERT INTO `moldMovementItems` (`movementId`, `moldId`, `size`, `pairs`, `looseLeft`, `looseRight`, `version`) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [movementId, moldId, d.size, d.delta, d.looseLeft, d.looseRight],
          );
        }
        await writeAuditInTx(
          conn,
          {
            action: 'update',
            module: 'molds',
            description: `Kalıp sayım düzeltmesi: ${mold.code} ${mold.name} — ${diffs.map((d) => `${d.size}: ${d.before}→${d.after}`).join(', ')}`,
            entityId: movementId,
            reason,
            recordSummary: `${movementNo} — sayım düzeltmesi (${diffs.length} numara)`,
          },
          { auth: req.auth, ip: clientIp(req) },
        );
        return { movementId, movementNo, moldId, diffs };
      });

      broadcast('molds', 'update', [String(moldId)]);
      broadcast('moldStock', 'update', []);
      broadcast('moldMovements', 'create', [String(result.movementId)]);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /**
   * İş emrine tahsis: fabrika deposundaki serbest çiftler 'allocated' konumuna
   * (workOrderId = iş emri) taşınır. Böylece allocatedPairs iş emri bazında izlenir
   * ve serbest havuzdan düşer. Kalıp satırı FOR UPDATE ile kilitlenir.
   */
  router.post('/mold-allocate', async (req, res, next) => {
    try {
      const body = req.body || {};
      const moldId = Number(body.moldId);
      const workOrderId = Number(body.workOrderId);
      if (!Number.isFinite(moldId) || moldId <= 0) throw new OpError(400, 'Geçerli bir kalıp seçilmelidir.');
      if (!Number.isFinite(workOrderId) || workOrderId <= 0) throw new OpError(400, 'Geçerli bir iş emri seçilmelidir.', 'WORKORDER_REQUIRED');
      assertAnyPermission(req.auth, [['molds', 'edit']], 'Kalıp tahsisi için "Kalıp Takibi" modülünde düzenleme yetkisi gerekir.');

      const items = parseMoldItems(body);
      const moveDate = body.date ? new Date(body.date) : new Date();
      if (Number.isNaN(moveDate.getTime())) throw new OpError(400, 'Geçersiz hareket tarihi.');
      const description = String(body.description || '').trim();

      const result = await withOperation(req, async (conn) => {
        const mold = await lockMold(conn, moldId);
        const [woRows] = await conn.query<any[]>('SELECT `id` FROM `workOrders` WHERE `id` = ? LIMIT 1', [workOrderId]);
        if (!(woRows as any[]).length) throw new OpError(404, 'İş emri bulunamadı.', 'WORKORDER_NOT_FOUND');

        const fromLoc = { locationType: 'factory_warehouse' as const, subcontractId: 0 };
        for (const it of items) {
          const src = await lockMoldBucket(conn, moldId, it.size, fromLoc, 0);
          const have = Number(src?.pairs) || 0;
          if (have + 1e-9 < it.pairs) {
            throw new OpError(
              409,
              `Yetersiz kalıp: ${it.size} numarasında fabrika deposunda ${have} çift var, ${it.pairs} çift istendi.`,
              'MOLD_INSUFFICIENT',
            );
          }
          const leftHave = Number(src?.looseLeft) || 0;
          const rightHave = Number(src?.looseRight) || 0;
          if (leftHave < it.looseLeft || rightHave < it.looseRight) {
            throw new OpError(409, `Yetersiz tek parça kalıp: ${it.size} numarasında sol/sağ miktarı yeterli değil.`, 'MOLD_INSUFFICIENT_LOOSE');
          }
          const newPairs = Number((have - it.pairs).toFixed(4));
          const newLeft = leftHave - it.looseLeft;
          const newRight = rightHave - it.looseRight;
          if (newPairs === 0 && newLeft === 0 && newRight === 0) {
            await conn.query('DELETE FROM `moldStock` WHERE `id` = ?', [src.id]);
          } else {
            await conn.query(
              'UPDATE `moldStock` SET `pairs` = ?, `looseLeft` = ?, `looseRight` = ?, `updatedAt` = NOW(), `version` = `version` + 1 WHERE `id` = ?',
              [newPairs, newLeft, newRight, src.id],
            );
          }
          await addMoldBucket(conn, moldId, it.size, { locationType: 'allocated', subcontractId: 0 }, it.pairs, it.looseLeft, it.looseRight, workOrderId);
        }

        const movementNo = await allocateDocumentNumber(conn, { table: 'moldMovements', prefix: 'MV', pad: 5 });
        const [mvRes] = await conn.query(
          `INSERT INTO \`moldMovements\`
             (\`movementNo\`, \`type\`, \`date\`, \`moldId\`, \`fromLocationType\`, \`fromSubcontractId\`, \`fromWorkOrderId\`,
              \`toLocationType\`, \`toSubcontractId\`, \`toWorkOrderId\`, \`userId\`, \`description\`, \`createdAt\`, \`version\`)
           VALUES (?, 'allocate', ?, ?, 'factory_warehouse', 0, 0, 'allocated', 0, ?, ?, ?, NOW(), 1)`,
          [movementNo, moveDate, moldId, workOrderId, req.auth?.user?.id ?? null, description || `İş emri #${workOrderId} için tahsis`],
        );
        const movementId = (mvRes as any).insertId;
        for (const it of items) {
          await conn.query(
            'INSERT INTO `moldMovementItems` (`movementId`, `moldId`, `size`, `pairs`, `looseLeft`, `looseRight`, `version`) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [movementId, moldId, it.size, it.pairs, it.looseLeft, it.looseRight],
          );
        }

        const totalPairs = Number(items.reduce((s, i) => s + i.pairs, 0).toFixed(4));
        await writeAuditInTx(
          conn,
          {
            action: 'create',
            module: 'molds',
            description: `Kalıp tahsisi: ${mold.code} ${mold.name} — ${totalPairs} çift → İş Emri #${workOrderId}`,
            entityId: movementId,
            recordSummary: `${movementNo} — iş emrine tahsis (${totalPairs} çift)`,
          },
          { auth: req.auth, ip: clientIp(req) },
        );

        return { movementId, movementNo, moldId, workOrderId, type: 'allocate' as const, totalPairs };
      });

      broadcast('molds', 'update', [String(moldId)]);
      broadcast('moldStock', 'update', []);
      broadcast('moldMovements', 'create', [String(result.movementId)]);
      broadcast('workOrders', 'update', [String(workOrderId)]);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Tahsis iptali: 'allocated' konumundaki (workOrderId = iş emri) çiftler fabrika
   * deposuna geri taşınır. Kalıp satırı FOR UPDATE ile kilitlenir.
   */
  router.post('/mold-deallocate', async (req, res, next) => {
    try {
      const body = req.body || {};
      const moldId = Number(body.moldId);
      const workOrderId = Number(body.workOrderId);
      if (!Number.isFinite(moldId) || moldId <= 0) throw new OpError(400, 'Geçerli bir kalıp seçilmelidir.');
      if (!Number.isFinite(workOrderId) || workOrderId <= 0) throw new OpError(400, 'Geçerli bir iş emri seçilmelidir.', 'WORKORDER_REQUIRED');
      assertAnyPermission(req.auth, [['molds', 'edit']], 'Tahsis iptali için "Kalıp Takibi" modülünde düzenleme yetkisi gerekir.');

      const items = parseMoldItems(body);
      const moveDate = body.date ? new Date(body.date) : new Date();
      if (Number.isNaN(moveDate.getTime())) throw new OpError(400, 'Geçersiz hareket tarihi.');
      const description = String(body.description || '').trim();

      const result = await withOperation(req, async (conn) => {
        const mold = await lockMold(conn, moldId);
        const allocLoc = { locationType: 'allocated' as const, subcontractId: 0 };
        for (const it of items) {
          const src = await lockMoldBucket(conn, moldId, it.size, allocLoc, workOrderId);
          const have = Number(src?.pairs) || 0;
          if (have + 1e-9 < it.pairs) {
            throw new OpError(
              409,
              `Yetersiz tahsisli kalıp: ${it.size} numarasında iş emri #${workOrderId} için ${have} çift tahsisli, ${it.pairs} çift istendi.`,
              'MOLD_INSUFFICIENT',
            );
          }
          const leftHave = Number(src?.looseLeft) || 0;
          const rightHave = Number(src?.looseRight) || 0;
          if (leftHave < it.looseLeft || rightHave < it.looseRight) {
            throw new OpError(409, `Yetersiz tek parça kalıp: ${it.size} numarasında sol/sağ miktarı yeterli değil.`, 'MOLD_INSUFFICIENT_LOOSE');
          }
          const newPairs = Number((have - it.pairs).toFixed(4));
          const newLeft = leftHave - it.looseLeft;
          const newRight = rightHave - it.looseRight;
          if (newPairs === 0 && newLeft === 0 && newRight === 0) {
            await conn.query('DELETE FROM `moldStock` WHERE `id` = ?', [src.id]);
          } else {
            await conn.query(
              'UPDATE `moldStock` SET `pairs` = ?, `looseLeft` = ?, `looseRight` = ?, `updatedAt` = NOW(), `version` = `version` + 1 WHERE `id` = ?',
              [newPairs, newLeft, newRight, src.id],
            );
          }
          await addMoldBucket(conn, moldId, it.size, { locationType: 'factory_warehouse', subcontractId: 0 }, it.pairs, it.looseLeft, it.looseRight, 0);
        }

        const movementNo = await allocateDocumentNumber(conn, { table: 'moldMovements', prefix: 'MV', pad: 5 });
        const [mvRes] = await conn.query(
          `INSERT INTO \`moldMovements\`
             (\`movementNo\`, \`type\`, \`date\`, \`moldId\`, \`fromLocationType\`, \`fromSubcontractId\`, \`fromWorkOrderId\`,
              \`toLocationType\`, \`toSubcontractId\`, \`toWorkOrderId\`, \`userId\`, \`description\`, \`createdAt\`, \`version\`)
           VALUES (?, 'deallocate', ?, ?, 'allocated', 0, ?, 'factory_warehouse', 0, 0, ?, ?, NOW(), 1)`,
          [movementNo, moveDate, moldId, workOrderId, req.auth?.user?.id ?? null, description || `İş emri #${workOrderId} tahsis iptali`],
        );
        const movementId = (mvRes as any).insertId;
        for (const it of items) {
          await conn.query(
            'INSERT INTO `moldMovementItems` (`movementId`, `moldId`, `size`, `pairs`, `looseLeft`, `looseRight`, `version`) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [movementId, moldId, it.size, it.pairs, it.looseLeft, it.looseRight],
          );
        }

        const totalPairs = Number(items.reduce((s, i) => s + i.pairs, 0).toFixed(4));
        await writeAuditInTx(
          conn,
          {
            action: 'update',
            module: 'molds',
            description: `Kalıp tahsis iptali: ${mold.code} ${mold.name} — ${totalPairs} çift ← İş Emri #${workOrderId}`,
            entityId: movementId,
            recordSummary: `${movementNo} — tahsis iptali (${totalPairs} çift)`,
          },
          { auth: req.auth, ip: clientIp(req) },
        );

        return { movementId, movementNo, moldId, workOrderId, type: 'deallocate' as const, totalPairs };
      });

      broadcast('molds', 'update', [String(moldId)]);
      broadcast('moldStock', 'update', []);
      broadcast('moldMovements', 'create', [String(result.movementId)]);
      broadcast('workOrders', 'update', [String(workOrderId)]);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  registerDocumentOps(router, applySignedStockTx);
  return { router, deleteEffects };
}
