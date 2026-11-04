# DMR Nexus — Muhasebe ve Üretim

Ayakkabı ve imalat fabrikalarına özel; canlı kamera barkod/karekod okuyucu, üretim refakat kartı (rota fişi), reçeteli BOM hammadde sarfiyat düşümü, muhasebe, stok ve iş emri ERP yönetim sistemi.

## Marka

Uygulamanın adı **DMR Nexus**. Giriş ekranındaki logo ve uygulama simgesi `public/brand/` altında; yeni logo tasarım seçenekleri `branding/concepts/` altında bulunur. Resmi belgelerde kullanılan şirket unvanı ve şirket logosu firma ayarlarında ayrı tutulur.

## Modüller

| Modül | Kapsam |
|---|---|
| **Stok** | Ürün/hammadde kartları, asorti şablonları, renk×beden barkod varyantları, etiket tasarımcısı, barkod yazdırma |
| **Üretim** | İş emirleri, reçete (BOM), refakat kartı, kesim → saya → monta → finisaj bant takibi, hammadde sarfiyat düşümü, MRP |
| **Sipariş / İrsaliye / Fatura** | Beden matrisli sipariş girişi, sevk irsaliyesi, e-Fatura / e-Arşiv / e-İrsaliye (UBL-TR) |
| **Muhasebe** | TDHP hesap planı, yevmiye kaydı, mizan, kebir, çift taraflı kayıt doğrulama |
| **Finans** | Kasa, banka, çek/senet portföyü, tahsil makbuzu, yaşlandırma analizi |
| **İK** | Personel özlük, puantaj, izin, bordro, avans |
| **Yönetim** | Rol tabanlı yetkilendirme (RBAC), denetim kaydı (audit log), raporlar, ayarlar |

## Güvenlik

- **Oturum açma zorunludur.** Tüm `/api/*` uçları (sağlık kontrolü ve `POST /api/auth/login` hariç) geçerli bir oturum ister. Yetkilendirme istemcide değil **sunucuda** uygulanır: her istek, kaynağın bağlı olduğu modülün RBAC izniyle denetlenir (`server/auth.ts`, `server/registry.ts`, `server/api.ts`).
- **Parolalar scrypt (KDF) ile saklanır.** Tarayıcıda hash üretilmez. Eski kurulumlardaki `sha256` kayıtları, kullanıcının ilk başarılı girişinde otomatik olarak scrypt biçimine yükseltilir.
- **Oturum çerezi `httpOnly` + `SameSite=Strict`** olduğu için JavaScript oturum belirtecini okuyamaz; durum değiştiren istekler ayrıca `Sec-Fetch-Site`/`Origin` denetiminden geçer.
- **Giriş denemeleri sınırlıdır** (IP başına 30, kullanıcı başına 15 dakikada 8 hatalı deneme).
- **Hassas kolonlar dışa kapalıdır:** `passwordHash`/`passwordSalt` hiçbir API yanıtında dönmez ve istemci bu alanları yazamaz.
- **Yıkıcı işlemler Süper Admin'e kapalıdır:** tablo boşaltma (`POST /api/:kaynak/clear`), tüm verileri sıfırlama (`POST /api/ops/reseed`), `disableFkChecks` ile toplu geri yükleme. Üretim ortamında sıfırlama ek olarak `ALLOW_DESTRUCTIVE_OPS=true` gerektirir.
- **Denetim izi sunucu tarafından damgalanır:** kullanıcı kimliği, rol, IP ve zaman sunucudan yazılır; istemci yalnızca açıklama gönderir, `auditLogs` kaynağı istemciye salt-okunurdur.
- **Silme dört kademeli bir politikayla yürür** (`server/deletePolicy.ts`): kademe 0 = ilişkisi olmayan ana kartlar (cari/stok/personel) parolasız silinir; kademe 1 = belge taslakları, silinecek alt kayıtların önizlendiği bir uyarı ister; kademe 2 = finansal kayıtlar (cari hareket, makbuz, muhasebe fişi) **zorunlu gerekçe + oturum sahibinin parolası** ister; kademe 3 = hareket defteri ve kapalı muhasebe dönemi hiç silinemez. Bağlı kayıt varsa silme reddedilir (409), belge silindiğinde ona ait fiş/kalem/hareketler aynı transaction'da birlikte kalkar ve türetilmiş alanlar (cari bakiyesi, stok, fatura ödeme durumu) **ters kayıt üretilmeden** geri hesaplanır.
- **Silme kalıcıdır; anlık görüntü tutulmaz.** Kim/ne zaman/hangi kayıt/gerekçe bilgisi denetim izine yazılır ve **Yönetim → Kullanıcı & Yetki → "Silinen Kayıtlar"** sekmesinden izlenir; hatalı parola denemeleri de (`delete_denied`) listelenir. Geri dönüşün tek yolu `npm run db:restore` ile bir yedeği yüklemektir.
- **Sunucu varsayılan olarak yalnızca `127.0.0.1` dinler.** Yerel ağa açmak için `.env` içinde `HOST=0.0.0.0` ayarlanır.

