# DMR Nexus proje ve UI/UX denetimi — 1 Kasım 2026

## Sonuç ve kapsam

Proje geniş bir ayakkabı üretimi ERP kapsamına sahip; ancak **bütün ekranların aynı görsel düzende olduğunu doğrulamak mümkün değil**. Ana Sayfa, Stok ve Ayarlar temsilî açık/koyu tema incelemesinde ortak yüzey ve mavi vurgu dilini izliyor. Denetimde Şablonlar, Stok Detay Raporu ve Üretim'de farklı başlık, renk, yoğunluk ve sekme düzenleri bulundu; bu turda ortak bileşenlere taşındı. Tüm yolların açık/koyu ve farklı ekran genişliklerinde görsel karşılaştırması hâlâ gerekiyor.

İnceleme mevcut çalışma ağacını (commit `014cfb6` ve commit edilmemiş değişiklikler) kapsar. Yaklaşık 351 proje dosyası içinden 177 TSX bileşeni ve 27 masaüstü yolunun kodu tarandı. Gerçek şirket verisi yerine ayrı geçici MySQL'de açılan kimlikli önizlemede temsilî ekran ve etkileşimler incelendi. Her düğme ve her iş akışı uçtan uca tıklanmadı; canlı şirket verisine yazma testi yapılmadı. Aşağıdaki “doğrulandı” bulguları izole HTTP testi veya ekranda gözlemle desteklenir; “koddan risk” olanlar ayrıca belirtilir.

## Yüksek öncelikli bulgular ve bu turdaki düzeltmeler

| Alan | Kanıt ve kullanıcı etkisi | Durum |
|---|---|---|
| İptal durumunda fatura oluşturma | `server/businessOps.ts` içindeki `create-invoice`, istemciden `status='cancelled'` kabul edip stok/cari/muhasebe etkisi uyguluyordu. İzole HTTP testinde stok 100→102, fatura `cancelled`; sonradan iptal isteği `ALREADY_CANCELLED` döndü. | **Doğrulandı ve düzeltildi.** Yeni faturada yalnız `draft`/`issued` kabul ediliyor; regresyon testi geçti. |
| İrsaliyeye bağlı faturada çift stok hareketi | Stok etkisi olan alış irsaliyesiyle stok 100→103 oldu; aynı irsaliyeye bağlanan stok etkili faturayla 103→106 oldu. İstemci varsayılanı bunu kapatsa da kutu yeniden açılabiliyordu. | **Doğrulandı ve düzeltildi.** Sunucu iki belgeye aynı stok etkisini vermiyor; taslak ve eski taslağı kesinleştirme de test edildi. |
| Rapor açılışında veri değişikliği | `StockSummaryReport.tsx` ve `StockDetailReport.tsx` açılışta `sync-variant-stocks` POST gönderiyordu. Bu işlem sunucuda tüm ürünleri kilitleyip bazı varyant stoklarını güncelliyor. Sadece raporu açmak veri değiştirebiliyordu. | **Kod akışıyla doğrulandı; düzeltildi.** Otomatik çağrılar kaldırıldı. Detay raporundaki açık “Stokları Onar” işlemi korundu. |
| Koyu temada okunmayan stok satırı | `/reports/detail` ekranında ürün adı beyaz kartta açık renkte kaldı. `StockDetailRow.tsx` içindeki `dark:bg-slate-800/50/80` geçersiz sınıf olduğu için koyu zemin uygulanmıyordu. | **Ekranda doğrulandı; düzeltildi ve yeniden görüntülendi.** 17 dosyadaki 35 geçersiz çift opaklık sınıfı dönüştürüldü; koyu tema ürün satırları artık okunuyor. |
| Uygulama sürekliliği | Windows `ProERP` hizmeti `Stopped/Manual`; 3000 portunda uygulama açılışta çalışmıyordu. | **Doğrulandı; açık.** Denetim için geliştirme sunucusu geçici açıldı. Kalıcı servis onarımı için yönetici yetkisi ve `scripts/repair-proerp-service.ps1` gerekir. |

## Etkileşim ve gezinme

