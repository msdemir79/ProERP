import { api } from '../api/client';
import type { AssortmentTemplate, ColorMaster, Product, StockCategoryType } from '../types';

/**
 * Excel'den (.xlsx) toplu stok kartı içe aktarma servisi.
 *
 * Tek doğruluk kaynağı `IMPORT_COLUMNS`: hem indirilen şablonun başlıkları hem de
 * yüklenen dosyanın okunması bu tanımdan türer. ExcelJS yalnızca gerektiğinde
 * (dinamik import) yüklenir, böylece başlangıç paketi şişmez.
 *
 * Davranış: SADECE YENİ KART. Aynı kod (mevcut ürün veya dosya içi tekrar) hata
 * verir; güncelleme yapılmaz. Renkler merkezi kartlarla eşleştirilir (colorIds);
 * eşleşmeyen adlar atlanır ve uyarı olarak raporlanır.
 */

export interface ImportColumn {
  /** Product payload alanı. */
  key: string;
  /** Sac başlığı (Türkçe). */
  header: string;
  type: 'text' | 'number' | 'bool' | 'category';
  width: number;
  required?: boolean;
  help?: string;
}

export const IMPORT_COLUMNS: ImportColumn[] = [
  { key: 'code', header: 'Kod', type: 'text', width: 14, help: 'Boş bırakılırsa kategori önekiyle otomatik üretilir (ör. MAM-0001). Aynı kod ikinci kez kullanılamaz.' },
  { key: 'name', header: 'Ürün Adı', type: 'text', width: 30, required: true, help: 'Zorunlu.' },
  { key: 'categoryType', header: 'Kategori', type: 'category', width: 14, required: true, help: 'Zorunlu. Mamul / Yarı Mamul / Hammadde / Aksesuar.' },
  { key: 'subType', header: 'Alt Tip', type: 'text', width: 16, help: 'Örn: Spor, Taban, Vidala Deri, Toka.' },
  { key: 'brand', header: 'Marka', type: 'text', width: 14 },
  { key: 'unit', header: 'Birim', type: 'text', width: 10, help: 'Boşsa kategori varsayılanı (Çift / Adet / dm²).' },
  { key: 'secondaryUnit', header: 'İkinci Birim', type: 'text', width: 12, help: 'Örn: Koli. Boşsa birincil birim kullanılır.' },
  { key: 'multiplier', header: 'Çarpan', type: 'number', width: 9, help: 'İkinci birimde kaç adet var (koli oranı). Varsayılan 1.' },
  { key: 'stock', header: 'Açılış Stok', type: 'number', width: 11, help: 'Yalnızca yeni kartta açılış değeri olarak yazılır.' },
  { key: 'minStock', header: 'Min. Stok', type: 'number', width: 10 },
  { key: 'buyingPrice', header: 'Alış Fiyatı', type: 'number', width: 12 },
  { key: 'sellingPrice', header: 'Satış Fiyatı', type: 'number', width: 13 },
  { key: 'vatRate', header: 'KDV %', type: 'number', width: 8, help: 'Boşsa 20.' },
  { key: 'hasSizeVariants', header: 'Bedenli mi (E/H)', type: 'bool', width: 15, help: 'E/H. Bedenli ürünlerde asorti şablonu matrisi belirler.' },
  { key: 'colors', header: 'Renkler', type: 'text', width: 22, help: 'Virgülle ayırın. Yalnızca MEVCUT aktif renk kartlarıyla eşleşenler bağlanır.' },
  { key: 'assortmentTemplate', header: 'Asorti Şablonu', type: 'text', width: 18, help: 'Şablon adı. Bedenli ürünlerde numara/koli oranlarını belirler.' },
  { key: 'barcode', header: 'Barkod', type: 'text', width: 18, help: 'Boş bırakın; "Toplu Barkod" sekmesinden otomatik atanır.' },
  { key: 'shelf', header: 'Raf', type: 'text', width: 10 },
  { key: 'location', header: 'Konum', type: 'text', width: 14 },
  { key: 'accountingCode', header: 'Stok Hesabı', type: 'text', width: 13, help: 'TDHP, örn: 157.01.' },
  { key: 'salesAccountCode', header: 'Satış Hesabı', type: 'text', width: 13, help: 'TDHP, örn: 600.01.' },
  { key: 'purchaseAccountCode', header: 'Alış Hesabı', type: 'text', width: 13, help: 'TDHP, örn: 620.01.' },
  { key: 'preferredSupplierName', header: 'Tedarikçi', type: 'text', width: 20 },
  { key: 'notes', header: 'Not', type: 'text', width: 24 },
];

