import type { Router, Request } from 'express';
import type { PoolConnection } from 'mysql2/promise';
import { withTransaction } from './db.js';
import { withOperation } from './idempotency.js';
import { can, clientIp } from './auth.js';
import { HttpError } from './errors.js';
import { assertOpenPeriod } from './periods.js';
import { assertReservedVariants } from './reservations.js';
import { allocateDocumentNumber } from './numbering.js';
import { writeAuditInTx } from './audit.js';
import { broadcast } from './sse.js';
import { quantityDecimals } from '../src/lib/inventoryCalculator.js';
import type { CountItem, CountVariant } from '../src/lib/stockCountTypes.js';

const parse = (value: any): any[] => Array.isArray(value) ? value : typeof value === 'string' ? JSON.parse(value) : [];
const rounded = (n: number) => Math.round(n * 10000) / 10000;
const key = (v: any) => JSON.stringify([v.color || '', v.size || '']);
const reason = (value: unknown) => { if (typeof value !== 'string' || !value.trim() || value.length > 4000) throw new HttpError(400, '1–4000 karakter gerekçe girin.'); return value.trim(); };
function permission(req: Request, action: 'view' | 'edit' | 'approve') { if (!can(req.auth?.role || null, 'inventory', action)) throw new HttpError(403, 'Bu stok işlemi için yetkiniz yok.', 'FORBIDDEN'); }
async function rows(conn: PoolConnection, sql: string, params: any[] = []) { const [result] = await conn.query<any[]>(sql, params); return result; }
async function product(conn: PoolConnection, id: any) {
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new HttpError(400, 'Geçerli ürün seçin.');
  const row = (await rows(conn, 'SELECT id,code,name,unit,stock,version,variantBarcodes FROM products WHERE id=? FOR UPDATE', [id]))[0];
  if (!row) throw new HttpError(404, 'Ürün bulunamadı.');
  return { ...row, stock: Number(row.stock), variantBarcodes: parse(row.variantBarcodes) };
}
function quantity(value: unknown, unit: string) {
  if (value === '' || value === null || value === undefined || typeof value === 'boolean') throw new HttpError(400, 'Sayım miktarı boş bırakılamaz.');
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n >= 1e11 || Math.abs(rounded(n) - n) > 1e-8 || (quantityDecimals(unit) === 0 && !Number.isInteger(n))) throw new HttpError(400, 'Sayım miktarı negatif olamaz; adet/çift tam sayı, diğer birimler en fazla dört ondalık olmalıdır.');
  return n;
}
async function audit(conn: PoolConnection, req: Request, id: number, description: string, details: string) { await writeAuditInTx(conn, { action: 'update', module: 'inventory', entityId: id, description, details }, { auth: req.auth, ip: clientIp(req) }); }
function refresh() { for (const resource of ['stockCounts', 'products', 'inventoryLogs', 'stockReservations']) broadcast(resource, 'refresh', []); }