| Öncelik | Bulgu | Kanıt / durum |
|---|---|---|
| P2 | Üst aramadaki ürün/cari sonucuna tıklama ilgili kaydı açmıyordu; örnek “Doğal deri” tıklanınca stok sayfasında kalıp arama temizlendi. | İzole arayüzde doğrulandı ve düzeltildi; `Common/GlobalSearch.tsx`, `Inventory.tsx`, `Contacts.tsx`. Yeni derlemede ürün sonucu detay panelini, cari derin bağlantısı cari detayını açtı. |
| P2 | Mobilde masaüstü derin bağlantıları ilgili ekrana gitmiyordu; `/inventory`, `/settings`, `/invoices` özet akışına düşüyordu. | Koddan doğrulandı ve düzeltildi. Desteklenen mobil sekmeler URL ile eşleşiyor; diğer modüller dar ekranda gerçek yollarıyla açılıyor. Fiziksel cihazda görsel doğrulama bekliyor. |
| P2 | Bilinmeyen masaüstü adresi boş sayfa açıyordu. | `/does-not-exist` izole arayüzde doğrulandı; `App.tsx` için ortak 404 görünümü eklendi ve yeniden açılışta “Ana sayfaya dön” bağlantısıyla görüntülendi. |
| P3 | Alt yollarda sayfa başlığı üst modül başlığını gösteriyordu; `/production/workflows` tarayıcı başlığında “Üretim Planlama” idi. | İzole arayüz ve `lib/navConfig.ts` ile doğrulandı; tam yol eşleştirmesi eklendi. Yeni derlemede başlık “Kalite & Operasyonlar”. |
| P3 | Mobil cari detayında vade boşsa “null gün” yazıyordu. | İzole mobil önizlemede doğrulandı; `mobile/MobileContactDetail.tsx` boş değerde vade satırını gizliyor. |

Buton taramasında 177 TSX dosyasında boş `onClick`, `href="#"` veya yanlışlıkla submit olan türsüz form düğmesi bulunmadı. Stok sayımı/uzlaştırma sekmeleri, satın alma inceleme penceresi, stok kartı Görüntüle/Analiz, barkod ayarları ve kullanıcı menüsü izole önizlemede açıldı; 404 görünmedi. Güncel derlemede 27 masaüstü yolu açılış taramasından geçti; yavaş yüklenen yollar tekrar kontrol edildi, hiçbiri hata ekranına düşmedi. Bu, **bütün butonların çalıştığına dair sertifika değildir**: veri yazan, dosya yükleyen, yazdıran ve yetkiye bağlı tüm varyantlar tek tek sınanmadı.

## ERP ve backend bulguları

| Öncelik | Risk / eksik süreç | Kod kanıtı ve öneri |
|---|---|---|
| P2 | 201 veya daha fazla satırlı toplu güncellemede satır bazlı denetim izi eksik kalıyordu. | `server/api.ts` içindeki 200 satırlık anlık görüntü sınırı kaldırıldı; kilitli satır görüntüsü denetim için de kullanılıyor. İzole testte 205 cari değişti ve her biri için denetim izi oluştu. **Düzeltildi.** |
| P2 | Stok sayımı miktar ve hareket defteri üzerinde çalışıyor; farkın değerleme ve muhasebe fişi süreci yok. | `server/stockCounts.ts`; stok farkı için maliyet politikası, onaylı fark hesabı ve dönem kilidiyle yevmiye tasarlayın. |
| P2 | Uygulama her açılışta başlangıç veri ekleme (`runSeed`) çağırıyor; seed hatasını loglayıp yine hizmet veriyor. Sağlık kontrolü yalnız DB bağlantısını ölçüyor. | `server.ts`, `server/seed.ts`; kurulum verisini açık kurulum komutuna taşıyın, migration/şema hazırlığını health'e ekleyin. |
| P2 | Tedarikçi faturasında fiyat/tolerans ve tam sipariş–mal kabul–fatura üçlü eşleştirmesi tamamlanmadı. | `server/businessOps.ts`; miktar eşleştirmesine fiyat ve kısmi faturalama kuralları ekleyin. |
| P2 | Genel liste API'sinde varsayılan sayfalama ve üst limit yok; büyüyen tablolar limitsiz okunabiliyor. | `server/api.ts`; güvenli varsayılan sayfa boyutu ve üst sınır koyun, istemcide imleçli/sayfalı gezinme sağlayın. |
| P2 | Oturumlar yalnız sunucu sürecinin belleğinde; yeniden başlatma bütün oturumları düşürüyor ve çoklu sunucuya geçişi engelliyor. | `server/auth.ts`; kalıcı/merkezi, süreli oturum deposuna geçin. |

## Görsel düzen ve erişilebilirlik