const SHEET_NAME = 'Stok';

const CATEGORY_LABELS: { type: StockCategoryType; label: string; defaultUnit: string }[] = [
  { type: 'finished', label: 'Mamul', defaultUnit: 'Çift' },
  { type: 'semi_finished', label: 'Yarı Mamul', defaultUnit: 'Çift' },
  { type: 'raw_material', label: 'Hammadde', defaultUnit: 'dm²' },
  { type: 'accessory', label: 'Aksesuar', defaultUnit: 'Adet' },
];

const CATEGORY_MAP: Record<string, StockCategoryType> = {
  'mamul': 'finished', 'bitmiş': 'finished', 'bitmis': 'finished', 'finished': 'finished',
  'yarı mamul': 'semi_finished', 'yari mamul': 'semi_finished', 'yarımamul': 'semi_finished', 'semi_finished': 'semi_finished',
  'hammadde': 'raw_material', 'raw_material': 'raw_material',
  'aksesuar': 'accessory', 'sarf': 'accessory', 'accessory': 'accessory',
};

const CODE_PREFIX: Record<StockCategoryType, string> = { finished: 'MAM', semi_finished: 'YRM', raw_material: 'HMD', accessory: 'AKS' };

const EXAMPLE_ROWS: Record<string, string | number>[] = [
  {
    code: 'MAM-0001', name: 'Spor Ayakkabı Model X', categoryType: 'Mamul', subType: 'Spor', brand: 'ProShoe',
    unit: 'Çift', secondaryUnit: 'Koli', multiplier: 12, stock: 120, minStock: 24, buyingPrice: 350, sellingPrice: 799,
    vatRate: 20, hasSizeVariants: 'E', colors: 'Siyah, Beyaz', assortmentTemplate: 'Erkek 40-45', barcode: '',
    shelf: 'A-01', location: 'Depo 1', accountingCode: '157.01', salesAccountCode: '600.01', purchaseAccountCode: '620.01',
    preferredSupplierName: 'ABC Deri', notes: 'Örnek satır — silip kendi verinizi girin.',
  },
  {
    code: 'AKS-0001', name: 'Metal Toka 2cm', categoryType: 'Aksesuar', subType: 'Toka', brand: '',
    unit: 'Adet', secondaryUnit: 'Paket', multiplier: 100, stock: 5000, minStock: 500, buyingPrice: 1.5, sellingPrice: 4,
    vatRate: 20, hasSizeVariants: 'H', colors: '', assortmentTemplate: '', barcode: '',
    shelf: 'C-12', location: 'Depo 2', accountingCode: '150.01', salesAccountCode: '600.01', purchaseAccountCode: '150.01',
    preferredSupplierName: '', notes: '',
  },
];

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

const norm = (s: unknown): string => String(s ?? '').trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
/** Türkçe katlamayla renk adı eşleştirme: 'SİYAH' ile 'SIYAH' aynı kabul edilir. */
const foldColor = (s: unknown): string => String(s ?? '').trim().toLocaleUpperCase('tr').replace(/İ/g, 'I');

function colLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function categoryLabelToType(label: string): StockCategoryType | null {
  return CATEGORY_MAP[norm(label)] ?? null;
}

function cellToString(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'E' : 'H';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t: any) => t.text).join('');
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.error != null) return String(v.error);
  }
  return String(v);
}

function toNumber(v: string | undefined, fallback = 0): number {
  const s = String(v ?? '').trim();
  if (!s) return fallback;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function toBool(v: string | undefined): boolean {
  const s = norm(v);
  return ['e', 'evet', 'true', '1', 'var', 'bedenli'].includes(s);
}

async function loadExcelJs(): Promise<any> {
  const mod: any = await import('exceljs');
  return mod?.default?.Workbook ? mod.default : mod;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

/* ------------------------------------------------------------------ */
/* Şablon üretimi                                                      */
/* ------------------------------------------------------------------ */

export interface TemplateContext {
  colors?: ColorMaster[];
  templates?: AssortmentTemplate[];
}

function styleHeaderRow(ws: any): void {
  const row = ws.getRow(1);
  row.height = 26;
  row.eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF312E81' } } };
  });
}

