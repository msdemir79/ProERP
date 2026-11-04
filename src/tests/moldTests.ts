/**
 * DMR Nexus Faz 6 — Kalıp (last) takip modülü testleri.
 *
 * Gerçek HTTP + gerçek MySQL + gerçek RBAC/op yolu üzerinde, harness'ın mint
 * ettiği super_admin oturumuyla koşar. Kalıp modülünün uçtan uca garantilerini
 * doğrular:
 *   • Kalıp kartı  — asorti JSON'undan numara aralığı türetilir, kod otomatik
 *                    üretilir (KLP-####), benzersiz kod çakışması 409 döner.
 *   • Hareket motoru — initial_entry / to_line / to_subcontract / to_maintenance
 *                    kovaları atomik taşır; yetersiz çift 409; fason carisiz 400.
 *   • Sayım düzeltmesi — mutlak değere ayarlar, gerekçe zorunlu, fark yoksa 400.
 *   • Tahsis — fabrika deposu ↔ allocated (iş emri bazlı) çift taşır; özet
 *              allocatedPairs'i günceller; iptal geri alır.
 *   • Özet — totalPairs/factoryPairs/subcontractPairs/maintenancePairs/availablePairs
 *              kova matematiğiyle birebir.
 *   • Hareket defteri kapısı — moldStock/moldMovements generic yazıma kapalı (403).
 *   • Eşzamanlılık — aynı kalıba paralel hareketler satır kilidinde sıraya girer,
 *              fazla çıkış olmaz (tam olarak mevcut kadar başarılı).
 *
 * Çalıştırma: npm run test:mold
 */
import { startTestServer, api, apiWithToken, purgeTestResidue, type TestServer } from './harness.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    HATA: ${err?.message || err}`);
    failed++;
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) throw new Error(`Beklenen: ${JSON.stringify(expected)}, Alınan: ${JSON.stringify(actual)}`);
    },
    toBeClose(expected: number, eps = 1e-6) {
      if (Math.abs(Number(actual) - expected) > eps) throw new Error(`Beklenen: ~${expected}, Alınan: ${actual}`);
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Beklenen: truthy, Alınan: ${JSON.stringify(actual)}`);
    },
    toMatch(re: RegExp) {
      if (!re.test(String(actual))) throw new Error(`Beklenen: ${re}, Alınan: ${JSON.stringify(actual)}`);
    },
  };
}

const RUN = Date.now();
let srv: TestServer;

interface Bucket {
  size: string;
  locationType: string;
  subcontractId: number;
  workOrderId: number;
  pairs: number;
  looseLeft: number;
  looseRight: number;
}

/** Bir kalıbın tüm stok kovalarını çeker. */
async function bucketsOf(moldId: number): Promise<Bucket[]> {
  const where = encodeURIComponent(JSON.stringify({ moldId }));
  const res = await api(srv, 'GET', `/moldStock?where=${where}&limit=500`);
  if (res.status !== 200) throw new Error(`moldStock okunamadı (${res.status}): ${res.text.slice(0, 160)}`);
  const rows: any[] = (res.data as any)?.data ?? [];
  return rows.map((r) => ({
    size: String(r.size),
    locationType: String(r.locationType),
    subcontractId: Number(r.subcontractId) || 0,
    workOrderId: Number(r.workOrderId) || 0,
    pairs: Number(r.pairs) || 0,
    looseLeft: Number(r.looseLeft) || 0,
    looseRight: Number(r.looseRight) || 0,
  }));
}

/** Belirli bir kovadaki çift miktarı (yoksa 0). */
function pairsAt(buckets: Bucket[], size: string, locationType: string, opts: { subcontractId?: number; workOrderId?: number } = {}): number {
  const sub = Number(opts.subcontractId) || 0;
  const wo = Number(opts.workOrderId) || 0;
  const hit = buckets.find(
    (b) => b.size === size && b.locationType === locationType && b.subcontractId === sub && b.workOrderId === wo,
  );
  return hit ? hit.pairs : 0;
}

/** mold-summary içinden bu kalıbın satırını bulur. */
async function summaryRow(moldId: number): Promise<any> {
  const res = await api(srv, 'GET', '/ops/mold-summary');
  if (res.status !== 200) throw new Error(`mold-summary okunamadı (${res.status})`);
  const perMold: any[] = (res.data as any)?.data?.perMold ?? [];
  const row = perMold.find((m) => Number(m.id) === Number(moldId));
  if (!row) throw new Error(`mold-summary içinde kalıp #${moldId} bulunamadı.`);
  return row;
}