## Kurulum

**Gereksinimler:** Node.js 20+, MySQL 8.0+

```bash
npm install

# Veritabanını kurar: .env oluşturur, veritabanını ve kullanıcıyı
# açar, db/schema.sql'i uygular. Root şifresini sorar.
npm run db:setup

npm run dev
```

Uygulama http://localhost:3000 adresinde açılır ve **giriş ekranı** gelir.

İlk kurulumda kullanıcı parolaları sunucu konsoluna bir kez yazılır:

```
  İlk giriş parolaları (bu satırları güvenli bir yere kaydedin):
    • mdemir       → KxTq-4821!
    • ayildiz      → ...
```

Tüm demo kullanıcılara ortak bir parola vermek isterseniz `npm run db:setup` öncesinde `.env` içine `SEED_USER_PASSWORD=<parola>` yazın. Parolayı kaybettiyseniz komut satırından sıfırlayabilirsiniz:

```bash
npm run user:password -- --list                  # kullanıcı adlarını listeler
npm run user:password -- mdemir                  # rastgele yeni parola üretir
npm run user:password -- mdemir YeniParola1      # parolayı doğrudan atar
```

Parola sıfırlamasından sonra sunucuyu yeniden başlatın.

### Mevcut bir kurulumu güncelleme

Şema değişiklikleri `db/migrations/` altında numaralı `.sql` dosyalarıyla yönetilir. Mevcut bir veritabanını güncellemek için:

```bash
npm run db:backup     # 1. önce yedek al (önerilir)
npm run db:migrate    # 2. uygulanmamış geçişleri sırayla uygular
```

`db:migrate` yalnızca `schema_migrations` tablosunda işaretli olmayan dosyaları uygular; tekrar çalıştırmak güvenlidir.

> **Önemli — MySQL DDL otomatik commit eder.** Bir geçiş dosyası hata verirse dosyanın bir kısmı uygulanmış olabilir ama dosya `schema_migrations`'a işaretlenmez. Hata mesajındaki adımları izleyin: veritabanının gerçek durumunu kontrol edin, gerekirse yedekten dönün, sonra tekrar `db:migrate` çalıştırın.

> **Şema kuralı:** Yeni bir migration eklediğinizde aynı değişikliği `db/schema.sql`'e de işleyin. `schema.sql` her zaman güncel şemayı temsil eder; taze kurulumda (`db:setup`) tüm migration dosyaları taban çizgisi olarak otomatik işaretlenir, böylece `db:migrate` idempotent olmayan dosyaları yeniden uygulamaya kalkmaz.

Eski bir sürümden geliyorsanız: bu sürümde kimlik doğrulama sunucuya taşındı; `db/schema.sql` içinden `pinCode`, `sessionToken` ve `sessionExpiresAt` kolonları kaldırıldı (`db/migrations/001-security-hardening.sql`). Eski `sha256` parola kayıtları korunur; her kullanıcı ilk başarılı girişinde parolası otomatik olarak scrypt biçimine yükseltilir (parola değişmez).

