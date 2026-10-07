import React from 'react';
import { api } from '../api/client';
import { useApiQuery } from '../hooks/useApiQuery';
import { showToast, confirmDialog } from '../lib/feedback';
import {
  Play,
  CheckCircle2,
  Clock,
  Plus,
  Settings2,
  Scissors,
  Printer,
  Hammer,
  Sparkles,
  PackageCheck,
  Barcode,
  Search,
  AlertTriangle,
  Layers,
  ArrowRight,
  RefreshCw,
  ShoppingCart,
  FileText,
  FileSpreadsheet,
  Calendar,
  User,
  Check,
  Filter,
  CheckCircle,
  HelpCircle,
  AlertCircle,
  ExternalLink,
  BarChart3,
  Camera,
  Copy,
  Truck,
  Factory,
  LayoutGrid,
  Table2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import PageHeader from './PageHeader';
import { productionService, PRODUCTION_STAGES_CONFIG } from '../services/productionService';
import {  } from '../lib/inventoryCalculator';
import DetailedWorkOrderCardModal from './Production/DetailedWorkOrderCardModal';
import ProductionRefakatKartiModal from './Production/ProductionRefakatKartiModal';
import BomConsumptionModal from './Production/BomConsumptionModal';
import StageTransitionModal from './Production/StageTransitionModal';
import WorkOrderTicketModal from './Production/WorkOrderTicketModal';
import AddWorkOrderModal from './Production/AddWorkOrderModal';
import { RecipeModal } from './Production/RecipeModal';
import CameraBarcodeScannerModal, { type ScannerMode } from './Common/CameraBarcodeScannerModal';
import DataGrid, { GridColumn, StatusPill } from './Common/DataGrid';
import { PurchaseOrderPrintModal } from './Orders/PurchaseOrderPrintModal';
import ProductionReport from './Reports/ProductionReport';
import BarcodeTerminalTab from './Production/BarcodeTerminalTab';
import MrpTab from './Production/MrpTab';
import MrpPurchaseOrderModal from './Production/MrpPurchaseOrderModal';
import { getMrpKey } from './Production/mrpUtils';
import type { 
  WorkOrder, 
  ProductionStage, 
  Product, 
  Recipe, 
  RecipeIngredient,
  MrpCalculationResult, 
  Order, 
  OrderItem,
  MaterialReadinessStatus 
} from '../types';

type ProductionTab = 'pipeline' | 'orders_pool' | 'mrp' | 'barcode_terminal' | 'recipes' | 'reports';

export default function Production() {
  const workOrders = useApiQuery(() => api.workOrders.list({ orderBy: 'id', orderDir: 'desc' }), [], ['workOrders']);
  const products = useApiQuery(() => api.products.list(), [], ['products']);
  const recipes = useApiQuery(() => api.recipes.list(), [], ['recipes']);
  const orders = useApiQuery(() => api.orders.list({ where: { type: 'sales' }, orderBy: 'id', orderDir: 'desc' }), [], ['orders']);
  const orderItems = useApiQuery(() => api.orderItems.list(), [], ['orderItems']);
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);

  const [activeTab, setActiveTab] = React.useState<ProductionTab>('pipeline');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [stageFilter, setStageFilter] = React.useState<string>('all');
  const [pipelineView, setPipelineView] = React.useState<'cards' | 'grid'>(() =>
    (localStorage.getItem('proerp-production-view') as 'cards' | 'grid') || 'cards'
  );
  const changePipelineView = (v: 'cards' | 'grid') => {
    setPipelineView(v);
    localStorage.setItem('proerp-production-view', v);
  };
  const [selectedWorkOrder, setSelectedWorkOrder] = React.useState<WorkOrder | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = React.useState(false);
  const [isTicketModalOpen, setIsTicketModalOpen] = React.useState(false);
  const [ticketWorkOrder, setTicketWorkOrder] = React.useState<WorkOrder | null>(null);
  const [isDetailedSheetModalOpen, setIsDetailedSheetModalOpen] = React.useState(false);
  const [detailedSheetWorkOrder, setDetailedSheetWorkOrder] = React.useState<WorkOrder | null>(null);
  const [isStageTransitionModalOpen, setIsStageTransitionModalOpen] = React.useState(false);
  const [stageTransitionInitialStage, setStageTransitionInitialStage] = React.useState<ProductionStage>('cutting');

  // 1. Üretim Refakat Kartı (İş Emri Fişi) Modal State
  const [isRefakatKartiModalOpen, setIsRefakatKartiModalOpen] = React.useState(false);
  const [refakatWorkOrder, setRefakatWorkOrder] = React.useState<WorkOrder | null>(null);

  // 2. Kamera ile Canlı Barkod / Karekod Okuyucu State
  const [isCameraScannerOpen, setIsCameraScannerOpen] = React.useState(false);
  const [cameraScannerInitialMode, setCameraScannerInitialMode] = React.useState<ScannerMode>('production_wo');
  const [cameraScannerInitialCode, setCameraScannerInitialCode] = React.useState('');

  // 3. BOM (Ürün Reçetesi) & Otomatik Sarfiyat Düşümü State
  const [isBomConsumptionModalOpen, setIsBomConsumptionModalOpen] = React.useState(false);
  const [bomSelectedProductId, setBomSelectedProductId] = React.useState<number | undefined>(undefined);

  const openRefakatKarti = (wo: WorkOrder) => {
    setRefakatWorkOrder(wo);
    setIsRefakatKartiModalOpen(true);
  };

  const handleOpenScanner = (mode: ScannerMode = 'production_wo', initialCode: string = '') => {
    setCameraScannerInitialMode(mode);
    setCameraScannerInitialCode(initialCode);
    setIsCameraScannerOpen(true);
  };

  const handleOpenBomModal = (productId?: number) => {
    setBomSelectedProductId(productId);
    setIsBomConsumptionModalOpen(true);
  };

  // Recipe Modal State
  const [selectedProductId, setSelectedProductId] = React.useState<number>(0);
  const [selectedRecipeTargetColor, setSelectedRecipeTargetColor] = React.useState<string>('all');

  // MRP State
  const [mrpResult, setMrpResult] = React.useState<MrpCalculationResult | null>(null);
  const [isMrpCalculating, setIsMrpCalculating] = React.useState(false);
  const [selectedMrpKeys, setSelectedMrpKeys] = React.useState<string[]>([]);
  const [expandedMatrixKeys, setExpandedMatrixKeys] = React.useState<string[]>([]);
  const [isPurchaseOrderModalOpen, setIsPurchaseOrderModalOpen] = React.useState(false);
  const [isPoPrintModalOpen, setIsPoPrintModalOpen] = React.useState(false);
  const [printPoId, setPrintPoId] = React.useState<number | null>(null);

  const [mrpWoFilter, setMrpWoFilter] = React.useState<string>('all');

  // Helper Maps
  const productMap = React.useMemo(() => new Map((products || []).map(p => [p.id!, p])), [products]);
  const recipeMap = React.useMemo(() => new Map((recipes || []).map(r => [r.productId, r])), [recipes]);

  // Run initial MRP calculation when tab opens or on demand
  const handleCalculateMRP = async (targetIds?: number[]) => {
    setIsMrpCalculating(true);
    try {
      const result = await productionService.calculateMRP(targetIds);
      setMrpResult(result);
      // Select all shortage items by default
      const shortageKeys = result.items.filter(i => i.status === 'shortage').map(i => getMrpKey(i));
      setSelectedMrpKeys(shortageKeys);
    } catch (err: any) {
      showToast(`MRP Hesaplama Hatası: ${err.message}`, 'error');
    } finally {
      setIsMrpCalculating(false);
    }
  };

  // Auto calculate MRP once data is loaded if null
  React.useEffect(() => {
    if (workOrders && products && recipes && !mrpResult) {
      handleCalculateMRP();
    }
  }, [workOrders?.length, products?.length, recipes?.length]);

  // Filtered Work Orders for Pipeline
  const filteredWorkOrders = React.useMemo(() => {
    if (!workOrders) return [];
    return workOrders.filter(wo => {
      const prod = productMap.get(wo.productId);
      const matchesSearch = 
        wo.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (prod?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (prod?.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (wo.orderNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (wo.customerName || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStage = stageFilter === 'all' || wo.currentStage === stageFilter;
      return matchesSearch && matchesStage;
    });
  }, [workOrders, searchTerm, stageFilter, productMap]);

  // Filter Sales Orders for Pool
  const pendingSalesOrders = React.useMemo(() => {
    if (!orders || !orderItems) return [];
    return orders.filter(o => o.status !== 'cancelled').map(order => {
      const items = orderItems.filter(i => i.orderId === order.id);
      const existingWOs = workOrders?.filter(w => w.orderId === order.id) || [];
      const contact = contacts?.find(c => c.id === order.contactId);
      return {
        ...order,
        contactName: contact?.name || 'Müşteri',
        items,
        workOrderCount: existingWOs.length,
        hasMissingWorkOrders: items.some(item => {
          const prod = productMap.get(item.productId);
          if (!prod || prod.isRawMaterial) return false;
          return !existingWOs.some(w => w.orderItemId === item.id);
        })
      };
    });
  }, [orders, orderItems, workOrders, contacts, productMap]);

  // Orders Pool DataGrid columns
  const ordersPoolColumns = React.useMemo<GridColumn<(typeof pendingSalesOrders)[number]>[]>(() => [
    {
      key: 'orderNumber', title: 'Sipariş No',
      render: (order) => (
        <div>
          <div className="text-sm font-black text-slate-900 dark:text-slate-100">{order.orderNumber}</div>
          <span className="text-[9px] font-bold text-slate-400 uppercase">Satış Siparişi</span>
        </div>
      ),
      filterValue: (order) => order.orderNumber || '',
    },
    {
      key: 'contactName', title: 'Müşteri / Cari',
      render: (order) => <div className="text-xs font-black text-slate-800 dark:text-slate-200">{order.contactName}</div>,
      filterValue: (order) => order.contactName || '',
    },
    {
      key: 'date', title: 'Sipariş & Termin Tarihi', width: 'w-44',
      render: (order) => (
        <div>
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {new Date(order.date).toLocaleDateString('tr-TR')}
          </div>
          {order.deliveryDate && (
            <div className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Termin: {new Date(order.deliveryDate).toLocaleDateString('tr-TR')}
            </div>
          )}
        </div>
      ),
      filterValue: (order) => `${new Date(order.date).toLocaleDateString('tr-TR')} ${order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString('tr-TR') : ''}`,
    },
    {
      key: 'items', title: 'Ürün Kalemleri',
      render: (order) => (
        <div className="space-y-1">
          {order.items.map((item, idx) => {
            const prod = productMap.get(item.productId);
            const hasRecipe = recipeMap.has(item.productId);
            return (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200">{prod?.name || 'Ürün'}</span>
                <span className="text-slate-400 font-medium">({item.quantity} Adet)</span>
                {!hasRecipe && (
                  <button
                    type="button"
                    onClick={() => openRecipeModalForProduct(item.productId)}
                    className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded hover:bg-amber-100"
                  >
                    + Reçete Yaz
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ),
      filterValue: (order) => order.items.map(item => `${productMap.get(item.productId)?.name || ''} ${item.quantity}`).join(' '),
    },
    {
      key: 'hasMissingWorkOrders', title: 'Üretim Durumu', width: 'w-56',
      render: (order) => order.hasMissingWorkOrders ? (
        <StatusPill tone="amber" className="text-[9px] uppercase"><Clock className="w-3 h-3" /> Plana Alınmayı Bekliyor</StatusPill>
      ) : (
        <StatusPill tone="green" className="text-[9px] uppercase"><CheckCircle2 className="w-3 h-3" /> Üretim Planında ({order.workOrderCount} İş Emri)</StatusPill>
      ),
      filterValue: (order) => order.hasMissingWorkOrders ? 'Plana Alınmayı Bekliyor' : 'Üretim Planında',
    },
  ], [productMap, recipeMap]);

  // Stage Helpers
  const getStageInfo = (stageId: ProductionStage) => {
    return PRODUCTION_STAGES_CONFIG.find(s => s.id === stageId) || PRODUCTION_STAGES_CONFIG[0];
  };

  const getStageIcon = (stageId: ProductionStage) => {
    switch (stageId) {
      case 'planning': return FileText;
      case 'cutting': return Scissors;
      case 'printing': return Printer;
      case 'sewing': return Layers;
      case 'assembly': return Hammer;
      case 'finishing': return Sparkles;
      case 'quality_packing': return PackageCheck;
      case 'completed': return CheckCircle2;
      default: return Clock;
    }
  };

  const openRecipeModalForProduct = (productId: number, targetColor?: string) => {
    setSelectedProductId(productId);
    const prod = productMap.get(productId);
    const colorToUse = targetColor || (prod?.colors && prod.colors.length > 0 ? prod.colors[0] : 'all');
    setSelectedRecipeTargetColor(colorToUse);
    setIsRecipeModalOpen(true);
  };

  const handleDeleteRecipe = async (recipeId: number) => {
    if (await confirmDialog('Bu reçeteyi silmek istediğinize emin misiniz?', { confirmText: 'Sil' })) {
      await productionService.deleteRecipe(recipeId);
      handleCalculateMRP();
    }
  };

  // Convert Sales Order to Work Orders
  const handleTransferOrderToProduction = async (orderId: number) => {
    try {
      const createdIds = await productionService.createWorkOrdersFromOrder(orderId);
      if (createdIds.length > 0) {
        showToast(`${createdIds.length} adet ürün kalemi başarıyla üretim planına alındı ve barkodları oluşturuldu.`, 'success');
        handleCalculateMRP();
      } else {
        showToast('Bu siparişteki tüm kalemler zaten üretim planına alınmış.', 'info');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Stage Advancement Handler
  const handleOpenStageTransition = (wo: WorkOrder, target?: ProductionStage) => {
    setSelectedWorkOrder(wo);
    const stagesList: ProductionStage[] = ['planning', 'cutting', 'printing', 'sewing', 'assembly', 'finishing', 'quality_packing', 'completed'];
    const currIdx = stagesList.indexOf(wo.currentStage);
    const defaultNext = target || (currIdx < stagesList.length - 1 ? stagesList[currIdx + 1] : 'completed');
    setStageTransitionInitialStage(defaultNext);
    setIsStageTransitionModalOpen(true);
  };

  // Open MRP Purchase Order Modal (supplier mapping is initialized inside the modal)
  const handleOpenPurchaseOrderModal = () => {
    if (!mrpResult) return;
    // Auto-select shortage items only
    const shortageKeys = mrpResult.items
      .filter(i => i.status === 'shortage' && i.shortageQuantity > 0)
      .map(i => getMrpKey(i));
    setSelectedMrpKeys(shortageKeys);
    setIsPurchaseOrderModalOpen(true);
  };

  // Print Work Order Ticket Modal trigger
  const openTicketModal = (wo: WorkOrder) => {
    setTicketWorkOrder(wo);
    setIsTicketModalOpen(true);
  };

  // Open Full A4 Detailed Work Order & Cutting Card Modal
  const openDetailedWorkOrderSheet = (wo: WorkOrder) => {
    setDetailedSheetWorkOrder(wo);
    setIsDetailedSheetModalOpen(true);
  };

  const handleSaveDetailedWorkOrder = async (updatedFields: Partial<WorkOrder>) => {
    if (!detailedSheetWorkOrder?.id) return;
    try {
      await api.workOrders.update(detailedSheetWorkOrder.id, updatedFields);
      setDetailedSheetWorkOrder({ ...detailedSheetWorkOrder, ...updatedFields });
    } catch (err: any) {
      console.error("İş emri güncellenirken hata:", err);
    }
  };

  // Material Status Pill
  const renderMaterialStatusBadge = (status?: MaterialReadinessStatus, productId?: number) => {
    switch (status) {
      case 'materials_ready':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3 h-3" /> Malzeme Hazır
          </span>
        );
      case 'po_created':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
            <Truck className="w-3 h-3" /> Sipariş Açıldı (Yolda)
          </span>
        );
      case 'materials_shortage':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
            <AlertTriangle className="w-3 h-3" /> Hammadde Eksik
          </span>
        );
      case 'materials_consumed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
            <Check className="w-3 h-3" /> Malzeme Harcandı
          </span>
        );
      case 'no_recipe':
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (productId) openRecipeModalForProduct(productId);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 transition-colors"
          >
            <AlertCircle className="w-3 h-3" /> Reçete Tanımla
          </button>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-200">
            <HelpCircle className="w-3 h-3" /> MRP Bekleniyor
          </span>
        );
    }
  };

  // Pipeline grid (tablo) görünümü kolonları
  const woColumns = React.useMemo<GridColumn<WorkOrder>[]>(() => [
    { key: 'barcode', title: 'İş Emri', width: '110px' },
    {
      key: 'product', title: 'Model',
      render: (wo) => {
        const p = productMap.get(wo.productId);
        return (
          <div className="min-w-0">
            <div className="text-xs font-bold truncate">{p?.name || '-'}</div>
            <div className="text-[10px] text-slate-400 truncate">{p?.code || ''}</div>
          </div>
        );
      },
      filterValue: (wo) => `${productMap.get(wo.productId)?.name || ''} ${productMap.get(wo.productId)?.code || ''}`,
      sortValue: (wo) => productMap.get(wo.productId)?.name || '',
    },
    {
      key: 'variant', title: 'Renk / Beden',
      render: (wo) => <span className="text-xs">{[wo.color, wo.size].filter(Boolean).join(' / ') || '-'}</span>,
      filterValue: (wo) => `${wo.color || ''} ${wo.size || ''}`,
    },
    { key: 'quantity', title: 'Miktar', align: 'right', width: '80px', render: (wo) => <span className="text-xs font-bold tabular-nums">{wo.quantity}</span> },
    { key: 'orderNumber', title: 'Sipariş', render: (wo) => <span className="text-xs">{wo.orderNumber || '-'}</span> },
    { key: 'customerName', title: 'Cari', render: (wo) => <span className="text-xs truncate">{wo.customerName || '-'}</span> },
    {
      key: 'currentStage', title: 'Aşama',
      render: (wo) => <StatusPill tone="blue" className="text-[10px] uppercase">{getStageInfo(wo.currentStage).shortLabel}</StatusPill>,
      sortValue: (wo) => wo.currentStage,
      filterValue: (wo) => getStageInfo(wo.currentStage).label,
    },
    {
      key: 'status', title: 'Durum',
      render: (wo) => (
        <StatusPill tone={wo.status === 'completed' ? 'green' : wo.status === 'cancelled' ? 'red' : wo.status === 'in_progress' ? 'amber' : 'slate'} className="text-[10px] uppercase">
          {wo.status === 'completed' ? 'Tamamlandı' : wo.status === 'cancelled' ? 'İptal' : wo.status === 'in_progress' ? 'Sürüyor' : 'Bekliyor'}
        </StatusPill>
      ),
      filterValue: (wo) => wo.status,
    },
    {
      key: 'materialStatus', title: 'Malzeme',
      render: (wo) => renderMaterialStatusBadge(wo.materialStatus, wo.productId),
      filterValue: (wo) => wo.materialStatus || '',
    },
    {
      key: 'targetDate', title: 'Termin', width: '100px',
      render: (wo) => <span className="text-xs tabular-nums">{wo.targetDate ? new Date(wo.targetDate).toLocaleDateString('tr-TR') : '-'}</span>,
      sortValue: (wo) => (wo.targetDate ? new Date(wo.targetDate).getTime() : 0),
    },
  ], [productMap]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Üretim Planlama & Proses Takibi"
        subtitle="Siparişten imalata, otomatik ürün reçeteleri (BoM), MRP ve 8 kademeli barkodlu istasyonlar"
        badge="Üretim Takibi"
        icon={Factory}
        iconColor="amber"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenScanner('production_wo')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer"
              title="Kamera ile Canlı Barkod/Karekod Okut (Stok Sayımı, Mal Kabul, İrsaliye, İş Emri)"
            >
              <Camera className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Kamera ile Canlı Oku</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenBomModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer"
              title="Bir çift ayakkabı için deri, taban, astar ve bağcık otomatik sarfiyat düşümü"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Otomatik BOM Sarfiyatı</span>
            </button>

            <button
              onClick={() => handleCalculateMRP()}
              disabled={isMrpCalculating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 dark:bg-slate-800/50 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-indigo-600", isMrpCalculating && "animate-spin")} />
              <span>{isMrpCalculating ? "Hesaplanıyor..." : "MRP İhtiyaç Hesapla"}</span>
            </button>

            <button
              onClick={() => setIsRecipeModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 dark:bg-slate-800/50 transition-colors shadow-xs cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Reçeteler (BoM)</span>
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni İş Emri</span>
            </button>
          </div>
        }
      />

      {/* Quick Stat Highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Aktif İş Emirleri</span>
            <span className="text-xl font-black text-slate-900 dark:text-slate-100">
              {workOrders?.filter(w => w.status !== 'completed' && w.status !== 'cancelled').length || 0}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Sipariş Havuzu</span>
            <span className="text-xl font-black text-amber-600">
              {pendingSalesOrders.filter(o => o.hasMissingWorkOrders).length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Eksik Hammadde</span>
            <span className={cn(
              "text-xl font-black",
              (mrpResult?.shortageItemsCount || 0) > 0 ? "text-rose-600" : "text-emerald-600"
            )}>
              {mrpResult?.shortageItemsCount || 0} Kalem
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Tamamlanan İmalat</span>
            <span className="text-xl font-black text-emerald-600">
              {workOrders?.filter(w => w.status === 'completed').length || 0}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="col-span-2 sm:col-span-4 lg:col-span-1 bg-gradient-to-br from-slate-900 to-indigo-950 p-4 rounded-2xl shadow-sm text-white flex items-center justify-between">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-300 block">Barkod İstasyonu</span>
            <button
              onClick={() => setActiveTab('barcode_terminal')}
              className="text-xs font-black text-white hover:text-indigo-200 uppercase flex items-center gap-1 mt-1 underline decoration-indigo-400 underline-offset-4"
            >
              Terminali Aç <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900/10 text-white flex items-center justify-center">
            <Barcode className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Tab Navigation Bar */}
      <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'pipeline'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
            )}
          >
            <Layers className="w-4 h-4 text-indigo-400" />
            1. Üretim Proses Hattı & Takip
          </button>

          <button
            onClick={() => setActiveTab('orders_pool')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'orders_pool'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
            )}
          >
            <ShoppingCart className="w-4 h-4 text-amber-400" />
            2. Bekleyen Sipariş Havuzu
            {pendingSalesOrders.filter(o => o.hasMissingWorkOrders).length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('mrp')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'mrp'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
            )}
          >
            <RefreshCw className="w-4 h-4 text-rose-400" />
            3. Malzeme İhtiyaç Planlama (MRP)
            {(mrpResult?.shortageItemsCount || 0) > 0 && (
              <span className="px-1.5 py-0.2 text-[9px] font-black bg-rose-500 text-white rounded-md">
                {mrpResult?.shortageItemsCount} Eksik
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('barcode_terminal')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'barcode_terminal'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
            )}
          >
            <Barcode className="w-4 h-4 text-emerald-400" />
            4. Barkodlu İstasyon Terminali
          </button>

          <button
            onClick={() => setActiveTab('recipes')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'recipes'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
            )}
          >
            <Settings2 className="w-4 h-4 text-sky-400" />
            5. Reçeteler (BoM)
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'reports'
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
            )}
          >
            <BarChart3 className="w-4 h-4 text-purple-400" />
            6. Üretim & Hat Raporları
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/reports?tab=production"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
          >
            <span>Raporlar Merkezi</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        {activeTab === 'pipeline' && (
          <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="İş emri, barkod, model ara..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <select
              value={stageFilter}
              onChange={e => setStageFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="all">Tüm Aşamalar</option>
              {PRODUCTION_STAGES_CONFIG.map(st => (
                <option key={st.id} value={st.id}>{st.label}</option>
              ))}
            </select>
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
              <button
                type="button"
                onClick={() => changePipelineView('cards')}
                title="Kart görünümü"
                aria-label="Kart görünümü"
                className={cn(
                  'px-2.5 py-1.5 transition-colors',
                  pipelineView === 'cards'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                )}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => changePipelineView('grid')}
                title="Grid (tablo) görünümü"
                aria-label="Grid görünümü"
                className={cn(
                  'px-2.5 py-1.5 transition-colors',
                  pipelineView === 'grid'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                )}
              >
                <Table2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: PRODUCTION PIPELINE & STAGES */}
      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          {/* Horizontal Stage Stepper / Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {PRODUCTION_STAGES_CONFIG.map(stage => {
              const count = workOrders?.filter(w => w.currentStage === stage.id && w.status !== 'cancelled').length || 0;
              const StageIcon = getStageIcon(stage.id);
              const isActive = stageFilter === stage.id;
              return (
                <button
                  key={stage.id}
                  onClick={() => setStageFilter(isActive ? 'all' : stage.id)}
                  className={cn(
                    "p-3 rounded-2xl border text-left transition-all relative overflow-hidden",
                    isActive
                      ? "bg-indigo-900 text-white border-indigo-900 shadow-md ring-2 ring-indigo-400"
                      : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <StageIcon className={cn("w-4 h-4", isActive ? "text-indigo-300" : "text-slate-400")} />
                    <span className={cn(
                      "text-xs font-black px-1.5 py-0.5 rounded-md",
                      isActive ? "bg-white dark:bg-slate-900/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                    )}>
                      {count}
                    </span>
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-tight truncate">{stage.shortLabel}</div>
                  <div className="text-[8px] opacity-70 truncate">{stage.description}</div>
                </button>
              );
            })}
          </div>

          {/* Work Order Grid (tablo) görünümü */}
          {pipelineView === 'grid' && (
            <DataGrid<WorkOrder>
              columns={woColumns}
              data={filteredWorkOrders}
              rowKey="id"
              density="compact"
              onRowClick={(wo) => openDetailedWorkOrderSheet(wo)}
              emptyMessage="Seçili filtreye uygun aktif iş emri yok."
            />
          )}

          {/* Work Order Cards Grid */}
          {pipelineView === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredWorkOrders.length === 0 ? (
              <div className="col-span-full bg-white dark:bg-slate-900 rounded-3xl p-16 border border-slate-200 dark:border-slate-700 text-center space-y-3">
                <Layers className="w-12 h-12 mx-auto text-slate-300" />
                <h4 className="text-base font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">Kayıtlı İş Emri Bulunamadı</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Seçili filtreye uygun aktif iş emri yok. Satış Siparişleri Havuzundan siparişleri üretime alabilir veya yukarıdan yeni iş emri açabilirsiniz.
                </p>
              </div>
            ) : (
              filteredWorkOrders.map(wo => {
                const product = productMap.get(wo.productId);
                const stageInfo = getStageInfo(wo.currentStage);
                const StageIcon = getStageIcon(wo.currentStage);

                return (
                  <div
                    key={wo.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-3 group relative overflow-hidden"
                  >
                    {/* Top Stage & Barcode Row */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 border",
                          stageInfo.color
                        )}>
                          <StageIcon className="w-3 h-3" />
                          {stageInfo.shortLabel}
                        </span>
                      </div>

                      <span className="font-mono text-[10px] font-black text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                        {wo.barcode}
                      </span>
                    </div>

                    {/* Product & Order Details */}
                    <div className="space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {product?.code || 'KODSUZ'}
                          </div>
                          <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                            {product?.name || 'Bilinmeyen Ürün'}
                          </h4>
                        </div>
                        {product?.image && (
                          <img 
                            src={product.image} 
                            alt="" 
                            className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0" 
                          />
                        )}
                      </div>

                      {/* Variant & Order info */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        {wo.color && (
                          <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded font-bold uppercase">
                            Renk: {wo.color}
                          </span>
                        )}
                        {wo.size && (
                          <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded font-bold uppercase">
                            Beden: {wo.size}
                          </span>
                        )}
                        {wo.orderNumber && (
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase">
                            Sip: {wo.orderNumber}
                          </span>
                        )}
                      </div>

                      {wo.customerName && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          {wo.customerName}
                        </div>
                      )}
                    </div>

                    {/* Quantity & Material Status */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase">Miktar</div>
                        <div className="text-base font-black text-slate-900 dark:text-slate-100">{wo.quantity} <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Adet/Çift</span></div>
                      </div>

                      <div className="text-right">
                        {renderMaterialStatusBadge(wo.materialStatus, wo.productId)}
                      </div>
                    </div>

                    {/* Progress Bar (8 Stages) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[8px] font-black uppercase text-slate-400">
                        <span>İlerleme: {stageInfo.order} / 8</span>
                        <span>{Math.round((stageInfo.order / 8) * 100)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                        <div 
                          className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                          style={{ width: `${(stageInfo.order / 8) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openRefakatKarti(wo)}
                        className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-black transition-all flex items-center justify-center shrink-0 shadow-xs cursor-pointer"
                        title="Üretim Refakat Kartı (Kesim ➔ Dikim ➔ Montaj ➔ Finisaj Takip ve Onay Kutucuklu Fiş)"
                      >
                        <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenBomModal(wo.productId)}
                        className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-black transition-all flex items-center justify-center shrink-0 shadow-xs cursor-pointer"
                        title="BOM Reçete Sarfiyatını İncele ve Otomatik Düş"
                      >
                        <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openDetailedWorkOrderSheet(wo)}
                        className="p-2 rounded-xl bg-amber-100 hover:bg-amber-400 text-amber-950 text-xs font-black transition-all flex items-center justify-center shrink-0 shadow-xs"
                        title="Detaylı A4 Üretim & Kesim Kartelasını Görüntüle / Yazdır"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-amber-800" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openTicketModal(wo)}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all flex items-center justify-center shrink-0"
                        title="İş Emri & Barkod Ref Kartı"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      {wo.status !== 'completed' ? (
                        <button
                          type="button"
                          onClick={() => handleOpenStageTransition(wo)}
                          className="flex-1 py-2 px-3 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-xs"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Sonraki Aşamaya Geç
                        </button>
                      ) : (
                        <div className="flex-1 py-2 px-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-wider text-center flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Üretim Bitti
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          )}
        </div>
      )}

      {/* TAB 2: SALES ORDERS POOL (SİPARİŞTEN ÜRETİME HAVUZ) */}
      {activeTab === 'orders_pool' && (
        <div className="space-y-4">
          <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <h4 className="text-sm font-black text-amber-900 uppercase">Satış Siparişleri & Üretim Entegrasyonu</h4>
                <p className="text-xs text-amber-700 font-medium">
                  Alınan ve onaylanan tüm satış siparişleri buraya düşer. Tek tuşla tüm kalemler için üretim iş emirleri ve proses barkodları oluşturabilirsiniz.
                </p>
              </div>
            </div>
          </div>

          <DataGrid
            columns={ordersPoolColumns}
            data={pendingSalesOrders}
            rowKey="id"
            emptyMessage="Kayıtlı satış siparişi bulunamadı."
            rowActions={(order) => (
              <button
                type="button"
                onClick={() => handleTransferOrderToProduction(order.id!)}
                className="px-4 py-2 bg-indigo-600 hover:bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-xs whitespace-nowrap"
              >
                ⚡ Üretim Planına Al
              </button>
            )}
          />
        </div>
      )}

      {/* TAB 3: MRP (MALZEME İHTİYAÇ PLANLAMASI) */}
      {activeTab === 'mrp' && (
        <MrpTab
          mrpResult={mrpResult}
          isMrpCalculating={isMrpCalculating}
          selectedMrpKeys={selectedMrpKeys}
          setSelectedMrpKeys={setSelectedMrpKeys}
          expandedMatrixKeys={expandedMatrixKeys}
          setExpandedMatrixKeys={setExpandedMatrixKeys}
          mrpWoFilter={mrpWoFilter}
          setMrpWoFilter={setMrpWoFilter}
          workOrders={workOrders}
          productMap={productMap}
          onCalculate={handleCalculateMRP}
          onOpenPurchaseOrderModal={handleOpenPurchaseOrderModal}
        />
      )}

      {/* TAB 4: BARCODE OPERATOR TERMINAL */}
      {activeTab === 'barcode_terminal' && (
        <BarcodeTerminalTab
          onScanSuccess={handleCalculateMRP}
          onOpenCameraScanner={() => handleOpenScanner('production_wo')}
        />
      )}

      {/* TAB 5: RECIPES (BoM) MANAGEMENT */}
      {activeTab === 'recipes' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Ürün Reçeteleri & Varyant BoM Yönetimi</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                1 adet veya 1 çift mamul üretimi için gereken hammadde, yarı mamul (taban, mostra vb.), aksesuar ve sarfiyat reçeteleri. Renk bazlı (örn: 2045 Siyah için 126 Taban Siyah) ve asorti matris eşlemeli tanımlanabilir.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                const finishedProds = products?.filter(p => p.categoryType === 'finished' || (!p.categoryType && !p.isRawMaterial && p.categoryType !== 'semi_finished' && p.categoryType !== 'accessory')) || [];
                const firstId = finishedProds[0]?.id || 0;
                openRecipeModalForProduct(firstId, 'all');
              }}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-xs shrink-0"
            >
              <Plus className="w-4 h-4" /> Yeni Reçete Tanımla
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {products?.filter(p => p.categoryType === 'finished' || (!p.categoryType && !p.isRawMaterial && p.categoryType !== 'semi_finished' && p.categoryType !== 'accessory')).map(prod => {
              const allProdRecipes = recipes?.filter(r => r.productId === prod.id) || [];
              const hasGenericRecipe = allProdRecipes.some(r => !r.targetColor || r.targetColor === 'all');

              return (
                <div key={prod.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4 flex flex-col justify-between hover:border-slate-300 transition-all">
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="text-[10px] font-mono font-black text-slate-400 uppercase tracking-widest">{prod.code}</span>
                      <div className="flex items-center gap-1.5">
                        {allProdRecipes.length > 0 ? (
                          <span className="text-[9px] font-black bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            {allProdRecipes.length} Reçete Tanımlı
                          </span>
                        ) : (
                          <span className="text-[9px] font-black bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200">
                            Reçete Yok
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-base font-black text-slate-900 dark:text-slate-100 line-clamp-1">{prod.name}</h4>
                      {prod.brand && <p className="text-[11px] font-bold text-slate-400">{prod.brand} {prod.subType ? `• ${prod.subType}` : ''}</p>}
                    </div>

                    {/* Color Pills & Status */}
                    {prod.colors && prod.colors.length > 0 && (
                      <div className="space-y-1 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Model Renk Varyantları:</div>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {prod.colors.map(col => {
                            const colorRecipe = allProdRecipes.find(r => r.targetColor === col);
                            return (
                              <button
                                key={col}
                                type="button"
                                onClick={() => openRecipeModalForProduct(prod.id!, col)}
                                className={cn(
                                  "text-[10px] font-black px-2.5 py-1 rounded-lg border flex items-center gap-1.5 transition-all",
                                  colorRecipe
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                                    : hasGenericRecipe
                                    ? "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100"
                                    : "bg-white dark:bg-slate-900 text-slate-600 border-slate-200 dark:border-slate-700 hover:border-indigo-300"
                                )}
                              >
                                <span>{col}</span>
                                {colorRecipe ? (
                                  <span className="text-[8px] bg-emerald-200 text-emerald-900 px-1 rounded font-black">Özel</span>
                                ) : hasGenericRecipe ? (
                                  <span className="text-[8px] bg-sky-200 text-sky-900 px-1 rounded font-black">Genel</span>
                                ) : (
                                  <span className="text-[8px] text-amber-600 font-bold">+ Ekle</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Defined Recipes Detailed List */}
                    {allProdRecipes.length > 0 && (
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {allProdRecipes.map((rc, rcIdx) => (
                          <div key={`prod-${prod.id}-rc-${rc.id || rcIdx}-${rc.targetColor || 'genel'}`} className="bg-slate-50 dark:bg-slate-800/50/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">
                                {rc.targetColor ? `🎨 ${rc.targetColor} Reçetesi` : '🌐 Genel (Tüm Renkler)'}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openRecipeModalForProduct(prod.id!, rc.targetColor || 'all')}
                                  className="text-[9px] font-black text-slate-600 dark:text-slate-300 hover:text-indigo-600 uppercase flex items-center gap-0.5"
                                  title="Reçeteyi aç veya başka renklere kopyala"
                                >
                                  <Copy className="w-3 h-3" />
                                  Düzenle / Kopyala
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openRecipeModalForProduct(prod.id!, rc.targetColor || 'all')}
                                  className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 uppercase"
                                >
                                  Düzenle
                                </button>
                                {rc.id && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRecipe(rc.id!)}
                                    className="text-[9px] font-black text-rose-500 hover:text-rose-700 uppercase"
                                  >
                                    Sil
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1">
                              {rc.ingredients.map((ing, i) => {
                                const matProd = productMap.get(ing.productId);
                                const isSemi = matProd?.categoryType === 'semi_finished';
                                const isAccessory = matProd?.categoryType === 'accessory';
                                return (
                                  <div key={i} className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-100 dark:border-slate-800">
                                    <div className="truncate flex items-center gap-1.5">
                                      <span className={cn(
                                        "text-[8px] font-black px-1.5 py-0.2 rounded uppercase",
                                        isSemi ? "bg-sky-100 text-sky-800" : isAccessory ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                      )}>
                                        {isSemi ? 'Yarı Mamul' : isAccessory ? 'Aksesuar' : 'Hammadde'}
                                      </span>
                                      <span className="truncate text-slate-900 dark:text-slate-100">{matProd?.name || 'Malzeme'}</span>
                                      {ing.color && (
                                        <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded">
                                          [{ing.color}]
                                        </span>
                                      )}
                                      {ing.isMatrixMatched && (
                                        <span className="text-[8px] font-black bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded border border-emerald-200">
                                          🎯 Matrisli
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-indigo-600 font-black flex-shrink-0 ml-2">
                                      {ing.quantity} {ing.unit || matProd?.unit || 'Adet'}
                                      {Number(ing.basisQty) > 1 && (
                                        <span className="text-slate-600 dark:text-slate-300 font-bold">
                                          {' '}/ {ing.basisQty} {productMap.get(rc.productId)?.unit || 'Çift'}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openRecipeModalForProduct(prod.id!)}
                      className="flex-1 py-2.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all text-center shadow-xs"
                    >
                      {allProdRecipes.length > 0 ? "Reçeteleri Yönet / Ekle" : "+ İlk Reçeteyi Tanımla"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 6: PRODUCTION & SHOPFLOOR REPORTS */}
      {activeTab === 'reports' && (
        <ProductionReport />
      )}

      {/* MODAL 1: NEW MANUAL WORK ORDER */}
      <AddWorkOrderModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        products={products}
        onCreated={handleCalculateMRP}
      />

      {/* MODAL 2: RECIPE (BoM) BUILDER & VARIANT MANAGEMENT */}
      <RecipeModal
        isOpen={isRecipeModalOpen}
        onClose={() => setIsRecipeModalOpen(false)}
        selectedProductId={selectedProductId}
        setSelectedProductId={setSelectedProductId}
        selectedRecipeTargetColor={selectedRecipeTargetColor}
        setSelectedRecipeTargetColor={setSelectedRecipeTargetColor}
        products={products}
        recipes={recipes}
        onSaveSuccess={() => {
          handleCalculateMRP();
        }}
      />

      {/* MODAL 3: STAGE ADVANCEMENT MODAL */}
      <StageTransitionModal
        isOpen={isStageTransitionModalOpen}
        onClose={() => setIsStageTransitionModalOpen(false)}
        workOrder={selectedWorkOrder}
        productName={selectedWorkOrder ? productMap.get(selectedWorkOrder.productId)?.name : undefined}
        initialTargetStage={stageTransitionInitialStage}
        onDone={handleCalculateMRP}
      />

      {/* MODAL 4: WORK ORDER REF TICKET / BARCODE PRINT */}
      <WorkOrderTicketModal
        isOpen={isTicketModalOpen}
        onClose={() => setIsTicketModalOpen(false)}
        workOrder={ticketWorkOrder}
        productName={ticketWorkOrder ? productMap.get(ticketWorkOrder.productId)?.name : undefined}
        productCode={ticketWorkOrder ? productMap.get(ticketWorkOrder.productId)?.code : undefined}
        onOpenDetailedSheet={openDetailedWorkOrderSheet}
      />

      {/* MODAL 4B: DETAILED A4 WORK ORDER & CUTTING SHEET MODAL (AYAKKABI STANDART KARTELA) */}
      <DetailedWorkOrderCardModal
        isOpen={isDetailedSheetModalOpen}
        onClose={() => setIsDetailedSheetModalOpen(false)}
        workOrder={detailedSheetWorkOrder}
        product={detailedSheetWorkOrder ? productMap.get(detailedSheetWorkOrder.productId) : undefined}
        recipe={detailedSheetWorkOrder?.productId ? (recipes?.find(r => r.productId === detailedSheetWorkOrder.productId && (!r.targetColor || r.targetColor === 'all' || r.targetColor === detailedSheetWorkOrder.color)) || recipes?.find(r => r.productId === detailedSheetWorkOrder.productId)) : undefined}
        allProducts={products || []}
        customer={contacts?.find(c => c.name === detailedSheetWorkOrder?.customerName || c.code === detailedSheetWorkOrder?.customerCode)}
        onSaveWorkOrder={handleSaveDetailedWorkOrder}
      />

      {/* MODAL 5: AUTO PURCHASE ORDER FROM MRP (MULTI-SUPPLIER SPLIT) */}
      {isPurchaseOrderModalOpen && mrpResult && (
        <MrpPurchaseOrderModal
          mrpResult={mrpResult}
          selectedMrpKeys={selectedMrpKeys}
          contacts={contacts}
          onClose={() => setIsPurchaseOrderModalOpen(false)}
          onCreated={handleCalculateMRP}
          onPrintPo={(orderId) => {
            setPrintPoId(orderId);
            setIsPoPrintModalOpen(true);
          }}
        />
      )}

      {/* MODAL 6: ÜRETİM REFAKAT KARTI (İŞ EMRİ TAKİP FİŞİ) MODAL */}
      <ProductionRefakatKartiModal
        isOpen={isRefakatKartiModalOpen}
        onClose={() => {
          setIsRefakatKartiModalOpen(false);
          setRefakatWorkOrder(null);
        }}
        workOrder={refakatWorkOrder}
        product={refakatWorkOrder ? productMap.get(refakatWorkOrder.productId) : undefined}
        recipe={refakatWorkOrder?.productId ? (recipes?.find(r => r.productId === refakatWorkOrder.productId && (!r.targetColor || r.targetColor === 'all' || r.targetColor === refakatWorkOrder.color)) || recipes?.find(r => r.productId === refakatWorkOrder.productId)) : undefined}
        customer={contacts?.find(c => c.name === refakatWorkOrder?.customerName || c.code === refakatWorkOrder?.customerCode)}
        onStageUpdated={() => {
          // Live query will refresh data automatically
        }}
      />

      {/* MODAL 7: BOM (ÜRÜN REÇETESİ) & OTOMATİK SARFİYAT DÜŞÜMÜ MODAL */}
      <BomConsumptionModal
        isOpen={isBomConsumptionModalOpen}
        onClose={() => {
          setIsBomConsumptionModalOpen(false);
          setBomSelectedProductId(undefined);
        }}
        initialProductId={bomSelectedProductId}
      />

      {/* MODAL 8: KAMERA İLE CANLI BARKOD / KAREKOD OKUYUCU MODAL */}
      <CameraBarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        initialMode={cameraScannerInitialMode}
        initialScannedCode={cameraScannerInitialCode}
        onWorkOrderFound={(wo) => {
          setRefakatWorkOrder(wo);
          setIsRefakatKartiModalOpen(true);
        }}
      />

      {/* MODAL 9: SATINALMA SİPARİŞİ / TEDARİKÇİ FORMU & ASORTİ MATRİSİ YAZDIRMA & MAİL */}
      <PurchaseOrderPrintModal
        isOpen={isPoPrintModalOpen}
        onClose={() => {
          setIsPoPrintModalOpen(false);
          setPrintPoId(null);
        }}
        orderId={printPoId}
      />

    </div>
  );
}
