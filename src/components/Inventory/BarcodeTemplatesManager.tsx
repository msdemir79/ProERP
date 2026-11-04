import React, { useState } from 'react';
import {
  Barcode,
  Plus,
  Search,
  Printer,
  Copy,
  Trash2,
  Edit3,
  RefreshCw
} from 'lucide-react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { BarcodeTemplate } from '../../types';
import { barcodeTemplateService } from '../../services/barcodeTemplateService';
import { LabelTemplateDesignerModal } from './LabelTemplateDesignerModal';
import DataGrid, { GridColumn, StatusPill } from '../Common/DataGrid';
import { turkishIncludes } from '../../lib/turkishUtils';
import { cn } from '../../lib/utils';
import { confirmDialog } from '../../lib/feedback';
import Button from '../Common/Button';
import EmptyState from '../Common/EmptyState';
import { controlClass } from '../Common/Field';

const getEffectiveSize = (t: BarcodeTemplate) => {
  const isLandscape = t.orientation === 'landscape';
  return {
    w: isLandscape ? Math.max(t.widthMm, t.heightMm) : Math.min(t.widthMm, t.heightMm),
    h: isLandscape ? Math.min(t.widthMm, t.heightMm) : Math.max(t.widthMm, t.heightMm),
  };
};

const getTypeLabel = (type: string): string => {
  switch (type) {
    case 'shipping': return 'Lojistik Koli';
    case 'box': return 'Asorti Koli';
    case 'shoe_box': return 'Tekil Kutu';
    case 'shelf': return 'Raf / Stok';
    default: return 'Özel Şablon';
  }
};

