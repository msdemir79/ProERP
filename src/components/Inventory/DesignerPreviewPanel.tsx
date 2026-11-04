import React from 'react';
import { Eye, Save } from 'lucide-react';
import { BarcodeTemplate, Product, AssortmentTemplate } from '../../types';
import { SampleLabelData, DEFAULT_SAMPLE_SHOE_IMAGE } from '../../services/barcodeTemplateService';
import { BarcodeSvg } from '../BarcodeSvg';
import { cn } from '../../lib/utils';

interface DesignerPreviewPanelProps {
  effectiveW: number;
  effectiveH: number;
  selectedProductId: number | '';
  setSelectedProductId: React.Dispatch<React.SetStateAction<number | ''>>;
  products: Product[];
  selectedAssortmentTemplateId: number | '';
  setSelectedAssortmentTemplateId: React.Dispatch<React.SetStateAction<number | ''>>;
  assortmentTemplates: AssortmentTemplate[];
  borderStyle: 'solid' | 'dashed' | 'none';
  showCompanyHeader: boolean;
  companyHeaderText: string;
  sampleData: SampleLabelData;
  showBoxSerial: boolean;
  showProductImage: boolean;
  imagePosition: 'top' | 'right' | 'left';
  imageSizeMm: number;
  imageFit: 'contain' | 'cover';
  showProductCode: boolean;
  showProductName: boolean;
  showColor: boolean;
  showMaterial: boolean;
  showPrice: boolean;
  priceCurrency: string;
  showAssortmentTable: boolean;
  showOrderInfo: boolean;
  showLogisticsIcons: boolean;
  showWeightDesi: boolean;
  showBarcode: boolean;
  barcodeHeight: number;
  showBarcodeText: boolean;
  showCustomNote: boolean;
  customNoteText: string;
  onClose: () => void;
  handleSave: (e: React.FormEvent) => void;
  templateToEdit?: BarcodeTemplate | null;
}