function addColumnsSheet(ws: any): void {
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  styleHeaderRow(ws);
}

/** İndirilebilir .xlsx şablonu üretir: Stok (boş) + Örnek + Açıklama + Renkler + Şablonlar. */
export async function downloadTemplate(ctx: TemplateContext = {}): Promise<void> {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DMR Nexus';
  wb.created = new Date();

  // 1) Veri girişi yapılacak boş sayfa.
  const ws = wb.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
  addColumnsSheet(ws);
  const catIdx = IMPORT_COLUMNS.findIndex((c) => c.key === 'categoryType') + 1;
  const catCol = colLetter(catIdx);
  const catList = CATEGORY_LABELS.map((c) => c.label).join(',');
  for (let r = 2; r <= 2000; r++) {
    ws.dataValidations.add(`${catCol}${r}`, {
      type: 'list', allowBlank: false, formulae: [`"${catList}"`],
      showErrorMessage: true, errorTitle: 'Geçersiz kategori', error: `${catList} değerlerinden birini seçin.`,
    });
  }

  // 2) Örnek sayfa (ithal EDİLMEZ; yalnızca referans).
  const ex = wb.addWorksheet('Örnek');
  addColumnsSheet(ex);
  EXAMPLE_ROWS.forEach((r) => ex.addRow(r));

  // 3) Açıklama sayfası.
  const info = wb.addWorksheet('Açıklama');
  info.columns = [
    { header: 'Alan', key: 'header', width: 20 },
    { header: 'Zorunlu', key: 'required', width: 10 },
    { header: 'Açıklama', key: 'help', width: 90 },
  ];
  styleHeaderRow(info);
  IMPORT_COLUMNS.forEach((c) => info.addRow({ header: c.header, required: c.required ? 'Evet' : 'Hayır', help: c.help || '' }));
  info.addRow({});
  info.addRow({ header: 'GENEL KURALLAR', required: '', help: '' });
  [
    'Bu dosya SADECE YENİ stok kartı ekler; mevcut kartları güncellemez.',
    'Kod boş bırakılırsa kategori önekiyle otomatik üretilir (MAM/YRM/HMD/AKS + sıra).',
    'Aynı kod (mevcut bir ürünle veya dosyadaki başka satırla) çakışırsa satır hata alır.',
    'Renkler virgülle ayrılır ve yalnızca MEVCUT AKTİF renk kartlarıyla eşleşir; eşleşmeyenler atlanır.',
    'Asorti şablonu adla eşleşir; şablonu "Stok Yönetimi → Asorti Şablonları"ndan önceden tanımlayın.',
    'Barkod kolonunu boş bırakın; içe aktardıktan sonra "Toplu Barkod" sekmesinden otomatik barkod atayın.',
    'Sayısal alanlarda ondalık için virgül veya nokta kullanabilirsiniz (ör. 1,5 veya 1.5).',
    'Verileri "Stok" sayfasına girin; "Örnek" sayfası yalnızca referanstır, içe aktarılmaz.',
  ].forEach((t) => info.addRow({ header: '', required: '', help: t }));

  // 4) Renk referansı (kopyalanabilir adlar).
  const colorSheet = wb.addWorksheet('Renkler');
  colorSheet.columns = [{ header: 'Renk Adı', key: 'name', width: 26 }, { header: 'Kod', key: 'code', width: 14 }, { header: 'Grup', key: 'groupName', width: 20 }];
  styleHeaderRow(colorSheet);
  (ctx.colors || []).filter((c) => c.isActive !== false).forEach((c) => colorSheet.addRow({ name: c.name, code: c.code || '', groupName: c.groupName || '' }));

  // 5) Asorti şablon referansı.
  const tmplSheet = wb.addWorksheet('Asorti Şablonları');
  tmplSheet.columns = [{ header: 'Şablon Adı', key: 'name', width: 28 }, { header: 'Numaralar (adet)', key: 'items', width: 50 }];
  styleHeaderRow(tmplSheet);
  (ctx.templates || []).forEach((t) => tmplSheet.addRow({ name: t.name, items: (t.items || []).map((i) => `${i.size}(${i.quantity})`).join(' ') }));

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'DMR Nexus_Stok_Aktarim_Sablonu.xlsx');
}

