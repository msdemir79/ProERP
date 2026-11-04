import assert from 'node:assert/strict';
import { startTestServer } from './harness.js';
import { execute, queryOne, closePool } from '../../server/db.js';
import { createSession } from '../../server/auth.js';

const server = await startTestServer();
let passed = 0;
async function request(path: string, body: any, key?: string) {
  const response = await fetch(`${server.baseUrl}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${server.token}`, ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}
async function test(name: string, run: () => Promise<void>) { await run(); passed++; console.log(`✓ ${name}`); }
try {
  const contact = (await execute("INSERT INTO contacts (name,type,balance,currency) VALUES ('Test müşteri','customer',1000,'TRY')")).insertId;
  const other = (await execute("INSERT INTO contacts (name,type,balance,currency) VALUES ('Başka müşteri','customer',0,'TRY')")).insertId;
  const cash = (await execute("INSERT INTO cashBoxes (code,name,balance,currency) VALUES ('TEST','Test kasa',100,'TRY')")).insertId;
  const product = (await execute("INSERT INTO products (code,name,unit,stock,categoryType,isFootwear) VALUES ('TEST-P','Test mamul','Çift',10,'finished',1)")).insertId;
  const raw = (await execute("INSERT INTO products (code,name,unit,stock,categoryType,isRawMaterial) VALUES ('TEST-R','Test malzeme','Metre',100,'raw_material',1)")).insertId;
  await execute('UPDATE products SET variantBarcodes=? WHERE id=?', [JSON.stringify(['40','41','42','43','44'].map(size => ({ size, color: 'Genel', stock: 2, barcode: `TEST-${size}` }))), product]);
  const invoice = (await execute("INSERT INTO invoices (invoiceNumber,type,scenario,contactId,date,subtotal,grandTotal,status,currency) VALUES ('TEST-INV','sales','basic',?,NOW(),100,100,'issued','TRY')", [contact])).insertId;
  await execute('INSERT INTO recipes (productId, ingredients) VALUES (?, ?)', [product, JSON.stringify([{ productId: raw, quantity: 1, unit: 'Metre' }])]);

  await test('Nakit makbuz kasa olmadan reddedilir', async () => {
    const result = await request('/ops/receipt', { type: 'collection', instrument: 'cash', contactId: contact, amount: 10 });
    assert.equal(result.status, 400, JSON.stringify(result.body));
    assert.equal(Number((await queryOne<any>('SELECT balance FROM contacts WHERE id=?', [contact]))!.balance), 1000);
  });
  await test('Başka carinin faturasına ödeme bağlanamaz', async () => {
    const result = await request('/ops/receipt', { type: 'collection', instrument: 'cash', cashBoxId: cash, contactId: other, invoiceId: invoice, amount: 10 });
    assert.equal(result.status, 400, JSON.stringify(result.body));
    assert.equal(Number((await queryOne<any>('SELECT balance FROM cashBoxes WHERE id=?', [cash]))!.balance), 100);
  });
  await test('Aynı işlem anahtarı tahsilatı yalnız bir kez uygular', async () => {
    const payload = { type: 'collection', instrument: 'cash', cashBoxId: cash, contactId: contact, invoiceId: invoice, amount: 40 };
    const first = await request('/ops/receipt', payload, 'integrity-receipt-request-0001');
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const second = await request('/ops/receipt', payload, 'integrity-receipt-request-0001');
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(first.body.data.receiptId, second.body.data.receiptId);
    assert.equal(Number((await queryOne<any>('SELECT balance FROM cashBoxes WHERE id=?', [cash]))!.balance), 140);
    assert.equal(Number((await queryOne<any>('SELECT paidAmount FROM invoices WHERE id=?', [invoice]))!.paidAmount), 40);
    assert.equal((await request('/ops/receipt', { ...payload, amount: 41 }, 'integrity-receipt-request-0001')).status, 409);
  });
  await test('Fatura kalanını aşan ödeme bütün etkileriyle geri alınır', async () => {
    const result = await request('/ops/receipt', { type: 'collection', instrument: 'cash', cashBoxId: cash, contactId: contact, invoiceId: invoice, amount: 61 });
    assert.equal(result.status, 400, JSON.stringify(result.body));
    assert.equal(Number((await queryOne<any>('SELECT balance FROM cashBoxes WHERE id=?', [cash]))!.balance), 140);
  });
  const now = new Date();
  await test('Kapalı muhasebe dönemi tahsilatı engeller', async () => {
    await execute("INSERT INTO periodLocks (scope,year,month,isLocked) VALUES ('accounting',?,?,1) ON DUPLICATE KEY UPDATE isLocked=1", [now.getFullYear(), now.getMonth() + 1]);
    assert.equal((await request('/ops/receipt', { type: 'collection', instrument: 'cash', cashBoxId: cash, contactId: contact, amount: 10 })).status, 409);
    await execute("UPDATE periodLocks SET isLocked=0 WHERE scope='accounting'");
  });
  await test('İkinci satırda stok yetersizliği tüm irsaliyeyi geri alır', async () => {
    const result = await request('/ops/create-waybill', { waybill: { type: 'sales', scenario: 'sevk', contactId: contact, date: now, status: 'issued', isStockDeducted: true }, items: [{ productId: product, quantity: 1, unitPrice: 10, size: '40' }, { productId: raw, quantity: 101, unitPrice: 1 }] });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(Number((await queryOne<any>('SELECT COUNT(*) AS n FROM waybills'))!.n), 0);
    assert.equal(Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [product]))!.stock), 10);
  });
  let orderId: number;
  await test('Sipariş kalem ve iş emriyle birlikte atomik oluşur', async () => {
    const result = await request('/ops/save-order', { order: { type: 'sales', contactId: contact, date: now, status: 'confirmed', currency: 'TRY' }, items: [{ productId: product, quantity: 5, unitPrice: 10 }] });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    orderId = result.body.data.orderId;
    assert.equal(result.body.data.workOrderIds.length, 1);
    assert.equal(Number((await queryOne<any>('SELECT COUNT(*) AS n FROM orderItems WHERE orderId=?', [orderId]))!.n), 1);
  });
  await test('Üretim tamamlama sarf ve mamul girişini yalnız bir kez uygular', async () => {
    const workOrder = await queryOne<any>('SELECT * FROM workOrders WHERE orderId=?', [orderId]);
    assert.equal((await request('/ops/transition-production', { workOrderId: workOrder!.id, targetStage: 'completed' })).status, 409);
    const quality = await request('/ops/quality-check', { workOrderId: workOrder!.id, inspectedQuantity: 5, rejectedQuantity: 0, notes: 'Test: dikiş, taban ve paket kontrolü uygun.' });
    assert.equal(quality.status, 200, JSON.stringify(quality.body));
    assert.equal((await request('/ops/approve-quality', { qualityCheckId: quality.body.data.qualityCheckId })).status, 200);
    const result = await request('/ops/transition-production', { workOrderId: workOrder!.id, targetStage: 'completed' }, 'integrity-production-request-0001');
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const second = await request('/ops/transition-production', { workOrderId: workOrder!.id, targetStage: 'completed' }, 'integrity-production-request-0001');
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [raw]))!.stock), 95);
    assert.equal(Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [product]))!.stock), 15);
    assert.equal((await request('/ops/transition-production', { workOrderId: workOrder!.id, targetStage: 'completed' })).status, 409);
  });
  await test('Rezervasyon serbest stoğu korur ve iptalinde serbest bırakır', async () => {
    const order = await request('/ops/save-order', { order: { type: 'sales', contactId: contact, date: now, status: 'confirmed', currency: 'TRY' }, items: [{ productId: product, quantity: 10, unitPrice: 10, color: 'Genel', size: '40' }] });
    const reservation = await request('/ops/reserve-stock', { productId: product, quantity: 10, orderId: order.body.data.orderId, color: '', size: '' });
    assert.equal(reservation.status, 400); // Beden/renk sipariş satırıyla eşleşmeli.
    const rawOrder = await request('/ops/save-order', { order: { type: 'sales', contactId: contact, date: now, status: 'confirmed' }, items: [{ productId: raw, quantity: 90, unitPrice: 1 }] });
    const held = await request('/ops/reserve-stock', { productId: raw, quantity: 90, orderId: rawOrder.body.data.orderId });
    assert.equal(held.status, 200, JSON.stringify(held.body));
    const blocked = await request('/ops/create-waybill', { waybill: { type: 'sales', contactId: contact, date: now, status: 'issued' }, items: [{ productId: raw, quantity: 10, unitPrice: 1 }] });
    assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
    assert.equal((await request('/ops/release-reservation', { reservationId: held.body.data.reservationId })).status, 200);
  });
  await test('Satın alma onayı bir kez sipariş oluşturur', async () => {
    const supplier = (await execute("INSERT INTO contacts (name,type,balance,currency) VALUES ('Test tedarikçi','supplier',0,'TRY')")).insertId;
    const purchase = await request('/ops/purchase-request', { supplierId: supplier, items: [{ productId: raw, quantity: 5, unitPrice: 3 }], notes: 'Test üretim ihtiyacı.' });
    assert.equal(purchase.status, 200, JSON.stringify(purchase.body));
    const approved = await request('/ops/decide-purchase', { requestId: purchase.body.data.requestId, decision: 'approved', reason: 'Fiyat ve ihtiyaç uygun.' });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.ok(approved.body.data.orderId);
    assert.equal((await request('/ops/decide-purchase', { requestId: purchase.body.data.requestId, decision: 'approved', reason: 'Tekrar' })).status, 409);
  });
  await test('Eski düzenleme sürümü siparişi ezemez', async () => {
    const draft = await request('/ops/save-order', { order: { type: 'sales', contactId: contact, date: now, status: 'draft' }, items: [{ productId: raw, quantity: 1, unitPrice: 1 }] });
    const id = draft.body.data.orderId;
    assert.equal((await request('/ops/save-order', { id, expectedVersion: 1, order: { notes: 'Birinci düzenleme' } })).status, 200);
    assert.equal((await request('/ops/save-order', { id, expectedVersion: 1, order: { notes: 'Eski sürüm' } })).status, 409);
  });
  await test('Kapalı İK dönemi toplu yazma yolunda da korunur', async () => {
    await execute("INSERT INTO periodLocks (scope,year,month,isLocked) VALUES ('hr',2026,1,1) ON DUPLICATE KEY UPDATE isLocked=1");
    const result = await request('/ops/commit', { mutations: [{ op: 'insert', resource: 'attendanceRecords', data: { employeeId: 999, date: '2026-01-15', month: 1, year: 2026, status: 'present' } }] });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(Number((await queryOne<any>('SELECT COUNT(*) AS n FROM attendanceRecords'))!.n), 0);
  });
  await test('Boş kesinleşmiş muhasebe fişi sunucuda reddedilir', async () => {
    const result = await request('/journalEntries', { entryType: 'mahsup', date: now, status: 'approved', lines: [], totalDebit: 100, totalCredit: 100, isBalanced: true });
    assert.equal(result.status, 422, JSON.stringify(result.body));
  });
  await test('Bordro sunucuda hesaplanır ve kullanılan parametreler saklanır', async () => {
    await execute("INSERT INTO employees (employeeCode,name,department,sgkStatus,salaryType,baseSalary,status) VALUES ('TEST-E','Test çalışan','Üretim','sgk_li','monthly_gross',33030,'active')");
    const result = await request('/ops/generate-payroll', { month: 2, year: 2026 });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.data.length, 1);
    assert.equal(result.body.data[0].netSalary, 28075.5);
    const stored = await queryOne<any>('SELECT * FROM payrollRecords WHERE id=?', [result.body.data[0].id]);
    assert.ok(stored!.parameterSnapshot);
    assert.equal((await request('/payrollRecords', { employeeId: 1, month: 2, year: 2026, netSalary: 1 })).status, 403);
  });
  await test('Varyant stoğu mutlak düzenlemede negatif yapılamaz', async () => {
    const before = await queryOne<any>('SELECT stock FROM products WHERE id=?', [product]);
    const result = await request('/ops/product-variants', { productId: product, stock: -1, variantBarcodes: [] });
    assert.equal(result.status, 400, JSON.stringify(result.body));
    assert.equal(Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [product]))!.stock), Number(before!.stock));
  });
  await test('Kesirli hammadde çıkışı dört ondalık hassasiyetini korur', async () => {
    const before = Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [raw]))!.stock);
    const result = await request('/ops/stock-movement', { productId: raw, quantity: 0.0001, type: 'out', description: 'Hassas sarfiyat testi' });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.ok(Math.abs(Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [raw]))!.stock) - (before - 0.0001)) < 0.000001);
  });
  await test('Çok kalemli talep tüm miktar ve vergileriyle siparişe dönüşür', async () => {
    const supplier = (await execute("INSERT INTO contacts (name,type,currency) VALUES ('Çok kalem tedarikçisi','supplier','TRY')")).insertId;
    const purchase = await request('/ops/purchase-request', { supplierId: supplier, items: [{ productId: raw, quantity: 2.5, unitPrice: 4, taxRate: 20 }, { productId: product, quantity: 3, unitPrice: 10, taxRate: 10 }], notes: 'İki ürünün ortak ihtiyacı' });
    assert.equal(purchase.status, 200, JSON.stringify(purchase.body));
    const approval = await request('/ops/decide-purchase', { requestId: purchase.body.data.requestId, decision: 'approved', reason: 'Kalemler uygun' });
    assert.equal(approval.status, 200, JSON.stringify(approval.body));
    const order = await queryOne<any>('SELECT totalAmount,taxAmount,grandTotal FROM orders WHERE id=?', [approval.body.data.orderId]);
    assert.equal(Number(order!.totalAmount), 40);
    assert.equal(Number(order!.taxAmount), 5);
    assert.equal(Number(order!.grandTotal), 45);
    assert.equal(Number((await queryOne<any>('SELECT COUNT(*) n FROM orderItems WHERE orderId=?', [approval.body.data.orderId]))!.n), 2);
    const invalid = await request('/ops/purchase-request', { supplierId: supplier, items: [{ productId: raw, quantity: 1, unitPrice: 2 }, { productId: product, quantity: 1.5, unitPrice: 10 }], notes: 'Geçersiz ikinci kalem' });
    assert.equal(invalid.status, 400, JSON.stringify(invalid.body));
  });
  await test('Taslak fiş kapamayı engeller; temiz dönem kapanır ve eski sürümle açılamaz', async () => {
    const draft = (await execute("INSERT INTO journalEntries (entryNumber,entryType,date,`lines`,status,createdAt) VALUES ('TEST-CLOSING','mahsup','2026-03-15','[]','draft',NOW())")).insertId;
    const summary = await request('/ops/accounting-period', { month: 3, year: 2026 });
    assert.equal(summary.status, 200, JSON.stringify(summary.body));
    assert.equal(summary.body.data.checks.find((check: any) => check.key === 'draftEntries').count, 1);
    assert.equal((await request('/ops/set-accounting-period', { month: 3, year: 2026, isLocked: true, expectedVersion: 0, reason: 'Kontrol' })).status, 409);
    await execute('DELETE FROM journalEntries WHERE id=?', [draft]);
    const close = await request('/ops/set-accounting-period', { month: 3, year: 2026, isLocked: true, expectedVersion: 0, reason: 'Kontroller tamamlandı' });
    assert.equal(close.status, 200, JSON.stringify(close.body));
    const write = await request('/journalEntries', { entryNumber: 'TEST-CLOSED', entryType: 'mahsup', date: '2026-03-15', lines: [], status: 'draft', createdAt: now });
    assert.equal(write.status, 409, JSON.stringify(write.body));
    assert.equal((await request('/ops/set-accounting-period', { month: 3, year: 2026, isLocked: false, expectedVersion: 1, reason: 'Eski sürüm' })).status, 409);
    const open = await request('/ops/set-accounting-period', { month: 3, year: 2026, isLocked: false, expectedVersion: 2, reason: 'Düzeltme için açıldı' });
    assert.equal(open.status, 200, JSON.stringify(open.body));
  });
  await test('Kesinleşmiş muhasebeleşmemiş fatura kapamayı engeller', async () => {
    await execute("INSERT INTO invoices (invoiceNumber,type,contactId,date,subtotal,grandTotal,status) VALUES ('TEST-UNPOSTED','sales',?,'2026-04-15',10,10,'issued')", [contact]);
    const close = await request('/ops/set-accounting-period', { month: 4, year: 2026, isLocked: true, expectedVersion: 0, reason: 'Aylık kapanış' });
    assert.equal(close.status, 409, JSON.stringify(close.body));
    assert.equal(close.body.code, 'PERIOD_NOT_READY');
    assert.equal((await request('/periodLocks', { scope: 'accounting', year: 2026, month: 4, isLocked: true })).status, 400);
  });
  await test('Muhasebe görüntüleme yetkisi dönem kapatma yetkisi vermez', async () => {
    const role = (await execute('INSERT INTO roles (code,name,permissions) VALUES (?,?,?)', ['test_accounting_view', 'Muhasebe okuma', JSON.stringify({ accounting: { view: true } })])).insertId;
    const user = (await execute("INSERT INTO users (username,fullName,roleId,status) VALUES ('test_period_view','Test görüntüleyici',?,'active')", [role])).insertId;
    const token = createSession({ userId: user }).token;
    const send = (op: string, body: object) => fetch(`${server.baseUrl}/api/ops/${op}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    assert.equal((await send('accounting-period', { month: 3, year: 2026 })).status, 200);
    assert.equal((await send('set-accounting-period', { month: 3, year: 2026, isLocked: true, expectedVersion: 3, reason: 'Yetkisiz kapama' })).status, 403);
  });
  await test('200 satırı aşan toplu değişiklikte her cari için denetim izi oluşur', async () => {
    const rows = Array.from({ length: 205 }, (_, index) => `('TEST-AUDIT-${index}','customer','TRY')`).join(',');
    await execute(`INSERT INTO contacts (name,type,currency) VALUES ${rows}`);
    const result = await request('/ops/commit', {
      mutations: [{ op: 'updateWhere', resource: 'contacts', where: { name: { op: 'startsWith', value: 'TEST-AUDIT-' } }, data: { city: 'İzmir' } }],
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(Number((await queryOne<any>("SELECT COUNT(*) AS n FROM contacts WHERE name LIKE 'TEST-AUDIT-%' AND city='İzmir'"))!.n), 205);
    assert.equal(Number((await queryOne<any>("SELECT COUNT(*) AS n FROM auditLogs a JOIN contacts c ON a.entityId=CAST(c.id AS CHAR) WHERE c.name LIKE 'TEST-AUDIT-%' AND a.action='update' AND a.module='contacts'"))!.n), 205);
  });
  console.log(`${passed} işlem bütünlüğü testi başarılı.`);
} finally { await server.close(); await closePool(); }
