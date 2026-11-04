/**
 * DMR Nexus Faz 4 — Load Testi (item 10): YAZMA uçları.
 *
 * In-process harness sunucusuna (gerçek API + gerçek MySQL + RBAC) eşzamanlı
 * POST/PATCH/DELETE istekleri gönderir; gecikme yüzdeliklerini (p50/p90/p95/p99),
 * throughput ve hata oranını raporlar. Oluşturulan tüm kayıtlar sonunda silinir
 * (DELETE fazı hem temizlik hem de yazma yükü ölçümüdür).
 *
 * Çalıştırma:
 *   npm run test:load
 *   LOAD_N=500 LOAD_CONCURRENCY=50 npm run test:load   (Windows: set LOAD_N=500 && ...)
 */
import { startTestServer, api, runPool, summarizeLatency, purgeTestResidue, type TestServer } from './harness.js';

const N = Number(process.env.LOAD_N || 150);
const C = Number(process.env.LOAD_CONCURRENCY || 20);
const RUN = Date.now();
let srv: TestServer;

const fmt = (n: number): string => (Number.isFinite(n) ? n.toFixed(1) : '0.0');

interface PhaseResult {
  errors: number;
  total: number;
  durationMs: number;
  p95: number;
  p99: number;
}

function reportPhase(name: string, res: { latencies: number[]; errors: number; durationMs: number; total: number }): PhaseResult {
  const s = summarizeLatency(res.latencies);
  const throughput = res.durationMs > 0 ? res.total / (res.durationMs / 1000) : 0;
  const errRate = res.total ? (res.errors / res.total) * 100 : 0;
  console.log(`\n── ${name} ──`);
  console.log(`  İstek: ${res.total} | Hata: ${res.errors} (%${fmt(errRate)}) | Süre: ${res.durationMs} ms | Throughput: ${fmt(throughput)} req/s`);
  console.log(`  Gecikme (ms): min ${fmt(s.min)} | avg ${fmt(s.avg)} | p50 ${fmt(s.p50)} | p90 ${fmt(s.p90)} | p95 ${fmt(s.p95)} | p99 ${fmt(s.p99)} | max ${fmt(s.max)}`);
  return { errors: res.errors, total: res.total, durationMs: res.durationMs, p95: s.p95, p99: s.p99 };
}

async function main(): Promise<void> {
  srv = await startTestServer(1);
  console.log('\n======================================================');
  console.log(' DMR NEXUS FAZ 4 — LOAD TESTİ (YAZMA UÇLARI)');
  console.log(` Hedef: ${srv.baseUrl} | İstek/faz: ${N} | Eşzamanlılık: ${C}`);
  console.log('======================================================');

  const createdIds: number[] = [];
  const indexItems = Array.from({ length: N }, (_, i) => i);

  // FAZ 1 — POST /contacts (oluşturma)
  const res1 = await runPool(indexItems, C, async (i) => {
    const r = await api(srv, 'POST', '/contacts', {
      name: `TEST-FAZ4 ${RUN}-${i}`,
      code: `TF4-${RUN}-${i}`,
      type: 'customer',
    });
    if (r.status !== 201) throw new Error(`POST ${r.status}: ${r.text.slice(0, 120)}`);
    createdIds.push(Number((r.data as any)?.data ?? r.data));
  });
  const p1 = reportPhase('FAZ 1 — POST /contacts (oluşturma)', res1);

  // FAZ 2 — PATCH /contacts/:id (güncelleme)
  const res2 = await runPool(createdIds, C, async (id) => {
    const r = await api(srv, 'PATCH', `/contacts/${id}`, { description: `TEST-FAZ4 patched ${RUN}` });
    if (r.status !== 200) throw new Error(`PATCH ${r.status}: ${r.text.slice(0, 120)}`);
  });
  const p2 = reportPhase('FAZ 2 — PATCH /contacts (güncelleme)', res2);

  // FAZ 3 — DELETE /contacts/:id (silme + temizlik)
  const res3 = await runPool(createdIds, C, async (id) => {
    const r = await api(srv, 'DELETE', `/contacts/${id}`);
    if (r.status !== 200) throw new Error(`DELETE ${r.status}: ${r.text.slice(0, 120)}`);
  });
  const p3 = reportPhase('FAZ 3 — DELETE /contacts (silme + temizlik)', res3);

  const totalReqs = p1.total + p2.total + p3.total;
  const totalErrors = p1.errors + p2.errors + p3.errors;
  const totalMs = p1.durationMs + p2.durationMs + p3.durationMs;
  const overallThroughput = totalMs > 0 ? totalReqs / (totalMs / 1000) : 0;

  console.log('\n======================================================');
  console.log(` LOAD ÖZETİ: ${totalReqs} istek, ${totalErrors} hata, ${totalMs} ms, ${fmt(overallThroughput)} req/s`);
  console.log(` En kötü p99: ${fmt(Math.max(p1.p99, p2.p99, p3.p99))} ms`);
  console.log(` SONUÇ: ${totalErrors === 0 ? 'BAŞARILI (hata yok)' : 'HATALI (' + totalErrors + ' istek başarısız)'}`);
  console.log('======================================================\n');

  await srv.close();
  await purgeTestResidue('Yük testi');
  process.exit(totalErrors === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('LOAD TEST HARİCİ HATA:', err);
  try { await srv?.close(); } catch { /* yoksay */ }
  await purgeTestResidue('Yük testi');
  process.exit(1);
});
