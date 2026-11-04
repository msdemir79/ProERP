import assert from 'node:assert/strict';
import { startTestServer } from './harness.js';
import { closePool, execute } from '../../server/db.js';

const server = await startTestServer();
async function request(op: string, body: object = {}) {
  const response = await fetch(`${server.baseUrl}/api/ops/${op}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${server.token}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}
function issue(summary: any, id: number) {
  return summary.data.issues.find((entry: any) => Number(entry.id) === id);
}

try {
  const contactId = (await execute("INSERT INTO contacts (name,type,currency) VALUES ('TEST-SCAN-Müşteri','customer','TRY')")).insertId;
  const sizedProduct = (await execute(
    "INSERT INTO products (code,name,unit,stock,categoryType,variantBarcodes) VALUES ('TEST-SCAN-S','TEST-SCAN-Varyant','Çift',13,'finished',?)",
    [JSON.stringify([{ color: 'Siyah', size: '40', stock: 3 }, { color: 'Siyah', size: '41', stock: 10 }])],
  )).insertId;
  const lowProduct = (await execute("INSERT INTO products (code,name,unit,stock) VALUES ('TEST-SCAN-L','TEST-SCAN-Az stok','Adet',1)")).insertId;
  const bulkProduct = (await execute("INSERT INTO products (code,name,unit,stock) VALUES ('TEST-SCAN-B','TEST-SCAN-Toplu','Adet',300)")).insertId;
  const order = async (name: string) => (await execute(
    "INSERT INTO orders (type,orderNumber,contactId,date,status) VALUES ('sales',?,?,NOW(),'confirmed')", [name, contactId],
  )).insertId;
  const sizedOrder = await order('TEST-SCAN-ORDER-S');
  await execute('INSERT INTO orderItems (orderId,productId,color,size,quantity) VALUES (?,?,?,?,?)', [sizedOrder, sizedProduct, 'Siyah', '40', 5]);
  await execute('INSERT INTO orderItems (orderId,productId,color,size,quantity) VALUES (?,?,?,?,?)', [sizedOrder, sizedProduct, 'Siyah', '41', 4]);
  const reserve = async (productId: number, orderId: number | null, quantity: number, color: string | null = null, size: string | null = null) => (await execute(
    'INSERT INTO stockReservations (productId,orderId,color,size,quantity,remainingQuantity,createdBy) VALUES (?,?,?,?,?,?,1)',
    [productId, orderId, color, size, quantity, quantity],
  )).insertId;
  const firstOversized = await reserve(sizedProduct, sizedOrder, 3, 'Siyah', '40');
  const secondOversized = await reserve(sizedProduct, sizedOrder, 3, 'Siyah', '40');
  const healthyVariant = await reserve(sizedProduct, sizedOrder, 2, 'Siyah', '41');
  const unlinked = await reserve(sizedProduct, null, 1);
  const lowOrder = await order('TEST-SCAN-ORDER-L');
  await execute('INSERT INTO orderItems (orderId,productId,quantity) VALUES (?,?,2)', [lowOrder, lowProduct]);
  const overPhysical = await reserve(lowProduct, lowOrder, 2);
  const bulkOrder = await order('TEST-SCAN-ORDER-B');
  await execute('INSERT INTO orderItems (orderId,productId,quantity) VALUES (?,?,200)', [bulkOrder, bulkProduct]);
  const bulkValues = Array.from({ length: 200 }, () => '(?,?,?,?,1,1,1)').join(',');
  const bulkInsert = await execute(
    `INSERT INTO stockReservations (productId,orderId,color,size,quantity,remainingQuantity,createdBy) VALUES ${bulkValues}`,
    Array.from({ length: 200 }, () => [bulkProduct, bulkOrder, null, null]).flat(),
  );
  const unlinkedAfterBulk = await reserve(bulkProduct, null, 1);

  const first = await request('stock-count-summary');
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.data.scanned, 200);
  assert.ok(first.body.data.nextCursor);
  assert.deepEqual(issue(first.body, firstOversized)?.reasons, [
    'Renk/beden rezervasyonu mevcut varyant stoğunu aşıyor.',
    'Rezervasyon siparişin kalan miktarını aşıyor veya satır değişmiş.',
  ]);
  assert.deepEqual(issue(first.body, secondOversized)?.reasons, issue(first.body, firstOversized)?.reasons);
  assert.equal(issue(first.body, healthyVariant), undefined);
  assert.deepEqual(issue(first.body, unlinked)?.reasons, ['Bağlı süreç kapalı veya stok ihtiyacı sona ermiş.']);
  assert.deepEqual(issue(first.body, overPhysical)?.reasons, ['Ürünün toplam rezervasyonu fiziksel stoktan fazla.']);
  const second = await request('stock-count-summary', { afterId: first.body.data.nextCursor });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.data.scanned, 6);
  assert.equal(second.body.data.nextCursor, null);
  assert.deepEqual(issue(second.body, unlinkedAfterBulk)?.reasons, ['Bağlı süreç kapalı veya stok ihtiyacı sona ermiş.']);
  const noOrders = await request('stock-count-summary', { afterId: bulkInsert.insertId + 199 });
  assert.equal(noOrders.status, 200, JSON.stringify(noOrders.body));
  assert.equal(noOrders.body.data.scanned, 1);
  assert.equal(issue(noOrders.body, unlinkedAfterBulk)?.id, unlinkedAfterBulk);

  assert.equal((await request('reconcile-reservation', { id: healthyVariant, expectedRemaining: 2, reason: 'Geçerlilik kontrolü' })).status, 409);
  const released = await request('reconcile-reservation', { id: firstOversized, expectedRemaining: 3, reason: 'Fazla ayrılan miktar' });
  assert.equal(released.status, 200, JSON.stringify(released.body));
  const afterRelease = await request('stock-count-summary');
  assert.equal(afterRelease.status, 200, JSON.stringify(afterRelease.body));
  assert.equal(issue(afterRelease.body, secondOversized), undefined);
  assert.ok(issue(afterRelease.body, overPhysical));
  console.log('✓ Toplu rezervasyon taraması ve kilitli tek kayıt uzlaştırması başarılı.');
} finally {
  await server.close();
  await closePool();
}
