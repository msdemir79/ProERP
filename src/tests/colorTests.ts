/**
 * DMR Nexus — Merkezi Renk Tanımlama Modülü testleri (şartname §20: Test 1–14).
 *
 * İki katman vardır:
 *   A) Birim — saf doğrulama/türetme fonksiyonları (DB gerektirmez):
 *      canonicalColorName, hexToRgb, normalizeColorPayload, hexFromColorRefs.
 *   B) Entegrasyon — harness'ın mint ettiği oturumlarla gerçek HTTP + gerçek
 *      MySQL + gerçek RBAC/audit yolu: Test 1–12.
 *
 * Test 13 (frontend build) ve Test 14 (backend testleri) bu dosyanın değil
 * doğrulama koşusunun konusudur: `npm run build`, `npm run test`,
 * `npm run test:integration` ve `npm run test:colors` çıktısı birlikte raporlanır.
 *
 * RBAC senaryosu (Test 10) sales_manager rolüyle koşar (userId 2): colors
 * modülünde view=true, create/edit/delete=false.
 *
 * Testler canlı DB'ye karşı koşar. Renk bir ana karttır: hiçbir yerde
 * referanslı değilse silme politikası motoru kademe 0 ile parolasız siler;
 * referanslıysa guard 409 COLOR_IN_USE döner ve kart PASİFE çekilir
 * ('TEST-RENK' önekiyle işaretli kalır). Test ürünleri silinmeye çalışılır;
 * stok hareketi olanlar guard ile korunur. Koşu sonunda `purgeTestResidue`
 * işaretli test verisini (ürün, renk, hareket) veritabanından kaldırır.
 *
 * Çalıştırma: npm run test:colors
 */
import { startTestServer, api, purgeTestResidue, type TestServer } from './harness.js';
import { canonicalColorName, foldTurkishName, hexToRgb, normalizeColorPayload } from '../../server/colorService.js';
import { HttpError } from '../../server/errors.js';
import { hexFromColorRefs } from '../lib/colorSwatches.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
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
    toMatch(re: RegExp) {
      if (!re.test(String(actual))) throw new Error(`Beklenen: ${re}, Alınan: ${JSON.stringify(actual)}`);
    },
    toBeIn(set: any[]) {
      if (!set.includes(actual)) throw new Error(`Beklenen: ${JSON.stringify(set)} içinden biri, Alınan: ${JSON.stringify(actual)}`);
    },
    toContain(item: any) {
      if (!Array.isArray(actual) || !actual.includes(item)) {
        throw new Error(`Beklenen: ${JSON.stringify(item)} içermeli, Alınan: ${JSON.stringify(actual)}`);
      }
    },
  };
}

/** Senkron doğrulama fonksiyonlarının beklenen HttpError'ı fırlattığını kanıtlar. */
function expectHttpError(fn: () => void, status: number, code: string): void {
  try {
    fn();
  } catch (err) {
    if (!(err instanceof HttpError)) throw new Error(`HttpError bekleniyordu, gelen: ${(err as Error)?.message}`);
    if (err.status !== status) throw new Error(`Beklenen durum: ${status}, Alınan: ${err.status}`);
    if (err.code !== code) throw new Error(`Beklenen kod: ${code}, Alınan: ${err.code}`);
    return;
  }
  throw new Error(`Hata fırlatılmadı (beklenen: ${status} ${code})`);
}

const RUN = Date.now();
/** Test renk adları bu önekle başlar; gerçek renk kartlarından ayrıştırılabilir. */
const P = 'TEST-RENK';

let srv: TestServer;      // super_admin (userId 1) — tam yetki
let limited: TestServer;  // sales_manager (userId 2) — colors yazma yetkisi yok

const createdColorIds: number[] = [];
const createdProductIds: number[] = [];

function bodyId(res: { data: any }): number {
  return Number(res.data?.data ?? res.data);
}

