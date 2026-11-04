import { Printer, X } from 'lucide-react';
import type { CollectionReceipt } from '../../types';

interface ReceiptPrintPreviewModalProps {
  receipt: CollectionReceipt | null;
  companySettings?: any;
  onClose: () => void;
}

export default function ReceiptPrintPreviewModal({ receipt, companySettings, onClose }: ReceiptPrintPreviewModalProps) {
  if (!receipt) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full p-8 space-y-6 my-8 print:p-0 print:m-0 print:shadow-none">
        <div className="flex items-center justify-between border-b pb-4 print:hidden">
          <span className="text-sm font-semibold text-gray-500">Resmi Makbuz Çıktısı</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Yazdır
            </button>
            <button
              onClick={() => onClose()}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Canvas */}
        <div className="border-2 border-gray-800 p-6 space-y-6 rounded">
          <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 gap-4">
            <div className="flex items-center gap-3">
              {companySettings?.logo ? (
                <div className="w-12 h-12 rounded bg-white dark:bg-slate-900 border border-gray-300 p-0.5 flex items-center justify-center shrink-0 overflow-hidden">
                  <img src={companySettings.logo} alt={companySettings.companyName} className="max-w-full max-h-full object-contain" />
                </div>
              ) : null}
              <div>
                <h2 className="text-xl font-black text-gray-900 uppercase tracking-wide">
                  {companySettings?.companyTitle || companySettings?.companyName || 'DMR Nexus'}
                </h2>
                <p className="text-xs text-gray-600 mt-1">{companySettings?.address || 'İkitelli OSB Aykosan Sanayi Sitesi 4. Ada B Blok No:12 Başakşehir / İstanbul'}</p>
                <p className="text-xs text-gray-600">Vergi Dairesi: {companySettings?.taxOffice || 'İkitelli V.D.'} - Vergi No: {companySettings?.taxNumber || '7320491820'}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="inline-block border-2 border-gray-800 px-3 py-1 text-sm font-black uppercase">
                {receipt.type === 'collection' ? 'TAHSİLAT MAKBUZU' : 'TEDİYE MAKBUZU'}
              </div>
              <p className="text-xs font-mono font-bold mt-2">Makbuz No: {receipt.receiptNumber}</p>
              <p className="text-xs text-gray-600">Tarih: {new Date(receipt.date).toLocaleDateString('tr-TR')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5 border border-gray-300 p-3 rounded">
              <span className="font-bold text-gray-700 uppercase">Cari Bilgileri</span>
              <p className="text-sm font-bold text-gray-900">{receipt.contactName}</p>
              <p className="text-gray-600">Ödeme Aracı: {receipt.instrument === 'cash' ? 'Nakit Kasa' : receipt.instrument === 'bank' ? 'Banka EFT/Havale' : receipt.instrument === 'check' ? 'Çek / Senet' : 'Kredi Kartı'}</p>
            </div>

            <div className="space-y-1.5 border border-gray-300 p-3 rounded flex flex-col justify-center">
              <span className="font-bold text-gray-700 uppercase">Tutar Bilgisi</span>
              <p className="text-2xl font-black text-gray-900">
                ₺{receipt.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-gray-600">Para Birimi: {receipt.currency || 'TRY'}</p>
            </div>
          </div>

          <div className="border border-gray-300 p-3 rounded text-xs space-y-1">
            <span className="font-bold text-gray-700">Açıklama:</span>
            <p className="text-gray-800">{receipt.description || 'Cari hesap mahsuben tahsilat/tediye bedeli.'}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-8 border-t border-gray-300 text-center text-xs">
            <div>
              <p className="font-bold text-gray-800">Teslim Eden</p>
              <div className="h-16 mt-2 border-b border-dashed border-gray-400"></div>
              <p className="text-gray-500 mt-1">İmza / Kaşe</p>
            </div>
            <div>
              <p className="font-bold text-gray-800">Teslim Alan (Tahsil Eden)</p>
              <div className="h-16 mt-2 border-b border-dashed border-gray-400"></div>
              <p className="text-gray-500 mt-1">İmza / Kaşe</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
