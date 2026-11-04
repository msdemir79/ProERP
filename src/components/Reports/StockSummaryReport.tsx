import React from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { Search, AlertTriangle, Printer, FileDown, Palette } from 'lucide-react';
import DataGrid, { StatusPill, type GridColumn } from '../Common/DataGrid';
import { cn } from '../../lib/utils';
import { printTabularReport } from '../../lib/printService';
import { exportToCsv } from '../../lib/exportService';
import { getColorSwatch, formatColorQty, hexFromColorRefs } from '../../lib/colorSwatches';
import type { Product } from '../../types';
import { getCartonSize } from '../../lib/carton';

interface ColorStockEntry {
  color: string;
  stock: number;
  boxes: number;
}

interface SummaryRow extends Product {
  koliSize: number;
  unitLabel: string;
  hasVariants: boolean;
  colorEntries: ColorStockEntry[];
  definedColors: string[];
}

const MAX_VISIBLE_COLORS = 4;

export default function StockSummaryReport() {
  const products = useApiQuery(() => api.products.list(), [], ['products']);
  const templates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']);
  const [searchTerm, setSearchTerm] = React.useState('');

  const rows = React.useMemo<SummaryRow[]>(() => {
    if (!products) return [];

    const search = searchTerm.toLowerCase().trim();

    return products
      .filter(p => !search ||
        p.name?.toLowerCase().includes(search) ||
        p.code?.toLowerCase().includes(search) ||
        p.brand?.toLowerCase().includes(search) ||
        p.category?.toLowerCase().includes(search)
      )
      .map(p => {
        // Koli içi adet: asorti toplamı, asorti yoksa karttaki koli çarpanı (tek kaynak: lib/carton)
        const koliSize = getCartonSize(p, templates);
        const unitLabel = p.unit || 'Adet';

        // Renk bazlı stok dağılımı: yalnızca varyant (renk+beden) stok kayıtları varsa hesaplanır
        const colorStockMap = new Map<string, number>();
        (p.variantBarcodes || []).forEach(v => {
          const color = v.color || 'Genel';
          colorStockMap.set(color, (colorStockMap.get(color) || 0) + (v.stock || 0));
        });

        const colorEntries: ColorStockEntry[] = Array.from(colorStockMap.entries()).map(([color, stock]) => ({
          color,
          stock,
          boxes: koliSize > 1 ? stock / koliSize : 0
        }));

        const hasVariants = (p.variantBarcodes || []).length > 0;

        return {
          ...p,
          koliSize,
          unitLabel,
          hasVariants,
          colorEntries,
          definedColors: hasVariants ? [] : (p.colors || [])
        };
      });
  }, [products, templates, searchTerm]);

  const colorEntryText = (row: SummaryRow, entry: ColorStockEntry) =>
    row.koliSize > 1
      ? `${entry.color}: ${formatColorQty(entry.stock, row.koliSize, row.unitLabel)} (${entry.stock} ${row.unitLabel})`
      : `${entry.color}: ${entry.stock} ${row.unitLabel}`;

  const colorCellText = (row: SummaryRow) => {
    if (row.colorEntries.length > 0) {
      return row.colorEntries.map(e => colorEntryText(row, e)).join(' | ');
    }
    if (row.definedColors.length > 0) {
      return `${row.definedColors.join(', ')} (varyant stok kaydı yok)`;
    }
    return '-';
  };

  const handlePrint = () => {
    if (rows.length === 0) return;

    const headers = ['KOD', 'ÜRÜN / MODEL', 'MARKA', 'KATEGORİ', 'RENK DAĞILIMI', 'STOK MİKTARI', 'BİRİM', 'DURUM'];
    const printRows = rows.map(p => [
      p.code,
      p.name,
      p.brand || '-',
      p.category || 'Genel',
      colorCellText(p),
      p.stock.toString(),
      p.unitLabel,
      p.stock <= p.minStock ? 'KRİTİK' : 'NORMAL'
    ]);
    const totalStock = rows.reduce((sum, p) => sum + (p.stock || 0), 0);
    const criticalCount = rows.filter(p => p.stock <= p.minStock).length;
    const variantCount = rows.filter(p => p.colorEntries.length > 0).length;

    printTabularReport(
      'Stok Özet Raporu',
      'Genel stok durumu, renk bazlı dağılım ve kritik seviye kontrolleri',
      headers,
      printRows,
      [
        { label: 'Toplam Model Sayısı', value: rows.length },
        { label: 'Toplam Stok Adedi', value: totalStock },
        { label: 'Renkli / Varyantlı Model', value: variantCount },
        { label: 'Kritik Stok Uyarısı', value: `${criticalCount} Model` }
      ]
    );
  };

  const handleExportExcel = () => {
    if (rows.length === 0) return;
    const headers = ['Ürün Kodu', 'Ürün / Model Adı', 'Marka', 'Kategori', 'Renk Sayısı', 'Renk Bazlı Stok Dağılımı', 'Stok Miktarı', 'Birim', 'Kritik Seviye', 'Durum'];
    const csvRows = rows.map(p => [
      p.code,
      p.name,
      p.brand || '-',
      p.category || 'Genel',
      p.colorEntries.length || p.definedColors.length || 0,
      colorCellText(p),
      p.stock,
      p.unitLabel,
      p.minStock || 0,
      p.stock <= (p.minStock || 0) ? 'KRİTİK STOK' : 'NORMAL'
    ]);
    exportToCsv('Stok_Ozet_Raporu.csv', headers, csvRows);
  };

  const renderColorCell = (row: SummaryRow) => {
    if (row.colorEntries.length === 0) {
      if (row.definedColors.length > 0) {
        return (
          <div className="flex flex-wrap items-center gap-1">
            {row.definedColors.map(color => {
              const sw = getColorSwatch(color);
              return (
                <span
                  key={color}
                  title="Renk tanımlı, varyant stok kaydı yok"
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 bg-white dark:bg-slate-900 px-1.5 py-0.5"
                >
                  <span className="w-2 h-2 rounded-full border shrink-0" style={{ backgroundColor: hexFromColorRefs(row.colorRefs, color) || sw.bg, borderColor: sw.border }} />
                  <span className="text-[9px] font-bold uppercase text-slate-400">{color}</span>
                </span>
              );
            })}
          </div>
        );
      }
      return <span className="text-slate-300 text-[10px] font-bold">—</span>;
    }

    const visible = row.colorEntries.slice(0, MAX_VISIBLE_COLORS);
    const hidden = row.colorEntries.slice(MAX_VISIBLE_COLORS);

    return (
      <div className="flex flex-wrap items-center gap-1">
        {visible.map(entry => {
          const sw = getColorSwatch(entry.color);
          return (
            <span
              key={entry.color}
              title={colorEntryText(row, entry)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5",
                entry.stock <= 0 ? "border-rose-200 bg-rose-50/60" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              )}
            >
              <span className="w-2 h-2 rounded-full border shrink-0" style={{ backgroundColor: hexFromColorRefs(row.colorRefs, entry.color) || sw.bg, borderColor: sw.border }} />
              <span className="text-[9px] font-black uppercase text-slate-600 dark:text-slate-300">{entry.color}</span>
              <span className={cn(
                "text-[9px] font-mono font-black",
                entry.stock <= 0 ? "text-rose-600" : "text-slate-900 dark:text-slate-100"
              )}>
                {formatColorQty(entry.stock, row.koliSize, row.unitLabel)}
              </span>
              {row.koliSize > 1 && (
                <span className="text-[8px] font-bold text-slate-400">({entry.stock} {row.unitLabel})</span>
              )}
            </span>
          );
        })}
        {hidden.length > 0 && (
          <span
            title={hidden.map(e => colorEntryText(row, e)).join('\n')}
            className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-black text-indigo-700 cursor-help"
          >
            +{hidden.length} renk
          </span>
        )}
      </div>
    );
  };

  const columns: GridColumn<SummaryRow>[] = [
    {
      key: 'code',
      title: 'Kod',
      render: (row) => (
        <span className="font-mono text-[11px] font-bold text-slate-600">{row.code}</span>
      ),
    },
    {
      key: 'name',
      title: 'Ürün/Model',
      render: (row) => (
        <div>
          <div className="font-bold text-slate-800 dark:text-slate-200 uppercase text-[11px]">{row.name}</div>
          <div className="text-[9px] text-slate-400 font-bold uppercase">{row.brand}</div>
        </div>
      ),
      filterValue: (row) => `${row.name || ''} ${row.brand || ''}`,
    },
    {
      key: 'category',
      title: 'Kategori',
      render: (row) => (
        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600">
          {row.category || 'Genel'}
        </span>
      ),
      filterValue: (row) => row.category || 'Genel',
    },
    {
      key: 'colorEntries',
      title: 'Renk Dağılımı',
      width: '280px',
      render: (row) => renderColorCell(row),
      filterValue: (row) => colorCellText(row),
    },
    {
      key: 'stock',
      title: 'Miktar',
      align: 'right',
      render: (row) => (
        <span className={cn(
          "font-bold font-mono",
          row.stock <= row.minStock ? "text-rose-600" : "text-slate-900 dark:text-slate-100"
        )}>
          {row.stock}
        </span>
      ),
    },
    {
      key: 'unitLabel',
      title: 'Birim',
      align: 'right',
      render: (row) => (
        <span className="text-slate-400 text-[10px] uppercase font-bold">{row.unitLabel}</span>
      ),
    },
    {
      key: 'status',
      title: 'Durum',
      align: 'right',
      render: (row) => row.stock <= row.minStock ? (
        <StatusPill tone="amber"><AlertTriangle className="w-3 h-3" /> Kritik</StatusPill>
      ) : (
        <StatusPill tone="green">Normal</StatusPill>
      ),
      filterValue: (row) => row.stock <= row.minStock ? 'Kritik' : 'Normal',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Stok Özet Raporu</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Genel stok durumunu, renk bazlı dağılımı ve miktar özetlerini görüntüleyin.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer shadow-xs"
          >
            <Printer className="w-4 h-4" /> Yazdır
          </button>
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-sm cursor-pointer"
          >
            <FileDown className="w-4 h-4" /> Excel'e Aktar
          </button>
        </div>
      </div>

      <DataGrid<SummaryRow>
        columns={columns}
        data={rows}
        rowKey="id"
        loading={!products}
        emptyMessage={!products || products.length === 0 ? 'Gösterilecek veri bulunamadı.' : 'Aramanızla eşleşen ürün bulunamadı.'}
        toolbar={
          <>
            <div className="relative max-w-md w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="ARAMA YAP..."
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500 text-[10px] font-bold uppercase tracking-widest transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              <Palette className="w-3.5 h-3.5 text-indigo-500" />
              Renk dağılımı varyant stok kayıtlarından hesaplanır
            </div>
          </>
        }
      />
    </div>
  );
}