/* ------------------------------------------------------------------ */
/* Dosya okuma + doğrulama                                             */
/* ------------------------------------------------------------------ */

export interface RawImportRow {
  rowNumber: number;
  values: Record<string, string>;
}

/** Yüklenen .xlsx dosyasını ham satırlara (kolon anahtarı → metin) çevirir. */
export async function parseImportFile(file: File): Promise<RawImportRow[]> {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  // `read()` akış (async iterable) bekler; ArrayBuffer için `load()` kullanılmalı.
  await wb.xlsx.load(buf as any);

  const ws =
    wb.worksheets.find((s: any) => norm(s.name) === norm(SHEET_NAME)) ||
    wb.worksheets.find((s: any) => !['örnek', 'aciklama', 'açıklama', 'renkler', 'asorti şablonları', 'asorti sablonlari'].includes(norm(s.name))) ||
    wb.worksheets[0];
  if (!ws) throw new Error('Çalışma sayfası bulunamadı.');

  // Başlık satırını kolon anahtarlarına eşle (bilinmeyen başlıklar yok sayılır).
  const headerByNorm = new Map<string, string>();
  IMPORT_COLUMNS.forEach((c) => headerByNorm.set(norm(c.header), c.key));
  const keyByIndex: Record<number, string> = {};
  const headerRow = ws.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell: any, colNumber: number) => {
    const key = headerByNorm.get(norm(cellToString(cell.value)));
    if (key) keyByIndex[colNumber] = key;
  });
  if (!Object.keys(keyByIndex).length) throw new Error('Başlık satırı tanınmadı. Şablonu bu ekrandan indirip doldurun.');

  const out: RawImportRow[] = [];
  const last = ws.rowCount;
  for (let r = 2; r <= last; r++) {
    const row = ws.getRow(r);
    const values: Record<string, string> = {};
    let hasAny = false;
    for (const idxStr of Object.keys(keyByIndex)) {
      const idx = Number(idxStr);
      const text = cellToString(row.getCell(idx).value).trim();
      if (text) hasAny = true;
      values[keyByIndex[idx]] = text;
    }
    if (hasAny) out.push({ rowNumber: r, values });
  }
  return out;
}

export interface ImportRowResult {
  rowNumber: number;
  code: string;
  name: string;
  categoryLabel: string;
  status: 'ok' | 'error';
  errors: string[];
  warnings: string[];
  payload: Partial<Product>;
}

export interface ValidateContext {
  /** Mevcut ürün kodları (büyük harfe çevrilmiş). */
  existingCodes: Set<string>;
  colors: ColorMaster[];
  templates: AssortmentTemplate[];
}