async function getColor(id: number): Promise<any> {
  const res = await api(srv, 'GET', `/colors/${id}`);
  if (res.status !== 200) throw new Error(`colors/${id} okunamadı (${res.status}): ${res.text.slice(0, 160)}`);
  return (res.data as any)?.data;
}

async function getProduct(id: number): Promise<any> {
  const res = await api(srv, 'GET', `/products/${id}`);
  if (res.status !== 200) throw new Error(`products/${id} okunamadı (${res.status}): ${res.text.slice(0, 160)}`);
  return (res.data as any)?.data;
}

async function createColor(payload: Record<string, any>): Promise<number> {
  const res = await api(srv, 'POST', '/colors', payload);
  if (res.status !== 201) throw new Error(`Test rengi oluşturulamadı (${res.status}): ${res.text.slice(0, 200)}`);
  const id = bodyId(res);
  createdColorIds.push(id);
  return id;
}

async function createProduct(payload: Record<string, any>): Promise<number> {
  const res = await api(srv, 'POST', '/products', { unit: 'Çift', ...payload });
  if (res.status !== 201) throw new Error(`Test ürünü oluşturulamadı (${res.status}): ${res.text.slice(0, 200)}`);
  const id = bodyId(res);
  createdProductIds.push(id);
  return id;
}

function whereUrl(resource: string, where: Record<string, any>): string {
  return `/${resource}?where=${encodeURIComponent(JSON.stringify(where))}`;
}