export const BarcodeTemplatesManager: React.FC = () => {
  const templates = useApiQuery(() => api.barcodeTemplates.list(), [], ['barcodeTemplates']) || [];
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSize, setFilterSize] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  
  const [isDesignerModalOpen, setIsDesignerModalOpen] = useState(false);
  const [selectedTemplateForEdit, setSelectedTemplateForEdit] = useState<BarcodeTemplate | null>(null);
  const [printingTemplateId, setPrintingTemplateId] = useState<number | null>(null);

  // Filtered Templates
  const filteredTemplates = templates.filter(t => {
    const matchesSearch = turkishIncludes(t.name || '', searchTerm) ||
      turkishIncludes(t.description || '', searchTerm) ||
      turkishIncludes(`${t.widthMm}x${t.heightMm}`, searchTerm);

    const matchesSize = filterSize === 'all' || 
      (filterSize === '100x150' && (t.presetSize === '100x150' || (t.widthMm === 100 && t.heightMm === 150))) ||
      (filterSize === '60x40' && (t.presetSize === '60x40' || (t.widthMm === 60 && t.heightMm === 40))) ||
      (filterSize === '100x80' && (t.presetSize === '100x80' || (t.widthMm === 100 && t.heightMm === 80))) ||
      (filterSize === 'other' && !['100x150', '60x40', '100x80'].includes(t.presetSize));

    const matchesType = filterType === 'all' || t.type === filterType;

    return matchesSearch && matchesSize && matchesType;
  });

  // Action Handlers
  const handleOpenNew = () => {
    setSelectedTemplateForEdit(null);
    setIsDesignerModalOpen(true);
  };

  const handleEdit = (template: BarcodeTemplate) => {
    setSelectedTemplateForEdit(template);
    setIsDesignerModalOpen(true);
  };

  const handleDuplicate = async (id: number) => {
    await barcodeTemplateService.duplicate(id);
  };

  const handleDelete = async (id: number, name: string) => {
    if (await confirmDialog(`"${name}" şablonunu silmek istediğinize emin misiniz?`)) {
      await barcodeTemplateService.delete(id);
    }
  };

  const handleResetDefaults = async () => {
    if (await confirmDialog('Tüm barkod şablonları fabrika ayarlarına sıfırlansın mı? Mevcut özel tasarımlarınız silinecektir.', { confirmText: 'Sıfırla' })) {
      await barcodeTemplateService.resetDefaults();
    }
  };

  const handleQuickTestPrint = async (template: BarcodeTemplate) => {
    if (!template.id) return;
    setPrintingTemplateId(template.id);
    try {
      await barcodeTemplateService.printDirect(template, {
        companyName: template.config?.companyHeaderText || 'DMR Nexus',
        productCode: 'AYK-OXF-2026',
        productName: 'Hakiki Deri Erkek Klasik Oxford',
        color: 'SİYAH / BLACK',
        material: 'Dana Derisi',
        size: '42',
        assortmentMatrix: { '40': 1, '41': 2, '42': 3, '43': 3, '44': 2, '45': 1 },
        totalPairs: 12,
        barcode: '8690123456789',
        price: 1850,
        currency: 'TL',
        orderNumber: 'SIP-2026-0042',
        customerName: 'METRO AYAKKABI SAN. TİC. LTD. ŞTİ.',
        boxNumber: 1,
        totalBoxes: 10,
        weightKg: 14.5,
        desi: 18,
        customNote: template.config?.customNoteText || 'DİKKAT: NEMDEN KORUYUNUZ.'
      });
    } catch (err) {
      console.error('Test baskı hatası:', err);
    } finally {
      setPrintingTemplateId(null);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'shipping':
        return <StatusPill tone="blue">Lojistik Koli</StatusPill>;
      case 'box':
        return <StatusPill tone="violet">Asorti Koli</StatusPill>;
      case 'shoe_box':
        return <StatusPill tone="amber">Tekil Kutu</StatusPill>;
      case 'shelf':
        return <StatusPill tone="green">Raf / Stok</StatusPill>;
      default:
        return <StatusPill tone="slate">Özel Şablon</StatusPill>;
    }
  };

  const templateColumns = React.useMemo<GridColumn<BarcodeTemplate>[]>(() => [
    {
      key: 'type',
      title: 'Tür',
      render: (t) => getTypeBadge(t.type),
      filterValue: (t) => getTypeLabel(t.type),
    },
    {
      key: 'size',
      title: 'Boyut',
      align: 'center',
      render: (t) => {
        const { w, h } = getEffectiveSize(t);
        const is100x150 = (t.widthMm === 100 && t.heightMm === 150) || t.presetSize === '100x150';
        const is60x40 = (t.widthMm === 60 && t.heightMm === 40) || t.presetSize === '60x40';
        return (
          <span className="inline-flex items-center gap-1.5 rounded-control bg-surface-raised px-2 py-0.5 font-mono text-xs font-bold text-fg-strong">
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              is100x150 ? "bg-blue-500" : is60x40 ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-600"
            )} />
            {w} × {h} mm
          </span>
        );
      },
      filterValue: (t) => {
        const { w, h } = getEffectiveSize(t);
        return `${w}x${h}`;
      },
    },
    {
      key: 'orientation',
      title: 'Yön',
      align: 'center',
      render: (t) => (
        <span className="text-label font-semibold text-fg-muted">
          {t.orientation === 'portrait' ? 'Dikey' : 'Yatay'}
        </span>
      ),
      filterValue: (t) => t.orientation === 'portrait' ? 'Dikey' : 'Yatay',
    },
    {
      key: 'name',
      title: 'Şablon',
      render: (t) => {
        const { w, h } = getEffectiveSize(t);
        return (
          <div>
            <h3 className="text-sm font-bold text-fg-strong">{t.name}</h3>
            <p className="line-clamp-2 text-xs leading-relaxed text-fg-muted">
              {t.description || `${w}x${h} mm termal etiket şablonu.`}
            </p>
          </div>
        );
      },
      filterValue: (t) => `${t.name} ${t.description || ''}`,
    },
    {
      key: 'layers',
      title: 'Katmanlar',
      filterable: false,
      render: (t) => (
        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
          {t.config?.showCompanyHeader && <span className="bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Firma Ünvanı</span>}
          {t.config?.showAssortmentTable && <span className="bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Asorti Matrisi</span>}
          {t.config?.showBarcode && <span className="bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Barkod ({t.config?.barcodeType || 'CODE-128'})</span>}
          {t.config?.showLogisticsIcons && <span className="bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Taşıma Piktogramı</span>}
          {t.config?.showPrice && <span className="bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Fiyat</span>}
          {t.config?.showBoxSerial && <span className="bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Koli No</span>}
        </div>
      ),
    },
  ], []);

  return (
    <div className="space-y-4">
      
      {/* 1. ÜST BAŞLIK VE HIZLI AKSİYONLAR */}
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-fg-strong">
            <Barcode className="h-4 w-4 text-brand-fg" aria-hidden="true" />
            <span>Termal Barkod ve Etiket Şablonları</span>
          </h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            Koli, ayakkabı kutusu ve özel termal rulo boyutları için tasarımlar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={handleResetDefaults}
            title="Fabrika varsayılan şablonlarını geri yükle"
          >
            Varsayılanları Yükle
          </Button>

          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={handleOpenNew}
          >
            Yeni Şablon Tasarla
          </Button>
        </div>
      </div>

      {/* 2. HIZLI BOYUT KARTLARI (PRESETS SUMMARY) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setFilterSize(filterSize === '100x150' ? 'all' : '100x150')}
          aria-pressed={filterSize === '100x150'}
          className={cn(
            "p-3.5 rounded-card border text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            filterSize === '100x150'
              ? "bg-brand text-on-brand border-brand shadow-card"
              : "bg-surface text-fg-strong border-line hover:border-brand"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xl">📦</span>
            <span className={cn(
              "text-[10px] font-mono font-black px-1.5 py-0.5 rounded",
              filterSize === '100x150' ? "bg-white/20 text-on-brand" : "bg-surface-raised text-fg-muted"
            )}>
              100x150 mm
            </span>
          </div>
          <div className="text-xs font-bold">
            Lojistik Koli Barkodu
          </div>
          <div className="text-2xs opacity-75">
            Kargo, ambar & sevkiyat
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterSize(filterSize === '60x40' ? 'all' : '60x40')}
          aria-pressed={filterSize === '60x40'}
          className={cn(
            "p-3.5 rounded-card border text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            filterSize === '60x40'
              ? "bg-brand text-on-brand border-brand shadow-card"
              : "bg-surface text-fg-strong border-line hover:border-brand"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xl">👟</span>
            <span className={cn(
              "text-[10px] font-mono font-black px-1.5 py-0.5 rounded",
              filterSize === '60x40' ? "bg-white/20 text-on-brand" : "bg-surface-raised text-fg-muted"
            )}>
              60x40 mm
            </span>
          </div>
          <div className="text-xs font-bold">
            Tekil Kutu Barkodu
          </div>
          <div className="text-2xs opacity-75">
            Tek çift kutu & EAN-13
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterSize(filterSize === '100x80' ? 'all' : '100x80')}
          aria-pressed={filterSize === '100x80'}
          className={cn(
            "p-3.5 rounded-card border text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            filterSize === '100x80'
              ? "bg-brand text-on-brand border-brand shadow-card"
              : "bg-surface text-fg-strong border-line hover:border-brand"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xl">🏷️</span>
            <span className={cn(
              "text-[10px] font-mono font-black px-1.5 py-0.5 rounded",
              filterSize === '100x80' ? "bg-white/20 text-on-brand" : "bg-surface-raised text-fg-muted"
            )}>
              100x80 mm
            </span>
          </div>
          <div className="text-xs font-bold">
            Asortili Koli Etiketi
          </div>
          <div className="text-2xs opacity-75">
            8-10-12 çift asorti matrisi
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterSize(filterSize === 'other' ? 'all' : 'other')}
          aria-pressed={filterSize === 'other'}
          className={cn(
            "p-3.5 rounded-card border text-left transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            filterSize === 'other'
              ? "bg-brand text-on-brand border-brand shadow-card"
              : "bg-surface text-fg-strong border-line hover:border-brand"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xl">📐</span>
            <span className={cn(
              "text-[10px] font-mono font-black px-1.5 py-0.5 rounded",
              filterSize === 'other' ? "bg-white/20 text-on-brand" : "bg-surface-raised text-fg-muted"
            )}>
              Özel & Diğer
            </span>
          </div>
          <div className="text-xs font-bold">
            80x60, 50x30, 40x25 mm
          </div>
          <div className="text-2xs opacity-75">
            Raf, aksesuar & mini etiketler
          </div>
        </button>
      </div>

      {/* 3. ŞABLON LİSTESİ (DataGrid) */}
      {filteredTemplates.length === 0 ? (
        <EmptyState
          className="rounded-card border border-line bg-surface shadow-card"
          icon={<Barcode aria-hidden="true" />}
          title={templates.length === 0 ? 'Henüz barkod şablonu yok' : 'Filtrelere uygun şablon bulunamadı'}
          description={templates.length === 0
            ? 'Yeni bir barkod şablonu tasarlayabilir veya varsayılanları yükleyebilirsiniz.'
            : 'Arama ve filtreleri temizleyerek tüm şablonları görüntüleyebilirsiniz.'}
          action={templates.length === 0
            ? <Button variant="primary" onClick={handleOpenNew} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>Yeni Şablon Tasarla</Button>
            : <Button variant="secondary" onClick={() => { setSearchTerm(''); setFilterSize('all'); setFilterType('all'); }}>Filtreleri Temizle</Button>}
        />
      ) : (
        <DataGrid
          columns={templateColumns}
          data={filteredTemplates}
          rowKey={(t) => t.id ?? t.name}
          toolbar={(
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Şablon adı, boyut veya açıklama ara..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  aria-label="Barkod şablonlarında ara"
                  className={cn(controlClass(), 'pl-9')}
                />
              </div>

              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                aria-label="Şablon kullanım amacı"
                className={cn(controlClass(), 'sm:w-auto')}
              >
                <option value="all">Tüm Kullanım Amaçları</option>
                <option value="shipping">Lojistik Koli</option>
                <option value="box">Asortili Koli</option>
                <option value="shoe_box">Tekil Kutu</option>
                <option value="shelf">Raf & Depo</option>
                <option value="custom">Özel Boyut</option>
              </select>
            </div>
          )}
          rowActions={(t) => (
            <>
              <Button
                variant="secondary"
                size="sm"
                iconOnly
                onClick={() => handleQuickTestPrint(t)}
                disabled={printingTemplateId === t.id}
                aria-label={`${t.name} için hızlı test baskısı al`}
                title="Hızlı Test Baskısı Al"
              >
                <Printer className="w-4 h-4" aria-hidden="true" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                iconOnly
                onClick={() => t.id && handleDuplicate(t.id)}
                aria-label={`${t.name} şablonunu kopyala`}
                title="Şablonu Kopyala"
              >
                <Copy className="w-4 h-4" aria-hidden="true" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                iconOnly
                onClick={() => t.id && handleDelete(t.id, t.name)}
                aria-label={`${t.name} şablonunu sil`}
                className="text-danger"
                title="Şablonu Sil"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </Button>

              <Button
                variant="subtle"
                size="sm"
                onClick={() => handleEdit(t)}
              >
                <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Tasarla / Düzenle</span>
              </Button>
            </>
          )}
        />
      )}

      {/* TASARIMCI / DÜZENLEME MODALI */}
      {isDesignerModalOpen && (
        <LabelTemplateDesignerModal
          isOpen={isDesignerModalOpen}
          onClose={() => {
            setIsDesignerModalOpen(false);
            setSelectedTemplateForEdit(null);
          }}
          templateToEdit={selectedTemplateForEdit}
        />
      )}

    </div>
  );
};
