import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Printer,
  Download,
  Mail,
  X,
  FileText,
  Boxes,
  AlertCircle,
  Edit3,
  Save,
  Scissors,
  Sliders
} from 'lucide-react';
import { api, commit, callOp, type Mutation } from '../../api/client';
import { orderService } from '../../services/orderService';
import { settingsService } from '../../services/settingsService';
import { downloadElementAsPdf } from '../../lib/pdfService';
import { openPrintWindow } from '../../lib/printService';
import { cn } from '../../lib/utils';
import { showToast } from '../../lib/feedback';
import { numberToTurkishWords, isFootwearProduct, calculateAssortmentBreakdown, type SizedRowGroup } from '../../lib/assortmentHelpers';
import { PoTemplateOfficial } from './PoTemplateOfficial';
import { PoTemplateMatrix } from './PoTemplateMatrix';
import { PoTemplateCompact } from './PoTemplateCompact';
import { PoMatrixEditorModal, type MatrixEditingTarget } from './PoMatrixEditorModal';
import { PoEmailModal } from './PoEmailModal';
import type { Order, OrderItem, Contact, Product, CompanySettings, AssortmentTemplate, WorkOrder } from '../../types';

export type PoTemplateType = 'official' | 'matrix_focused' | 'compact';

interface PurchaseOrderPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId?: number | null;
  orderData?: Order & { items: OrderItem[] };
}


