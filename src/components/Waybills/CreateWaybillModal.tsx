import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { invoiceService } from '../../services/invoiceService';
import { waybillService } from '../../services/waybillService';
import { useProductionDemand, demandOptionSuffix, demandChipText } from '../../services/productionDemand';
import type { ColorMaster, WaybillItem, WaybillType, WaybillStatus, WaybillScenario } from '../../types';
import { Truck, Plus, CheckCircle2, X, Trash2, ShoppingBag, Package, Car } from 'lucide-react';
import { ColorSelect } from '../Colors/ColorSelect';
import { ContactSelect } from '../Contacts/ContactSelect';
import { ProductSelect } from '../Common/ProductSelect';
import { cn } from '../../lib/utils';
import { showToast } from '../../lib/feedback';

// =========================================================================================
// CREATE WAYBILL MODAL (With direct Order import & manual line item builder)
// =========================================================================================
interface CreateWaybillModalProps {
  isOpen: boolean;
  initialType: WaybillType;
  initialContactId?: number;
  initialOrderId?: number;
  onClose: () => void;
  onSuccess: (waybillId: number) => void;
}

export default function CreateWaybillModal({
  isOpen,
  initialType,
  initialContactId,
  initialOrderId,
  onClose,
  onSuccess
}: CreateWaybillModalProps) {
  const [type, setType] = useState<WaybillType>(initialType);
  const [scenario, setScenario] = useState<WaybillScenario>('sevk');
  const [contactId, setContactId] = useState<number | ''>(initialContactId || '');
  const [waybillNumber, setWaybillNumber] = useState('');
  const [ettn, setEttn] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [dispatchTime, setDispatchTime] = useState(
    new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  );
  
  // Logistics & Carrier
  const [carrierTitle, setCarrierTitle] = useState('ÖZLEM NAKLİYAT VE LOJİSTİK A.Ş.');
  const [carrierTaxNo, setCarrierTaxNo] = useState('3890123456');
  const [vehiclePlate, setVehiclePlate] = useState('34 YK 8842');
  const [trailerPlate, setTrailerPlate] = useState('');
  const [driverName, setDriverName] = useState('Ahmet Yılmaz');
  const [driverTc, setDriverTc] = useState('28934102948');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<WaybillStatus>('issued');
  const [isStockDeducted, setIsStockDeducted] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<number | undefined>(initialOrderId);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string | undefined>('');

  // Items State
  const [items, setItems] = useState<Omit<WaybillItem, 'id' | 'waybillId'>[]>([]);

  // Pending orders selector
  const [isOrderSelectorOpen, setIsOrderSelectorOpen] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queries
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);
  const products = useApiQuery(() => api.products.list(), [], ['products']);
  // Üretimden bekleyen ihtiyaç: yalnızca modal açıkken hesaplanır
  const { demand } = useProductionDemand(isOpen);

  // Generate initial waybill number and ETTN
  useEffect(() => {
    async function initWaybillInfo() {
      const num = await waybillService.generateWaybillNumber(type);
      setWaybillNumber(num);
      setEttn(invoiceService.generateETTN());
    }
    initWaybillInfo();
  }, [type]);

  // When contact changes, update delivery address from contact profile
  useEffect(() => {
    if (contactId) {
      const selectedContact = contacts?.find(c => c.id === Number(contactId));
      if (selectedContact) {
        setDeliveryAddress(selectedContact.shippingAddress || selectedContact.address || '');
      }
    }
  }, [contactId, contacts]);

  // Load pending orders when contact changes
  useEffect(() => {
    async function loadOrders() {
      if (contactId) {
        const ords = await waybillService.getPendingOrdersForWaybill(Number(contactId), type);
        setPendingOrders(ords);

        // If an initial order ID was passed, auto-load its remaining items
        if (initialOrderId && ords.some(o => o.id === initialOrderId)) {
          const target = ords.find(o => o.id === initialOrderId);
          if (target) {
            importOrderItems(target);
          }
        }
      } else {
        setPendingOrders([]);
      }
    }
    loadOrders();
  }, [contactId, type, initialOrderId]);

  // Helper to import items from an order
  const importOrderItems = async (order: any) => {
    try {
      // Sipariş satırlarında birim tutulmuyor; ürün kartları henüz yüklenmediyse bekle.
      const availableProducts = products ?? await api.products.list();
      const mappedItems: Omit<WaybillItem, 'id' | 'waybillId'>[] = order.items.map((oi: any) => {
        const product = availableProducts.find(p => p.id === oi.productId);
        const remaining = oi.remainingQuantity ?? oi.quantity;
        const unitPrice = oi.unitPrice ?? 0;
        const discountRate = oi.discountRate ?? 0;
        const taxRate = oi.taxRate ?? product?.vatRate ?? 20;

        const sub = remaining * unitPrice;
        const discAmt = (sub * discountRate) / 100;
        const taxable = sub - discAmt;
        const taxAmt = (taxable * taxRate) / 100;
        const tot = taxable + taxAmt;

        return {
          productId: oi.productId,
          orderItemId: oi.id,
          productCode: oi.productCode || product?.code || 'STK',
          productName: oi.productName || product?.name || 'Ürün',
          color: oi.color,
          size: oi.size,
          quantity: remaining,
          unit: oi.unit || product?.unit || 'Çift',
          unitPrice,
          discountRate,
          discountAmount: discAmt,
          taxRate,
          taxAmount: taxAmt,
          total: tot
        };
      });

      setSelectedOrderId(order.id);
      setSelectedOrderNumber(order.orderNumber);
      setItems(mappedItems);
      setIsOrderSelectorOpen(false);
    } catch (error) {
      showToast('Sipariş ürünleri yüklenemedi: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
  };

  // Add blank manual item row
  const addBlankItem = () => {
    setItems(prev => [
      ...prev,
      {
        productCode: '',
        productName: '',
        quantity: 1,
        unit: 'Çift',
        unitPrice: 0,
        discountRate: 0,
        discountAmount: 0,
        taxRate: 20,
        taxAmount: 0,
        total: 0
      }
    ]);
  };

  /**
   * Renk seçimi satıra hem metin (`color`, tarihsel kolon) hem merkezî kart bağı
   * (`colorId`) olarak yazılır; serbest metin girişi yoktur.
   */
  const updateItemColor = (index: number, colorId: number | null, color: ColorMaster | null) => {
    setItems(prev => prev.map((it, i) => (i === index ? { ...it, color: color?.name || undefined, colorId } : it)));
  };

  // Update item field
  const updateItem = (index: number, field: string, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const current = { ...updated[index], [field]: value };

      if (field === 'productId') {
        const prod = products?.find(p => p.id === Number(value));
        if (prod) {
          current.productId = prod.id;
          current.productCode = prod.code;
          current.productName = prod.name;
          current.unit = prod.unit;
          current.unitPrice = type === 'sales' ? (prod.sellingPrice || 0) : (prod.buyingPrice || 0);
        }
      }

      const qty = Number(current.quantity) || 0;
      const price = Number(current.unitPrice) || 0;
      const discRate = Number(current.discountRate) || 0;
      const taxRate = Number(current.taxRate) || 0;

      const sub = qty * price;
      const discAmt = (sub * discRate) / 100;
      const taxable = sub - discAmt;
      const taxAmt = (taxable * taxRate) / 100;
      const total = taxable + taxAmt;

      current.discountAmount = discAmt;
      current.taxAmount = taxAmt;
      current.total = total;

      updated[index] = current;
      return updated;
    });
  };

  // Remove item
  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Total Calculations
  const subtotal = items.reduce((sum, it) => sum + (it.quantity * it.unitPrice - it.discountAmount), 0);
  const discountTotal = items.reduce((sum, it) => sum + it.discountAmount, 0);
  const taxTotal = items.reduce((sum, it) => sum + it.taxAmount, 0);
  const grandTotal = subtotal + taxTotal;
  const totalQuantity = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);

  const handleSubmit = async (submitStatus: WaybillStatus) => {
    if (!contactId) {
      showToast('Lütfen bir müşteri veya tedarikçi cari seçiniz.', 'warning');
      return;
    }
    if (items.length === 0) {
      showToast('Lütfen en az bir sevk kalemi ekleyiniz.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const waybillId = await waybillService.createWaybill(
        {
          waybillNumber,
          type,
          scenario,
          contactId: Number(contactId),
          orderId: selectedOrderId,
          orderNumber: selectedOrderNumber,
          date: new Date(date),
          dispatchDate: new Date(dispatchDate),
          dispatchTime,
          carrierTitle,
          carrierTaxNo,
          vehiclePlate,
          trailerPlate,
          driverName,
          driverTc,
          deliveryAddress,
          ettn,
          subtotal,
          discountTotal,
          taxTotal,
          grandTotal,
          totalQuantity,
          currency: 'TRY',
          status: submitStatus,
          isStockDeducted,
          invoicedStatus: 'not_invoiced',
          notes
        },
        items
      );

      onSuccess(waybillId);
    } catch (err: any) {
      console.error('İrsaliye oluşturulamadı:', err);
      showToast('İrsaliye oluşturulurken hata oluştu: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl flex flex-col max-h-[96vh] overflow-hidden border border-slate-200 dark:border-slate-700">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 px-6 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">
                {type === 'sales' ? 'Yeni Sevk / Satış İrsaliyesi Düzenle' : 'Yeni Alış / Gelen İrsaliye Düzenle'}
              </h3>
              <p className="text-xs text-slate-400">
                GİB e-İrsaliye ve VUK 509 Tebliği Standartlarında Sevk Kaydı
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 dark:bg-slate-800/50 text-xs">
          
          {/* Top Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            {/* İrsaliye Tipi & Senaryo */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">İrsaliye Türü</label>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setType('sales')}
                  className={cn(
                    "py-1.5 rounded-lg font-bold text-xs transition-all",
                    type === 'sales' ? "bg-white dark:bg-slate-900 text-indigo-700 shadow-2xs" : "text-slate-600"
                  )}
                >
                  Sevk / Satış
                </button>
                <button
                  type="button"
                  onClick={() => setType('purchase')}
                  className={cn(
                    "py-1.5 rounded-lg font-bold text-xs transition-all",
                    type === 'purchase' ? "bg-white dark:bg-slate-900 text-emerald-700 shadow-2xs" : "text-slate-600"
                  )}
                >
                  Alış / Gelen
                </button>
              </div>
            </div>

            {/* Senaryo */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">e-İrsaliye Senaryosu</label>
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value as WaybillScenario)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="sevk">TEMEL SEVK İRSALİYESİ</option>
                <option value="matbu">MATBU SEVK İRSALİYESİ</option>
                <option value="fason">FASON SEVK İRSALİYESİ</option>
                <option value="konsinye">KONSİNYE SEVK İRSALİYESİ</option>
                <option value="ihracat">İHRACAT SEVK İRSALİYESİ</option>
              </select>
            </div>

            {/* İrsaliye No & ETTN */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">İrsaliye Numarası</label>
              <input
                type="text"
                value={waybillNumber}
                onChange={(e) => setWaybillNumber(e.target.value)}
                readOnly
                placeholder="Kaydedildiğinde otomatik oluşturulur"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* Cari Müşteri / Tedarikçi */}
            <div className="md:col-span-2">
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                {type === 'sales' ? 'Müşteri / Alıcı Cari' : 'Tedarikçi Cari'}
              </label>
              <ContactSelect
                contacts={contacts ?? []}
                value={contactId ? Number(contactId) : null}
                createType={type === 'sales' ? 'customer' : 'supplier'}
                placeholder="-- Cari Seçiniz --"
                onChange={(id) => setContactId(id ?? '')}
              />
            </div>

            {/* Siparişten Çağır Butonu */}
            <div className="flex items-end">
              <button
                type="button"
                disabled={!contactId}
                onClick={() => setIsOrderSelectorOpen(true)}
                className={cn(
                  "w-full py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-2 border transition-all",
                  contactId 
                    ? "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 shadow-2xs cursor-pointer"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed"
                )}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>
                  {selectedOrderNumber ? `Sipariş: ${selectedOrderNumber}` : 'Açık Siparişten Aktar'}
                </span>
              </button>
            </div>

            {/* Tarih Bilgileri */}
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">İrsaliye Tarihi</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Fiili Sevk Tarihi</label>
              <input
                type="date"
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Fiili Sevk Saati</label>
              <input
                type="time"
                value={dispatchTime}
                onChange={(e) => setDispatchTime(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Logistics & Carrier Box */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 text-indigo-900 font-bold border-b border-slate-100 dark:border-slate-800 pb-2">
              <Car className="w-4 h-4 text-indigo-600" />
              <span>Taşıyıcı & Lojistik Sevk Bilgileri (GİB e-İrsaliye Zorunlu Alanları)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-0.5">Taşıyıcı Firma / Kargo</label>
                <input
                  type="text"
                  placeholder="Örn: Yurtiçi Kargo, MNG, Özlem Lojistik"
                  value={carrierTitle}
                  onChange={(e) => setCarrierTitle(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-0.5">Taşıyıcı VKN</label>
                <input
                  type="text"
                  placeholder="10 haneli vergi kimlik no"
                  value={carrierTaxNo}
                  onChange={(e) => setCarrierTaxNo(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-0.5">Araç / Çekici Plakası</label>
                <input
                  type="text"
                  placeholder="Örn: 34 YK 8842"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono uppercase"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-0.5">Dorse Plakası</label>
                <input
                  type="text"
                  placeholder="Örn: 34 ABC 123 (varsa)"
                  value={trailerPlate}
                  onChange={(e) => setTrailerPlate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono uppercase"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-0.5">Sürücü Adı Soyadı</label>
                <input
                  type="text"
                  placeholder="Örn: Ahmet Yılmaz"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-0.5">Sürücü TCKN</label>
                <input
                  type="text"
                  placeholder="11 haneli TCKN"
                  value={driverTc}
                  onChange={(e) => setDriverTc(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="md:col-span-4">
                <label className="text-[11px] font-bold text-slate-600 block mb-0.5">
                  Teslimat / Sevk Depo Adresi
                </label>
                <input
                  type="text"
                  placeholder="Sevkiyatın yapılacağı şantiye, fabrika veya depo adresi"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                />
              </div>
            </div>
          </div>

          {/* LINE ITEMS TABLE */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden">
            <div className="p-3 px-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                <span className="font-black text-slate-800 dark:text-slate-200 text-xs">Sevk Edilecek Mal / Hizmet Kalemleri</span>
                <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
                  {items.length} Kalem
                </span>
              </div>
              <button
                type="button"
                onClick={addBlankItem}
                className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Manuel Satır Ekle</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/75 border-b border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="p-2.5 w-10 text-center">#</th>
                    <th className="p-2.5 min-w-[200px]">Ürün / Hizmet</th>
                    <th className="p-2.5 w-24">Renk / Beden</th>
                    <th className="p-2.5 w-20 text-center">Miktar</th>
                    <th className="p-2.5 w-16 text-center">Birim</th>
                    <th className="p-2.5 w-24 text-right">Birim Fiyat</th>
                    <th className="p-2.5 w-16 text-center">KDV %</th>
                    <th className="p-2.5 w-24 text-right">Net Tutar</th>
                    <th className="p-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        Henüz kalem eklenmedi. Açık siparişten aktarabilir veya "Manuel Satır Ekle" butonuna basabilirsiniz.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => (
                      <tr key={`wb-item-${item.productId || 'p'}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="p-2.5 text-center text-slate-400 font-bold">{idx + 1}</td>
                        <td className="p-2.5">
                          <ProductSelect
                            compact
                            placeholder="-- Ürün Seç --"
                            products={products || []}
                            value={item.productId ?? null}
                            onChange={(productId) => updateItem(idx, 'productId', productId ?? '')}
                            optionSuffix={(p) => demandOptionSuffix(p.id != null ? demand.get(p.id) : undefined)}
                          />
                          {item.productId != null && demandChipText(demand.get(item.productId), item.color) && (
                            <div className="mt-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                              {demandChipText(demand.get(item.productId), item.color)}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5">
                          <div className="flex gap-1">
                            <ColorSelect
                              compact
                              className="w-1/2"
                              value={item.colorId ?? null}
                              valueName={item.color}
                              placeholder="Renk"
                              onChange={(colorId, color) => updateItemColor(idx, colorId, color)}
                            />
                            <input
                              type="text"
                              placeholder="Beden"
                              value={item.size || ''}
                              onChange={(e) => updateItem(idx, 'size', e.target.value)}
                              className="w-1/2 p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-center"
                            />
                          </div>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                            className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded font-bold text-center"
                          />
                        </td>
                        <td className="p-2.5">
                          <select
                            value={item.unit}
                            onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                            className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-center"
                          >
                            {!['Çift', 'Adet', 'Metre', 'Kg', 'Paket'].includes(item.unit) && (
                              <option value={item.unit}>{item.unit}</option>
                            )}
                            <option value="Çift">Çift</option>
                            <option value="Adet">Adet</option>
                            <option value="Metre">Metre</option>
                            <option value="Kg">Kg</option>
                            <option value="Paket">Paket</option>
                          </select>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(idx, 'unitPrice', Number(e.target.value))}
                            className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-right font-mono"
                          />
                        </td>
                        <td className="p-2.5">
                          <select
                            value={item.taxRate}
                            onChange={(e) => updateItem(idx, 'taxRate', Number(e.target.value))}
                            className="w-full p-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded text-center"
                          >
                            <option value={0}>%0</option>
                            <option value={1}>%1</option>
                            <option value={10}>%10</option>
                            <option value={20}>%20</option>
                          </select>
                        </td>
                        <td className="p-2.5 text-right font-mono font-black text-slate-900 dark:text-slate-100">
                          {item.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                        </td>
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom Summary & Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">Sevk & Lojistik Notları</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Şoföre talimatlar, koli no, ambalaj durumu veya teslimat özel notları..."
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none"
                />
              </div>

              {/* Stok Hareketi Checkbox */}
              <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="stockDeduct"
                    checked={isStockDeducted}
                    onChange={(e) => setIsStockDeducted(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                  />
                  <label htmlFor="stockDeduct" className="font-bold text-slate-800 dark:text-slate-200 text-xs cursor-pointer">
                    Stok Hareketi Otomatik Düşülsün / Eklensin
                  </label>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold">Varyant bazlı stok senkronize edilir</span>
              </div>
            </div>

            {/* Calculations Box */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-2 font-mono text-xs">
              <div className="flex justify-between text-slate-600">
                <span className="font-sans font-bold">Toplam Sevk Miktarı:</span>
                <span className="font-black text-slate-900 dark:text-slate-100 text-sm">{totalQuantity} Çift</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Ara Toplam (KDV Hariç):</span>
                <span className="font-bold">{subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Toplam İskonto:</span>
                  <span className="font-bold">-{discountTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600 border-b border-slate-100 dark:border-slate-800 pb-2">
                <span>Hesaplanan KDV:</span>
                <span className="font-bold">{taxTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
              </div>
              <div className="flex justify-between text-sm font-black text-slate-900 dark:text-slate-100 pt-1">
                <span className="font-sans">GENEL TOPLAM:</span>
                <span className="text-indigo-600 font-black">
                  {grandTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 px-6 bg-slate-900 text-white flex items-center justify-between border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors"
          >
            Vazgeç
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('draft')}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-xl text-xs font-bold transition-colors"
            >
              Taslak Kaydet
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('issued')}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
            >
              <Truck className="w-4 h-4" />
              <span>İrsaliyeyi Kes & Sevk Et</span>
            </button>
          </div>
        </div>

        {/* ORDER SELECTOR MODAL */}
        {isOrderSelectorOpen && (
          <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-700">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-indigo-600" />
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">Açık Sipariş Kalemlerini Aktar</h4>
                </div>
                <button 
                  onClick={() => setIsOrderSelectorOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3 flex-1">
                {pendingOrders.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30 text-emerald-600" />
                    <p className="font-bold text-slate-600">Bu cariye ait bekleyen açık sipariş bulunamadı.</p>
                  </div>
                ) : (
                  pendingOrders.map(ord => (
                    <div 
                      key={`wb-pending-ord-${ord.id}`}
                      className="p-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer space-y-2"
                      onClick={() => importOrderItems(ord)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-indigo-700">{ord.orderNumber}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                          Tarih: {new Date(ord.date).toLocaleDateString('tr-TR')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-200">
                        {ord.items?.length || 0} kalem ürün sevk edilmeyi bekliyor
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span>Kalan Miktar: {ord.items?.reduce((s: number, i: any) => s + (i.remainingQuantity ?? i.quantity), 0)}</span>
                        <span className="text-indigo-600 font-bold">Bu Siparişi Aktar →</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
