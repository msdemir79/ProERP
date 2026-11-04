import { useState, useMemo, useEffect } from 'react';
import { api } from '../api/client';
import { useApiQuery, useApiQueryFull } from '../hooks/useApiQuery';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  ArrowUp,
  Ruler,
  Eye,
  X,
  Barcode,
  Settings,
  Camera,
  Edit2,
  BarChart3,
  FileText,
  SlidersHorizontal,
  ChevronDown,
  MoreHorizontal,
  PackageCheck,
  Grid,
  Wallet
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { formatQuantity } from '../lib/inventoryCalculator';
import { getCartonSize } from '../lib/carton';
import { getColorSwatch, hexFromColorRefs } from '../lib/colorSwatches';
import PageHeader from './PageHeader';
import DataGrid, { GridColumn, StatusPill } from './Common/DataGrid';
import Button, { buttonClass } from './Common/Button';
import ActionMenu from './Common/ActionMenu';
import KpiCard from './Common/KpiCard';
import DetailPanel from './Common/DetailPanel';
import { DetailSection, DetailSummary, DetailTiles } from './Common/DetailPanelContent';
import StatusBadge from './Common/StatusBadge';
import SegmentedFilter, { SegmentOption } from './Common/SegmentedFilter';
import { controlClass } from './Common/Field';
import CameraBarcodeScannerModal, { type ScannerMode } from './Common/CameraBarcodeScannerModal';
import AdjustStockModal from './Inventory/AdjustStockModal';
import ProductDetailModal from './Inventory/ProductDetailModal';
import AssortmentTemplatesModal from './Inventory/AssortmentTemplatesModal';
import BarcodeSettingsModal from './Inventory/BarcodeSettingsModal';
import StockStatementModal from './Inventory/StockStatementModal';
import StockCardFormModal from './Inventory/StockCardFormModal';
import { CATEGORY_CONFIGS, getProductCategoryType } from './Inventory/categoryConfig';
import { StockCategoryType, Product } from '../types';


