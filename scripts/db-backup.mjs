/**
 * Tam veritabanı + görsel yedeklemesi.
 *
 * Kullanım:
 *   npm run db:backup                     (backups/<db>-<zaman>/ klasörü üretir)
 *   npm run db:backup -- --keep=20        (son 20 yedeği tut, eskisini sil)
 *   npm run db:backup -- --keep=0         (budama yapma)
 *
 * Çıktı düzeni:
 *   backups/<db>-<zaman>/
 *     dump.sql        mysqldump (single-transaction) tam SQL yedeği
 *     uploads/        data/uploads kopyası (görseller) — varsa
 *     manifest.json   zaman damgası, boyutlar, kaynak bilgisi
 *
 * Ortam değişkenleri:
 *   MYSQLDUMP_PATH  mysqldump tam yolu (PATH'te değilse)
 *   UPLOAD_DIR      görsel dizini (varsayılan: data/uploads)
 *   DB_*            .env içinden okunan bağlantı bilgileri
 *
 * Güvenlik: parola argv ile DEĞİL MYSQL_PWD env ile geçirilir (process-list'te görünmez).
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { resolveMysqlBin, binNotFoundMessage } from './mysql-bin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });

const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: String(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'proerp',
  user: process.env.DB_USER || 'proerp',
  password: process.env.DB_PASSWORD || '',
};

function uploadsDir() {
  const configured = process.env.UPLOAD_DIR || path.join('data', 'uploads');
  return path.isAbsolute(configured) ? configured : path.resolve(root, configured);
}

const argKeepRaw = process.argv.find((a) => a.startsWith('--keep='))?.split('=')[1];
const KEEP = argKeepRaw === undefined ? 10 : Math.max(0, Number(argKeepRaw) || 0);

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function dirSize(p) {
  let total = 0;
  const st = fs.statSync(p);
  if (st.isFile()) return st.size;
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    total += dirSize(path.join(p, entry.name));
  }
  return total;
}

async function askPassword() {
  if (cfg.password) return cfg.password;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(`Veritabanı parolası (${cfg.user}): `, resolve));
  rl.close();
  return answer;
}

async function main() {
  const dump = resolveMysqlBin('mysqldump', 'MYSQLDUMP_PATH');
  if (!dump) {
    console.error(binNotFoundMessage('mysqldump', 'MYSQLDUMP_PATH'));
    process.exit(1);
  }

  const password = await askPassword();

  const backupsRoot = path.join(root, 'backups');
  fs.mkdirSync(backupsRoot, { recursive: true });
  const stamp = timestamp();
  const outDir = path.join(backupsRoot, `${cfg.database}-${stamp}`);
  const dumpFile = path.join(outDir, 'dump.sql');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`mysqldump: ${dump}`);
  console.log(`Kaynak: ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
  console.log(`Hedef: ${outDir}`);

  const args = [
    `--host=${cfg.host}`,
    `--port=${cfg.port}`,
    `--user=${cfg.user}`,
    '--single-transaction',
    '--quick',
    '--routines',
    '--triggers',
    '--set-gtid-purged=OFF',
    `--result-file=${dumpFile}`,
    cfg.database,
  ];

  const result = spawnSync(dump, args, {
    encoding: 'utf8',
    env: { ...process.env, MYSQL_PWD: password },
  });

  if (result.error) {
    console.error('\nmysqldump çalıştırılamadı: ' + result.error.message + '\n');
    fs.rmSync(outDir, { recursive: true, force: true });
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error('\nYedekleme başarısız (mysqldump çıktı kodu ' + result.status + '):');
    const msg = (result.stderr || '').trim();
    if (msg) console.error(msg);
    console.error('');
    fs.rmSync(outDir, { recursive: true, force: true }); // eksik/bozuk klasör bırakma
    process.exit(1);
  }

  // Görselleri (data/uploads) yedeğe dahil et — DB kayıtları URL tutar, dosyalar ayrıdır.
  const srcUploads = uploadsDir();
  let uploadsCopied = false;
  let uploadsCount = 0;
  if (fs.existsSync(srcUploads)) {
    const destUploads = path.join(outDir, 'uploads');
    fs.cpSync(srcUploads, destUploads, { recursive: true });
    uploadsCopied = true;
    uploadsCount = fs.readdirSync(destUploads).filter((f) => fs.statSync(path.join(destUploads, f)).isFile()).length;
  }

  const dumpBytes = fs.statSync(dumpFile).size;
  const manifest = {
    createdAt: new Date().toISOString(),
    database: cfg.database,
    host: cfg.host,
    port: cfg.port,
    dumpFile: 'dump.sql',
    dumpBytes,
    uploads: uploadsCopied ? { dir: 'uploads', files: uploadsCount } : null,
    tool: 'DMR Nexus db:backup',
    format: 1,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const totalBytes = dirSize(outDir);
  console.log(`\nYedek alındı: ${outDir}`);
  console.log(`  dump.sql: ${(dumpBytes / 1024).toFixed(1)} KB`);
  console.log(`  uploads:  ${uploadsCopied ? `${uploadsCount} dosya` : 'yok (data/uploads bulunamadı)'}`);
  console.log(`  toplam:   ${(totalBytes / 1024).toFixed(1)} KB`);

  pruneOldBackups(backupsRoot, cfg.database);
  console.log('');
}

/** En yeni KEEP yedeği tutar, daha eski <db>-* klasörlerini siler. KEEP=0 → budama yok. */
function pruneOldBackups(backupsRoot, database) {
  if (!KEEP) return;
  const prefix = `${database}-`;
  const dirs = fs
    .readdirSync(backupsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
    .map((e) => e.name)
    .sort(); // zaman damgası ada gömülü → sözel sıralama kronolojiktir
  if (dirs.length <= KEEP) return;
  const toDelete = dirs.slice(0, dirs.length - KEEP);
  for (const name of toDelete) {
    fs.rmSync(path.join(backupsRoot, name), { recursive: true, force: true });
    console.log(`  eski yedek silindi: ${name}`);
  }
  console.log(`Retention: son ${KEEP} yedek tutuluyor (${toDelete.length} eski yedek silindi).`);
}

main().catch((err) => {
  console.error('\nYedekleme hatası: ' + (err?.message || err) + '\n');
  process.exit(1);
});
