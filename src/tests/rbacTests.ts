/**
 * DMR Nexus #48 — Yetki (RBAC) doğrulama testleri.
 *
 * Gerçek HTTP + gerçek MySQL + gerçek oturum/RBAC yolu üzerinde koşar. Harness
 * aynı süreç içinde ephemeral bir sunucu başlatır; `mintToken` ile farklı
 * rollerde (super_admin olmayan) oturumlar mint edilip tek sunucuya karşı istek
 * atılır. Böylece yetki sisteminin REDDETME davranışı uçtan uca kanıtlanır:
 *
 *   A. Kimlik doğrulama   — token'sız/geçersiz token → 401
 *   B. readAuthOnly       — referans kaynakları her oturum sahibi okuyabilir
 *   C. Generic CRUD yazma — rolün create/edit/delete izni yoksa → 403
 *   D. Modül okuma        — readAuthOnly olmayan kaynak, module.view yoksa → 403
 *   E. İşlem uçları (ops) — ilgili modül izni yoksa → 403; mizan boş döner
 *   F. Süper Admin kapısı — clear/reset/impersonate yalnızca super_admin
 *   G. documentNumbers    — readOnly + settings izni (dashboard fallback kapanması)
 *
 * Testler kendi geçici veritabanında koşar; gerçek kullanıcı kayıtlarını okumaz.
 *
 * Çalıştırma: npm run test:rbac
 */
import { startTestServer, mintToken, apiWithToken, type TestServer } from './harness.js';
import { query, execute } from '../../server/db.js';
import { INITIAL_ROLES } from '../data/initialRoles.js';
import { assertTestDatabase } from './testDatabaseGuard.js';

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
    toBeIn(set: any[]) {
      if (!set.includes(actual)) throw new Error(`Beklenen: ${JSON.stringify(set)} içinden biri, Alınan: ${JSON.stringify(actual)}`);
    },
    toNotBe(unexpected: any) {
      if (actual === unexpected) throw new Error(`Beklenen: != ${JSON.stringify(unexpected)}, Alınan: ${JSON.stringify(actual)}`);
    },
  };
}

let srv: TestServer;
const tokens: Record<string, string> = {};

/** roleCode → userId çözümlemesi (canlı DB'den; ID'ler hardcode edilmez). */
async function resolveUserIds(): Promise<Record<string, number>> {
  const rows = await query<{ id: number; roleCode: string }>(
    'SELECT u.id, r.code AS roleCode FROM users u JOIN roles r ON r.id = u.roleId WHERE u.status = ? ORDER BY u.id ASC',
    ['active'],
  );
  const map: Record<string, number> = {};
  for (const r of rows) if (!(r.roleCode in map)) map[r.roleCode] = r.id;
  return map;
}

