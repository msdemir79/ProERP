# ERP geliştirme — uygulama durumu

Tarih: 15 Ekim 2026. Bu belge, aynı tarihli analiz raporundan sonra yapılan uygulamayı anlatır. Analiz raporu başlangıç durumunun kaydıdır; oradaki bulguların güncel durumu aşağıdadır.

## Uygulanan öncelikli değişiklikler

| Süreç | Uygulama |
|---|---|
| Sipariş | Başlık, kalemler ve otomatik iş emirleri tek sunucu transaction'ında; numara sunucudan; eski sürümle üzerine yazma engeli |
| İrsaliye | Oluşturma/kesinleştirme, sipariş sevk miktarı ve stok tek transaction'da; taslak fiziksel stok düşürmez; bir satır hata verirse tamamı geri alınır |
| Üretim | Aşama geçişi, reçete sarfı, fire ve mamul girişi birlikte; reçete anlık görüntüsü; tamamlama öncesi onaylı başarılı kalite kontrolü |
| Stok/MRP | Toplamı koruyan tam sayı beden dağıtımı; başka renk reçetesine sessiz geçişin kaldırılması; yetersiz stokta kısmi/sessiz çıkışın engellenmesi; dört ondalık hammadde miktarı |
| Tahsilat/tediye | Kasa/banka seçimi, pozitif kuruş tutarı, cari–fatura yönü ve kalan ödeme kontrolü |
| Döviz | Dönüşüm muhasebesi tamamlanana kadar ilgili finans işlemlerinde TRY dışı işlem reddi; tam döviz muhasebesi uygulanmadı |
| Tekrarlanan istek | İstemci işlem anahtarı ve DB'de transaction içi sonuç saklama; aynı anahtar/farklı gövde reddi |
| Dönem | Finans/stok ve İK yazma yollarına sunucu dönem kontrolü; kesinleşmiş yevmiye değişikliği engeli ve satır/hesap doğrulaması |
| Bordro | 2026 ücret/vergi/SGK varsayılanları; artan oranlı netten brüte hesap; sunucuda toplu üretim ve parametre anlık görüntüsü |
| Yetki | Rol atamada yetki yükseltme kontrolü; listelerde hassas alan süzme; canlı güncellemede kaynak yetkisi kontrolü |
| Ayarlar | Tek işlemde kaydetme, sürüm denetimi, sayaç geriletme engeli; kaydedilmemiş değişiklik uyarısı |
| Performans | Sayfaların ihtiyaç halinde yüklenmesi, eşzamanlı aynı GET isteklerinin birleştirilmesi, son siparişlerin doğru sıralanması |

## Eklenen yeni süreçler ve kullanım

- **Stok → Stok Rezervasyonları:** Satış siparişi veya iş emrine stok ayırma, kalan miktarı izleme, serbest bırakma. Rezervasyon fiziksel stok değildir. İlgili sevkiyat/üretim kendi rezervasyonunu tüketir; diğer işler ayrılmış stoğu kullanamaz.
- **Üretim → Kalite Kontrolleri:** Kontrol/ret miktarı, bulgu ve ayrı onay. Onay yetkisi gerekir; süper yönetici dışındaki kullanıcı kendi kontrolünü onaylayamaz. Uygunsuz sonuç sonrası yeni kontrol kaydı gerekir.
- **Siparişler → Satın Alma Talepleri:** Çok kalemli gerekçeli talep, kalem inceleme, onay/ret ve onaydan alış siparişi oluşturma. Karar tekrar verilerek ikinci sipariş üretilemez.

Ekranlarda yetkiye göre sekmeler gösterilir; listelerde son 200 kayıt bulunur. Mobil stok, sipariş ve üretim modüllerine ilgili operasyon ekranlarına giriş ve modüle dönüş eklendi.

## İkinci geliştirme adımı

- **Muhasebe → Dönem Kontrolü ve Kapama:** Ay/yıl seçimi, açık/kapalı durum ve beş maddelik kontrol listesi. Taslak fiş, hatalı kesinleşmiş fiş, muhasebe fişi olmayan kesinleşmiş fatura veya makbuz varsa kapama engellenir. Taslak faturalar bilgi olarak gösterilir. Kapama/yeniden açma muhasebe onay yetkisi, güncel sürüm ve gerekçe gerektirir; işlem audit kaydına yazılır. Genel kayıt API'siyle muhasebe kontrol listesini atlayarak kilit değiştirme engellendi.
- **Çok kalemli satın alma:** Kalem ekleme/silme, birime göre miktar adımı, satır KDV'si, satır/genel toplam önizlemesi ve talep kalemlerini inceleme eklendi. Onay bütün kalemleri tek transaction'da siparişe dönüştürür.
- **Mobil operasyonlar:** Rezervasyon, kalite ve satın alma ekranları mobil kabuğa bağlandı; `/…/workflows` bağlantıları mobilde doğru modülü açar. Muhasebe dönem ekranı masaüstü muhasebe modülündedir.
- Bu adım ek DB migration'ı gerektirmedi; canlı dönemler açılmadı/kapatılmadı ve gerçek satın alma talebi oluşturulmadı.

## Veri ve kurulum durumu

- Şema değişikliğinden önce SQL ve yüklenen görsellerin yedeği alındı: `E:\ProERP\backups\proerp-20261015-213843`.
- Canlı şemaya 011, 012 ve 013 migration'ları uygulandı: işlem tekilleştirme; rezervasyon/kalite/satın alma; bordro ve reçete anlık görüntüleri.
- Eski bordrolar, bakiyeler ve stoklar topluca yeniden hesaplanmadı. Mevcut kayıtlı eski İK parametreleri otomatik değiştirilmedi: İK ayarlarındaki **2026 imalat tarifesini uygula** seçimi kontrol edilip kaydedilmelidir. Teşvik uygunluğu işletmeye göre doğrulanmalıdır.
- Bu çalışma çalışan uygulama servisini yeniden başlatmadı. Kaynak ve derleme değişikliklerinin çalışan sürüme geçmesi kontrollü yeniden başlatma gerektirir.