| Öncelik | Bulgu | Konum / öneri |
|---|---|---|
| P2 | Şablonlar ayrı büyük/kalın başlık ve mor ana buton; Stok Detay Raporu büyük harfli başlık, mor/yeşil aksiyonlar ve koyu filtre alanı kullanıyordu. | `Inventory/Templates.tsx`, `Inventory/BarcodeTemplatesManager.tsx` ve `Reports/StockDetailReport.tsx` ortak başlık, sekme, buton, alan ve yüzey tokenlarına taşındı. Durum sayıları filtre öncesi kümeden hesaplanıyor. Rapor açık/koyu temada görüntülendi; son barkod düzeni için görsel karşılaştırma açık. |
| P2 | Üretimde açık temada da neredeyse siyah iş istasyonu ve üstte üç satıra taşabilen 10 sekme vardı. | `Production.tsx` sekmeleri dört süreç grubuna ayırıyor; hat, zaman çizelgesi, kapasite ve renk-beden görünümleri tema yüzeylerini kullanıyor. Açık temada görünüm ve grup geçişi doğrulandı; koyu tema ve diğer alt ekranlar için görsel karşılaştırma açık. |
| P2 | Barkod İstasyonu ikonunda beyaz ikon beyaz karede kayboluyordu. | İzole açık temada doğrulandı; `Production.tsx` için kontrast düzeltildi ve yeni derlemede görünür olduğu kontrol edildi. |
| P2 | Ortak tabloda sıralama yalnız fare tıklamasıyla yapılıyor; filtre ve seçim kutularında erişilebilir ad eksikleri var. Modallar `role="dialog"`, `aria-modal` ve odak yönetimini sağlamıyordu. | `Common/DataGrid.tsx`, `Modal.tsx`; klavyeyle sıralama, etiket, dialog rolü ve odak yönetimi eklendi. Daha geniş ekran okuyucu testi önerilir. |
| P3 | Şablonlardaki yalnız ikonlu sil düğmelerinin erişilebilir adı yoktu; eklendi. Plus Jakarta Sans/JetBrains Mono tokenlarda var ama font dosyası veya import yok; cihazlar farklı yedek fonta düşüyor. | `Inventory/Templates.tsx`, `index.css`; **font konusu açık**. |

`index.css` ortak semantik renk/yüzey tokenları tanımlıyor; ancak bazı ekranlar halen doğrudan `slate`, `indigo`, `purple`, `emerald` sınıfları kullanıyor ve `PageHeader` bütün modüllerde kullanılmıyor. Bu yüzden şu anda tüm modüller için **tek düzen onayı verilemez**. Hedef, başlık–eylem–sekme–filtre–tablo–boş/hata durumu sözleşmesini kalan ekranlara yaymak ve 27 yolu açık/koyu, masaüstü/mobil görünümde görsel regresyonla karşılaştırmak olmalı.

## Kalite kapısı ve işletim

- `npm run lint`, 29 birim testi, 16 izole fatura belge eşleştirme testi, 21 izole işlem bütünlüğü testi ve üretim derlemesi geçti. İzole ekran önizlemesi gerçek şirket kayıtlarına dokunmadı.
- Geçici önizlemede Üretim sekme grupları, Şablonlar ve Stok Detay Raporu masaüstünde açıldı; Stok Detay Raporu açık/koyu temada görüntülendi. 390 px genişlikte ürün ve cari derin bağlantıları ilgili detayları açtı; Ayarlar adresi özet yerine gerçek sayfayı açtı. Son barkod şablonu düzenlemesinin sayfa yüklenmesi ve başlığı ayrıca doğrulandı. Fiziksel cihaz ve bütün modül etkileşimleri hâlâ kapsam dışı.
- CI, birim/izole stok sayımı, yetki, rezervasyon ve fatura eşleştirme testleri ile derlemeyi çalıştırıyor. Tarayıcı tabanlı otomatik uçtan uca veya görsel regresyon testi yok; bu nedenle yeni rotaların, bütün butonların ve temaların sürekli doğrulanması eksik.
- Derleme ana istemci paketini yaklaşık 1,26 MB, Excel paketini yaklaşık 940 KB üretiyor ve büyük paket uyarısı veriyor. Bu bir açılmama hatası değil; yavaş bağlantıda ilk yükleme ve ilgili ekranların açılışında gecikme riski. Paket ayrımı ve kullanım başına yükleme ölçülmeli.
- README içindeki `test:rbac` açıklaması geçici veritabanı davranışına göre güncellendi.
- e-Fatura, e-Arşiv ve dış banka bağlantıları kullanıcının isteğiyle bu öncelik listesinde ertelendi.

## Önerilen sıra

1. Yeni derlenen fatura/stok korumalarını kalıcı Windows hizmetine alın; yönetici yetkisiyle hizmeti onarıp yeniden başlatma, giriş ve yedekten geri dönüş tatbikatı yapın.
2. “Stokları Onar” için etki önizlemesi ve açık onay ekleyin; tedarikçi faturasında fiyat/tolerans içeren üçlü eşleştirmeyi tamamlayın.
3. Mobil bağlantıları fiziksel cihazda doğrulayın; ortak tabloların ve modalların ekran okuyucu/klavye davranışını otomatik test edin.
4. Kalan modülleri ortak sayfa/sekme/renk sözleşmesine taşıyın; açık/koyu tema ile masaüstü/mobil kırılımlarda görsel regresyon kurun.
5. Sayımın mali etkisini, liste sayfalamasını ve kurulum/health kontrolünü tamamlayın.
