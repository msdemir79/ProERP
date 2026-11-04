import { QrCode } from 'lucide-react';

// =========================================================================================
// ŞABLON 2: GİB KURUMSAL LACİVERT e-FATURA / e-ARŞİV (YÖNETİCİ STANDARDI)
// =========================================================================================
export function CorporateModernTemplate({
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
    : (isSales ? 'e-ARŞİV FATURA' : 'ALIŞ FATURASI');

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
    <div className="space-y-4 font-sans text-xs text-slate-900 dark:text-slate-100">
      
      {/* 1. Üst Başlık Şeridi: Kurumsal Lacivert Logo & Ortada GİB e-Arşiv Rozeti & Sağda Belge Bilgileri */}
      <div className="grid grid-cols-12 gap-3 pb-3 border-b-2 border-indigo-950 items-center">
        
        {/* Sol Sütun: Firma Logosu ve Resmi Ünvan */}
        <div className="col-span-4 flex items-center gap-3">
          {compLogo ? (
            <div className="w-12 h-12 bg-white dark:bg-slate-900 rounded-lg flex items-center justify-center p-0.5 border border-indigo-200 shrink-0 overflow-hidden shadow-xs">
              <img src={compLogo} alt={compName} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-12 h-12 bg-indigo-950 rounded-lg flex items-center justify-center text-white font-black text-2xl tracking-tighter italic border border-indigo-900 shrink-0 shadow-xs">
              {compName.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-black text-sm tracking-tight text-indigo-950 leading-tight uppercase truncate">
              {compName}
            </div>
            <div className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider line-clamp-1">
              {compTitle}
            </div>
            <div className="text-[9px] text-indigo-700 font-mono mt-0.5 truncate">
              {compWebsite}
            </div>
          </div>
        </div>

        {/* Orta Sütun: GİB Resmi Hilal/Yıldız Rozeti (Kurumsal Lacivert Vurgulu) */}
        <div className="col-span-4 text-center flex flex-col items-center justify-center">
          <div className="flex items-center gap-1.5 px-3.5 py-1 bg-indigo-50 border border-indigo-200 rounded-md mb-1 shadow-2xs">
            <div className="w-4 h-4 bg-red-600 rounded-full flex items-center justify-center text-white font-bold text-[9px]">
              ★
            </div>
            <span className="font-black text-indigo-950 tracking-wider text-xs uppercase">
              {invoiceTitle}
            </span>
          </div>
          <div className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
            GİB 509 Sıra No.lu VUK Genel Tebliği Standardı
          </div>
          <div className="text-[8px] text-slate-400">
            Elektronik Ortamda Tanzim Edilmiş Resmi Belgedir
          </div>
        </div>

        {/* Sağ Sütun: Resmi e-Belge Kimlik Bilgileri Kutusu */}
        <div className="col-span-4 text-right">
          <div className="inline-block bg-indigo-50/40 border border-indigo-200 rounded p-2 text-[10px] space-y-1 w-full text-left font-mono">
            <div className="flex justify-between border-b border-indigo-100 pb-0.5">
              <span className="text-slate-500 dark:text-slate-400 font-sans font-bold">Fatura No:</span>
              <span className="font-black text-indigo-950">{invoice.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-sans">Fatura Tarihi:</span>
              <span className="font-bold">{formattedDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-sans">Düzenleme Saati:</span>
              <span>{formattedTime}</span>
            </div>
            {dueDateFormatted && (
              <div className="flex justify-between text-indigo-800 font-bold border-t border-indigo-100 pt-0.5">
                <span className="font-sans">Vade Tarihi:</span>
                <span>{dueDateFormatted}</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 2. ETTN (Evrensel Tekil Tanımlama No) ve Senaryo Şeridi */}
      <div className="bg-indigo-950 text-white p-2 rounded text-[10px] flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-indigo-300 uppercase tracking-wider">ETTN (UUID):</span>
          <span className="font-mono font-bold text-indigo-100 break-all">{invoice.ettn || '00000000-0000-0000-0000-000000000000'}</span>
        </div>
        <div className="flex items-center gap-4 text-indigo-200">
          <div>
            <span className="text-indigo-400">Senaryo: </span>
            <span className="font-black uppercase text-white">{invoice.scenario === 'commercial' ? 'TİCARİ FATURA' : (invoice.scenario === 'withholding' ? 'TEVKİFAT' : 'TEMEL FATURA')}</span>
          </div>
          <div>
            <span className="text-indigo-400">Fatura Tipi: </span>
            <span className="font-black uppercase text-white">{isSales ? 'SATIŞ' : 'ALIŞ'}</span>
          </div>
          <div>
            <span className="text-indigo-400">Para Birimi: </span>
            <span className="font-black font-mono text-white">{invoice.currency || 'TRY'}</span>
          </div>
        </div>
      </div>

      {/* 3. Satıcı ve Alıcı Bilgileri (Çift Kutu) */}
      <div className="grid grid-cols-2 gap-3">
        
        {/* SATICI KUTUSU */}
        <div className="border border-indigo-200 rounded p-3 bg-white dark:bg-slate-900 space-y-1 text-[11px] leading-tight">
          <div className="bg-indigo-950 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider inline-block mb-1">
            SATICI BİLGİLERİ
          </div>
          <div className="font-black text-slate-900 dark:text-slate-100 text-xs uppercase">
            {compTitle}
          </div>
          <div className="text-slate-600">
            {compAddress}
          </div>
          <div className="pt-1 text-slate-700 dark:text-slate-200 font-mono text-[10px] space-y-0.5">
            <div><span className="font-sans font-bold text-slate-600">Vergi Dairesi:</span> {compTaxOffice}</div>
            <div><span className="font-sans font-bold text-slate-600">VKN:</span> {compTaxNumber} <span className="font-sans font-bold text-slate-600 ml-2">Ticaret Sicil:</span> {compTradeReg}</div>
            <div><span className="font-sans font-bold text-slate-600">Tel:</span> {compPhone} | <span className="font-sans font-bold text-slate-600">E-Posta:</span> {compEmail}</div>
          </div>
        </div>

        {/* ALICI (MÜŞTERİ / CARİ) KUTUSU */}
        <div className="border border-indigo-200 rounded p-3 bg-white dark:bg-slate-900 space-y-1 text-[11px] leading-tight">
          <div className="bg-indigo-800 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider inline-block mb-1">
            SAYIN (ALICI / MÜŞTERİ BİLGİLERİ)
          </div>
          <div className="font-black text-slate-900 dark:text-slate-100 text-xs">
            {invoice.contact?.companyTitle || invoice.contact?.name || 'MÜŞTERİ BİLGİSİ GİRİLMEMİŞ'}
          </div>
          <div className="text-slate-600">
            {invoice.contact?.address || 'Fatura adresi belirtilmemiştir.'}
            {invoice.contact?.district ? ` ${invoice.contact.district} /` : ''}
            {invoice.contact?.city ? ` ${invoice.contact.city}` : ''}
          </div>
          <div className="pt-1 text-slate-700 dark:text-slate-200 font-mono text-[10px] space-y-0.5">
            <div>
              <span className="font-sans font-bold text-slate-600">Vergi Dairesi:</span> {invoice.contact?.taxOffice ? `${invoice.contact.taxOffice} V.D.` : '-'}
            </div>
            <div>
              <span className="font-sans font-bold text-slate-600">VKN / TCKN:</span> {invoice.contact?.taxNumber || invoice.contact?.tcKimlik || '11111111111'}
            </div>
            <div>
              <span className="font-sans font-bold text-slate-600">Cari Kodu:</span> {invoice.contact?.code || '-'} 
              <span className="font-sans font-bold text-slate-600 ml-2">Tel:</span> {invoice.contact?.phone || invoice.contact?.mobile || '-'}
            </div>
            <div>
              <span className="font-sans font-bold text-slate-600">E-Posta:</span> {invoice.contact?.email || '-'}
            </div>
          </div>
        </div>

      </div>

      {/* 4. Bağlı Sipariş & İrsaliye Bilgileri Şeridi */}
      <div className="border border-indigo-200 rounded p-2 bg-indigo-50/30 flex items-center justify-between text-[10px] font-mono">
        <div className="flex items-center gap-4">
          <div>
            <span className="font-sans font-bold text-slate-600">Sipariş No: </span>
            <span className="font-bold text-indigo-900">{invoice.orderNumber || (invoice.orderId ? `SIP-${invoice.orderId}` : '-')}</span>
          </div>
          {invoice.waybillNumber && (
            <div>
              <span className="font-sans font-bold text-slate-600">İrsaliye No: </span>
              <span className="font-bold text-purple-900">{invoice.waybillNumber}</span>
            </div>
          )}
          <div>
            <span className="font-sans font-bold text-slate-600">Sipariş Tarihi: </span>
            <span>{invoice.order?.date ? new Date(invoice.order.date).toLocaleDateString('tr-TR') : formattedDate}</span>
          </div>
        </div>
        <div className="text-indigo-900 font-sans italic font-medium">
          {invoice.waybillNumber 
            ? `* İrsaliye (${invoice.waybillNumber}) istinaden düzenlenmiştir.` 
            : '* Bu belgenin sevk irsaliyesi yerine geçtiği kabul edilmiştir (VUK 509).'}
        </div>
      </div>

      {/* 5. Mal / Hizmet Satırları Tablosu (Tam 10 Sütunlu VUK Standardı) */}
      <div className="border border-indigo-900 rounded overflow-hidden">
        <table className="w-full text-left border-collapse text-[10px]">
          <thead className="bg-indigo-950 text-white font-bold uppercase tracking-wider text-[9px]">
            <tr>
              <th className="p-2 text-center border-r border-indigo-900 w-8">S.No</th>
              <th className="p-2 border-r border-indigo-900">Mal / Hizmet Açıklaması</th>
              <th className="p-2 text-right border-r border-indigo-900 w-16">Miktar</th>
              <th className="p-2 text-center border-r border-indigo-900 w-12">Birim</th>
              <th className="p-2 text-right border-r border-indigo-900 w-20">Birim Fiyat</th>
              <th className="p-2 text-right border-r border-indigo-900 w-14">İskonto</th>
              <th className="p-2 text-right border-r border-indigo-900 w-20">Mal/Hizmet Tutarı</th>
              <th className="p-2 text-center border-r border-indigo-900 w-12">KDV %</th>
              <th className="p-2 text-right border-r border-indigo-900 w-18">KDV Tutarı</th>
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
                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-indigo-50/20'}>
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
                    <td className="p-2 text-right border-r border-slate-200 dark:border-slate-700 text-indigo-900 font-bold">
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
                  Faturaya ait ürün veya hizmet kalemi bulunmamaktadır.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 6. Alt Bölüm: Sol KDV Dağılımı Tablosu + Notlar/Banka & Sağ Resmi Toplamlar */}
      <div className="grid grid-cols-12 gap-3 pt-1 items-start">
        
        {/* Sol Alan: KDV Tablosu & Banka & Karekod */}
        <div className="col-span-7 space-y-2">
          
          {/* Resmi KDV Dağılım Tablosu */}
          <div className="border border-indigo-200 rounded overflow-hidden">
            <div className="bg-indigo-950 text-white px-2 py-1 text-[9px] font-bold uppercase tracking-wider flex justify-between">
              <span>KDV Matrah & Vergi Dağılım Tablosu</span>
              <span className="font-mono text-indigo-300">VUK-509</span>
            </div>
            <table className="w-full text-[9px] border-collapse">
              <thead className="bg-indigo-50/50 border-b border-indigo-200 font-bold text-indigo-950">
                <tr>
                  <th className="p-1.5 text-center border-r border-indigo-200">KDV Oranı</th>
                  <th className="p-1.5 text-right border-r border-indigo-200">Vergi Hariç Tutar (Matrah)</th>
                  <th className="p-1.5 text-right border-r border-indigo-200">Hesaplanan KDV</th>
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
                      <td className="p-1.5 text-right border-r border-slate-200 dark:border-slate-700 text-indigo-900 font-bold">
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

          {/* Notlar ve Banka Bilgisi */}
          <div className="border border-indigo-200 rounded p-2 bg-indigo-50/20 text-[10px] space-y-1">
            {invoice.notes && (
              <div className="pb-1 border-b border-indigo-100">
                <span className="font-bold text-indigo-950">Fatura Notu: </span>
                <span className="text-slate-700 dark:text-slate-200">{invoice.notes}</span>
              </div>
            )}
            <div className="text-[9px] text-slate-700 dark:text-slate-200">
              <span className="font-bold text-indigo-950">Ödeme & Banka Bilgisi: </span>
              {compBank} ({compTitle})
            </div>
            <div className="font-mono font-bold text-indigo-950 text-[10px]">
              IBAN: {compIban} (TRY)
            </div>
          </div>

          {/* Resmi Karekod & VUK Bilgilendirme */}
          <div className="flex items-center gap-3 pt-1">
            <div className="w-14 h-14 border border-indigo-200 rounded p-1 flex items-center justify-center bg-white dark:bg-slate-900 shadow-2xs">
              <QrCode className="w-12 h-12 text-indigo-950" />
            </div>
            <div className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight">
              <span className="font-bold text-indigo-950 block">Karekodlu Resmi e-Belge Doğrulama:</span>
              Bu fatura Gelir İdaresi Başkanlığı 509 Sıra No.lu VUK Genel Tebliği uyarınca elektronik ortamda tanzim edilmiştir. 5070 Sayılı Kanun Uyarınca E-İmza ile onaylanmıştır.
            </div>
          </div>

        </div>

        {/* Sağ Alan: Resmi Toplamlar Tablosu */}
        <div className="col-span-5 space-y-2">
          
          <div className="border-2 border-indigo-950 rounded p-3 bg-white dark:bg-slate-900 space-y-1.5 text-xs font-mono">
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
              <span className="font-mono font-bold text-indigo-900">
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

            <div className="pt-2 border-t-2 border-indigo-950 flex justify-between items-baseline font-sans">
              <span className="text-xs font-black text-indigo-950 uppercase">ÖDENECEK TOPLAM:</span>
              <span className="text-lg font-black font-mono text-indigo-950">
                ₺{Number(invoice.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* YAZIYLA TUTAR KUTUSU */}
          <div className="border border-indigo-200 rounded p-2 bg-indigo-50/50 text-[9px] text-center font-bold text-indigo-950 uppercase tracking-wide">
            YALNIZ: {amountInWords}
          </div>

        </div>

      </div>

      {/* 7. Resmi İmza ve Mühür Bölümü */}
      <div className="grid grid-cols-2 gap-8 pt-4 border-t border-indigo-200 text-center text-[10px]">
        <div className="space-y-1">
          <div className="font-bold text-indigo-950 uppercase">Düzenleyen / Teslim Eden</div>
          <div className="h-14 flex flex-col items-center justify-center font-serif italic text-slate-500 dark:text-slate-400 border border-dashed border-indigo-200 rounded p-1 bg-indigo-50/20">
            <span className="font-sans font-bold text-[9px] text-indigo-900">DMR Nexus Muhasebe Departmanı</span>
            <span className="text-[8px] text-slate-400">5070 Sayılı Kanun Uyarınca e-İmzalıdır</span>
          </div>
          <div className="text-[9px] text-slate-400">İmza / Kaşe</div>
        </div>

        <div className="space-y-1">
          <div className="font-bold text-indigo-950 uppercase">Teslim Alan / Alıcı</div>
          <div className="h-14 flex items-center justify-center font-serif italic text-slate-600 border border-dashed border-indigo-200 rounded p-1 bg-indigo-50/20">
            {invoice.contact?.name || 'Teslim Alan Yetkili'}
          </div>
          <div className="text-[9px] text-slate-400">Ad Soyad / İmza / Kaşe</div>
        </div>
      </div>

    </div>
  );
}
