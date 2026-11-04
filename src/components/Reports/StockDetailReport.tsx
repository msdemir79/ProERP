import React from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { inventoryService } from '../../services/inventoryService';
import { showToast } from '../../lib/feedback';
import {
  Package,
  Search,
  Printer,
  AlertTriangle,
  Box,
  Layers,
  Filter,
  Maximize2,
  Minimize2,
  RefreshCw,
  SlidersHorizontal,
  Scissors,
  Tag,
  Boxes,
  Eye,
  FileDown,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { printHtml } from '../../lib/printService';
import { exportToCsv } from '../../lib/exportService';
import type { Product, AssortmentTemplate, StockCategoryType } from '../../types';
import { CATEGORY_TYPE_META } from './stockCategoryMeta';
import { getCartonSize } from '../../lib/carton';
import StockDetailRow from './StockDetailRow';
import PageHeader from '../PageHeader';
import Button from '../Common/Button';
import { controlClass } from '../Common/Field';
import SegmentedFilter from '../Common/SegmentedFilter';

export type StockClassification = 'all' | 'mamul' | 'mamul_disi';
export type SubClassification = 'all' | 'semi_finished' | 'raw_material' | 'accessory';


const getProductCategoryType = (p: Product): StockCategoryType => {
  if (p.categoryType) return p.categoryType;
  if (p.isRawMaterial) return 'raw_material';
  return 'finished';
};

export default function StockDetailReport() {
  const systemSettings = useApiQuery(() => api.settings.get('global_settings'), [], ['settings']);
  const products = useApiQuery(() => api.products.list(), [], ['products']);
  const templates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
  const [selectedBrand, setSelectedBrand] = React.useState<string>('all');
  
  // PRIMARY CRITERIA: Mamül vs Mamül Dışı
  const [stockClassification, setStockClassification] = React.useState<StockClassification>('all');
  const [subClassification, setSubClassification] = React.useState<SubClassification>('all');
  
  // Status filter: broken, critical, out_of_stock
  const [filterType, setFilterType] = React.useState<'all' | 'broken' | 'critical' | 'out_of_stock'>('all');
  const [sortBy, setSortBy] = React.useState<'name' | 'code' | 'stock_desc' | 'stock_asc'>('name');
  
  // Expand/collapse tracking (default: collapsed for maximum screen density and fast overview)
  const [expandedProductIds, setExpandedProductIds] = React.useState<Record<number, boolean>>({});
  const [copiedBarcode, setCopiedBarcode] = React.useState<string | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncSuccess, setSyncSuccess] = React.useState(false);
  const [rowDensity, setRowDensity] = React.useState<'compact' | 'normal'>('compact');

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await inventoryService.syncProductVariantStocks();
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 2500);
    } catch (e) {
      console.error(e);
      showToast('Stok senkronizasyonu sırasında hata oluştu.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Stock category classification counts
  const classificationCounts = React.useMemo(() => {
    if (!products) return { total: 0, mamul: 0, mamulDisi: 0, semiFinished: 0, rawMaterial: 0, accessory: 0 };
    let mamul = 0;
    let semiFinished = 0;
    let rawMaterial = 0;
    let accessory = 0;

    products.forEach(p => {
      const cType = getProductCategoryType(p);
      if (cType === 'finished') mamul++;
      else if (cType === 'semi_finished') semiFinished++;
      else if (cType === 'raw_material') rawMaterial++;
      else if (cType === 'accessory') accessory++;
    });

    return {
      total: products.length,
      mamul,
      mamulDisi: semiFinished + rawMaterial + accessory,
      semiFinished,
      rawMaterial,
      accessory
    };
  }, [products]);

  // Derive categories and brands
  const categories = React.useMemo(() => {
    if (!products) return [];
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  const brands = React.useMemo(() => {
    if (!products) return [];
    const set = new Set<string>();
    products.forEach(p => {
      if (p.brand) set.add(p.brand);
    });
    return Array.from(set);
  }, [products]);

  // Process and filter products
  const baseProducts = React.useMemo(() => {
    if (!products) return [];

    // Map template map for quick lookup
    const templateMap = new Map<number, AssortmentTemplate>();
    templates?.forEach(t => {
      if (t.id) templateMap.set(t.id, t);
    });

    const list = products.map(p => {
      const catType = getProductCategoryType(p);
      const isMamul = catType === 'finished';
      const isFootwear = isMamul || p.isFootwear || (p.variantBarcodes && p.variantBarcodes.length > 0);
      const template = p.assortmentTemplateId ? templateMap.get(p.assortmentTemplateId) : undefined;
      const templateItems = p.assortment || template?.items || [];
      // Koli içi adet: asorti toplamı öncelikli, yoksa karttaki koli çarpanı (tek kaynak: lib/carton)
      const templateMultiplier = getCartonSize(p, templates) || 1;

      // Determine unique colors
      const colorSet = new Set<string>();
      if (p.colors && p.colors.length > 0) {
        p.colors.forEach(c => colorSet.add(c));
      }
      if (p.variantBarcodes && p.variantBarcodes.length > 0) {
        p.variantBarcodes.forEach(v => {
          if (v.color) colorSet.add(v.color);
        });
      }
      if (p.colorBoxBarcodes && p.colorBoxBarcodes.length > 0) {
        p.colorBoxBarcodes.forEach(b => {
          if (b.color) colorSet.add(b.color);
        });
      }
      if (colorSet.size === 0) {
        colorSet.add('Standart');
      }

      const colorsList = Array.from(colorSet);

      // Process color rows
      let totalCalculatedStock = 0;
      let hasBrokenSize = false;

      const colorRows = colorsList.map(color => {
        const colorImage = p.colorImages?.find(ci => ci.color === color)?.image || p.image;
        const boxBarcode = p.colorBoxBarcodes?.find(b => b.color === color)?.barcode;
        const colorVariants = p.variantBarcodes?.filter(v => v.color === color) || [];
        
        const sizeMap = new Map<string, { size: string; barcode?: string; stock: number; templateRatio?: number }>();

        // 1. Add from template / product assortment
        templateItems.forEach(item => {
          sizeMap.set(item.size, {
            size: item.size,
            stock: 0,
            templateRatio: item.quantity
          });
        });

        // 2. Add / merge from variantBarcodes
        colorVariants.forEach(v => {
          const existing = sizeMap.get(v.size);
          if (existing) {
            existing.barcode = v.barcode;
            existing.stock = v.stock || 0;
          } else {
            sizeMap.set(v.size, {
              size: v.size,
              barcode: v.barcode,
              stock: v.stock || 0,
              templateRatio: 0
            });
          }
        });

        // If no variants and no template, create a single standard size entry
        if (sizeMap.size === 0) {
          sizeMap.set('Standart', {
            size: 'Standart',
            barcode: boxBarcode || p.code,
            stock: p.stock || 0,
            templateRatio: 1
          });
        }

        const sizeList = Array.from(sizeMap.values()).sort((a, b) => {
          const numA = parseFloat(a.size);
          const numB = parseFloat(b.size);
          if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
          }
          return a.size.localeCompare(b.size);
        });

        const colorTotalStock = sizeList.reduce((acc, curr) => acc + (curr.stock || 0), 0);
        totalCalculatedStock += colorTotalStock;

        // Broken size calculation
        const sizesWithStock = sizeList.filter(s => (s.stock || 0) > 0);
        const sizesWithoutStock = sizeList.filter(s => (s.stock || 0) === 0);
        const isColorBroken = sizeList.length > 1 && sizesWithStock.length > 0 && sizesWithoutStock.length > 0;
        if (isColorBroken) {
          hasBrokenSize = true;
        }

        const estimatedBoxes = templateMultiplier > 0 ? (colorTotalStock / templateMultiplier) : 0;

        return {
          color,
          colorImage,
          boxBarcode,
          sizeList,
          colorTotalStock,
          estimatedBoxes,
          isColorBroken,
          sizesWithStockCount: sizesWithStock.length,
          sizesWithoutStockCount: sizesWithoutStock.length,
          totalSizesCount: sizeList.length
        };
      });

      // Overall stock calculation
      const finalStock = (p.variantBarcodes && p.variantBarcodes.length > 0) ? totalCalculatedStock : p.stock;
      const isCritical = finalStock <= (p.minStock || 0);
      const isOutOfStock = finalStock <= 0;

      return {
        ...p,
        catType,
        isMamul,
        isFootwear,
        templateName: template?.name || (templateItems.length > 0 ? 'Özel Asorti' : 'Standart'),
        templateMultiplier,
        templateItems,
        colorRows,
        finalStock,
        hasBrokenSize,
        isCritical,
        isOutOfStock,
        totalColorsCount: colorRows.length
      };
    });

    // Apply filtering
    return list.filter(p => {
      // 1. PRIMARY CRITERIA: Mamül vs Mamül Dışı
      if (stockClassification === 'mamul' && !p.isMamul) {
        return false;
      }
      if (stockClassification === 'mamul_disi' && p.isMamul) {
        return false;
      }
      if (stockClassification === 'mamul_disi' && subClassification !== 'all') {
        if (p.catType !== subClassification) {
          return false;
        }
      }

      // 2. Search filter
      const search = searchTerm.toLowerCase().trim();
      if (search) {
        const matchCode = p.code.toLowerCase().includes(search);
        const matchName = p.name.toLowerCase().includes(search);
        const matchBrand = p.brand?.toLowerCase().includes(search);
        const matchCategory = p.category?.toLowerCase().includes(search);
        const matchSubType = p.subType?.toLowerCase().includes(search);
        const matchShelf = p.shelf?.toLowerCase().includes(search);
        const matchColor = p.colorRows.some(c => c.color.toLowerCase().includes(search));
        const matchBarcode = p.colorRows.some(c => 
          (c.boxBarcode && c.boxBarcode.toLowerCase().includes(search)) ||
          c.sizeList.some(s => s.barcode && s.barcode.toLowerCase().includes(search))
        );
        if (!matchCode && !matchName && !matchBrand && !matchCategory && !matchSubType && !matchShelf && !matchColor && !matchBarcode) {
          return false;
        }
      }

      // 3. Category & Brand filters
      if (selectedCategory !== 'all' && p.category !== selectedCategory) {
        return false;
      }
      if (selectedBrand !== 'all' && p.brand !== selectedBrand) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'tr');
      if (sortBy === 'code') return a.code.localeCompare(b.code, 'tr');
      if (sortBy === 'stock_desc') return b.finalStock - a.finalStock;
      if (sortBy === 'stock_asc') return a.finalStock - b.finalStock;
      return 0;
    });
  }, [products, templates, stockClassification, subClassification, searchTerm, selectedCategory, selectedBrand, sortBy]);

  const statusCounts = React.useMemo(() => ({
    all: baseProducts.length,
    broken: baseProducts.filter(p => p.hasBrokenSize).length,
    critical: baseProducts.filter(p => p.isCritical).length,
    out_of_stock: baseProducts.filter(p => p.isOutOfStock).length,
  }), [baseProducts]);

  const processedProducts = React.useMemo(() => baseProducts.filter(p => {
    if (filterType === 'broken') return p.hasBrokenSize;
    if (filterType === 'critical') return p.isCritical;
    if (filterType === 'out_of_stock') return p.isOutOfStock;
    return true;
  }), [baseProducts, filterType]);

  // Expand / collapse all helpers
  const areAllExpanded = React.useMemo(() => {
    if (processedProducts.length === 0) return false;
    return processedProducts.every(p => p.id && !!expandedProductIds[p.id]);
  }, [processedProducts, expandedProductIds]);

  const toggleExpandAll = () => {
    if (areAllExpanded) {
      setExpandedProductIds({});
    } else {
      const newMap: Record<number, boolean> = {};
      processedProducts.forEach(p => {
        if (p.id) newMap[p.id] = true;
      });
      setExpandedProductIds(newMap);
    }
  };

  const toggleProductExpand = (id?: number) => {
    if (!id) return;
    setExpandedProductIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const isProductExpanded = (id?: number) => {
    if (!id) return false;
    return !!expandedProductIds[id];
  };

  // Copy barcode helper
  const handleCopyBarcode = (barcode: string) => {
    navigator.clipboard.writeText(barcode);
    setCopiedBarcode(barcode);
    setTimeout(() => setCopiedBarcode(null), 2000);
  };

  // Summary Metrics
  const summaryStats = React.useMemo(() => {
    if (!processedProducts) return { totalProducts: 0, totalColors: 0, totalStock: 0, brokenColorsCount: 0, criticalCount: 0, outOfStockCount: 0 };
    let totalStock = 0;
    let totalColors = 0;
    let brokenColorsCount = 0;
    let criticalCount = 0;
    let outOfStockCount = 0;

    processedProducts.forEach(p => {
      totalStock += p.finalStock;
      totalColors += p.colorRows.length;
      if (p.isCritical) criticalCount++;
      if (p.isOutOfStock) outOfStockCount++;
      p.colorRows.forEach(c => {
        if (c.isColorBroken) brokenColorsCount++;
      });
    });

    return {
      totalProducts: processedProducts.length,
      totalColors,
      totalStock,
      brokenColorsCount,
      criticalCount,
      outOfStockCount
    };
  }, [processedProducts]);

  // Printable Tabular Report (HTML)
  const handlePrint = () => {
    if (!processedProducts || processedProducts.length === 0) {
      showToast('Yazdırılacak ürün bulunamadı.', 'warning');
      return;
    }

    const classificationLabel = stockClassification === 'mamul' 
      ? 'Yalnızca Mamül (Bitmiş Ürün) Stokları' 
      : stockClassification === 'mamul_disi' 
        ? 'Mamül Dışı (Hammadde, Yarı Mamül & Aksesuar) Stokları' 
        : 'Tüm Stok Envanteri (Mamül + Mamül Dışı)';

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; width: 100%; padding: 4px;">
        
        <!-- Header -->
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end;">
          <div style="display: flex; align-items: center; gap: 10px;">
            ${systemSettings?.company?.logo ? `<img src="${systemSettings.company.logo}" style="height: 40px; max-width: 100px; object-fit: contain;" />` : ''}
            <div>
              <div style="font-size: 10px; font-weight: 800; color: #4f46e5; letter-spacing: 0.1em; text-transform: uppercase;">${systemSettings?.company?.companyTitle || systemSettings?.company?.companyName || 'STOK ENVANTERİ & ASORTİ ANALİZİ'}</div>
              <h1 style="font-size: 19px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin: 2px 0 0 0;">Stok Detay & Envanter Raporu</h1>
              <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;"><b>Kriter:</b> ${classificationLabel}</p>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; font-weight: 700; color: #64748b;">Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
            <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-top: 2px;">Toplam: ${summaryStats.totalProducts} Kalem • ${summaryStats.totalStock} Adet/Çift</div>
          </div>
        </div>

        <!-- KPI summary row -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px;">
            <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Toplam Kalem</div>
            <div style="font-size: 14px; font-weight: 900; color: #0f172a;">${summaryStats.totalProducts}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px;">
            <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Renk / Varyant</div>
            <div style="font-size: 14px; font-weight: 900; color: #4f46e5;">${summaryStats.totalColors}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px;">
            <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Toplam Stok Miktarı</div>
            <div style="font-size: 14px; font-weight: 900; color: #059669;">${summaryStats.totalStock}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px;">
            <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Kırık Beden / Kritik</div>
            <div style="font-size: 14px; font-weight: 900; color: #e11d48;">${summaryStats.brokenColorsCount} Kırık / ${summaryStats.criticalCount} Kritik</div>
          </div>
        </div>

        <!-- Products List -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${processedProducts.map(p => {
            const meta = CATEGORY_TYPE_META[p.catType];
            return `
              <div style="border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; page-break-inside: avoid;">
                
                <!-- ÜST SATIR: Ana Ürün & Stok Bilgisi -->
                <div style="background: #f1f5f9; color: #0f172a; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="background: #0f172a; color: white; font-weight: 900; font-size: 9px; padding: 1px 5px; border-radius: 3px; font-family: monospace;">${p.code}</span>
                    <span style="background: #e0e7ff; color: #3730a3; font-weight: 800; font-size: 8px; padding: 1px 5px; border-radius: 3px;">${meta.badgeLabel}</span>
                    <span style="font-weight: 800; font-size: 12px; text-transform: uppercase;">${p.name}</span>
                    ${p.brand ? `<span style="color: #64748b; font-size: 10px;">[${p.brand}]</span>` : ''}
                    ${p.subType ? `<span style="background: #e2e8f0; font-size: 9px; padding: 1px 4px; border-radius: 2px;">${p.subType}</span>` : ''}
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    ${p.shelf ? `<span style="font-size: 9px; color: #64748b;">Raf: <b>${p.shelf}</b></span>` : ''}
                    <span style="background: #0f172a; color: #ffffff; font-weight: 900; font-size: 11px; padding: 2px 7px; border-radius: 4px; font-family: monospace;">
                      STOK: ${p.finalStock} ${p.unit || 'Çift'}
                    </span>
                  </div>
                </div>

                <!-- ALT DETAY: Asorti veya Malzeme Dökümü -->
                <div style="background: #ffffff; padding: 6px 8px;">
                  ${p.colorRows.map((c, cIdx) => `
                    <div style="margin-bottom: ${cIdx === p.colorRows.length - 1 ? '0' : '6px'}; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; background: #fafafa;">
                      <div style="background: #f8fafc; padding: 4px 8px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0;">
                        <span style="font-weight: 800; font-size: 10px; color: #1e293b; text-transform: uppercase;">Varyant: ${c.color}</span>
                        <span style="font-size: 10px; font-weight: 800; color: #0f172a;">
                          Miktar: <span style="color: #4f46e5; font-family: monospace;">${c.colorTotalStock} ${p.unit || 'Çift'}</span>
                        </span>
                      </div>

                      ${p.isFootwear && c.sizeList.length > 1 ? `
                        <div style="padding: 4px;">
                          <table style="width: 100%; border-collapse: collapse; font-size: 9px; text-align: center;">
                            <thead>
                              <tr style="background: #e2e8f0; color: #475569; font-weight: 800;">
                                <th style="padding: 2px 4px; text-align: left; border: 1px solid #cbd5e1; width: 70px;">Beden</th>
                                ${c.sizeList.map(s => `
                                  <th style="padding: 2px 4px; border: 1px solid #cbd5e1; font-weight: 900;">${s.size}</th>
                                `).join('')}
                                <th style="padding: 2px 4px; border: 1px solid #cbd5e1; background: #cbd5e1; font-weight: 900;">TOPLAM</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td style="padding: 3px 4px; text-align: left; font-weight: 700; border: 1px solid #cbd5e1;">Stok</td>
                                ${c.sizeList.map(s => `
                                  <td style="padding: 3px 4px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: 800; color: ${s.stock === 0 ? '#e11d48' : '#15803d'};">
                                    ${s.stock}
                                  </td>
                                `).join('')}
                                <td style="padding: 3px 4px; border: 1px solid #cbd5e1; font-weight: 900; background: #e0e7ff; color: #3730a3;">
                                  ${c.colorTotalStock}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      ` : `
                        <div style="padding: 4px 8px; font-size: 9px; color: #64748b; display: flex; gap: 14px;">
                          <span>Birim: <b>${p.unit}</b></span>
                          <span>Birim Fiyat: <b>₺${p.buyingPrice || 0}</b></span>
                          <span>Min Stok: <b>${p.minStock || 0} ${p.unit}</b></span>
                          ${c.boxBarcode ? `<span>Barkod: <b style="font-family: monospace;">${c.boxBarcode}</b></span>` : ''}
                        </div>
                      `}
                    </div>
                  `).join('')}
                </div>

              </div>
            `;
          }).join('')}
        </div>

        <!-- Footer -->
        <div style="margin-top: 14px; border-top: 1px solid #cbd5e1; padding-top: 6px; font-size: 8px; color: #94a3b8; display: flex; justify-content: space-between;">
          <span>DMR Nexus Ayakkabı & Envanter Yönetimi</span>
          <span>Yazdırıldı: ${new Date().toLocaleString('tr-TR')}</span>
        </div>

      </div>
    `;

    printHtml(html, { title: 'DMR Nexus Stok Detay Raporu' });
  };

  const handleExportExcel = () => {
    if (!processedProducts || processedProducts.length === 0) return;

    const headers = [
      'Tür / Kategori',
      'Ürün Kodu',
      'Model Adı',
      'Marka',
      'Alt Tür',
      'Renk / Varyant',
      'Numara / Beden',
      'Varyant Stok',
      'Toplam Stok',
      'Birim',
      'Alış Fiyatı (₺)',
      'Satış Fiyatı (₺)',
      'Barkod / Koli Barkodu',
      'Raf Konumu',
      'Durum'
    ];

    const rows: (string | number)[][] = [];

    processedProducts.forEach(p => {
      const typeLabel = CATEGORY_TYPE_META[p.categoryType]?.label || 'Mamül';
      const statusLabel = (p as any).isBroken ? 'KIRIK BEDEN' : p.isCritical ? 'KRİTİK STOK' : p.isOutOfStock ? 'TÜKENDİ' : 'NORMAL';

      if (p.colorRows && p.colorRows.length > 0) {
        p.colorRows.forEach(c => {
          if (p.isFootwear && c.sizeList && c.sizeList.length > 0) {
            c.sizeList.forEach(s => {
              rows.push([
                typeLabel,
                p.code,
                p.name,
                p.brand || '-',
                p.subType || '-',
                c.color,
                s.size,
                s.stock,
                p.finalStock,
                p.unit || 'Çift',
                p.buyingPrice || 0,
                p.sellingPrice || 0,
                s.barcode || c.boxBarcode || (p as any).barcode || '-',
                p.shelf || '-',
                statusLabel
              ]);
            });
          } else {
            rows.push([
              typeLabel,
              p.code,
              p.name,
              p.brand || '-',
              p.subType || '-',
              c.color,
              '-',
              c.colorTotalStock,
              p.finalStock,
              p.unit || 'Birim',
              p.buyingPrice || 0,
              p.sellingPrice || 0,
              c.boxBarcode || (p as any).barcode || '-',
              p.shelf || '-',
              statusLabel
            ]);
          }
        });
      } else {
        rows.push([
          typeLabel,
          p.code,
          p.name,
          p.brand || '-',
          p.subType || '-',
          '-',
          '-',
          p.finalStock,
          p.finalStock,
          p.unit || 'Birim',
          p.buyingPrice || 0,
          p.sellingPrice || 0,
          (p as any).barcode || '-',
          p.shelf || '-',
          statusLabel
        ]);
      }
    });

    exportToCsv('Stok_Detay_Asorti_Raporu.csv', headers, rows);
  };

  return (
    <div className="space-y-4" id="stock-detail-report-container">
      <PageHeader
        title="Stok Detay ve Asorti Raporu"
        subtitle="Envanter, varyant ve beden dağılımını inceleyin"
        badge={`${processedProducts.length} stok listeleniyor`}
        icon={Package}
        iconColor="indigo"
        actions={<div className="flex flex-wrap items-center gap-2">
          {/* Yoğunluk Switcher */}
          <div role="group" aria-label="Satır yoğunluğu" className="flex items-center bg-surface-raised p-0.5 rounded-control border border-line">
            <button
              type="button"
              onClick={() => setRowDensity('compact')}
              aria-pressed={rowDensity === 'compact'}
              className={cn(
                "px-2.5 py-1.5 rounded-control text-xs font-bold transition-all flex items-center gap-1.5",
                rowDensity === 'compact'
                  ? "bg-surface-active text-fg-inverted shadow-card"
                  : "text-fg-muted hover:bg-surface-hover hover:text-fg-strong"
              )}
              title="Kompakt Tasarım (Ekrana maksimum satır sığdırır)"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Kompakt</span>
            </button>
            <button
              type="button"
              onClick={() => setRowDensity('normal')}
              aria-pressed={rowDensity === 'normal'}
              className={cn(
                "px-2.5 py-1.5 rounded-control text-xs font-bold transition-all flex items-center gap-1.5",
                rowDensity === 'normal'
                  ? "bg-surface-active text-fg-inverted shadow-card"
                  : "text-fg-muted hover:bg-surface-hover hover:text-fg-strong"
              )}
              title="Standart Tasarım"
            >
              <Eye className="w-3 h-3" />
              <span>Standart</span>
            </button>
          </div>

          {/* Sync Button */}
          <Button
            variant="secondary"
            onClick={handleManualSync}
            loading={isSyncing}
            icon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
            className={syncSuccess ? 'text-success' : undefined}
            title="Model ve varyant stoklarını asorti oranlarına göre eşitle / onar"
          >
            <span>{isSyncing ? "Eşitleniyor..." : syncSuccess ? "Eşitlendi ✓" : "Stokları Onar"}</span>
          </Button>

          {/* Expand/Collapse All */}
          <Button
            variant="secondary"
            onClick={toggleExpandAll}
            title={areAllExpanded ? "Tüm modellerin alt detayını daralt" : "Tüm modellerin alt detayını genişlet"}
          >
            {areAllExpanded ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Tümünü Daralt</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Tümünü Genişlet</span>
              </>
            )}
          </Button>

          {/* Excel Export */}
          <Button
            variant="secondary"
            onClick={handleExportExcel}
            title="Stok ve varyant detaylarını Excel / CSV formatında indirin"
          >
            <FileDown className="w-3.5 h-3.5" /> 
            <span>Excel'e Aktar</span>
          </Button>

          {/* Print Report */}
          <Button
            variant="primary"
            onClick={handlePrint}
          >
            <Printer className="w-3.5 h-3.5" /> 
            <span>Yazdır / PDF</span>
          </Button>
        </div>}
      />

      {/* ════════════════════════════════════════════════════════════════
          2. NET VE BELİRGİN KRİTER SEÇİCİ: MAMÜL vs MAMÜL DIŞI
         ════════════════════════════════════════════════════════════════ */}
      <div className="space-y-3 rounded-card border border-line bg-surface p-3 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-fg-strong">Stok sınıfı</h3>
            <p className="text-xs text-fg-muted">Görüntülenecek stok grubunu seçin.</p>
          </div>
          <span className="text-xs text-fg-muted">
            {stockClassification === 'all'
              ? 'Tüm kayıtlar görüntüleniyor'
              : stockClassification === 'mamul'
                ? 'Bitmiş mamuller görüntüleniyor'
                : 'Hammadde, yarı mamul ve aksesuarlar görüntüleniyor'}
          </span>
        </div>
        <SegmentedFilter
          ariaLabel="Stok sınıfı"
          options={[
            { key: 'all', label: 'Tüm Stoklar', count: classificationCounts.total, icon: <Layers aria-hidden="true" /> },
            { key: 'mamul', label: 'Mamuller', count: classificationCounts.mamul, icon: <Box aria-hidden="true" /> },
            { key: 'mamul_disi', label: 'Mamul Dışı', count: classificationCounts.mamulDisi, icon: <Boxes aria-hidden="true" /> },
          ]}
          value={stockClassification}
          onChange={key => {
            setStockClassification(key as StockClassification);
            if (key !== 'mamul_disi') setSubClassification('all');
          }}
        />
        {stockClassification === 'mamul_disi' && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-label font-bold text-fg-muted">Mamul dışı türü</span>
            <SegmentedFilter
              ariaLabel="Mamul dışı türü"
              size="sm"
              options={[
                { key: 'all', label: 'Tümü', count: classificationCounts.mamulDisi },
                { key: 'semi_finished', label: 'Yarı Mamul', count: classificationCounts.semiFinished, icon: <Scissors aria-hidden="true" /> },
                { key: 'raw_material', label: 'Hammadde', count: classificationCounts.rawMaterial, icon: <Layers aria-hidden="true" /> },
                { key: 'accessory', label: 'Aksesuar ve Sarf', count: classificationCounts.accessory, icon: <Tag aria-hidden="true" /> },
              ]}
              value={subClassification}
              onChange={key => setSubClassification(key as SubClassification)}
            />
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          3. ARAMA VE İKİNCİL FİLTRELEME ÇUBUĞU
         ════════════════════════════════════════════════════════════════ */}
      <div className="space-y-3 rounded-card border border-line bg-surface p-3 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
            <input
              type="search"
              aria-label="Stoklarda ara"
              placeholder="Model adı, kod, renk, raf veya barkod ara"
              className={cn(controlClass(), 'pl-9 pr-9')}
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                aria-label="Aramayı temizle"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-control px-2 py-1 text-fg-muted hover:bg-surface-hover hover:text-fg-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ×
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {categories.length > 0 && (
              <select
                aria-label="Kategori"
                value={selectedCategory}
                onChange={event => setSelectedCategory(event.target.value)}
                className={cn(controlClass(), 'w-auto min-w-36')}
              >
                <option value="all">Tüm Kategoriler ({categories.length})</option>
                {categories.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
            )}
            {brands.length > 0 && (
              <select
                aria-label="Marka"
                value={selectedBrand}
                onChange={event => setSelectedBrand(event.target.value)}
                className={cn(controlClass(), 'w-auto min-w-32')}
              >
                <option value="all">Tüm Markalar ({brands.length})</option>
                {brands.map(brand => <option key={brand} value={brand}>{brand}</option>)}
              </select>
            )}
            <select
              aria-label="Sıralama"
              value={sortBy}
              onChange={event => setSortBy(event.target.value as typeof sortBy)}
              className={cn(controlClass(), 'w-auto min-w-36')}
            >
              <option value="name">İsim (A-Z)</option>
              <option value="code">Ürün Kodu</option>
              <option value="stock_desc">Stok (Çoktan Aza)</option>
              <option value="stock_asc">Stok (Azdan Çoğa)</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="flex items-center gap-1 text-label font-bold text-fg-muted"><Filter className="h-3.5 w-3.5" aria-hidden="true" /> Durum</span>
          <SegmentedFilter
            ariaLabel="Stok durumu"
            size="sm"
            options={[
              { key: 'all', label: 'Tümü', count: statusCounts.all },
              { key: 'broken', label: 'Kırık Beden', count: statusCounts.broken, icon: <AlertTriangle aria-hidden="true" /> },
              { key: 'critical', label: 'Kritik Stok', count: statusCounts.critical },
              { key: 'out_of_stock', label: 'Tükenenler', count: statusCounts.out_of_stock },
            ]}
            value={filterType}
            onChange={key => setFilterType(key as typeof filterType)}
          />
          <span className="ml-auto text-xs font-semibold text-fg-muted">
            Toplam Stok: <strong className="font-mono text-fg-strong">{summaryStats.totalStock}</strong> adet/çift
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          4. STOK LİSTESİ: ŞIK, DÜZGÜN VE DARALTILDIĞINDA KOMPAKT SATIRLAR
         ════════════════════════════════════════════════════════════════ */}
      <div className={cn("transition-all", rowDensity === 'compact' ? "space-y-1.5" : "space-y-2.5")}>
        {processedProducts.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Seçilen Kriterlere Uygun Kayıt Bulunamadı</h3>
            <p className="text-xs text-slate-400 mt-1">Arama teriminizi veya "Mamül / Mamül Dışı" kriter seçiminizi değiştirerek tekrar deneyebilirsiniz.</p>
          </div>
        ) : (
          processedProducts.map((p) => (
            <React.Fragment key={p.id || p.code}>
              <StockDetailRow
                p={p}
                isExpanded={isProductExpanded(p.id)}
                rowDensity={rowDensity}
                copiedBarcode={copiedBarcode}
                onToggleExpand={toggleProductExpand}
                onCopyBarcode={handleCopyBarcode}
              />
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
}
