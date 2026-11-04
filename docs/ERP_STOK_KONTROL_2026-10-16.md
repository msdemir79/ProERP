# ERP geliştirme durumu — 16 Ekim 2026

## Tamamlanan süreç

Operasyon ve onay merkezine **Stok Sayımı** ve **Rezervasyon Uzlaştırma** sekmeleri eklendi. Mevcut rezervasyon, kalite ve satın alma süreçleri korunur.

- Sayım başına 1–100 ürün; renk/beden bazında fiziksel miktar girişi, kayıtlı miktar ve fark incelemesi.
- Sayım onaya gönderildiğinde stok değişmez. Onay, bütün kalemleri tek işlemde işler; bir kalem geçersizse hiçbir stok değişmez.
- Sayımdan sonra değişen stok kartı yeniden sayım gerektirir. Aktif rezervasyonların altına stok düşürülemez. Kapalı muhasebe döneminde onay yapılamaz.
- Onay/ret gerekçesi ve işlem geçmişi tutulur. Süper yönetici dışındaki kullanıcı kendi sayımına karar veremez. Görüntüleme, düzenleme ve onay yetkileri ayrıdır.
- Renk/beden farkları, toplam miktar değişmese de ayrı stok hareketlerine yazılır. Barkodlar korunur.
- Kapalı sipariş/iş emri, stok aşımı ve sipariş miktarı uyuşmazlığı olan aktif rezervasyonlar listelenir. Yetkili kullanıcı gerekçeyle serbest bırakabilir; işlem öncesinde güncel durum yeniden kontrol edilir. Fiziksel stok değişmez.
- Satış siparişine ayrılan toplam miktarın kalan sipariş ihtiyacını aşması engellendi.
- Sayımlar 100 kayıtlık sayfalarla, aktif rezervasyonlar 200 kayıtlık tarama gruplarıyla erişilebilir.

## Kurulum ve veri güvenliği

Şema değişikliği öncesinde `E:\ProERP\backups\proerp-20261016-201800` yedeği alındı. Mevcut `014-workorder-line.sql` korunarak yeni tablo için `015-stock-counts.sql` uygulandı. Canlı stoklara sayım farkı uygulanmadı, gerçek rezervasyonlar serbest bırakılmadı. Çalışan uygulama servisi yeniden başlatılmadı; yeni derlemenin kullanılması için kontrollü yeniden başlatma gerekir.

## Doğrulama

- 29 birim testi ve 20 genel işlem bütünlüğü testi başarılı.
- Ayrı geçici MySQL üzerinde 11 sayım/uzlaştırma testi başarılı: sayım/onay, tekrar istek, varyant hareketi, tüm işlemi geri alma, yetki, kapalı dönem, rezervasyon ve eski sayımlara erişim. Bu adımda toplam 60 test geçti.
- TypeScript denetimi ve üretim derlemesi başarılı. Büyük paket boyutu uyarısı sürüyor.
- İzole örnek verilerle masaüstünde yeni sekme, ürün ekleme ve miktar alanları görsel olarak kontrol edildi. Bu çalışma bütün mobil akışların uçtan uca kabul testi değildir.
- Yeni test paketi CI tanımına eklendi; uzak CI çalıştırılmadı.

## Sınırlar ve sonraki işler

Sayım farkı fiziksel stok hareketidir; otomatik maliyet muhasebesi fişi henüz oluşturmaz. Süreç mevcut ürün/varyant toplam stoğuyla çalışır; depo/raf/lot bazlı sayım değildir. Rezervasyon taramasındaki kayıt başına sorgular 17 Ekim adımında toplulaştırıldı.

Sonraki öncelikler: eski regresyon testlerini güncel işlem sözleşmesine uyarlama, diğer düzenleme ekranlarında sürüm koruması, depo/raf stok defteri ve transfer, satın almada mal kabul–fatura eşleştirme, fiilî üretim maliyeti ve kapasite planlama. Önceki analiz raporundaki diğer açık maddeler sürmektedir.

**e-Fatura, e-Arşiv ve dış banka bağlantıları kullanıcı talebiyle ertelenmiştir.** Tüm ERP eksiklerinin tamamlandığı iddia edilmez.
