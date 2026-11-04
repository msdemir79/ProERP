import React, { useState, useRef } from 'react';
import { 
  X, 
  Printer, 
  Download, 
  Package, 
  Truck, 
  Building2, 
  MapPin, 
  Calendar, 
  CheckCircle2, 
  Scale, 
  Layers,
  ArrowUp,
  Umbrella,
  Wine
} from 'lucide-react';
import { BarcodeSvg } from '../BarcodeSvg';
import { printHtml, openPrintWindow } from '../../lib/printService';
import { downloadThermal100x150Pdf } from '../../lib/pdfService';
import { showToast } from '../../lib/feedback';

export interface ThermalShippingLabelProps {
  isOpen: boolean;
  onClose: () => void;
  waybill?: any;
  companySettings?: any;
  shipmentData?: {
    orderNumber?: string;
    waybillNumber?: string;
    customerName?: string;
    customerAddress?: string;
    customerCity?: string;
    customerPhone?: string;
    customerTaxNumber?: string;
    productName?: string;
    productCode?: string;
    color?: string;
    totalPairs?: number;
    sizeDistribution?: { [size: string]: number };
    boxNumber?: number;
    totalBoxes?: number;
    weightKg?: number;
    carrierName?: string;
    trackingCode?: string;
  };
}

export const ThermalShippingLabelModal: React.FC<ThermalShippingLabelProps> = ({
  isOpen,
  onClose,
  waybill,
  companySettings,
  shipmentData
}) => {
  const derivedCarrier = waybill?.carrierTitle || shipmentData?.carrierName || 'ARAS KARGO / AMBAR';
  const [boxNumber, setBoxNumber] = useState<number>(shipmentData?.boxNumber || 1);
  const [totalBoxes, setTotalBoxes] = useState<number>(shipmentData?.totalBoxes || 1);
  const [weightKg, setWeightKg] = useState<number>(shipmentData?.weightKg || 14.5);
  const [carrierName, setCarrierName] = useState<string>(derivedCarrier);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const labelRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const orderNo = waybill?.orderNumber || shipmentData?.orderNumber || (waybill?.waybillNumber ? `IRS-${waybill.waybillNumber}` : 'SIP-2026-0042');
  const customerName = waybill?.contact?.companyTitle || waybill?.contact?.name || shipmentData?.customerName || 'METRO AYAKKABI VE DERİ MAMULLERİ SAN. TİC. LTD. ŞTİ.';
  const customerAddress = waybill?.deliveryAddress || waybill?.contact?.address || shipmentData?.customerAddress || 'İkitelli OSB Aykosan Sanayi Sitesi 4. Ada No:24';
  const customerCity = (waybill?.contact?.district ? `${waybill.contact.district} / ` : '') + (waybill?.contact?.city || shipmentData?.customerCity || 'Başakşehir / İSTANBUL');
  const customerPhone = waybill?.contact?.phone || waybill?.contact?.mobile || shipmentData?.customerPhone || '0212 549 00 22';
  const customerTaxNo = waybill?.contact?.taxNumber || waybill?.contact?.tcKimlik || shipmentData?.customerTaxNumber || '6200492811';

  const firstItem = waybill?.items?.[0];
  const productName = firstItem?.productName || shipmentData?.productName || 'Hakiki Deri Erkek Klasik Oxford';
  const productCode = firstItem?.productCode || shipmentData?.productCode || 'AYK-OXF-01';
  const color = firstItem?.color || shipmentData?.color || 'Siyah';
  const totalPairs = waybill?.totalQuantity || shipmentData?.totalPairs || (waybill?.items?.reduce((acc: number, it: any) => acc + (it.quantity || 0), 0) || 24);

  const sizeDist = shipmentData?.sizeDistribution || {
    '40': 3,
    '41': 6,
    '42': 8,
    '43': 5,
    '44': 2
  };

  const trackingBarcode = shipmentData?.trackingCode || `${waybill?.waybillNumber || orderNo}-BX${String(boxNumber).padStart(2, '0')}`;

  const handlePrint = async () => {
    if (!labelRef.current) return;
    await printHtml(labelRef.current.innerHTML, {
      title: `Koli_Etiketi_${trackingBarcode}`,
      widthMm: 100,
      heightMm: 150
    });
  };

  const handleDownloadPdf = async () => {
    if (!labelRef.current) return;
    setIsDownloadingPdf(true);
    try {
      await downloadThermal100x150Pdf(labelRef.current, `Koli_Etiketi_${trackingBarcode}.pdf`);
    } catch (err) {
      console.error(err);
      showToast('PDF oluşturulurken bir hata oluştu.', 'error');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl overflow-hidden text-slate-100 max-h-[96vh]">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Termal Lojistik / Kargo Koli Etiketi (100x150 mm)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Hazır Çıktı Standardı
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Endüstriyel termal barkod yazıcılar (Zebra, Xprinter, TSC) ve standart lazer yazıcılar için optimize edilmiştir.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
              title="100x150 mm PDF İndir"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isDownloadingPdf ? 'Hazırlanıyor...' : 'PDF İndir'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
              title="Yazıcıya Gönder"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Yazdır</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar: Box Controls */}
        <div className="px-5 py-2 bg-slate-800/60 border-b border-slate-700/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Koli No:</span>
              <input
                type="number"
                min="1"
                max={totalBoxes}
                value={boxNumber}
                onChange={(e) => setBoxNumber(Math.max(1, Number(e.target.value) || 1))}
                className="w-14 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-xs font-bold text-white"
              />
              <span className="text-slate-500">/</span>
              <input
                type="number"
                min="1"
                value={totalBoxes}
                onChange={(e) => setTotalBoxes(Math.max(1, Number(e.target.value) || 1))}
                className="w-14 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-xs font-bold text-white"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Brüt Ağırlık:</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={weightKg}
                onChange={(e) => setWeightKg(Number(e.target.value) || 10)}
                className="w-16 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-center text-xs font-bold text-white"
              />
              <span className="text-slate-400">kg</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Truck className="w-3.5 h-3.5 text-amber-400" />
            <input
              type="text"
              value={carrierName}
              onChange={(e) => setCarrierName(e.target.value)}
              placeholder="Taşıyıcı / Kargo Adı"
              className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
            />
          </div>
        </div>

        {/* Viewport: Label Preview (Exact 100mm x 150mm Proportion) */}
        <div className="flex-1 p-6 bg-slate-950/60 overflow-y-auto flex items-center justify-center">
          
          {/* Printable Thermal Label Canvas */}
          <div 
            ref={labelRef}
            className="w-[378px] min-h-[567px] bg-white text-black p-3.5 shadow-2xl border-2 border-black flex flex-col justify-between font-sans select-none"
            style={{ fontFamily: 'Arial, "Helvetica Neue", sans-serif' }}
          >
            {/* 1. Header: Carrier & Logistics Tracking */}
            <div className="border-b-2 border-black pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider block text-slate-700">TAŞIYICI / LOJİSTİK</span>
                  <span className="text-sm font-black uppercase">{carrierName}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold block text-slate-700">KOLİ NO</span>
                  <span className="text-base font-black px-2 py-0.5 bg-black text-white rounded">
                    {boxNumber} / {totalBoxes}
                  </span>
                </div>
              </div>

              {/* Main Parcel Tracking Code128 Barcode */}
              <div className="mt-1.5 flex flex-col items-center justify-center">
                <BarcodeSvg 
                  value={trackingBarcode}
                  height={38}
                  showText={false}
                />
                <span className="font-mono text-xs font-black tracking-widest mt-0.5">
                  *{trackingBarcode}*
                </span>
              </div>
            </div>

            {/* 2. Sender & Receiver Addresses */}
            <div className="grid grid-cols-2 gap-2 border-b-2 border-black py-2 text-[10px] leading-tight">
              {/* Sender */}
              <div className="border-r border-black pr-2">
                <span className="font-black block uppercase text-[9px] text-slate-600">GÖNDERİCİ:</span>
                <p className="font-black text-[11px] uppercase">DMR NEXUS</p>
                <p className="mt-0.5">İkitelli OSB 12. Cad. No:45</p>
                <p>Başakşehir / İSTANBUL</p>
                <p className="font-mono">VKN: 7340592811 | (0212) 555 0199</p>
              </div>

              {/* Receiver */}
              <div className="pl-1">
                <span className="font-black block uppercase text-[9px] text-slate-600">ALICI / SEVK ADRESİ:</span>
                <p className="font-black text-[11px] uppercase line-clamp-2">{customerName}</p>
                <p className="mt-0.5 line-clamp-2">{customerAddress}</p>
                <p className="font-bold">{customerCity}</p>
                <p className="font-mono">Tel: {customerPhone}</p>
              </div>
            </div>

            {/* 3. Product & Assortment Details */}
            <div className="border-b-2 border-black py-2 text-[10px]">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[9px] font-black uppercase text-slate-600">ÜRÜN / MODEL:</span>
                  <p className="text-xs font-black uppercase">{productName}</p>
                  <p className="text-[10px] font-bold text-slate-700">Kod: {productCode} | Renk: {color}</p>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-black uppercase text-slate-600">KOLİ İÇİ:</span>
                  <p className="text-sm font-black text-black">{totalPairs} ÇİFT</p>
                  <p className="text-[10px] font-bold">Brüt: {weightKg} kg</p>
                </div>
              </div>

              {/* Shoe Size Assortment Grid */}
              <div className="mt-2 pt-1 border-t border-dashed border-slate-400">
                <span className="text-[9px] font-black uppercase tracking-wider block text-slate-600 mb-1">
                  BEDEN / ASORTİ DAĞILIMI (NUMARA ADETLERİ):
                </span>
                <div className="flex border border-black text-center font-mono">
                  {Object.entries(sizeDist).map(([sz, qty], i) => (
                    <div key={sz} className={`flex-1 ${i > 0 ? 'border-l border-black' : ''}`}>
                      <div className="bg-slate-200 text-[9px] font-bold py-0.5 border-b border-black">{sz}</div>
                      <div className="font-black text-xs py-0.5">{qty}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. Order & Reference Info */}
            <div className="py-1.5 flex justify-between items-center text-[10px] border-b-2 border-black font-mono">
              <div>
                <span className="text-slate-600 block text-[9px]">SİPARİŞ NO:</span>
                <span className="font-black text-xs">{orderNo}</span>
              </div>
              <div>
                <span className="text-slate-600 block text-[9px]">SEVK TARİHİ:</span>
                <span className="font-black text-xs">{new Date().toLocaleDateString('tr-TR')}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-600 block text-[9px]">ETİKET TİPİ:</span>
                <span className="font-black text-[10px]">100 x 150 MM</span>
              </div>
            </div>

            {/* 5. Warning Icons & Logistics Notice */}
            <div className="pt-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Fragile */}
                <div className="flex flex-col items-center border border-black p-1 rounded">
                  <Wine className="w-5 h-5 text-black" />
                  <span className="text-[7px] font-black uppercase mt-0.5">KIRILGAN</span>
                </div>
                {/* Keep Dry */}
                <div className="flex flex-col items-center border border-black p-1 rounded">
                  <Umbrella className="w-5 h-5 text-black" />
                  <span className="text-[7px] font-black uppercase mt-0.5">NEMDEN KORU</span>
                </div>
                {/* This Side Up */}
                <div className="flex flex-col items-center border border-black p-1 rounded">
                  <div className="flex gap-0.5">
                    <ArrowUp className="w-4 h-4 text-black" />
                    <ArrowUp className="w-4 h-4 text-black" />
                  </div>
                  <span className="text-[7px] font-black uppercase mt-0.5">BU YÖN YUKARI</span>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[8px] font-black uppercase">DMR NEXUS İMALAT & LOJİSTİK</p>
                <p className="text-[7px] text-slate-600">Bu koli kalite kontrol onayından geçmiştir.</p>
              </div>
            </div>

          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <span>Standart Termal Koli Etiketi Boyutu: 100mm × 150mm (4" × 6")</span>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadPdf}
              className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
            >
              PDF Dosyası Olarak Kaydet
            </button>
            <span>•</span>
            <button
              onClick={handlePrint}
              className="text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
            >
              Hızlı Termal Yazdır
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
