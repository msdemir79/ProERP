/**
 * DMR Nexus Faz 3 — Integration + Concurrency Testleri (item 5, 6).
 *
 * Gerçek HTTP + gerçek MySQL + gerçek RBAC/op yolu üzerinde, harness'ın mint
 * ettiği super_admin oturumuyla koşar. Sertleştirme garantilerini uçtan uca
 * doğrular:
 *   • item 4  — türetilmiş/korumalı finansal alanlar generic INSERT/PATCH'te soyulur
 *   • item 8  — yevmiye fiş no sunucuda üretilir; eşzamanlı isteklerde benzersizdir
 *   • silme   — kademe 2 kayıtlar gerekçe+parola olmadan silinemez (400);
 *               ayrıntılı silme suite'i: npm run test:delete
 *   • item 7  — 5xx yanıtları SQL/stack sızdırmaz (genel mesaj)
 *   • iyimser kilitleme — eşzamanlı PATCH'te tam olarak bir istek kazanır (409)
 *   • stok kartı ekstresi — her renk ayrı hareket satırı alır, color/size kolonları dolu yazılır
 *
 * Çalıştırma: npm run test:integration
 */
import { startTestServer, api, purgeTestResidue, type TestServer } from './harness.js';

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
    toBeTruthy() {
      if (!actual) throw new Error(`Beklenen: truthy, Alınan: ${JSON.stringify(actual)}`);
    },
    toBeNullish() {
      if (actual !== null && actual !== undefined) throw new Error(`Beklenen: null/undefined, Alınan: ${JSON.stringify(actual)}`);
    },
    toMatch(re: RegExp) {
      if (!re.test(String(actual))) throw new Error(`Beklenen: ${re}, Alınan: ${JSON.stringify(actual)}`);
    },
    toBeIn(set: any[]) {
      if (!set.includes(actual)) throw new Error(`Beklenen: ${JSON.stringify(set)} içinden biri, Alınan: ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan(n: number) {
      if (!(actual > n)) throw new Error(`Beklenen: > ${n}, Alınan: ${actual}`);
    },
  };
}

/** Ham yanıt gövdesinde SQL/stack/DB hata sızıntısı olmadığını doğrular. */
function assertNoLeak(text: string): void {
  const lower = text.toLowerCase();
  const banned = ['select ', 'insert into', 'update `', 'foreign key', 'er_no_referenced', 'er_dup_entry', 'sqlmessage', 'at object.', 'at async', 'mysql2'];
  for (const b of banned) {
    if (lower.includes(b)) throw new Error(`Yanıt gövdesinde hassas sızıntı bulundu: "${b}" → ${text.slice(0, 200)}`);
  }
}

const RUN = Date.now();
let srv: TestServer;

async function createContact(label: string): Promise<number> {
  const res = await api(srv, 'POST', '/contacts', {
    name: `TEST-FAZ3 ${label} ${RUN}`,
    code: `TF3-${label}-${RUN}`.slice(0, 40),
    type: 'customer',
  });
  if (res.status !== 201) throw new Error(`Test carisi oluşturulamadı (${res.status}): ${res.text.slice(0, 200)}`);
  return Number((res.data as any)?.data ?? (res.data as any));
}

async function getRow(resource: string, id: number): Promise<any> {
  const res = await api(srv, 'GET', `/${resource}/${id}`);
  if (res.status !== 200) throw new Error(`${resource}/${id} okunamadı (${res.status})`);
  return (res.data as any)?.data;
}

function balancedLines(amount = 100) {
  return [
    { accountCode: '100.01', accountName: 'Kasa', description: 'TEST-FAZ3', debit: amount, credit: 0 },
    { accountCode: '120.01', accountName: 'Alıcılar', description: 'TEST-FAZ3', debit: 0, credit: amount },
  ];
}

async function main(): Promise<void> {
  srv = await startTestServer(1);
  console.log('\n======================================================');
  console.log(' DMR NEXUS FAZ 3 — INTEGRATION + CONCURRENCY TESTLERİ');
  console.log(` Hedef: ${srv.baseUrl} (canlı DB, in-process oturum)`);
  console.log('======================================================\n');

  // ---------------------------------------------------------------
  console.log('📌 A. KORUMALI ALANLAR (item 4) — generic yazım kapısı ve alan soyulması');
  // ---------------------------------------------------------------
  const stripContactId = await createContact('strip');
  let stripTxId = 0;

  await test('transactions generic yazıma kapalı → 403 CONTROLLED_RESOURCE', async () => {
    // Cari hareket bakiyeyi değiştirir; generic INSERT/PATCH bakiyeyi
    // güncellemediği için kapalıdır. Kayıt yalnızca kontrollü uçtan yazılır.
    const ins = await api(srv, 'POST', '/transactions', {
      contactId: stripContactId,
      type: 'income',
      amount: 100,
      date: new Date().toISOString(),
      description: 'TEST-FAZ3 strip INSERT',
      category: 'Tahsilat',
      paymentMethod: 'cash',
      status: 'cancelled',
      reversalOfId: 999,
    });
    expect(ins.status).toBe(403);
    expect((ins.data as any)?.code).toBe('CONTROLLED_RESOURCE');

    const patch = await api(srv, 'PATCH', '/transactions/1', { description: 'TEST-FAZ3 strip PATCH' });
    expect(patch.status).toBe(403);
    expect((patch.data as any)?.code).toBe('CONTROLLED_RESOURCE');

    // /ops/commit de aynı kapıya takılır (ham satır yazımı bypass değil).
    const commit = await api(srv, 'POST', '/ops/commit', {
      mutations: [
        {
          op: 'insert',
          resource: 'transactions',
          data: { contactId: stripContactId, type: 'income', amount: 100, date: new Date().toISOString(), description: 'TEST-FAZ3 commit' },
        },
      ],
    });
    expect(commit.status).toBe(403);
    expect((commit.data as any)?.code).toBe('CONTROLLED_RESOURCE');

    // Kontrollü uç çalışır ve hareketi gerçekten yazar (D bölümü bu kaydı kullanır).
    const ok = await api(srv, 'POST', '/ops/contact-transaction', {
      mode: 'create',
      contactId: stripContactId,
      type: 'income',
      amount: 100,
      date: new Date().toISOString(),
      description: `TEST-FAZ3 hareket ${RUN}`,
      category: 'Tahsilat',
      paymentMethod: 'cash',
    });
    expect(ok.status).toBe(200);
    stripTxId = Number((ok.data as any)?.data?.id);
    expect(stripTxId).toBeGreaterThan(0);
    const row = await getRow('transactions', stripTxId);
    expect(row.status).toBe('posted');
    expect(row.reversalOfId).toBeNullish();
  });

  await test('invoices/invoiceItems generic yazıma kapalı → 403 CONTROLLED_RESOURCE', async () => {
    // Fatura ve satırları yalnızca create/issue/cancel-invoice op'larında (cari +
    // stok + muhasebe ile, satır kilidi altında) yazılır. Generic INSERT/UPDATE ve
    // /ops/commit bu yan etkileri üretmediği için kapalıdır; korumalı alanlar
    // (paidAmount/paymentStatus) bu kapıyla zaten hiç yazılamaz.
    const ins = await api(srv, 'POST', '/invoices', {
      contactId: stripContactId,
      invoiceNumber: `TEST-FAZ3-INV-${RUN}`,
      type: 'sales',
      date: new Date().toISOString(),
      status: 'draft',
      grandTotal: 500,
      paidAmount: 500,
      paymentStatus: 'paid',
    });
    expect(ins.status).toBe(403);
    expect((ins.data as any)?.code).toBe('CONTROLLED_RESOURCE');

    const patch = await api(srv, 'PATCH', '/invoices/1', { grandTotal: 1 });
    expect(patch.status).toBe(403);
    expect((patch.data as any)?.code).toBe('CONTROLLED_RESOURCE');

    const insItem = await api(srv, 'POST', '/invoiceItems', {
      invoiceId: 1,
      productCode: `TEST-FAZ3-${RUN}`,
      quantity: 1,
      unitPrice: 10,
    });
    expect(insItem.status).toBe(403);
    expect((insItem.data as any)?.code).toBe('CONTROLLED_RESOURCE');

    const commit = await api(srv, 'POST', '/ops/commit', {
      mutations: [
        {
          op: 'insert',
          resource: 'invoices',
          data: { contactId: stripContactId, type: 'sales', invoiceNumber: `TEST-FAZ3-C-${RUN}`, grandTotal: 1 },
        },
      ],
    });
    expect(commit.status).toBe(403);
    expect((commit.data as any)?.code).toBe('CONTROLLED_RESOURCE');
  });

  await test('checks/collectionReceipts generic yazıma kapalı → 403 CONTROLLED_RESOURCE', async () => {
    // Çek ve tahsilat makbuzu yalnızca /ops/receipt ile /ops/check-status uçlarında
    // (kasa/banka/cari + muhasebe ile) yazılır; generic yazım bakiyeyi güncellemez.
    const chk = await api(srv, 'POST', '/checks', {
      portfolioNumber: `TEST-FAZ3-CHK-${RUN}`,
      amount: 250,
      status: 'portfolio',
    });
    expect(chk.status).toBe(403);
    expect((chk.data as any)?.code).toBe('CONTROLLED_RESOURCE');

    const rec = await api(srv, 'POST', '/collectionReceipts', {
      receiptNumber: `TEST-FAZ3-RCPT-${RUN}`,
      type: 'collection',
      date: new Date().toISOString(),
      contactId: stripContactId,
      amount: 250,
    });
    expect(rec.status).toBe(403);
    expect((rec.data as any)?.code).toBe('CONTROLLED_RESOURCE');
  });

  await test('Yedek geri yükleme (Süper Admin, FK kapalı) controlledWrites kapısından muaftır', async () => {
    // Anlık görüntü geri yükleme tabloyu boşaltıp yeniden doldurur; bu yüzden
    // disableFkChecks (yalnızca Süper Admin) controlledWrites kapısını bypass eder
    // — tıpkı salt-okunur bağ tablolarında olduğu gibi. TEST- işaretli satır
    // koşu sonunda purgeTestResidue ile temizlenir.
    const res = await api(srv, 'POST', '/ops/commit', {
      disableFkChecks: true,
      mutations: [
        {
          op: 'insertMany',
          resource: 'collectionReceipts',
          rows: [
            {
              receiptNumber: `TEST-FAZ3-RESTORE-${RUN}`,
              type: 'collection',
              date: new Date().toISOString(),
              amount: 10,
              description: 'TEST-FAZ3 restore bypass',
            },
          ],
        },
      ],
    });
    if (res.status !== 200) throw new Error(`Geri yükleme bypass başarısız (${res.status}): ${res.text.slice(0, 200)}`);
  });


  // ---------------------------------------------------------------
  console.log('\n📌 B. SUNUCU TARAFI FİŞ NO + DENGE (item 8)');
  // ---------------------------------------------------------------
  let jeId = 0;

  await test('POST journalEntries: istemci entryNumber yok sayılır, sunucu üretir', async () => {
    const res = await api(srv, 'POST', '/journalEntries', {
      entryType: 'mahsup',
      date: new Date().toISOString(),
      description: 'TEST-FAZ3 fiş no',
      entryNumber: 'HACK-999', // zorlanan — yok sayılmalı
      lines: balancedLines(100),
    });
    expect(res.status).toBe(201);
    jeId = Number((res.data as any)?.data ?? res.data);
    const row = await getRow('journalEntries', jeId);
    expect(row.entryNumber).toMatch(/^YEV-\d{4}-\d{6}$/);
    if (row.entryNumber === 'HACK-999') throw new Error('İstemci entryNumber değeri kabul edildi!');
  });

  await test('POST journalEntries: dengesiz fiş 422 ile reddedilir', async () => {
    const res = await api(srv, 'POST', '/journalEntries', {
      entryType: 'mahsup',
      date: new Date().toISOString(),
      description: 'TEST-FAZ3 dengesiz',
      lines: [
        { accountCode: '100.01', accountName: 'Kasa', debit: 100, credit: 0 },
        { accountCode: '120.01', accountName: 'Alıcılar', debit: 0, credit: 50 },
      ],
    });
    expect(res.status).toBe(422);
    expect((res.data as any)?.code).toBe('UNBALANCED_JOURNAL_ENTRY');
    assertNoLeak(res.text);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 C. EŞZAMANLILIK (item 6/8) — benzersiz fiş no + iyimser kilitleme');
  // ---------------------------------------------------------------
  await test('6 eşzamanlı journalEntries POST → 6 benzersiz fiş no, 500 yok', async () => {
    const reqs = Array.from({ length: 6 }, (_, i) =>
      api(srv, 'POST', '/journalEntries', {
        entryType: 'mahsup',
        date: new Date().toISOString(),
        description: `TEST-FAZ3 conc ${i} ${RUN}`,
        lines: balancedLines(50 + i),
      }),
    );
    const responses = await Promise.all(reqs);
    for (const r of responses) {
      if (r.status !== 201) throw new Error(`Eşzamanlı fiş oluşturulamadı (${r.status}): ${r.text.slice(0, 160)}`);
    }
    const ids = responses.map((r) => Number((r.data as any)?.data ?? r.data));
    const rows = await Promise.all(ids.map((id) => getRow('journalEntries', id)));
    const numbers = rows.map((r) => r.entryNumber);
    const unique = new Set(numbers);
    if (unique.size !== numbers.length) {
      throw new Error(`Fiş numaraları çakıştı: ${numbers.join(', ')}`);
    }
  });

  await test('İyimser kilitleme: eşzamanlı 2 PATCH → tam olarak biri 200, diğeri 409', async () => {
    const cid = await createContact('lock');
    const before = await getRow('contacts', cid);
    const v = Number(before.version);
    expect(v).toBeGreaterThan(0);

    const [a, b] = await Promise.all([
      api(srv, 'PATCH', `/contacts/${cid}`, { description: 'TEST-FAZ3 A', expectedVersion: v }),
      api(srv, 'PATCH', `/contacts/${cid}`, { description: 'TEST-FAZ3 B', expectedVersion: v }),
    ]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(409);
    const loser = a.status === 409 ? a : b;
    expect((loser.data as any)?.code).toBe('VERSION_CONFLICT');

    // Temizlik: bağımlılığı olmayan test carisini sil.
    const del = await api(srv, 'DELETE', `/contacts/${cid}`);
    expect(del.status).toBe(200);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 D. SİLME POLİTİKASI MOTORU — kademe 2 gerekçe/parola kapısı');
  // (Ayrıntılı silme suite'i: npm run test:delete)
  // ---------------------------------------------------------------
  await test('DELETE transactions (kademe 2) gerekçesiz → 400 REASON_REQUIRED', async () => {
    const res = await api(srv, 'DELETE', `/transactions/${stripTxId}`);
    expect(res.status).toBe(400);
    expect((res.data as any)?.code).toBe('REASON_REQUIRED');
    assertNoLeak(res.text);
  });

  await test('DELETE journalEntries (kademe 2) gerekçesiz → 400 REASON_REQUIRED', async () => {
    const res = await api(srv, 'DELETE', `/journalEntries/${jeId}`);
    expect(res.status).toBe(400);
    expect((res.data as any)?.code).toBe('REASON_REQUIRED');
    assertNoLeak(res.text);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 E. HATA TEMİZLİĞİ (item 7) — 5xx SQL/stack sızdırmaz');
  // ---------------------------------------------------------------
  await test('FK ihlali (var olmayan contactId) → 500 genel mesaj, sızıntı yok', async () => {
    // invoices artık controlledWrites olduğu için generic yazımda 403 döner; FK
    // ihlali senaryosu generic yazıma açık bir kaynakla (orders) doğrulanır.
    const res = await api(srv, 'POST', '/orders', {
      contactId: 999999, // var olmayan cari → fk_orders_contact ihlali
      orderNumber: `TEST-FAZ3-FK-${RUN}`,
      type: 'sales',
      date: new Date().toISOString(),
      status: 'draft',
      grandTotal: 1,
    });
    expect(res.status).toBe(500);
    expect((res.data as any)?.error).toBe('Sunucu hatası oluştu. Lütfen tekrar deneyin.');
    assertNoLeak(res.text);
  });

  await test('Bilinmeyen kaynak → 404, sızıntı yok', async () => {
    const res = await api(srv, 'GET', '/olmayan-kaynak');
    expect(res.status).toBe(404);
    assertNoLeak(res.text);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 F. STOK HAREKETİ RENK/BEDEN KOLONLARI — stok kartı ekstresi kırılımı');
  // ---------------------------------------------------------------
  await test('invoice-stock: her renk ayrı hareket satırı alır, color/size kolonları dolu yazılır', async () => {
    // Renkler merkezî karttan çözümlenir; test, kullanıcının renk listesine bağımlı
    // olmasın diye sabit isim yerine listedeki ilk iki renk kullanılır.
    const colorRes = await api(srv, 'GET', '/colors?limit=500');
    const masterColors: any[] = (colorRes.data as any)?.data ?? [];
    if (masterColors.length < 2) {
      throw new Error('Bu test için merkezî renk listesinde en az 2 renk bulunmalı.');
    }
    const [colorA, colorB] = [String(masterColors[0].name), String(masterColors[1].name)];

    const prod = await api(srv, 'POST', '/products', {
      code: `TF3R-${RUN}`,
      name: `TEST-FAZ3 Renk ${RUN}`,
      unit: 'Çift',
      isFootwear: true,
      hasSizeVariants: true,
      colors: [colorA, colorB],
      assortment: [{ size: '40', quantity: 1 }, { size: '41', quantity: 1 }],
      variantBarcodes: [
        { size: '40', color: colorA, barcode: `TF3R${RUN}S40`, stock: 0 },
        { size: '41', color: colorA, barcode: `TF3R${RUN}S41`, stock: 0 },
        { size: '40', color: colorB, barcode: `TF3R${RUN}B40`, stock: 0 },
        { size: '41', color: colorB, barcode: `TF3R${RUN}B41`, stock: 0 },
      ],
    });
    expect(prod.status).toBe(201);
    const productId = Number((prod.data as any)?.data ?? prod.data);
    expect(productId).toBeGreaterThan(0);

    const docNo = `TEST-FAZ3-EXT-${RUN}`;
    const res = await api(srv, 'POST', '/ops/invoice-stock', {
      documentNumber: docNo,
      isSales: false,
      writeLog: true,
      items: [
        { productId, quantity: 10, color: colorA, size: 'Asorti' },
        { productId, quantity: 6, color: colorB, size: '40' },
      ],
    });
    expect(res.status).toBe(200);

    const listRes = await api(srv, 'GET', `/inventoryLogs?search=${encodeURIComponent(docNo)}`);
    expect(listRes.status).toBe(200);
    const rows: any[] = (listRes.data as any)?.data ?? [];
    expect(rows.length).toBe(2); // her renk kendi ekstre satırını alır

    const first = rows.find((r) => r.color === colorA);
    const second = rows.find((r) => r.color === colorB);
    if (!first || !second) {
      throw new Error(`Renk kolonu dolu hareket bulunamadı: ${JSON.stringify(rows.map((r) => ({ color: r.color, size: r.size })))}`);
    }
    expect(first.type).toBe('in');
    expect(Number(first.quantity)).toBe(10);
    expect(first.size).toBe('Asorti');
    expect(second.type).toBe('in');
    expect(Number(second.quantity)).toBe(6);
    expect(second.size).toBe('40');

    // Stok hareketi olan ürün silinemez: hareket defteri ile ürün kartı birlikte
    // korunur (silme motoru guard'ı). Kalıntı koşu sonunda purgeTestResidue ile kalkar.
    const del = await api(srv, 'DELETE', `/products/${productId}`);
    expect(del.status).toBe(409);
    expect((del.data as any)?.code).toBe('HAS_DEPENDENTS');
  });

  // ---------------------------------------------------------------
  console.log('\n======================================================');
  console.log(` INTEGRATION RAPORU: ${passed} BAŞARILI, ${failed} HATALI`);
  console.log('======================================================\n');

  await srv.close();
  await purgeTestResidue('Entegrasyon');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('INTEGRATION TEST HARİCİ HATA:', err);
  try { await srv?.close(); } catch { /* yoksay */ }
  await purgeTestResidue('Entegrasyon');
  process.exit(1);
});