async function main(): Promise<void> {
  assertTestDatabase();
  // Her koşu kendi rol/kullanıcılarını izole veritabanında oluşturur.
  for (const role of INITIAL_ROLES.filter(role => role.code !== 'super_admin')) {
    const created = await execute('INSERT INTO roles (code,name,description,permissions,isSystem) VALUES (?,?,?,?,1)', [role.code, role.name, role.description || '', JSON.stringify(role.permissions)]);
    await execute("INSERT INTO users (username,fullName,roleId,status) VALUES (?,?,?,'active')", [`test_${role.code}`, `Test ${role.name}`, created.insertId]);
  }
  const ids = await resolveUserIds();
  const required = ['super_admin', 'sales_manager', 'auditor', 'finance_manager', 'hr_manager', 'warehouse_keeper', 'production_manager'];
  const missing = required.filter((r) => !(r in ids));
  if (missing.length) {
    console.error(`EKSİK ROL KULLANICILARI: ${missing.join(', ')} — seed verisi eksik (npm run db:setup).`);
    process.exit(1);
  }

  srv = await startTestServer(ids.super_admin);
  for (const role of required) tokens[role] = mintToken(ids[role]);

  console.log('\n======================================================');
  console.log(' DMR NEXUS #48 — YETKİ (RBAC) DOĞRULAMA TESTLERİ');
  console.log(` Hedef: ${srv.baseUrl} (izole test DB, in-process oturumlar)`);
  console.log('======================================================\n');

  // ---------------------------------------------------------------
  console.log('📌 A. KİMLİK DOĞRULAMA (authentication)');
  // ---------------------------------------------------------------
  await test('Token olmadan koruma kaynak → 401 UNAUTHENTICATED', async () => {
    const res = await apiWithToken(srv, null, 'GET', '/products');
    expect(res.status).toBe(401);
    expect((res.data as any)?.code).toBe('UNAUTHENTICATED');
  });

  await test('Geçersiz token → 401', async () => {
    const res = await apiWithToken(srv, 'gecersiz-token-123', 'GET', '/products');
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 B. readAuthOnly REFERANS KAYNAKLARI (her oturum okuyabilir)');
  // ---------------------------------------------------------------
  await test('auditor GET /products → 200 (readAuthOnly)', async () => {
    const res = await apiWithToken(srv, tokens.auditor, 'GET', '/products');
    expect(res.status).toBe(200);
  });

  await test('sales_manager GET /contacts → 200 (readAuthOnly)', async () => {
    const res = await apiWithToken(srv, tokens.sales_manager, 'GET', '/contacts');
    expect(res.status).toBe(200);
  });

  await test('hr_manager GET /colors → 200 (colors modülü yok ama readAuthOnly)', async () => {
    const res = await apiWithToken(srv, tokens.hr_manager, 'GET', '/colors');
    expect(res.status).toBe(200);
  });

  await test('warehouse_keeper GET /settings → 200 (readAuthOnly)', async () => {
    const res = await apiWithToken(srv, tokens.warehouse_keeper, 'GET', '/settings');
    expect(res.status).toBe(200);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 C. GENERIC CRUD YAZMA REDDİ (rol bazlı 403)');
  // ---------------------------------------------------------------
  await test('auditor POST /products → 403 FORBIDDEN (inventory.create yok)', async () => {
    const res = await apiWithToken(srv, tokens.auditor, 'POST', '/products', { name: 'TEST-RBAC', code: 'RBAC-X' });
    expect(res.status).toBe(403);
    expect((res.data as any)?.code).toBe('FORBIDDEN');
  });

  await test('auditor PATCH /products/1 → 403 (inventory.edit yok)', async () => {
    const res = await apiWithToken(srv, tokens.auditor, 'PATCH', '/products/1', { name: 'TEST-RBAC' });
    expect(res.status).toBe(403);
  });

  await test('auditor DELETE /contacts/1 → 403 (contacts.delete yok)', async () => {
    const res = await apiWithToken(srv, tokens.auditor, 'DELETE', '/contacts/1');
    expect(res.status).toBe(403);
  });

  await test('sales_manager POST /employees → 403 (hr modülü yok)', async () => {
    const res = await apiWithToken(srv, tokens.sales_manager, 'POST', '/employees', { name: 'TEST-RBAC' });
    expect(res.status).toBe(403);
  });

  await test('warehouse_keeper POST /accounts → 403 (accounting modülü yok)', async () => {
    const res = await apiWithToken(srv, tokens.warehouse_keeper, 'POST', '/accounts', { code: 'TEST', name: 'TEST-RBAC' });
    expect(res.status).toBe(403);
  });

  await test('hr_manager POST /products → 403 (inventory.create yok)', async () => {
    const res = await apiWithToken(srv, tokens.hr_manager, 'POST', '/products', { name: 'TEST-RBAC', code: 'RBAC-Y' });
    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 D. MODÜL OKUMA REDDİ (readAuthOnly olmayan kaynaklar)');
  // ---------------------------------------------------------------
  await test('sales_manager GET /users → 403 (users.view yok)', async () => {
    const res = await apiWithToken(srv, tokens.sales_manager, 'GET', '/users');
    expect(res.status).toBe(403);
  });

  await test('sales_manager GET /accounts → 403 (accounting.view yok)', async () => {
    const res = await apiWithToken(srv, tokens.sales_manager, 'GET', '/accounts');
    expect(res.status).toBe(403);
  });

  await test('sales_manager GET /employees → 403 (hr.view yok)', async () => {
    const res = await apiWithToken(srv, tokens.sales_manager, 'GET', '/employees');
    expect(res.status).toBe(403);
  });

  await test('auditor GET /users → 200 (users.view var)', async () => {
    const res = await apiWithToken(srv, tokens.auditor, 'GET', '/users');
    expect(res.status).toBe(200);
  });

  await test('auditor GET /accounts → 200 (accounting.view var)', async () => {
    const res = await apiWithToken(srv, tokens.auditor, 'GET', '/accounts');
    expect(res.status).toBe(200);
  });

  await test('finance_manager GET /accounts → 200 (accounting.view var)', async () => {
    const res = await apiWithToken(srv, tokens.finance_manager, 'GET', '/accounts');
    expect(res.status).toBe(200);
  });

  await test('hr_manager GET /employees → 200 (hr.view var)', async () => {
    const res = await apiWithToken(srv, tokens.hr_manager, 'GET', '/employees');
    expect(res.status).toBe(200);
  });

  await test('hr_manager GET /accounts → 403 (accounting.view yok)', async () => {
    const res = await apiWithToken(srv, tokens.hr_manager, 'GET', '/accounts');
    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 E. İŞLEM UÇLARI (ops) YETKİ REDDİ');
  // ---------------------------------------------------------------
  await test('auditor POST /ops/create-invoice → 403 (invoices.create yok)', async () => {
    const res = await apiWithToken(srv, tokens.auditor, 'POST', '/ops/create-invoice', {});
    expect(res.status).toBe(403);
    expect((res.data as any)?.code).toBe('FORBIDDEN');
  });

  await test('sales_manager POST /ops/receipt → 403 (finance.create yok)', async () => {
    const res = await apiWithToken(srv, tokens.sales_manager, 'POST', '/ops/receipt', {
      type: 'collection', instrument: 'cash', contactId: 1, amount: 1,
    });
    expect(res.status).toBe(403);
  });

  await test('sales_manager POST /ops/account-payroll → 403 (hr/accounting.edit yok)', async () => {
    const res = await apiWithToken(srv, tokens.sales_manager, 'POST', '/ops/account-payroll', {
      payrollId: 1, journalEntryId: 1,
    });
    expect(res.status).toBe(403);
  });

  await test('auditor POST /ops/stock-movement → 403 (inventory.edit yok)', async () => {
    const res = await apiWithToken(srv, tokens.auditor, 'POST', '/ops/stock-movement', {
      productId: 1, quantity: 1, type: 'in', description: 'TEST-RBAC',
    });
    expect(res.status).toBe(403);
  });

  await test('finance_manager POST /ops/receipt → 403 DEĞİL (finance.create var; validasyon 400)', async () => {
    // Geçerli gövdeyle izin kapısı geçilir; cari/ hesap yoksa iş kuralı hatası döner (403 olmaz).
    const res = await apiWithToken(srv, tokens.finance_manager, 'POST', '/ops/receipt', {
      type: 'collection', instrument: 'cash', contactId: 99999999, amount: 1,
    });
    expect(res.status).toNotBe(403);
  });

  await test('sales_manager GET /ops/mizan → 200 ama data:[] (accounting.view yok, 403 değil)', async () => {
    const res = await apiWithToken(srv, tokens.sales_manager, 'GET', '/ops/mizan');
    expect(res.status).toBe(200);
    expect(Array.isArray((res.data as any)?.data)).toBe(true);
    expect(((res.data as any)?.data ?? []).length).toBe(0);
  });

  await test('warehouse_keeper GET /ops/mizan → 200 data:[] (accounting.view yok)', async () => {
    const res = await apiWithToken(srv, tokens.warehouse_keeper, 'GET', '/ops/mizan');
    expect(res.status).toBe(200);
    expect(((res.data as any)?.data ?? []).length).toBe(0);
  });

  // ---------------------------------------------------------------
  console.log('\n📌 F. SÜPER ADMIN KAPILARI');
  // ---------------------------------------------------------------
  await test('warehouse_keeper POST /products/clear → 403 SUPER_ADMIN_REQUIRED (inventory.create var, super değil)', async () => {
    // resourceAccess (inventory.create) geçilir; requireSuperAdmin kapısı SUPER_ADMIN_REQUIRED döner.
    const res = await apiWithToken(srv, tokens.warehouse_keeper, 'POST', '/products/clear');
    expect(res.status).toBe(403);
    expect((res.data as any)?.code).toBe('SUPER_ADMIN_REQUIRED');
  });

  await test('auditor POST /products/clear → 403 (inventory.create yok; FORBIDDEN, clear kapısına ulaşamaz)', async () => {
    const res = await apiWithToken(srv, tokens.auditor, 'POST', '/products/clear');
    expect(res.status).toBe(403);
  });

  await test('sales_manager POST /ops/reset-balances → 403 SUPER_ADMIN_REQUIRED', async () => {
    const res = await apiWithToken(srv, tokens.sales_manager, 'POST', '/ops/reset-balances', {});
    expect(res.status).toBe(403);
    expect((res.data as any)?.code).toBe('SUPER_ADMIN_REQUIRED');
  });

  await test('sales_manager POST /auth/impersonate → 403 SUPER_ADMIN_REQUIRED', async () => {
    const res = await apiWithToken(srv, tokens.sales_manager, 'POST', '/auth/impersonate', { userId: 7 });
    expect(res.status).toBe(403);
    expect((res.data as any)?.code).toBe('SUPER_ADMIN_REQUIRED');
  });

  await test('finance_manager POST /ops/commit (clear) → 403 SUPER_ADMIN_REQUIRED', async () => {
    const res = await apiWithToken(srv, tokens.finance_manager, 'POST', '/ops/commit', {
      mutations: [{ op: 'clear', resource: 'products' }],
    });
    expect(res.status).toBe(403);
    expect((res.data as any)?.code).toBe('SUPER_ADMIN_REQUIRED');
  });

  // ---------------------------------------------------------------
  console.log('\n📌 G. documentNumbers SERTLEŞTİRMESİ (dashboard fallback kapanması)');
  // ---------------------------------------------------------------
  await test('sales_manager GET /documentNumbers → 403 (settings.view yok)', async () => {
    const res = await apiWithToken(srv, tokens.sales_manager, 'GET', '/documentNumbers');
    expect(res.status).toBe(403);
  });

  await test('auditor GET /documentNumbers → 200 (settings.view var)', async () => {
    const res = await apiWithToken(srv, tokens.auditor, 'GET', '/documentNumbers');
    expect(res.status).toBe(200);
  });

  await test('auditor POST /documentNumbers → 403 READ_ONLY_RESOURCE', async () => {
    const res = await apiWithToken(srv, tokens.auditor, 'POST', '/documentNumbers', { scope: 'TEST', prefix: 'T', year: 2026, lastNumber: 1 });
    expect(res.status).toBe(403);
    expect((res.data as any)?.code).toBe('READ_ONLY_RESOURCE');
  });

  await test('super_admin POST /documentNumbers → 403 READ_ONLY_RESOURCE (readOnly mutlak)', async () => {
    const res = await apiWithToken(srv, tokens.super_admin, 'POST', '/documentNumbers', { scope: 'TEST', prefix: 'T', year: 2026, lastNumber: 1 });
    expect(res.status).toBe(403);
    expect((res.data as any)?.code).toBe('READ_ONLY_RESOURCE');
  });

  for (const operation of ['create-stock-count', 'decide-stock-count', 'reconcile-reservation', 'reserve-stock', 'decide-purchase', 'set-accounting-period']) {
    await test(`auditor POST /ops/${operation} → 403`, async () => {
      const res = await apiWithToken(srv, tokens.auditor, 'POST', `/ops/${operation}`, {});
      expect(res.status).toBe(403);
    });
  }
  await test('auditor sayım özetini okuyabilir', async () => {
    expect((await apiWithToken(srv, tokens.auditor, 'POST', '/ops/stock-count-summary', {})).status).toBe(200);
  });
  await test('hr_manager sayım özetini okuyamaz (inventory.view yok)', async () => {
    expect((await apiWithToken(srv, tokens.hr_manager, 'POST', '/ops/stock-count-summary', {})).status).toBe(403);
  });
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    await test(`super_admin ${method} /stockCounts doğrudan yazma kapalı`, async () => {
      const res = await apiWithToken(srv, tokens.super_admin, method, `/stockCounts${method === 'POST' ? '' : '/1'}`, {});
      expect(res.status).toBe(403);
    });
  }
  // ---------------------------------------------------------------
  console.log('\n======================================================');
  console.log(` RBAC TEST RAPORU: ${passed} BAŞARILI, ${failed} HATALI`);
  console.log('======================================================\n');
}

(async () => {
  let exitCode = 0;
  try {
    await main();
    exitCode = failed > 0 ? 1 : 0;
  } catch (err) {
    console.error('ÖLÜMCÜL HATA:', err);
    exitCode = 1;
  } finally {
    // fetch keep-alive soketleri server.close()'u askıya alabilir; kısa yarış + zorla çıkış.
    if (srv) await Promise.race([srv.close(), new Promise((r) => setTimeout(r, 1500))]);
    process.exit(exitCode);
  }
})();