> Eski sürüme geri dönmek isterseniz: geri döndükten sonra kullanıcıların parolaları scrypt biçiminde olduğu için giriş yapamazlar; `npm run user:password` ile parola atamanız gerekir.

Veriler yerel MySQL veritabanında saklanır. Sunucu ilk açılışta boş tabloları örnek fabrika verileriyle (TDHP hesap planı, hammadde/mamul ürünler, reçeteler, personel) otomatik doldurur. Bağlantı bilgileri `.env` dosyasından okunur (`.env.example` şablonundan üretilir).

> `npm run db:setup` yerine kurulumu elle yapmak isterseniz: `db/schema.sql` dosyasını MySQL'de çalıştırın, ardından `.env` içindeki `DB_*` değerlerini kendi kullanıcı bilgilerinizle doldurun. Elle kurulumda taban çizgisi işaretlenmez; sonrasında `npm run db:migrate` çalıştırmayın (migration'lar zaten schema.sql içindedir).

### Üretime dağıtım (deployment)

Her adımda hata olursa durun, düzeltmeden bir sonraki adıma geçmeyin.

```bash
# 1. Yedek al (geri dönüş noktası)
npm run db:backup

# 2. Şema geçişlerini uygula
npm run db:migrate

# 3. Üretim derlemesi
npm run build

# 4. Uygulamayı başlat (NODE_ENV=production'a zorlar)
npm start

# 5. Sağlık kontrolü (ayrı bir terminalden)
curl http://localhost:3000/api/health
```

`/api/health` `{"ok":true,...}` ve MySQL sürümünü döndürür. Hata görürseniz `npm start` çıktısındaki logları inceleyin.

**Geri dönüş (restore):** Bir geçiş veya derleme üretim verisini bozarsa, `npm run db:restore` ile bir yedekten geri dönün. Önce yedekleri listeleyin, sonra seçtiğiniz klasörü geri yükleyin:

```bash
npm run db:restore -- --list                              # mevcut yedekler
npm run db:restore -- backups/proerp-<zaman>              # önizleme (yıkıcı değil)
npm run db:restore -- backups/proerp-<zaman> --force      # GERÇEKTEN geri yükle
```

`db:restore`, yedek klasöründeki `dump.sql`'i hedef veritabanına yükler ve `uploads/` görsellerini `data/uploads/`'a geri kopyalar. `--force` olmadan yalnızca ne yapacağını gösterir; interaktif terminalde ayrıca veritabanı adını yazarak onay ister. **Bu işlem geri alınamaz** — restore'dan önce güncel bir `db:backup` alın.