async function main(): Promise<void> {
  // =================================================================
  console.log('\n======================================================');
  console.log(' DMR NEXUS — MERKEZİ RENK MODÜLÜ TESTLERİ (şartname §20)');
  console.log('======================================================\n');

  // -----------------------------------------------------------------
  console.log('📌 A. BİRİM TESTLERİ — saf doğrulama/türetme fonksiyonları');
  // -----------------------------------------------------------------
  await test('Renk adı tek biçime iner: "siyah"/"Siyah"/"  SİYAH " → "SİYAH"', () => {
    expect(canonicalColorName('siyah')).toBe('SİYAH');
    expect(canonicalColorName('Siyah')).toBe('SİYAH');
    expect(canonicalColorName('  SİYAH   ')).toBe('SİYAH');
    expect(canonicalColorName('kırık   beyaz')).toBe('KIRIK BEYAZ');
    expect(canonicalColorName('')).toBe('');
    expect(canonicalColorName(null)).toBe('');
  });

  await test('Türkçe katlama: "SIYAH" ile "SİYAH" aynı anahtara iner (kart eşleştirme anahtarı)', () => {
    expect(foldTurkishName('SIYAH')).toBe(foldTurkishName('Siyah'));
    expect(foldTurkishName('SİYAH')).toBe('SIYAH');
    expect(foldTurkishName(' Şeftali ')).toBe('SEFTALI');
    expect(foldTurkishName('Kırık Beyaz')).toBe('KIRIK BEYAZ');
  });

  await test('RGB yalnızca HEX\'ten türetilir', () => {
    expect(hexToRgb('#1A2B3C')).toBe('26, 43, 60');
    expect(hexToRgb('#FFFFFF')).toBe('255, 255, 255');
    expect(hexToRgb('#000000')).toBe('0, 0, 0');
  });

  await test('Geçerli HEX büyük harfe normalize edilir, istemci rgbCode\'u yok sayılır', () => {
    const data: Record<string, any> = { name: '  lacivert ', hexCode: '#1a2b3c', rgbCode: '0, 0, 0' };
    normalizeColorPayload(data);
    expect(data.name).toBe('LACİVERT');
    expect(data.hexCode).toBe('#1A2B3C');
    expect(data.rgbCode).toBe('26, 43, 60'); // HEX ile çelişen istemci değeri ezildi
  });

  await test('hexCode verilmediğinde rgbCode istemciden yazılamaz; boş HEX ikisini de null yapar', () => {
    const forged: Record<string, any> = { name: 'SİYAH', rgbCode: '1, 2, 3' };
    normalizeColorPayload(forged);
    expect('rgbCode' in forged).toBe(false);

    const cleared: Record<string, any> = { name: 'SİYAH', hexCode: '   ', rgbCode: '9, 9, 9' };
    normalizeColorPayload(cleared);
    expect(cleared.hexCode).toBe(null);
    expect(cleared.rgbCode).toBe(null);
  });

  await test('Geçersiz HEX biçimleri reddedilir (000000 / #00000 / #GGGGGG / #FFF)', () => {
    for (const bad of ['000000', '#00000', '#GGGGGG', '#FFF', '#1234567', 'rgb(1,2,3)']) {
      expectHttpError(() => normalizeColorPayload({ name: 'SİYAH', hexCode: bad }), 422, 'INVALID_HEX_CODE');
    }
  });

  await test('Renk adı zorunlu, 100 karakterle sınırlı; kod biçimi doğrulanır', () => {
    expectHttpError(() => normalizeColorPayload({ name: '   ' }), 400, 'COLOR_NAME_REQUIRED');
    expectHttpError(() => normalizeColorPayload({ name: 'A'.repeat(101) }), 400, 'COLOR_NAME_TOO_LONG');
    expectHttpError(() => normalizeColorPayload({ name: 'SİYAH', code: '-R1' }), 400, 'INVALID_COLOR_CODE');
    expectHttpError(() => normalizeColorPayload({ name: 'SİYAH', code: 'R#1' }), 400, 'INVALID_COLOR_CODE');

    const coded: Record<string, any> = { name: 'TABA', code: 'taba-01' };
    normalizeColorPayload(coded);
    expect(coded.code).toBe('TABA-01');

    const blank: Record<string, any> = { name: 'TABA', code: '   ' };
    normalizeColorPayload(blank);
    expect('code' in blank).toBe(false); // boş kod → sunucu sıradaki kodu üretir
  });

  await test('hexFromColorRefs: kart HEX\'i Türkçe harf duyarsız eşleşir, yoksa undefined', () => {
    const refs = [{ name: 'SİYAH', hexCode: '#0F172A' }, { name: 'KIRMIZI', hexCode: null }];
    expect(hexFromColorRefs(refs, 'siyah')).toBe('#0F172A');
    expect(hexFromColorRefs(refs, ' Kırmızı ')).toBe(undefined); // HEX\'i olmayan kart
    expect(hexFromColorRefs(refs, 'BEYAZ')).toBe(undefined);      // kartı olmayan ad
    expect(hexFromColorRefs([], 'SİYAH')).toBe(undefined);
    expect(hexFromColorRefs(undefined, 'SİYAH')).toBe(undefined);
  });

  // -----------------------------------------------------------------
  console.log('\n📌 B. ENTEGRASYON TESTLERİ — HTTP + MySQL + RBAC + audit');
  console.log('   (hazırlık: test sunucuları başlatılıyor)');
  // -----------------------------------------------------------------
  srv = await startTestServer(1);
  limited = await startTestServer(2);
  console.log(`   Hedef: ${srv.baseUrl} (super_admin) / ${limited.baseUrl} (sales_manager)\n`);

  let navyId = 0;      // Test 1'de oluşturulan renk
  let navyCode = '';
  let hakiId = 0;      // ürüne bağlanacak renk
  let hakiName = '';
  let unusedId = 0;    // hiçbir yere bağlanmayan renk
  let productId = 0;   // haki rengine bağlı test ürünü

  await test('Test 1 — Yeni renk oluşturulabiliyor (kod otomatik, RGB sunucuda, varsayılan aktif)', async () => {
    navyId = await createColor({
      name: `${P} LACIVERT ${RUN}`,
      groupName: `${P} GRUP`,
      hexCode: '#1a2b3c',
      pantoneCode: '19-4052 TCX',
      manufacturerCode: `NAV-${RUN}`,
      description: 'TEST-FAZ renk modülü',
    });
    const row = await getColor(navyId);
    expect(row.name).toBe(`${P} LACIVERT ${RUN}`);
    expect(row.code).toMatch(/^R-\d{4}$/);
    navyCode = row.code;
    expect(row.hexCode).toBe('#1A2B3C');
    expect(row.rgbCode).toBe('26, 43, 60');
    expect(row.pantoneCode).toBe('19-4052 TCX');
    expect(Boolean(row.isActive)).toBe(true);
  });

  await test('Test 2 — Aynı code ile ikinci renk oluşturulamıyor (409 COLOR_CODE_DUPLICATE)', async () => {
    const dup = await api(srv, 'POST', '/colors', { name: `${P} KOPYA ${RUN}`, code: navyCode });
    expect(dup.status).toBe(409);
    expect((dup.data as any)?.code).toBe('COLOR_CODE_DUPLICATE');

    // Güncelleme yolu da aynı kilide tabi: başka rengin koduna geçilemez.
    const other = await createColor({ name: `${P} KOPYA KOD ${RUN}`, hexCode: '#4D7C0F' });
    const patch = await api(srv, 'PATCH', `/colors/${other}`, { code: navyCode });
    expect(patch.status).toBe(409);
    expect((patch.data as any)?.code).toBe('COLOR_CODE_DUPLICATE');

    // Manuel kod geçerliyse kabul edilir ve R-#### sayacını bozmaz.
    const manual = await api(srv, 'POST', '/colors', { name: `${P} TABA ${RUN}`, code: `TABA-${RUN}` });
    expect(manual.status).toBe(201);
    createdColorIds.push(bodyId(manual));
    expect((await getColor(bodyId(manual))).code).toBe(`TABA-${RUN}`);
  });

  await test('Test 3 — Geçersiz HEX kabul edilmiyor (422 INVALID_HEX_CODE)', async () => {
    for (const bad of ['000000', '#00000', '#GGGGGG', '#FFF']) {
      const res = await api(srv, 'POST', '/colors', { name: `${P} BOZUK ${RUN}`, hexCode: bad });
      expect(res.status).toBe(422);
      expect((res.data as any)?.code).toBe('INVALID_HEX_CODE');
    }
    // HEX ile çelişen rgbCode istemciden kabul edilmez, sunucu HEX'ten türetir.
    const id = await createColor({ name: `${P} KIRMIZI ${RUN}`, hexCode: '#FF0000', rgbCode: '0, 0, 255' });
    expect((await getColor(id)).rgbCode).toBe('255, 0, 0');
  });

  await test('Test 4 — Renk güncellenebiliyor; ad değişimi ürün kartına yayılıyor', async () => {
    hakiId = await createColor({ name: `${P} HAKI ${RUN}`, hexCode: '#4D7C0F' });
    hakiName = `${P} HAKI ${RUN}`;
    productId = await createProduct({
      code: `TRP-${RUN}`,
      name: `${P} ÜRÜN ${RUN}`,
      isFootwear: true,
      hasSizeVariants: true,
      colorIds: [hakiId],
      variantBarcodes: [
        { size: '40', color: hakiName, barcode: `TRP${RUN}H40`, stock: 5 },
        { size: '41', color: hakiName, barcode: `TRP${RUN}H41`, stock: 5 },
      ],
    });

    const newName = `${P} HAKI YENİ ${RUN}`;
    const res = await api(srv, 'PATCH', `/colors/${hakiId}`, {
      name: newName,
      groupName: `${P} GRUP`,
      hexCode: '#3F6212',
      manufacturerCode: `HAK-${RUN}`,
    });
    expect(res.status).toBe(200);

    const row = await getColor(hakiId);
    expect(row.name).toBe(canonicalColorName(newName));
    expect(row.hexCode).toBe('#3F6212');
    expect(row.rgbCode).toBe('63, 98, 18'); // HEX değişince RGB yeniden türetildi
    expect(row.manufacturerCode).toBe(`HAK-${RUN}`);

    // Ürün kartı: bağ korundu, ad ve barkod JSON'ları yeni ada geçti.
    const product = await getProduct(productId);
    expect(product.colorRefs.length).toBe(1);
    expect(product.colorRefs[0].name).toBe(canonicalColorName(newName));
    expect(product.colorRefs[0].hexCode).toBe('#3F6212');
    expect(product.variantBarcodes.every((v: any) => v.color === canonicalColorName(newName))).toBe(true);
    hakiName = canonicalColorName(newName);
  });

  await test('Test 5 — Kullanılan renk silinemiyor, kullanılmayan renk parolasız siliniyor', async () => {
    // Silme politikası motoru: renk bir ana karttır. Referanslıysa guard (409),
    // referanssızsa kademe 0 — parola/gerekçe istenmez.
    const used = await api(srv, 'DELETE', `/colors/${hakiId}`);
    expect(used.status).toBe(409);
    expect((used.data as any)?.code).toBe('COLOR_IN_USE');

    unusedId = await createColor({ name: `${P} KULLANILMAYAN ${RUN}` });

    const plan = await api(srv, 'GET', `/colors/delete-plan/${unusedId}`);
    expect((plan.data as any)?.data?.tier).toBe(0);
    expect((plan.data as any)?.data?.passwordRequired).toBe(false);

    const free = await api(srv, 'DELETE', `/colors/${unusedId}`);
    expect(free.status).toBe(200);
    expect((free.data as any)?.data?.deleted).toBe(1);
    const gone = await api(srv, 'GET', `/colors/${unusedId}`);
    expect(gone.status).toBe(404);
    createdColorIds.splice(createdColorIds.indexOf(unusedId), 1);

    // Toplu silme: listede referanslı tek bir renk varsa bütün işlem geri alınır.
    const spare = await createColor({ name: `${P} TOPLU DENEME ${RUN}` });
    const bulk = await api(srv, 'POST', '/colors/bulk-delete', { ids: [spare, hakiId] });
    expect(bulk.status).toBe(409);
    expect((bulk.data as any)?.code).toBe('COLOR_IN_USE');

    // Kullanılan renk ve toplu listedeki yedeği yerinde duruyor.
    expect((await getColor(hakiId)).id !== undefined).toBe(true);
    expect((await getColor(spare)).id !== undefined).toBe(true);
  });

  await test('Test 6 — Kullanılan renk pasifleştirilebiliyor, ürün bağı korunuyor', async () => {
    const res = await api(srv, 'PATCH', `/colors/${hakiId}`, { isActive: false });
    expect(res.status).toBe(200);
    expect(Boolean((await getColor(hakiId)).isActive)).toBe(false);

    const product = await getProduct(productId);
    expect(product.colorRefs.length).toBe(1);
    expect(Number(product.colorRefs[0].id)).toBe(hakiId);
    expect(product.colorRefs[0].isActive).toBe(false);
    expect(product.colors).toContain(hakiName); // pasifleşen renk karttan düşmez

    // Geri aktifleştirme de çalışıyor (Test 7'de yeniden pasifleştirilecek).
    expect((await api(srv, 'PATCH', `/colors/${hakiId}`, { isActive: true })).status).toBe(200);
  });

  await test('Test 7 — Pasif renk yeni stok kartında seçilemiyor', async () => {
    await api(srv, 'PATCH', `/colors/${hakiId}`, { isActive: false });

    const byIds = await api(srv, 'POST', '/products', {
      code: `TRP2-${RUN}`,
      name: `${P} ÜRÜN 2 ${RUN}`,
      unit: 'Çift',
      colorIds: [hakiId],
    });
    expect(byIds.status).toBe(422);
    expect((byIds.data as any)?.code).toBe('COLOR_INACTIVE');

    const byName = await api(srv, 'POST', '/products', {
      code: `TRP3-${RUN}`,
      name: `${P} ÜRÜN 3 ${RUN}`,
      unit: 'Çift',
      colors: [hakiName],
    });
    expect(byName.status).toBe(422);
    expect((byName.data as any)?.code).toBe('COLOR_INACTIVE');

    // Seçici listesi (Aktif filtresi) pasif kartı döndürmez.
    const active = await api(srv, 'GET', whereUrl('colors', { isActive: true }));
    const rows: any[] = (active.data as any)?.data ?? [];
    expect(rows.some((r) => Number(r.id) === hakiId)).toBe(false);
    expect(rows.some((r) => Number(r.id) === navyId)).toBe(true);

    // Mevcut bağ pasifleşmeden etkilenmez (veri kaybı yok).
    expect((await getProduct(productId)).colorRefs.length).toBe(1);
  });

  await test('Test 8 — Mevcut stokta kullanılan renk doğru görüntüleniyor (HEX + hareket bağı)', async () => {
    const product = await getProduct(productId);
    expect(product.colorRefs[0].code).toMatch(/^R-\d{4}$/);
    expect(product.colorRefs[0].hexCode).toBe('#3F6212');
    expect(product.colors).toContain(hakiName);

    // Stok hareketi: renk metni tarihsel olarak korunur, merkezi kart bağı da yazılır.
    const docNo = `${P}-STOK-${RUN}`;
    const op = await api(srv, 'POST', '/ops/invoice-stock', {
      documentNumber: docNo,
      isSales: false,
      writeLog: true,
      items: [{ productId, quantity: 4, color: hakiName, size: '40' }],
    });
    expect(op.status).toBe(200);

    const logs = await api(srv, 'GET', `/inventoryLogs?search=${encodeURIComponent(docNo)}`);
    const rows: any[] = (logs.data as any)?.data ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0].color).toBe(hakiName);
    expect(Number(rows[0].colorId)).toBe(hakiId);
    expect(rows[0].size).toBe('40');
    expect(Number(rows[0].quantity)).toBe(4);
  });

  await test('Test 9 — Stok kartında serbest metin renk girilemiyor', async () => {
    const unknown = `${P} OLMAYAN ${RUN}`;
    const res = await api(srv, 'POST', '/products', {
      code: `TRP4-${RUN}`,
      name: `${P} ÜRÜN 4 ${RUN}`,
      unit: 'Çift',
      colors: [unknown],
    });
    expect(res.status).toBe(422);
    expect((res.data as any)?.code).toBe('COLOR_NOT_IN_MASTER');

    // Var olmayan renk id'si de reddedilir.
    const badId = await api(srv, 'POST', '/products', {
      code: `TRP5-${RUN}`,
      name: `${P} ÜRÜN 5 ${RUN}`,
      unit: 'Çift',
      colorIds: [999999],
    });
    expect(badId.status).toBe(400);
    expect((badId.data as any)?.code).toBe('COLOR_NOT_FOUND');

    // Ürün kartındaki `colors` alanı serbest metin değil, bağlardan türetilir:
    // PATCH ile yazılmaya çalışılan uydurma ad reddedilir.
    const patch = await api(srv, 'PATCH', `/products/${productId}`, { colors: [unknown] });
    expect(patch.status).toBe(422);
    expect((await getProduct(productId)).colors).toContain(hakiName);
  });

  await test('Test 10 — RBAC: yetkisiz kullanıcı renk oluşturamıyor/değiştiremiyor/silemiyor', async () => {
    // Okuma oturum için açık (colors.readAuthOnly).
    expect((await api(limited, 'GET', '/colors')).status).toBe(200);

    const create = await api(limited, 'POST', '/colors', { name: `${P} RBAC ${RUN}` });
    expect(create.status).toBe(403);
    expect((create.data as any)?.code).toBe('FORBIDDEN');

    const update = await api(limited, 'PATCH', `/colors/${navyId}`, { name: 'HACK', isActive: false });
    expect(update.status).toBe(403);
    expect((update.data as any)?.code).toBe('FORBIDDEN');

    const del = await api(limited, 'DELETE', `/colors/${navyId}`);
    expect(del.status).toBe(403);

    // Bağ tablosu (productColors) da yazıma kapalı: yetki atlanamaz.
    const link = await api(limited, 'POST', '/productColors', { productId, colorId: navyId });
    expect(link.status).toBe(403);
    expect((link.data as any)?.code).toBeIn(['FORBIDDEN', 'READ_ONLY_RESOURCE']);

    // Reddedilen işlemler veri değiştirmedi.
    const row = await getColor(navyId);
    expect(row.name).toBe(`${P} LACIVERT ${RUN}`);
    expect(Boolean(row.isActive)).toBe(true);
  });

  await test('Test 11 — Audit log oluşuyor (create/update + eski→yeni + pasifleştirme)', async () => {
    const res = await api(srv, 'GET', whereUrl('auditLogs', { module: 'colors' }));
    expect(res.status).toBe(200);
    const rows: any[] = (res.data as any)?.data ?? [];

    const navyLogs = rows.filter((r) => String(r.entityId) === String(navyId));
    expect(navyLogs.some((r) => r.action === 'create')).toBe(true);

    const hakiLogs = rows.filter((r) => String(r.entityId) === String(hakiId));
    const update = hakiLogs.find((r) => r.action === 'update' && /name: ".*" → "/.test(r.details || ''));
    expect(Boolean(update)).toBe(true); // eski → yeni karşılaştırması detayda
    expect(/hexCode: "#4D7C0F" → "#3F6212"/.test(update.details)).toBe(true);

    const deactivate = hakiLogs.find((r) => /pasifleştirildi/i.test(r.description || ''));
    expect(Boolean(deactivate)).toBe(true);
    expect(deactivate.action).toBe('update');
    expect(/isActive: "aktif" → "pasif"/.test(deactivate.details || '')).toBe(true);

    // Denetim kaydı sunucu kimliğiyle yazılır (istemci taklit edemez).
    expect(Boolean(deactivate.userName)).toBe(true);
    expect(Boolean(deactivate.timestamp)).toBe(true);
  });

  await test('Test 12 — Migration mevcut renk verisini kaybetmedi (bağ + normalizasyon)', async () => {
    const [colorsRes, productsRes] = await Promise.all([
      api(srv, 'GET', '/colors'),
      api(srv, 'GET', '/products'),
    ]);
    const colors: any[] = (colorsRes.data as any)?.data ?? [];
    const products: any[] = (productsRes.data as any)?.data ?? [];
    expect(colors.length > 0).toBe(true);

    // 1) Normalizasyon: aynı adı taşıyan (üretici kodu olmayan) ikinci kart yok.
    //    Karşılaştırma Türkçe katlamasıyla yapılır — "SIYAH"/"SİYAH" tek karttır.
    const seen = new Map<string, number>();
    for (const c of colors) {
      if (c.manufacturerCode) continue;
      const key = foldTurkishName(c.name);
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name);
    expect(duplicates.length).toBe(0);

    // 2) Renk künyesi bozulmadı: kod benzersiz, HEX ya null ya #RRGGBB, RGB HEX ile tutarlı.
    const codes = new Set(colors.map((c) => c.code));
    expect(codes.size).toBe(colors.length);
    for (const c of colors) {
      if (c.hexCode === null || c.hexCode === undefined) continue;
      expect(String(c.hexCode)).toMatch(/^#[0-9A-F]{6}$/);
      expect(c.rgbCode).toBe(hexToRgb(String(c.hexCode)));
    }

    // 3) Ürün renk metni bağsız kalmadı: varyant barkodunda renk olan her ürünün
    //    en az bir productColors bağı vardır ve her renk adı karttan çözülür.
    //    Karşılaştırma Türkçe katlamasıyla yapılır ("SIYAH" ≡ "SİYAH").
    const fold = foldTurkishName;
    const masterNames = new Set(colors.map((c) => fold(c.name)));
    const unbound: string[] = [];
    const unmatched: string[] = [];
    for (const p of products) {
      const variants: any[] = Array.isArray(p.variantBarcodes) ? p.variantBarcodes : [];
      const variantColors = [...new Set(variants.map((v) => fold(v?.color || '')).filter(Boolean))];
      if (!variantColors.length) continue;
      const refs: any[] = Array.isArray(p.colorRefs) ? p.colorRefs : [];
      if (!refs.length) { unbound.push(p.code); continue; }
      const refNames = new Set(refs.map((r) => fold(r.name)));
      for (const name of variantColors) {
        if (!refNames.has(name) || !masterNames.has(name)) unmatched.push(`${p.code}:${name}`);
      }
    }
    expect(unbound.length).toBe(0);
    expect(unmatched.length).toBe(0);

    // 4) Belgelerdeki tarihsel renk metni değiştirilmez ama her satır merkezî
    //    karta bağlıdır: rengi dolu, colorId'si boş satır kalmamalıdır.
    const lineSources = [
      { resource: 'inventoryLogs', text: 'color' },
      { resource: 'orderItems', text: 'color' },
      { resource: 'waybillItems', text: 'color' },
      { resource: 'invoiceItems', text: 'color' },
      { resource: 'workOrders', text: 'color' },
      { resource: 'recipes', text: 'targetColor' },
    ];
    for (const source of lineSources) {
      const res = await api(srv, 'GET', `/${source.resource}`);
      expect(res.status).toBe(200);
      const rows: any[] = (res.data as any)?.data ?? [];
      const fkColumn = source.text === 'targetColor' ? 'targetColorId' : 'colorId';
      const orphans = rows.filter((r) => String(r[source.text] || '').trim() && r[fkColumn] == null);
      if (orphans.length) {
        throw new Error(`${source.resource}: ${orphans.length} satırın renk metni var ama ${fkColumn} bağı yok (ör. "${orphans[0][source.text]}")`);
      }
    }

    // 5) products.colors JSON kolonu kaldırıldı: renk listesi yalnızca bağdan türer.
    const sample = products.find((p) => (p.colorRefs || []).length);
    if (sample) {
      expect(JSON.stringify(sample.colors)).toBe(JSON.stringify(sample.colorRefs.map((c: any) => c.name)));
    }
  });

  // -----------------------------------------------------------------
  console.log('\n📌 C. TEMİZLİK');
  // -----------------------------------------------------------------
  await test('Test ürünleri silindi, test renkleri pasife çekildi', async () => {
    for (const id of createdProductIds) {
      const res = await api(srv, 'DELETE', `/products/${id}`);
      // Stok hareketi olan test ürünü guard ile korunur (409); kalan satırları
      // koşu sonundaki purgeTestResidue kaldırır.
      if (res.status !== 200 && res.status !== 409) {
        throw new Error(`products/${id} temizlenemedi (${res.status}): ${res.text.slice(0, 160)}`);
      }
    }
    for (const id of createdColorIds) {
      const res = await api(srv, 'PATCH', `/colors/${id}`, { isActive: false });
      expect(res.status).toBe(200);
    }
    // Ürün silinse de kullanılan renk kartı duruyor (guard + pasifleştirme).
    expect((await getColor(hakiId)).name).toBe(hakiName);
  });

  console.log('\n======================================================');
  console.log(` RENK MODÜLÜ TEST RAPORU: ${passed} BAŞARILI, ${failed} HATALI`);
  console.log('======================================================\n');

  await srv.close();
  await limited.close();
  await purgeTestResidue('Renk modülü');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('RENK MODÜLÜ TEST HARİCİ HATA:', err);
  try { await srv?.close(); } catch { /* yoksay */ }
  try { await limited?.close(); } catch { /* yoksay */ }
  await purgeTestResidue('Renk modülü');
  process.exit(1);
});
