import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Building2, Printer, ExternalLink, Split, Loader2 } from 'lucide-react';
import Modal from '../Modal';
import DataGrid, { type GridColumn } from '../Common/DataGrid';
import { ContactSelect } from '../Contacts/ContactSelect';
import { productionService } from '../../services/productionService';
import { showToast } from '../../lib/feedback';
import { formatQuantity, roundUpQuantity } from '../../lib/inventoryCalculator';
import { getMrpKey } from './mrpUtils';
import type { MrpCalculationResult, MrpRequirementItem, Contact } from '../../types';

interface PoCreatedSummary {
  orders: {
    orderId: number;
    orderNumber: string;
    supplierId: number;
    supplierName: string;
    itemCount: number;
    grandTotal: number;
  }[];
  totalOrders: number;
  totalAmount: number;
}

interface MrpPurchaseOrderModalProps {
  mrpResult: MrpCalculationResult;
  selectedMrpKeys: string[];
  contacts?: Contact[] | null;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onPrintPo: (orderId: number) => void;
}

export default function MrpPurchaseOrderModal({
  mrpResult,
  selectedMrpKeys,
  contacts,
  onClose,
  onCreated,
  onPrintPo
}: MrpPurchaseOrderModalProps) {
  // Auto-assign preferred suppliers on mount (modal is conditionally rendered per open)
  const [itemSuppliers, setItemSuppliers] = React.useState<Record<string, number>>(() => {
    const suppliers = contacts?.filter(c => c.type === 'supplier' || c.type === 'both') || [];
    const defaultSupId = suppliers[0]?.id || 0;
    const initialMapping: Record<string, number> = {};
    mrpResult.items.forEach(item => {
      const key = getMrpKey(item);
      const supId = item.preferredSupplierId || defaultSupId;
      initialMapping[key] = supId;
      initialMapping[String(item.rawMaterialId)] = supId;
    });
    return initialMapping;
  });
  const [batchSupplierId, setBatchSupplierId] = React.useState<number | null>(null);
  const [isCreatingPO, setIsCreatingPO] = React.useState(false);
  const [poCreatedSummary, setPoCreatedSummary] = React.useState<PoCreatedSummary | null>(null);

  // PO Modal items DataGrid columns
  const poModalColumns = React.useMemo<GridColumn<MrpRequirementItem>[]>(() => [
    {
      key: 'rawMaterialName', title: 'Hammadde / Malzeme',
      render: (item) => {
        const itemKey = getMrpKey(item);
        return (
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-900 dark:text-slate-100">{item.rawMaterialName}</span>
              {item.color && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">
                  Renk: {item.color}
                </span>
              )}
              {item.subType && (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                  {item.subType}
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-slate-400">{item.rawMaterialCode}</div>

            {item.hasSizeMatrix && item.sizeBreakdown && item.sizeBreakdown.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {item.sizeBreakdown.filter(sb => sb.shortage > 0).map((sb, sbIdx) => (
                  <span
                    key={`po-chip-${itemKey}-${sb.size}-${sbIdx}`}
                    className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                  >
                    {sb.size}: {sb.shortage} {item.unit || 'Çift'}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      },
      filterValue: (item) => `${item.rawMaterialName} ${item.rawMaterialCode} ${item.color || ''} ${item.subType || ''}`,
    },
    {
      key: 'shortageQuantity', title: 'Eksik Miktar', align: 'right', width: 'w-32',
      render: (item) => (
        <span className="font-black text-rose-600">
          {formatQuantity(item.shortageQuantity)} {item.unit}
        </span>
      ),
      filterValue: (item) => `${item.shortageQuantity ?? 0}`,
    },
    {
      key: 'supplier', title: 'Tedarikçi Firma',
      render: (item) => {
        const itemKey = getMrpKey(item);
        const currentSupId = itemSuppliers[itemKey] || itemSuppliers[String(item.rawMaterialId)] || item.preferredSupplierId || 0;
        const isPredefined = item.preferredSupplierId && currentSupId === item.preferredSupplierId;
        return (
          <div className="flex items-center gap-2">
            <ContactSelect
              compact
              className="max-w-[200px]"
              contacts={contacts ?? []}
              allowTypes={['supplier', 'both']}
              value={currentSupId || null}
              placeholder="Tedarikçi Seçin..."
              emptyOptionLabel="Tedarikçi Seçilmedi"
              onChange={(id) => {
                const val = id ?? 0;
                setItemSuppliers(prev => {
                  const updated = { ...prev, [itemKey]: val, [String(item.rawMaterialId)]: val };
                  mrpResult?.items.forEach(otherItem => {
                    if (otherItem.rawMaterialId === item.rawMaterialId) {
                      updated[getMrpKey(otherItem)] = val;
                    }
                  });
                  return updated;
                });
              }}
            />
            {isPredefined && (
              <span className="text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded shrink-0">
                Kayıtlı
              </span>
            )}
          </div>
        );
      },
      filterValue: (item) => {
        const itemKey = getMrpKey(item);
        const currentSupId = itemSuppliers[itemKey] || itemSuppliers[String(item.rawMaterialId)] || item.preferredSupplierId || 0;
        const sup = contacts?.find(c => c.id === currentSupId);
        return sup?.name || '';
      },
    },
    {
      key: 'estimatedCost', title: 'Tahmini Tutar', align: 'right', width: 'w-32',
      render: (item) => (
        <span className="font-black text-slate-900 dark:text-slate-100">
          {item.estimatedCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
        </span>
      ),
      filterValue: (item) => `${item.estimatedCost ?? 0}`,
    },
  ], [itemSuppliers, contacts, mrpResult]);

  // Create Purchase Order from MRP shortages (multi-supplier auto split)
  const handleCreatePurchaseOrderFromMRP = async () => {
    if (selectedMrpKeys.length === 0) {
      showToast('Lütfen satın alma siparişi oluşturmak için en az bir hammadde seçin.', 'warning');
      return;
    }

    const itemsToBuy = mrpResult.items
      .filter(i => selectedMrpKeys.includes(getMrpKey(i)) && i.shortageQuantity > 0)
      .map(i => {
        const key = getMrpKey(i);
        const validSizes = i.sizeBreakdown
          ?.filter(sb => sb.shortage > 0)
          .map(sb => ({ size: sb.size, quantity: roundUpQuantity(sb.shortage, 2) }));

        return {
          rawMaterialId: i.rawMaterialId,
          color: i.color,
          quantity: roundUpQuantity(i.shortageQuantity, 2),
          sizeBreakdown: validSizes && validSizes.length > 0 ? validSizes : undefined,
          unitPrice: i.buyingPrice,
          supplierId: itemSuppliers[key] || itemSuppliers[String(i.rawMaterialId)] || i.preferredSupplierId
        };
      });

    if (itemsToBuy.length === 0) {
      showToast('Seçilen kalemler arasında eksik stok bulunmuyor.', 'info');
      return;
    }

    setIsCreatingPO(true);
    try {
      const res = await productionService.createPurchaseOrdersBySupplierFromMRP(itemsToBuy);
      setPoCreatedSummary({
        orders: res.ordersCreated,
        totalOrders: res.totalOrdersCount,
        totalAmount: res.totalGrandTotal
      });
      // Recalculate MRP to update onOrderQuantity, po_created status and prevent duplicates
      await onCreated();
    } catch (err: any) {
      showToast(`Sipariş oluşturma hatası: ${err.message}`, 'error');
    } finally {
      setIsCreatingPO(false);
    }
  };

  return (
      <Modal 
        isOpen={true} 
        onClose={onClose}
        title="MRP'den Tedarikçiye Göre Ayrıştırılmış Satın Alma Siparişleri"
        edgeToEdge
        allowFullscreen={false}
      >
        {poCreatedSummary ? (
          <div className="space-y-6 py-2">
            <div className="p-6 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-3xl text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-200">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-tight">
                {poCreatedSummary.totalOrders} Adet Satın Alma Siparişi Başarıyla Oluşturuldu!
              </h3>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                Eksik malzemeler tedarikçi firmalarına göre otomatik gruplandırılarak ayrı ayrı resmi alış siparişlerine dönüştürüldü.
              </p>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Oluşturulan Sipariş Fişleri ({poCreatedSummary.totalOrders})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60dvh] overflow-y-auto pr-1">
                {poCreatedSummary.orders.map(o => (
                  <div key={o.orderId} className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded">
                        #{o.orderNumber}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                        {o.itemCount} Kalem Malzeme
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-slate-100">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>{o.supplierName}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => {
                          onPrintPo(o.orderId);
                        }}
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer border border-indigo-200 dark:border-indigo-800"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Tedarikçi Formu & Yazdır</span>
                      </button>
                      <span className="text-xs font-black text-slate-900 dark:text-slate-100">
                        {o.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <Link
                to="/orders"
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Siparişler Modülünde Gör
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all"
              >
                Tamam
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 flex items-start gap-3">
              <Split className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
              <div className="text-xs text-indigo-900 dark:text-indigo-200">
                <span className="font-bold">Çoklu Tedarikçi Ayrıştırması: </span>
                Her malzeme için tanımlı tedarikçi otomatik seçilmiştir. Onayladığınızda sistem her tedarikçi firmaya <b>ayrı bir Satın Alma Siparişi</b> oluşturacaktır.
              </div>
            </div>

            {/* Quick batch assign */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                Toplu Tedarikçi Ata:
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <ContactSelect
                  className="min-w-[220px]"
                  contacts={contacts ?? []}
                  allowTypes={['supplier', 'both']}
                  value={batchSupplierId}
                  placeholder="Tedarikçi Seçin..."
                  emptyOptionLabel="Tedarikçi Seçilmedi"
                  onChange={(id) => setBatchSupplierId(id)}
                />
                <button
                  type="button"
                  disabled={!batchSupplierId}
                  onClick={() => {
                    if (!batchSupplierId) return;
                    const updated = { ...itemSuppliers };
                    selectedMrpKeys.forEach(key => {
                      updated[key] = batchSupplierId;
                    });
                    setItemSuppliers(updated);
                  }}
                  className="px-3 py-1.5 bg-slate-900 dark:bg-slate-100 hover:bg-indigo-600 text-white dark:text-slate-900 dark:hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 shrink-0"
                >
                  Tümüne Uygula
                </button>
              </div>
            </div>

            {/* Items table */}
            <DataGrid<MrpRequirementItem>
              columns={poModalColumns}
              data={(mrpResult?.items || []).filter(i => selectedMrpKeys.includes(getMrpKey(i)) && i.shortageQuantity > 0)}
              rowKey={(item) => getMrpKey(item)}
              maxHeight="min(52dvh, 42rem)"
              emptyMessage="Seçili eksik hammadde bulunmuyor."
            />

            {/* Live split summary preview */}
            {(() => {
              const shortageList = mrpResult?.items.filter(i => selectedMrpKeys.includes(getMrpKey(i)) && i.shortageQuantity > 0) || [];
              const groupMap = new Map<number, { supplierName: string; items: typeof shortageList; totalCost: number }>();
              const allSuppliers = contacts?.filter(c => c.type === 'supplier' || c.type === 'both') || [];

              shortageList.forEach(it => {
                const key = getMrpKey(it);
                const sId = itemSuppliers[key] || itemSuppliers[String(it.rawMaterialId)] || it.preferredSupplierId || allSuppliers[0]?.id || 0;
                const supplierObj = allSuppliers.find(c => c.id === sId);
                const sName = supplierObj?.name || 'Genel Tedarikçi';

                const existing = groupMap.get(sId) || { supplierName: sName, items: [], totalCost: 0 };
                existing.items.push(it);
                existing.totalCost += it.estimatedCost;
                groupMap.set(sId, existing);
              });

              const totalSplitOrders = groupMap.size;
              const totalEstAmount = Array.from(groupMap.values()).reduce((sum, g) => sum + g.totalCost, 0);

              return (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    <span>Otomatik Açılacak Siparişler ({totalSplitOrders} Ayrı Firma)</span>
                    <span className="text-indigo-600 font-bold">Toplam: {totalEstAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {Array.from(groupMap.entries()).map(([sId, g], groupIdx) => (
                      <div key={`po-group-box-${sId}-${groupIdx}`} className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-slate-100 truncate">{g.supplierName}</span>
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.2 rounded">
                            {g.items.length} Kalem
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {g.items.map(i => `${i.rawMaterialName}${i.color ? ` (${i.color})` : ''}`).join(', ')}
                        </div>
                        <div className="text-[11px] font-black text-slate-800 dark:text-slate-200 text-right">
                          {g.totalCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={isCreatingPO || shortageList.length === 0}
                    onClick={handleCreatePurchaseOrderFromMRP}
                    className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-md shadow-rose-100 flex items-center justify-center gap-2 cursor-pointer mt-3"
                  >
                    {isCreatingPO ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Siparişler Oluşturuluyor...
                      </>
                    ) : (
                      <>
                        <Split className="w-4 h-4" />
                        Tedarikçilere Göre Ayrıştır ve {totalSplitOrders} Ayrı Sipariş Aç
                      </>
                    )}
                  </button>
                </div>
              );
            })()}
          </div>
        )}
      </Modal>
  );
}