export default function Inventory() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedProductId = searchParams.get('productId');
  const productsQuery = useApiQueryFull(() => api.products.list(), [], ['products']);
  const products = productsQuery.data;
  const templates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']);
  const tdhpAccounts = useApiQuery(() => api.accounts.list(), [], ['accounts']);
  const inventoryLogs = useApiQuery(() => api.inventoryLogs.list(), [], ['inventoryLogs']);
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);

  // Navigation & Filter States
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'all' | StockCategoryType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [filterVariantOnly, setFilterVariantOnly] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [stockCardEditProduct, setStockCardEditProduct] = useState<Product | null>(null);
  const [stockCardInitialCategory, setStockCardInitialCategory] = useState<StockCategoryType>('finished');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  // DMR Kinetiq: satıra tıklanınca açılan sağdan kayan okunur özet paneli.
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  useEffect(() => {
    const id = Number(requestedProductId);
    if (!requestedProductId || !Number.isSafeInteger(id) || id <= 0) return;
    let active = true;
    api.products.get(id)
      .then(product => { if (active && product) setDetailProduct(product); })
      .catch(() => { /* Liste ekranındaki hata durumu mevcut sorgu tarafından gösterilir. */ });
    return () => { active = false; };
  }, [requestedProductId]);

  const closeDetailProduct = () => {
    setDetailProduct(null);
    if (requestedProductId) {
      setSearchParams(current => {
        const next = new URLSearchParams(current);
        next.delete('productId');
        return next;
      }, { replace: true });
    }
  };

  // Live Camera Barcode / QR Scanner State
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [cameraScannerMode, setCameraScannerMode] = useState<ScannerMode>('stock_count');

  // Filtered Products
  const filteredProducts = useMemo(() => {
    if (!products) return [];

    return products.filter(p => {
      const pCat = getProductCategoryType(p);

      // Category tab filter
      if (selectedCategoryTab !== 'all' && pCat !== selectedCategoryTab) {
        return false;
      }

      // Low stock filter
      if (filterLowStock && p.stock > p.minStock) {
        return false;
      }

      // Variant only filter
      if (filterVariantOnly && !p.hasSizeVariants && !p.isFootwear && (!p.variantBarcodes || p.variantBarcodes.length === 0)) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesCode = p.code?.toLowerCase().includes(term);
        const matchesName = p.name?.toLowerCase().includes(term);
        const matchesBrand = p.brand?.toLowerCase().includes(term);
        const matchesCategory = p.category?.toLowerCase().includes(term);
        const matchesSubType = p.subType?.toLowerCase().includes(term);
        const matchesShelf = p.shelf?.toLowerCase().includes(term);
        const matchesColors = p.colors?.some(c => c.toLowerCase().includes(term));
        const matchesBarcode = p.colorBoxBarcodes?.some(b => b.barcode.includes(term)) || p.variantBarcodes?.some(v => v.barcode.includes(term));

        if (!matchesCode && !matchesName && !matchesBrand && !matchesCategory && !matchesSubType && !matchesShelf && !matchesColors && !matchesBarcode) {
          return false;
        }
      }

      return true;
    });
  }, [products, selectedCategoryTab, searchTerm, filterLowStock, filterVariantOnly]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = {
      all: products?.length || 0,
      finished: 0,
      semi_finished: 0,
      raw_material: 0,
      accessory: 0
    };
    if (products) {
      products.forEach(p => {
        const cat = getProductCategoryType(p);
        counts[cat] = (counts[cat] || 0) + 1;
      });
    }
    return counts;
  }, [products]);

  const categoryOptions = useMemo<SegmentOption[]>(() => [
    { key: 'all', label: 'Tümü', count: categoryCounts.all },
    ...(Object.keys(CATEGORY_CONFIGS) as StockCategoryType[]).map((catKey) => {
      const cfg = CATEGORY_CONFIGS[catKey];
      return {
        key: catKey,
        label: cfg.badge,
        count: categoryCounts[catKey],
        icon: <cfg.icon aria-hidden="true" />
      };
    })
  ], [categoryCounts]);

  const activeFilterCount = (filterLowStock ? 1 : 0) + (filterVariantOnly ? 1 : 0);

  // KPI özeti: aktif kategori sekmesine göre kapsamlandırılır (arama/kritik/matris
  // filtrelerinden bağımsız), böylece kartlar seçili kategorinin gerçek durumunu yansıtır.
  const kpi = useMemo(() => {
    const scoped = (products || []).filter(
      (p) => selectedCategoryTab === 'all' || getProductCategoryType(p) === selectedCategoryTab
    );
    let critical = 0;
    let matrix = 0;
    let value = 0;
    for (const p of scoped) {
      if ((p.stock ?? 0) <= (p.minStock || 0)) critical += 1;
      if (p.hasSizeVariants || p.isFootwear || (p.variantBarcodes?.length ?? 0) > 0) matrix += 1;
      value += (p.stock ?? 0) * (p.buyingPrice || 0);
    }
    return { total: scoped.length, critical, matrix, value };
  }, [products, selectedCategoryTab]);

  const productColumns = useMemo<GridColumn<Product>[]>(() => [
    {
      key: 'code',
      title: 'Stok Kodu',
      width: '120px',
      render: (product) => (
        <span className="font-mono text-xs font-black text-fg-strong whitespace-nowrap">
          {product.code || '—'}
        </span>
      ),
      filterValue: (product) => product.code || ''
    },
    {
      key: 'name',
      title: 'Stok Adı',
      render: (product) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-surface p-0.5">
            {product.image ? (
              <img src={product.image} alt="" className="h-full w-full object-contain" />
            ) : (
              <Package className="h-4 w-4 text-fg-muted" />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-black text-fg-strong">{product.name}</div>
            {(product.brand || product.shelf) && (
              <div className="mt-0.5 flex items-center gap-1.5 truncate text-label font-bold text-fg-muted">
                {product.brand && <span className="uppercase">{product.brand}</span>}
                {product.brand && product.shelf && <span aria-hidden="true">·</span>}
                {product.shelf && <span className="uppercase">Raf {product.shelf}</span>}
              </div>
            )}
          </div>
        </div>
      ),
      sortValue: (product) => product.name || '',
      filterValue: (product) => `${product.name || ''} ${product.code || ''} ${product.brand || ''} ${product.shelf || ''} ${product.colorBoxBarcodes?.map(b => b.barcode).join(' ') || ''} ${product.variantBarcodes?.map(v => v.barcode).join(' ') || ''}`
    },
    {
      key: 'categoryType',
      title: 'Kategori',
      width: '160px',
      render: (product) => {
        const cfg = CATEGORY_CONFIGS[getProductCategoryType(product)];
        return (
          <div className="min-w-0">
            <span className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-label font-black uppercase tracking-wide whitespace-nowrap",
              `${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass}`
            )}>
              <cfg.icon className="h-3 w-3" aria-hidden="true" />
              {cfg.badge}
            </span>
            {product.subType && (
              <div className="mt-0.5 truncate text-label font-bold text-fg-muted uppercase">
                {product.subType}
              </div>
            )}
          </div>
        );
      },
      sortValue: (product) => CATEGORY_CONFIGS[getProductCategoryType(product)].badge,
      filterValue: (product) => {
        const cfg = CATEGORY_CONFIGS[getProductCategoryType(product)];
        return `${cfg.badge} ${product.subType || ''}`;
      }
    },
    {
      key: 'variant',
      title: 'Renk & Beden',
      width: '200px',
      render: (product) => {
        const colors = product.colors || [];
        const variantCount = product.variantBarcodes?.length || 0;
        if (colors.length === 0 && variantCount === 0) {
          return <span className="text-label font-bold text-fg-muted">Tekil stok</span>;
        }
        return (
          <div className="min-w-0 space-y-1">
            {colors.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {colors.slice(0, 3).map((color) => (
                  <span
                    key={color}
                    title={color}
                    className="inline-flex items-center gap-1 rounded-pill border border-line bg-surface-raised px-1.5 py-0.5 text-label font-black uppercase text-fg"
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-pill border border-line"
                      style={{ backgroundColor: hexFromColorRefs(product.colorRefs, color) || getColorSwatch(color).bg }}
                    />
                    {color}
                  </span>
                ))}
                {colors.length > 3 && (
                  <span className="text-label font-black text-fg-muted" title={colors.join(', ')}>
                    +{colors.length - 3}
                  </span>
                )}
              </div>
            )}
            {variantCount > 0 && (
              <div className="text-label font-bold text-brand-fg">{variantCount} beden varyantı</div>
            )}
          </div>
        );
      },
      filterValue: (product) => `${(product.colors || []).join(' ')} ${product.variantBarcodes && product.variantBarcodes.length > 0 ? 'matris varyant' : ''}`
    },
    {
      key: 'buyingPrice',
      title: 'Alış Fiyatı',
      width: '120px',
      align: 'right',
      render: (product) => (
        <span className="font-mono text-2xs font-black text-fg-strong whitespace-nowrap">
          ₺{(product.buyingPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
        </span>
      ),
      filterValue: (product) => `${product.buyingPrice || 0}`
    },
    {
      key: 'sellingPrice',
      title: 'Satış Fiyatı',
      width: '120px',
      align: 'right',
      render: (product) => (
        <span className="font-mono text-2xs font-black text-fg-strong whitespace-nowrap">
          ₺{(product.sellingPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
        </span>
      ),
      filterValue: (product) => `${product.sellingPrice || 0}`
    },
    {
      key: 'stock',
      title: 'Mevcut Stok',
      width: '150px',
      align: 'right',
      render: (product) => {
        const isLow = product.stock <= (product.minStock || 0);
        // Koli içi adet: stok / koli = kaç koli eder (asorti öncelikli, tek kaynak lib/carton)
        const cartonSize = getCartonSize(product, templates);
        return (
          <div className="space-y-0.5 whitespace-nowrap">
            <div className={cn(
              "inline-flex items-baseline gap-1 font-mono text-sm font-black",
              isLow ? "text-danger" : "text-fg-strong"
            )}>
              <span>{formatQuantity(product.stock)}</span>
              <span className="text-label font-bold uppercase text-fg-muted">{product.unit}</span>
            </div>
            {isLow && (
              <div className="flex justify-end">
                <StatusPill tone="red" className="text-label uppercase">
                  <AlertTriangle className="h-3 w-3" /> Kritik · Min {formatQuantity(product.minStock)}
                </StatusPill>
              </div>
            )}
            {cartonSize > 1 && product.secondaryUnit && (
              <div className="text-label font-bold text-brand-fg">
                {formatQuantity(product.stock / cartonSize)} {product.secondaryUnit}
              </div>
            )}
          </div>
        );
      },
      filterValue: (product) => `${product.stock ?? 0}`
    }
  ], [templates]);

  // Open the stock card form in ADD mode (optionally preselecting a category).
  const handleOpenAddModal = (initialCategory?: StockCategoryType) => {
    const cat = initialCategory || (selectedCategoryTab === 'all' ? 'finished' : selectedCategoryTab);
    setStockCardEditProduct(null);
    setStockCardInitialCategory(cat);
    setIsAddModalOpen(true);
  };

  // Open the stock card form in EDIT mode for an existing product.
  const handleOpenEditModal = (product: Product) => {
    setStockCardEditProduct(product);
    setIsAddModalOpen(true);
  };

  const handleOpenScanner = (mode: ScannerMode) => {
    setCameraScannerMode(mode);
    setIsCameraScannerOpen(true);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterLowStock(false);
    setFilterVariantOnly(false);
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Header & Primary Actions */}
      <PageHeader
        title="Stok & Malzeme Envanteri"
        subtitle="Mamul ayakkabı, bedenli yarı mamul (taban/mostra/fuspet), hammadde ve sarf malzeme kartları"
        badge="Stok Yönetimi"
        icon={Package}
        iconColor="indigo"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => handleOpenAddModal()}
            >
              Yeni Stok
            </Button>

            <Link to="/reports?tab=stock" className={buttonClass({ variant: 'secondary' })}>
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Stok Raporu</span>
            </Link>

            <ActionMenu
              label="Diğer işlemler"
              icon={<MoreHorizontal className="h-4 w-4" />}
              items={[
                {
                  key: 'live-count',
                  label: 'Kamera ile Canlı Sayım',
                  icon: <Camera />,
                  onSelect: () => handleOpenScanner('stock_count')
                },
                {
                  key: 'goods-receipt',
                  label: 'Mal Kabul',
                  icon: <PackageCheck />,
                  onSelect: () => handleOpenScanner('goods_receipt')
                },
                {
                  key: 'label-templates',
                  label: 'Barkod & Etiket Şablonları',
                  icon: <Barcode />,
                  onSelect: () => navigate('/inventory/templates')
                },
                {
                  key: 'assortment-templates',
                  label: 'Asorti Şablonları',
                  icon: <Ruler />,
                  onSelect: () => setIsTemplateModalOpen(true)
                },
                {
                  key: 'barcode-settings',
                  label: 'Barkod Ayarları',
                  icon: <Settings />,
                  onSelect: () => setIsSettingsModalOpen(true)
                }
              ]}
            />
          </div>
        }
      />

      {/* KPI Özet Kartları (DMR Kinetiq) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Stok Kartı"
          value={kpi.total}
          sub={selectedCategoryTab === 'all' ? 'Tüm kategoriler' : CATEGORY_CONFIGS[selectedCategoryTab].badge}
          icon={Package}
          tone="brand"
          onClick={() => setSelectedCategoryTab('all')}
        />
        <KpiCard
          label="Kritik Stok"
          value={kpi.critical}
          sub="Min. seviyenin altında"
          icon={AlertTriangle}
          tone={kpi.critical > 0 ? 'danger' : 'success'}
          onClick={() => { setFilterLowStock(true); setShowAdvancedFilters(true); }}
        />
        <KpiCard
          label="Bedenli / Matris"
          value={kpi.matrix}
          sub="Renk-numara varyantlı"
          icon={Grid}
          tone="info"
          onClick={() => { setFilterVariantOnly(true); setShowAdvancedFilters(true); }}
        />
        <KpiCard
          label="Stok Değeri"
          value={`₺${kpi.value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`}
          sub="Alış maliyetine göre"
          icon={Wallet}
          tone="violet"
        />
      </div>

      {/* Category Filter */}
      <SegmentedFilter
        ariaLabel="Stok kategorisi"
        options={categoryOptions}
        value={selectedCategoryTab}
        onChange={(key) => setSelectedCategoryTab(key as 'all' | StockCategoryType)}
        className="w-full md:w-auto"
      />

      {/* Products Table */}
      <DataGrid<Product>
        columns={productColumns}
        data={filteredProducts}
        rowKey="id"
        onRowClick={(product) => setDetailProduct(product)}
        defaultSort={{ key: 'code', dir: 'asc' }}
        loading={productsQuery.loading}
        emptyMessage="Arama kriterlerinize uygun stok kartı bulunamadı veya henüz stok kartı eklenmedi."
        toolbar={
          <div className="flex w-full flex-col gap-2">
            <div className="flex w-full flex-wrap items-center gap-2">
              <div className="relative min-w-55 flex-1">
                <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Stok kodu, ürün adı, marka, raf, renk veya barkod ara..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  aria-label="Stok kartlarında ara"
                  className={cn(controlClass(), 'h-9 pl-9 pr-8')}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    title="Aramayı temizle"
                    aria-label="Aramayı temizle"
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-fg-muted transition-colors hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Button
                variant={activeFilterCount > 0 ? 'subtle' : 'secondary'}
                icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
                iconRight={
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAdvancedFilters && 'rotate-180')} />
                }
                onClick={() => setShowAdvancedFilters(open => !open)}
                aria-expanded={showAdvancedFilters}
              >
                Gelişmiş Filtreler{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </Button>
            </div>

            {showAdvancedFilters && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
                <Button
                  variant={filterLowStock ? 'subtle' : 'ghost'}
                  size="sm"
                  icon={<AlertTriangle className="h-3.5 w-3.5" />}
                  onClick={() => setFilterLowStock(value => !value)}
                  aria-pressed={filterLowStock}
                  className={filterLowStock ? 'bg-danger-soft text-danger hover:bg-danger-soft' : undefined}
                >
                  Kritik Stok
                </Button>

                <Button
                  variant={filterVariantOnly ? 'subtle' : 'ghost'}
                  size="sm"
                  icon={<Package className="h-3.5 w-3.5" />}
                  onClick={() => setFilterVariantOnly(value => !value)}
                  aria-pressed={filterVariantOnly}
                >
                  Bedenli / Matris
                </Button>

                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={handleResetFilters}>
                    Filtreleri Temizle
                  </Button>
                )}
              </div>
            )}
          </div>
        }
        rowActions={(product) => (
          <ActionMenu
            label={`${product.name} işlemleri`}
            items={[
              {
                key: 'view',
                label: 'Görüntüle',
                icon: <Eye />,
                onSelect: () => setDetailProduct(product)
              },
              {
                key: 'edit',
                label: 'Düzenle',
                icon: <Edit2 />,
                onSelect: () => handleOpenEditModal(product)
              },
              {
                key: 'adjust',
                label: 'Stok Giriş / Çıkış',
                icon: <ArrowUp />,
                onSelect: () => { setSelectedProduct(product); setIsAdjustModalOpen(true); }
              },
              {
                key: 'statement',
                label: 'Stok Ekstresi',
                icon: <FileText />,
                onSelect: () => { setSelectedProduct(product); setIsStatementModalOpen(true); }
              },
              {
                key: 'barcode',
                label: 'Barkod Yazdır',
                icon: <Barcode />,
                onSelect: () => navigate(`/inventory/barcode?product=${product.id}`)
              }
            ]}
          />
        )}
      />

      {/* ========================================================================= */}
      {/* STOCK DETAIL PANEL (DMR Kinetiq — sağdan kayan okunur özet)                */}
      {/* ========================================================================= */}
      <DetailPanel
        isOpen={!!detailProduct}
        onClose={closeDetailProduct}
        title={detailProduct?.name || 'Stok Detayı'}
        widthClass="max-w-[460px]"
        badge={
          detailProduct ? (
            <StatusBadge tone="brand">{CATEGORY_CONFIGS[getProductCategoryType(detailProduct)].badge}</StatusBadge>
          ) : undefined
        }
        footer={
          detailProduct ? (
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<Grid className="h-4 w-4" />}
                onClick={() => {
                  const p = detailProduct;
                  setDetailProduct(null);
                  setSelectedProduct(p);
                  setIsDetailModalOpen(true);
                }}
              >
                Analiz
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<FileText className="h-4 w-4" />}
                onClick={() => {
                  const p = detailProduct;
                  setDetailProduct(null);
                  setSelectedProduct(p);
                  setIsStatementModalOpen(true);
                }}
              >
                Ekstre
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Edit2 className="h-4 w-4" />}
                onClick={() => {
                  const p = detailProduct;
                  setDetailProduct(null);
                  handleOpenEditModal(p);
                }}
              >
                Düzenle
              </Button>
            </div>
          ) : undefined
        }
      >
        {detailProduct &&
          (() => {
            const p = detailProduct;
            const money = (v: number) =>
              `₺${(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const isLow = (p.stock ?? 0) <= (p.minStock || 0);
            const cartonSize = getCartonSize(p, templates);
            const colors = p.colors || [];
            const acct = (code?: string | null, fallback = '—') => {
              const c = code || fallback;
              const name = tdhpAccounts?.find((a: any) => a.code === c)?.name;
              return name ? `${c} · ${name}` : c;
            };
            return (
              <div className="space-y-5">
                {/* Ürün profili */}
                <div className="flex items-start gap-3">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-surface">
                    {p.image ? (
                      <img src={p.image} alt={p.name} className="h-full w-full object-contain" />
                    ) : (
                      <Package className="h-8 w-8 text-fg-muted" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-surface-hover px-2 py-0.5 font-mono text-[11px] font-black text-fg-strong">
                        {p.code || '—'}
                      </span>
                      {p.brand && (
                        <span className="text-label font-black uppercase text-fg-muted">{p.brand}</span>
                      )}
                    </div>
                    {p.subType && <div className="text-xs font-bold uppercase text-fg-muted">{p.subType}</div>}
                    <div className="text-xs font-semibold text-fg-muted">
                      Birim: <span className="font-bold text-fg-strong">{p.unit}</span>
                      {p.secondaryUnit ? ` / ${p.secondaryUnit}` : ''}
                    </div>
                  </div>
                </div>

                <DetailSummary
                  label="Mevcut Stok"
                  value={formatQuantity(p.stock)}
                  unit={p.unit}
                  tone={isLow ? 'danger' : 'brand'}
                  badge={
                    isLow ? (
                      <StatusBadge tone="danger">
                        <AlertTriangle className="h-3 w-3" /> Kritik
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="success">Yeterli</StatusBadge>
                    )
                  }
                >
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-fg-muted">Kritik Limit</div>
                      <div className="font-bold tabular-nums text-fg-strong">
                        {formatQuantity(p.minStock || 0)} {p.unit}
                      </div>
                    </div>
                    <div>
                      <div className="text-fg-muted">Koli İçi</div>
                      <div className="font-bold tabular-nums text-fg-strong">
                        {cartonSize > 1 ? `${formatQuantity(cartonSize)} ${p.unit}` : '—'}
                      </div>
                    </div>
                  </div>
                </DetailSummary>

                <DetailTiles
                  items={[
                    { label: 'Alış Fiyatı', value: money(p.buyingPrice) },
                    { label: 'Satış Fiyatı', value: money(p.sellingPrice), valueClass: 'text-brand' },
                    { label: 'Depo Raf', value: p.shelf || 'Tanımsız' },
                    { label: 'KDV', value: `%${p.vatRate ?? 20}` },
                  ]}
                />

                <DetailSection
                  title="Genel Bilgiler"
                  rows={[
                    { label: 'Stok Kodu', value: p.code || '—' },
                    { label: 'Kategori', value: CATEGORY_CONFIGS[getProductCategoryType(p)].badge },
                    { label: 'Marka', value: p.brand || '—' },
                    { label: 'Beden Varyantı', value: (p.variantBarcodes?.length ?? 0) > 0 ? `${p.variantBarcodes!.length} varyant` : 'Tekil stok' },
                  ]}
                />

                {colors.length > 0 && (
                  <DetailSection title={`Tanımlı Renkler (${colors.length})`}>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {colors.map((c) => (
                        <span
                          key={c}
                          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1 text-label font-black uppercase text-fg"
                        >
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 shrink-0 rounded-pill border border-line"
                            style={{ backgroundColor: hexFromColorRefs(p.colorRefs, c) || getColorSwatch(c).bg }}
                          />
                          {c}
                        </span>
                      ))}
                    </div>
                  </DetailSection>
                )}

                <DetailSection
                  title="Muhasebe (TDHP)"
                  rows={[
                    { label: 'Stok Hesabı', value: acct(p.accountingCode, '157.01') },
                    { label: 'Satış Geliri', value: acct(p.salesAccountCode, '600.01') },
                    { label: 'Alış / Maliyet', value: acct(p.purchaseAccountCode, '620.01') },
                  ]}
                />
              </div>
            );
          })()}
      </DetailPanel>

      {/* ========================================================================= */}
      {/* ADD / EDIT STOCK CARD MODAL                                              */}
      {/* ========================================================================= */}
      <StockCardFormModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setStockCardEditProduct(null); }}
        editProduct={stockCardEditProduct}
        initialCategory={stockCardInitialCategory}
        products={products}
        templates={templates}
        contacts={contacts}
        tdhpAccounts={tdhpAccounts}
      />

      {/* ========================================================================= */}
      {/* PRODUCT DETAIL MODAL                                                     */}
      {/* ========================================================================= */}
      <ProductDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        product={selectedProduct}
        tdhpAccounts={tdhpAccounts}
        onDeleted={() => setSelectedProduct(null)}
        onOpenStatement={() => setIsStatementModalOpen(true)}
        onEdit={handleOpenEditModal}
      />

      {/* ========================================================================= */}
      {/* ADJUST STOCK MODAL                                                       */}
      {/* ========================================================================= */}
      <AdjustStockModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        product={selectedProduct}
        onSubmitted={() => setSelectedProduct(null)}
      />

      {/* ========================================================================= */}
      {/* ASSORTMENT TEMPLATES MANAGER MODAL                                       */}
      {/* ========================================================================= */}
      <AssortmentTemplatesModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        templates={templates}
      />

      {/* ========================================================================= */}
      {/* BARCODE CONFIGURATION MODAL                                              */}
      {/* ========================================================================= */}
      <BarcodeSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      {/* ========================================================================= */}
      {/* STOK KART EKSTRESİ & HAREKET RAPORU MODAL                               */}
      {/* ========================================================================= */}
      <StockStatementModal
        isOpen={isStatementModalOpen}
        onClose={() => setIsStatementModalOpen(false)}
        product={selectedProduct}
        inventoryLogs={inventoryLogs}
      />

      {/* Kamera ile Canlı Barkod/Karekod Okuyucu Modalı */}
      <CameraBarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        initialMode={cameraScannerMode}
      />
    </div>
  );
}