async function createProduct(): Promise<number> {
  const res = await api(srv, 'POST', '/products', {
    code: `TM6-${RUN}`,
    name: `TEST-FAZ6 Ürün ${RUN}`,
    unit: 'Çift',
  });
  if (res.status !== 201) throw new Error(`Test ürünü oluşturulamadı (${res.status}): ${res.text.slice(0, 200)}`);
  return Number((res.data as any)?.data ?? res.data);
}

async function createSupplier(): Promise<number> {
  const res = await api(srv, 'POST', '/contacts', {
    name: `TEST-FAZ6 Fason ${RUN}`,
    code: `TM6F-${RUN}`,
    type: 'supplier',
  });
  if (res.status !== 201) throw new Error(`Test fason carisi oluşturulamadı (${res.status}): ${res.text.slice(0, 200)}`);
  return Number((res.data as any)?.data ?? res.data);
}

async function createWorkOrder(productId: number): Promise<number> {
  const res = await api(srv, 'POST', '/workOrders', {
    productId,
    barcode: `TM6WO-${RUN}`,
    quantity: 100,
    currentStage: 'planning',
    customerName: 'TEST-FAZ6',
    documentNo: `TEST-FAZ6-İE-${RUN}`,
  });
  if (res.status !== 201) throw new Error(`Test iş emri oluşturulamadı (${res.status}): ${res.text.slice(0, 200)}`);
  return Number((res.data as any)?.data ?? res.data);
}

