import { withOperation } from './idempotency.js';
import type { Router, Request } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import { withTransaction } from './db.js';
import { getDef } from './registry.js';
import { can, clientIp } from './auth.js';
import { HttpError } from './errors.js';
import { assertOpenPeriod } from './periods.js';
import { allocateDocumentNumber } from './numbering.js';
import { broadcast } from './sse.js';
import { writeAuditInTx } from './audit.js';
import { distributeAssortment, PRODUCTION_STAGE_ORDER, selectProductionRecipe } from '../src/lib/productionRules.js';
import { quantityDecimals, requiredIngredientQuantity } from '../src/lib/inventoryCalculator.js';
import type { AppModule, PermissionAction } from '../src/types.js';
import { assertUnreservedStock, consumeReservation } from './reservations.js';
import { calculateEmployeePayroll } from '../src/lib/employeePayroll.js';
import { HR_DEFAULT_PARAMS } from '../src/lib/hrDefaults.js';
import { HR_CONSTANTS_2026 } from '../src/lib/payrollCalculator.js';
import { registerAccountingPeriods } from './accountingPeriods.js';
import { registerStockCounts } from './stockCounts.js';
import type { Employee, AttendanceRecord, AdvanceRequest } from '../src/types.js';

type Row = Record<string, any>;
type StockWriter = (conn: PoolConnection, input: { productId: number; signedQuantity: number; color?: string | null; size?: string | null; type: 'in' | 'out' | 'production_in' | 'production_out'; description: string; date?: Date | null; writeLog: boolean; withVersion: boolean }) => Promise<void>;
const json = (value: any): any[] => Array.isArray(value) ? value : typeof value === 'string' ? JSON.parse(value) : [];
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const dateOf = (value: any) => { const date = value ? new Date(value) : new Date(); if (!Number.isFinite(date.getTime())) throw new HttpError(400, 'Geçersiz belge tarihi.'); return date; };
function permission(req: Request, module: AppModule, action: PermissionAction) {
  if (!can(req.auth?.role || null, module, action)) throw new HttpError(403, 'Bu işlem için yetkiniz yok.', 'FORBIDDEN');
}
async function rows(conn: PoolConnection, sql: string, params: any[] = []): Promise<Row[]> { const [result] = await conn.query<any[]>(sql, params); return result; }
async function one(conn: PoolConnection, table: string, id: any): Promise<Row> {
  const row = (await rows(conn, `SELECT * FROM \`${table}\` WHERE \`id\` = ? FOR UPDATE`, [id]))[0];
  if (!row) throw new HttpError(404, `${table} kaydı bulunamadı.`, 'NOT_FOUND');
  return row;
}
async function insert(conn: PoolConnection, table: string, data: Row): Promise<number> {
  const def = getDef(table)!;
  const columns = def.columns.map(column => column.name).filter(key => key in data && key !== 'id' && key !== 'version');
  const values = columns.map(key => def.jsonColumns.includes(key) && data[key] != null ? JSON.stringify(data[key]) : data[key] ?? null);
  const [result] = await conn.query(`INSERT INTO \`${table}\` (${columns.map(key => `\`${key}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, values);
  return Number((result as any).insertId);
}
async function settings(conn: PoolConnection): Promise<Row> {
  const row = (await rows(conn, "SELECT * FROM `settings` WHERE `id` = 'global_settings'"))[0] || {};
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'string' && ['stock', 'order', 'production', 'finance', 'hr'].includes(key) ? JSON.parse(value) : value]));
}
async function documentNumber(conn: PoolConnection, table: string, prefix: string, date: Date): Promise<string> {
  return allocateDocumentNumber(conn, { table, prefix: prefix.replace(/-\d{4}-?$/, '').replace(/-$/, ''), year: date.getFullYear(), pad: 6 });
}
async function audit(conn: PoolConnection, req: Request, module: AppModule, id: number, description: string) {
  await writeAuditInTx(conn, { action: 'update', module, entityId: id, description }, { auth: req.auth, ip: clientIp(req) });
}
function refresh(resources: string[]) { for (const resource of resources) broadcast(resource, 'refresh', []); }

/** Satır tutarları ve fiziksel birim sunucuda hesaplanır. */
async function normalizeItems(conn: PoolConnection, raw: any[]): Promise<Row[]> {
  if (!Array.isArray(raw) || !raw.length || raw.length > 1000) throw new HttpError(400, 'Belge 1–1000 satır içermelidir.');
  const result: Row[] = [];
  // Ürün kilitleri bütün belgelere aynı sırayla alınır.
  const products = new Map<number, Row>();
  for (const id of [...new Set(raw.map(item => Number(item.productId)))].sort((a, b) => a - b)) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Her satırda geçerli ürün zorunludur.');
    products.set(id, await one(conn, 'products', id));
  }
  for (const item of raw) {
    const product = products.get(Number(item.productId))!;
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice ?? 0);
    const taxRate = Number(item.taxRate ?? product.vatRate ?? 20);
    const discountRate = Number(item.discountRate ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0 || (quantityDecimals(product.unit) === 0 && !Number.isInteger(quantity))) throw new HttpError(400, `${product.name}: geçersiz miktar.`, 'INVALID_QUANTITY');
    if (![unitPrice, taxRate, discountRate].every(Number.isFinite) || unitPrice < 0 || taxRate < 0 || taxRate > 100 || discountRate < 0 || discountRate > 100) throw new HttpError(400, 'Fiyat, iskonto veya vergi oranı geçersiz.');
    const subtotal = money(quantity * unitPrice);
    const discountAmount = money(subtotal * discountRate / 100);
    const net = money(subtotal - discountAmount);
    const taxAmount = money(net * taxRate / 100);
    result.push({ productId: Number(item.productId), productCode: product.code, productName: product.name, unit: product.unit,
      color: item.color?.trim() || null, colorId: item.colorId || null, size: item.size?.trim() || null,
      orderItemId: item.orderItemId ? Number(item.orderItemId) : null, quantity, unitPrice, taxRate, discountRate,
      discountAmount, taxAmount, total: money(net + taxAmount), subtotal, net });
  }
  return result;
}

async function createWorkOrder(conn: PoolConnection, input: Row, order?: Row, orderItemId?: number): Promise<number> {
  const product = await one(conn, 'products', input.productId);
  const cfg = await settings(conn);
  const date = new Date();
  const recipe = selectProductionRecipe<Row & { productId: number }>(await rows(conn, 'SELECT * FROM `recipes` WHERE `productId` = ? ORDER BY `id`', [product.id]) as (Row & { productId: number })[], product.id, input.color);
  const template = product.assortmentTemplateId ? await one(conn, 'assortmentTemplates', product.assortmentTemplateId) : undefined;
  const distribution = distributeAssortment({ ...product, assortment: json(product.assortment), variantBarcodes: json(product.variantBarcodes) }, Number(input.quantity), input.size, template ? json(template.items) : undefined);
  const barcode = await allocateDocumentNumber(conn, { table: 'workOrders', column: 'barcode', prefix: String(cfg.production?.workOrderPrefix || 'WO').replace(/-$/, ''), pad: 6, omitYear: true });
  return insert(conn, 'workOrders', {
    productId: product.id, quantity: Number(input.quantity), color: input.color || null, colorId: input.colorId || null, size: input.size || null,
    barcode, status: 'pending', currentStage: 'planning', stages: PRODUCTION_STAGE_ORDER.map(stage => ({ stage, status: stage === 'planning' ? 'in_progress' : 'pending' })),
    createdAt: date, targetDate: input.targetDate ? dateOf(input.targetDate) : order?.deliveryDate ?? null,
    orderId: order?.id ?? input.orderId ?? null, orderItemId: orderItemId ?? null, orderNumber: order?.orderNumber ?? null,
    customerName: input.customerName || null, customerCode: input.customerCode || null, orderDate: order?.date ?? null,
    documentNo: product.documentNo, moldCode: product.moldCode, moldGroup: product.moldGroup,
    assortmentBreakdown: distribution, recipeId: recipe?.id ?? null, recipeSnapshot: recipe ? { ...recipe, ingredients: json(recipe.ingredients), capturedAt: date.toISOString() } : null, materialStatus: recipe ? 'pending_mrp' : 'no_recipe', line: input.line || null, notes: input.notes || null,
  });
}

async function orderWorkOrders(conn: PoolConnection, order: Row): Promise<number[]> {
  const cfg = await settings(conn);
  if (order.type !== 'sales' || order.status !== 'confirmed' || cfg.order?.autoCreateWorkOrdersOnConfirm === false) return [];
  const items = await rows(conn, 'SELECT * FROM `orderItems` WHERE `orderId` = ? ORDER BY `id` FOR UPDATE', [order.id]);
  const ids: number[] = [];
  for (const item of items) {
    const product = await one(conn, 'products', item.productId);
    if (product.isRawMaterial || product.categoryType === 'raw_material' || product.categoryType === 'accessory') continue;
    const existing = await rows(conn, "SELECT `id` FROM `workOrders` WHERE `orderItemId` = ? AND `status` <> 'cancelled' FOR UPDATE", [item.id]);
    if (existing.length) continue;
    ids.push(await createWorkOrder(conn, item, order, item.id));
  }
  return ids;
}

export function registerDocumentOps(router: Router, stock: StockWriter) {
  registerAccountingPeriods(router);
  registerStockCounts(router);
  router.post('/generate-payroll', async (req, res, next) => {
    try {
      permission(req, 'hr', 'create');
      const month = Number(req.body.month), year = Number(req.body.year);
      if (!Number.isInteger(month) || month < 1 || month > 12 || year !== 2026) throw new HttpError(400, 'Geçerli 2026 bordro dönemi seçin.');
      const generated = await withOperation(req, async conn => {
        await assertOpenPeriod(conn, 'hr', new Date(year, month - 1, 1));
        const cfg = await settings(conn);
        const params = { ...HR_DEFAULT_PARAMS, ...cfg.hr };
        if (Number(params.minWageGross) !== HR_CONSTANTS_2026.MIN_WAGE_GROSS_TL || Number(params.minWageNet) !== HR_CONSTANTS_2026.MIN_WAGE_NET_TL) throw new HttpError(409, 'İK ayarları güncel 2026 tarifesine uygun değil. Ayarlardan 2026 parametrelerini uygulayıp kaydedin.', 'PAYROLL_POLICY_REQUIRED');
        const employees = await rows(conn, "SELECT * FROM employees WHERE status='active' ORDER BY id FOR UPDATE");
        const prefix = `${year}-${String(month).padStart(2, '0')}`;
        const attendance = await rows(conn, 'SELECT * FROM attendanceRecords WHERE `year`=? AND `month`=? OR `date` LIKE ?', [year, month, prefix + '%']);
        const advances = await rows(conn, "SELECT * FROM advanceRequests WHERE `year`=? AND `month`=? AND status='paid'", [year, month]);
        const previous = await rows(conn, 'SELECT * FROM payrollRecords WHERE `year`=? ORDER BY employeeId,month FOR UPDATE', [year]);
        const result: any[] = [];
        for (const employee of employees) {
          const existing = previous.filter(payroll => payroll.employeeId === employee.id && Number(payroll.month) === month);
          if (existing.length > 1) throw new HttpError(409, 'Aynı dönem/personel için birden çok bordro var; önce uzlaştırın.');
          if (existing[0]?.isAccounted || (existing[0] && existing[0].paymentStatus !== 'unpaid')) throw new HttpError(409, `${employee.name}: ödenmiş/muhasebeleşmiş bordro yeniden hesaplanamaz.`);
          if (previous.some(payroll => payroll.employeeId === employee.id && Number(payroll.month) > month)) throw new HttpError(409, `${employee.name}: sonraki dönem bordrosu varken önceki dönem değiştirilemez.`);
          const cumulative = previous.filter(payroll => payroll.employeeId === employee.id && Number(payroll.month) < month).reduce((sum, payroll) => sum + Number(payroll.incomeTaxBase || 0), 0);
          const data = { ...calculateEmployeePayroll(employee as Employee, attendance.filter(record => record.employeeId === employee.id) as AttendanceRecord[], advances as AdvanceRequest[], month, year, params, cumulative), parameterSnapshot: { year, month, version: 'TR-2026-v1', ...params, taxBrackets: HR_CONSTANTS_2026.TAX_BRACKETS_2026.map(bracket => ({ ...bracket, limitKurus: Number.isFinite(bracket.limitKurus) ? bracket.limitKurus : null })), capturedAt: new Date().toISOString() } };
          let id: number;
          if (existing[0]) {
            permission(req, 'hr', 'edit');
            const keys = Object.keys(data) as (keyof typeof data)[];
            await conn.query(`UPDATE payrollRecords SET ${keys.map(key => `\`${key}\`=?`).join(',')},version=version+1 WHERE id=?`, [...keys.map(key => key === 'parameterSnapshot' ? JSON.stringify(data[key]) : data[key]), existing[0].id]);
            id = existing[0].id;
          } else id = await insert(conn, 'payrollRecords', { ...data, createdAt: new Date() });
          await audit(conn, req, 'hr', id, `Bordro hesaplandı: ${employee.name}, ${month}/${year}; tarife TR-2026-v1`);
          result.push({ ...data, id });
        }
        return result;
      });
      refresh(['payrollRecords']); res.json({ data: generated });
    } catch (error) { next(error); }
  });
  router.post('/save-settings', async (req, res, next) => {
    try {
      permission(req, 'settings', 'edit');
      const saved = await withOperation(req, async conn => {
        const before = (await rows(conn, "SELECT * FROM `settings` WHERE `id` = 'global_settings' FOR UPDATE"))[0];
        if (before && Number(req.body.expectedVersion) !== Number(before.version)) throw new HttpError(409, 'Ayarlar başka kullanıcı tarafından değiştirildi. Yenileyip tekrar deneyin.', 'VERSION_CONFLICT');
        const input = req.body.settings;
        if (!input || typeof input !== 'object') throw new HttpError(400, 'Ayarlar zorunludur.');
        const sections = ['company', 'stock', 'order', 'production', 'finance', 'hr'];
        for (const section of sections) if (input[section] != null && (typeof input[section] !== 'object' || Array.isArray(input[section]))) throw new HttpError(400, 'Geçersiz modül ayarı.');
        const barcodeType = input.stock?.barcodeType ?? input.barcodeType ?? before?.barcodeType ?? 'CODE-128';
        if (!['CODE-128', 'CODE-39', 'EAN-13'].includes(barcodeType)) throw new HttpError(400, 'Geçersiz barkod türü.');
        const nextSequence = Math.max(Number(input.stock?.nextBarcodeSequence ?? input.nextBarcodeSequence ?? 1000000), Number(before?.nextBarcodeSequence || 0));
        if (!Number.isSafeInteger(nextSequence) || nextSequence < 1) throw new HttpError(400, 'Geçersiz barkod sayacı.');
        const data: Row = { barcodeType, barcodePrefix: input.stock?.barcodePrefix ?? input.barcodePrefix ?? before?.barcodePrefix ?? '869', nextBarcodeSequence: nextSequence };
        for (const section of sections) if (input[section] !== undefined) data[section] = JSON.stringify(input[section]);
        const keys = Object.keys(data);
        if (before) await conn.query(`UPDATE \`settings\` SET ${keys.map(key => `\`${key}\`=?`).join(',')}, \`version\`=\`version\`+1 WHERE \`id\`='global_settings'`, keys.map(key => data[key]));
        else await conn.query(`INSERT INTO \`settings\` (\`id\`,${keys.map(key => `\`${key}\``).join(',')}) VALUES ('global_settings',${keys.map(() => '?').join(',')})`, keys.map(key => data[key]));
        await conn.query("INSERT INTO `settings` (`id`,`barcodeType`,`barcodePrefix`,`nextBarcodeSequence`) VALUES ('global_barcode',?,?,?) ON DUPLICATE KEY UPDATE `barcodeType`=VALUES(`barcodeType`),`barcodePrefix`=VALUES(`barcodePrefix`),`nextBarcodeSequence`=VALUES(`nextBarcodeSequence`),`version`=`version`+1", [barcodeType, data.barcodePrefix, nextSequence]);
        await audit(conn, req, 'settings', 0, 'Modül ayarları sürüm kontrolüyle atomik kaydedildi.');
        return settings(conn);
      });
      refresh(['settings']); res.json({ data: saved });
    } catch (error) { next(error); }
  });

  router.get('/workflow-summary', async (req, res, next) => {
    try {
      const allowed = (module: AppModule) => can(req.auth?.role || null, module, 'view');
      if (!['inventory', 'production', 'orders'].some(module => allowed(module as AppModule))) throw new HttpError(403, 'Operasyon görüntüleme yetkisi yok.');
      const result = await withTransaction(async conn => ({
        reservations: allowed('inventory') ? await rows(conn, 'SELECT r.*,p.name AS productName,o.orderNumber,w.barcode AS workOrderBarcode FROM stockReservations r JOIN products p ON p.id=r.productId LEFT JOIN orders o ON o.id=r.orderId LEFT JOIN workOrders w ON w.id=r.workOrderId ORDER BY r.id DESC LIMIT 200') : [],
        qualityChecks: allowed('production') ? await rows(conn, 'SELECT q.*,w.barcode,p.name AS productName FROM qualityChecks q JOIN workOrders w ON w.id=q.workOrderId JOIN products p ON p.id=w.productId ORDER BY q.id DESC LIMIT 200') : [],
        purchaseRequests: allowed('orders') ? await rows(conn, 'SELECT r.*,c.name AS supplierName FROM purchaseRequests r JOIN contacts c ON c.id=r.supplierId ORDER BY r.id DESC LIMIT 200') : [],
      }));
      res.json({ data: result });
    } catch (error) { next(error); }
  });

  router.post('/reserve-stock', async (req, res, next) => {
    try {
      permission(req, 'inventory', 'edit');
      const result = await withOperation(req, async conn => {
        const product = await one(conn, 'products', req.body.productId);
        const quantity = Number(req.body.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0 || (quantityDecimals(product.unit) === 0 && !Number.isInteger(quantity))) throw new HttpError(400, 'Geçersiz rezervasyon miktarı.');
        if (!req.body.orderId && !req.body.workOrderId) throw new HttpError(400, 'Rezervasyon sipariş veya iş emrine bağlanmalıdır.');
        if (req.body.orderId && req.body.workOrderId) throw new HttpError(400, 'Rezervasyonu yalnız bir sipariş veya iş emrine bağlayın.');
        if (req.body.orderId) {
          const order = await one(conn, 'orders', req.body.orderId);
          if (order.type !== 'sales' || !['confirmed', 'partially_shipped'].includes(order.status)) throw new HttpError(409, 'Rezervasyon için aktif satış siparişi seçin.');
          const match = await rows(conn, 'SELECT `id` FROM `orderItems` WHERE `orderId`=? AND `productId`=? AND COALESCE(`color`,\'\')=? AND COALESCE(`size`,\'\')=?', [order.id, product.id, req.body.color || '', req.body.size || '']);
          if (!match.length) throw new HttpError(400, 'Ürün/renk/beden siparişte bulunmuyor.');
          const outstanding = (await rows(conn, "SELECT COALESCE(SUM(quantity-shippedQuantity),0) n FROM orderItems WHERE orderId=? AND productId=? AND COALESCE(color,'')=? AND COALESCE(size,'')=?", [order.id, product.id, req.body.color || '', req.body.size || '']))[0];
          const held = (await rows(conn, "SELECT COALESCE(SUM(remainingQuantity),0) n FROM stockReservations WHERE orderId=? AND productId=? AND status='active' AND COALESCE(color,'')=? AND COALESCE(size,'')=?", [order.id, product.id, req.body.color || '', req.body.size || '']))[0];
          if (quantity + Number(held.n) > Number(outstanding.n) + 0.00001) throw new HttpError(409, 'Rezervasyon siparişin kalan ihtiyacını aşamaz.');
        }
        if (req.body.workOrderId) {
          const workOrder = await one(conn, 'workOrders', req.body.workOrderId);
          if (['completed', 'cancelled'].includes(workOrder.status)) throw new HttpError(409, 'Kapalı iş emrine rezervasyon yapılamaz.');
        }
        await assertUnreservedStock(conn, product as any, quantity);
        const color = String(req.body.color || '').trim(); const size = String(req.body.size || '').trim();
        if (color || size) {
          const available = json(product.variantBarcodes).filter(variant => (!color || variant.color === color) && (!size || variant.size === size)).reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
          const reserved = (await rows(conn, "SELECT COALESCE(SUM(remainingQuantity),0) AS quantity FROM stockReservations WHERE productId=? AND status='active' AND (COALESCE(color,'')='' OR ?='' OR color=?) AND (COALESCE(size,'')='' OR ?='' OR size=?)", [product.id, color, color, size, size]))[0];
          if (available - Number(reserved.quantity) + 0.00001 < quantity) throw new HttpError(409, 'Seçilen varyantın serbest stoğu yetersiz.');
        }
        const id = await insert(conn, 'stockReservations', { productId: product.id, orderId: req.body.orderId || null, workOrderId: req.body.workOrderId || null, color: color || null, size: size || null, quantity, remainingQuantity: quantity, status: 'active', createdBy: req.auth!.user.id, createdAt: new Date() });
        await audit(conn, req, 'inventory', id, `Stok rezervasyonu: ${product.name}, ${quantity} ${product.unit}`);
        return { reservationId: id };
      });
      refresh(['stockReservations', 'products']); res.json({ data: result });
    } catch (error) { next(error); }
  });
  router.post('/release-reservation', async (req, res, next) => {
    try {
      permission(req, 'inventory', 'edit');
      await withOperation(req, async conn => {
        const reservation = await one(conn, 'stockReservations', req.body.reservationId);
        if (reservation.status !== 'active') throw new HttpError(409, 'Yalnız aktif rezervasyon bırakılabilir.');
        await conn.query("UPDATE stockReservations SET status='released',releasedAt=NOW() WHERE id=?", [reservation.id]);
        await audit(conn, req, 'inventory', reservation.id, 'Stok rezervasyonu serbest bırakıldı.');
      });
      refresh(['stockReservations', 'products']); res.json({ data: { released: true } });
    } catch (error) { next(error); }
  });
  router.post('/quality-check', async (req, res, next) => {
    try {
      permission(req, 'production', 'edit');
      const result = await withOperation(req, async conn => {
        const order = await one(conn, 'workOrders', req.body.workOrderId);
        if (['completed', 'cancelled'].includes(order.status)) throw new HttpError(409, 'Kapalı iş emrinde kalite kontrolü oluşturulamaz.');
        const inspected = Number(req.body.inspectedQuantity), rejected = Number(req.body.rejectedQuantity || 0);
        if (!Number.isInteger(inspected) || inspected <= 0 || inspected > Number(order.quantity) || !Number.isInteger(rejected) || rejected < 0 || rejected > inspected) throw new HttpError(400, 'Kontrol ve ret miktarları geçersiz.');
        if (!req.body.notes?.trim()) throw new HttpError(400, 'Kalite kontrol açıklaması zorunludur.');
        const id = await insert(conn, 'qualityChecks', { workOrderId: order.id, inspectedQuantity: inspected, rejectedQuantity: rejected, result: rejected > 0 ? 'fail' : 'pass', status: 'pending', notes: String(req.body.notes).trim(), createdBy: req.auth!.user.id, createdAt: new Date() });
        await audit(conn, req, 'production', id, `Kalite kontrolü: ${order.barcode}; kontrol ${inspected}, ret ${rejected}`);
        return { qualityCheckId: id };
      });
      refresh(['qualityChecks']); res.json({ data: result });
    } catch (error) { next(error); }
  });
  router.post('/approve-quality', async (req, res, next) => {
    try {
      permission(req, 'production', 'approve');
      await withOperation(req, async conn => {
        const check = await one(conn, 'qualityChecks', req.body.qualityCheckId);
        const order = await one(conn, 'workOrders', check.workOrderId);
        if (['completed', 'cancelled'].includes(order.status) || check.status !== 'pending') throw new HttpError(409, 'Kalite kontrolü onaya uygun değil.');
        if (Number(check.createdBy) === req.auth!.user.id && req.auth?.role?.code !== 'super_admin') throw new HttpError(403, 'Kendi kalite kontrolünüzü onaylayamazsınız.');
        await conn.query("UPDATE qualityChecks SET status='approved',approvedBy=?,approvedAt=NOW() WHERE id=?", [req.auth!.user.id, check.id]);
        await audit(conn, req, 'production', check.id, 'Kalite kontrol sonucu onaylandı.');
      });
      refresh(['qualityChecks']); res.json({ data: { approved: true } });
    } catch (error) { next(error); }
  });
  router.post('/purchase-request', async (req, res, next) => {
    try {
      permission(req, 'orders', 'create');
      const result = await withOperation(req, async conn => {
        const supplier = await one(conn, 'contacts', req.body.supplierId);
        if (!['supplier', 'both'].includes(supplier.type)) throw new HttpError(400, 'Tedarikçi seçilmelidir.');
        const items = await normalizeItems(conn, req.body.items);
        if (!req.body.notes?.trim()) throw new HttpError(400, 'Satın alma gerekçesi zorunludur.');
        const requestNumber = await allocateDocumentNumber(conn, { table: 'purchaseRequests', column: 'requestNumber', prefix: 'STL', pad: 6 });
        const id = await insert(conn, 'purchaseRequests', { requestNumber, supplierId: supplier.id, items, totalAmount: money(items.reduce((sum, item) => sum + item.total, 0)), status: 'pending', notes: req.body.notes.trim(), createdBy: req.auth!.user.id, createdAt: new Date() });
        await audit(conn, req, 'orders', id, `Satın alma talebi: ${requestNumber}`);
        return { requestId: id, requestNumber };
      });
      refresh(['purchaseRequests']); res.json({ data: result });
    } catch (error) { next(error); }
  });
  router.post('/decide-purchase', async (req, res, next) => {
    try {
      permission(req, 'orders', 'approve');
      const result = await withOperation(req, async conn => {
        const request = await one(conn, 'purchaseRequests', req.body.requestId);
        if (request.status !== 'pending') throw new HttpError(409, 'Talep zaten sonuçlandırılmış.');
        if (Number(request.createdBy) === req.auth!.user.id && req.auth?.role?.code !== 'super_admin') throw new HttpError(403, 'Kendi satın alma talebinizi onaylayamazsınız.');
        const decision = req.body.decision;
        if (!['approved', 'rejected'].includes(decision) || !req.body.reason?.trim()) throw new HttpError(400, 'Karar ve gerekçe zorunludur.');
        let orderId = null;
        if (decision === 'approved') {
          const items = await normalizeItems(conn, json(request.items));
          const orderNumber = await documentNumber(conn, 'orders', 'PO', new Date());
          orderId = await insert(conn, 'orders', { type: 'purchase', orderNumber, contactId: request.supplierId, date: new Date(), status: 'confirmed', currency: 'TRY',
            totalAmount: money(items.reduce((sum, item) => sum + item.net, 0)), taxAmount: money(items.reduce((sum, item) => sum + item.taxAmount, 0)), grandTotal: money(items.reduce((sum, item) => sum + item.total, 0)), discountAmount: 0, notes: `${request.requestNumber}: ${request.notes}`, createdAt: new Date(), updatedAt: new Date() });
          for (const item of items) await insert(conn, 'orderItems', { ...item, orderId, shippedQuantity: 0, invoicedQuantity: 0 });
        }
        await conn.query('UPDATE purchaseRequests SET status=?,decisionReason=?,approvedBy=?,orderId=?,decidedAt=NOW() WHERE id=?', [decision, req.body.reason.trim(), req.auth!.user.id, orderId, request.id]);
        await audit(conn, req, 'orders', request.id, `Satın alma talebi ${decision}: ${req.body.reason.trim()}`);
        return { orderId };
      });
      refresh(['purchaseRequests', 'orders', 'orderItems']); res.json({ data: result });
    } catch (error) { next(error); }
  });

  router.post('/save-order', async (req, res, next) => {
    try {
      const input = req.body?.order || {};
      const id = req.body?.id ? Number(req.body.id) : null;
      permission(req, 'orders', id ? 'edit' : 'create');
      const result = await withOperation(req, async conn => {
        const before = id ? await one(conn, 'orders', id) : undefined;
        const merged = { ...before, ...input };
        if (!['sales', 'purchase'].includes(merged.type) || !['draft', 'confirmed', 'cancelled'].includes(merged.status)) throw new HttpError(400, 'Sipariş tipi veya durumu geçersiz.');
        if ((merged.currency || 'TRY') !== 'TRY') throw new HttpError(400, 'Dövizli muhasebe etkin değil; TRY seçin.');
        if (before) {
          if (!Number.isSafeInteger(req.body.expectedVersion) || req.body.expectedVersion < 1) throw new HttpError(428, 'Düzenleme sürümü zorunludur; siparişi yeniden açın.', 'VERSION_REQUIRED');
          if (req.body.expectedVersion != null && Number(req.body.expectedVersion) !== Number(before.version)) throw new HttpError(409, 'Sipariş başka kullanıcı tarafından değiştirildi.', 'VERSION_CONFLICT');
          const linked = await rows(conn, "SELECT `id` FROM `invoices` WHERE `orderId` = ? AND `status` <> 'cancelled' UNION ALL SELECT `id` FROM `waybills` WHERE `orderId` = ? AND `status` <> 'cancelled'", [id, id]);
          if (linked.length) throw new HttpError(409, 'Bağlı fatura/irsaliye bulunan sipariş değiştirilemez.', 'ORDER_HAS_DOCUMENTS');
          const active = await rows(conn, "SELECT `id` FROM `workOrders` WHERE `orderId` = ? AND (`status` = 'completed' OR `status` = 'in_progress' OR `materialStatus` = 'materials_consumed') FOR UPDATE", [id]);
          if (active.length) throw new HttpError(409, 'Üretimi başlamış sipariş değiştirilemez.', 'ORDER_IN_PRODUCTION');
        }
        await one(conn, 'contacts', merged.contactId);
        const itemData = req.body.items ?? (id ? await rows(conn, 'SELECT * FROM `orderItems` WHERE `orderId` = ?', [id]) : []);
        const items = await normalizeItems(conn, itemData);
        const cfg = await settings(conn);
        const date = dateOf(merged.date);
        const orderNumber = before?.orderNumber ?? await documentNumber(conn, 'orders', merged.type === 'sales' ? cfg.order?.salesOrderPrefix || 'SIP' : cfg.order?.purchaseOrderPrefix || 'PO', date);
        const data = { type: merged.type, orderNumber, contactId: Number(merged.contactId), date, deliveryDate: merged.deliveryDate ? dateOf(merged.deliveryDate) : null,
          status: merged.status, totalAmount: money(items.reduce((sum, item) => sum + item.net, 0)), taxAmount: money(items.reduce((sum, item) => sum + item.taxAmount, 0)),
          discountAmount: 0, grandTotal: money(items.reduce((sum, item) => sum + item.total, 0)), currency: 'TRY', notes: merged.notes || null, updatedAt: new Date() };
        let orderId = id;
        if (!orderId) orderId = await insert(conn, 'orders', { ...data, createdAt: new Date() });
        else {
          const keys = Object.keys(data) as (keyof typeof data)[];
          await conn.query(`UPDATE \`orders\` SET ${keys.map(key => `\`${key}\` = ?`).join(',')}, \`version\` = \`version\` + 1 WHERE \`id\` = ?`, [...keys.map(key => data[key]), orderId]);
          await conn.query("UPDATE `workOrders` SET `status` = 'cancelled', `version` = `version` + 1 WHERE `orderId` = ? AND `status` = 'pending'", [orderId]);
          await conn.query('DELETE FROM `orderItems` WHERE `orderId` = ?', [orderId]);
        }
        for (const item of items) await insert(conn, 'orderItems', { ...item, orderId, shippedQuantity: 0, invoicedQuantity: 0 });
        const workOrderIds = await orderWorkOrders(conn, { ...data, id: orderId });
        await audit(conn, req, 'orders', orderId!, `Sipariş atomik kaydedildi: ${orderNumber}`);
        return { orderId, orderNumber, workOrderIds, grandTotal: data.grandTotal };
      });
      refresh(['orders', 'orderItems', 'workOrders']); res.json({ data: result });
    } catch (error) { next(error); }
  });

  router.post('/order-notes', async (req, res, next) => {
    try {
      permission(req, 'orders', 'edit');
      await withOperation(req, async conn => {
        const order = await one(conn, 'orders', req.body.id);
        if (Number(req.body.expectedVersion) !== Number(order.version)) throw new HttpError(409, 'Sipariş başka kullanıcı tarafından değiştirildi.', 'VERSION_CONFLICT');
        await conn.query('UPDATE orders SET notes=?,version=version+1,updatedAt=NOW() WHERE id=?', [String(req.body.notes || ''), order.id]);
        await audit(conn, req, 'orders', order.id, 'Sipariş notları güncellendi.');
      });
      refresh(['orders']); res.json({ data: { saved: true } });
    } catch (error) { next(error); }
  });

  router.post('/update-work-order', async (req, res, next) => {
    try {
      permission(req, 'production', 'edit');
      await withOperation(req, async conn => {
        const order = await one(conn, 'workOrders', req.body.id);
        if (['completed', 'cancelled'].includes(order.status)) throw new HttpError(409, 'Kapalı iş emri değiştirilemez.');
        const changes: Row = {};
        for (const key of ['notes', 'operator', 'targetDate', 'documentNo', 'moldCode', 'moldGroup', 'line']) if (key in (req.body.changes || {})) changes[key] = key === 'targetDate' && req.body.changes[key] ? dateOf(req.body.changes[key]) : req.body.changes[key];
        if ('materialStatus' in (req.body.changes || {}) && order.materialStatus !== 'materials_consumed') {
          if (!['no_recipe', 'pending_mrp', 'materials_ready', 'materials_shortage', 'po_created'].includes(req.body.changes.materialStatus)) throw new HttpError(400, 'Geçersiz malzeme hazırlık durumu.');
          changes.materialStatus = req.body.changes.materialStatus;
        }
        if (!Object.keys(changes).length) return { changed: false };
        const keys = Object.keys(changes);
        await conn.query(`UPDATE workOrders SET ${keys.map(key => `\`${key}\`=?`).join(',')}, version=version+1 WHERE id=?`, [...keys.map(key => changes[key]), order.id]);
        await audit(conn, req, 'production', order.id, 'İş emri açıklama/planlama bilgisi güncellendi.');
      });
      refresh(['workOrders']); res.json({ data: { saved: true } });
    } catch (error) { next(error); }
  });

  async function applyWaybill(conn: PoolConnection, waybill: Row, items: Row[]) {
    await assertOpenPeriod(conn, 'accounting', waybill.date);
    if (waybill.orderId) {
      const order = await one(conn, 'orders', waybill.orderId);
      if (Number(order.contactId) !== Number(waybill.contactId) || order.type !== waybill.type || !['confirmed', 'partially_shipped'].includes(order.status)) throw new HttpError(409, 'Sipariş cari, tip veya durum bilgisi sevkiyata uygun değil.');
      for (const item of items) {
        if (!item.orderItemId) throw new HttpError(400, 'Sipariş bağlantılı sevkte her satır sipariş kalemine bağlanmalıdır.');
        const original = await one(conn, 'orderItems', item.orderItemId);
        if (Number(original.orderId) !== Number(order.id) || Number(original.productId) !== Number(item.productId) || (original.color || '') !== (item.color || '') || (original.size || '') !== (item.size || '')) throw new HttpError(400, 'Sevk satırı sipariş ürünü/renk/bedeniyle uyuşmuyor.');
        if (Number(original.shippedQuantity) + item.quantity > Number(original.quantity) + 0.00001) throw new HttpError(409, 'Sevk miktarı sipariş kalanını aşıyor.', 'OVER_SHIPMENT');
        await conn.query('UPDATE `orderItems` SET `shippedQuantity` = `shippedQuantity` + ?, `version` = `version` + 1 WHERE `id` = ?', [item.quantity, original.id]);
      }
      const totals = (await rows(conn, 'SELECT SUM(`quantity`) AS quantity, SUM(`shippedQuantity`) AS shipped FROM `orderItems` WHERE `orderId` = ?', [order.id]))[0];
      await conn.query('UPDATE `orders` SET `status` = ?, `version` = `version` + 1, `updatedAt` = NOW() WHERE `id` = ?', [Number(totals.shipped) >= Number(totals.quantity) ? 'completed' : 'partially_shipped', order.id]);
    }
    if (waybill.isStockDeducted) for (const item of items) {
      if (waybill.type === 'sales' && waybill.orderId) await consumeReservation(conn, item.productId, item.quantity, { orderId: waybill.orderId, color: item.color, size: item.size });
      await stock(conn, { productId: Number(item.productId), signedQuantity: (waybill.type === 'sales' ? -1 : 1) * Number(item.quantity), color: item.color, size: item.size,
        type: waybill.type === 'sales' ? 'out' : 'in', description: `İrsaliye: ${waybill.waybillNumber}`, date: dateOf(waybill.date), writeLog: true, withVersion: true });
    }
  }

  router.post('/create-waybill', async (req, res, next) => {
    try {
      permission(req, 'waybills', 'create');
      const input = req.body?.waybill || {};
      const result = await withOperation(req, async conn => {
        const date = dateOf(input.date);
        const dispatchDate = input.dispatchDate == null || input.dispatchDate === '' ? null : new Date(input.dispatchDate);
        if (dispatchDate && !Number.isFinite(dispatchDate.getTime())) throw new HttpError(400, 'Geçersiz sevk tarihi.');
        const shippingDate = input.shippingDate == null || input.shippingDate === '' ? null : new Date(input.shippingDate);
        if (shippingDate && !Number.isFinite(shippingDate.getTime())) throw new HttpError(400, 'Geçersiz gönderim tarihi.');
        await assertOpenPeriod(conn, 'accounting', date);
        if (!['sales', 'purchase'].includes(input.type) || !['draft', 'issued'].includes(input.status)) throw new HttpError(400, 'İrsaliye tipi veya durumu geçersiz.');
        if ((input.currency || 'TRY') !== 'TRY') throw new HttpError(400, 'Dövizli irsaliye etkin değil.');
        const contact = await one(conn, 'contacts', input.contactId);
        const cfg = await settings(conn);
        const items = await normalizeItems(conn, req.body.items);
        const waybillNumber = await documentNumber(conn, 'waybills', input.type === 'sales' ? cfg.order?.waybillSalesPrefix || 'IRS' : cfg.order?.waybillPurchasePrefix || 'GIR', date);
        const data = { ...input, contactId: contact.id, contactName: contact.name, date, shippingDate, dispatchDate, waybillNumber,
          orderId: input.orderId || null, invoiceId: null, invoiceNumber: null, invoicedStatus: 'not_invoiced',
          subtotal: money(items.reduce((sum, item) => sum + item.subtotal, 0)), discountTotal: money(items.reduce((sum, item) => sum + item.discountAmount, 0)),
          taxTotal: money(items.reduce((sum, item) => sum + item.taxAmount, 0)), grandTotal: money(items.reduce((sum, item) => sum + item.total, 0)), totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
          isStockDeducted: cfg.order?.autoDeductStockOnWaybill !== false && input.isStockDeducted !== false, createdAt: new Date(), updatedAt: new Date(),
        };
        const waybillId = await insert(conn, 'waybills', data);
        for (const item of items) await insert(conn, 'waybillItems', { ...item, waybillId });
        if (input.status === 'issued') await applyWaybill(conn, data, items);
        await audit(conn, req, 'waybills', waybillId, `İrsaliye atomik oluşturuldu: ${waybillNumber}`);
        return { waybillId, waybillNumber };
      });
      refresh(['waybills', 'waybillItems', 'orders', 'orderItems', 'products', 'inventoryLogs']); res.json({ data: result });
    } catch (error) { next(error); }
  });

  router.post('/issue-waybill', async (req, res, next) => {
    try {
      permission(req, 'waybills', 'edit');
      await withOperation(req, async conn => {
        const waybill = await one(conn, 'waybills', req.body.waybillId);
        if (waybill.status !== 'draft') throw new HttpError(409, 'Yalnızca taslak irsaliye kesinleştirilebilir.');
        const items = await rows(conn, 'SELECT * FROM `waybillItems` WHERE `waybillId` = ? ORDER BY `id` FOR UPDATE', [waybill.id]);
        if (!items.length) throw new HttpError(400, 'İrsaliye kalemleri boş.');
        await applyWaybill(conn, waybill, items);
        await conn.query("UPDATE `waybills` SET `status` = 'issued', `version` = `version` + 1, `updatedAt` = NOW() WHERE `id` = ?", [waybill.id]);
        await audit(conn, req, 'waybills', waybill.id, `İrsaliye kesinleştirildi: ${waybill.waybillNumber}`);
      });
      refresh(['waybills', 'orders', 'orderItems', 'products', 'inventoryLogs']); res.json({ data: { issued: true } });
    } catch (error) { next(error); }
  });

  router.post('/create-work-order', async (req, res, next) => {
    try {
      permission(req, 'production', 'create');
      const id = await withOperation(req, async conn => {
        const id = await createWorkOrder(conn, req.body);
        await audit(conn, req, 'production', id, 'İş emri atomik oluşturuldu.');
        return id;
      });
      refresh(['workOrders']); res.json({ data: { workOrderId: id } });
    } catch (error) { next(error); }
  });
  router.post('/order-work-orders', async (req, res, next) => {
    try {
      permission(req, 'production', 'create');
      const ids = await withOperation(req, async conn => orderWorkOrders(conn, await one(conn, 'orders', req.body.orderId)));
      refresh(['workOrders']); res.json({ data: { ids } });
    } catch (error) { next(error); }
  });

  router.post('/transition-production', async (req, res, next) => {
    try {
      permission(req, 'production', 'edit');
      const result = await withOperation(req, async conn => {
        await assertOpenPeriod(conn, 'accounting', new Date());
        const order = await one(conn, 'workOrders', req.body.workOrderId);
        if (['completed', 'cancelled'].includes(order.status)) throw new HttpError(409, 'Tamamlanmış/iptal iş emri ilerletilemez.');
        const current = PRODUCTION_STAGE_ORDER.indexOf(order.currentStage);
        const target = req.body.targetStage || PRODUCTION_STAGE_ORDER[current + 1];
        const nextIndex = PRODUCTION_STAGE_ORDER.indexOf(target);
        if (current < 0 || nextIndex <= current) throw new HttpError(409, 'Üretim yalnızca ileri bir aşamaya geçirilebilir.');
        if (nextIndex > current + 1 && !can(req.auth?.role || null, 'production', 'approve')) throw new HttpError(403, 'Aşama atlamak için üretim onay yetkisi gerekir.');
        const cfg = await settings(conn);
        const scrap = Number(req.body.scrapQuantity || 0);
        if (!Number.isInteger(scrap) || scrap < 0 || scrap > Number(order.quantity)) throw new HttpError(400, 'Geçersiz fire miktarı.');
        if (scrap > Number(order.quantity) * Number(cfg.production?.scrapTolerancePercentage ?? 2) / 100 && !req.body.notes?.trim()) throw new HttpError(400, 'Tolerans üstü fire için açıklama zorunludur.');
        const stages = json(order.stages);
        const cumulativeScrap = stages.reduce((sum, stage) => sum + Number(stage.scrapQuantity || 0), 0) + scrap;
        if (cumulativeScrap > Number(order.quantity)) throw new HttpError(400, 'Toplam fire iş emri miktarını aşıyor.');
        let materialStatus = order.materialStatus;
        if (materialStatus !== 'materials_consumed' && (cfg.production?.autoConsumeMaterialsOnStart !== false || target === 'completed')) {
          const recipes = await rows(conn, 'SELECT * FROM `recipes` WHERE `productId` = ? ORDER BY `id`', [order.productId]);
          const snapshot = typeof order.recipeSnapshot === 'string' ? JSON.parse(order.recipeSnapshot) : order.recipeSnapshot;
          const recipe = snapshot ?? (order.recipeId ? recipes.find(recipe => Number(recipe.id) === Number(order.recipeId)) : selectProductionRecipe(recipes as any[], order.productId, order.color));
          if (!recipe || !json(recipe.ingredients).length) throw new HttpError(409, 'Geçerli reçete olmadan üretim başlatılamaz.', 'RECIPE_REQUIRED');
          const ingredients = json(recipe.ingredients).sort((a, b) => Number(a.productId) - Number(b.productId));
          for (const ingredient of ingredients) {
            const product = await one(conn, 'products', ingredient.productId);
            const needed = requiredIngredientQuantity(ingredient, Number(order.quantity), product.unit);
            await consumeReservation(conn, product.id, needed, { workOrderId: order.id, color: ingredient.color || '', size: order.size || '' });
            await stock(conn, { productId: product.id, signedQuantity: -needed, color: ingredient.color || null, size: order.size || null, type: 'production_out', description: `#${order.barcode} sarfiyat`, date: new Date(), writeLog: true, withVersion: true });
          }
          materialStatus = 'materials_consumed';
        }
        if (target === 'completed') {
          const quality = (await rows(conn, "SELECT * FROM qualityChecks WHERE workOrderId=? AND status='approved' ORDER BY id DESC LIMIT 1 FOR UPDATE", [order.id]))[0];
          if (!quality || quality.result !== 'pass' || Number(quality.inspectedQuantity) < Number(order.quantity) - cumulativeScrap) throw new HttpError(409, 'Üretimi tamamlamak için miktarı karşılayan onaylı başarılı kalite kontrolü gerekir.', 'QUALITY_REQUIRED');
          const goodQuantity = Number(order.quantity) - cumulativeScrap;
          if (goodQuantity > 0) {
            const breakdown = json(order.assortmentBreakdown).filter(item => item.quantity > 0);
            const product = await one(conn, 'products', order.productId);
            const distribution = order.size ? [{ size: order.size, quantity: goodQuantity }] : distributeAssortment({ ...product, assortment: breakdown }, goodQuantity);
            for (const item of distribution.filter(item => item.quantity > 0)) await stock(conn, { productId: Number(order.productId), signedQuantity: item.quantity, color: order.color, size: item.size, type: 'production_in', description: `#${order.barcode} üretim tamamlandı`, date: new Date(), writeLog: true, withVersion: true });
          }
        }
        const now = new Date();
        const updatedStages = PRODUCTION_STAGE_ORDER.map((stage, index) => {
          const previous = stages.find(item => item.stage === stage) || { stage, status: 'pending' };
          if (index < current || index > nextIndex) return previous;
          return { ...previous, status: index === nextIndex && target !== 'completed' ? 'in_progress' : 'completed', startedAt: previous.startedAt || now,
            completedAt: index < nextIndex || target === 'completed' ? now : undefined, operator: req.body.operator || req.auth?.user.fullName,
            ...(index === current ? { scrapQuantity: scrap, notes: req.body.notes || '' } : {}) };
        });
        await conn.query('UPDATE `workOrders` SET `status` = ?, `currentStage` = ?, `stages` = ?, `materialStatus` = ?, `completedAt` = ?, `operator` = ?, `version` = `version` + 1 WHERE `id` = ?', [target === 'completed' ? 'completed' : 'in_progress', target, JSON.stringify(updatedStages), materialStatus, target === 'completed' ? now : null, req.body.operator || order.operator || req.auth?.user.fullName, order.id]);
        await audit(conn, req, 'production', order.id, `Üretim aşaması: ${order.currentStage} → ${target}; fire: ${scrap}`);
        return { nextStage: target, order: { ...order, currentStage: target, stages: updatedStages, materialStatus } };
      });
      refresh(['workOrders', 'products', 'inventoryLogs']); res.json({ data: result });
    } catch (error) { next(error); }
  });
}
