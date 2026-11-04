/**
 * Silme politikası motoru (server/deletePolicy.ts) uçtan uca testleri.
 *
 * Kullanıcı kuralı: bir muhasebe kaydı, kaynağı olan belge dururken silinemez;
 * belge silindiğinde fiş onunla birlikte otomatik kalkar ve türetilmiş alanlar
 * (cari bakiyesi, stok, fatura ödeme durumu) TERS KAYIT ÜRETİLMEDEN geri
 * hesaplanır. Önemli kayıtlarda gerekçe + oturum sahibi parolası zorunludur ve
 * hem başarılı silme hem hatalı parola denemesi denetim izine yazılır.
 *
 * Kapsam:
 *   A — kademe 0: ilişkisi olmayan ana kart parolasız silinir
 *   B — guard'lar: bağlı kayıt varsa 409 HAS_DEPENDENTS
 *   C — kademe 2: gerekçe/parola kapısı + hatalı parola denemesi loglanır
 *   D — fatura → muhasebe fişi: kaynak dururken fiş silinemez, faturayla birlikte silinir
 *   E — kademe 3: hareket defteri ve kapalı muhasebe dönemi silinemez
 *   F — sistem korumaları: sistem rolü, kullanılan TDHP hesabı, son Süper Admin
 *
 * Çalıştırma: npm run test:delete
 */