async function main(): Promise<void> {
  srv = await startTestServer(1);
  console.log('\n======================================================');
  console.log(' DMR NEXUS FAZ 6 — KALIP TAKİP MODÜLÜ TESTLERİ');
  console.log(` Hedef: ${srv.baseUrl} (canlı DB, in-process oturum)`);
  console.log('======================================================\n');

  const productId = await createProduct();
  const supplierId = await createSupplier();
  const workOrderId = await createWorkOrder(productId);

  // ---------------------------------------------------------------
  console.log('📌 A. KALIP KARTI — asorti JSON, otomatik kod, numara aralığı');
  // ---------------------------------------------------------------
  let moldId = 0;

  await test('POST /molds: kod otomatik KLP-####, sizeRange assortiden türetilir', async () => {
    const res = await api(srv, 'POST', '/molds', {
      name: `TEST-FAZ6 Kalıp ${RUN}`,
      productId,
      moldType: 'TEST',
      assortment: [
        { size: '40', quantity: 1 },
        { size: '41', quantity: 1 },
        { size: '42', quantity: 1 },
      ],
    });
    expect(res.status).toBe(201);
    moldId = Number((res.data as any)?.data ?? res.data);
    expect(moldId).toBeTruthy();
    const row = await api(srv, 'GET', `/molds/${moldId}`);
    const mold: any = (row.data as any)?.data;
    expect(mold.code).toMatch(/^KLP-\d{4}$/);
    expect(mold.sizeRange).toBe('40-42');
  });

  await test('PATCH /molds: asorti değişince sizeRange yeniden türetilir', async () => {
    const res = await api(srv, 'PATCH', `/molds/${moldId}`, {
      assortment: [
        { size: '41', quantity: 2 },
        { size: '42', quantity: 2 },
        { size: '43', quantity: 2 },
        { size: '44', quantity: 2 },
      ],
    });
    expect(res.status).toBe(200);
    const row = await api(srv, 'GET', `/molds/${moldId}`);
    expect(((row.data as any)?.data).sizeRange).toBe('41-44');
  });

  await test('POST /molds: aynı kod ikinci kez → 409 MOLD_CODE_DUPLICATE', async () => {
    const explicit = `TM6D-${RUN}`.slice(0, 40).toLocaleUpperCase('tr');
    const first = await api(srv, 'POST', '/molds', { name: `TEST-FAZ6 Dup ${RUN}`, code: explicit });
    expect(first.status).toBe(201);
    const dup = await api(srv, 'POST', '/molds', { name: `TEST-FAZ6 Dup2 ${RUN}`, code: explicit });
    expect(dup.status).toBe(409);
    expect((dup.data as any)?.code).toBe('MOLD_CODE_DUPLICATE');
  });

  await test('POST /molds: bozuk asorti JSON → 400 INVALID_MOLD_ASSORTMENT', async () => {
    const res = await api(srv, 'POST', '/molds', {
      name: `TEST-FAZ6 Bozuk ${RUN}`,
      assortment: '{geçersiz json',
    });
    expect(res.status).toBe(400);
    expect((res.data as any)?.code).toBe('INVALID_MOLD_ASSORTMENT');
  });

  // ---------------------------------------------------------------
  console.log('\n📌 B. HAREKET MOTORU — kova taşımı, yetersiz çift, fason carisi');
  // ---------------------------------------------------------------
  await test('initial_entry: fabrika deposuna çift girer, özet totalPairs artar', async () => {
    const res = await api(srv, 'POST', '/ops/mold-move', {
      moldId,
      type: 'initial_entry',
      items: [
        { size: '40', pairs: 10 },
        { size: '41', pairs: 5 },
      ],
      description: `TEST-FAZ6 ilk giriş ${RUN}`,
    });
    expect(res.status).toBe(200);
    expect((res.data as any)?.data?.movementNo).toMatch(/^MV-\d{4}-\d{5}$/);
    const b = await bucketsOf(moldId);
    expect(pairsAt(b, '40', 'factory_warehouse')).toBeClose(10);
    expect(pairsAt(b, '41', 'factory_warehouse')).toBeClose(5);
    const sum = await summaryRow(moldId);
    expect(sum.totalPairs).toBeClose(15);
    expect(sum.factoryPairs).toBeClose(15);
  });

  await test('to_line: fabrika deposu azalır, üretim hattı artar', async () => {
    const res = await api(srv, 'POST', '/ops/mold-move', {
      moldId,
      type: 'to_line',
      items: [{ size: '40', pairs: 4 }],
      description: `TEST-FAZ6 hatta transfer ${RUN}`,
    });
    expect(res.status).toBe(200);
    const b = await bucketsOf(moldId);
    expect(pairsAt(b, '40', 'factory_warehouse')).toBeClose(6);
    expect(pairsAt(b, '40', 'factory_line')).toBeClose(4);
  });

  await test('Yetersiz çift → 409 MOLD_INSUFFICIENT', async () => {
    const res = await api(srv, 'POST', '/ops/mold-move', {
      moldId,
      type: 'to_line',
      items: [{ size: '40', pairs: 100 }],
      description: `TEST-FAZ6 fazla çıkış ${RUN}`,
    });
    expect(res.status).toBe(409);
    expect((res.data as any)?.code).toBe('MOLD_INSUFFICIENT');
  });

  await test('to_subcontract carisiz → 400 SUBCONTRACT_REQUIRED', async () => {
    const res = await api(srv, 'POST', '/ops/mold-move', {
      moldId,
      type: 'to_subcontract',
      items: [{ size: '41', pairs: 5 }],
      description: `TEST-FAZ6 fason carisiz ${RUN}`,
    });
    expect(res.status).toBe(400);
    expect((res.data as any)?.code).toBe('SUBCONTRACT_REQUIRED');
  });

  await test('to_subcontract: fason kovası cari bazında oluşur, özet subcontractPairs artar', async () => {
    const res = await api(srv, 'POST', '/ops/mold-move', {
      moldId,
      type: 'to_subcontract',
      toSubcontractId: supplierId,
      items: [{ size: '41', pairs: 5 }],
      description: `TEST-FAZ6 fasona gönderim ${RUN}`,
    });
    expect(res.status).toBe(200);
    const b = await bucketsOf(moldId);
    expect(pairsAt(b, '41', 'factory_warehouse')).toBeClose(0);
    expect(pairsAt(b, '41', 'subcontract', { subcontractId: supplierId })).toBeClose(5);
    const sum = await summaryRow(moldId);
    expect(sum.subcontractPairs).toBeClose(5);
  });

  await test('moldStock generic yazıma kapalı → 403 MOVEMENT_TABLE', async () => {
    const res = await api(srv, 'POST', '/moldStock', { moldId, size: '40', locationType: 'factory_warehouse', pairs: 999 });
    expect(res.status).toBe(403);
    expect((res.data as any)?.code).toBe('MOVEMENT_TABLE');
  });

  await test('Kimliksiz mold-move → 401', async () => {
    const res = await apiWithToken(srv, null, 'POST', '/ops/mold-move', {
      moldId,
      type: 'initial_entry',
      items: [{ size: '40', pairs: 1 }],
      description: 'TEST-FAZ6 kimliksiz',
    });
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 C. SAYIM DÜZELTMESİ — mutlak değer, gerekçe, fark');
  // ---------------------------------------------------------------
  await test('count_adjust gerekçesiz → 400 REASON_REQUIRED', async () => {
    const res = await api(srv, 'POST', '/ops/mold-count-adjust', {
      moldId,
      locationType: 'factory_warehouse',
      items: [{ size: '40', pairs: 8 }],
    });
    expect(res.status).toBe(400);
    expect((res.data as any)?.code).toBe('REASON_REQUIRED');
  });

  await test('count_adjust: kova mutlak sayılan değere ayarlanır (6→8)', async () => {
    const res = await api(srv, 'POST', '/ops/mold-count-adjust', {
      moldId,
      locationType: 'factory_warehouse',
      items: [{ size: '40', pairs: 8 }],
      reason: `TEST-FAZ6 sayım ${RUN}`,
    });
    expect(res.status).toBe(200);
    const b = await bucketsOf(moldId);
    expect(pairsAt(b, '40', 'factory_warehouse')).toBeClose(8);
  });

  await test('count_adjust: fark yoksa → 400 NO_DIFF', async () => {
    const res = await api(srv, 'POST', '/ops/mold-count-adjust', {
      moldId,
      locationType: 'factory_warehouse',
      items: [{ size: '40', pairs: 8 }],
      reason: `TEST-FAZ6 aynı sayım ${RUN}`,
    });
    expect(res.status).toBe(400);
    expect((res.data as any)?.code).toBe('NO_DIFF');
  });

  // ---------------------------------------------------------------
  console.log('\n📌 D. İŞ EMRİNE TAHSİS — allocated kovası ve özet allocatedPairs');
  // ---------------------------------------------------------------
  await test('mold-allocate: fabrika deposu → allocated (iş emri bazlı)', async () => {
    const res = await api(srv, 'POST', '/ops/mold-allocate', {
      moldId,
      workOrderId,
      items: [{ size: '40', pairs: 3 }],
      description: `TEST-FAZ6 tahsis ${RUN}`,
    });
    expect(res.status).toBe(200);
    expect((res.data as any)?.data?.type).toBe('allocate');
    const b = await bucketsOf(moldId);
    expect(pairsAt(b, '40', 'factory_warehouse')).toBeClose(5);
    expect(pairsAt(b, '40', 'allocated', { workOrderId })).toBeClose(3);
    const sum = await summaryRow(moldId);
    expect(sum.allocatedPairs).toBeClose(3);
  });

  await test('mold-allocate: var olmayan iş emri → 404 WORKORDER_NOT_FOUND', async () => {
    const res = await api(srv, 'POST', '/ops/mold-allocate', {
      moldId,
      workOrderId: 999999,
      items: [{ size: '40', pairs: 1 }],
      description: `TEST-FAZ6 olmayan İE ${RUN}`,
    });
    expect(res.status).toBe(404);
    expect((res.data as any)?.code).toBe('WORKORDER_NOT_FOUND');
  });

  await test('mold-allocate: yetersiz serbest çift → 409 MOLD_INSUFFICIENT', async () => {
    const res = await api(srv, 'POST', '/ops/mold-allocate', {
      moldId,
      workOrderId,
      items: [{ size: '40', pairs: 100 }],
      description: `TEST-FAZ6 fazla tahsis ${RUN}`,
    });
    expect(res.status).toBe(409);
    expect((res.data as any)?.code).toBe('MOLD_INSUFFICIENT');
  });

  await test('mold-deallocate: allocated → fabrika deposuna geri, allocatedPairs sıfırlanır', async () => {
    const res = await api(srv, 'POST', '/ops/mold-deallocate', {
      moldId,
      workOrderId,
      items: [{ size: '40', pairs: 3 }],
      description: `TEST-FAZ6 tahsis iptali ${RUN}`,
    });
    expect(res.status).toBe(200);
    expect((res.data as any)?.data?.type).toBe('deallocate');
    const b = await bucketsOf(moldId);
    expect(pairsAt(b, '40', 'factory_warehouse')).toBeClose(8);
    expect(pairsAt(b, '40', 'allocated', { workOrderId })).toBeClose(0);
    const sum = await summaryRow(moldId);
    expect(sum.allocatedPairs).toBeClose(0);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 E. BAKIM + ÖZET BÜTÜNLÜĞÜ — availablePairs = toplam − bakım − hurda');
  // ---------------------------------------------------------------
  await test('to_maintenance + özet: availablePairs bakım kadar düşer', async () => {
    const res = await api(srv, 'POST', '/ops/mold-move', {
      moldId,
      type: 'to_maintenance',
      items: [{ size: '40', pairs: 2 }],
      description: `TEST-FAZ6 bakıma ${RUN}`,
    });
    expect(res.status).toBe(200);
    // Kova dağılımı: fw 40=6, line 40=4, fw 41=0, sub 41=5, bakım 40=2 → toplam 17.
    const sum = await summaryRow(moldId);
    expect(sum.totalPairs).toBeClose(17);
    expect(sum.factoryPairs).toBeClose(10); // fw 6 + line 4
    expect(sum.subcontractPairs).toBeClose(5);
    expect(sum.maintenancePairs).toBeClose(2);
    expect(sum.allocatedPairs).toBeClose(0);
    expect(sum.availablePairs).toBeClose(15); // 17 − 2 bakım − 0 hurda
  });

  // ---------------------------------------------------------------
  console.log('\n📌 F. EŞZAMANLILIK — aynı kalıba paralel hareketler satır kilidinde sıraya girer');
  // ---------------------------------------------------------------
  await test('10 paralel to_line (1er çift, fw=5) → tam 5 başarılı, 5 × 409, hat=5', async () => {
    const cm = await api(srv, 'POST', '/molds', {
      name: `TEST-FAZ6 Conc ${RUN}`,
      productId,
      assortment: [{ size: '40', quantity: 1 }],
    });
    expect(cm.status).toBe(201);
    const concMoldId = Number((cm.data as any)?.data ?? cm.data);

    const seed = await api(srv, 'POST', '/ops/mold-move', {
      moldId: concMoldId,
      type: 'initial_entry',
      items: [{ size: '40', pairs: 5 }],
      description: `TEST-FAZ6 conc seed ${RUN}`,
    });
    expect(seed.status).toBe(200);

    const reqs = Array.from({ length: 10 }, (_, i) =>
      api(srv, 'POST', '/ops/mold-move', {
        moldId: concMoldId,
        type: 'to_line',
        items: [{ size: '40', pairs: 1 }],
        description: `TEST-FAZ6 conc ${i} ${RUN}`,
      }),
    );
    const responses = await Promise.all(reqs);
    const ok = responses.filter((r) => r.status === 200).length;
    const insufficient = responses.filter((r) => r.status === 409 && (r.data as any)?.code === 'MOLD_INSUFFICIENT').length;
    expect(ok).toBe(5);
    expect(insufficient).toBe(5);

    const b = await bucketsOf(concMoldId);
    expect(pairsAt(b, '40', 'factory_warehouse')).toBeClose(0);
    expect(pairsAt(b, '40', 'factory_line')).toBeClose(5);
  });

  // ---------------------------------------------------------------
  console.log('\n======================================================');
  console.log(` KALIP TEST RAPORU: ${passed} BAŞARILI, ${failed} HATALI`);
  console.log('======================================================\n');

  await srv.close();
  await purgeTestResidue('Kalıp');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('KALIP TEST HARİCİ HATA:', err);
  try { await srv?.close(); } catch { /* yoksay */ }
  await purgeTestResidue('Kalıp');
  process.exit(1);
});