export function PurchaseOrderPrintModal({
  isOpen,
  onClose,
  orderId,
  orderData: initialOrderData
}: PurchaseOrderPrintModalProps) {
  const [order, setOrder] = useState<any>(null);
  const [supplier, setSupplier] = useState<Contact | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [productsMap, setProductsMap] = useState<Map<number, Product>>(new Map());
  const [assortmentTemplates, setAssortmentTemplates] = useState<AssortmentTemplate[]>([]);
  const [workOrdersList, setWorkOrdersList] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<PoTemplateType>('official');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  
  // Custom Matrix Overrides (e.g. user manually edits or picks template in modal)
  const [customMatrixOverrides, setCustomMatrixOverrides] = useState<Record<string, { [size: string]: number }>>({});
  
  // Size Breakdown Editor Drawer/Modal state
  const [isMatrixEditorOpen, setIsMatrixEditorOpen] = useState(false);
  const [matrixEditingTarget, setMatrixEditingTarget] = useState<MatrixEditingTarget | null>(null);

  // Email Modal state
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState({ subject: '', body: '' });
  const [emailRecipient, setEmailRecipient] = useState('');

  // Custom Editable Order Instructions for Printing
  const [customInstructions, setCustomInstructions] = useState<string>('');
  const [isEditingInstructions, setIsEditingInstructions] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const printContentRef = useRef<HTMLDivElement>(null);

  // Load Order, Supplier, Company, Products, Templates & Work Orders
  useEffect(() => {
    async function loadData() {
      if (!isOpen) return;
      if (!orderId && !initialOrderData) return;

      setLoading(true);
      try {
        let loadedOrder = initialOrderData;
        if (orderId) {
          loadedOrder = await orderService.getOrder(orderId);
        }

        if (!loadedOrder) {
          setLoading(false);
          return;
        }

        setOrder(loadedOrder);
        setCustomInstructions(loadedOrder.notes || '');

        const [sysSettings, allProducts, allContacts, allTemplates, allWorkOrders] = await Promise.all([
          settingsService.getSystemSettings(),
          api.products.list(),
          api.contacts.list(),
          api.assortmentTemplates.list(),
          api.workOrders.list()
        ]);

        if (sysSettings?.company) {
          setCompanySettings(sysSettings.company);
        }

        setAssortmentTemplates(allTemplates);
        setWorkOrdersList(allWorkOrders);

        const pMap = new Map<number, Product>();
        allProducts.forEach(p => {
          if (p.id) pMap.set(p.id, p);
        });
        setProductsMap(pMap);

        const foundSupplier = allContacts.find(c => c.id === loadedOrder.contactId) || null;
        setSupplier(foundSupplier);

        if (foundSupplier?.email) {
          setEmailRecipient(foundSupplier.email);
        } else {
          setEmailRecipient('');
        }
      } catch (err) {
        console.error('Satınalma siparişi yüklenirken hata:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [isOpen, orderId, initialOrderData]);

  // Aggregate Size Matrix Groups & Non-sized Items
  const { sizedGroups, uniqueSizes, nonSizedItems, totalSizedQuantity, totalNonSizedQuantity, hasSizedItems } = useMemo(() => {
    if (!order?.items || order.items.length === 0) {
      return {
        sizedGroups: [],
        uniqueSizes: [],
        nonSizedItems: [],
        totalSizedQuantity: 0,
        totalNonSizedQuantity: 0,
        hasSizedItems: false
      };
    }

    const sizeSet = new Set<string>();
    const sizedMap = new Map<string, SizedRowGroup>();
    const nonSized: any[] = [];
    let totalSizedQty = 0;
    let totalNonSizedQty = 0;

    // Group items by product + color first to see if size breakdown is explicit or needs derivation
    const rawGroups = new Map<string, OrderItem[]>();
    order.items.forEach((item: OrderItem) => {
      const groupKey = `${item.productId}_${(item.color || '').trim().toLowerCase()}`;
      const list = rawGroups.get(groupKey) || [];
      list.push(item);
      rawGroups.set(groupKey, list);
    });

    rawGroups.forEach((items, groupKey) => {
      const firstItem = items[0];
      const prod = productsMap.get(firstItem.productId);
      const isSizedGroup = items.some(i => isFootwearProduct(prod, i));

      if (isSizedGroup) {
        // Check if items have explicit size breakdown
        const itemsWithExplicitSize = items.filter(i => !!i.size && i.size.trim() !== '' && i.size.trim() !== '-');

        const totalQtyForGroup = items.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
        const price = Number(firstItem.unitPrice) || (prod?.buyingPrice || 0);
        const totalAmountForGroup = items.reduce((acc, curr) => acc + (Number(curr.total) || ((Number(curr.quantity) || 0) * price)), 0);

        const defaultProdColor = prod?.colors && prod.colors.length > 0 ? prod.colors[0] : (firstItem.color || 'STANDART');
        const color = firstItem.color || defaultProdColor;

        let sizeQuantities: { [size: string]: number } = {};

        // 1. Check custom overrides from local state
        const overrideKey = `${firstItem.productId}_${color.trim().toLowerCase()}`;
        if (customMatrixOverrides[overrideKey]) {
          sizeQuantities = { ...customMatrixOverrides[overrideKey] };
        } else if (itemsWithExplicitSize.length > 0) {
          // 2. Use explicit sizes from OrderItems
          itemsWithExplicitSize.forEach(i => {
            const sz = i.size!.trim();
            sizeQuantities[sz] = (sizeQuantities[sz] || 0) + (Number(i.quantity) || 0);
          });
        } else {
          // 3. Auto-calculate size distribution for sized component (Taban, Mostra, etc.)
          let templateToUse: AssortmentTemplate | undefined = undefined;
          if (prod?.assortmentTemplateId) {
            templateToUse = assortmentTemplates.find(t => t.id === prod.assortmentTemplateId);
          }

          if (templateToUse && templateToUse.items.length > 0) {
            sizeQuantities = calculateAssortmentBreakdown(totalQtyForGroup, templateToUse.items, prod?.name, prod?.moldGroup);
          } else if (prod?.assortment && prod.assortment.length > 0) {
            sizeQuantities = calculateAssortmentBreakdown(totalQtyForGroup, prod.assortment, prod?.name, prod?.moldGroup);
          } else {
            // Check active work orders for ratio
            const matchedWo = workOrdersList.find(w => w.assortmentBreakdown && w.assortmentBreakdown.length > 0);
            if (matchedWo?.assortmentBreakdown) {
              sizeQuantities = calculateAssortmentBreakdown(totalQtyForGroup, matchedWo.assortmentBreakdown, prod?.name, prod?.moldGroup);
            } else {
              // Default distribution based on mold or adult series
              sizeQuantities = calculateAssortmentBreakdown(totalQtyForGroup, undefined, prod?.name, prod?.moldGroup);
            }
          }
        }

        // Register sizes into sizeSet
        Object.keys(sizeQuantities).forEach(sz => {
          if (sizeQuantities[sz] > 0) {
            sizeSet.add(sz);
          }
        });

        totalSizedQty += totalQtyForGroup;

        sizedMap.set(groupKey, {
          productId: firstItem.productId,
          productCode: prod?.code || '-',
          productName: prod?.name || 'Hammadde / Ürün',
          color: color,
          unit: prod?.unit || 'Çift',
          moldCode: prod?.moldCode || (prod?.moldGroup ? prod.moldGroup.split(' ')[0] : '018'),
          moldGroup: prod?.moldGroup || 'ERKEK STANDART (40-45)',
          unitPrice: price,
          taxRate: firstItem.taxRate || 20,
          sizeQuantities,
          totalQuantity: totalQtyForGroup,
          totalAmount: totalAmountForGroup,
          originalItemIds: items.map(i => i.id!).filter(Boolean)
        });
      } else {
        // Non-sized item (e.g. Leather, Adhesive, Buckle, Fabric)
        items.forEach(item => {
          const qty = Number(item.quantity) || 0;
          totalNonSizedQty += qty;
          const defaultProdColor = prod?.colors && prod.colors.length > 0 ? prod.colors[0] : '-';
          nonSized.push({
            ...item,
            productCode: prod?.code || '-',
            productName: prod?.name || 'Hammadde / Malzeme',
            unit: prod?.unit || 'Adet',
            color: item.color || defaultProdColor
          });
        });
      }
    });

    // Intelligently sort sizes: numeric order if possible
    const sortedSizes = Array.from(sizeSet).sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.localeCompare(b, 'tr');
    });

    return {
      sizedGroups: Array.from(sizedMap.values()),
      uniqueSizes: sortedSizes,
      nonSizedItems: nonSized,
      totalSizedQuantity: totalSizedQty,
      totalNonSizedQuantity: totalNonSizedQty,
      hasSizedItems: sizedMap.size > 0
    };
  }, [order, productsMap, customMatrixOverrides, assortmentTemplates, workOrdersList]);

  // Size column totals
  const sizeColumnTotals = useMemo(() => {
    const totals: { [size: string]: number } = {};
    uniqueSizes.forEach(s => {
      totals[s] = sizedGroups.reduce((acc, row) => acc + (row.sizeQuantities[s] || 0), 0);
    });
    return totals;
  }, [uniqueSizes, sizedGroups]);

  // Open size breakdown editor for a specific group
  const handleOpenMatrixEditor = (group: SizedRowGroup) => {
    setMatrixEditingTarget({
      productId: group.productId,
      productName: group.productName,
      color: group.color,
      totalQuantity: group.totalQuantity,
      currentSizes: { ...group.sizeQuantities }
    });
    setIsMatrixEditorOpen(true);
  };

  // Save customized matrix (both to local state & database orderItems)
  const handleSaveMatrix = async (newMap: { [size: string]: number }, applyToDb: boolean) => {
    if (!matrixEditingTarget) return;

    const overrideKey = `${matrixEditingTarget.productId}_${matrixEditingTarget.color.trim().toLowerCase()}`;

    setCustomMatrixOverrides(prev => ({
      ...prev,
      [overrideKey]: newMap
    }));

    if (applyToDb && order?.id) {
      try {
        // Find existing orderItems for this product and color
        const existingItems = await api.orderItems.list({ where: { orderId: order.id } });
        const itemsToRemove = existingItems.filter(i => 
          i.productId === matrixEditingTarget.productId && 
          (!matrixEditingTarget.color || (i.color || '').toLowerCase() === matrixEditingTarget.color.toLowerCase())
        );

        // Insert new size breakdown items
        const unitPrice = itemsToRemove[0]?.unitPrice || productsMap.get(matrixEditingTarget.productId)?.buyingPrice || 0;
        const taxRate = itemsToRemove[0]?.taxRate || 20;

        const newItemsToInsert: Omit<OrderItem, 'id'>[] = Object.entries(newMap).map(([size, qty]) => ({
          orderId: order.id,
          productId: matrixEditingTarget.productId,
          color: matrixEditingTarget.color,
          size: size,
          quantity: qty,
          shippedQuantity: 0,
          unitPrice: unitPrice,
          taxRate: taxRate,
          discountRate: 0,
          total: qty * unitPrice * (1 + taxRate / 100)
        }));

        // Delete existing items and insert new size breakdown atomically
        const ops: Mutation[] = [];
        const idsToDelete = itemsToRemove.map(i => i.id!).filter(Boolean);
        if (idsToDelete.length > 0) {
          ops.push({ op: 'deleteWhere', resource: 'orderItems', where: { id: idsToDelete } });
        }
        if (newItemsToInsert.length > 0) {
          ops.push({ op: 'insertMany', resource: 'orderItems', rows: newItemsToInsert as any });
        }
        if (ops.length > 0) {
          await commit(ops);
        }

        // Refresh order data
        const updatedOrder = await orderService.getOrder(order.id);
        if (updatedOrder) {
          setOrder(updatedOrder);
        }
      } catch (err) {
        console.error('Beden matrisi veritabanına kaydedilirken hata:', err);
      }
    }
  };

  // Generate Email Content
  useEffect(() => {
    if (!order) return;

    const companyTitle = companySettings?.companyTitle || companySettings?.companyName || 'ABC Ayakkabı Sanayi & Ticaret A.Ş.';
    const supplierName = supplier?.name || 'Sayın Tedarikçi';
    const orderNum = order.orderNumber || `SAS-${order.id}`;
    const dateStr = order.date ? new Date(order.date).toLocaleDateString('tr-TR') : new Date().toLocaleDateString('tr-TR');
    const deliveryDateStr = order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('tr-TR') : 'En Kısa Sürede';

    const subject = `[Satın Alma Siparişi] ${orderNum} - ${companyTitle}`;

    let body = `Sayın ${supplierName},\n\n`;
    body += `${companyTitle} olarak tarafınıza açmış olduğumuz ${orderNum} numaralı Satın Alma Siparişimizin detayları aşağıda yer almaktadır.\n\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `📋 SİPARİŞ BİLGİLERİ\n`;
    body += `Sipariş No: ${orderNum}\n`;
    body += `Sipariş Tarihi: ${dateStr}\n`;
    body += `Termin / Teslim Tarihi: ${deliveryDateStr}\n`;
    body += `Teslimat Adresi: ${companySettings?.address || 'Merkez Fabrika Deposu'} ${companySettings?.city ? `(${companySettings.city})` : ''}\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (hasSizedItems) {
      body += `👟 BEDEN & ASORTİ DAĞILIM MATRİSİ\n`;
      body += `───────────────────────────────────────────────────\n`;
      sizedGroups.forEach(g => {
        body += `Ürün: ${g.productName} (Kod: ${g.productCode})\n`;
        body += `Renk: ${g.color} | Kalıp: ${g.moldCode || '-'}\n`;
        body += `Beden Dağılımı:\n`;
        uniqueSizes.forEach(s => {
          const q = g.sizeQuantities[s] || 0;
          if (q > 0) {
            body += `  • No ${s}: ${q.toLocaleString('tr-TR')} ${g.unit}\n`;
          }
        });
        body += `Toplam: ${g.totalQuantity.toLocaleString('tr-TR')} ${g.unit} x ${g.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ = ${g.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n\n`;
      });
    }

    if (nonSizedItems.length > 0) {
      body += `📦 DİĞER HAMMADDE VE MALZEMELER\n`;
      body += `───────────────────────────────────────────────────\n`;
      nonSizedItems.forEach((it, idx) => {
        const qty = Number(it.quantity) || 0;
        const price = Number(it.unitPrice) || 0;
        const total = Number(it.total) || qty * price;
        body += `${idx + 1}. ${it.productName} (${it.productCode}) - ${it.color || 'Standart'}\n`;
        body += `   Miktar: ${qty.toLocaleString('tr-TR')} ${it.unit} x ${price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺ = ${total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
      });
      body += `\n`;
    }

    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    body += `💰 FİNANSAL ÖZET\n`;
    body += `KDV Hariç Matrah: ${(order.totalAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
    body += `Hesaplanan KDV (%20): ${(order.taxAmount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
    body += `GENEL TOPLAM: ${(order.grandTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺\n`;
    body += `Tutar Yazıyla: #${numberToTurkishWords(order.grandTotal || 0)}#\n`;
    body += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    if (customInstructions) {
      body += `⚠️ ÖZEL SİPARİŞ & TESLİMAT TALİMATI:\n`;
      body += `${customInstructions}\n\n`;
    }

    body += `Sipariş teyidinizi ve tahmini sevk gününüzü bildirmenizi rica eder, iyi çalışmalar dileriz.\n\n`;
    body += `Saygılarımızla,\n`;
    body += `${companyTitle}\n`;
    body += `Satınalma & Tedarik Departmanı\n`;
    if (companySettings?.phone) body += `Tel: ${companySettings.phone}\n`;
    if (companySettings?.email) body += `E-Posta: ${companySettings.email}\n`;

    setGeneratedEmail({ subject, body });
  }, [order, supplier, companySettings, sizedGroups, uniqueSizes, nonSizedItems, hasSizedItems, customInstructions]);

  if (!isOpen) return null;

  const isPurchase = (order?.type || 'purchase') === 'purchase';
  const currency = order?.currency || 'TRY';
  const companyTitle = companySettings?.companyTitle || companySettings?.companyName || 'DMR Nexus';
  const companyName = companySettings?.companyName || 'DMR Nexus';

  // Direct Print Handling
  const handlePrint = async () => {
    if (!printContentRef.current) return;
    openPrintWindow(
      printContentRef.current.innerHTML,
      `${order.orderNumber || 'Satinalma_Siparisi'}_Tedarikci_Formu`,
      { title: `${order.orderNumber || 'Satinalma_Siparisi'} - Tedarikçi Sipariş Formu` }
    );
  };

  // PDF Download Handling (Vector Canvas with Color Sanitization)
  const handleDownloadPdf = async () => {
    if (!printContentRef.current || !order) return;
    setDownloadingPdf(true);
    try {
      await downloadElementAsPdf(
        printContentRef.current,
        {
          filename: `${order.orderNumber || 'Satinalma_Siparisi'}_Tedarikci_Formu.pdf`,
          orientation: 'portrait',
          scale: 2.2,
          marginMm: 6,
          backgroundColor: '#ffffff'
        }
      );
    } catch (error) {
      console.error('PDF oluşturma hatası:', error);
      showToast('PDF oluşturulurken bir hata oluştu. Lütfen yazdırma penceresini kullanarak "PDF Olarak Kaydet" seçeneğini deneyin.', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Save updated notes to order in DB
  const handleSaveNotesToDb = async () => {
    if (!order?.id) return;
    setIsSavingNotes(true);
    try {
      await callOp('order-notes', { id: order.id, notes: customInstructions, expectedVersion: order.version });
      setOrder((prev: any) => ({ ...prev, notes: customInstructions, version: Number(prev.version) + 1 }));
      setIsEditingInstructions(false);
    } catch (err) {
      console.error('Not kaydedilemedi:', err);
    } finally {
      setIsSavingNotes(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[96vh]">
        
        {/* ========================================================================= */}
        {/* MODAL CONTROL HEADER (ACTIONS & TABS) */}
        {/* ========================================================================= */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Title & Document Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">
                  Tedarikçi Satınalma Formu & Beden Matrisi
                </h2>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  #{order?.orderNumber || 'SAS-YENİ'}
                </span>
                {supplier && (
                  <span className="text-xs font-semibold text-slate-300 hidden sm:inline-block">
                    • {supplier.name}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                A4 Resmi Sipariş Çıktısı, Beden & Asorti Dağılım Matrisi, PDF ve Tedarikçi E-Posta Gönderimi
              </p>
            </div>
          </div>

          {/* Action Buttons & Template Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Template Selector Tabs */}
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTemplate('official')}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                  activeTemplate === 'official' 
                    ? "bg-indigo-600 text-white shadow-sm" 
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                )}
                title="Resmi Tedarikçi Mektubu ve Sözleşme Şablonu"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Resmi Mektup</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTemplate('matrix_focused')}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                  activeTemplate === 'matrix_focused' 
                    ? "bg-indigo-600 text-white shadow-sm" 
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                )}
                title="Renk & Beden Dağılım Matrisi Odaklı İmalat Şablonu"
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>Asorti / Beden Matrisi</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTemplate('compact')}
                className={cn(
                  "px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5",
                  activeTemplate === 'compact' 
                    ? "bg-indigo-600 text-white shadow-sm" 
                    : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                )}
                title="Kompakt Atölye ve İmalat Fişi"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Atölye Fişi</span>
              </button>
            </div>

            {/* Email Button */}
            <button
              type="button"
              onClick={() => setIsEmailModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Mail Gönder</span>
            </button>

            {/* PDF Button */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloadingPdf ? 'Hazırlanıyor...' : 'PDF İndir'}</span>
            </button>

            {/* Direct Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-black transition-all shadow-sm cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-600" />
              <span>Yazdır (A4)</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* QUICK CUSTOM NOTES & INSTRUCTIONS BANNER */}
        {/* ========================================================================= */}
        <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-bold text-slate-300 shrink-0 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-indigo-400" /> Sipariş Notu / Talimat:
            </span>
            {isEditingInstructions ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Tedarikçiye iletilecek özel teslimat, koli veya kalite talimatı..."
                  className="flex-1 px-2.5 py-1 text-xs bg-slate-900 text-white border border-indigo-500 rounded-lg focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleSaveNotesToDb}
                  disabled={isSavingNotes}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Save className="w-3 h-3" /> Kaydet
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingInstructions(false)}
                  className="px-2 py-1 bg-slate-700 text-slate-200 rounded-lg text-xs font-bold cursor-pointer"
                >
                  İptal
                </button>
              </div>
            ) : (
              <span className="text-slate-300 truncate italic">
                {customInstructions ? `"${customInstructions}"` : 'Özel talimat eklenmemiş (Standart şartlar geçerli)'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {sizedGroups.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenMatrixEditor(sizedGroups[0])}
                className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Sliders className="w-3 h-3 text-indigo-400" />
                <span>Beden Dağılımını Ayarla</span>
              </button>
            )}
            {!isEditingInstructions && (
              <button
                type="button"
                onClick={() => setIsEditingInstructions(true)}
                className="px-2 py-1 text-indigo-400 hover:bg-indigo-950/50 rounded-md text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Edit3 className="w-3 h-3" /> Notu Düzenle
              </button>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* DOCUMENT PREVIEW CONTAINER (SCROLLABLE) */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/60 flex justify-center">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs font-bold text-slate-400">Sipariş formu hazırlanıyor...</p>
            </div>
          ) : !order ? (
            <div className="py-20 text-center text-slate-400">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
              <p className="text-xs font-bold">Sipariş kaydı bulunamadı.</p>
            </div>
          ) : (
            /* PRINTABLE PAPER CANVAS (A4 Ratio: 210mm x 297mm) */
            <div
              ref={printContentRef}
              id="purchase-order-printable-canvas"
              className="w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 shadow-2xl border border-slate-300 p-6 sm:p-8 space-y-4 text-xs select-text box-border"
              style={{
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                color: '#0f172a',
                backgroundColor: '#ffffff'
              }}
            >
              {/* PRINT CSS STYLES */}
              <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                  body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #ffffff !important;
                  }
                  #purchase-order-printable-canvas {
                    width: 100% !important;
                    max-width: 100% !important;
                    min-height: auto !important;
                    border: none !important;
                    box-shadow: none !important;
                    padding: 4mm 6mm !important;
                    margin: 0 !important;
                  }
                  .no-print {
                    display: none !important;
                  }
                }
              `}} />

              {/* ================================================================= */}
              {/* TEMPLATE 1: RESMİ MEKTUP (OFFICIAL LETTER & CONTRACT) */}
              {/* ================================================================= */}
              {activeTemplate === 'official' && (
                <PoTemplateOfficial
                  order={order}
                  supplier={supplier}
                  companySettings={companySettings}
                  companyTitle={companyTitle}
                  companyName={companyName}
                  sizedGroups={sizedGroups}
                  uniqueSizes={uniqueSizes}
                  nonSizedItems={nonSizedItems}
                  hasSizedItems={hasSizedItems}
                  totalSizedQuantity={totalSizedQuantity}
                  sizeColumnTotals={sizeColumnTotals}
                  currency={currency}
                  customInstructions={customInstructions}
                />
              )}

              {/* ================================================================= */}
              {/* TEMPLATE 2: ASORTİ / BEDEN MATRİSİ ODAKLI İMALAT FORMU */}
              {/* ================================================================= */}
              {activeTemplate === 'matrix_focused' && (
                <PoTemplateMatrix
                  order={order}
                  supplier={supplier}
                  companyTitle={companyTitle}
                  sizedGroups={sizedGroups}
                  uniqueSizes={uniqueSizes}
                  hasSizedItems={hasSizedItems}
                  totalSizedQuantity={totalSizedQuantity}
                />
              )}

              {/* ================================================================= */}
              {/* TEMPLATE 3: ATÖLYE FİŞİ (COMPACT WORKSHOP RECEIPT) */}
              {/* ================================================================= */}
              {activeTemplate === 'compact' && (
                <PoTemplateCompact
                  order={order}
                  supplier={supplier}
                  sizedGroups={sizedGroups}
                  uniqueSizes={uniqueSizes}
                  hasSizedItems={hasSizedItems}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: BEDEN / ASORTİ DAĞILIMINI DÜZENLEME & ŞABLON SEÇME */}
      {/* ========================================================================= */}
      {isMatrixEditorOpen && matrixEditingTarget && (
        <PoMatrixEditorModal
          target={matrixEditingTarget}
          assortmentTemplates={assortmentTemplates}
          onClose={() => setIsMatrixEditorOpen(false)}
          onSave={handleSaveMatrix}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: TEDARİKÇİYE E-POSTA GÖNDERME */}
      {/* ========================================================================= */}
      {isEmailModalOpen && (
        <PoEmailModal
          initialSubject={generatedEmail.subject}
          initialBody={generatedEmail.body}
          initialRecipient={emailRecipient}
          onClose={() => setIsEmailModalOpen(false)}
        />
      )}
    </div>
  );
}
