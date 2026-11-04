// DMR Nexus veritabanı kurulumu.
//
// Kullanım:
//   npm run db:setup                              (root şifresini sorar)
//   npm run db:setup -- --root-password=xxxxx     (şifreyi komut satırından verir)
//
// Yaptığı işler:
//   1. .env yoksa .env.example'dan oluşturur
//   2. Veritabanını (DB_NAME) utf8mb4_turkish_ci ile kurar
//   3. Uygulama kullanıcısını (DB_USER) oluşturur ve yetkilendirir
//   4. db/schema.sql dosyasını uygular
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (!fs.existsSync(envPath)) {
  fs.copyFileSync(examplePath, envPath);
  console.log('.env dosyası .env.example üzerinden oluşturuldu.');
}

dotenv.config({ path: envPath });

const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'proerp',
  user: process.env.DB_USER || 'proerp',
  password: process.env.DB_PASSWORD || '',
};

const argRootUser = process.argv.find((a) => a.startsWith('--root-user='))?.split('=')[1];
const argRootPass = process.argv.find((a) => a.startsWith('--root-password='))?.split('=')[1];

async function askRootPassword() {
  if (argRootPass !== undefined) return argRootPass;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(`MySQL root şifresi (${argRootUser || 'root'}): `, resolve);
  });
  rl.close();
  return answer;
}

function splitStatements(sql) {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const rootUser = argRootUser || process.env.DB_ROOT_USER || 'root';
  const rootPass = await askRootPassword();

  console.log(`\nMySQL'e bağlanılıyor: ${cfg.host}:${cfg.port} (kullanıcı: ${rootUser})`);

  let admin;
  try {
    admin = await mysql.createConnection({
      host: cfg.host,
      port: cfg.port,
      user: rootUser,
      password: rootPass,
      multipleStatements: false,
      charset: 'utf8mb4',
    });
  } catch (err) {
    console.error('\nRoot bağlantısı kurulamadı: ' + err.message);
    console.error('Şifreyi kontrol edin veya şu şekilde çalıştırın:');
    console.error('  npm run db:setup -- --root-password=SIFRE\n');
    process.exit(1);
  }

  console.log('Bağlantı kuruldu.');

  let schema = fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8');
  if (cfg.database !== 'proerp') {
    schema = schema.replace(/CREATE DATABASE IF NOT EXISTS proerp/g, `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\``);
    schema = schema.replace(/^USE proerp;/m, `USE \`${cfg.database}\`;`);
  }

  for (const stmt of splitStatements(schema)) {
    await admin.query(stmt);
  }
  console.log(`Veritabanı ve tablolar hazır: ${cfg.database}`);

  const esc = (v) => `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  const userEsc = esc(cfg.user).slice(1, -1);
  const passEsc = esc(cfg.password);
  const hosts = cfg.host === 'localhost' ? ['localhost', '%'] : ['%'];

  for (const h of hosts) {
    const account = `'${userEsc}'@'${h}'`;
    await admin.query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${passEsc}`);
    await admin.query(`ALTER USER ${account} IDENTIFIED BY ${passEsc}`);
    await admin.query(`GRANT ALL PRIVILEGES ON \`${cfg.database}\`.* TO ${account}`);
  }
  await admin.query('FLUSH PRIVILEGES');
  console.log(`Uygulama kullanıcısı hazır: ${cfg.user} (${hosts.join(', ')})`);

  await admin.end();

  const app = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    charset: 'utf8mb4',
  });
  const [rows] = await app.query('SHOW TABLES');
  console.log(`\nKurulum tamam. ${rows.length} tablo oluşturuldu.`);

  // Geçiş taban çizgisi (baseline): db/schema.sql her zaman tüm migration'ları
  // içerecek şekilde güncel tutulur. Taze kurulumda schema.sql uygulandığı için
  // mevcut migration dosyaları zaten "uygulanmış" sayılır; bunları
  // schema_migrations'a işaretliyoruz ki sonraki `npm run db:migrate`
  // (idempotent olmayan) dosyaları yeniden uygulayıp hata vermesin.
  await markMigrationsAsApplied(app);

  console.log('Şimdi çalıştırabilirsiniz: npm run dev\n');
  await app.end();
}

/**
 * db/migrations/*.sql dosyalarını schema_migrations'ta "uygulanmış" işaretler.
 * Yalnızca taze kurulumda (schema.sql zaten güncel şemayı oluşturduğu için)
 * çağrılır. Tek tek INSERT IGNORE ile yapılır; tekrar çalıştırmada güvenlidir.
 */
async function markMigrationsAsApplied(conn) {
  const migrationsDir = path.join(root, 'db', 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (!files.length) return;

  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id        VARCHAR(255) NOT NULL,
      appliedAt DATETIME     NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
  `);
  for (const file of files) {
    await conn.query(
      'INSERT IGNORE INTO schema_migrations (id, appliedAt) VALUES (?, NOW())',
      [file],
    );
  }
  console.log(`Geçiş taban çizgisi işaretlendi: ${files.length} migration (schema.sql güncel kabul edildi).`);
}

main().catch((err) => {
  console.error('\nKurulum hatası: ' + (err?.message || err));
  process.exit(1);
});
