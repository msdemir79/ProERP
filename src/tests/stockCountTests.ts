import assert from 'node:assert/strict';
import { startTestServer } from './harness.js';
import { execute, queryOne, closePool } from '../../server/db.js';
import { createSession } from '../../server/auth.js';

const server = await startTestServer();
let passed = 0;
async function request(op: string, body: object = {}, token = server.token, key?: string) {
  const response = await fetch(`${server.baseUrl}/api/ops/${op}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}
async function test(name: string, run: () => Promise<void>) { await run(); passed++; console.log(`✓ ${name}`); }
async function stock(id: number) { return Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [id]))!.stock); }
async function snapshot(id: number) { const result = await request('stock-count-product', { productId: id }); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body.data; }
async function create(items: object[], token = server.token) { const result = await request('create-stock-count', { items, notes: 'İzole test sayımı' }, token); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body.data.id; }
async function line(id: number, countedQuantity: number) { const p = await snapshot(id); return { productId: id, expectedVersion: p.version, countedQuantity }; }
async function approve(id: number, token = server.token, key?: string) { return request('decide-stock-count', { id, expectedVersion: 1, decision: 'approved', reason: 'Fiziksel sayım doğrulandı' }, token, key); }
try {
  const raw = (await execute("INSERT INTO products (code,name,unit,stock,categoryType) VALUES ('TEST-COUNT-R','Sayım malzemesi','Metre',20,'raw_material')")).insertId;
  const shoes = (await execute("INSERT INTO products (code,name,unit,stock,categoryType,variantBarcodes) VALUES ('TEST-COUNT-S','Sayım ayakkabısı','Çift',5,'finished',?)", [JSON.stringify([{ color: 'Siyah', size: '40', stock: 2, barcode: 'S40' }, { color: 'Siyah', size: '41', stock: 3, barcode: 'S41' }])])).insertId;
  await test('Sayım taslağı stok değiştirmez; onay ve tekrar isteği farkı bir kez işler', async () => {
    const id = await create([await line(raw, 18.125)]);
    assert.equal(await stock(raw), 20);
    const first = await approve(id, server.token, 'stock-count-approval-replay-001');
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal((await approve(id, server.token, 'stock-count-approval-replay-001')).status, 200);
    assert.equal(await stock(raw), 18.125);
    assert.equal(Number((await queryOne<any>('SELECT COUNT(*) n FROM inventoryLogs WHERE productId=?', [raw]))!.n), 1);
    assert.equal((await approve(id)).status, 409);
  });
  await test('Renk/beden farkları toplam değişmese bile ayrı hareketlere yazılır', async () => {
    const p = await snapshot(shoes);
    const id = await create([{ productId: shoes, expectedVersion: p.version, variants: [{ color: 'Siyah', size: '40', stock: 1 }, { color: 'Siyah', size: '41', stock: 4 }] }]);
    const result = await approve(id); assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(await stock(shoes), 5);
    assert.equal(Number((await queryOne<any>('SELECT COUNT(*) n FROM inventoryLogs WHERE productId=?', [shoes]))!.n), 2);
    const updated = await snapshot(shoes); assert.equal(updated.variantBarcodes[0].barcode, 'S40'); assert.equal(updated.variantBarcodes[1].stock, 4);
  });
  await test('Değişmiş ikinci ürün tüm sayım onayını geri alır', async () => {
    const p = await snapshot(shoes);
    const id = await create([await line(raw, 17), { productId: shoes, expectedVersion: p.version, variants: p.variantBarcodes }]);
    await execute('UPDATE products SET version=version+1 WHERE id=?', [shoes]);
    const result = await approve(id); assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(await stock(raw), 18.125);
    assert.equal((await queryOne<any>('SELECT status FROM stockCounts WHERE id=?', [id]))!.status, 'pending');
    assert.equal((await request('decide-stock-count', { id, expectedVersion: 1, decision: 'rejected', reason: 'Yeniden sayılacak' })).status, 200);
  });
  await test('Eksik varyant ve kesirli çift sunucuda reddedilir', async () => {
    const p = await snapshot(shoes);
    const partial = await request('create-stock-count', { notes: 'Eksik beden', items: [{ productId: shoes, expectedVersion: p.version, variants: [{ color: 'Siyah', size: '40', stock: 1 }] }] });
    assert.equal(partial.status, 400);
    const fractional = await request('create-stock-count', { notes: 'Kesirli çift', items: [{ productId: shoes, expectedVersion: p.version, variants: p.variantBarcodes.map((v: any) => ({ ...v, stock: 1.5 })) }] });
    assert.equal(fractional.status, 400);
  });
  const contact = (await execute("INSERT INTO contacts (name,type,currency) VALUES ('Sayım test müşteri','customer','TRY')")).insertId;
  const order = await request('save-order', { order: { type: 'sales', contactId: contact, status: 'confirmed' }, items: [{ productId: raw, quantity: 10, unitPrice: 1 }] });
  assert.equal(order.status, 200, JSON.stringify(order.body));
  const reserve = await request('reserve-stock', { productId: raw, orderId: order.body.data.orderId, quantity: 10 });
  assert.equal(reserve.status, 200, JSON.stringify(reserve.body));
  await test('Toplam rezervasyon sipariş ihtiyacını aşamaz', async () => {
    const extra = await request('reserve-stock', { productId: raw, orderId: order.body.data.orderId, quantity: 1 });
    assert.equal(extra.status, 409, JSON.stringify(extra.body));
  });
  await test('Sayım aktif rezervasyon miktarının altına stok düşüremez', async () => {
    const id = await create([await line(raw, 8)]);
    const result = await approve(id); assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(result.body.code, 'RESERVED_STOCK'); assert.equal(await stock(raw), 18.125);
  });
  await test('Geçerli rezervasyon uzlaştırma ile serbest bırakılamaz', async () => {
    const result = await request('reconcile-reservation', { id: reserve.body.data.reservationId, expectedRemaining: 10, reason: 'Kontrol' });
    assert.equal(result.status, 409, JSON.stringify(result.body));
  });
  await test('Kapalı sipariş rezervasyonu tespit edilip gerekçeli serbest bırakılır', async () => {
    await execute("UPDATE orders SET status='cancelled' WHERE id=?", [order.body.data.orderId]);
    const summary = await request('stock-count-summary'); assert.equal(summary.status, 200, JSON.stringify(summary.body));
    assert.ok(summary.body.data.issues.some((issue: any) => issue.id === reserve.body.data.reservationId));
    const result = await request('reconcile-reservation', { id: reserve.body.data.reservationId, expectedRemaining: 10, reason: 'Sipariş iptal edildi' });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(await stock(raw), 18.125);
    assert.equal((await queryOne<any>('SELECT status FROM stockReservations WHERE id=?', [reserve.body.data.reservationId]))!.status, 'released');
  });
  await test('Kapalı muhasebe dönemi sayım onayını engeller', async () => {
    const id = await create([await line(raw, 18)]); const now = new Date();
    await execute("UPDATE periodLocks SET isLocked=1 WHERE scope='accounting' AND year=? AND month=?", [now.getFullYear(), now.getMonth() + 1]);
    assert.equal((await approve(id)).status, 409);
    await execute("UPDATE periodLocks SET isLocked=0 WHERE scope='accounting'");
  });
  await test('Kullanıcı kendi sayımını onaylayamaz ve görüntüleyici sayım oluşturamaz', async () => {
    const role = (await execute('INSERT INTO roles (code,name,permissions) VALUES (?,?,?)', ['test_count', 'Test sayım', JSON.stringify({ inventory: { view: true, edit: true, approve: true } })])).insertId;
    const user = (await execute("INSERT INTO users (username,fullName,roleId,status) VALUES ('test_count','Test sayımcı',?,'active')", [role])).insertId;
    const token = createSession({ userId: user }).token;
    const id = await create([await line(raw, 18)], token); assert.equal((await approve(id, token)).status, 403);
    await execute('UPDATE roles SET permissions=? WHERE id=?', [JSON.stringify({ inventory: { view: true } }), role]);
    const viewerToken = createSession({ userId: user }).token;
    assert.equal((await request('create-stock-count', { notes: 'Yetkisiz', items: [await line(raw, 18)] }, viewerToken)).status, 403);
  });
  await test('Eski sayımlar sayfalama ile kayıpsız erişilebilir', async () => {
    for (let i = 0; i < 101; i++) await execute("INSERT INTO stockCounts (countNumber,items,notes,createdBy) VALUES (?,'[]','Sayfalama testi',1)", [`TEST-PAGE-${i}`]);
    const first = await request('stock-count-summary');
    assert.equal(first.status, 200); assert.equal(first.body.data.counts.length, 100);
    const second = await request('stock-count-summary', { beforeCountId: first.body.data.nextCountCursor });
    assert.equal(second.status, 200);
    assert.ok(second.body.data.counts.some((row: any) => row.countNumber === 'TEST-PAGE-0'));
    const ids = new Set(first.body.data.counts.map((row: any) => row.id));
    assert.ok(second.body.data.counts.every((row: any) => !ids.has(row.id)));
    assert.equal((await request('stock-count-summary', { beforeCountId: -1 })).status, 400);
  });
  console.log(`${passed} stok sayım ve uzlaştırma testi başarılı.`);
} finally { await server.close(); await closePool(); }
