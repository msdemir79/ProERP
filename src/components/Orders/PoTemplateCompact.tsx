import { BarcodeSvg } from '../BarcodeSvg';
import type { SizedRowGroup } from '../../lib/assortmentHelpers';
import type { Contact } from '../../types';

interface PoTemplateCompactProps {
  order: any;
  supplier: Contact | null;
  sizedGroups: SizedRowGroup[];
  uniqueSizes: string[];
  hasSizedItems: boolean;
}

export function PoTemplateCompact({
  order,
  supplier,
  sizedGroups,
  uniqueSizes,
  hasSizedItems,
}: PoTemplateCompactProps) {
  return (
                <div className="space-y-4">
                  {/* Workshop Barcode Header */}
                  <div className="border-b-2 border-slate-900 pb-2 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase text-indigo-700 tracking-wider">
                        DMR NEXUS İMALAT TAKİP FİŞİ
                      </span>
                      <h1 className="text-base font-black text-slate-900 uppercase">
                        ATÖLYE & DEPO TESLİM ÇİZELGESİ
                      </h1>
                      <p className="text-[10px] text-slate-600 font-bold">
                        Tedarikçi: {supplier?.name || 'Genel Tedarikçi'} | Sipariş: {order.orderNumber}
                      </p>
                    </div>

                    <div className="text-right flex flex-col items-end">
                      <BarcodeSvg value={order.orderNumber || 'SAS-000000'} height={28} />
                      <span className="text-[9px] font-mono font-bold text-slate-600 mt-0.5">
                        Termin: {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('tr-TR') : 'ACİL'}
                      </span>
                    </div>
                  </div>

                  {/* Fast Physical Counting Checklist */}
                  {hasSizedItems && sizedGroups.map((g, idx) => (
                    <div key={idx} className="border border-slate-300 rounded-lg overflow-hidden">
                      <div className="bg-slate-800 text-white px-3 py-1.5 flex items-center justify-between text-[11px]">
                        <span className="font-black uppercase">{g.productName} ({g.color})</span>
                        <span className="font-mono font-black text-amber-400">Toplam: {g.totalQuantity} Çift</span>
                      </div>

                      <div className="p-3 bg-white">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                          Fiziki Sayım ve Kabul Onay Kutucukları:
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {uniqueSizes.map(sz => {
                            const qty = g.sizeQuantities[sz] || 0;
                            return (
                              <div key={sz} className="p-2 border border-slate-300 rounded flex items-center gap-2 bg-slate-50">
                                <div className="w-4 h-4 border-2 border-slate-400 rounded-xs flex items-center justify-center text-transparent font-bold text-xs">
                                  ✓
                                </div>
                                <div className="text-left">
                                  <div className="text-[10px] font-bold text-slate-500">No {sz}</div>
                                  <div className="text-xs font-black font-mono text-slate-900">{qty} Çift</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Stage Checkpoints */}
                  <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                    <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider block">
                      ATÖLYE İSTASYON ONAYLARI:
                    </span>
                    <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                      <div className="p-2 border border-slate-300 rounded bg-white">
                        <span className="font-bold text-slate-600 block">1. Depo Giriş</span>
                        <span className="text-[9px] text-slate-400">[ ] Kabul Edildi</span>
                      </div>
                      <div className="p-2 border border-slate-300 rounded bg-white">
                        <span className="font-bold text-slate-600 block">2. Kalite Kontrol</span>
                        <span className="text-[9px] text-slate-400">[ ] Onaylandı</span>
                      </div>
                      <div className="p-2 border border-slate-300 rounded bg-white">
                        <span className="font-bold text-slate-600 block">3. Kesim / Saya</span>
                        <span className="text-[9px] text-slate-400">[ ] Sevk Edildi</span>
                      </div>
                      <div className="p-2 border border-slate-300 rounded bg-white">
                        <span className="font-bold text-slate-600 block">4. Montaj Bandı</span>
                        <span className="text-[9px] text-slate-400">[ ] Teslim Edildi</span>
                      </div>
                    </div>
                  </div>

                  {/* Compact Signatures */}
                  <div className="grid grid-cols-2 gap-3 pt-1 text-[10px]">
                    <div className="border border-slate-300 rounded p-2 text-center">
                      <p className="font-bold text-slate-800">Depo Sorumlusu İmzası</p>
                    </div>
                    <div className="border border-slate-300 rounded p-2 text-center">
                      <p className="font-bold text-slate-800">Atölye Şefi / Usta İmzası</p>
                    </div>
                  </div>
                </div>
  );
}
