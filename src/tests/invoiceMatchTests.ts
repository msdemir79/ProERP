import assert from 'node:assert/strict';
import { startTestServer } from './harness.js';
import { closePool, execute, queryOne } from '../../server/db.js';

const server = await startTestServer();
let passed = 0;
async function request(op: string, body: object) {
  const response = await fetch(`${server.baseUrl}/api/ops/${op}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${server.token}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}
async function test(name: string, run: () => Promise<void>) { await run(); passed++; console.log(`✓ ${name}`); }
async function countInvoices() { return Number((await queryOne<any>("SELECT COUNT(*) n FROM invoices WHERE invoiceNumber LIKE 'TEST-IM-%'"))!.n); }
async function invoiced(orderItemId: number) { return Number((await queryOne<any>('SELECT invoicedQuantity FROM orderItems WHERE id=?', [orderItemId]))!.invoicedQuantity); }
function invoice(number: string, contactId: number, extras: Record<string, unknown> = {}) {
  return { type: 'purchase', scenario: 'basic', invoiceNumber: `TEST-IM-${number}`, contactId, status: 'issued', date: new Date().toISOString(), isStockDeducted: false, ...extras };
}
function line(productId: number, quantity: number, orderItemId?: number) {
  return { productId, orderItemId, productName: 'Test malzeme', quantity, unitPrice: 10, taxRate: 0 };
}
try {
  const supplier = (await execute("INSERT INTO contacts (name,type,balance,currency) VALUES ('TEST-IM Tedarikçi','supplier',0,'TRY')")).insertId;
  const otherSupplier = (await execute("INSERT INTO contacts (name,type,balance,currency) VALUES ('TEST-IM Diğer tedarikçi','supplier',0,'TRY')")).insertId;
  const product = (await execute("INSERT INTO products (code,name,unit,stock,categoryType) VALUES ('TEST-IM-P','Test malzeme','Metre',100,'raw_material')")).insertId;
  const otherProduct = (await execute("INSERT INTO products (code,name,unit,stock,categoryType) VALUES ('TEST-IM-Q','Başka malzeme','Metre',100,'raw_material')")).insertId;
  const orderId = (await execute("INSERT INTO orders (type,orderNumber,contactId,date,status,currency) VALUES ('purchase','TEST-IM-PO-1',?,NOW(),'confirmed','TRY')", [supplier])).insertId;
  const orderItemId = (await execute('INSERT INTO orderItems (orderId,productId,quantity,unitPrice,taxRate) VALUES (?,?,10,10,0)', [orderId, product])).insertId;
  const otherOrderId = (await execute("INSERT INTO orders (type,orderNumber,contactId,date,status,currency) VALUES ('purchase','TEST-IM-PO-2',?,NOW(),'confirmed','TRY')", [supplier])).insertId;
  const otherOrderItemId = (await execute('INSERT INTO orderItems (orderId,productId,quantity,unitPrice,taxRate) VALUES (?,?,5,10,0)', [otherOrderId, otherProduct])).insertId;
  const dispatchOrderId = (await execute("INSERT INTO orders (type,orderNumber,contactId,date,status,currency) VALUES ('purchase','TEST-IM-PO-DISPATCH',?,NOW(),'confirmed','TRY')", [supplier])).insertId;
  const dispatchOrderItemId = (await execute('INSERT INTO orderItems (orderId,productId,quantity,unitPrice,taxRate) VALUES (?,?,2,10,0)', [dispatchOrderId, product])).insertId;

  await test('Sipariş bağlantılı alış irsaliyesi ISO sevk ve gönderim tarihleriyle kaydedilir', async () => {
    const dispatchDate = new Date().toISOString();
    const shippingDate = new Date().toISOString();
    const result = await request('create-waybill', {
      waybill: { type: 'purchase', contactId: supplier, status: 'issued', date: new Date().toISOString(), dispatchDate, shippingDate, orderId: dispatchOrderId, isStockDeducted: true },
      items: [{ productId: product, orderItemId: dispatchOrderItemId, quantity: 2, unitPrice: 10 }],
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const saved = await queryOne<any>('SELECT dispatchDate, shippingDate FROM waybills WHERE id=?', [result.body.data.waybillId]);
    assert.ok(saved);
    assert.ok(Math.abs(new Date(saved.dispatchDate).getTime() - new Date(dispatchDate).getTime()) < 1000);
    assert.ok(Math.abs(new Date(saved.shippingDate).getTime() - new Date(shippingDate).getTime()) < 1000);
    assert.equal(Number((await queryOne<any>('SELECT shippedQuantity FROM orderItems WHERE id=?', [dispatchOrderItemId]))!.shippedQuantity), 2);
  });
  await test('Geçersiz sevk veya gönderim tarihi belge oluşturmaz', async () => {
    const countBefore = Number((await queryOne<any>('SELECT COUNT(*) n FROM waybills WHERE contactId=?', [supplier]))!.n);
    for (const invalidField of ['dispatchDate', 'shippingDate']) {
      const result = await request('create-waybill', {
        waybill: { type: 'purchase', contactId: supplier, status: 'draft', date: new Date().toISOString(), [invalidField]: 'geçersiz-tarih' },
        items: [{ productId: product, quantity: 1, unitPrice: 10 }],
      });
      assert.equal(result.status, 400, JSON.stringify(result.body));
    }
    assert.equal(Number((await queryOne<any>('SELECT COUNT(*) n FROM waybills WHERE contactId=?', [supplier]))!.n), countBefore);
  });

  await test('Yeni fatura iptal durumda oluşturulamaz; stok, cari ve muhasebe değişmez', async () => {
    const stock = Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [product]))!.stock);
    const balance = Number((await queryOne<any>('SELECT balance FROM contacts WHERE id=?', [supplier]))!.balance);
    const journals = Number((await queryOne<any>("SELECT COUNT(*) n FROM journalEntries WHERE documentType='invoice'"))!.n);
    const result = await request('create-invoice', {
      invoice: invoice('CANCELLED-CREATE', supplier, { status: 'cancelled', isStockDeducted: true }),
      items: [line(product, 2)],
    });
    assert.equal(result.status, 400, JSON.stringify(result.body));
    assert.equal(result.body.code, 'INVALID_INVOICE_STATUS');
    assert.equal(await countInvoices(), 0);
    assert.equal(Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [product]))!.stock), stock);
    assert.equal(Number((await queryOne<any>('SELECT balance FROM contacts WHERE id=?', [supplier]))!.balance), balance);
    assert.equal(Number((await queryOne<any>("SELECT COUNT(*) n FROM journalEntries WHERE documentType='invoice'"))!.n), journals);
  });
  await test('Başka siparişe ait kalem sessiz geçmez; belge ve bakiye oluşmaz', async () => {
    const result = await request('create-invoice', { invoice: invoice('FOREIGN', supplier, { orderId }), items: [line(otherProduct, 1, otherOrderItemId)] });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(result.body.code, 'INVOICE_ORDER_ITEM_MISMATCH');
    assert.equal(await countInvoices(), 0);
    assert.equal(await invoiced(orderItemId), 0);
    assert.equal(Number((await queryOne<any>('SELECT balance FROM contacts WHERE id=?', [supplier]))!.balance), 0);
  });
  await test('Sipariş bağlantılı stok satırı kalem bağı olmadan faturalanamaz', async () => {
    const result = await request('create-invoice', { invoice: invoice('UNLINKED', supplier, { orderId }), items: [line(product, 1)] });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(result.body.code, 'INVOICE_ORDER_ITEM_REQUIRED');
    assert.equal(await countInvoices(), 0);
  });
  await test('Kısmi sipariş faturası kaydedilir', async () => {
    const result = await request('create-invoice', { invoice: invoice('PARTIAL', supplier, { orderId }), items: [line(product, 4, orderItemId)] });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(await invoiced(orderItemId), 4);
    assert.equal(await countInvoices(), 1);
  });
  await test('Kalanı aşan miktar fatura, bakiye ve muhasebe fişi oluşturmadan geri alınır', async () => {
    const balance = Number((await queryOne<any>('SELECT balance FROM contacts WHERE id=?', [supplier]))!.balance);
    const journals = Number((await queryOne<any>("SELECT COUNT(*) n FROM journalEntries WHERE documentType='invoice'"))!.n);
    const result = await request('create-invoice', { invoice: invoice('EXCESS', supplier, { orderId }), items: [line(product, 7, orderItemId)] });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(result.body.code, 'INVOICE_ORDER_QUANTITY_EXCEEDED');
    assert.equal(await countInvoices(), 1);
    assert.equal(await invoiced(orderItemId), 4);
    assert.equal(Number((await queryOne<any>('SELECT balance FROM contacts WHERE id=?', [supplier]))!.balance), balance);
    assert.equal(Number((await queryOne<any>("SELECT COUNT(*) n FROM journalEntries WHERE documentType='invoice'"))!.n), journals);
  });
  await test('Kalan sipariş miktarı ayrıca faturalanabilir', async () => {
    const result = await request('create-invoice', { invoice: invoice('REMAINDER', supplier, { orderId }), items: [line(product, 6, orderItemId)] });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(await invoiced(orderItemId), 10);
  });
  await test('Hatalı taslak kesinleşmez; taslak ve sipariş miktarı korunur', async () => {
    const draft = await request('create-invoice', { invoice: invoice('DRAFT', supplier, { orderId, status: 'draft' }), items: [line(product, 1, orderItemId)] });
    assert.equal(draft.status, 200, JSON.stringify(draft.body));
    const id = draft.body.data.invoiceId;
    const balance = Number((await queryOne<any>('SELECT balance FROM contacts WHERE id=?', [supplier]))!.balance);
    const result = await request('issue-invoice', { invoiceId: id });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(result.body.code, 'INVOICE_ORDER_QUANTITY_EXCEEDED');
    assert.equal((await queryOne<any>('SELECT status FROM invoices WHERE id=?', [id]))!.status, 'draft');
    assert.equal(await invoiced(orderItemId), 10);
    assert.equal(Number((await queryOne<any>('SELECT balance FROM contacts WHERE id=?', [supplier]))!.balance), balance);
  });
  await test('Farklı carinin siparişi faturaya bağlanamaz', async () => {
    const result = await request('create-invoice', { invoice: invoice('CONTACT', otherSupplier, { orderId }), items: [line(product, 1, orderItemId)] });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(result.body.code, 'INVOICE_ORDER_MISMATCH');
  });
  await test('Aynı sipariş kalemi iki fatura satırına bölünerek limit aşılamaz', async () => {
    const result = await request('create-invoice', {
      invoice: invoice('DUPLICATE-LINE', supplier, { orderId: otherOrderId }),
      items: [line(otherProduct, 3, otherOrderItemId), line(otherProduct, 3, otherOrderItemId)],
    });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(result.body.code, 'INVOICE_ORDER_QUANTITY_EXCEEDED');
    assert.equal(await invoiced(otherOrderItemId), 0);
  });
  const receipt = await request('create-waybill', {
    waybill: { type: 'purchase', contactId: supplier, status: 'issued', date: new Date().toISOString(), orderId: otherOrderId, isStockDeducted: true },
    items: [{ productId: otherProduct, orderItemId: otherOrderItemId, quantity: 3, unitPrice: 10 }],
  });
  assert.equal(receipt.status, 200, JSON.stringify(receipt.body));
  const linkedWaybillId = receipt.body.data.waybillId;
  await test('Fatura ve irsaliyenin siparişleri farklıysa işlem reddedilir', async () => {
    const result = await request('create-invoice', {
      invoice: invoice('WB-ORDER', supplier, { orderId, waybillId: linkedWaybillId }),
      items: [line(product, 1, orderItemId)],
    });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(result.body.code, 'INVOICE_WAYBILL_ORDER_MISMATCH');
    assert.equal((await queryOne<any>('SELECT invoicedStatus FROM waybills WHERE id=?', [linkedWaybillId]))!.invoicedStatus, 'not_invoiced');
  });
  const standAloneReceipt = await request('create-waybill', {
    waybill: { type: 'purchase', contactId: supplier, status: 'issued', date: new Date().toISOString(), isStockDeducted: true },
    items: [{ productId: product, quantity: 3, unitPrice: 10 }],
  });
  assert.equal(standAloneReceipt.status, 200, JSON.stringify(standAloneReceipt.body));
  const waybillId = standAloneReceipt.body.data.waybillId;
  await test('Stok hareketi olan irsaliye bağlı faturada ikinci kez stok işletemez', async () => {
    const stock = Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [product]))!.stock);
    const balance = Number((await queryOne<any>('SELECT balance FROM contacts WHERE id=?', [supplier]))!.balance);
    const result = await request('create-invoice', {
      invoice: invoice('WB-DOUBLE-STOCK', supplier, { waybillId, isStockDeducted: true }),
      items: [line(product, 3)],
    });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(result.body.code, 'INVOICE_WAYBILL_STOCK_ALREADY_APPLIED');
    assert.equal(Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [product]))!.stock), stock);
    assert.equal(Number((await queryOne<any>('SELECT balance FROM contacts WHERE id=?', [supplier]))!.balance), balance);
    assert.equal((await queryOne<any>('SELECT invoicedStatus FROM waybills WHERE id=?', [waybillId]))!.invoicedStatus, 'not_invoiced');
  });
  await test('Taslak fatura da ileride çift stok etkisi yaratacak irsaliyeye bağlanamaz', async () => {
    const result = await request('create-invoice', {
      invoice: invoice('WB-DOUBLE-DRAFT', supplier, { waybillId, status: 'draft', isStockDeducted: true }),
      items: [line(product, 3)],
    });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(result.body.code, 'INVOICE_WAYBILL_STOCK_ALREADY_APPLIED');
  });
  await test('İrsaliyeden farklı ürün ve miktar faturalanamaz', async () => {
    const wrongProduct = await request('create-invoice', { invoice: invoice('WB-PRODUCT', supplier, { waybillId }), items: [line(otherProduct, 3)] });
    assert.equal(wrongProduct.status, 409, JSON.stringify(wrongProduct.body));
    assert.equal(wrongProduct.body.code, 'INVOICE_WAYBILL_ITEM_MISMATCH');
    const wrongQuantity = await request('create-invoice', { invoice: invoice('WB-QTY', supplier, { waybillId }), items: [line(product, 2)] });
    assert.equal(wrongQuantity.status, 409, JSON.stringify(wrongQuantity.body));
    assert.equal(wrongQuantity.body.code, 'INVOICE_WAYBILL_QUANTITY_MISMATCH');
    assert.equal((await queryOne<any>('SELECT invoicedStatus FROM waybills WHERE id=?', [waybillId]))!.invoicedStatus, 'not_invoiced');
  });
  await test('İrsaliyeye bağlı hatalı taslak onayda da reddedilir, doğru fatura bağlanır', async () => {
    const draft = await request('create-invoice', { invoice: invoice('WB-DRAFT', supplier, { waybillId, status: 'draft' }), items: [line(product, 2)] });
    assert.equal(draft.status, 200, JSON.stringify(draft.body));
    const issue = await request('issue-invoice', { invoiceId: draft.body.data.invoiceId });
    assert.equal(issue.status, 409, JSON.stringify(issue.body));
    assert.equal((await queryOne<any>('SELECT status FROM invoices WHERE id=?', [draft.body.data.invoiceId]))!.status, 'draft');
    assert.equal((await queryOne<any>('SELECT invoicedStatus FROM waybills WHERE id=?', [waybillId]))!.invoicedStatus, 'not_invoiced');
    const correct = await request('create-invoice', { invoice: invoice('WB-CORRECT', supplier, { waybillId }), items: [line(product, 3)] });
    assert.equal(correct.status, 200, JSON.stringify(correct.body));
    assert.equal((await queryOne<any>('SELECT invoiceId FROM waybills WHERE id=?', [waybillId]))!.invoiceId, correct.body.data.invoiceId);
  });
  await test('Stok işlemi olmayan irsaliyede stok etkisi faturaya bırakılabilir', async () => {
    const stockBefore = Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [otherProduct]))!.stock);
    const waybill = await request('create-waybill', {
      waybill: { type: 'purchase', contactId: supplier, status: 'issued', date: new Date().toISOString(), isStockDeducted: false },
      items: [line(otherProduct, 1)],
    });
    assert.equal(waybill.status, 200, JSON.stringify(waybill.body));
    assert.equal(Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [otherProduct]))!.stock), stockBefore);
    const result = await request('create-invoice', {
      invoice: invoice('WB-INVOICE-STOCK', supplier, { waybillId: waybill.body.data.waybillId, isStockDeducted: true }),
      items: [line(otherProduct, 1)],
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [otherProduct]))!.stock), stockBefore + 1);
  });
  await test('Eski hatalı taslağın kesinleşmesi de çift stok etkisi yaratamaz', async () => {
    const waybill = await request('create-waybill', {
      waybill: { type: 'purchase', contactId: supplier, status: 'issued', date: new Date().toISOString(), isStockDeducted: true },
      items: [line(otherProduct, 1)],
    });
    assert.equal(waybill.status, 200, JSON.stringify(waybill.body));
    const draft = await request('create-invoice', {
      invoice: invoice('WB-LEGACY-DRAFT', supplier, { waybillId: waybill.body.data.waybillId, status: 'draft' }),
      items: [line(otherProduct, 1)],
    });
    assert.equal(draft.status, 200, JSON.stringify(draft.body));
    // Eski sürümden veya elle aktarılmış, iki belgede de stok bayrağı açık taslak.
    await execute('UPDATE invoices SET isStockDeducted=1 WHERE id=?', [draft.body.data.invoiceId]);
    const stockBefore = Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [otherProduct]))!.stock);
    const result = await request('issue-invoice', { invoiceId: draft.body.data.invoiceId });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(result.body.code, 'INVOICE_WAYBILL_STOCK_ALREADY_APPLIED');
    assert.equal((await queryOne<any>('SELECT status FROM invoices WHERE id=?', [draft.body.data.invoiceId]))!.status, 'draft');
    assert.equal(Number((await queryOne<any>('SELECT stock FROM products WHERE id=?', [otherProduct]))!.stock), stockBefore);
  });
  console.log(`${passed} fatura belge eşleştirme testi başarılı.`);
} finally { await server.close(); await closePool(); }