// The list view evaluates at most 200 reservations at a time. Aggregate their
// shared stock and order balances in one query instead of repeating the same
// SUM queries for every row. SQL performs the selector comparisons so they use
// the same collation and NULL handling as the single-record approval checks.
async function reservationScanBalances(conn: PoolConnection, reservations: any[]) {
  const productIds = [...new Set(reservations.map(r => Number(r.productId)))];
  const orderIds = [...new Set(reservations.filter(r => r.orderId).map(r => Number(r.orderId)))];
  const placeholders = (values: unknown[]) => values.length ? values.map(() => '?').join(',') : 'NULL';
  const balances = await rows(conn, `
    SELECT r.id,
      COALESCE(totalHeld.n,0) AS totalHeld,
      COALESCE(variantHeld.n,0) AS variantHeld,
      COALESCE(orderHeld.n,0) AS orderHeld,
      COALESCE(outstanding.n,0) AS outstanding
    FROM stockReservations r
    LEFT JOIN (
      SELECT productId, SUM(remainingQuantity) AS n
      FROM stockReservations
      WHERE status='active' AND productId IN (${placeholders(productIds)})
      GROUP BY productId
    ) totalHeld ON totalHeld.productId=r.productId
    LEFT JOIN (
      SELECT productId, COALESCE(color,'') AS colorKey, COALESCE(size,'') AS sizeKey,
        SUM(remainingQuantity) AS n
      FROM stockReservations
      WHERE status='active' AND productId IN (${placeholders(productIds)})
      GROUP BY productId, colorKey, sizeKey
    ) variantHeld ON variantHeld.productId=r.productId
      AND variantHeld.colorKey=COALESCE(r.color,'') AND variantHeld.sizeKey=COALESCE(r.size,'')
    LEFT JOIN (
      SELECT orderId, productId, COALESCE(color,'') AS colorKey, COALESCE(size,'') AS sizeKey,
        SUM(remainingQuantity) AS n
      FROM stockReservations
      WHERE status='active' AND orderId IN (${placeholders(orderIds)})
      GROUP BY orderId, productId, colorKey, sizeKey
    ) orderHeld ON orderHeld.orderId=r.orderId AND orderHeld.productId=r.productId
      AND orderHeld.colorKey=COALESCE(r.color,'') AND orderHeld.sizeKey=COALESCE(r.size,'')
    LEFT JOIN (
      SELECT orderId, productId, COALESCE(color,'') AS colorKey, COALESCE(size,'') AS sizeKey,
        SUM(quantity-shippedQuantity) AS n
      FROM orderItems
      WHERE orderId IN (${placeholders(orderIds)})
      GROUP BY orderId, productId, colorKey, sizeKey
    ) outstanding ON outstanding.orderId=r.orderId AND outstanding.productId=r.productId
      AND outstanding.colorKey=COALESCE(r.color,'') AND outstanding.sizeKey=COALESCE(r.size,'')
    WHERE r.id IN (${placeholders(reservations)})`,
  [...productIds, ...productIds, ...orderIds, ...orderIds, ...reservations.map(r => r.id)]);
  return new Map(balances.map(row => [Number(row.id), row]));
}

