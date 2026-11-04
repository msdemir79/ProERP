import { Truck, QrCode, User } from 'lucide-react';
import { numberToTurkishWords } from '../Invoices/InvoicePrintModal';

// =========================================================================================
// 1. GİB RESMİ STANDART e-İRSALİYE ŞABLONU (VUK 509 Tebliği Uyumlu)
// =========================================================================================
export function GibStandardWaybillTemplate({ waybillData, companySettings }: { waybillData: any; companySettings?: any }) {
  const isSales = waybillData.type === 'sales';
  const contact = waybillData.contact;
  const items = waybillData.items || [];
  
  const waybillDateStr = waybillData.date ? new Date(waybillData.date).toLocaleDateString('tr-TR') : '-';
  const dispatchDateStr = waybillData.dispatchDate ? new Date(waybillData.dispatchDate).toLocaleDateString('tr-TR') : waybillDateStr;
  const dispatchTimeStr = waybillData.dispatchTime || '10:00';
  const waybillTimeStr = waybillData.createdAt 
    ? new Date(waybillData.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : '10:00';

  const totalQuantity = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0);
  const totalAmount = waybillData.grandTotal || 0;

  const compName = companySettings?.companyName || 'DMR Nexus';
  const compTitle = companySettings?.companyTitle || companySettings?.companyName || 'DMR Nexus';
  const compLogo = companySettings?.logo;
  const compAddress = companySettings?.address || 'İkitelli OSB Mah. Aykosan Sanayi Sitesi 4. Ada A Blok No: 12 Başakşehir / İSTANBUL';
  const compTaxOffice = companySettings?.taxOffice || 'İkitelli VD';
  const compTaxNumber = companySettings?.taxNumber || '7320489123';
  const compTradeReg = companySettings?.tradeRegistryNo || '489123';
  const compPhone = companySettings?.phone || '+90 212 671 00 00';
  const compEmail = companySettings?.email || '';

  return (
    <div className="space-y-4">
      {/* 1. Header: Logo, Resmi GİB Hilal-Yıldız ve Resmi Belge Kutusu */}
      <div className="border-b-2 border-slate-900 pb-4">
        <div className="flex items-start justify-between gap-4">
          
          {/* Sol: Firma Bilgileri */}
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              {compLogo ? (
                <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 p-0.5 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                  <img src={compLogo} alt={compName} className="max-w-full max-h-full object-contain" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white font-black flex items-center justify-center text-sm shrink-0">
                  {compName.charAt(0)}
                </div>
              )}
              <div>
                <h1 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none uppercase">
                  {compTitle}
                </h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                  Üretim & Lojistik Merkezi
                </p>
              </div>
            </div>
            
            <div className="text-[10px] text-slate-700 dark:text-slate-200 leading-tight pt-1">
              <p className="font-semibold">{compAddress}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[9px] text-slate-600 mt-0.5">
                <span>Tel: {compPhone}</span>
                <span>E-Posta: {compEmail}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[9px] font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                <span>VD: {compTaxOffice}</span>
                <span>VKN: {compTaxNumber}</span>
                <span>Tic. Sicil No: {compTradeReg}</span>
              </div>
            </div>
          </div>

          {/* Orta: GİB Resmi Hilal-Yıldız Amblemi */}
          <div className="flex flex-col items-center justify-center text-center px-2">
            <div className="w-14 h-14 rounded-full border border-slate-300 flex items-center justify-center p-1 shadow-xs">
              <div className="w-full h-full rounded-full bg-rose-600 text-white flex flex-col items-center justify-center font-bold">
                <span className="text-[10px] leading-none">★</span>
                <span className="text-[8px] font-black tracking-tighter">GİB</span>
              </div>
            </div>
            <span className="text-[8px] font-black text-rose-700 uppercase tracking-widest mt-1">
              GELİR İDARESİ
            </span>
            <span className="text-[7px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              BAŞKANLIĞI
            </span>
          </div>

          {/* Sağ: Resmi e-İrsaliye Onay Kutusu */}
          <div className="w-56 border-2 border-rose-600 rounded-lg p-2.5 bg-rose-50/40 text-center shrink-0">
            <div className="bg-rose-600 text-white font-black text-xs py-1 px-2 rounded uppercase tracking-wider mb-1.5 shadow-xs flex items-center justify-center gap-1">
              <Truck className="w-3.5 h-3.5" />
              <span>e-İRSALİYE</span>
            </div>
            <div className="space-y-0.5 text-[9px] text-left font-mono">
              <div className="flex justify-between">
                <span className="font-bold text-slate-600">İrsaliye No:</span>
                <span className="font-black text-slate-900 dark:text-slate-100">{waybillData.waybillNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-600">İrsaliye Tarihi:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{waybillDateStr}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-600">Düzenleme Saati:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{waybillTimeStr}</span>
              </div>
              <div className="flex justify-between text-rose-800 font-bold bg-rose-100/70 px-1 py-0.5 rounded">
                <span>Fiili Sevk Tarihi:</span>
                <span className="font-black">{dispatchDateStr}</span>
              </div>
              <div className="flex justify-between text-rose-800 font-bold bg-rose-100/70 px-1 py-0.5 rounded">
                <span>Fiili Sevk Saati:</span>
                <span className="font-black">{dispatchTimeStr}</span>
              </div>
              <div className="flex justify-between pt-0.5">
                <span className="font-bold text-slate-600">Senaryo:</span>
                <span className="font-black uppercase text-slate-900 dark:text-slate-100">
                  {waybillData.scenario === 'sevk' ? 'TEMEL SEVK' : waybillData.scenario?.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Resmi e-İrsaliye ETTN ve Yasal İbare Şeridi */}
      <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 rounded p-2 text-[9px] font-mono flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-bold text-slate-500 dark:text-slate-400 uppercase">ETTN (Belge Benzersiz No):</span>{' '}
          <span className="font-black text-slate-800 dark:text-slate-200 select-all">{waybillData.ettn || '4f1b8a92-7d34-4b5a-901c-6e82a938c105'}</span>
        </div>
        {waybillData.orderNumber && (
          <div>
            <span className="font-bold text-slate-500 dark:text-slate-400 uppercase">Sipariş No:</span>{' '}
            <span className="font-black text-indigo-700">{waybillData.orderNumber}</span>
          </div>
        )}
      </div>

      {/* 3. Alıcı / Müşteri ve Taşıyıcı / Lojistik Bilgileri (2 Kolon) */}
      <div className="grid grid-cols-2 gap-3 text-[10px]">
        {/* Sol Kolon: Alıcı / Sevk Bilgileri */}
        <div className="border border-slate-300 rounded p-3 bg-white dark:bg-slate-900 space-y-1.5 shadow-2xs">
          <div className="border-b border-slate-200 dark:border-slate-700 pb-1 flex items-center justify-between">
            <span className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-rose-600" />
              SAYIN / SEVKİYAT ALICISI
            </span>
            <span className="text-[9px] font-mono font-bold text-slate-400">
              {contact?.code || 'CAR-001'}
            </span>
          </div>
          
          <div className="font-bold text-slate-900 dark:text-slate-100 text-xs uppercase">
            {contact?.companyTitle || contact?.name || 'Müşteri Ünvanı Belirtilmedi'}
          </div>

          <div className="text-slate-600 text-[9px] leading-tight space-y-0.5">
            <p className="font-medium">
              <span className="font-bold text-slate-700 dark:text-slate-200">Fatura Adresi:</span>{' '}
              {contact?.address || 'Adres bilgisi girilmemiştir.'}
              {contact?.city && ` - ${contact.district || ''} / ${contact.city}`}
            </p>
            <p className="font-bold text-slate-800 dark:text-slate-200 bg-amber-50 p-1 rounded border border-amber-200 mt-1">
              <span className="text-rose-700">Sevk / Teslimat Depo Adresi:</span>{' '}
              {waybillData.deliveryAddress || contact?.shippingAddress || contact?.address || 'Merkez Depo'}
            </p>
            <div className="flex flex-wrap gap-x-3 pt-1 text-slate-800 dark:text-slate-200 font-mono font-semibold">
              <span>VD: {contact?.taxOffice || 'Belirtilmedi'}</span>
              <span>VKN/TCKN: {contact?.taxNumber || contact?.tcKimlik || '11111111111'}</span>
              {contact?.phone && <span>Tel: {contact.phone}</span>}
            </div>
          </div>
        </div>

        {/* Sağ Kolon: Taşıyıcı Firma & Sürücü / Araç Lojistik Bilgileri */}
        <div className="border border-slate-300 rounded p-3 bg-white dark:bg-slate-900 space-y-1.5 shadow-2xs">
          <div className="border-b border-slate-200 dark:border-slate-700 pb-1 flex items-center justify-between">
            <span className="font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-indigo-600" />
              TAŞIYICI / LOJİSTİK BİLGİLERİ
            </span>
            <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded">
              VUK 509 Zorunlu
            </span>
          </div>

          <div className="space-y-1 text-[9px] font-mono">
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-0.5">
              <span className="text-slate-500 dark:text-slate-400 font-bold">Taşıyıcı Ünvanı:</span>
              <span className="font-black text-slate-800 dark:text-slate-200">
                {waybillData.carrierTitle || 'ÖZLEM NAKLİYAT VE LOJİSTİK A.Ş.'}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-0.5">
              <span className="text-slate-500 dark:text-slate-400 font-bold">Taşıyıcı VKN/TCKN:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {waybillData.carrierTaxNo || '3890123456'}
              </span>
            </div>
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-0.5">
              <span className="text-slate-500 dark:text-slate-400 font-bold">Araç / Çekici Plakası:</span>
              <span className="font-black text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-1 rounded">
                {waybillData.vehiclePlate || '34 YK 8842'}
              </span>
            </div>
            {waybillData.trailerPlate && (
              <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-0.5">
                <span className="text-slate-500 dark:text-slate-400 font-bold">Dorse Plakası:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{waybillData.trailerPlate}</span>
              </div>
            )}
            <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-0.5">
              <span className="text-slate-500 dark:text-slate-400 font-bold">Sürücü Adı Soyadı:</span>
              <span className="font-black text-slate-800 dark:text-slate-200">
                {waybillData.driverName || 'Ahmet Yılmaz'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-bold">Sürücü TCKN:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {waybillData.driverTc || '28934102948'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Resmi Mal / Hizmet Sevk Tablosu (VUK 509 Mevzuatına Uygun Sütunlar) */}
      <div className="border border-slate-300 rounded overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-black text-[9px] uppercase tracking-wider border-b border-slate-300">
              <th className="p-2 w-8 text-center border-r border-slate-300">S.No</th>
              <th className="p-2 w-28 border-r border-slate-300">Mal/Hizmet Kodu</th>
              <th className="p-2 border-r border-slate-300">Mal/Hizmet Açıklaması</th>
              <th className="p-2 w-20 border-r border-slate-300">Varyant</th>
              <th className="p-2 w-16 text-center border-r border-slate-300">Miktar</th>
              <th className="p-2 w-14 text-center border-r border-slate-300">Birim</th>
              <th className="p-2 w-20 text-right border-r border-slate-300">Birim Fiyat</th>
              <th className="p-2 w-12 text-center border-r border-slate-300">KDV</th>
              <th className="p-2 w-24 text-right">Tutar (₺)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-[9px] font-mono">
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-slate-400 italic">
                  İrsaliyeye ait sevk kalemi bulunmamaktadır.
                </td>
              </tr>
            ) : (
              items.map((item: any, idx: number) => {
                const qty = Number(item.quantity) || 0;
                const price = Number(item.unitPrice) || 0;
                const lineTotal = Number(item.total) || (qty * price);

                return (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors">
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold">
                      {idx + 1}
                    </td>
                    <td className="p-2 font-bold border-r border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 uppercase">
                      {item.productCode || 'STK'}
                    </td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700">
                      <div className="font-bold text-slate-900 dark:text-slate-100 uppercase">{item.productName}</div>
                      <div className="text-[8px] text-slate-500 dark:text-slate-400">Orijinal İmalat Sevk Kalemi</div>
                    </td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                      {item.color && <span className="font-bold block uppercase">{item.color}</span>}
                      {item.size && <span className="text-slate-500 dark:text-slate-400">Beden: {item.size}</span>}
                      {!item.color && !item.size && <span className="text-slate-400">-</span>}
                    </td>
                    <td className="p-2 text-center font-black border-r border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-[10px]">
                      {qty.toLocaleString('tr-TR')}
                    </td>
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 uppercase font-semibold">
                      {item.unit || 'Çift'}
                    </td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700 font-medium">
                      {price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </td>
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-700 text-slate-600 font-semibold">
                      %{item.taxRate ?? 20}
                    </td>
                    <td className="p-2 text-right font-black text-slate-900 dark:text-slate-100">
                      {lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. Alt Bölüm: Sol tarafta Karekod & Yasal Bilgi, Sağ tarafta Toplamlar */}
      <div className="grid grid-cols-12 gap-3 pt-1">
        {/* Sol 7 Kolon: Karekod & e-İrsaliye Doğrulama İbaresi */}
        <div className="col-span-7 space-y-2">
          <div className="border border-slate-300 rounded p-2.5 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-3">
            <div className="w-16 h-16 bg-white dark:bg-slate-900 border border-slate-300 p-1 rounded flex items-center justify-center shrink-0">
              <QrCode className="w-14 h-14 text-slate-800 dark:text-slate-200" />
            </div>
            <div className="text-[8px] text-slate-600 space-y-0.5 leading-tight">
              <p className="font-black text-slate-800 dark:text-slate-200 text-[9px] uppercase">
                GİB e-İRSALİYE KAREKOD DOĞRULAMA
              </p>
              <p>
                Bu sevk irsaliyesi Gelir İdaresi Başkanlığı e-Belge portalı ve VUK 509 Sıra No.lu Genel Tebliği uyarınca elektronik ortamda tanzim edilmiştir.
              </p>
              <p className="font-mono text-slate-500 dark:text-slate-400 font-bold">
                Karekod okutularak GİB sistemi üzerinden belge orijinalliği teyit edilebilir.
              </p>
            </div>
          </div>

          {/* Notlar */}
          <div className="border border-slate-200 dark:border-slate-700 rounded p-2 bg-white dark:bg-slate-900 text-[8px] text-slate-600">
            <span className="font-bold text-slate-700 dark:text-slate-200 uppercase block mb-0.5">Sevk & Lojistik Notları:</span>
            <p className="italic">
              {waybillData.notes || 'Malzemeler ambalajlı ve hasarsız olarak sevk edilmiştir. İrsaliyesiz mal kabul edilmez.'}
            </p>
          </div>
        </div>

        {/* Sağ 5 Kolon: Resmi Toplamlar */}
        <div className="col-span-5 border border-slate-300 rounded p-2.5 bg-slate-50 dark:bg-slate-800/50 space-y-1.5 text-[9px] font-mono">
          <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1">
            <span className="text-slate-600 font-bold uppercase">Toplam Sevk Miktarı:</span>
            <span className="font-black text-slate-900 dark:text-slate-100 text-xs">{totalQuantity} Çift / Adet</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Matrah (KDV Hariç):</span>
            <span className="font-bold">{(waybillData.subtotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
          </div>
          {waybillData.discountTotal > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>Toplam İskonto:</span>
              <span className="font-bold">-{(waybillData.discountTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </div>
          )}
          <div className="flex justify-between text-slate-600 border-b border-slate-200 dark:border-slate-700 pb-1">
            <span>Hesaplanan KDV (%20):</span>
            <span className="font-bold">{(waybillData.taxTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
          </div>
          <div className="flex justify-between text-xs font-black text-slate-900 dark:text-slate-100 pt-0.5">
            <span className="uppercase">Genel Tutar:</span>
            <span className="text-rose-700 font-mono font-black">
              {totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
            </span>
          </div>

          {/* Türkçe Yazıyla Tutar */}
          <div className="bg-slate-200/80 p-1 rounded text-[8px] font-black text-slate-800 dark:text-slate-200 text-center uppercase tracking-tight">
            {numberToTurkishWords(totalAmount)}
          </div>
        </div>
      </div>

      {/* 6. VUK 509 Uyarınca 3'lü Teslim-Tesellüm Resmi İmza Blokları */}
      <div className="pt-2 border-t-2 border-slate-900">
        <p className="text-[8px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-2 text-center">
          VUK 509 UYARINCA RESMİ SEVKİYAT VE TESLİM-TESELLÜM ONAY ALANLARI
        </p>
        <div className="grid grid-cols-3 gap-3">
          {/* Düzenleyen */}
          <div className="border border-slate-300 rounded p-2.5 bg-slate-50 dark:bg-slate-800/50 text-center space-y-1">
            <span className="text-[9px] font-black text-slate-800 dark:text-slate-200 uppercase block border-b border-slate-200 dark:border-slate-700 pb-0.5">
              1. DÜZENLEYEN / DEPO SORUMLUSU
            </span>
            <p className="text-[8px] text-slate-500 dark:text-slate-400 font-semibold">DMR Nexus Fabrika Depo Şefliği</p>
            <div className="h-12 flex items-center justify-center text-slate-300 italic text-[9px]">
              (Kaşe & Yetkili İmza)
            </div>
            <p className="text-[8px] font-mono text-slate-400">Tarih: {waybillDateStr}</p>
          </div>

          {/* Taşıyıcı / Şoför */}
          <div className="border border-slate-300 rounded p-2.5 bg-slate-50 dark:bg-slate-800/50 text-center space-y-1">
            <span className="text-[9px] font-black text-indigo-900 uppercase block border-b border-slate-200 dark:border-slate-700 pb-0.5">
              2. TAŞIYICI / ŞOFÖR
            </span>
            <p className="text-[8px] text-slate-700 dark:text-slate-200 font-bold">
              {waybillData.driverName || 'Ahmet Yılmaz'} ({waybillData.vehiclePlate || '34 YK 8842'})
            </p>
            <div className="h-12 flex items-center justify-center text-slate-300 italic text-[9px]">
              (Malı Eksiksiz Teslim Aldım - İmza)
            </div>
            <p className="text-[8px] font-mono text-slate-400">Sevk: {dispatchDateStr} {dispatchTimeStr}</p>
          </div>

          {/* Teslim Alan / Müşteri */}
          <div className="border border-slate-300 rounded p-2.5 bg-slate-50 dark:bg-slate-800/50 text-center space-y-1">
            <span className="text-[9px] font-black text-emerald-900 uppercase block border-b border-slate-200 dark:border-slate-700 pb-0.5">
              3. TESLİM ALAN / ALICI
            </span>
            <p className="text-[8px] text-slate-500 dark:text-slate-400 font-semibold truncate">
              {contact?.name || 'Müşteri Yetkilisi'}
            </p>
            <div className="h-12 flex items-center justify-center text-slate-300 italic text-[9px]">
              (Malı Eksiksiz & Hasarsız Aldım - İmza)
            </div>
            <p className="text-[8px] font-mono text-slate-400">Teslim Tarih / Saat: ...... / ......</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================================
// 2. GİB KURUMSAL LACİVERT e-İRSALİYE ŞABLONU (Yönetici & Prestij Standardı)
// =========================================================================================
export function GibCorporateWaybillTemplate({ waybillData, companySettings }: { waybillData: any; companySettings?: any }) {
  const isSales = waybillData.type === 'sales';
  const contact = waybillData.contact;
  const items = waybillData.items || [];
  
  const waybillDateStr = waybillData.date ? new Date(waybillData.date).toLocaleDateString('tr-TR') : '-';
  const dispatchDateStr = waybillData.dispatchDate ? new Date(waybillData.dispatchDate).toLocaleDateString('tr-TR') : waybillDateStr;
  const dispatchTimeStr = waybillData.dispatchTime || '10:00';
  const totalQuantity = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0);
  const totalAmount = waybillData.grandTotal || 0;

  const compName = companySettings?.companyName || 'DMR Nexus';
  const compTitle = companySettings?.companyTitle || companySettings?.companyName || 'DMR Nexus';
  const compLogo = companySettings?.logo;
  const compAddress = companySettings?.address || 'İkitelli OSB Aykosan San. Sit. No:12 Başakşehir / İST';
  const compTaxOffice = companySettings?.taxOffice || 'İkitelli VD';
  const compTaxNumber = companySettings?.taxNumber || '7320489123';

  return (
    <div className="space-y-4 font-sans">
      {/* Lacivert Başlık Şeridi */}
      <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          {compLogo ? (
            <div className="w-10 h-10 bg-white dark:bg-slate-900 rounded-lg p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
              <img src={compLogo} alt={compName} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-10 h-10 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-black text-xl italic shrink-0">
              {compName.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-base font-black tracking-tight uppercase leading-none">
              {compTitle}
            </h1>
            <p className="text-[10px] text-indigo-200 mt-1">
              Kurumsal Sevkiyat & Lojistik İrsaliyesi • VUK 509 Mevzuatı
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="bg-indigo-600 text-white font-black text-xs px-3 py-1 rounded-full uppercase tracking-wider">
            e-İRSALİYE
          </span>
          <p className="text-xs font-mono font-bold mt-1 text-indigo-300">
            {waybillData.waybillNumber}
          </p>
        </div>
      </div>

      {/* Detay Kartları */}
      <div className="grid grid-cols-3 gap-3 text-[10px]">
        {/* Gönderen */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3 rounded-xl space-y-1">
          <span className="font-bold text-slate-400 text-[9px] uppercase tracking-wider block">Sevkiyat Çıkış (Gönderen)</span>
          <p className="font-black text-slate-800 dark:text-slate-200 uppercase">{compName} Merkez Depo</p>
          <p className="text-slate-500 dark:text-slate-400 text-[9px]">{compAddress}</p>
          <p className="font-mono text-[9px] font-bold text-slate-600">VKN: {compTaxNumber} • {compTaxOffice}</p>
        </div>

        {/* Alıcı */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3 rounded-xl space-y-1">
          <span className="font-bold text-slate-400 text-[9px] uppercase tracking-wider block">Varış Deposu (Alıcı)</span>
          <p className="font-black text-slate-900 dark:text-slate-100 uppercase truncate">{contact?.companyTitle || contact?.name}</p>
          <p className="text-slate-600 text-[9px] leading-tight">
            {waybillData.deliveryAddress || contact?.shippingAddress || contact?.address || 'Merkez Depo'}
          </p>
          <p className="font-mono text-[9px] font-bold text-slate-600">VKN/TCKN: {contact?.taxNumber || contact?.tcKimlik || '-'}</p>
        </div>

        {/* Nakliye / Sevk */}
        <div className="bg-indigo-50/50 border border-indigo-100 p-3 rounded-xl space-y-1 font-mono">
          <span className="font-bold text-indigo-600 text-[9px] uppercase tracking-wider block">Sevkiyat & Taşıma</span>
          <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Sevk Tarihi:</span> <span className="font-bold">{dispatchDateStr} {dispatchTimeStr}</span></div>
          <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Plaka:</span> <span className="font-black text-indigo-900">{waybillData.vehiclePlate || '34 YK 8842'}</span></div>
          <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Şoför:</span> <span className="font-bold text-slate-800 dark:text-slate-200">{waybillData.driverName || 'Ahmet Yılmaz'}</span></div>
        </div>
      </div>

      {/* Tablo */}
      <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-2xs">
        <table className="w-full text-left border-collapse text-[10px]">
          <thead className="bg-slate-900 text-white font-bold uppercase text-[9px]">
            <tr>
              <th className="p-2.5 text-center w-8">#</th>
              <th className="p-2.5 w-32">Stok / Kod</th>
              <th className="p-2.5">Ürün & Model Açıklaması</th>
              <th className="p-2.5 w-24">Varyant</th>
              <th className="p-2.5 text-center w-20">Miktar</th>
              <th className="p-2.5 text-right w-24">Birim Fiyat</th>
              <th className="p-2.5 text-right w-28">Net Tutar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-[9px]">
            {items.map((it: any, i: number) => (
              <tr key={i} className="hover:bg-slate-50 dark:bg-slate-800/50">
                <td className="p-2 text-center text-slate-400 font-bold">{i + 1}</td>
                <td className="p-2 font-bold text-indigo-900 uppercase">{it.productCode}</td>
                <td className="p-2 font-semibold text-slate-800 dark:text-slate-200 uppercase">{it.productName}</td>
                <td className="p-2 text-slate-600">{it.color ? `${it.color} ${it.size || ''}` : '-'}</td>
                <td className="p-2 text-center font-black text-slate-900 dark:text-slate-100 text-[10px]">{it.quantity} {it.unit || 'Çift'}</td>
                <td className="p-2 text-right text-slate-600">{Number(it.unitPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                <td className="p-2 text-right font-black text-slate-900 dark:text-slate-100">{Number(it.total).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alt Özet ve 3'lü İmza */}
      <div className="flex justify-between items-end gap-4 pt-2">
        <div className="text-[9px] text-slate-500 dark:text-slate-400 max-w-sm space-y-1">
          <p className="font-bold text-slate-700 dark:text-slate-200">ETTN: {waybillData.ettn || '4f1b8a92-7d34-4b5a-901c-6e82a938c105'}</p>
          <p>Yazıyla: {numberToTurkishWords(totalAmount)}</p>
        </div>
        <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-right min-w-[200px]">
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">Toplam Sevk Miktarı: <span className="text-slate-900 dark:text-slate-100 font-black">{totalQuantity} Çift</span></div>
          <div className="text-base font-black text-slate-900 dark:text-slate-100 font-mono mt-1">
            {totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-center text-[9px]">
        <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <span className="font-bold text-slate-700 dark:text-slate-200 block">Depo Sorumlusu</span>
          <div className="h-10 flex items-center justify-center text-slate-300 italic text-[8px]">(Kaşe/İmza)</div>
        </div>
        <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <span className="font-bold text-slate-700 dark:text-slate-200 block">Taşıyıcı Şoför</span>
          <div className="h-10 flex items-center justify-center text-slate-300 italic text-[8px]">(Teslim Aldım)</div>
        </div>
        <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <span className="font-bold text-slate-700 dark:text-slate-200 block">Teslim Alan Müşteri</span>
          <div className="h-10 flex items-center justify-center text-slate-300 italic text-[8px]">(Hasarsız Teslim Aldım)</div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================================
// 3. GİB DEPO & SEVKİYAT ÇETELİSİ (Barkodlu Çeki Listesi Standardı)
// =========================================================================================
export function GibDispatchChecklistTemplate({ waybillData, companySettings }: { waybillData: any; companySettings?: any }) {
  const contact = waybillData.contact;
  const items = waybillData.items || [];
  const waybillDateStr = waybillData.date ? new Date(waybillData.date).toLocaleDateString('tr-TR') : '-';
  const totalQuantity = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0);
  const compName = companySettings?.companyName || 'DMR Nexus';

  return (
    <div className="space-y-4 font-mono text-[10px]">
      <div className="border-2 border-slate-800 p-3 rounded-lg flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
        <div>
          <h2 className="text-sm font-black uppercase">{compName.toUpperCase()} SEVKİYAT VE YÜKLEME ÇEKİ LİSTESİ</h2>
          <p className="text-[9px] text-slate-600">Bağlı İrsaliye No: {waybillData.waybillNumber} • Sipariş No: {waybillData.orderNumber || '-'}</p>
        </div>
        <div className="text-right">
          <span className="bg-slate-900 text-white font-bold px-2 py-1 rounded text-[9px]">DEPO KONTROL FORMU</span>
          <p className="text-[9px] font-bold mt-1 text-slate-700 dark:text-slate-200">Tarih: {waybillDateStr}</p>
        </div>
      </div>

      <div className="border border-slate-300 p-2.5 rounded bg-white dark:bg-slate-900 grid grid-cols-2 gap-2 text-[9px]">
        <div>
          <span className="text-slate-500 dark:text-slate-400 font-bold block">ALICI FİRMA & TESLİMAT:</span>
          <span className="font-black text-slate-900 dark:text-slate-100 uppercase">{contact?.name}</span>
          <p className="text-slate-600">{waybillData.deliveryAddress || contact?.shippingAddress || contact?.address}</p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400 font-bold block">ARAÇ & ŞOFÖR BİLGİSİ:</span>
          <span className="font-black text-slate-900 dark:text-slate-100">Plaka: {waybillData.vehiclePlate || '34 YK 8842'}</span>
          <p className="text-slate-600">Sürücü: {waybillData.driverName || 'Ahmet Yılmaz'}</p>
        </div>
      </div>

      <div className="border border-slate-800 rounded overflow-hidden">
        <table className="w-full text-left border-collapse text-[9px]">
          <thead className="bg-slate-800 text-white font-bold">
            <tr>
              <th className="p-2 w-8 text-center border-r border-slate-700">✓</th>
              <th className="p-2 w-28 border-r border-slate-700">Ürün Kodu</th>
              <th className="p-2 border-r border-slate-700">Açıklama / Model</th>
              <th className="p-2 w-20 border-r border-slate-700">Renk/Beden</th>
              <th className="p-2 w-20 text-center border-r border-slate-700">Sevk Miktarı</th>
              <th className="p-2 w-24 text-center border-r border-slate-700">Koli / Paket No</th>
              <th className="p-2 w-20 text-center">Kontrol Eden</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300">
            {items.map((it: any, i: number) => (
              <tr key={i} className="hover:bg-slate-50 dark:bg-slate-800/50">
                <td className="p-2 text-center border-r border-slate-300">
                  <div className="w-4 h-4 border-2 border-slate-600 rounded mx-auto" />
                </td>
                <td className="p-2 font-bold border-r border-slate-300 uppercase">{it.productCode}</td>
                <td className="p-2 font-semibold border-r border-slate-300 uppercase">{it.productName}</td>
                <td className="p-2 border-r border-slate-300">{it.color || '-'} {it.size ? `/ ${it.size}` : ''}</td>
                <td className="p-2 text-center font-black text-[10px] border-r border-slate-300">{it.quantity} {it.unit || 'Çift'}</td>
                <td className="p-2 text-center border-r border-slate-300 text-slate-400">Koli-0{i+1}</td>
                <td className="p-2 text-center text-slate-400">[ OK ]</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-800 p-2.5 rounded border border-slate-300">
        <span className="font-bold text-slate-700 dark:text-slate-200">TOPLAM KOLİ/ADET SEVK:</span>
        <span className="text-sm font-black text-slate-900 dark:text-slate-100">{totalQuantity} Çift / {items.length} Kalem</span>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-300 text-center">
        <div className="border border-slate-300 p-3 rounded">
          <span className="font-bold block text-slate-700 dark:text-slate-200">Yükleyen / Depo Görevlisi</span>
          <div className="h-8 flex items-center justify-center text-slate-300 italic">(İmza)</div>
        </div>
        <div className="border border-slate-300 p-3 rounded">
          <span className="font-bold block text-slate-700 dark:text-slate-200">Şoför / Teslim Alan</span>
          <div className="h-8 flex items-center justify-center text-slate-300 italic">(İmza)</div>
        </div>
      </div>
    </div>
  );
}
