# DMR Nexus — Derinlemesine analiz ve ERP gelişim raporu

**Tarih:** 15 Ekim 2026  
**İncelenen proje:** `E:\ProERP`  
**Git tabanı:** `cdadf81`; analiz bu commit üzerindeki mevcut, commit edilmemiş çalışma dosyalarını da kapsar.  
**Hedef işletme:** Ayakkabı/imalat işletmesi. Öncelikler bu bağlama göre belirlenmiştir.

## 1. Yönetici değerlendirmesi

DMR Nexus; stok, renk/beden, asorti, reçete, iş emri, kalıp, sipariş, irsaliye, fatura, cari, kasa/banka, muhasebe ve İK kapsamıyla anlamlı bir sektörel ERP temeline sahip. Özellikle kalıp hareketleri, beden matrisi, barkod terminali ve reçete sarfiyatı sektör açısından değerli.

En büyük gelişim ihtiyacı yeni ekran sayısını artırmak değil, **mevcut iş süreçlerini uçtan uca güvenilir hale getirmek**. Bazı finans uçlarında sunucu transaction'ları ve kilitleri iyi uygulanmışken, sipariş/irsaliye/üretim geçişlerinde süreçler hâlâ istemcinin yönettiği ayrı isteklere bölünüyor. Bu iki yaklaşımın bir arada bulunması tutarsızlık riski oluşturuyor.

Öncelik sıram:

1. Bordro parametrelerini dönem bazında doğrulamak; negatif/kesirli beden dağıtımını düzeltmek.
2. İrsaliye, sipariş ve üretim durum değişikliklerini sunucuda atomik iş işlemlerine taşımak.
3. Tahsilat–fatura ilişkisi, dönem kilidi, döviz ve belge kurallarını sunucuda tamamlamak.
4. İzole test veritabanı ve otomatik regresyon kontrollerini kurmak.
5. Depo/rezervasyon/lot, gerçek maliyet, kalite ve satın alma onay süreçlerini geliştirmek.

**Değerlendirme:** Kapsamı geniş, sektörel operasyonları destekleyen bir uygulama; kurumsal ölçekte güvenilir ERP olgunluğu için süreç bütünlüğü, muhasebe disiplini ve operasyonel işletim tarafında çalışma gerekiyor. Bu ifade sertifikasyon veya canlı sistem uygunluk onayı değildir.

## 2. Kapsam, yöntem ve sınırlar

İnceleme; README, paket komutları, masaüstü/mobil yönlendirme, modül servisleri, ortak hesaplayıcılar, API, yetkilendirme, kaynak kayıtları, işlem uçları, silme politikası, şema/migration dosyaları, yedekleme araçları ve test altyapısını kapsadı. Kritik akışlar ayrıntılı incelendi; her dosyanın her satırının incelendiği iddia edilmez.

Bulgu sınıfları:

- **Doğrulandı:** Yerel çalıştırmayla gösterildi veya açık kaynak akışıyla doğrudan gözlendi.
- **Koddan tespit edilen risk:** İşleyiş kaynakta görüldü; etkisi canlı DB üzerinde hata enjekte edilerek sınanmadı.
- **Kapsam boşluğu:** İncelenen şema, yönlendirme ve servislerde tamamlanmış bir süreç bulunamadı. Harici sistemde karşılanıyor olabilir.
- **Öneri:** Bir hata iddiası değil, hedef işletmeye göre gelişim ihtiyacı.

Canlı DB'yi değiştiren entegrasyon, silme, RBAC ve yük testleri çalıştırılmadı. Test harness'ı mevcut DB bağlantısını kullanıp kayıt yazıyor ve temizliyor. Ayrı test DB'si doğrulanmadan bunları çalıştırmak uygun değil. Canlı verinin bakiyeleri, kurulmuş görev zamanlayıcıları, gerçek yedeklerden geri dönüş, ağ/TLS kurulumu ve entegratör hesabı doğrulanmadı. `.env` içindeki sırlar okunmadı. Tarayıcı üzerinden uçtan uca kabul testi yapılmadı.

Bu istek kapsamında işlevsel kod düzeltilmedi; amaç analiz ve raporlama.

## 3. Güçlü taraflar

| Alan | Kodda görülen güçlü temel |
|---|---|
| Kimlik doğrulama | Sunucu oturumu, scrypt, zamanlama güvenli karşılaştırma, oturum çerezi, giriş denemesi sınırı |
| Yetkilendirme | Sunucu tarafında modül/eylem RBAC; yalnız arayüzde düğme gizlemeye dayanmıyor |
| Veri bütünlüğü | MySQL transaction altyapısı, kritik finans/stok yollarında `FOR UPDATE`, kontrollü yazılan kaynaklar |
| Muhasebe | TDHP, yevmiye, mizan/kebir, borç–alacak denge kontrolü ve bazı ters kayıt işlemleri |
| Belgeler | Fatura oluşturma akışında sunucuda tutar yeniden hesaplama ve bağlantı kontrolleri |
| Sektörel kapsam | Asorti, renk/beden, kalıp stok konumları, fason kalıp takibi, reçete, aşama ve barkod terminali |
| Denetim | Sunucu damgalı audit, işlem içi audit desteği, kademeli silme politikası |
| İşletim | Migration, SQL+görsel yedekleme, geri yükleme komutları, sağlık kontrolü |
| Arayüz | Ortak tablo/form bileşenleri, tema altyapısı ve ayrı mobil ekranlar |

Bu temeller korunmalı; projeyi baştan yazmak yerine iş kurallarını aynı sunucu işlem modelinde birleştirmek daha verimli.

## 4. Somut eksikler ve riskler

