/**
 * Docker giriş noktası: veritabanını hazırlar, ardından production sunucusunu başlatır.
 *
 * - Boş veritabanı  → `npm run db:setup` eşdeğeri (şema, taban çizgisi, uygulama kullanıcısı)
 * - Mevcut veritabanı → `npm run db:migrate` eşdeğeri (yalnızca yeni geçişler)
 * - Sonra `scripts/start.mjs` (her zaman production modunda) çalışır.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const host = process.env.DB_HOST || 'db';
const port = Number(process.env.DB_PORT || 3306);
const dbName = process.env.DB_NAME || 'proerp';
const rootUser = process.env.DB_ROOT_USER || 'root';
const rootPass = process.env.DB_ROOT_PASSWORD || '';
const attempts = 60;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectAdmin() {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await mysql.createConnection({
        host,
        port,
        user: rootUser,
        password: rootPass,
        charset: 'utf8mb4',
      });
    } catch (err) {
      lastError = err;
      console.log(`MySQL hazir degil (${i}/${attempts}): ${err?.code || err?.message}`);
      await sleep(2000);
    }
  }
  throw lastError;
}

async function isFreshDatabase() {
  const admin = await connectAdmin();
  try {
    const [dbs] = await admin.query('SHOW DATABASES LIKE ?', [dbName]);
    if (!dbs.length) return true;
    const [tables] = await admin.query('SHOW TABLES FROM ?? LIKE ?', [dbName, 'users']);
    return tables.length === 0;
  } finally {
    await admin.end();
  }
}

function runScript(name) {
  const file = fileURLToPath(new URL(`./${name}`, import.meta.url));
  console.log(`\n>> ${name}`);
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  const fresh = await isFreshDatabase();
  runScript(fresh ? 'db-setup.mjs' : 'db-migrate.mjs');
  console.log('\n>> Sunucu baslatiliyor...\n');
  await import('./start.mjs');
} catch (err) {
  console.error('\nBaslatma hatasi: ' + (err?.message || err));
  process.exit(1);
}
