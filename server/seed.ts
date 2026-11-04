import { getPool, withTransaction } from './db.js';
import { RESOURCES } from './columns.js';
import { hashPassword } from './auth.js';
import { INITIAL_TDHP_ACCOUNTS, INITIAL_CASH_BOXES, INITIAL_BANK_ACCOUNTS } from '../src/data/tdhpAccounts.js';
import { INITIAL_BARCODE_TEMPLATES } from '../src/data/initialBarcodeTemplates.js';
import { INITIAL_ROLES } from '../src/data/initialRoles.js';
import { INITIAL_USERS } from '../src/data/initialUsers.js';
import type { PoolConnection } from 'mysql2/promise';

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

/**
 * İlk kurulumda kullanıcılara verilecek parolalar.
 * SEED_USER_PASSWORD tanımlıysa herkes için o kullanılır; aksi hâlde her
 * kullanıcıya rastgele bir parola üretilip bir kez konsola yazılır.
 */
function initialPasswordFor(): string {
  const fixed = process.env.SEED_USER_PASSWORD?.trim();
  if (fixed) return fixed;
  // Okunabilir ama tahmin edilemez: 4 harf + 4 rakam + özel karakter
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join('');
  return `${pick(letters, 4)}-${pick(digits, 4)}!`;
}

const seededCredentials: { username: string; password: string }[] = [];

const columnCache = new Map<string, Set<string>>();

