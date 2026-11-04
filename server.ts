import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { createApiRouter } from './server/api.js';
import { testConnection, closePool } from './server/db.js';
import { uploadsDir } from './server/files.js';
import { runSeed } from './server/seed.js';

dotenv.config();

/**
 * Content-Security-Policy (yalnız üretimde uygulanır).
 *
 * `script-src 'self'` ana XSS savunmasıdır: dist/index.html yalnızca harici
 * modül script'i içerir (inline script yok), dolayısıyla 'unsafe-inline'/'unsafe-eval'
 * gerekmez. Stil/görsel/medya, Tailwind satır-içi stilleri, base64 ürün görselleri,
 * barkod SVG/PNG önizlemeleri ve canlı kamera barkod okuyucunun blob:/mediastream:
 * video akışı için bilinçli olarak esnek bırakılmıştır.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ');

/**
 * Tarayıcı güvenlik başlıkları. (Harici bağımlılık olmadan helmet eşdeğeri.)
 */
function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Barkod/karekod okuyucu kamera erişimi aynı kaynak ile sınırlıdır.
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=()');

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    // CSP ve HSTS yalnız üretimde: geliştirme Vite HMR/ws ve inline stillerini kırmamak için.
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    // HTTPS arkasında HSTS (HTTP üzerinden tarayıcılar bu başlığı yok sayar).
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

/**
 * CSRF koruması: durum değiştiren istekler yalnızca aynı kaynaktan gelebilir.
 * Oturum httpOnly + SameSite=Strict çerezle taşındığı için bu denetim ikinci katmandır.
 */
function csrfGuard(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  const site = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  const origin = req.headers.origin;
  if (site && site !== 'same-origin' && site !== 'none') {
    res.status(403).json({ error: 'Çapraz kaynaklı istek reddedildi.', code: 'CSRF_BLOCKED' });
    return;
  }
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (originHost && originHost !== req.headers.host) {
      res.status(403).json({ error: 'Çapraz kaynaklı istek reddedildi.', code: 'CSRF_BLOCKED' });
      return;
    }
  }
  next();
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  // Varsayılan olarak yalnızca yerel makineye bağlanır. LAN'a açmak için HOST=0.0.0.0
  // ayarlanmalıdır; bu durumda oturum/parola koruması devrededir.
  const HOST = process.env.HOST || '127.0.0.1';

  app.disable('x-powered-by');

  /**
   * Ters vekil sunucu (nginx vb.) arkasında doğru istemci IP'si için.
   * TRUST_PROXY ayarlanmazsa kapalıdır (varsayılan, doğrudan bağlantı):
   *   TRUST_PROXY=true      → tüm vekillere güven (yalnız tek vekil arkasında)
   *   TRUST_PROXY=1         → yalnızca ilk vekil atlamasına güven (önerilen)
   *   TRUST_PROXY=loopback  → loopback adreslerinden gelen X-Forwarded-For'a güven
   * Doğru IP, giriş rate-limit'inin ve denetim izininin çalışması için kritiktir.
   */
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    app.set('trust proxy', trustProxy === 'true' ? true : trustProxy === '1' ? 1 : trustProxy);
  }

  app.use(securityHeaders);
  app.use(express.json({ limit: '25mb' }));
  app.use(csrfGuard);

  // Bozuk JSON gövdesi net bir hata dönsün.
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err && err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'İstek gövdesi geçerli JSON değil.', code: 'INVALID_JSON' });
      return;
    }
    if (err && err.type === 'entity.too.large') {
      res.status(413).json({ error: 'İstek gövdesi çok büyük.', code: 'PAYLOAD_TOO_LARGE' });
      return;
    }
    next(err);
  });

  // Sağlık kontrolü — veritabanı bağlantısını da raporlar.
  app.get('/api/health', async (_req, res) => {
    const db = await testConnection();
    res.status(db.ok ? 200 : 503).json({
      status: db.ok ? 'ok' : 'db_error',
      database: db.ok
        ? {
            connected: true,
            version: process.env.NODE_ENV === 'production' ? undefined : db.version,
          }
        : { connected: false, error: db.error },
      timestamp: new Date().toISOString(),
    });
  });

  // REST API (oturum + RBAC denetimli)
  app.use('/api', createApiRouter());

  // Yüklenen görseller (#51): hash adıyla saklandığı için içerik değişmez,
  // uzun süre önbelleklenebilir. fallthrough:false → olmayan dosya SPA'ya
  // düşmez, doğrudan 404 verir.
  app.use(
    '/uploads',
    express.static(uploadsDir(), {
      maxAge: '365d',
      immutable: true,
      fallthrough: false,
      index: false,
      dotfiles: 'ignore',
    }),
  );

  // Vite (geliştirme) / statik dosyalar (üretim)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Bilinmeyen API yolu.' });
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const db = await testConnection();
  if (db.ok) {
    console.log(`MySQL bağlantısı kuruldu (${db.version}).`);
    try {
      const seeded = await runSeed();
      if (seeded.created) console.log('Başlangıç verileri yüklendi.');
    } catch (err: any) {
      console.error('Seed hatası:', err?.message || err);
    }
  } else {
    console.error('');
    console.error('!!! MySQL bağlantısı kurulamadı: ' + db.error);
    console.error('    .env dosyasındaki DB_* ayarlarını kontrol edin.');
    console.error('    Veritabanını kurmak için: npm run db:setup');
    console.error('');
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`DMR Nexus sunucusu http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} adresinde çalışıyor.`);
    if (HOST === '0.0.0.0') {
      console.warn('');
      console.warn('UYARI: Sunucu tüm ağ arayüzlerine (0.0.0.0) açık. Giriş yapmadan hiçbir veriye erişilemez,');
      console.warn('       ancak bu modu yalnızca güvenilir bir yerel ağda kullanın.');
      console.warn('');
    }
  });

  /**
   * Zarif kapanış: HTTP sunucusunu ve DB havuzunu kapatır. Yeni bağlantılar
   * reddedilir, açıkta kalan istekler için 10 sn sonra zorla çıkılır.
   */
  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} alındı — sunucu kapatılıyor...`);
    const forceExit = setTimeout(() => {
      console.error('Zarif kapanış zaman aşımına uğradı; süreç zorla sonlandırılıyor.');
      process.exit(1);
    }, 10_000);
    forceExit.unref();
    server.close(async () => {
      try {
        await closePool();
      } catch (err) {
        console.error('DB havuzu kapatılamadı:', err);
      }
      clearTimeout(forceExit);
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

/**
 * Yakalanmayan hatalar: üretimde sessiz çökme yerine loglanır. `uncaughtException`
 * süreci belirsiz bir duruma sokabileceği için loglanıp kapatılır (PM2/systemd
 * gibi bir süreç yöneticisi yeniden başlatır); `unhandledRejection` yalnızca loglanır.
 */
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  process.exit(1);
});

startServer();