Öncelik: **P1 yüksek** = parasal/stok/veri bütünlüğü veya kritik süreç; **P2 orta** = ölçeklenme, bakım ve kullanım; **P3 gelişim** = işletme ihtiyacına göre.

### F01 — “2026” bordro varsayılanları resmî 2026 değerleriyle uyuşmuyor — P1

**Durum: doğrulandı.** `src/lib/payrollCalculator.ts:19` brüt asgari ücreti 26.005 TL; `:39` ve devamı ücret vergisi eşiklerini 158.000 / 330.000 / 1.200.000 / 4.300.000 TL olarak tanımlıyor. `src/services/settingsService.ts` içinde de eski ücret/istisna varsayılanları var.

ÇSGB'nin 2026 belgesinde brüt ücret 33.030 TL, net ücret 28.075,50 TL. GİB'in 2026 ücret tarifesindeki eşikler 190.000 / 400.000 / 1.500.000 / 5.300.000 TL. Kodun adlandırmasıyla resmî dönem arasında açık fark var. Kaydedilmiş ayarlar bazı değerleri değiştirmiş olabilir; canlı bordro sonuçlarının tamamının yanlış olduğu sonucunu çıkarmıyorum. Sabit hesaplayıcının ve varsayılanların bu haliyle güncel kabul edilmesi güvenilir değil. [ÇSGB 2026 ücret hesabı](https://www.csgb.gov.tr/Media/gm2fekds/asgari-%C3%BCcret-2026.pdf), [GİB 2026 gelir vergisi tarifesi](https://cdn.gib.gov.tr/api/gibportal-file/file/getFileResources?objectKey=arsiv/yardim-kaynaklar/yararli-bilgiler/gelir-vergisi-tarifeleri/gelir-vergisi-tarifesi-2026.pdf).

**Öneri:** Yürürlük başlangıç/bitiş tarihi olan parametre sürümleri; ücret/SGK/vergi/istisna ve teşvik profilleri; bordro kaydında kullanılan parametre sürümünün saklanması; bağımsız örnek bordrolarla doğrulama. Geçmiş dönemler güncel oranlarla yeniden hesaplanmamalı. İşveren oranı tek sabit yerine sektör/teşvik koşuluna göre seçilmeli.

### F02 — Üretim beden dağıtımı negatif miktar üretebiliyor — P1

**Durum: yerel çalıştırmayla doğrulandı.** `src/services/productionService.ts:51` içindeki `computeAssortmentDistribution`, satırları yuvarlayıp farkı son satıra ekliyor. Eşit ağırlıklı 8 bedene 5 çift verildiğinde sonuç:

```text
36:1, 37:1, 38:1, 39:1, 40:1, 41:1, 42:1, 43:-2
```

Toplam 5 olsa bile negatif beden miktarı geçersiz. Ortak `distributeWithLargestRemainder` ise `src/lib/inventoryCalculator.ts:55` altında 10.000 ölçeğiyle çalıştığı için aynı girdide sekiz kez 0,625 döndürüyor. Bu metre/kg için anlamlı olabilir; tam çift/tek adet beden stoğu için uygun değil. Sunucudaki varyant dağıtımında da bu ortak yardımcı kullanılıyor.

**Öneri:** Birime göre miktar hassasiyeti: adet/çift için 1, metre/kg için tanımlı ondalık adım. Tek dağıtım motoru, her satırda negatif olmama ve toplam korunumu kontrolleri. MRP ve iş emri dağıtımı aynı sonucu kullanmalı. Tam koli zorunluluğu varsa koli/asorti katı ayrıca doğrulanmalı.

### F03 — İrsaliye oluşturma uçtan uca atomik değil — P1

**Durum: koddan tespit edilen risk.** `src/services/waybillService.ts:61`: önce başlık oluşturuluyor; sonra satırlar ve sipariş sevk miktarları `commit` ediliyor (`:112`); ardından stok hareketleri kalem kalem ayrı çağrılıyor.

**Etki:** Sonraki adımda ağ kesintisi veya yetersiz stok hatası olursa belge/sipariş/stok etkileri kısmen gerçekleşebilir. İki kullanıcının aynı siparişin kalanını eşzamanlı sevk etmesi de istemci okuma–hesaplama modelinde riskli.

**Öneri:** `create-waybill` / `issue-waybill` sunucu işlemleri: başlık, satırlar, kalan sevk miktarı, stok, hareket defteri, audit ve belge numarası tek transaction. Her kalem için siparişe aidiyet, cari, tip, kalan miktar ve varyant doğrulaması.

### F04 — Üretim durumu ile mamul stok girişi ayrı işlemler — P1

**Durum: koddan tespit edilen risk.** `src/services/productionService.ts:466` iş emri değişikliklerini commit ediyor; `:469` stok etkisini ayrı `production-stock` çağrısıyla uyguluyor.

**Etki:** İş emri tamamlandı göründüğü halde mamul stoğa girmeyebilir; tekrar deneme ve eşzamanlı terminal kullanımı ayrıca değerlendirilmelidir.

**Öneri:** Aşama geçişi, sarfiyat, fire, tamamlanan miktar, mamul girişi ve audit tek sunucu komutu. İzin verilen durum geçişleri sunucuda zorunlu; tamamlanan miktar ve yeniden işleme miktarı ayrı izlenmeli.

### F05 — Sipariş oluşturma ve otomatik iş emri zinciri parçalı — P1

**Durum: koddan tespit edilen risk.** `src/services/orderService.ts:19`: başlık ve kalemler ayrı yazılıyor. Otomatik iş emri hatası `console.warn` ile karşılanıyor; sipariş başarılı dönebilir.

**Etki:** Kalemsiz başlık veya onaylı olduğu halde üretime açılmamış sipariş oluşabilir. Kullanıcı açısından hangi alt işlemin tamamlandığı belirsiz kalır.

**Öneri:** Sipariş başlık/kalemlerini tek transaction'da oluşturmak; iş emri üretimi için atomik işlem veya kalıcı, tekrar denenebilir görev kullanmak. Otomasyon başarısızlığı kullanıcıya ve operasyon kuyruğuna görünmeli.

### F06 — Tahsilat/tediye uçlarında belge ilişkisi ve ödeme aracı doğrulamaları eksik — P1

**Durum: koddan tespit edildi; canlı API senaryosu çalıştırılmadı.** `server/businessOps.ts:1317` içindeki `/receipt`, kasa için `cashBoxId` veya banka için `bankAccountId` yoksa bakiye güncelleme dalını atlayabiliyor; buna rağmen cari ve makbuz/muhasebe işlemleri ilerliyor. Bağlanan fatura sorgusunda yalnız `id`, `grandTotal`, `paidAmount` okunuyor. Faturanın aynı cariye ait olması, makbuz yönüyle tipi, iptal/taslak durumu ve para birimi bu dalda doğrulanmıyor.

**Etki:** Cari kapatılırken kasa/banka hareketinin eksik kalması veya başka carinin faturasının ödenmiş görünmesi mümkün bir kod yolu.

**Öneri:** Araca göre zorunlu kasa/banka/POS bilgisi; kilit altında fatura–cari–tip–durum–döviz eşleşmesi; fazla ödemenin açık avans olarak ayrı ele alınması. Tek makbuzu birden fazla faturaya dağıtan ödeme eşleştirme tablosu.

### F07 — Dönem kilidi bütün yazma yollarında sunucuda uygulanmıyor — P1

**Durum: koddan tespit edildi.** `periodLocks` tablosu var. `src/services/hrService.ts` puantaj yazmadan önce istemcide kontrol ediyor. `server/deletePolicy.ts:684` muhasebe fişi silme sırasında kapalı dönem kontrolü yapıyor. Buna karşılık genel CRUD/commit ve incelenen finans/bordro iş uçlarında bütün yazmaları kapsayan ortak dönem koruması bulunmadı.

**Etki:** Ekrandaki kilit, doğrudan API yazımını veya başka işlem yolunu tam olarak engellemiyor. Kilitli döneme yeni fiş/puantaj ekleme ve güncelleme riski var.

**Öneri:** Kaynak tarihi ve kapsamına göre transaction içinde `assertOpenPeriod`; ekleme, tarih değiştirme, güncelleme, iptal, ters kayıt ve toplu içe aktarma için aynı kural. Kilit kaldırma ayrı yetki ve gerekçeye bağlanmalı. Microsoft'un dönem kapama modeli de kapanış görevlerini ve kontrolünü ayrı süreç olarak ele alır. [Dönem kapama dokümantasyonu](https://learn.microsoft.com/en-us/dynamics365/finance/general-ledger/close-general-ledger-at-period-end).

### F08 — Döviz bilgisi tutuluyor; finansal etkide dönüşüm eksik — P1

**Durum: koddan tespit edilen risk.** Faturada `currency` ve `exchangeRate` saklanıyor (`server/businessOps.ts:2839`). Ancak fatura cari etkisine `grandTotal` doğrudan veriliyor; yevmiye üretimine kur/para birimi aktarılmıyor. `/receipt` kasa/banka kilitleme sorguları para birimini okumuyor. Dashboard kasa/banka bakiyelerini para birimine göre ayırmadan topluyor (`:3186`, `:3187`).

**Etki:** Dövizli kullanımda 100 EUR ile 100 TRY aynı parasal toplamın parçası haline gelebilir. Yalnız TRY kullanan işletmede etki sınırlı; döviz desteği varmış gibi sunulması riskli.

**Öneri:** Belge dövizi, yerel para tutarı, işlem kuru, kur tarihi/kaynağı ve kur farkı kayıtları. Hazır olana kadar desteklenmeyen döviz birleşimleri sunucuda reddedilmeli.

### F09 — İyimser kilitleme mevcut; uygulama servisleri bunu kullanmıyor — P1

**Durum: koddan tespit edildi.** `server/api.ts:178` ve `src/api/client.ts:244` sürüm kontrolünü destekliyor. `src` taramasında istemci tanımı dışında `expectedVersion` kullanımına rastlanmadı. Genel güncelleme yolları sürüm gönderilmediğinde çalışıyor.

**Etki:** Aynı kartı iki kullanıcının düzenlemesinde son kaydeden önceki değişikliği ezebilir. Ayarlar tek büyük belge olduğu için farklı modül ayarları da birbirini etkileyebilir.

**Öneri:** Kritik güncellemelerde sürümü zorunlu tutmak; form açılış sürümünü göndermek; çakışmada alan farklarını gösterip yeniden yükleme/birleştirme sunmak. Sunucu kilidi, istemcinin eski form verisini tek başına düzeltmez.

### F10 — Yeniden gönderilen finans işlemlerine genel tekilleştirme yok — P1

**Durum: koddan tespit edilen risk.** Fatura yevmiyesi/ters kayıt gibi bazı noktalarda idempotent kontroller var; ancak `/receipt`, `/transfer` gibi işlemler için kalıcı istek anahtarı ve cevap kaydı görülmedi.

**Etki:** Sunucu işlemi bitirdikten sonra cevap kaybolur ve kullanıcı yeniden denerse çift tahsilat/virman kaydı oluşabilir. Transaction atomikliği aynı isteğin ikinci kez yürütülmesini önlemez.

**Öneri:** İstemcinin işlem boyunca koruduğu `Idempotency-Key`; kullanıcı/işlem/anahtar benzersizliği; gövde özeti ve sonuç kimliği aynı transaction'da saklanmalı. Farklı tutarla aynı anahtar reddedilmeli.

### F11 — Bazı ayarlar davranışa bağlanmamış görünüyor — P1/P2

**Durum: kaynak kullanım taramasıyla tespit edildi.** `autoCreateWorkOrdersOnConfirm`, `autoDeductStockOnWaybill`, `defaultDailyCapacityPairs`, `scrapTolerancePercentage`, `autoConsumeMaterialsOnStart` anahtarları ayar ekranı, tür ve varsayılanlarda var; isimleriyle yapılan taramada ilgili iş akışlarında tüketilmedikleri görüldü. Örneğin sipariş servisi otomatik iş emrini ayar bayrağını okumadan başlatıyor.

**Etki:** Kullanıcı bir kuralı kapattığını düşünürken sistem aynı işlemi yapabilir. Kapasite alanının bulunması gerçek kapasite planlaması olduğunu göstermiyor.

**Öneri:** “Ayar → uygulayan servis → kabul testi” eşleme listesi. Her ayar gerçekten kullanılmalı veya “bilgi amaçlı/henüz etkin değil” olarak açıkça belirtilmeli. İş davranışını belirleyen ayar sunucuda okunmalı.

### F12 — Belge numarası üretimi tutarlı biçimde sunucuda değil — P1/P2

**Durum: koddan tespit edildi.** `src/services/invoiceService.ts:28` ve irsaliye servisindeki numara üretimi kayıt sayısı + 1 kullanıyor. Yevmiye için kilitli sunucu sayacı var (`server/numbering.ts`), ancak bütün belge aileleri aynı güvencede değil.

**Etki:** Eşzamanlı kullanıcı veya kayıt silme sonrası numara çakışması. UNIQUE kısıt çakışmayı yakalar ama kullanıcıya kesintisiz belge üretimi sağlamaz.

**Öneri:** Belge türü/seri/dönem bazlı sunucu numaratörü; numarayı oluşturma/kesinleştirme transaction'ında almak; numara politikası ve boşlukların açıklanabilir olması.

### F13 — MRP yanlış renk reçetesine sessiz düşebilir; eksik reçete görünmez kalabilir — P1/P2

**Durum: koddan tespit edildi.** `src/services/productionMrp.ts` içindeki `pickRecipeForWorkOrder`, tam renk ve genel reçete bulunmazsa ürünün ilk reçetesini döndürüyor. `calculateMRP`, reçetesi bulunmayan işi `continue` ile atlıyor.

**Etki:** Belirli renk için farklı malzeme gerekiyorsa başka rengin reçetesiyle ihtiyaç hesaplanabilir. Reçetesi eksik iş, ihtiyaç toplamında eksik görünür.

**Öneri:** Tam/genel eşleşme yoksa açık hata veya planlama istisnası; eksik reçeteli iş listesi; onaylı BOM sürümü ve iş emrinde reçete anlık görüntüsü. MRP çıktı miktarı kadar eksik veri ve varsayımları da raporlamalı.

### F14 — e-Belge XML üretimi var; tamamlanmış entegrasyon doğrulanmadı — P1/P2

**Durum: kapsam boşluğu.** `src/lib/ublTrGenerator.ts` XML üretiyor; incelenen API/servislerde entegratöre gönderim, imza/mühürleme, gelen kutusu, durum sorgulama, uygulama yanıtı ve kalıcı teslim kuyruğundan oluşan uçtan uca akış bulunmadı. Kaynak yorumundaki “uyumlu/valid XML” ifadesi bağımsız XSD/Schematron doğrulaması değildir.

**Öneri:** Entegratör adaptörü ve test ortamı; şema/iş kuralı doğrulama; gönderim kuyruğu; tekrar deneme; gelen belge işleme; belge–zarf–yanıt izlenebilirliği; orijinal XML arşivi. Arayüzde “XML dışa aktarımı” ile “entegratöre gönderildi/kabul edildi” durumları ayrılmalı. GİB kılavuzu belge üretiminin yanında iletişim ve yanıt süreçlerini de tanımlar; incelenen v1.9 belgesi kavramsal referanstır, en güncel uygulama paketi olduğu iddia edilmez. [GİB entegrasyon kılavuzu](https://ebelge.gib.gov.tr/dosyalar/kilavuzlar/e-FaturaUygulamasiEntegrasyonKilavuzu-v1.9.pdf).

### F15 — Sunucu iş doğrulama kapsamı kaynaklara göre farklı — P1/P2

**Durum: koddan tespit edildi.** `server/api.ts:210` içindeki `applyResourceRules` özel olarak renk, kalıp ve yevmiye satırı dengesini ele alıyor. Sipariş/irsaliye/iş emrinin bazı alanları genel yazıma açık. Yevmiyede `lines` gönderilmezse veya boşsa denge kontrolü atlanıyor; statü/toplam alanları için bütün yaşam döngüsünü kapsayan bir doğrulama görülmedi.

**Etki:** Arayüzde bulunan kontroller her API yolunda aynı güvenceyi vermiyor. Denge kontrolü tek başına hesap varlığı, aktif hesap, izinli fiş statüsü ve pozitif satır tutarı doğrulaması yerine geçmiyor.

**Öneri:** Kaynak bazlı açık giriş şemaları; izinli durum geçişleri; sunucuya ait hesaplanmış alanların korunması; onaylı belgeyi genel PATCH ile değiştirmeyi kapatma. İş komutları genel CRUD'dan ayrılmalı.

### F16 — Listeler, MRP ve ilişkili belge ekranlarında büyüme riski — P2

**Durum: koddan tespit edildi.** `server/api.ts:526` liste limiti verilmezse tüm kayıtları döndürüyor; üst limit zorunlu değil. MRP birçok tabloyu tam çekiyor. Fatura/irsaliye adaylarında belge başına satır sorgusu var. `src/App.tsx` ekranları statik import ediyor.

**Etki:** Veri büyüdükçe ağ yükü, tarayıcı belleği, sorgu sayısı ve açılış süresi artar. Bu incelemedeki derlemede büyük ana paket uyarısı görüldü; bu tek başına canlı gecikme ölçümü değildir.

**Öneri:** Sunucu sayfalama/filtreleme; sorgu üst sınırı; aday belge ve MRP için toplu sunucu sorguları; rota bazlı lazy loading; Excel/PDF kütüphanelerini ihtiyaç anında yüklemek. Ölçüm sonrası gerçek sorgulara göre indeks eklemek.

### F17 — Ortak referans okumaları gereğinden geniş veri döndürebiliyor — P2

**Durum: koddan tespit edildi.** `server/registry.ts:51`, `:89`, `:152` cari/ürün/ayar okumalarını `readAuthOnly` yapıyor. `server/api.ts:520` varsayılan olarak tüm tanımlı kolonları seçiyor; gizli kolon listesi kaynak bazında sınırlı.

**Etki:** Seçim listesi için gereken ad/kod ile bakiye, alış fiyatı, banka/firma bilgileri aynı yanıtın içinde bulunabilir. Bu, girişsiz erişim açığı değildir; modüller arası veri gizliliği kapsamının fazla geniş olmasıdır.

**Öneri:** Ortak seçim listesi uçları yalnız kimlik/kod/ad/birim döndürmeli. Maliyet, bakiye, bordro ve banka alanları ayrı alan/işlem yetkileriyle korunmalı. MFA, kurumsal oturum ve KVKK veri saklama/erişim politikaları ayrıca değerlendirilmelidir; inceleme hukuki uyum denetimi değildir.

### F18 — Oturum ve canlı güncelleme tek süreç belleğine bağlı — P2

**Durum: koddan tespit edildi.** `server/auth.ts:159` oturumları `Map`, `server/sse.ts:12` istemcileri yerel `Set` içinde tutuyor. SSE yayını kaynak/kimlik/zaman metaverisini bütün bağlı istemcilere gönderiyor; kayıt gövdesi göndermiyor.

**Etki:** Sunucu yeniden başlayınca oturumlar kapanır. Birden fazla süreçte ortak oturum/olay dağıtımı oluşmaz. Hassas modül faaliyet metaverisinin rol bazında filtrelenmesi de değerlendirilmelidir.

**Öneri:** Gereken ölçeğe göre paylaşımlı oturum deposu ve olay dağıtımı; oturum iptalinin açık SSE bağlantısına uygulanması; yetkiye göre olay filtreleme. Küçük tek sunuculu kullanımda bu mimari tercih tek başına kritik açık değildir.

### F19 — Ayarlar tek belge ve çift kayıt üzerinden kaydediliyor — P2

**Durum: koddan tespit edildi.** `src/services/settingsService.ts:115` önce `global_settings`, ardından `global_barcode` yazıyor. İşlem tek transaction değil, form eski tüm ayar nesnesini taşıyor. Yeni modül içi sekmeler formu koruyor; modül değişiminde bileşen yeniden oluşuyor ve kaydedilmemiş değişiklik uyarısı yok.

**Öneri:** Sunucuda modül bazlı kısmi ayar güncelleme; zorunlu sürüm kontrolü; tek gerçek kaynak; ayar değişiklik geçmişi ve “kaydedilmemiş değişiklikler” uyarısı. Logo/ortak firma bilgisi ile finans/bordro parametrelerinin erişimi ayrılmalı.

### F20 — Dashboard “son siparişler” en eski kayıtları seçiyor — P2

**Durum: koddan doğrulandı.** `server/businessOps.ts:3261`, `ORDER BY id ASC LIMIT 5` kullanıyor. Bu sorgu ilk kayıtları seçer. Ayrıca tip filtresi olmadığından satış/alış ayrımı ekranın anlamıyla uyumlu olmalı.

**Öneri:** İş tarihine göre azalan sıralama ve eşitlikte `id DESC`; gerekiyorsa satış filtresi. Dashboard'da her göstergenin tarih aralığı, dövizi ve hesaplama tanımı görünür olmalı. Sıfır değer, yetkisizlik ve veri yükleme hatası birbirinden ayrılmalı.

## 5. Bir ERP'de beklenen kapsam ve DMR Nexus karşılığı

Her işletmede bütün ERP modülleri zorunlu değildir. “Çekirdek” küçük üretim işletmesinde temel ihtiyaç; “üretim önceliği” ayakkabı fabrikasında yüksek değer; “büyüme” ise iş hacmine/organizasyona bağlıdır.

| Yetkinlik | Beklenti | DMR Nexus'taki durum | Önerilen tamamlama |
|---|---|---|---|
| Ana veri | Çekirdek | Ürün/cari/personel/renk var | Benzersizlik, birim kuralları, pasifleştirme, veri kalite paneli |
| Satış siparişi | Çekirdek | Var; beden/asorti destekli | Sunucu toplamları, rezervasyon, iskonto/risk limiti ve onay |
| Satın alma | Çekirdek | Alış siparişi ve MRP siparişi var | Talep → teklif karşılaştırma → onay → PO → mal kabul → fatura eşleştirme |
| Depo | Çekirdek/üretim | Üründe konum/raf, kalıpta konum kovaları var | Genel ürünler için depo/raf stok kovası ve atomik transfer |
| Stok rezervasyonu | Üretim önceliği | Talep/MRP hesapları var; kalıcı genel rezervasyon modeli bulunmadı | Sipariş/iş emri bazlı rezervasyon, serbest ve rezerve stok ayrımı |
| Lot/parti izlenebilirliği | Üretim önceliği | Barkod var; genel lot/seri soy ağacı bulunmadı | Deri/kimyasal/taban partisinden mamul ve sevkiyata iz |
| Sayım | Çekirdek | Stok düzeltme ve kalıp sayım hareketi var | Sayım oturumu, kör sayım, fark onayı, sayım sırasında hareket politikası |
| Reçete/BOM | Üretim önceliği | Var, malzemeler JSON | Onaylı revizyon, yürürlük tarihi, alternatif malzeme, iş emri snapshot |
| MRP | Üretim önceliği | Malzeme ihtiyacı ve satın alma önerisi var | Termin, emniyet stoğu, tedarik süresi, rezervasyon, açık sipariş netleştirme |
| Kapasite planlama | Üretim önceliği | Aşamalar ve kapasite ayarı var | Vardiya/istasyon takvimi, operasyon süresi, darboğaz ve teslim simülasyonu |
| Üretim gerçekleşmesi | Üretim önceliği | Terminal, aşama, sarfiyat ve mamul girişi var | Kısmi üretim, fire nedeni, yeniden işleme ve atomik geçiş |
| Üretim maliyeti | Üretim önceliği | Reçete işçilik ve maliyet yardımcıları var | Gerçek sarf + işçilik + fason + genel gider; plan/gerçek farkı |
| Kalite yönetimi | Üretim önceliği | Kalite/paket aşaması var | Kontrol planı, ölçüm, ret/karantina, uygunsuzluk ve düzeltici faaliyet |
| Fason | Üretim önceliği | Kalıp fason takibi var | Genel malzeme gönderim, fason iş emri, fire, dönüş ve hizmet faturası |
| Kalıp yönetimi | Üretim önceliği | Ayrı ve anlamlı modül var | Kullanım ömrü, bakım geçmişi, üretim kapasitesi ve rezervasyon entegrasyonu |
| Satış iadesi | Çekirdek | Faturada iade senaryosu var | Talep → kabul/kalite → stok kararı → iade belgesi → finans zincirini doğrulama |
| Genel muhasebe | Çekirdek | TDHP, fiş, mizan/kebir var | Dönem koruması, defter değişmezliği, kapanış/devir ve alt defter mutabakatı |
| Cari yönetimi | Çekirdek | Cari, ekstre, yaşlandırma var | Fatura bazlı açık kalem, çoklu ödeme eşleştirme, limit ve vade politikası |
| Kasa/banka | Çekirdek | Var | Banka ekstresi içe aktarma, mutabakat, POS masraf/valör takibi |
| Döviz | İhtiyaca bağlı çekirdek | Alanlar var; etkiler eksik | Yerel/döviz tutar ayrımı, kur farkı ve kur değerleme |
| e-Belge | İşletmenin yükümlülüklerine bağlı | UBL XML üretimi var | Entegratör yaşam döngüsü, gelen belgeler ve doğrulanmış arşiv |
| Bordro/İK | İhtiyaca bağlı | Personel, puantaj, izin, avans, bordro var | Güncel tarihli parametreler, sunucu hesaplama/kilit ve doğrulanmış bordrolar |
| İş akışı/onay | Çekirdek kontrol | Rol/izin ve bazı durumlar var | Tutar/rol bazlı talep–kontrol–onay, vekâlet, görev ayrılığı |
| Raporlama | Çekirdek | Çok sayıda operasyon raporu var | Tanımlı KPI, dönem/döviz standardı, kaynak belgeye iniş ve zamanlı rapor |
| Güvenlik/denetim | Çekirdek | Önemli temel var | Alan bazlı erişim, yönetici işlemi sınırı, audit saklama/erişim politikası |
| Yedek/geri dönüş | Çekirdek | CLI araçları var | Zamanlama, bağımsız kopya, şifreleme, alarm ve düzenli restore tatbikatı |
| CRM | Büyüme | Cari kartı var; fırsat/teklif hunisi bulunmadı | Teklif sürümleri, müşteri görüşmesi, fırsat ve satış takibi |
| Sabit kıymet | Büyüme | Genel varlık/amortisman süreci bulunmadı | Makine varlık kartı, amortisman, bakım ve zimmet |
| Bütçe/masraf merkezi | Büyüme | Tam süreç/model bulunmadı | Departman/hat/model maliyeti, bütçe–gerçekleşen farkı |
| Çok şirket/şube | Büyüme | Genel `companyId`/işletme ayrımı bulunmadı | İşletme bazlı veri ve yetki, şube/depo, şirketler arası işlemler |
| Entegrasyon | Büyüme | İç API var | Sürümlü dış API, servis kimliği, webhook, işlem kuyruğu ve izleme |
| Mobil | Saha ihtiyacı | Özet/cari/stok/sipariş/üretim ekranları var | Rol bazlı saha görevleri, hata/bağlantı durumları; çevrimdışı ise kontrollü senkron |

Lot izlenebilirliği ile kalite kontrol noktaları üretim ERP'lerinde ayrı süreçlerdir; barkod veya “kalite” aşaması bunların tamamını karşılamaz. [Üretimde lot/seri](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing/workflows/manufacture_lots_serials.html), [Kalite kontrol noktaları](https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/quality/quality_management/quality_control_points.html).

## 6. Ayakkabı üretimi için en yüksek değerli gelişmeler

1. **Model–sezon–renk–beden kârlılığı:** Sipariş fiyatından gerçek malzeme, işçilik, fason ve fire maliyetini düşen rapor. Yönetim “hangi model kazandırıyor?” sorusuna yanıt almalı.
2. **Beden bütünlüğü ve kırık asorti kontrolü:** Sipariş/sevk/üretim her aşamada tam birim ve toplam korunmalı. Koli–çift–tek dönüşümleri açık olmalı.
3. **Deri ve taban parti izi:** Tedarik partisi → kesim/saya/montaj → mamul → sevkiyat bağlantısı. Kalite sorununun hangi siparişleri etkilediği bulunabilmeli.
4. **Kalıp kapasitesi ile termin planlama:** İş istasyonu kapasitesinin yanında aynı numaradaki kullanılabilir kalıp çifti, çevrim süresi ve fason konumu hesaba katılmalı.
5. **Fire ve yeniden işleme nedenleri:** Kesim kaybı, dikim hatası, yapıştırma, taban ayrılması gibi nedenlerin sorumlu aşama ve maliyetle kaydı.
6. **Fason operasyon mutabakatı:** Gönderilen–dönen çift, eksik/fazla, kalite reddi, hizmet birim bedeli ve fatura eşleştirmesi.
7. **Termin risk panosu:** Malzeme eksikliği, kapasite, kalıp ve geciken fason nedeniyle riskli siparişleri öne çıkarmak.
8. **İstisna merkezi:** Negatif stok, varyant toplam farkı, fişsiz belge, fazla ödeme, eksik reçete ve kapanmayan üretim gibi durumları tek ekranda göstermek.

Emniyet stoğu ve yeniden sipariş eşikleri, tedarik/üretim önerilerini talebe bağlamak için kullanılabilir. Bu özellikler kapasite planlamasının yerini almaz. [Yeniden sipariş kuralları](https://www.odoo.com/documentation/master/applications/inventory_and_mrp/inventory/warehouses_storage/replenishment/reordering_rules.html).

## 7. Önerilen teknik yapı

Mevcut tek uygulama yapısı korunabilir; sırf büyüme beklentisiyle mikroservise geçmek gerekmiyor.

- **İş alanı modülleri:** Satış, satın alma, depo, üretim, finans, muhasebe, İK. Büyük `businessOps.ts`/`api.ts` dosyaları bu alanlara ayrılmalı.
- **İşlem komutları:** `createOrder`, `issueWaybill`, `completeProduction`, `postReceipt`, `closePeriod`. Her komut doğrulama → yetki → kilit → kayıt/defter → audit → commit sırasını izlemeli.
- **Hesaplama çekirdeği:** Paylaşılan saf fonksiyonlar; para için sabit hassasiyet, miktar için birim adımı. İstemci önizler, sunucu kesin hesaplar.
- **İlişkisel model:** `productVariants`, `stockBalances`, `stockReservations`, `recipeVersions`, `workOrderOperations`, `journalLines`, `paymentAllocations`. JSON alanlar tümüyle kötü değildir; benzersizlik, referans bütünlüğü ve toplu rapor gereken satırlar tabloya ayrılmalı.
- **Defter mantığı:** Kesinleşmiş muhasebe/stok kayıtlarında düzeltme/ters kayıt politikası; taslaklarda silme. Mevcut fiziksel silme, ilgili mali belge sınıfı ve saklama ihtiyacı açısından ayrıca değerlendirilmelidir; parola istemek tarihsel iz kaybını tek başına çözmez.
- **Uzun işlemler:** e-Belge, toplu içe aktarma ve ağır raporlar kalıcı görev kuyruğu. DB kaydıyla dış bildirim arasında transaction outbox kullanılabilir.
- **İzleme:** İstek/işlem kimliği, yapılandırılmış hata kayıtları, sorgu/işlem süreleri, başarısız görevler ve yedek yaşı. Sağlık kontrolü hazır olma ve süreç canlılığı olarak ayrılabilir.

## 8. Test sonuçları ve kalite planı

### Bu incelemede çalıştırılan kontroller

| Kontrol | Sonuç |
|---|---|
| `npm test` | **19 başarılı, 2 başarısız**, çıkış kodu 1 |
| Negatif beden dağıtımı örneği | **Doğrulandı**: 5/8 eşit dağıtımda son bedende −2 |
| Ortak dağıtım örneği | **Doğrulandı**: aynı girdide her bedene 0,625 |
| `npm run lint` | Başarılı; çıkış kodu 0 |
| `npm run build` | Başarılı; çıkış kodu 0; büyük paket uyarısı var |
| Canlı DB entegrasyon/silme/yük/RBAC testleri | Çalıştırılmadı; izole test ortamı doğrulanmadı |

İki birim testi hatasının anlamı farklı:

1. **Vergide katı artış beklentisi:** `src/tests/unitTests.ts` “monoton” testinde her örnekte `>` bekliyor. Aynı vergi dilimi içinde efektif oran eşit kalabilir; bu başarısızlık tek başına vergi motorunun matematiğinin bozuk olduğunu kanıtlamıyor. Test “azalmama” ve bağımsız sınır örnekleriyle yeniden tasarlanmalı. F01'deki resmî parametre uyuşmazlığı ise bundan ayrı ve gerçek bir tespit.
2. **Bedenlerde tam adet beklentisi:** Dağıtım testi 0/1 beklerken 0,625 alıyor. Bu, birime göre hassasiyet sözleşmesinin eksik olduğunu gösteriyor. Üretimde negatif beden örneği ayrıca bağımsız olarak doğrulandı.

### Önce kurulması gereken kabul testleri

| Senaryo | Kabul ölçütü |
|---|---|
| Sipariş/irsaliye ortasında hata | Hiçbir kısmi başlık, sevk miktarı veya stok hareketi kalmamalı |
| Aynı kalan siparişin eşzamanlı sevki | Toplam sevk sipariş kalanını aşmamalı |
| Üretim tamamlama tekrar denemesi | Mamul girişi ve sarfiyat yalnız bir kez olmalı |
| Yanlış carinin faturasına tahsilat | Sunucu reddetmeli; hiçbir bakiye değişmemeli |
| Kasa/banka seçilmemiş makbuz | Sunucu reddetmeli |
| Kapalı döneme bütün yazma yolları | CRUD, commit ve özel iş uçlarının hepsi reddetmeli |
| 5 çift / 8 beden ve rastgele dağılımlar | Tam birim, negatif olmama ve toplam korunmalı |
| Aynı kartın iki kullanıcılı düzenlenmesi | Eski sürüm 409 almalı; veri sessizce ezilmemeli |
| EUR fatura / TRY tahsilat | Açık kur/döviz politikası uygulanmalı veya işlem reddedilmeli |
| Resmî örnek bordrolar | Dönem/teşvik/vergi dilimi sınırlarında beklenen sonuçla uyuşmalı |
| Rol sınırı ve hassas alanlar | Yetkisiz rol ataması ve maliyet/bordro alanı okuması reddedilmeli |
| Yedekten geri dönüş | Ayrı ortamda belge sayıları, bakiyeler, sayaçlar ve görseller doğrulanmalı |

Test DB'si adı/işareti için zorunlu kontrol; üretim DB'sine karşı testlerin varsayılan reddi; CI'da tip kontrolü + birim + izole entegrasyon + derleme. Mevcut harness oturum ürettiği için gerçek giriş, CSRF ve üretim güvenlik başlıkları ayrıca test edilmeli.

## 9. Uygulama sırası ve tamamlanma ölçütleri

Takvim yerine bağımlı iş paketleri öneriyorum; süre, ekip kapasitesi ve gerçek veri büyüklüğü görülmeden kesinleştirilmemeli.

| Paket | İşler | Tamamlandı sayılması için |
|---|---|---|
| A — Hesap doğruluğu | F01, F02, F06, F07, F08; mevcut veri tutarlılık raporu | Güncel bağımsız bordro örnekleri, tam adet dağıtım, geçersiz ödeme/kilit/döviz testleri geçer |
| B — İşlem bütünlüğü | F03–F05, F09–F12, F15 | Hata enjeksiyonu/eşzamanlılıkta kısmi ve çift kayıt yok; kritik sürüm zorunlu |
| C — Kontrol ve işletim | İzole test/CI, mutabakat paneli, yedek alarmı/restore, erişim sınırları | Pilot kabul senaryoları, test DB güvenlik kapısı ve restore tatbikatı tamam |
| D — Depo ve üretim | Depo/rezervasyon/lot, BOM sürümü, kısmi üretim, maliyet, kalite | Bir sipariş satın almadan sevkiyata ve maliyete kadar izlenir |
| E — Entegrasyon ve büyüme | e-Belge, banka, kapasite planlama, onaylar, performans | Seçilen entegratör testleri, hedef veri hacminde ölçülen yanıtlar ve kullanıcı kabulü |

**Pilot için ilk iş:** Gerçek bir örnek siparişi model/renk/beden bazında açıp satın alma, mal kabul, üretim, fason, sevkiyat, fatura, tahsilat ve muhasebe adımlarından geçirmek. Her adımda belge, stok, cari ve fiş tutarlılığını kontrol eden kabul listesi oluşturmak.

## 10. Ürün ve kullanım önerileri

- Modül ana ekranlarında “bugün yapılacaklar / bekleyen onay / istisnalar” alanı.
- Belge üzerinde ilişkili sipariş, iş emri, irsaliye, fatura, ödeme ve fişe doğrudan geçiş.
- Taslak, kesinleşmiş, iptal ve dış sisteme gönderilmiş durumlarını ayrı ve açık göstermek.
- Kaydetme hatasında girilen veriyi korumak; modül değişiminde kaydedilmemiş veriyi belirtmek.
- Tablolarda sunucu sayfalama, kaydedilmiş filtreler, sütun tercihleri ve yetkili toplu işlem.
- Dashboard için kullanıcı rolüne göre görünüm: yönetici, satın alma, depo, üretim, muhasebe.
- Hata durumunu “veri yok” ile karıştırmamak; son güncelleme ve yeniden deneme sunmak.
- Mobilde tam ERP menüsü yerine barkodla mal kabul, sarfiyat, üretim bildirimi ve sevk kontrolü görevlerini öne çıkarmak.
- Genel para/miktar/tarih bileşenleri; belge ve raporlarda aynı yuvarlama, birim ve döviz tanımı.

## 11. Karar önerisi

İlk yatırımın yeni CRM veya çok şirket ekranı yerine **A ve B paketlerine** yapılmasını öneriyorum. Projenin temel riski modül azlığı değil, bazı mevcut süreçlerin yarım/tekrar/eşzamanlı çalışmada güvence seviyesinin farklı olması. Bu temel sağlamlaştırıldıktan sonra depo rezervasyonu, lot izi, gerçek üretim maliyeti ve kalite yönetimi işletmeye en yüksek faydayı sağlayacak sıradaki kapsamdır.

### Doğrulama notu

`npm run lint` ve `npm run build` bu incelemede başarıyla tamamlandı. Vite ana JS paketi yaklaşık 5,86 MB, gzip boyutu yaklaşık 1,23 MB; CSS yaklaşık 195,73 kB. Bunlar derleme boyutlarıdır, kullanıcı cihazında açılış/etkileşim süresi ölçümü değildir. Birim testlerinin 2 başarısız sonucu çözülmedi; raporlama isteği kapsamında işlevsel kod değiştirilmedi.