async function reservationIssues(conn: PoolConnection, id?: number, afterId = 0) {
  const lock = id ? ' FOR UPDATE' : '';
  const reservations = await rows(conn, `SELECT r.*,p.name AS productName,p.stock,p.variantBarcodes,o.status AS orderStatus,o.orderNumber,w.status AS workStatus,w.materialStatus,w.barcode AS workOrderBarcode FROM stockReservations r JOIN products p ON p.id=r.productId LEFT JOIN orders o ON o.id=r.orderId LEFT JOIN workOrders w ON w.id=r.workOrderId WHERE r.status='active' ${id ? 'AND r.id=?' : 'AND r.id>?'} ORDER BY r.id LIMIT 200${lock}`, [id || afterId]);
  if (!reservations.length) return { issues: [], scanned: 0, nextCursor: null };
  const scanBalances = id ? null : await reservationScanBalances(conn, reservations);
  const result = [];
  for (const r of reservations) {
    const balance = scanBalances?.get(Number(r.id));
    const reasons: string[] = [];
    if ((!r.orderId && !r.workOrderId) || (r.orderId && !['confirmed', 'partially_shipped'].includes(r.orderStatus)) || (r.workOrderId && (['completed', 'cancelled'].includes(r.workStatus) || r.materialStatus === 'materials_consumed'))) reasons.push('Bağlı süreç kapalı veya stok ihtiyacı sona ermiş.');
    const totalHeld = balance ? Number(balance.totalHeld) : Number((await rows(conn, "SELECT COALESCE(SUM(remainingQuantity),0) n FROM stockReservations WHERE productId=? AND status='active'" + lock, [r.productId]))[0].n);
    if (totalHeld > Number(r.stock) + 0.00001) reasons.push('Ürünün toplam rezervasyonu fiziksel stoktan fazla.');
    if (r.color || r.size) {
      const available = parse(r.variantBarcodes).filter(v => (!r.color || v.color === r.color) && (!r.size || v.size === r.size)).reduce((sum, v) => sum + Number(v.stock || 0), 0);
      const variantHeld = balance ? Number(balance.variantHeld) : Number((await rows(conn, "SELECT COALESCE(SUM(remainingQuantity),0) n FROM stockReservations WHERE productId=? AND status='active' AND COALESCE(color,'')=? AND COALESCE(size,'')=?" + lock, [r.productId, r.color || '', r.size || '']))[0].n);
      if (variantHeld > available + 0.00001) reasons.push('Renk/beden rezervasyonu mevcut varyant stoğunu aşıyor.');
    }
    if (r.orderId) {
      const outstanding = balance ? Number(balance.outstanding) : Number((await rows(conn, "SELECT COALESCE(SUM(quantity-shippedQuantity),0) n FROM orderItems WHERE orderId=? AND productId=? AND COALESCE(color,'')=? AND COALESCE(size,'')=?" + lock, [r.orderId, r.productId, r.color || '', r.size || '']))[0].n);
      const orderHeld = balance ? Number(balance.orderHeld) : Number((await rows(conn, "SELECT COALESCE(SUM(remainingQuantity),0) n FROM stockReservations WHERE orderId=? AND productId=? AND status='active' AND COALESCE(color,'')=? AND COALESCE(size,'')=?" + lock, [r.orderId, r.productId, r.color || '', r.size || '']))[0].n);
      if (orderHeld > outstanding + 0.00001) reasons.push('Rezervasyon siparişin kalan miktarını aşıyor veya satır değişmiş.');
    }
    if (reasons.length) result.push({ id: r.id, productId: r.productId, productName: r.productName, orderNumber: r.orderNumber, workOrderBarcode: r.workOrderBarcode, remainingQuantity: Number(r.remainingQuantity), reasons });
  }
  return { issues: result, scanned: reservations.length, nextCursor: reservations.length === 200 ? Number(reservations[199].id) : null };
}

