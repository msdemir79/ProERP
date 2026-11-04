import { QrCode } from 'lucide-react';

// =========================================================================================
// ŞABLON 3: GİB İRSALİYELİ RESMİ e-ARŞİV FATURA (SEVK VE LOJİSTİK STANDARDI)
// =========================================================================================
export function CompactDeliveryTemplate({
  invoice,
  taxBreakdown,
  formattedDate,
  formattedTime,
  dueDateFormatted,
  amountInWords,
  companySettings
}: any) {
  const isSales = invoice.type === 'sales';
  const isCancelled = invoice.status === 'cancelled';
  const invoiceTitle = isCancelled 
    ? 'İPTAL EDİLMİŞ FATURA' 
    : (isSales ? 'İRSALİYELİ e-ARŞİV FATURA' : 'İRSALİYELİ ALIŞ FATURASI');

  const compName = companySettings?.companyName || 'DMR Nexus';
  const compTitle = companySettings?.companyTitle || companySettings?.companyName || 'DMR Nexus';
  const compLogo = companySettings?.logo;
  const compAddress = companySettings?.address || 'Organize Sanayi Bölgesi 12. Cadde No: 45 / Başakşehir / İSTANBUL';
  const compTaxOffice = companySettings?.taxOffice || 'İkitelli V.D.';
  const compTaxNumber = companySettings?.taxNumber || '7340592811';
  const compTradeReg = companySettings?.tradeRegistryNo || '948123-5';
  const compPhone = companySettings?.phone || '(0212) 555 01 99';
  const compEmail = companySettings?.email || '';
  const compWebsite = companySettings?.website || '';
  const compBank = companySettings?.bankName || 'T.C. Ziraat Bankası - İkitelli Şubesi';
  const compIban = companySettings?.iban || 'TR33 0001 0002 0003 0004 0005 01';

  return (
    <div className="space-y-3.5 font-sans text-xs text-slate-900 dark:text-slate-100">
      
      {/* 1. Resmi İrsaliye Yerine Geçer Yasal İhtar Şeridi */}
      <div className="bg-emerald-800 text-white p-2 rounded text-[10px] text-center font-bold tracking-wide border border-emerald-900 space-y-0.5">
        <div className="uppercase tracking-widest text-[11px] font-black flex items-center justify-center gap-2">
          <span>★</span>
          <span>509 SIRA NO.LU VUK GENEL TEBLİĞİ UYARINCA İRSALİYE YERİNE GEÇER</span>
          <span>★</span>
        </div>
        <div className="text-[9px] text-emerald-100 font-normal">
          Malın teslimi ve sevki anında düzenlenmiştir. Belge üzerinde düzenleme ve fiili sevk zamanı yer aldığından ayrıca sevk irsaliyesi aranmaz.
        </div>
      </div>

      {/* 2. Üst Başlık Şeridi: Sol Firma & Orta İrsaliyeli Rozet & Sağ Belge & Sevk Zamanı */}
      <div className="grid grid-cols-12 gap-3 pb-3 border-b-2 border-emerald-950 items-center">
        
        {/* Sol Sütun: Firma Bilgileri */}
        <div className="col-span-4 flex items-center gap-3">
          {compLogo ? (
            <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center p-0.5 border border-emerald-300 shrink-0 overflow-hidden shadow-xs">
              <img src={compLogo} alt={compName} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-12 h-12 bg-emerald-950 rounded-lg flex items-center justify-center text-white font-black text-2xl tracking-tighter italic border border-emerald-900 shrink-0 shadow-xs">
              {compName.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-black text-sm tracking-tight text-emerald-950 leading-tight uppercase truncate">
              {compName}
            </div>
            <div className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider line-clamp-1">
              {compTitle}
            </div>
            <div className="text-[9px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">
              VKN: {compTaxNumber} | {compTaxOffice}
            </div>
          </div>
        </div>

        {/* Orta Sütun: GİB İrsaliyeli e-Arşiv Resmi Rozeti */}
        <div className="col-span-4 text-center flex flex-col items-center justify-center">
          <div className="flex items-center gap-1.5 px-3.5 py-1 bg-emerald-50 border border-emerald-300 rounded-md mb-1 shadow-2xs">
            <div className="w-4 h-4 bg-red-600 rounded-full flex items-center justify-center text-white font-bold text-[9px]">
              ★
            </div>
            <span className="font-black text-emerald-950 tracking-wider text-xs uppercase">
              {invoiceTitle}
            </span>
          </div>
          <div className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
            T.C. Gelir İdaresi Başkanlığı e-Belge Sistemi
          </div>
          <div className="text-[8px] text-emerald-800 font-bold">
            Resmi Sevk & Satış Belgesi
          </div>
        </div>

        {/* Sağ Sütun: Fatura ve Fiili Sevk Tarihleri Kutusu */}
        <div className="col-span-4 text-right">
          <div className="inline-block bg-emerald-50/40 border border-emerald-300 rounded p-2 text-[10px] space-y-1 w-full text-left font-mono">
            <div className="flex justify-between border-b border-emerald-200 pb-0.5">
              <span className="text-slate-500 dark:text-slate-400 font-sans font-bold">Fatura No:</span>
              <span className="font-black text-emerald-950">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-sans">Düzenleme Tarihi/Saati:</span>
              <span className="font-bold">{formattedDate} {formattedTime}</span>
            </div>
            <div className="flex justify-between text-emerald-900 font-bold border-t border-emerald-200 pt-0.5">
              <span className="font-sans">Fiili Sevk Tarihi/Saati:</span>
              <span>{formattedDate} {formattedTime}</span>
            </div>
            {dueDateFormatted && (
              <div className="flex justify-between text-slate-700 dark:text-slate-200">
                <span className="font-sans">Vade Tarihi:</span>
                <span>{dueDateFormatted}</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 3. ETTN (UUID) ve Lojistik Sevk / Taşıma Şeridi */}
      <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 rounded p-2 text-[10px] flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-slate-600 uppercase">ETTN:</span>
          <span className="font-mono font-bold text-slate-800 dark:text-slate-200 break-all">{invoice.ettn || '00000000-0000-0000-0000-000000000000'}</span>
        </div>
        <div className="flex items-center gap-4 text-slate-700 dark:text-slate-200">
          <div>
            <span className="text-slate-500 dark:text-slate-400">Taşıma Türü: </span>
            <span className="font-bold uppercase">Karayolu (Özmal / Ambar)</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Senaryo: </span>
            <span className="font-black uppercase">{invoice.scenario === 'commercial' ? 'TİCARİ FATURA' : 'TEMEL FATURA'}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">Para Birimi: </span>
            <span className="font-black font-mono">{invoice.currency || 'TRY'}</span>
          </div>
        </div>
      </div>

      {/* 4. Satıcı Bilgileri & Alıcı / Teslimat (Sevk) Adresi Kutusu */}
      <div className="grid grid-cols-2 gap-3">
        
        {/* SATICI KUTUSU */}
        <div className="border border-slate-300 rounded p-2.5 bg-white dark:bg-slate-900 space-y-1 text-[11px] leading-tight">
          <div className="bg-slate-900 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider inline-block mb-1">
            SATICI BİLGİLERİ
          </div>
          <div className="font-black text-slate-900 dark:text-slate-100 text-xs uppercase">
            {compTitle}
          </div>
          <div className="text-slate-600">
            {compAddress}
          </div>
          <div className="pt-1 text-slate-700 dark:text-slate-200 font-mono text-[10px] space-y-0.5">
            <div><span className="font-sans font-bold text-slate-600">Vergi Dairesi:</span> {compTaxOffice} | <span className="font-sans font-bold text-slate-600">VKN:</span> {compTaxNumber}</div>
            <div><span className="font-sans font-bold text-slate-600">Tic. Sicil:</span> {compTradeReg}</div>
            <div><span className="font-sans font-bold text-slate-600">Tel:</span> {compPhone} | <span className="font-sans font-bold text-slate-600">E-Posta:</span> {compEmail}</div>
          </div>
        </div>

        {/* ALICI VE SEVK / TESLİMAT KUTUSU */}
        <div className="border border-slate-300 rounded p-2.5 bg-white dark:bg-slate-900 space-y-1 text-[11px] leading-tight">
          <div className="bg-emerald-900 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider inline-block mb-1">
            ALICI VE TESLİMAT / SEVK ADRESİ
          </div>
          <div className="font-black text-slate-900 dark:text-slate-100 text-xs">
            {invoice.contact?.companyTitle || invoice.contact?.name || 'MÜŞTERİ BİLGİSİ GİRİLMEMİŞ'}
          </div>
          <div className="text-slate-600">
            <span className="font-bold text-slate-700 dark:text-slate-200">Sevk Adresi: </span>
            {invoice.contact?.address || 'Belirtilmemiştir.'}
            {invoice.contact?.district ? ` ${invoice.contact.district} /` : ''}
            {invoice.contact?.city ? ` ${invoice.contact.city}` : ''}
          </div>
          <div className="pt-1 text-slate-700 dark:text-slate-200 font-mono text-[10px] space-y-0.5">
            <div>
              <span className="font-sans font-bold text-slate-600">Vergi Dairesi:</span> {invoice.contact?.taxOffice ? `${invoice.contact.taxOffice} V.D.` : '-'} | 
              <span className="font-sans font-bold text-slate-600 ml-1">VKN/TCKN:</span> {invoice.contact?.taxNumber || invoice.contact?.tcKimlik || '11111111111'}
            </div>
            <div>
              <span className="font-sans font-bold text-slate-600">Cari Kodu:</span> {invoice.contact?.code || '-'} | 
              <span className="font-sans font-bold text-slate-600 ml-1">İletişim:</span> {invoice.contact?.phone || invoice.contact?.email || '-'}
            </div>
          </div>
        </div>

      </div>

      {/* 5. Bağlı Sipariş & Sevk Notu */}
      <div className="border border-slate-300 rounded p-2 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-[10px] font-mono">
        <div className="flex items-center gap-4">
          <div>
            <span className="font-sans font-bold text-slate-600">Bağlı Sipariş No: </span>
            <span className="font-bold text-emerald-800">{invoice.orderNumber || (invoice.orderId ? `SIP-${invoice.orderId}` : '-')}</span>
          </div>
          {invoice.waybillNumber && (
            <div>
              <span className="font-sans font-bold text-slate-600">İrsaliye No: </span>
              <span className="font-bold text-purple-800">{invoice.waybillNumber}</span>
            </div>
          )}
          <div>
            <span className="font-sans font-bold text-slate-600">Sipariş Tarihi: </span>
            <span>{invoice.order?.date ? new Date(invoice.order.date).toLocaleDateString('tr-TR') : formattedDate}</span>
          </div>
        </div>
        <div className="text-slate-600 font-sans italic">
          {invoice.waybillNumber 
            ? `* İrsaliye (${invoice.waybillNumber}) istinaden faturalandırılmıştır.` 
            : '* İrsaliyeli faturadaki mallar hasarsız ve tam teslim alınmıştır.'}
        </div>
      </div>

      {/* 6. Mal / Hizmet Satırları Tablosu (Tam 10 Sütunlu VUK Standardı) */}
      <div className="border border-slate-300 rounded overflow-hidden">
        <table className="w-full text-left border-collapse text-[10px]">
          <thead className="bg-slate-800 text-white font-bold uppercase tracking-wider text-[9px]">
            <tr>
              <th className="p-2 text-center border-r border-slate-700 w-8">S.No</th>
              <th className="p-2 border-r border-slate-700">Mal / Hizmet Açıklaması (Sevk Edilen)</th>
              <th className="p-2 text-right border-r border-slate-700 w-16">Miktar</th>
              <th className="p-2 text-center border-r border-slate-700 w-12">Birim</th>
              <th className="p-2 text-right border-r border-slate-700 w-20">Birim Fiyat</th>
              <th className="p-2 text-right border-r border-slate-700 w-14">İskonto</th>
              <th className="p-2 text-right border-r border-slate-700 w-20">Mal/Hizmet Tutarı</th>
              <th className="p-2 text-center border-r border-slate-700 w-12">KDV %</th>
              <th className="p-2 text-right border-r border-slate-700 w-18">KDV Tutarı</th>
              <th className="p-2 text-right w-24">Satır Toplamı</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-mono">
            {invoice.items && invoice.items.length > 0 ? (
              invoice.items.map((item: any, idx: number) => {
                const lineDiscount = Number(item.discountAmount) || 0;
                const lineMatrah = (Number(item.quantity) * Number(item.unitPrice)) - lineDiscount;
                const lineTax = Number(item.taxAmount) || (lineMatrah * ((Number(item.taxRate) || 0) / 100));
                const lineTotal = Number(item.total) || (lineMatrah + lineTax);

                return (
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50 dark:bg-slate-800/50'}>
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-mono">{idx + 1}</td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 font-sans">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{item.productName}</div>
                      <div className="text-[9px] text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                        {item.productCode && <span>Kod: {item.productCode}</span>}
                        {item.color && <span>Renk: {item.color}</span>}
                        {item.size && <span>Beden/No: {item.size}</span>}
                      </div>
                    </td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100">{item.quantity}</td>
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-700 text-slate-600 font-sans">{item.unit || 'Çift'}</td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700">
                      ₺{Number(item.unitPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700 text-rose-600">
                      {Number(item.discountRate) > 0 ? `%${item.discountRate}` : '-'}
                    </td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700">
                      ₺{lineMatrah.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-center border-r border-slate-200 dark:border-slate-700 font-bold">%{item.taxRate}</td>
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold">
                      ₺{lineTax.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="p-2 text-right font-bold text-slate-950">
                      ₺{lineTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="p-4 text-center text-slate-400 font-sans">
                  Faturaya ait sevk veya ürün kalemi bulunmamaktadır.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 7. Alt Bölüm: KDV Dağılımı Tablosu + QR + Toplamlar */}
      <div className="grid grid-cols-12 gap-3 pt-1 items-start">
        
        {/* Sol Alan: KDV Tablosu & Banka & Karekod */}
        <div className="col-span-7 space-y-2">
          
          {/* Resmi KDV Dağılım Tablosu */}
          <div className="border border-slate-300 rounded overflow-hidden">
            <div className="bg-slate-800 text-white px-2 py-1 text-[9px] font-bold uppercase tracking-wider flex justify-between">
              <span>KDV Matrah & Vergi Dağılım Tablosu</span>
              <span className="font-mono text-slate-300">VUK-509</span>
            </div>
            <table className="w-full text-[9px] border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-300 font-bold text-slate-800 dark:text-slate-200">
                <tr>
                  <th className="p-1.5 text-center border-r border-slate-300">KDV Oranı</th>
                  <th className="p-1.5 text-right border-r border-slate-300">Vergi Hariç Tutar (Matrah)</th>
                  <th className="p-1.5 text-right border-r border-slate-300">Hesaplanan KDV</th>
                  <th className="p-1.5 text-right">KDV Dahil Toplam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {Object.keys(taxBreakdown).length > 0 ? (
                  Object.entries(taxBreakdown).map(([rate, vals]: [string, any]) => (
                    <tr key={rate}>
                      <td className="p-1.5 text-center font-bold border-r border-slate-200 dark:border-slate-700">%{rate}</td>
                      <td className="p-1.5 text-right border-r border-slate-200 dark:border-slate-700">
                        ₺{Number(vals?.matrah || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 text-right border-r border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-bold">
                        ₺{Number(vals?.tax || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-1.5 text-right font-bold text-slate-900 dark:text-slate-100">
                        ₺{Number(vals?.total || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-1.5 text-center text-slate-400 font-sans">KDV bilgisi yok</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Banka & Sevk Açıklaması */}
          <div className="border border-slate-300 rounded p-2 bg-slate-50 dark:bg-slate-800/50 text-[10px] space-y-1">
            {invoice.notes && (
              <div className="pb-1 border-b border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-700 dark:text-slate-200">Sevk / Teslimat Notu: </span>
                <span className="text-slate-700 dark:text-slate-200">{invoice.notes}</span>
              </div>
            )}
            <div className="text-[9px] text-slate-600">
              <span className="font-bold text-slate-800 dark:text-slate-200">Banka IBAN: </span>
              {compBank} | {compIban} (TRY)
            </div>
          </div>

          {/* Resmi Karekod & VUK Bilgilendirme */}
          <div className="flex items-center gap-3 pt-1">
            <div className="w-14 h-14 border border-slate-300 rounded p-1 flex items-center justify-center bg-white dark:bg-slate-900 shadow-2xs">
              <QrCode className="w-12 h-12 text-slate-900 dark:text-slate-100" />
            </div>
            <div className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">Karekodlu İrsaliyeli e-Arşiv Belge Doğrulama:</span>
              Bu belge 509 Sıra No.lu VUK Tebliği gereğince elektronik ortamda sevk irsaliyesi ve fatura olarak tanzim edilmiştir. 5070 Sayılı Kanun gereği e-imzalıdır.
            </div>
          </div>

        </div>

        {/* Sağ Alan: Resmi Toplamlar Tablosu */}
        <div className="col-span-5 space-y-2">
          
          <div className="border-2 border-slate-900 rounded p-3 bg-white dark:bg-slate-900 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-slate-700 dark:text-slate-200 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
              <span>Mal / Hizmet Toplam Tutarı:</span>
              <span className="font-mono font-bold">
                ₺{Number(invoice.subtotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {Number(invoice.discountTotal) > 0 && (
              <div className="flex justify-between text-rose-600 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
                <span>Toplam İskonto Tutarı:</span>
                <span className="font-mono font-bold">
                  -₺{Number(invoice.discountTotal).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="flex justify-between text-slate-800 dark:text-slate-200 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
              <span className="font-bold">Hesaplanan KDV:</span>
              <span className="font-mono font-bold text-indigo-700">
                ₺{Number(invoice.taxTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            {Number(invoice.withholdingAmount) > 0 && (
              <div className="flex justify-between text-purple-700 font-sans pb-1 border-b border-slate-200 dark:border-slate-700">
                <span>Tevkifat Tutarı ({invoice.withholdingRate || 5}/10):</span>
                <span className="font-mono font-bold">
                  -₺{Number(invoice.withholdingAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-baseline font-sans">
              <span className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase">ÖDENECEK TOPLAM:</span>
              <span className="text-lg font-black font-mono text-slate-950">
                ₺{Number(invoice.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* YAZIYLA TUTAR KUTUSU */}
          <div className="border border-slate-300 rounded p-2 bg-slate-100 dark:bg-slate-800 text-[9px] text-center font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
            YALNIZ: {amountInWords}
          </div>

        </div>

      </div>

      {/* 8. Üçlü Resmi Lojistik / Sevk İmzaları (GİB İrsaliyeli Fatura Standardı) */}
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-300 text-center text-[10px]">
        <div className="space-y-1">
          <div className="font-bold text-slate-800 dark:text-slate-200 uppercase">1. Düzenleyen / Muhasebe</div>
          <div className="h-12 flex flex-col items-center justify-center font-serif italic text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded p-1 bg-slate-50 dark:bg-slate-800/50">
            <span className="font-sans font-bold text-[9px] text-slate-800 dark:text-slate-200">DMR Nexus Muhasebe</span>
            <span className="text-[8px] text-slate-400">e-İmza ile Onaylıdır</span>
          </div>
          <div className="text-[8px] text-slate-400">İmza / Kaşe</div>
        </div>

        <div className="space-y-1">
          <div className="font-bold text-slate-800 dark:text-slate-200 uppercase">2. Taşıyıcı / Şoför (Teslim Eden)</div>
          <div className="h-12 flex flex-col items-center justify-center font-serif italic text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded p-1 bg-slate-50 dark:bg-slate-800/50">
            <span className="font-sans font-bold text-[9px] text-slate-700 dark:text-slate-200">Firma Sevkiyat Sorumlusu</span>
            <span className="text-[8px] text-slate-400">Araç Plaka / Ehliyet No</span>
          </div>
          <div className="text-[8px] text-slate-400">Ad Soyad / İmza</div>
        </div>

        <div className="space-y-1">
          <div className="font-bold text-slate-800 dark:text-slate-200 uppercase">3. Teslim Alan / Müşteri</div>
          <div className="h-12 flex flex-col items-center justify-center font-serif italic text-slate-600 border border-dashed border-slate-200 dark:border-slate-700 rounded p-1 bg-slate-50 dark:bg-slate-800/50">
            <span className="font-sans font-bold text-[9px] text-slate-800 dark:text-slate-200 truncate max-w-[140px]">{invoice.contact?.name || 'Teslim Alan'}</span>
            <span className="text-[8px] text-slate-400">Malları Hasarsız Teslim Aldım</span>
          </div>
          <div className="text-[8px] text-slate-400">Kaşe / İmza / Tarih</div>
        </div>
      </div>

    </div>
  );
}