## Doğrulama

- `npm test`: **29 başarılı birim testi**.
- `npm run lint`: TypeScript denetimi başarılı.
- `npm run test:local-db`: **20 başarılı işlem bütünlüğü testi**; sistem MySQL servisinden ve canlı veriden ayrı geçici MySQL sunucusu/veritabanı kullanır ve sonunda temizler. Yeni kontroller çok kalemli talep/KDV, kapama engelleri, eski sürüm ve görüntüleme/onay yetkisi ayrımını kapsar.
- Üretim derlemesi kontrol edildi; büyük ortak paketler için Vite boyut uyarısı sürüyor.
- İzole örnek verilerle masaüstünde dönem kontrol listesi ve çok kalemli form, 390 px mobilde satın alma ekranı ve modüle dönüş kontrol edildi. Önceki adımda kalite onayı da kontrol edildi. Bu, tüm mobil/masaüstü akışların uçtan uca kabul testi değildir.
- CI tanımı eklendi. Uzak CI çalıştırıldığı iddia edilmez. Eski entegrasyon/silme/RBAC/yük testlerinin tamamı yeni kontrollü yazma sözleşmesine uyarlanıp çalıştırılmadı.

## Analiz bulgularının kapanış durumu

| Bulgular | Durum |
|---|---|
| F01 | 2026 hesap, varsayılan ve snapshot uygulandı; tarih bazlı tüm yıl/teşvik kataloğu açık |
| F02–F06 | Ana servis yolları düzeltildi; seçilmiş işlem bütünlüğü testleri geçti |
| F07 | Sunucu kilit denetimleri ve muhasebe dönem kapama/kontrol listesi ekranı eklendi; kapsamlı dönem sonu mutabakatları açık |
| F08 | Hatalı döviz etkisine engel kondu; kur değerleme ve tam döviz muhasebesi açık |
| F09 | Sipariş/ayar sürüm kontrolü eklendi; tüm eski düzenleme ekranlarında yaygınlaştırma açık |
| F10 | İşlem tekilleştirme altyapısı ve istemci anahtarı eklendi; kayıt arşivleme politikası açık |
| F11–F12 | Ana sipariş/üretim ayarları ve belge numaraları sunucuya bağlandı; bütün ayarlar için davranış matrisi açık |
| F13 | Reçete seçimi ve dağıtım düzeltildi |
| F14 | Kullanıcının talebiyle ertelendi |
| F15 | Kritik yollar genişletildi; bütün uçlar için bağımsız güvenlik/regresyon denetimi açık |
| F16 | Kod bölme/okuma birleştirme yapıldı; büyük listeler için sunucu sayfalama ve MRP toplu sorguları açık |
| F17 | Yetkiye bağlı alan süzme eklendi; bütün sorgu sözleşmelerinin daraltılması açık |
| F18 | SSE oturum/yetki denetimi iyileştirildi; çok süreçli oturum/event altyapısı açık |
| F19–F20 | Ayar atomik kaydı/sürüm kontrolü ve dashboard sıralaması düzeltildi |

## Kalan işler — önerilen uygulama sırası

1. **Mevcut kapsamı tamamlama:** Eski regresyon testlerini yeni işlem sözleşmelerine uyarlama; tüm düzenlemelerde sürüm kontrolü; tam dönem sonu mutabakatları. Ürün/varyant stok sayımı, fark onayı ve rezervasyon uzlaştırma 16 Ekim adımında eklendi; ayrıntılar `ERP_STOK_KONTROL_2026-10-16.md` dosyasında.
2. **Depo ve izlenebilirlik:** Depo/raf bazlı stok defteri, transfer ve transit durum, lot/seri, giriş kalite karantinası, sayım/fark onayı. Mevcut toplam stoğun depo açılış dağıtımı ayrıca planlanmalı.
3. **Satın alma bütünlüğü:** İhtiyaç → teklif karşılaştırma → talep → sipariş → mal kabul → kalite → alış faturası; miktar/fiyat toleranslı üçlü eşleştirme; tedarikçi iadesi.
4. **Üretim maliyeti ve planlama:** Fiilî sarf/işçilik/fason/genel gider, yarı mamul ve maliyet kapanışı; iş merkezi takvimi, kapasite, operasyon süreleri ve termin tahmini.
5. **Muhasebe/finans:** Döviz kuru ve değerleme, mali dönem kapanış kontrolleri, mutabakat, bütçe/nakit akış senaryoları; sabit kıymet/amortisman. Mevcut makbuz/fiş kurallarını aşan genişletmeler ayrıca test edilmeli.
6. **Kurumsal kapsam:** Çok şirket/şube, onay limitleri ve vekâlet, CRM, bakım, gelişmiş raporlama, arşivleme ve felaket kurtarma tatbikatı.

**Ertelenen kapsam:** e-Fatura, e-Arşiv ve harici banka bağlantıları kullanıcı talebiyle sonraya bırakılmıştır. İç kasa/banka hesap kayıtları ve finans doğrulamaları bu ertelemeden ayrı yürütüldü.

Bu teslim, öncelikli bütünlük düzeltmeleri ve üç yeni operasyon sürecini kapsar. Rapordaki bütün ERP modüllerinin tamamlandığı anlamına gelmez.