async function tableColumns(table: string, conn: PoolConnection | null = null): Promise<Set<string>> {
  const cached = columnCache.get(table);
  if (cached) return cached;
  const rows = await runQuery(
    conn,
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  const set = new Set(rows.map((r: any) => String(r.COLUMN_NAME)));
  columnCache.set(table, set);
  return set;
}

/**
 * Sorguları verilen bağlantı üzerinden (transaction içi) ya da havuzdan çalıştırır.
 * `doSeed` hem normal başlangıçta (havuz) hem de "demo verilerine sıfırla"
 * işleminde (tek transaction) kullanıldığı için bağlantı dışarıdan geçirilir.
 */
function runQuery(
  conn: PoolConnection | null,
  sql: string,
  params: any[] = []
): Promise<any[]> {
  const runner: any = conn ?? getPool();
  return runner.query(sql, params).then(([rows]: [any[], any]) => rows as any[]);
}

function runQueryOne(
  conn: PoolConnection | null,
  sql: string,
  params: any[] = []
): Promise<any | null> {
  return runQuery(conn, sql, params).then((rows) => (rows.length ? rows[0] : null));
}

const JSON_COLUMNS: Record<string, string[]> = {
  assortmentTemplates: ['items'],
  barcodeTemplates: ['config'],
  products: ['colorBoxBarcodes', 'variantBarcodes', 'assortment', 'colorImages'],
  recipes: ['ingredients'],
  workOrders: ['assortmentBreakdown', 'stages'],
  settings: ['company', 'stock', 'order', 'production', 'finance', 'hr'],
  journalEntries: ['lines'],
  roles: ['permissions'],
};

/** Şemada olmayan alanları atarak güvenli INSERT üretir. */
async function insertRow(
  conn: PoolConnection | null,
  table: string,
  row: Record<string, any>
): Promise<number> {
  const cols = await tableColumns(table, conn);
  const jsonCols = JSON_COLUMNS[table] || [];
  const keys = Object.keys(row).filter((k) => cols.has(k));
  if (!keys.length) throw new Error(`${table} için eklenecek geçerli kolon yok.`);

  const values = keys.map((k) => {
    const v = row[k];
    if (jsonCols.includes(k)) return v === null || v === undefined ? null : JSON.stringify(v);
    if (v === undefined) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });

  const sql = `INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (${keys
    .map(() => '?')
    .join(', ')})`;

  const runner: any = conn ?? getPool();
  const [result] = await runner.query(sql, values);
  return (result as any).insertId;
}

async function tableCount(table: string, conn: PoolConnection | null = null): Promise<number> {
  const row = await runQueryOne(conn, `SELECT COUNT(*) AS n FROM \`${table}\``);
  return Number((row as any)?.n || 0);
}

/* ------------------------------------------------------------------ */
/* Seed                                                               */
/* ------------------------------------------------------------------ */

let seedPromise: Promise<{ created: boolean }> | null = null;

export function runSeed(): Promise<{ created: boolean }> {
  if (!seedPromise) {
    seedPromise = doSeed(null).catch((err) => {
      // Reddedilen promise önbellekte kalırsa geçici bir DB hatası seed'i
      // süreç ömrü boyunca kalıcı olarak devre dışı bırakırdı.
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

/**
 * "Demo verilerine sıfırla" işlemi: tüm tabloları boşaltıp demo veriyi baştan
 * yükler.
 *
 * Silme ve yeniden yükleme TEK transaction içinde, FK denetimi kapalıyken
 * yapılır. Ayrı transaction'larda çalıştırıldığında seed yarıda kalırsa (ör.
 * geçici bir hata) veritabanı boş ve kullanıcısız kalıyordu; bu durumda
 * `/ops/reseed`'i çağıracak bir Süper Admin bile kalmadığı için kurtarma
 * yalnızca `npm run db:restore` ile mümkündü. Artık hata hâlinde transaction
 * geri alınır ve mevcut veri olduğu gibi korunur.
 */
export async function reseed(): Promise<{ created: boolean }> {
  const tables = Object.values(RESOURCES).map((def) => def.table);

  const result = await withTransaction(async (conn) => {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const table of tables) await conn.query(`DELETE FROM \`${table}\``);
      return await doSeed(conn);
    } finally {
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  });

  // Sıfırlama sonrası önbelleklenmiş promise tazelenir.
  seedPromise = Promise.resolve(result);
  return result;
}

async function doSeed(conn: PoolConnection | null): Promise<{ created: boolean }> {
  let createdAnything = false;

  // 1. Ayarlar
  if ((await tableCount('settings', conn)) === 0) {
    await insertRow(conn, 'settings', {
      id: 'global_barcode',
      barcodeType: 'CODE-128',
      barcodePrefix: '869',
      nextBarcodeSequence: 1000000,
    });
    createdAnything = true;
  }

  // Arayüz her açılışta bu tekil kaydı okur; yoksa 404 üretmemesi için garanti altına alınır.
  if (!(await runQueryOne(conn, 'SELECT id FROM settings WHERE id = ? LIMIT 1', ['global_settings']))) {
    await insertRow(conn, 'settings', {
      id: 'global_settings',
      barcodeType: 'CODE-128',
      barcodePrefix: '869',
      nextBarcodeSequence: 1000000,
    });
    createdAnything = true;
  }

  // 2. TDHP hesap planı
  if ((await tableCount('accounts', conn)) === 0) {
    for (const acc of INITIAL_TDHP_ACCOUNTS) {
      await insertRow(conn, 'accounts', acc as any);
    }
    createdAnything = true;
  }

  // 3. Kasa ve banka hesapları
  if ((await tableCount('cashBoxes', conn)) === 0) {
    for (const box of INITIAL_CASH_BOXES) await insertRow(conn, 'cashBoxes', box as any);
    createdAnything = true;
  }
  if ((await tableCount('bankAccounts', conn)) === 0) {
    for (const bank of INITIAL_BANK_ACCOUNTS) await insertRow(conn, 'bankAccounts', bank as any);
    createdAnything = true;
  }

  // 4. Asorti şablonları
  if ((await tableCount('assortmentTemplates', conn)) === 0) {
    const templates = [
      {
        name: "Erkek Standart 40-45 (12'li Koli)",
        items: [
          { size: '40', quantity: 1 },
          { size: '41', quantity: 2 },
          { size: '42', quantity: 3 },
          { size: '43', quantity: 3 },
          { size: '44', quantity: 2 },
          { size: '45', quantity: 1 },
        ],
      },
      {
        name: "Kadın Standart 36-40 (12'li Koli)",
        items: [
          { size: '36', quantity: 1 },
          { size: '37', quantity: 3 },
          { size: '38', quantity: 4 },
          { size: '39', quantity: 3 },
          { size: '40', quantity: 1 },
        ],
      },
      {
        name: 'Taban & Fuspet Serisi 36-45 (10 Çift)',
        items: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45'].map((size) => ({ size, quantity: 1 })),
      },
      {
        name: "Çocuk 26-35 (10'lu Koli)",
        items: ['26', '27', '28', '29', '30', '31', '32', '33', '34', '35'].map((size) => ({ size, quantity: 1 })),
      },
    ];
    for (const t of templates) await insertRow(conn, 'assortmentTemplates', t);
    createdAnything = true;
  }

  // 5. Barkod / etiket şablonları
  if ((await tableCount('barcodeTemplates', conn)) === 0) {
    for (const t of INITIAL_BARCODE_TEMPLATES) await insertRow(conn, 'barcodeTemplates', t as any);
    createdAnything = true;
  }

  // 6. Personel + izin talepleri
  if ((await tableCount('employees', conn)) === 0) {
    const employees = [
      {
        employeeCode: 'PER-001',
        name: 'Mehmet Demir',
        tcNo: '28471930214',
        phone: '0532 555 10 20',
        email: 'mehmet.demir@dmr-nexus.example',
        department: 'KESİM',
        position: 'Kesimhane Şefi / Usta',
        hireDate: new Date('2023-01-15'),
        status: 'active',
        sgkStatus: 'sgk_li',
        salaryType: 'monthly_net',
        baseSalary: 38500,
        agreedNetSalary: 38500,
        paymentMethod: 'bank',
        bankName: 'Garanti BBVA',
        iban: 'TR44 0006 2000 1234 5678 9012 34',
        entitledAnnualLeave: 14,
        usedAnnualLeave: 3,
        bloodGroup: 'A Rh+',
        emergencyContact: 'Eşi Ayşe Demir (0533 111 22 33)',
        notes: 'Deri kesim kalıp tecrübesi 12 yıl.',
        createdAt: new Date(),
      },
      {
        employeeCode: 'PER-002',
        name: 'Fatma Yılmaz',
        tcNo: '19384729102',
        phone: '0544 444 33 22',
        email: 'fatma.yilmaz@dmr-nexus.example',
        department: 'SAYA',
        position: 'Saya Dikim & Çatım Ustası',
        hireDate: new Date('2023-06-01'),
        status: 'active',
        sgkStatus: 'sgk_li',
        salaryType: 'monthly_net',
        baseSalary: 32000,
        agreedNetSalary: 32000,
        paymentMethod: 'bank',
        bankName: 'İş Bankası',
        iban: 'TR55 0006 4000 9876 5432 1098 76',
        entitledAnnualLeave: 14,
        usedAnnualLeave: 5,
        bloodGroup: '0 Rh+',
        emergencyContact: 'Kardeşi Selim Yılmaz (0542 333 44 55)',
        notes: 'Saya overlok ve çift iğne uzmanı.',
        createdAt: new Date(),
      },
      {
        employeeCode: 'PER-003',
        name: 'Ali Kaya',
        tcNo: '48291039482',
        phone: '0555 777 88 99',
        department: 'MONTA',
        position: 'Monta & Kalıplama Ustası (Harici/Yevmiyeli)',
        hireDate: new Date('2024-03-10'),
        status: 'active',
        sgkStatus: 'sgk_siz',
        salaryType: 'daily',
        baseSalary: 1600,
        agreedNetSalary: 1600,
        paymentMethod: 'cash',
        entitledAnnualLeave: 0,
        usedAnnualLeave: 0,
        bloodGroup: 'B Rh+',
        emergencyContact: 'Oğlu Murat Kaya (0551 222 33 44)',
        notes: 'Günlük yevmiyeli harici monta ustası (SGK muafiyeti/yevmiyeli).',
        createdAt: new Date(),
      },
      {
        employeeCode: 'PER-004',
        name: 'Hasan Çelik',
        tcNo: '37281920391',
        phone: '0530 888 99 00',
        department: 'FİNİSAJ',
        position: 'Finisaj & Paketleme Elemanı',
        hireDate: new Date('2024-07-15'),
        status: 'active',
        sgkStatus: 'sgk_siz',
        salaryType: 'daily',
        baseSalary: 1400,
        agreedNetSalary: 1400,
        paymentMethod: 'cash',
        entitledAnnualLeave: 0,
        usedAnnualLeave: 0,
        bloodGroup: 'A Rh-',
        notes: 'Sezonluk paketleme personeli.',
        createdAt: new Date(),
      },
      {
        employeeCode: 'PER-005',
        name: 'Zeynep Aydın',
        tcNo: '58291029384',
        phone: '0536 123 45 67',
        email: 'zeynep.aydin@dmr-nexus.example',
        department: 'MUHASEBE & FİNANS',
        position: 'İK & Ön Muhasebe Uzmanı',
        hireDate: new Date('2022-09-01'),
        status: 'active',
        sgkStatus: 'sgk_li',
        salaryType: 'monthly_net',
        baseSalary: 42000,
        agreedNetSalary: 42000,
        paymentMethod: 'bank',
        bankName: 'Akbank',
        iban: 'TR33 0004 6000 5555 6666 7777 88',
        entitledAnnualLeave: 14,
        usedAnnualLeave: 2,
        bloodGroup: 'AB Rh+',
        notes: 'Personel özlük işleri ve genel muhasebe sorumlusu.',
        createdAt: new Date(),
      },
    ];

    const ids: number[] = [];
    for (const e of employees) ids.push(await insertRow(conn, 'employees', e));

    await insertRow(conn, 'leaveRequests', {
      employeeId: ids[1],
      employeeName: 'Fatma Yılmaz',
      leaveType: 'annual',
      startDate: '2026-09-10',
      endDate: '2026-09-12',
      days: 3,
      status: 'approved',
      reason: 'Yıllık izin kullanımı',
      approvedBy: 'Yönetim',
      createdAt: new Date(),
    });
    await insertRow(conn, 'leaveRequests', {
      employeeId: ids[0],
      employeeName: 'Mehmet Demir',
      leaveType: 'excuse',
      startDate: '2026-09-15',
      endDate: '2026-09-15',
      days: 1,
      status: 'pending',
      reason: 'Resmi daire işleri mazeret izni',
      createdAt: new Date(),
    });
    createdAnything = true;
  }

  // 7. Roller ve kullanıcılar
  if ((await tableCount('roles', conn)) === 0) {
    for (const role of INITIAL_ROLES) await insertRow(conn, 'roles', role as any);
    createdAnything = true;
  }

  if ((await tableCount('users', conn)) === 0) {
    const roleRows = await runQuery(conn, 'SELECT id, code FROM roles');
    const roleMap = new Map(roleRows.map((r) => [r.code, r.id]));

    for (const u of INITIAL_USERS) {
      const password = initialPasswordFor();
      const { hash, salt } = await hashPassword(password);
      await insertRow(conn, 'users', {
        ...u,
        roleId: roleMap.get(u.roleCode),
        passwordSalt: salt,
        passwordHash: hash,
      });
      seededCredentials.push({ username: u.username, password });
    }
    createdAnything = true;

    // Parolalar yalnızca bir kez, oluşturuldukları anda görüntülenir.
    console.log('');
    console.log('  İlk giriş parolaları (bu satırları güvenli bir yere kaydedin):');
    for (const c of seededCredentials) {
      console.log(`    • ${c.username.padEnd(12)} → ${c.password}`);
    }
    console.log('  Parolalar veritabanında scrypt ile geri döndürülemez biçimde saklanır.');
    console.log('');
  }

  // 8. Denetim kaydı
  if ((await tableCount('auditLogs', conn)) === 0) {
    const admin = await runQueryOne(conn, 'SELECT id FROM users WHERE username = ? LIMIT 1', ['mdemir']);
    const adminId = admin?.id || 1;
    const logs = [
      {
        userId: adminId,
        userName: 'Mehmet Demir',
        userRole: 'Süper Admin / Sistem Yöneticisi',
        action: 'system',
        module: 'system',
        description: 'DMR Nexus fabrika yönetim sistemi ve rol tabanlı yetkilendirme (RBAC) başarıyla kuruldu.',
        details: '7 adet temel sistem rolü ve departman kullanıcıları tanımlandı.',
        ipAddress: '192.168.1.100',
        timestamp: new Date('2026-09-01T08:00:00'),
      },
      {
        userId: adminId,
        userName: 'Mehmet Demir',
        userRole: 'Süper Admin / Sistem Yöneticisi',
        action: 'permission_change',
        module: 'users',
        description: 'Ön tanımlı departman yetki matrisleri kontrol edildi ve onaylandı.',
        ipAddress: '192.168.1.100',
        timestamp: new Date('2026-09-01T08:30:00'),
      },
      {
        userId: adminId,
        userName: 'Mehmet Demir',
        userRole: 'Süper Admin / Sistem Yöneticisi',
        action: 'login',
        module: 'auth',
        description: 'Sistem Yöneticisi başarıyla oturum açtı.',
        ipAddress: '192.168.1.100',
        timestamp: new Date(),
      },
    ];
    for (const l of logs) await insertRow(conn, 'auditLogs', l);
    createdAnything = true;
  }

  // 9. Merkezi renk kartları (color master)
  if ((await tableCount('colors', conn)) === 0) {
    // HEX değerleri src/lib/colorSwatches.ts paletiyle birebir aynıdır (uydurma değer yok).
    const colorRows = [
      { code: 'R-0001', name: 'SİYAH', groupName: 'Temel', hexCode: '#0F172A', rgbCode: '15, 23, 42' },
      { code: 'R-0002', name: 'BEYAZ', groupName: 'Temel', hexCode: '#FFFFFF', rgbCode: '255, 255, 255' },
      { code: 'R-0003', name: 'TABA', groupName: 'Temel', hexCode: '#B45309', rgbCode: '180, 83, 9' },
      { code: 'R-0004', name: 'LACİVERT', groupName: 'Temel', hexCode: '#1E3A8A', rgbCode: '30, 58, 138' },
      { code: 'R-0005', name: 'NATUREL', groupName: 'Astar', hexCode: '#F5F5F4', rgbCode: '245, 245, 244' },
    ];
    for (const c of colorRows) {
      await insertRow(conn, 'colors', { ...c, isActive: 1, createdAt: new Date(), updatedAt: new Date() });
    }
    createdAnything = true;
  }
  const siyahColor = await runQueryOne(conn, 'SELECT `id` FROM `colors` WHERE `name` = ? LIMIT 1', ['SİYAH']);
  const siyahColorId = Number((siyahColor as any)?.id || 0);

  // 10. Örnek ürünler, reçete ve iş emri
  if ((await tableCount('products', conn)) === 0) {
    const deriId = await insertRow(conn, 'products', {
      code: 'HAM-DERI-01',
      name: 'Siyah Hakiki Dana Derisi (Vidala)',
      categoryType: 'raw_material',
      subType: 'Deri',
      unit: 'dm²',
      stock: 15000,
      minStock: 2500,
      buyingPrice: 4.8,
      sellingPrice: 0,
      isRawMaterial: true,
      barcode: '869000100101',
      shelf: 'D-01',
      location: 'Hammadde Deri Deposu',
      accountingCode: '150.01',
    });

    const tabanId = await insertRow(conn, 'products', {
      code: 'YAR-TAB-01',
      name: 'TermoPatik Klasik Taban (Siyah)',
      categoryType: 'semi_finished',
      subType: 'Taban',
      unit: 'Çift',
      stock: 1200,
      minStock: 200,
      buyingPrice: 95.0,
      sellingPrice: 0,
      isRawMaterial: false,
      isFootwear: true,
      hasSizeVariants: true,
      moldCode: '018',
      moldGroup: 'ERKEK KLASİK (40-45)',
      shelf: 'T-03',
      location: 'Taban Deposu A-Blok',
      accountingCode: '152.01',
      variantBarcodes: [
        { size: '40', color: 'Siyah', barcode: '869100104001', stock: 150 },
        { size: '41', color: 'Siyah', barcode: '869100104101', stock: 250 },
        { size: '42', color: 'Siyah', barcode: '869100104201', stock: 350 },
        { size: '43', color: 'Siyah', barcode: '869100104301', stock: 250 },
        { size: '44', color: 'Siyah', barcode: '869100104401', stock: 150 },
        { size: '45', color: 'Siyah', barcode: '869100104501', stock: 50 },
      ],
    });

    const astarId = await insertRow(conn, 'products', {
      code: 'HAM-AST-01',
      name: 'Meşin Dana Astarı',
      categoryType: 'raw_material',
      subType: 'Astar',
      unit: 'dm²',
      stock: 6500,
      minStock: 1000,
      buyingPrice: 2.8,
      sellingPrice: 0,
      isRawMaterial: true,
      barcode: '869000200101',
      shelf: 'A-02',
      location: 'Astar Deposu',
      accountingCode: '150.01',
    });

    const bagcikId = await insertRow(conn, 'products', {
      code: 'AKS-BAG-01',
      name: 'Mumsu Yuvarlak Bağcık 90 cm (Siyah)',
      categoryType: 'accessory',
      subType: 'Bağcık',
      unit: 'Çift',
      stock: 2400,
      minStock: 500,
      buyingPrice: 4.5,
      sellingPrice: 0,
      isRawMaterial: true,
      barcode: '869000300101',
      shelf: 'B-04',
      location: 'Aksesuar Deposu',
      accountingCode: '150.02',
    });

    const kutuId = await insertRow(conn, 'products', {
      code: 'AKS-KUT-01',
      name: 'Kapaklı Karton Ayakkabı Kutusu (Standart)',
      categoryType: 'accessory',
      subType: 'Kutu',
      unit: 'Adet',
      stock: 3000,
      minStock: 600,
      buyingPrice: 12.0,
      sellingPrice: 0,
      isRawMaterial: true,
      barcode: '869000400101',
      shelf: 'K-01',
      location: 'Ambalaj Deposu',
      accountingCode: '150.02',
    });

    const shoe1Id = await insertRow(conn, 'products', {
      code: 'MAM-AYK-01',
      name: 'Oxford Klasik Hakiki Deri Erkek Ayakkabı',
      categoryType: 'finished',
      unit: 'Çift',
      stock: 180,
      minStock: 50,
      buyingPrice: 480.0,
      sellingPrice: 1250.0,
      isRawMaterial: false,
      isFootwear: true,
      hasSizeVariants: true,
      moldCode: '018',
      moldGroup: 'ERKEK KLASİK (40-45)',
      shelf: 'M-12',
      location: 'Mamul Sevkiyat Deposu',
      accountingCode: '157.01',
      variantBarcodes: [
        { size: '40', color: 'Siyah', barcode: '869200104001', stock: 20 },
        { size: '41', color: 'Siyah', barcode: '869200104101', stock: 35 },
        { size: '42', color: 'Siyah', barcode: '869200104201', stock: 50 },
        { size: '43', color: 'Siyah', barcode: '869200104301', stock: 40 },
        { size: '44', color: 'Siyah', barcode: '869200104401', stock: 25 },
        { size: '45', color: 'Siyah', barcode: '869200104501', stock: 10 },
      ],
    });

    if (siyahColorId) {
      await insertRow(conn, 'productColors', { productId: shoe1Id, colorId: siyahColorId, sortOrder: 0, createdAt: new Date() });
    }

    await insertRow(conn, 'recipes', {
      productId: shoe1Id,
      targetColor: 'Siyah',
      name: 'Oxford Klasik Deri Ayakkabı Standart BOM Reçetesi',
      laborCost: 140,
      estimatedTimeMinutes: 45,
      createdAt: new Date(),
      updatedAt: new Date(),
      ingredients: [
        { productId: deriId, department: 'KESİM', partName: 'SAYA DERİSİ', quantity: 22, unit: 'dm²', color: 'Siyah' },
        { productId: tabanId, department: 'MONTA', partName: 'TERMO TABAN', quantity: 1, unit: 'Çift', color: 'Siyah', isMatrixMatched: true },
        { productId: astarId, department: 'KESİM', partName: 'İÇ ASTAR', quantity: 14, unit: 'dm²', color: 'Naturel' },
        { productId: bagcikId, department: 'TEMİZLEME', partName: 'MUMSU BAĞCIK', quantity: 1, unit: 'Çift', color: 'Siyah' },
        { productId: kutuId, department: 'TEMİZLEME', partName: 'KARTON KUTU', quantity: 1, unit: 'Adet' },
      ],
    });

    const now = new Date();
    await insertRow(conn, 'workOrders', {
      productId: shoe1Id,
      quantity: 120,
      status: 'in_progress',
      currentStage: 'cutting',
      stages: [
        { stage: 'planning', stageName: 'Planlama', status: 'completed', startedAt: new Date(now.getTime() - 86400000), completedAt: new Date(now.getTime() - 72000000), operator: 'Ahmet Planlama' },
        { stage: 'cutting', stageName: 'Kesimhane', status: 'in_progress', startedAt: new Date(now.getTime() - 72000000), operator: 'Mehmet Kesimci' },
        { stage: 'sewing', stageName: 'Saya Dikim', status: 'pending' },
        { stage: 'assembly', stageName: 'Montaj & Kalıplama', status: 'pending' },
        { stage: 'finishing', stageName: 'Finisaj & Temizlik', status: 'pending' },
        { stage: 'completed', stageName: 'Tamamlandı (Mamul Depo)', status: 'pending' },
      ],
      barcode: 'WO-001024',
      orderNumber: 'SIP-2026-0042',
      customerName: 'Ziylan Mağazacılık A.Ş.',
      color: 'Siyah',
      size: '40-45 Asorti',
      materialStatus: 'materials_consumed',
      notes: 'Vitrin siparişi, saya derisi özenle seçilsin, kenar dikişleri çift sıra çekilsin.',
      createdAt: new Date(now.getTime() - 86400000),
    });
  }

  return { created: createdAnything };
}