export function registerStockCounts(router: Router) {
  router.post('/stock-count-product', async (req, res, next) => { try { permission(req, 'view'); res.json({ data: await withTransaction(conn => product(conn, req.body.productId)) }); } catch (error) { next(error); } });
  router.post('/stock-count-summary', async (req, res, next) => {
    try {
      permission(req, 'view');
      const cursor = Number(req.body.afterId || 0), beforeCountId = Number(req.body.beforeCountId || 0);
      if (![cursor, beforeCountId].every(value => Number.isSafeInteger(value) && value >= 0)) throw new HttpError(400, 'Geçersiz liste konumu.');
      const data = await withTransaction(async conn => {
        const counts = await rows(conn, `SELECT * FROM stockCounts ${beforeCountId ? 'WHERE id<?' : ''} ORDER BY id DESC LIMIT 100`, beforeCountId ? [beforeCountId] : []);
        return { counts, nextCountCursor: counts.length === 100 ? Number(counts[99].id) : null, ...await reservationIssues(conn, undefined, cursor) };
      }); res.json({ data });
    } catch (error) { next(error); }
  });
  router.post('/create-stock-count', async (req, res, next) => {
    try {
      permission(req, 'edit'); const notes = reason(req.body.notes);
      const data = await withOperation(req, async conn => {
        await assertOpenPeriod(conn, 'accounting', new Date());
        const input = req.body.items;
        if (!Array.isArray(input) || !input.length || input.length > 100 || input.some(i => !i || typeof i !== 'object') || new Set(input.map(i => Number(i.productId))).size !== input.length) throw new HttpError(400, 'Sayım 1–100 farklı ürün içermelidir.');
        const items: CountItem[] = [];
        for (const line of [...input].sort((a, b) => Number(a.productId) - Number(b.productId))) {
          const p = await product(conn, line.productId);
          if (Number(line.expectedVersion) !== Number(p.version)) throw new HttpError(409, `${p.name}: stok değişmiş; güncel bilgiyi yükleyip yeniden sayın.`, 'VERSION_CONFLICT');
          const expectedVariants = p.variantBarcodes as CountVariant[];
          let countedVariants: CountVariant[] = [];
          let countedQuantity: number;
          if (expectedVariants.length) {
            if (new Set(expectedVariants.map(key)).size !== expectedVariants.length || Math.abs(expectedVariants.reduce((sum, v) => sum + Number(v.stock), 0) - p.stock) > 0.0001) throw new HttpError(409, 'Mevcut varyant tanımları/toplamı tutarsız; önce stok kartını uzlaştırın.');
            if (!Array.isArray(line.variants) || line.variants.length !== expectedVariants.length || new Set(line.variants.map(key)).size !== expectedVariants.length) throw new HttpError(400, 'Bütün renk/bedenleri birer kez sayın.');
            countedVariants = expectedVariants.map(v => { const counted = line.variants.find((item: any) => key(item) === key(v)); if (!counted) throw new HttpError(400, 'Sayım varyantları stok kartıyla eşleşmiyor.'); return { ...v, stock: quantity(counted.stock, p.unit) }; });
            countedQuantity = quantity(rounded(countedVariants.reduce((sum, v) => sum + v.stock, 0)), p.unit);
          } else { if (line.variants?.length) throw new HttpError(400, 'Bu ürün varyantsızdır.'); countedQuantity = quantity(line.countedQuantity, p.unit); }
          items.push({ productId: p.id, code: p.code, name: p.name, unit: p.unit, expectedVersion: Number(p.version), expectedQuantity: p.stock, countedQuantity, expectedVariants, countedVariants });
        }
        const countNumber = await allocateDocumentNumber(conn, { table: 'stockCounts', column: 'countNumber', prefix: 'SYM', pad: 6 });
        const [insert] = await conn.query<any>('INSERT INTO stockCounts (countNumber,items,notes,createdBy) VALUES (?,?,?,?)', [countNumber, JSON.stringify(items), notes, req.auth!.user.id]);
        await audit(conn, req, insert.insertId, `Sayım onaya sunuldu: ${countNumber}`, notes);
        return { id: insert.insertId, countNumber };
      }); refresh(); res.json({ data });
    } catch (error) { next(error); }
  });
  router.post('/decide-stock-count', async (req, res, next) => {
    try {
      permission(req, 'approve'); const decisionReason = reason(req.body.reason);
      if (!['approved', 'rejected'].includes(req.body.decision)) throw new HttpError(400, 'Geçersiz karar.');
      const data = await withOperation(req, async conn => {
        await assertOpenPeriod(conn, 'accounting', new Date());
        const count = (await rows(conn, 'SELECT * FROM stockCounts WHERE id=? FOR UPDATE', [req.body.id]))[0];
        if (!count) throw new HttpError(404, 'Sayım bulunamadı.');
        if (count.status !== 'pending' || Number(count.version) !== Number(req.body.expectedVersion)) throw new HttpError(409, 'Sayım sonuçlanmış veya sürümü değişmiş.');
        if (Number(count.createdBy) === req.auth!.user.id && req.auth!.role?.code !== 'super_admin') throw new HttpError(403, 'Kendi sayımınızı sonuçlandıramazsınız.');
        if (req.body.decision === 'approved') {
          await assertOpenPeriod(conn, 'accounting', count.createdAt);
          for (const item of parse(count.items) as CountItem[]) {
            const p = await product(conn, item.productId);
            if (Number(p.version) !== item.expectedVersion || Math.abs(p.stock - item.expectedQuantity) > 0.00001 || JSON.stringify(p.variantBarcodes) !== JSON.stringify(item.expectedVariants)) throw new HttpError(409, `${p.name}: sayımdan sonra stok kartı değişti. Sayımı reddedip yeniden oluşturun.`, 'VERSION_CONFLICT');
            const held = (await rows(conn, "SELECT COALESCE(SUM(remainingQuantity),0) n FROM stockReservations WHERE productId=? AND status='active'", [p.id]))[0];
            if (Number(held.n) > item.countedQuantity + 0.00001) throw new HttpError(409, `${p.name}: sayılan miktar aktif rezervasyonları karşılamıyor. Önce rezervasyonları uzlaştırın.`, 'RESERVED_STOCK');
            await assertReservedVariants(conn, p.id, item.countedVariants);
            const changes = item.countedVariants.length ? item.countedVariants.map((v, i) => ({ delta: rounded(v.stock - item.expectedVariants[i].stock), color: v.color || null, size: v.size || null })) : [{ delta: rounded(item.countedQuantity - item.expectedQuantity), color: null, size: null }];
            await conn.query('UPDATE products SET stock=?,variantBarcodes=?,version=version+1 WHERE id=?', [item.countedQuantity, item.countedVariants.length ? JSON.stringify(item.countedVariants) : null, p.id]);
            for (const change of changes.filter(change => change.delta !== 0)) await conn.query('INSERT INTO inventoryLogs (productId,type,quantity,date,description,color,size) VALUES (?,?,?,NOW(),?,?,?)', [p.id, change.delta > 0 ? 'in' : 'out', Math.abs(change.delta), `${count.countNumber} sayım farkı: ${decisionReason}`, change.color, change.size]);
          }
        }
        await conn.query('UPDATE stockCounts SET status=?,decisionReason=?,decidedBy=?,decidedAt=NOW(),version=version+1 WHERE id=?', [req.body.decision, decisionReason, req.auth!.user.id, count.id]);
        await audit(conn, req, count.id, `${count.countNumber} sayım ${req.body.decision === 'approved' ? 'onaylandı' : 'reddedildi'}`, decisionReason);
        return { id: count.id, status: req.body.decision };
      }); refresh(); res.json({ data });
    } catch (error) { next(error); }
  });
  router.post('/reconcile-reservation', async (req, res, next) => {
    try {
      permission(req, 'approve'); const decisionReason = reason(req.body.reason);
      await withOperation(req, async conn => {
        const initial = (await rows(conn, 'SELECT productId FROM stockReservations WHERE id=?', [req.body.id]))[0];
        if (!initial) throw new HttpError(404, 'Rezervasyon bulunamadı.');
        await product(conn, initial.productId);
        const r = (await rows(conn, 'SELECT * FROM stockReservations WHERE id=? FOR UPDATE', [req.body.id]))[0];
        if (r.status !== 'active' || Number(r.remainingQuantity) !== Number(req.body.expectedRemaining)) throw new HttpError(409, 'Rezervasyon değişmiş; listeyi yenileyin.');
        if (r.orderId) await rows(conn, 'SELECT id FROM orders WHERE id=? FOR UPDATE', [r.orderId]);
        if (r.workOrderId) await rows(conn, 'SELECT id FROM workOrders WHERE id=? FOR UPDATE', [r.workOrderId]);
        const { issues } = await reservationIssues(conn, r.id);
        if (!issues.length) throw new HttpError(409, 'Rezervasyonda uzlaştırılacak sorun bulunmuyor.');
        await conn.query("UPDATE stockReservations SET status='released',releasedAt=NOW() WHERE id=?", [r.id]);
        await audit(conn, req, r.id, 'Rezervasyon uzlaştırılarak serbest bırakıldı', JSON.stringify({ quantity: Number(r.remainingQuantity), reasons: issues[0].reasons, decisionReason }));
      }); refresh(); res.json({ data: { released: true } });
    } catch (error) { next(error); }
  });
}