**Kalıcı olması gerekenler:** Yüklenen görseller `data/uploads/` altında, yedekler `backups/` altında tutulur (ikisi de `.gitignore`'dadır). Dağıtımda bu dizinler korunmalı ve ayrıca yedeklenmelidir.

**Üretim `.env` ayarları:** `NODE_ENV=production`, `COOKIE_SECURE=true` (HTTPS arkasında), gerektiğinde `TRUST_PROXY` (ters vekil arkasında doğru istemci IP'si için) ve `HOST` (yalnız güvenilir ağda `0.0.0.0`).

### Yedekleme ve geri yükleme

`npm run db:backup`, **taşınabilir ve eksiksiz** bir yedek üretir: veritabanının tam SQL dökümü (`mysqldump --single-transaction`, tutarlı anlık görüntü) **ve** `data/uploads/` altındaki görseller (DB kayıtları görsel URL'lerini tutar; dosyalar ayrıdır, bu yüzden ikisi birlikte yedeklenmelidir).

```
backups/<veritabanı>-<zaman>/
  dump.sql        tam SQL yedeği
  uploads/        görsellerin kopyası (varsa)
  manifest.json   zaman damgası, boyutlar, kaynak bilgisi
```

- Parola komut satırına (argv) yazılmaz; `MYSQL_PWD` ortam değişkeniyle geçirilir, böylece process listesinde görünmez.
- `mysqldump`/`mysql` PATH'te değilse `MYSQLDUMP_PATH` / `MYSQL_PATH` ile tam yolu verin (Windows'ta yaygın kurulum dizinleri otomatik aranır).
- **Retention:** `--keep=N` son N yedeği tutar, eskisini siler (varsayılan 10; `--keep=0` budamayı kapatır).

Geri yükleme için yukarıdaki [Geri dönüş (restore)](#üretim-dağıtım-deployment) adımlarını izleyin.

> **Uygulama içi JSON aracı tam yedek değildir.** Ayarlar → Şirket ekranındaki "Veri Dışa Aktarma (JSON)" yalnızca kayıtları dışa/içe aktarır; görselleri, belge/fiş sayaçlarını ve denetim izini içermez. Taşınabilir tam yedek ve güvenli geri dönüş için `db:backup` / `db:restore` kullanın.

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusunu başlatır (Express + Vite middleware, port 3000) |
| `npm run db:setup` | Veritabanını, uygulama kullanıcısını ve tabloları kurar (geçiş taban çizgisini işaretler) |
| `npm run db:migrate` | `db/migrations/*.sql` geçişlerini sırayla uygular ve `schema_migrations`'ta işaretler |
| `npm run db:backup` | Tam yedek alır → `backups/<veritabanı>-<zaman>/` (`dump.sql` + `uploads/` + `manifest.json`); `--keep=N` ile eski yedekleri budar |
| `npm run db:restore` | Bir yedek klasöründen geri yükler (`--list`, `--force`); SQL + görseller. Yıkıcı, geri alınamaz |
| `npm run db:purge-test` | İşaretli test verisini (`TEST-…` / `TD-` / `TF3` / `TF4` / `TRP` / `RBAC-`) FK sırasıyla temizler. Varsayılan kuru koşu; `-- --apply` ile siler (`--yes`, `--scope=`, `--samples=`) |
| `npm run db:columns` | `db/schema.sql`'den `server/columns.ts` kaynak tanımlarını üretir |
| `npm run user:password` | Komut satırından kullanıcı parolası sıfırlar (kilitlenme kurtarma) |
| `npm run seed:users` | Eksik rol kullanıcılarını eklemeli açar (`--apply` ile yazar; var olan kullanıcıya dokunmaz) |
| `npm run build` | Üretim derlemesi (`dist/`) |
| `npm start` | Derlenmiş uygulamayı çalıştırır |
| `npm run lint` | TypeScript tip kontrolü (`tsc --noEmit`) |
| `npm test` | Birim testleri (bordro, maliyet, muhasebe doğrulayıcı) |
| `npm run test:integration` | API + eşzamanlılık + silme kapısı entegrasyon testleri (canlı DB) |
| `npm run test:delete` | Silme politikası motorunun uçtan uca testleri (kademe 0–3, fatura↔fiş, guard'lar) |
| `npm run test:rbac` | Rol bazlı yetki matrisi testleri (ayrı geçici MySQL üzerinde çalışır; mevcut şirket verisini kullanmaz) |
| `npm run test:colors` | Merkezi renk modülü testleri (birim + entegrasyon) |
| `npm run test:load` | Yazma uçlarına eşzamanlı yük testi (p50/p95/p99 gecikme raporu) |

> **Test verisi kendi kendini temizler.** Entegrasyon suite'leri (`test:integration`, `test:delete`, `test:colors`, `test:load`) canlı veritabanına karşı koşar ve her koşu sonunda işaretli (`TEST-…`, `TD-`, `TF3`, `TF4`, `TRP`) satırları `purgeTestResidue` ile kaldırır. Elle temizlik gerekirse `npm run db:purge-test` (kuru koşu) ve `npm run db:purge-test -- --apply` kullanılır; araç yalnızca sunucu makinesinden çalışır, işaretli satırları FK sırasıyla tek transaction'da siler ve sonucu denetim izine yazar. **Uygulama içi silme kurallarını ve hareket defterinin değiştirilemezliğini etkilemez.**

## Mimari Notlar

- **Ön yüz:** React 19 + TypeScript + Vite, Tailwind CSS 4, react-router-dom 7
- **Veri:** MySQL 8 (InnoDB, `utf8mb4_turkish_ci`). Şema `db/schema.sql`; kolon adları TypeScript arayüzleriyle birebir aynıdır
- **API:** Express REST katmanı (`server/api.ts`). Kaynak tanımları `server/columns.ts` (otomatik üretilir) ve `server/registry.ts` (arama/sıralama/guard meta verisi)
- **Ön yüz veri erişimi:** `src/api/client.ts` üzerinden 30 kaynak için tipli istemci; salt-okunur sorgular `src/hooks/useApiQuery.ts`, canlı güncellemeler `/api/events` SSE akışı ile
- **Toplu işlemler:** Çok adımlı yazma işlemleri `POST /api/ops/commit` ile tek MySQL transaction'ında uygulanır
- **İş mantığı:** `src/services/` altındaki servis katmanı (erpService, accountingService, financeService, hrService, userService)
- **Saf hesaplamalar:** `src/lib/` (accountingValidator, payrollCalculator, inventoryCalculator, turkishUtils)
- **Sunucu:** Express, geliştirmede Vite middleware, üretimde statik dosya sunumu
- **Kimlik doğrulama:** `server/auth.ts` — scrypt parola saklama, bellekte oturum deposu, kaynak→modül/eylem izin denetimi, giriş hız sınırlayıcı. Oturum `httpOnly` çerez ile taşınır (`Authorization: Bearer <token>` de desteklenir)
- **Denetim izi:** `server/audit.ts` — tüm kayıtlar sunucu tarafında, asıl işlemle **aynı transaction** içinde üretilir (kimlik/rol/IP/zaman sunucudan). Kritik kaynakların (kullanıcı/rol/cari/ürün/fatura/kasa/banka/çek/makbuz/fiş/sipariş/irsaliye/iş emri/bordro/ayar) generic yazımları ve tüm kontrollü `ops` işlemleri otomatik auditlenir. `auditLogs` salt-okunur ve değiştirilemezdir: istemcinin denetim kaydı üretmesine veya geçmişi silmesine izin verilmez
- **Silme politikası:** `server/deletePolicy.ts` — her kaynak için kademe, özet, cascade listesi, guard ve türetilmiş alan geri yazımı tek yerde tanımlıdır. `GET /api/:kaynak/delete-plan/:id` arayüzün göstereceği uyarı/gerekçe/parola bilgilerini döner; `DELETE /api/:kaynak/:id` (ve `bulk-delete`) planı doğrular, kademe 2'de gerekçe+parola ister, silmeyi ve denetim kaydını **aynı transaction** içinde yazar. Hareket defteri tabloları (`inventoryLogs`) yazma isteklerini API katmanında reddeder.
- **Yetki matrisi:** Kaynak→modül eşlemesi `server/registry.ts` içindeki `module` alanındadır. `settings`, `contacts` ve `products` oturum sahibi herkesin okuyabildiği ortak referans verileridir; yazma her zaman modül iznine bağlıdır
- **Yetki simülasyonu:** Süper admin, `POST /api/auth/impersonate` ile bir kullanıcının yetkileriyle oturum açabilir. `impersonate/stop` kendi oturumuna döner; her geçiş denetim izine kaydedilir ve arayüzde bildirilir
- **Yazdırma / PDF:** iframe tabanlı yazdırma servisi, html2canvas + jsPDF
- **Barkod:** html5-qrcode ile kamera okuyucu, Code-128 / QR üretimi
