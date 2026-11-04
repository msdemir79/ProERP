import { useNavigate } from 'react-router-dom';
import { User, Hammer, Package, Printer, Edit2, Trash2, Truck, FileText } from 'lucide-react';
import Modal from '../Modal';
import { cn } from '../../lib/utils';
import type { Contact, Product, WorkOrder, Waybill, Invoice } from '../../types';

interface OrderProgressStats {
  totalOrdered: number;
  totalProduced: number;
  totalInProduction: number;
  totalShipped: number;
  remainingToProduce: number;
  remainingToShip: number;
  producePercent: number;
  shipPercent: number;
  workOrdersCount: number;
  items: any[];
}

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any;
  contacts?: Contact[];
  products?: Product[];
  workOrders?: WorkOrder[];
  waybills?: Waybill[];
  invoices?: Invoice[];
  getStats: (orderId: number) => OrderProgressStats;
  isTransferring: boolean;
  onPrint: (orderId: number) => void;
  onEdit: (orderId: number) => void;
  onRequestDelete: (orderId: number, orderNumber: string) => void;
  onCreateWorkOrders: (orderId: number) => void;
}

export default function OrderDetailModal({
  isOpen,
  onClose,
  order: selectedOrder,
  contacts,
  products,
  workOrders,
  waybills,
  invoices,
  getStats,
  isTransferring,
  onPrint,
  onEdit,
  onRequestDelete,
  onCreateWorkOrders,
}: OrderDetailModalProps) {
  const navigate = useNavigate();

  return (
      <Modal 
        isOpen={isOpen} 
        onClose={() => onClose()} 
        title={`Sipariş Takip & İlerleme: ${selectedOrder?.orderNumber || ''}`}
        size="3xl"
      >
        {selectedOrder && (() => {
          const stats = selectedOrder.id ? getStats(selectedOrder.id) : null;
          const contact = contacts?.find(c => c.id === selectedOrder.contactId);
          const orderWOs = workOrders?.filter(w => w.orderId === selectedOrder.id) || [];

          return (
            <div className="space-y-6">
              {/* Top Summary Status Matrix */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Toplam Hedef</p>
                  <h4 className="text-xl font-black text-slate-900 dark:text-slate-100 font-mono">
                    {stats?.totalOrdered.toLocaleString('tr-TR')} <span className="text-xs uppercase text-slate-400">Çift</span>
                  </h4>
                </div>

                <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-200 text-center">
                  <p className="text-[10px] font-black text-blue-700 uppercase tracking-wider mb-1">Üretilen Miktar</p>
                  <h4 className="text-xl font-black text-blue-700 font-mono">
                    {stats?.totalProduced.toLocaleString('tr-TR')} <span className="text-xs text-blue-500">Çift (%{stats?.producePercent})</span>
                  </h4>
                  <div className="w-full h-1.5 bg-blue-100 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${stats?.producePercent}%` }} />
                  </div>
                </div>

                <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 text-center">
                  <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider mb-1">Sevk Edilen Miktar</p>
                  <h4 className="text-xl font-black text-emerald-700 font-mono">
                    {stats?.totalShipped.toLocaleString('tr-TR')} <span className="text-xs text-emerald-500">Çift (%{stats?.shipPercent})</span>
                  </h4>
                  <div className="w-full h-1.5 bg-emerald-100 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${stats?.shipPercent}%` }} />
                  </div>
                </div>

                <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 text-center">
                  <p className="text-[10px] font-black text-amber-700 uppercase tracking-wider mb-1">Kalan Bakiye (Sevk)</p>
                  <h4 className="text-xl font-black text-amber-700 font-mono">
                    {stats?.remainingToShip.toLocaleString('tr-TR')} <span className="text-xs text-amber-500">Çift</span>
                  </h4>
                  <p className="text-[9px] font-bold text-amber-600 mt-1">Kalan Üretim: {stats?.remainingToProduce} Çift</p>
                </div>
              </div>

              {/* Order Info & Line Items with Variant Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Panel: Contact & Order Details */}
                <div className="lg:col-span-1 space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
                      <User className="w-3.5 h-3.5" /> Cari & Sipariş Detayı
                    </h4>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Cari Ünvan</p>
                      <p className="text-sm font-black text-slate-900 dark:text-slate-100">{contact?.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">{contact?.phone || 'Telefon Yok'}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Sipariş Tarihi</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{new Date(selectedOrder.date).toLocaleDateString('tr-TR')}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Termin Tarihi</span>
                        <span className="font-bold text-indigo-600">
                          {selectedOrder.deliveryDate ? new Date(selectedOrder.deliveryDate).toLocaleDateString('tr-TR') : '-'}
                        </span>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center text-sm font-black text-indigo-600">
                      <span>Genel Tutar:</span>
                      <span>{selectedOrder.grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                    </div>
                  </div>

                  {/* Quick Production Button if needed */}
                  {orderWOs.length === 0 ? (
                    <button
                      onClick={() => onCreateWorkOrders(selectedOrder.id)}
                      disabled={isTransferring}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer"
                    >
                      <Hammer className="w-4 h-4" /> Üretim İş Emirlerini Başlat
                    </button>
                  ) : (
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 flex items-center justify-between">
                      <span>Bağlı İş Emirleri:</span>
                      <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">{orderWOs.length} Adet</span>
                    </div>
                  )}
                </div>

                {/* Right Panel: Product Lines Table with Exact Quantities */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                        <Package className="w-4 h-4 text-indigo-600" /> Sipariş Kalemleri ve Aşama Takibi
                      </h4>
                      <span className="text-[10px] font-bold text-slate-400">{selectedOrder.items?.length || 0} Kalem</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Ürün & Renk</th>
                            <th className="p-3 text-center">Sipariş</th>
                            <th className="p-3 text-center">Üretilen</th>
                            <th className="p-3 text-center">Sevk Edilen</th>
                            <th className="p-3 text-center">Kalan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {selectedOrder.items?.map((item: any, i: number) => {
                            const p = products?.find(prod => prod.id === item.productId);
                            const itemWOs = orderWOs.filter(wo => wo.orderItemId === item.id || (wo.productId === item.productId && wo.color === item.color));
                            const itemProduced = itemWOs.filter(w => w.status === 'completed').reduce((s, w) => s + w.quantity, 0);
                            const itemShipped = item.shippedQuantity || item.invoicedQuantity || 0;
                            const itemRemainingShip = Math.max(0, item.quantity - itemShipped);

                            return (
                              <tr key={i} className="hover:bg-slate-50 dark:bg-slate-800/50">
                                <td className="p-3">
                                  <div className="font-bold text-slate-800 dark:text-slate-200 uppercase">{p?.code || '-'}</div>
                                  <div className="text-[10px] text-slate-400 font-semibold">{p?.name}</div>
                                  {item.color && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded mt-0.5 uppercase">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                                      {item.color}
                                    </span>
                                  )}
                                  {item.size && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded mt-0.5">
                                      Beden: {item.size}
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center font-black font-mono text-slate-900 dark:text-slate-100">
                                  {item.quantity}
                                </td>
                                <td className="p-3 text-center">
                                  <span className="font-black font-mono text-blue-600">{itemProduced}</span>
                                  <span className="text-[9px] block text-slate-400 font-bold">
                                    %{item.quantity > 0 ? Math.round((itemProduced / item.quantity) * 100) : 0}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className="font-black font-mono text-emerald-600">{itemShipped}</span>
                                  <span className="text-[9px] block text-slate-400 font-bold">
                                    %{item.quantity > 0 ? Math.round((itemShipped / item.quantity) * 100) : 0}
                                  </span>
                                </td>
                                <td className="p-3 text-center font-black font-mono text-amber-600">
                                  {itemRemainingShip}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  {selectedOrder.notes && <span>Not: "{selectedOrder.notes}"</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(() => {
                    const selWaybills = waybills?.filter(wb => wb.orderId === selectedOrder.id && wb.status !== 'cancelled') || [];
                    const selInvoices = invoices?.filter(inv => inv.orderId === selectedOrder.id && inv.status !== 'cancelled') || [];
                    const hasSelWaybill = selWaybills.length > 0;
                    const hasSelInvoice = selInvoices.length > 0;
                    const isLocked = hasSelWaybill || hasSelInvoice;

                    return (
                      <>
                        <button 
                          onClick={() => onPrint(selectedOrder.id)}
                          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/50 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-1.5 transition-all cursor-pointer border border-indigo-200 dark:border-indigo-800"
                        >
                          <Printer className="w-4 h-4" />
                          <span>{selectedOrder.type === 'purchase' ? 'Tedarikçi Formu & Yazdır' : 'Sipariş Formu & Yazdır'}</span>
                        </button>

                        <button 
                          onClick={() => onEdit(selectedOrder.id)}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-1.5 transition-all cursor-pointer border border-blue-200"
                        >
                          <Edit2 className="w-4 h-4" />
                          <span>Düzenle</span>
                        </button>

                        <button 
                          onClick={() => onRequestDelete(selectedOrder.id, selectedOrder.orderNumber)}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 px-3.5 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-1.5 transition-all cursor-pointer border border-rose-200"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Sil</span>
                        </button>

                        <button 
                          disabled={hasSelWaybill}
                          onClick={() => {
                            if (hasSelWaybill) return;
                            onClose();
                            navigate(`/waybills?orderId=${selectedOrder.id}&contactId=${selectedOrder.contactId}&type=${selectedOrder.type}`);
                          }}
                          title={hasSelWaybill ? `Siparişin kesilmiş irsaliyesi bulunmaktadır (${selWaybills[0]?.waybillNumber}). İptal edilmedikçe yeniden irsaliye kesilemez.` : "İrsaliye Kes"}
                          className={cn(
                            "px-4 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-2 transition-all border",
                            hasSelWaybill
                              ? "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60 shadow-none"
                              : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 cursor-pointer border-transparent"
                          )}
                        >
                          <Truck className="w-4 h-4" />
                          <span>{hasSelWaybill ? 'İrsaliyesi Kesilmiş' : 'İrsaliye Kes'}</span>
                        </button>

                        <button 
                          disabled={hasSelInvoice}
                          onClick={() => {
                            if (hasSelInvoice) return;
                            onClose();
                            navigate(`/invoices?orderId=${selectedOrder.id}&contactId=${selectedOrder.contactId}&type=${selectedOrder.type}`);
                          }}
                          title={hasSelInvoice ? `Siparişin kesilmiş faturası bulunmaktadır (${selInvoices[0]?.invoiceNumber}). İptal edilmedikçe yeniden faturalandırılamaz.` : "Fatura Kes"}
                          className={cn(
                            "px-4 py-2.5 rounded-xl font-bold text-xs uppercase flex items-center gap-2 transition-all border",
                            hasSelInvoice
                              ? "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-60 shadow-none"
                              : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 cursor-pointer border-transparent"
                          )}
                        >
                          <FileText className="w-4 h-4" />
                          <span>{hasSelInvoice ? 'Faturalandırılmış' : 'Fatura Kes'}</span>
                        </button>
                      </>
                    );
                  })()}

                  <button 
                    onClick={() => onClose()}
                    className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 px-5 py-2.5 rounded-xl font-bold text-xs uppercase cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
  );
}