const DesignerPreviewPanel: React.FC<DesignerPreviewPanelProps> = ({
  effectiveW,
  effectiveH,
  selectedProductId,
  setSelectedProductId,
  products,
  selectedAssortmentTemplateId,
  setSelectedAssortmentTemplateId,
  assortmentTemplates,
  borderStyle,
  showCompanyHeader,
  companyHeaderText,
  sampleData,
  showBoxSerial,
  showProductImage,
  imagePosition,
  imageSizeMm,
  imageFit,
  showProductCode,
  showProductName,
  showColor,
  showMaterial,
  showPrice,
  priceCurrency,
  showAssortmentTable,
  showOrderInfo,
  showLogisticsIcons,
  showWeightDesi,
  showBarcode,
  barcodeHeight,
  showBarcodeText,
  showCustomNote,
  customNoteText,
  onClose,
  handleSave,
  templateToEdit,
}) => {
  return (
          <div className="lg:col-span-5 p-6 bg-slate-100/70 dark:bg-slate-950/60 flex flex-col justify-between space-y-4">
            
            {/* Önizleme Kontrolleri */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Canlı Termal Önizleme
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 font-bold">{effectiveW}×{effectiveH} mm</span>
                </div>
              </div>

              {/* Gerçek Ürün ve Asorti Şablonu Seçici */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                    Önizleme İçin Ürün Seç:
                  </label>
                  <select
                    value={selectedProductId}
                    onChange={e => {
                      const val = e.target.value ? Number(e.target.value) : '';
                      setSelectedProductId(val);
                      if (val) {
                        const prod = products.find(p => p.id === val);
                        if (prod?.assortmentTemplateId) {
                          setSelectedAssortmentTemplateId(prod.assortmentTemplateId);
                        }
                      }
                    }}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Varsayılan Örnek Ürün --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                    Asorti Şablonu Test Et:
                  </label>
                  <select
                    value={selectedAssortmentTemplateId}
                    onChange={e => setSelectedAssortmentTemplateId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- Ürünün Kendisi / Otomatik --</option>
                    {assortmentTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Gerçekçi Termal Kağıt Görünümü */}
            <div className="flex-1 flex items-center justify-center p-2 min-h-[360px] max-h-[500px] overflow-auto">
              <div 
                style={{
                  width: `${effectiveW * 2.8}px`,
                  minHeight: `${effectiveH * 2.8}px`,
                  maxHeight: '480px',
                }}
                className={cn(
                  "bg-white text-black p-3.5 shadow-xl rounded-sm transition-all flex flex-col justify-between overflow-hidden text-[11px] leading-tight select-none",
                  borderStyle === 'solid' ? 'border-2 border-black' : borderStyle === 'dashed' ? 'border-2 border-dashed border-black' : 'border border-slate-200'
                )}
              >
                {/* 1. Header */}
                {showCompanyHeader && (
                  <div className="border-b-2 border-black pb-1 mb-1.5 flex items-center justify-between">
                    <span className="font-black text-[11px] uppercase tracking-wide">
                      {companyHeaderText || sampleData.companyName}
                    </span>
                    {showBoxSerial && (
                      <span className="bg-black text-white px-1.5 py-0.5 rounded text-[9px] font-black">
                        KOLİ: 1 / 10
                      </span>
                    )}
                  </div>
                )}

                {/* 2. Product Title & Image */}
                {showProductImage ? (
                  imagePosition === 'top' ? (
                    <div className="flex flex-col items-center justify-center text-center gap-1.5 my-1.5">
                      <div 
                        style={{
                          width: `${imageSizeMm * 2.8}px`,
                          height: `${imageSizeMm * 2.8}px`,
                        }}
                        className="border border-black rounded flex items-center justify-center bg-white overflow-hidden shrink-0 shadow-xs"
                      >
                        <img 
                          src={sampleData.productImage || DEFAULT_SAMPLE_SHOE_IMAGE} 
                          style={{ width: '100%', height: '100%', objectFit: imageFit || 'contain' }} 
                          alt="Ürün Görseli" 
                        />
                      </div>
                      <div>
                        {showProductCode && (
                          <div className="font-mono font-black text-[10px] text-slate-800">
                            KOD: {sampleData.productCode}
                          </div>
                        )}
                        {showProductName && (
                          <div className="font-black text-[12px] uppercase leading-tight line-clamp-2">
                            {sampleData.productName}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : imagePosition === 'left' ? (
                    <div className="flex gap-2 justify-start items-start my-1.5">
                      <div 
                        style={{
                          width: `${imageSizeMm * 2.8}px`,
                          height: `${imageSizeMm * 2.8}px`,
                        }}
                        className="border border-black rounded flex items-center justify-center bg-white overflow-hidden shrink-0 shadow-xs"
                      >
                        <img 
                          src={sampleData.productImage || DEFAULT_SAMPLE_SHOE_IMAGE} 
                          style={{ width: '100%', height: '100%', objectFit: imageFit || 'contain' }} 
                          alt="Ürün Görseli" 
                        />
                      </div>
                      <div className="flex-1">
                        {showProductCode && (
                          <div className="font-mono font-black text-[10px] text-slate-800">
                            KOD: {sampleData.productCode}
                          </div>
                        )}
                        {showProductName && (
                          <div className="font-black text-[12px] uppercase leading-tight line-clamp-2">
                            {sampleData.productName}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 justify-between items-start my-1.5">
                      <div className="flex-1">
                        {showProductCode && (
                          <div className="font-mono font-black text-[10px] text-slate-800">
                            KOD: {sampleData.productCode}
                          </div>
                        )}
                        {showProductName && (
                          <div className="font-black text-[12px] uppercase leading-tight line-clamp-2">
                            {sampleData.productName}
                          </div>
                        )}
                      </div>
                      <div 
                        style={{
                          width: `${imageSizeMm * 2.8}px`,
                          height: `${imageSizeMm * 2.8}px`,
                        }}
                        className="border border-black rounded flex items-center justify-center bg-white overflow-hidden shrink-0 shadow-xs"
                      >
                        <img 
                          src={sampleData.productImage || DEFAULT_SAMPLE_SHOE_IMAGE} 
                          style={{ width: '100%', height: '100%', objectFit: imageFit || 'contain' }} 
                          alt="Ürün Görseli" 
                        />
                      </div>
                    </div>
                  )
                ) : (
                  <div className="my-1.5">
                    {showProductCode && (
                      <div className="font-mono font-black text-[10px] text-slate-800">
                        KOD: {sampleData.productCode}
                      </div>
                    )}
                    {showProductName && (
                      <div className="font-black text-[12px] uppercase leading-tight line-clamp-2">
                        {sampleData.productName}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Color, Material & Size */}
                <div className="grid grid-cols-2 gap-1 my-1 text-[9px]">
                  {showColor && (
                    <div className="border border-black p-1 rounded">
                      <span className="text-[7px] font-bold uppercase block text-slate-600">RENK:</span>
                      <span className="font-black">{sampleData.color}</span>
                    </div>
                  )}
                  {showMaterial && (
                    <div className="border border-black p-1 rounded">
                      <span className="text-[7px] font-bold uppercase block text-slate-600">MALZEME:</span>
                      <span className="font-black">{sampleData.material}</span>
                    </div>
                  )}
                  {showPrice && (
                    <div className="border border-black p-1 rounded col-span-2 flex justify-between items-center bg-slate-50">
                      <span className="text-[8px] font-bold">FİYAT:</span>
                      <span className="font-black text-[11px]">₺{sampleData.price?.toLocaleString('tr-TR')} {priceCurrency}</span>
                    </div>
                  )}
                </div>

                {/* 4. Assortment Matrix */}
                {showAssortmentTable && (
                  <div className="my-1">
                    <div className="flex justify-between text-[7px] font-black uppercase mb-0.5">
                      <span>ASORTİ DAĞILIMI</span>
                      <span>TOPLAM: {sampleData.totalPairs || 0} ÇİFT</span>
                    </div>
                    {(() => {
                      const entries = Object.entries(sampleData.assortmentMatrix || {});
                      if (entries.length === 0) return null;

                      return (
                        <div 
                          className="border border-black text-center text-[8px] font-bold grid overflow-hidden"
                          style={{ gridTemplateColumns: `repeat(${entries.length + 1}, minmax(0, 1fr))` }}
                        >
                          {entries.map(([sz]) => (
                            <div key={`th-${sz}`} className="bg-black text-white p-0.5 truncate">{sz}</div>
                          ))}
                          <div className="bg-neutral-800 text-white p-0.5 font-black">TOP</div>

                          {entries.map(([sz, qty]) => (
                            <div key={`td-${sz}`} className="p-0.5 border-t border-black">{qty}</div>
                          ))}
                          <div className="p-0.5 border-t border-black font-black bg-slate-100">{sampleData.totalPairs || 0}</div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* 5. Order & Logistics */}
                {(showOrderInfo || showLogisticsIcons || showWeightDesi) && (
                  <div className="border-t border-b border-dashed border-black py-1 my-1 flex justify-between items-center text-[8px]">
                    <div>
                      {showOrderInfo && <div><strong>SİP:</strong> {sampleData.orderNumber}</div>}
                      {showWeightDesi && <div><strong>AĞIRLIK:</strong> 14.5 KG | 18 DESİ</div>}
                    </div>
                    {showLogisticsIcons && (
                      <div className="flex gap-1">
                        <span className="border border-black px-1 rounded font-bold">🍷</span>
                        <span className="border border-black px-1 rounded font-bold">☔</span>
                        <span className="border border-black px-1 rounded font-bold">⬆️</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 6. Barcode */}
                {showBarcode && (
                  <div className="flex flex-col items-center justify-center border border-black rounded p-1 my-1">
                    <BarcodeSvg 
                      value={sampleData.barcode || '8690123456789'}
                      height={Math.min(36, barcodeHeight)}
                      showText={false}
                    />
                    {showBarcodeText && (
                      <span className="font-mono text-[9px] font-black tracking-widest mt-0.5">
                        *{sampleData.barcode || '8690123456789'}*
                      </span>
                    )}
                  </div>
                )}

                {/* 7. Footer Note */}
                {showCustomNote && (
                  <div className="text-[6.5px] font-bold text-center border-t border-black pt-0.5 mt-0.5 uppercase">
                    {customNoteText || 'DMR NEXUS STANDART TERMAL BARKOD'}
                  </div>
                )}
              </div>
            </div>

            {/* KAYDET & KULLAN BUTONLARI */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Vazgeç
              </button>

              <button
                type="button"
                onClick={handleSave}
                className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{templateToEdit ? 'Değişiklikleri Kaydet' : 'Şablonu Oluştur'}</span>
              </button>
            </div>

          </div>
  );
};

export default DesignerPreviewPanel;
