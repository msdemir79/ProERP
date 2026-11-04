# ERP ilerleme — 17 Ekim 2026

## 404 düzeltmesi

Stok Sayımı ve Rezervasyon Uzlaştırma sekmeleri yeni istemci koduyla açılıyordu; ancak 3000 portundaki eski sunucu süreci yeni işlem yollarını henüz yüklememişti. Güncel kaynakla yeniden açılan sunucuda `/api/health` 200, kimlik doğrulaması olmayan `/api/ops/stock-count-summary` isteği 401 döndü. Sayım ve uzlaştırma işlemlerinin yanıtları izole veritabanı testlerinde ayrıca doğrulandı. Windows `ProERP` hizmeti kapalı ve NSSM başlatma ayarını değiştirmek için yönetici hakkı gerekiyor. Bu nedenle `npm run dev` geçerli terminal oturumunda çalıştırıldı. Kalıcı hizmeti güncel üretim derlemesiyle açmak için yalnız hizmet ayarlarını değiştiren `scripts/repair-proerp-service.ps1` hazırlandı; yönetici PowerShell gerektirir. Hizmetin kalıcı çalışması henüz doğrulanmadı.

## Tamamlanan ek işler

- Eski rol testleri gerçek kullanıcı kayıtlarından ayrıldı. Test rolleri ayrı geçici MySQL veritabanında oluşturuluyor; sayım, uzlaştırma, satın alma kararı, dönem kapama ve doğrudan sayım tablosu yazma izinleri dahil 47 kontrol geçti.
- Rezervasyon uzlaştırma taraması, sayfa başına toplu bakiye sorgusuna geçirildi. 206 kayıtlık sayfalama, sorun nedenleri ve tek kayıt onayının kilitli yeniden kontrolü izole testle doğrulandı.
- Fatura kesinleştirmede sipariş tipi/cari, ürün/renk/beden, sipariş kalemi ve kalan miktar denetleniyor. İrsaliyeye bağlı fatura satırları ile mal kabul satırları ve miktarları eşleşmek zorunda. Taslaktan kesinleştirme de aynı kontrollerden geçiyor; uygunsuz işlem bütünüyle geri alınıyor.
- Geçici MySQL'in yavaş Windows açılışına karşı test betiği hazır olma süresi uzatıldı. Yeni testler CI tanımına eklendi. Eski sunucu ile yeni ekran uyuşmazlığında genel 404 yerine yeniden başlatma gereğini anlatan uyarı gösterilir.

## Doğrulama

Bu turda 29 birim testi, 47 rol/yetki kontrolü, 11 fatura eşleştirme testi, 206 kayıt içeren rezervasyon tarama testi, 20 genel işlem bütünlüğü testi ve 11 sayım/uzlaştırma testi başarılı. TypeScript denetimi ve üretim derlemesi geçti. Veritabanı testleri gerçek kayıtlar yerine ayrı geçici MySQL kullandı. Güncel geliştirme sunucusunda sağlık kontrolü veritabanı bağlantısıyla birlikte 200 döndü. Windows hizmeti yönetici yetkisi olmadan ayarlanamadığından hizmet üzerinden kalıcı açılış ayrıca doğrulanmalıdır.

## Açık kapsam

Sipariş–irsaliye–fatura eşleştirmesinde fiyat toleransları ve tedarikçi faturası için tam üçlü eşleştirme henüz yok. Stok sayım farklarının maliyet ve muhasebe etkisi, depo/raf/lot bazlı defter, diğer ekranlardaki sürüm koruması ve kapsamlı dönem sonu mutabakatları açık. e-Fatura, e-Arşiv ve dış banka bağlantıları kullanıcı talebiyle ertelendi.