import { startTestServer, api, apiWithToken, mintToken, purgeTestResidue, type TestServer } from './harness.js';

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
    toContain(part: string) {
      if (!String(actual).includes(part)) throw new Error(`Beklenen: "${part}" içermeli, Alınan: ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan(n: number) {
      if (!(actual > n)) throw new Error(`Beklenen: > ${n}, Alınan: ${actual}`);
    },
  };
}

const RUN = Date.now();
/** Kademe 2 testlerinde kullanılan geçici Süper Admin ve bilinen parolası. */
const TEMP_PASSWORD = `SilmeTest!${RUN}`;
let srv: TestServer;
let adminToken: string | null = null;
let tempUserId = 0;

function qs(where: Record<string, unknown>, extra = ''): string {
  return `?where=${encodeURIComponent(JSON.stringify(where))}${extra}`;
}

async function getRow(resource: string, id: number): Promise<any> {
  const res = await api(srv, 'GET', `/${resource}/${id}`);
  if (res.status !== 200) return null;
  return (res.data as any)?.data;
}

async function countRows(resource: string, where: Record<string, unknown>): Promise<number> {
  const res = await api(srv, 'GET', `/${resource}${qs(where, '&count=1')}`);
  if (res.status !== 200) throw new Error(`${resource} sayılamadı (${res.status}): ${res.text.slice(0, 160)}`);
  return Number((res.data as any)?.count ?? 0);
}

async function createContact(label: string): Promise<number> {
  const res = await api(srv, 'POST', '/contacts', {
    name: `TEST-DEL ${label} ${RUN}`,
    code: `TD-${label}-${RUN}`.slice(0, 40),
    type: 'customer',
  });
  if (res.status !== 201) throw new Error(`Test carisi oluşturulamadı (${res.status}): ${res.text.slice(0, 200)}`);
  return Number((res.data as any)?.data ?? (res.data as any)?.ids?.[0]);
}

async function createProduct(label: string): Promise<number> {
  const res = await api(srv, 'POST', '/products', {
    code: `TD${label}${RUN}`.slice(0, 40),
    name: `TEST-DEL Ürün ${label} ${RUN}`,
    unit: 'Adet',
    stock: 0,
  });
  if (res.status !== 201) throw new Error(`Test ürünü oluşturulamadı (${res.status}): ${res.text.slice(0, 200)}`);
  return Number((res.data as any)?.data ?? (res.data as any)?.ids?.[0]);
}

/**
 * Cari hareket, arayüzün de kullandığı kontrollü op üzerinden oluşturulur:
 * bakiyeyi yalnızca bu uç değiştirir (generic POST /transactions bakiyeye dokunmaz).
 */
async function createTransaction(contactId: number, amount: number, type: 'income' | 'expense'): Promise<number> {
  const res = await api(srv, 'POST', '/ops/contact-transaction', {
    mode: 'create',
    contactId,
    type,
    amount,
    description: `TEST-DEL hareket ${RUN}`,
    category: type === 'income' ? 'Tahsilat' : 'Ödeme',
    paymentMethod: 'cash',
    date: new Date().toISOString(),
  });
  if (res.status !== 200) throw new Error(`Test hareketi oluşturulamadı (${res.status}): ${res.text.slice(0, 200)}`);
  return Number((res.data as any)?.data?.id);
}

/** Kademe 2 silme: geçici Süper Admin oturumu + bilinen parola ile. */
async function removeAs(resource: string, id: number, reason: string, password: string = TEMP_PASSWORD) {
  return apiWithToken(srv, adminToken, 'DELETE', `/${resource}/${id}`, { reason, password });
}

async function main(): Promise<void> {
  srv = await startTestServer(1);
  console.log('\n======================================================');
  console.log(' DMR NEXUS SİLME POLİTİKASI TESTLERİ');
  console.log(` Hedef: ${srv.baseUrl} (canlı DB, in-process oturum)`);
  console.log('======================================================\n');

  // ---------------------------------------------------------------
  console.log('📌 0. HAZIRLIK — parolası bilinen geçici Süper Admin');
  // ---------------------------------------------------------------
  await test('geçici kullanıcı oluşturulur ve parolası atanır', async () => {
    const created = await api(srv, 'POST', '/users', {
      username: `tdel${RUN}`.slice(0, 40),
      fullName: `TEST-DEL Silme Kullanıcısı ${RUN}`,
      roleCode: 'super_admin',
      status: 'active',
      department: 'TEST',
      email: `tdel${RUN}@test.local`,
      password: TEMP_PASSWORD,
    });
    if (created.status !== 201) throw new Error(`Geçici kullanıcı oluşturulamadı (${created.status}): ${created.text.slice(0, 200)}`);
    tempUserId = Number((created.data as any)?.data ?? (created.data as any)?.ids?.[0]);
    expect(tempUserId).toBeGreaterThan(0);

    adminToken = mintToken(tempUserId);
    const who = await apiWithToken(srv, adminToken, 'GET', '/auth/session');
    expect(who.status).toBe(200);
    expect((who.data as any)?.data?.user?.id).toBe(tempUserId);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 A. KADEME 0 — ilişkisi olmayan ana kart parolasız silinir');
  // ---------------------------------------------------------------
  await test('cari kartı: plan kademe 0, DELETE parola/gerekçe istemez', async () => {
    const cid = await createContact('bos');
    const plan = await api(srv, 'GET', `/contacts/delete-plan/${cid}`);
    expect(plan.status).toBe(200);
    expect((plan.data as any)?.data?.tier).toBe(0);
    expect((plan.data as any)?.data?.passwordRequired).toBe(false);
    expect((plan.data as any)?.data?.recordSummary ?? (plan.data as any)?.data?.summary).toContain(`TEST-DEL bos ${RUN}`);

    const del = await api(srv, 'DELETE', `/contacts/${cid}`);
    expect(del.status).toBe(200);
    expect((del.data as any)?.data?.deleted).toBe(1);
    expect(await getRow('contacts', cid)).toBeNullish();

    const audits = await countRows('auditLogs', { action: 'delete', entityId: String(cid) });
    expect(audits).toBeGreaterThan(0);
  });

  await test('ürün kartı: hareketi yokken parolasız silinir', async () => {
    const pid = await createProduct('bos');
    const del = await api(srv, 'DELETE', `/products/${pid}`);
    expect(del.status).toBe(200);
    expect(await getRow('products', pid)).toBeNullish();
  });

  // ---------------------------------------------------------------
  console.log('\n📌 B. GUARD — bağlı kayıt varsa silme reddedilir (409)');
  // ---------------------------------------------------------------
  await test('cari + hareket → 409 HAS_DEPENDENTS', async () => {
    const cid = await createContact('guard');
    await createTransaction(cid, 100, 'income');
    const del = await api(srv, 'DELETE', `/contacts/${cid}`);
    expect(del.status).toBe(409);
    expect((del.data as any)?.code).toBe('HAS_DEPENDENTS');
    expect(await getRow('contacts', cid)).toBeTruthy();
  });

  await test('ürün + stok hareketi → 409 HAS_DEPENDENTS', async () => {
    const pid = await createProduct('guard');
    const mv = await api(srv, 'POST', '/ops/stock-movement', {
      productId: pid,
      quantity: 5,
      type: 'in',
      description: `TEST-DEL giriş ${RUN}`,
    });
    expect(mv.status).toBe(200);
    const del = await api(srv, 'DELETE', `/products/${pid}`);
    expect(del.status).toBe(409);
    expect((del.data as any)?.code).toBe('HAS_DEPENDENTS');
  });

  // ---------------------------------------------------------------
  console.log('\n📌 C. KADEME 2 — gerekçe + oturum sahibi parolası');
  // ---------------------------------------------------------------
  const cidTier2 = await createContact('k2');
  const balanceNoTx = Number((await getRow('contacts', cidTier2))?.balance) || 0;
  const txTier2 = await createTransaction(cidTier2, 200, 'expense');

  await test('plan: kademe 2, parola ve gerekçe zorunlu işaretli', async () => {
    const plan = await api(srv, 'GET', `/transactions/delete-plan/${txTier2}`);
    expect(plan.status).toBe(200);
    const p = (plan.data as any)?.data;
    expect(p?.tier).toBe(2);
    expect(p?.passwordRequired).toBe(true);
    expect(p?.reasonRequired).toBe(true);
    expect(p?.warnings?.length).toBeGreaterThan(0);
    // Hareket bakiyeyi gerçekten değiştirdi; silmede bu etki geri alınacak.
    expect(Math.abs(Number((await getRow('contacts', cidTier2))?.balance) - balanceNoTx)).toBe(200);
  });

  await test('gerekçesiz silme → 400 REASON_REQUIRED', async () => {
    const res = await api(srv, 'DELETE', `/transactions/${txTier2}`);
    expect(res.status).toBe(400);
    expect((res.data as any)?.code).toBe('REASON_REQUIRED');
  });

  await test('gerekçe var, parola yok → 400 PASSWORD_REQUIRED', async () => {
    const res = await api(srv, 'DELETE', `/transactions/${txTier2}`, { reason: 'Test silmesi' });
    expect(res.status).toBe(400);
    expect((res.data as any)?.code).toBe('PASSWORD_REQUIRED');
  });

  await test('hatalı parola → 403 PASSWORD_INVALID ve delete_denied logu', async () => {
    const deniedBefore = await countRows('auditLogs', { action: 'delete_denied' });
    const res = await api(srv, 'DELETE', `/transactions/${txTier2}`, { reason: 'Test silmesi', password: 'yanlis-parola' });
    expect(res.status).toBe(403);
    expect((res.data as any)?.code).toBe('PASSWORD_INVALID');
    expect(await getRow('transactions', txTier2)).toBeTruthy();
    const deniedAfter = await countRows('auditLogs', { action: 'delete_denied' });
    expect(deniedAfter).toBeGreaterThan(deniedBefore);
  });

  await test('doğru parola + gerekçe → 200, bakiye geri hesaplanır, ters kayıt üretilmez', async () => {
    const txCountBefore = await countRows('transactions', { contactId: cidTier2 });
    const res = await removeAs('transactions', txTier2, 'Yanlış tutar girildi, kayıt iptal edildi (test)');
    expect(res.status).toBe(200);
    expect((res.data as any)?.data?.deleted).toBe(1);
    expect(await getRow('transactions', txTier2)).toBeNullish();

    // Ters kayıt yok: satır sayısı bir azalır, artmaz.
    const txCountAfter = await countRows('transactions', { contactId: cidTier2 });
    expect(txCountAfter).toBe(txCountBefore - 1);

    // Bakiye, hareket hiç yazılmamış gibi geri hesaplanır (1.000 − 200 = 800 mantığı).
    const after = await getRow('contacts', cidTier2);
    expect(Number(after.balance)).toBe(balanceNoTx);

    const audits = await api(srv, 'GET', `/auditLogs${qs({ action: 'delete', entityId: String(txTier2) })}`);
    const rows: any[] = (audits.data as any)?.data ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].reason).toContain('kayıt iptal edildi');
    expect(rows[0].recordSummary).toBeTruthy();
    // Parola metni hiçbir alanda saklanmaz.
    expect(audits.text.includes(TEMP_PASSWORD)).toBe(false);
  });

  await test('temizlik: hareketi kalmayan cari parolasız silinir', async () => {
    const del = await api(srv, 'DELETE', `/contacts/${cidTier2}`);
    expect(del.status).toBe(200);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 D. FATURA ↔ MUHASEBE FİŞİ — kullanıcının ana kuralı');
  // ---------------------------------------------------------------
  const invContactId = await createContact('fatura');
  const invProductId = await createProduct('fatura');
  const invoiceNumber = `TEST-DEL-FAT-${RUN}`;
  let invoiceId = 0;
  let invoiceTotal = 0;
  const balanceBeforeInvoice = Number((await getRow('contacts', invContactId))?.balance) || 0;

  await test('kesilmiş alış faturası oluşturulur (cari + stok + muhasebe işlenir)', async () => {
    const res = await api(srv, 'POST', '/ops/create-invoice', {
      invoice: {
        type: 'purchase',
        scenario: 'basic',
        contactId: invContactId,
        invoiceNumber,
        status: 'issued',
        date: new Date().toISOString(),
        isStockDeducted: true,
      },
      items: [{ productId: invProductId, productName: `TEST-DEL Ürün ${RUN}`, quantity: 4, unitPrice: 250, taxRate: 0 }],
    });
    expect(res.status).toBe(200);
    invoiceId = Number((res.data as any)?.data?.invoiceId);
    invoiceTotal = Number((res.data as any)?.data?.grandTotal);
    expect(invoiceId).toBeGreaterThan(0);
    expect(invoiceTotal).toBe(1000);

    const after = await getRow('contacts', invContactId);
    // Alış faturası bakiyeyi fatura tutarı kadar değiştirir; yön muhasebe kuralına
    // aittir, testin derlediği şey etkinin büyüklüğü ve silmede tam geri alınmasıdır.
    expect(Math.abs(Number(after.balance) - balanceBeforeInvoice)).toBe(invoiceTotal);
    expect(await countRows('journalEntries', { documentId: invoiceId, documentType: 'invoice' })).toBeGreaterThan(0);
    expect(await countRows('inventoryLogs', { productId: invProductId })).toBeGreaterThan(0);
  });

  await test('kaynak fatura dururken muhasebe fişi silinemez → 409 JOURNAL_HAS_SOURCE', async () => {
    const list = await api(srv, 'GET', `/journalEntries${qs({ documentId: invoiceId, documentType: 'invoice' })}`);
    const jeId = Number(((list.data as any)?.data ?? [])[0]?.id);
    expect(jeId).toBeGreaterThan(0);

    const plan = await api(srv, 'GET', `/journalEntries/delete-plan/${jeId}`);
    expect((plan.data as any)?.data?.blocked?.code).toBe('JOURNAL_HAS_SOURCE');

    const res = await removeAs('journalEntries', jeId, 'Fatura dururken fiş silme denemesi (test)');
    expect(res.status).toBe(409);
    expect((res.data as any)?.code).toBe('JOURNAL_HAS_SOURCE');
    expect(await getRow('journalEntries', jeId)).toBeTruthy();
  });

  await test('fatura silinir → fiş, kalem ve stok hareketleri birlikte kalkar, bakiye geri hesaplanır', async () => {
    const plan = await api(srv, 'GET', `/invoices/delete-plan/${invoiceId}`);
    const p = (plan.data as any)?.data;
    expect(p?.tier).toBe(2);
    expect(p?.cascade?.map((c: any) => c.label).join('|')).toContain('Fatura kalemi');

    const res = await removeAs('invoices', invoiceId, 'Yanlış cari/tutar girildi, fatura iptal edildi (test)');
    expect(res.status).toBe(200);

    expect(await getRow('invoices', invoiceId)).toBeNullish();
    expect(await countRows('invoiceItems', { invoiceId })).toBe(0);
    // Muhasebe fişi ters kayıtla değil, fiziksel olarak kaldırılır.
    expect(await countRows('journalEntries', { documentId: invoiceId, documentType: 'invoice' })).toBe(0);
    // Faturaya ait stok hareketi de belgeyle birlikte silinir.
    expect(await countRows('inventoryLogs', { productId: invProductId })).toBe(0);

    const after = await getRow('contacts', invContactId);
    expect(Number(after.balance)).toBe(balanceBeforeInvoice);
    const product = await getRow('products', invProductId);
    expect(Number(product.stock)).toBe(0);
  });

  await test('belgesi kalkan ürün ve cari yeniden parolasız silinebilir', async () => {
    const dp = await api(srv, 'DELETE', `/products/${invProductId}`);
    expect(dp.status).toBe(200);
    const dc = await api(srv, 'DELETE', `/contacts/${invContactId}`);
    expect(dc.status).toBe(200);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 E. KADEME 3 — hareket defteri ve kapalı muhasebe dönemi');
  // ---------------------------------------------------------------
  await test('stok hareketi tek başına silinemez → plan kademe 3, silme 403 MOVEMENT_TABLE', async () => {
    const pid = await createProduct('k3');
    const mv = await api(srv, 'POST', '/ops/stock-movement', {
      productId: pid,
      quantity: 3,
      type: 'in',
      description: `TEST-DEL kademe3 ${RUN}`,
    });
    expect(mv.status).toBe(200);
    const logs = await api(srv, 'GET', `/inventoryLogs${qs({ productId: pid })}`);
    const logId = Number(((logs.data as any)?.data ?? [])[0]?.id);
    expect(logId).toBeGreaterThan(0);

    const plan = await api(srv, 'GET', `/inventoryLogs/delete-plan/${logId}`);
    expect((plan.data as any)?.data?.tier).toBe(3);
    expect((plan.data as any)?.data?.blocked?.code).toBe('MOVEMENT_LEDGER');

    // Hareket defteri tabloları yazma isteklerini API katmanında reddeder
    // (server/api.ts → movementTable); silme motoru hiç çalışmaz, bu yüzden
    // 409 değil 403 döner. Plan ucu ise kademeyi doğru bildirir.
    const res = await removeAs('inventoryLogs', logId, 'Hareket defteri silme denemesi (test)');
    expect(res.status).toBe(403);
    expect((res.data as any)?.code).toBe('MOVEMENT_TABLE');
    expect(await getRow('inventoryLogs', logId)).toBeTruthy();
  });

  await test('kapalı muhasebe döneminin fişi silinemez → 409 PERIOD_LOCKED', async () => {
    const lockDate = new Date('1990-01-15T12:00:00.000Z');
    const lock = await api(srv, 'POST', '/periodLocks', {
      scope: 'accounting',
      month: 1,
      year: 1990,
      isLocked: 1,
      lockedBy: 'TEST-DEL',
      notes: `TEST-DEL dönem kilidi ${RUN}`,
    });
    if (lock.status !== 201) throw new Error(`Dönem kilidi oluşturulamadı (${lock.status}): ${lock.text.slice(0, 200)}`);
    const lockId = Number((lock.data as any)?.data ?? (lock.data as any)?.ids?.[0]);

    try {
      const je = await api(srv, 'POST', '/journalEntries', {
        entryType: 'mahsup',
        date: lockDate.toISOString(),
        description: `TEST-DEL kapalı dönem ${RUN}`,
        lines: [
          { accountCode: '100.01', accountName: 'Kasa', description: 'TEST-DEL', debit: 10, credit: 0 },
          { accountCode: '120.01', accountName: 'Alıcılar', description: 'TEST-DEL', debit: 0, credit: 10 },
        ],
      });
      if (je.status !== 201) throw new Error(`Kapalı dönem fişi oluşturulamadı (${je.status}): ${je.text.slice(0, 200)}`);
      const jeId = Number((je.data as any)?.data ?? (je.data as any)?.ids?.[0]);

      const res = await removeAs('journalEntries', jeId, 'Kapalı dönem silme denemesi (test)');
      expect(res.status).toBe(409);
      expect((res.data as any)?.code).toBe('PERIOD_LOCKED');
    } finally {
      const unlock = await api(srv, 'DELETE', `/periodLocks/${lockId}`);
      expect(unlock.status).toBe(200);
    }
  });

  // ---------------------------------------------------------------
  console.log('\n📌 F. SİSTEM KORUMALARI');
  // ---------------------------------------------------------------
  await test('sistem rolü silinemez → 409 SYSTEM_ROLE', async () => {
    const roles = await api(srv, 'GET', `/roles${qs({ code: 'super_admin' })}`);
    const roleId = Number(((roles.data as any)?.data ?? [])[0]?.id);
    expect(roleId).toBeGreaterThan(0);
    const res = await api(srv, 'DELETE', `/roles/${roleId}`);
    expect(res.status).toBe(409);
    expect((res.data as any)?.code).toBe('SYSTEM_ROLE');
  });

  await test('yevmiyede kullanılan TDHP hesabı silinemez → 409 ACCOUNT_IN_USE', async () => {
    const je = await api(srv, 'POST', '/journalEntries', {
      entryType: 'mahsup',
      date: new Date().toISOString(),
      description: `TEST-DEL hesap kullanımı ${RUN}`,
      lines: [
        { accountCode: '100.01', accountName: 'Kasa', description: 'TEST-DEL', debit: 15, credit: 0 },
        { accountCode: '120.01', accountName: 'Alıcılar', description: 'TEST-DEL', debit: 0, credit: 15 },
      ],
    });
    if (je.status !== 201) throw new Error(`Fiş oluşturulamadı (${je.status}): ${je.text.slice(0, 200)}`);
    const jeId = Number((je.data as any)?.data ?? (je.data as any)?.ids?.[0]);

    const acc = await api(srv, 'GET', `/accounts${qs({ code: '100.01' })}`);
    const accountId = Number(((acc.data as any)?.data ?? [])[0]?.id);
    if (!accountId) throw new Error("100.01 hesap kartı bulunamadı; test hesap planına bağlı.");

    const res = await removeAs('accounts', accountId, 'Kullanılan hesap silme denemesi (test)');
    expect(res.status).toBe(409);
    expect((res.data as any)?.code).toBe('ACCOUNT_IN_USE');

    const cleanup = await removeAs('journalEntries', jeId, 'Test fişi temizliği');
    expect(cleanup.status).toBe(200);
  });

  await test('son aktif Süper Admin silinemez → planda LAST_SUPER_ADMIN', async () => {
    // Geçici admin pasife çekilince sistemde tek aktif Süper Admin kalır ve kural
    // deterministik biçimde tetiklenir. Doğrulama salt-okunur plan üzerinden
    // yapılır; gerçek hesap silinmeye çalışılmaz.
    const passive = await api(srv, 'PATCH', `/users/${tempUserId}`, { status: 'passive' });
    expect(passive.status).toBe(200);
    try {
      const list = await api(srv, 'GET', `/users${qs({ roleCode: 'super_admin', status: 'active' })}`);
      const admins: any[] = (list.data as any)?.data ?? [];
      expect(admins.length).toBe(1);

      const plan = await api(srv, 'GET', `/users/delete-plan/${Number(admins[0].id)}`);
      expect(plan.status).toBe(200);
      expect((plan.data as any)?.data?.blocked?.code).toBe('LAST_SUPER_ADMIN');
    } finally {
      // G bölümü bu oturumla silme yapacak: durumu geri al ve belirteci tazele.
      const active = await api(srv, 'PATCH', `/users/${tempUserId}`, { status: 'active' });
      expect(active.status).toBe(200);
      adminToken = mintToken(tempUserId);
    }
  });

  // ---------------------------------------------------------------
  console.log('\n📌 G. TEMİZLİK — geçici kullanıcı kendi kaydıyla birlikte kaldırılır');
  // ---------------------------------------------------------------
  await test('geçici Süper Admin silinir, oturumu kapatılır', async () => {
    const res = await removeAs('users', tempUserId, 'Test kullanıcısı temizliği');
    expect(res.status).toBe(200);
    expect(await getRow('users', tempUserId)).toBeNullish();
    const after = await apiWithToken(srv, adminToken, 'GET', '/auth/session');
    expect(after.status).toBe(401);
  });

  console.log('\n======================================================');
  console.log(` SİLME POLİTİKASI RAPORU: ${passed} BAŞARILI, ${failed} HATALI`);
  console.log('======================================================\n');

  await srv.close();
  await purgeTestResidue('Silme politikası');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('SİLME POLİTİKASI TEST HARİCİ HATA:', err);
  try { await srv?.close(); } catch { /* yoksay */ }
  await purgeTestResidue('Silme politikası');
  process.exit(1);
});
