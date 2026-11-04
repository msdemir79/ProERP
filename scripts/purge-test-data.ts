/**
 * Test verisi temizleyici (komut satırı).
 *
 * Kullanım:
 *   npm run db:purge-test                 → kuru koşu: ne silinecek, listeler
 *   npm run db:purge-test -- --apply      → gerçekten siler (onay ister)
 *   npm run db:purge-test -- --apply --yes  → onay sormadan siler
 *   npm run db:purge-test -- --scope=1791237950413  → yalnızca bu belirteci taşıyan satırlar
 *   npm run db:purge-test -- --samples=20 → tablo başına daha fazla örnek satır
 *
 * Yalnızca `TEST-` işareti (veya test kod önekleri) taşıyan satırlar silinir;
 * işaretli olsa bile gerçek bir kayıt tarafından referanslanan satır atlanır ve
 * raporda uyarı olarak gösterilir. Silme, türetilmiş alanları (cari bakiyesi,
 * ürün stoğu, fatura ödenen tutarı, sipariş fatura toplamı, kasa/banka bakiyesi)
 * aynı transaction içinde geri hesaplar ve denetim izine yazılır.
 *
 * Bu araç sunucu makinesinden çalışır; HTTP API'den erişilemez.
 */
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { dbConfig, closePool, getPool, withTransaction } from '../server/db.js';
import { purgeTestData, type PurgeReport } from '../server/testDataPurge.js';

const args = process.argv.slice(2).filter((a) => a !== '--');
const apply = args.includes('--apply');
const skipConfirm = args.includes('--yes');
const argValue = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const scope = argValue('scope');
const sampleLimit = Number(argValue('samples') ?? '5');

function printReport(report: PurgeReport): void {
  console.log('');
  if (!report.tables.length) {
    console.log('  Silinecek işaretli test verisi bulunamadı.');
  } else {
    console.log(`  ${report.apply ? 'SİLİNEN' : 'SİLİNECEK'} KAYITLAR${report.scope ? ` (kapsam: ${report.scope})` : ''}`);
    console.log('  ' + '-'.repeat(66));
    for (const t of report.tables) {
      console.log(`  ${t.label.padEnd(20)} ${String(t.count).padStart(5)} satır${t.skipped ? `  (atlanan: ${t.skipped})` : ''}`);
      for (const s of t.samples) console.log(`      • ${s}`);
    }
    console.log('  ' + '-'.repeat(66));
    console.log(`  TOPLAM: ${report.total} satır${report.skippedTotal ? ` | atlanan: ${report.skippedTotal}` : ''}`);
  }

  if (report.apply) {
    const r = report.recalculated;
    const touched = [
      r.contacts ? `cari bakiyesi (${r.contacts})` : '',
      r.products ? `ürün stoğu (${r.products})` : '',
      r.invoices ? `fatura ödenen tutarı (${r.invoices})` : '',
      r.orders ? `sipariş fatura toplamı (${r.orders})` : '',
      r.cashBoxes ? `kasa bakiyesi (${r.cashBoxes})` : '',
      r.bankAccounts ? `banka bakiyesi (${r.bankAccounts})` : '',
    ].filter(Boolean);
    console.log(touched.length ? `\n  Geri hesaplanan türetilmiş alanlar: ${touched.join(', ')}` : '\n  Geri hesaplanması gereken türetilmiş alan yok.');
    console.log('  Denetim izine "Test verisi temizliği" kaydı yazıldı (Yönetim → Silinen Kayıtlar).');
  }

  for (const w of report.warnings) console.log(`\n  ⚠ ${w}`);
  console.log('');
}

async function confirm(database: string): Promise<boolean> {
  if (skipConfirm) return true;
  if (!stdin.isTTY) {
    console.error('\n  Onay verilemedi: interaktif terminal yok. --yes ile çalıştırın.\n');
    return false;
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    console.log(`\n  "${database}" veritabanından ${apply ? 'işaretli test verisi SİLİNECEK' : ''}.`);
    console.log('  Bu işlem geri alınamaz; tek kurtarma yolu bir yedekten dönmektir (npm run db:backup).');
    const answer = await rl.question(`  Devam etmek için veritabanı adını yazın (${database}): `);
    return answer.trim() === database;
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const database = dbConfig.database as string;
  console.log('\n======================================================');
  console.log(' DMR NEXUS — TEST VERİSİ TEMİZLİĞİ');
  console.log(` Hedef: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${database}`);
  console.log(` Mod  : ${apply ? 'UYGULA (--apply)' : 'KURU KOŞU (yalnızca listeler)'}`);
  console.log('======================================================');

  if (!apply) {
    console.log('\n  Hiçbir şey silinmeyecek. Gerçekten silmek için: npm run db:purge-test -- --apply');
  }

  getPool();
  if (apply && !(await confirm(database))) {
    console.log('\n  İptal edildi: onay eşleşmedi, hiçbir satır silinmedi.\n');
    await closePool();
    process.exitCode = 1;
    return;
  }

  const report = await withTransaction((conn) =>
    purgeTestData(conn, {
      apply,
      scope,
      sampleLimit: apply ? 0 : Number.isFinite(sampleLimit) ? sampleLimit : 5,
      reason: 'Komut satırı test verisi temizliği (db:purge-test)',
    }),
  );

  printReport(report);
  if (!apply && report.total > 0) {
    console.log('  Öneri: önce yedek alın (npm run db:backup), sonra --apply ile temizleyin.\n');
  }
  await closePool();
}

main().catch(async (err) => {
  console.error('\nTest verisi temizlenemedi:', (err as Error)?.message || err);
  console.error('İşlem transaction içindeydi; hata nedeniyle hiçbir satır silinmedi.\n');
  try {
    await closePool();
  } catch {
    /* yoksay */
  }
  process.exitCode = 1;
});