/** Ham satırları product payload'ına çevirir ve satır bazında doğrular. */
export function mapAndValidate(rows: RawImportRow[], ctx: ValidateContext): ImportRowResult[] {
  const usedCodes = new Set<string>(ctx.existingCodes);
  const autoSeq: Record<string, number> = {};

  const colorByFold = new Map<string, ColorMaster>();
  ctx.colors.forEach((c) => { const k = foldColor(c.name); if (!colorByFold.has(k)) colorByFold.set(k, c); });

  const templateByNorm = new Map<string, AssortmentTemplate>();
  ctx.templates.forEach((t) => { const k = norm(t.name); if (!templateByNorm.has(k)) templateByNorm.set(k, t); });

  const nextAutoCode = (type: StockCategoryType): string => {
    const prefix = CODE_PREFIX[type] || 'STK';
    let seq = autoSeq[prefix] || 1;
    let code = `${prefix}-${String(seq).padStart(4, '0')}`;
    while (usedCodes.has(code)) { seq++; code = `${prefix}-${String(seq).padStart(4, '0')}`; }
    autoSeq[prefix] = seq + 1;
    return code;
  };

  return rows.map(({ rowNumber, values }) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = String(values.name || '').trim();
    const catType = categoryLabelToType(values.categoryType);
    const hasSizeVariants = toBool(values.hasSizeVariants);

    // Kod: manuel veya otomatik; tekrar kontrolü.
    let code = String(values.code || '').trim().toLocaleUpperCase('tr');
    if (code) {
      if (usedCodes.has(code)) errors.push(`"${code}" kodu zaten mevcut (sadece yeni kart eklenebilir).`);
    } else if (catType) {
      code = nextAutoCode(catType);
    }

    if (!name) errors.push('Ürün adı zorunlu.');
    if (!catType) errors.push(`Geçersiz kategori: "${values.categoryType || ''}" (Mamul / Yarı Mamul / Hammadde / Aksesuar).`);

    // Renkler → colorIds (yalnızca aktif kartlar).
    const colorIds: number[] = [];
    const rawColors = String(values.colors || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    for (const cn of rawColors) {
      const match = colorByFold.get(foldColor(cn));
      if (!match) { warnings.push(`Eşleşmeyen renk: "${cn}" (atlandı).`); continue; }
      if (match.isActive === false) { warnings.push(`Pasif renk: "${cn}" (atlandı).`); continue; }
      if (match.id != null && !colorIds.includes(Number(match.id))) colorIds.push(Number(match.id));
    }

    // Asorti şablonu (adla).
    let assortmentTemplateId: number | undefined;
    let assortment: { size: string; quantity: number }[] | undefined;
    const tmplName = String(values.assortmentTemplate || '').trim();
    if (tmplName) {
      const tmpl = templateByNorm.get(norm(tmplName));
      if (!tmpl) warnings.push(`Asorti şablonu bulunamadı: "${tmplName}".`);
      else {
        assortmentTemplateId = tmpl.id != null ? Number(tmpl.id) : undefined;
        assortment = tmpl.items;
      }
    } else if (hasSizeVariants) {
      warnings.push('Bedenli ürün için asorti şablonu seçilmedi; varyant barkodu üretilemez.');
    }

    if (code) usedCodes.add(code);

    const unit = String(values.unit || '').trim() || (catType ? (CATEGORY_LABELS.find((c) => c.type === catType)?.defaultUnit || 'Adet') : 'Adet');
    const secondaryUnit = String(values.secondaryUnit || '').trim() || unit;

    const payload: Partial<Product> = {
      code,
      name,
      categoryType: catType || undefined,
      hasSizeVariants,
      subType: String(values.subType || '').trim() || undefined,
      category: String(values.subType || '').trim() || undefined,
      brand: String(values.brand || '').trim() || undefined,
      unit,
      secondaryUnit,
      multiplier: toNumber(values.multiplier, 1) || 1,
      stock: toNumber(values.stock, 0),
      minStock: toNumber(values.minStock, 0),
      buyingPrice: toNumber(values.buyingPrice, 0),
      sellingPrice: toNumber(values.sellingPrice, 0),
      isRawMaterial: catType === 'raw_material' || catType === 'accessory',
      isFootwear: catType === 'finished' || (catType === 'semi_finished' && hasSizeVariants),
      vatRate: values.vatRate ? toNumber(values.vatRate, 20) : 20,
      shelf: String(values.shelf || '').trim() || undefined,
      location: String(values.location || '').trim() || undefined,
      barcode: String(values.barcode || '').trim() || undefined,
      accountingCode: String(values.accountingCode || '').trim() || undefined,
      salesAccountCode: String(values.salesAccountCode || '').trim() || undefined,
      purchaseAccountCode: String(values.purchaseAccountCode || '').trim() || undefined,
      preferredSupplierName: String(values.preferredSupplierName || '').trim() || undefined,
      notes: String(values.notes || '').trim() || undefined,
      colorIds: colorIds.length ? colorIds : undefined,
      assortmentTemplateId: hasSizeVariants ? assortmentTemplateId : undefined,
      assortment: hasSizeVariants ? assortment : undefined,
    };

    return {
      rowNumber,
      code,
      name,
      categoryLabel: catType ? (CATEGORY_LABELS.find((c) => c.type === catType)?.label || '') : String(values.categoryType || ''),
      status: errors.length ? 'error' : 'ok',
      errors,
      warnings,
      payload,
    };
  });
}

/** Yalnızca hatasız satırları toplu olarak ekler; oluşturulan id'leri döner. */
export async function importProducts(rows: ImportRowResult[]): Promise<number[]> {
  const payloads = rows.filter((r) => r.status === 'ok').map((r) => r.payload);
  if (!payloads.length) return [];
  return api.products.createMany(payloads);
}
