import React, { useState } from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { Trash2, Ruler, Barcode } from 'lucide-react';
import { inventoryService } from '../../services/inventoryService';
import DataGrid, { GridColumn } from '../Common/DataGrid';
import { AssortmentTemplate } from '../../types';
import { BarcodeTemplatesManager } from './BarcodeTemplatesManager';
import { showToast, confirmDialog } from '../../lib/feedback';
import PageHeader from '../PageHeader';
import Button from '../Common/Button';
import SegmentedFilter from '../Common/SegmentedFilter';
import { Field, Input } from '../Common/Field';

export default function Templates() {
  const [activeTab, setActiveTab] = useState<'barcode' | 'assortment'>('barcode');

  // Assortment State
  const assortmentTemplates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']) || [];
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateItem, setNewTemplateItem] = useState({ size: '', quantity: 1 });
  const [newTemplateItems, setNewTemplateItems] = useState<{size: string, quantity: number}[]>([]);
  const sizeInputRef = React.useRef<HTMLInputElement>(null);

  const handleAddTemplateItem = () => {
    if (!newTemplateItem.size || newTemplateItem.quantity <= 0) return;
    if (newTemplateItems.find(i => i.size === newTemplateItem.size)) {
      showToast('Bu beden zaten eklenmiş.', 'warning');
      return;
    }
    setNewTemplateItems([...newTemplateItems, { ...newTemplateItem }]);
    setNewTemplateItem({ size: '', quantity: 1 });
    sizeInputRef.current?.focus();
  };

  const removeTemplateItem = (size: string) => {
    setNewTemplateItems(newTemplateItems.filter(i => i.size !== size));
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName || newTemplateItems.length === 0) return;
    await inventoryService.addAssortmentTemplate({
      name: newTemplateName,
      items: newTemplateItems
    });
    setNewTemplateName('');
    setNewTemplateItems([]);
    setNewTemplateItem({ size: '', quantity: 1 });
  };

  const deleteTemplate = async (id: number) => {
    if (await confirmDialog('Bu asorti şablonunu silmek istediğinize emin misiniz?')) {
      await api.assortmentTemplates.remove(id);
    }
  };

  const templateColumns = React.useMemo<GridColumn<AssortmentTemplate>[]>(() => [
    {
      key: 'name',
      title: 'Şablon Adı',
      render: (t) => (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-control bg-brand-soft flex items-center justify-center text-brand-fg shrink-0">
            <Ruler className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-fg-strong">{t.name}</h4>
            <p className="text-label text-fg-muted font-semibold">
              Toplam: {t.items.reduce((acc, curr) => acc + curr.quantity, 0)} çift / koli
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'items',
      title: 'Beden Dağılımı',
      filterable: false,
      render: (t) => (
        <div className="flex flex-wrap gap-2">
          {t.items.map((item, i) => (
            <div key={i} className="px-3 py-2 bg-surface-raised border border-line rounded-control flex flex-col items-center min-w-[50px]">
              <span className="text-label font-bold text-fg-muted">No</span>
              <span className="text-xs font-black text-fg-strong">{item.size}</span>
              <div className="w-full h-px bg-line my-1" />
              <span className="text-label font-bold text-brand-fg">{item.quantity}</span>
            </div>
          ))}
        </div>
      ),
    },
  ], []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Şablon Yönetimi"
        subtitle="Koli ve kutu barkod tasarımları ile asorti dağılım standartları"
        badge="Stok Yönetimi"
        icon={Barcode}
        iconColor="indigo"
      />

      <SegmentedFilter
        ariaLabel="Şablon türü"
        options={[
          { key: 'barcode', label: 'Barkod ve Etiket', icon: <Barcode aria-hidden="true" /> },
          { key: 'assortment', label: 'Asorti ve Beden', count: assortmentTemplates.length, icon: <Ruler aria-hidden="true" /> },
        ]}
        value={activeTab}
        onChange={key => setActiveTab(key as 'barcode' | 'assortment')}
      />

      {/* 2. TAB 1: BARKOD & TERMAL ETİKET ŞABLONLARI */}
      {activeTab === 'barcode' && (
        <BarcodeTemplatesManager />
      )}

      {/* 3. TAB 2: ASORTİ ŞABLONLARI */}
      {activeTab === 'assortment' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Creation Form */}
          <div className="lg:col-span-1">
            <form onSubmit={handleCreateTemplate} className="bg-surface p-5 rounded-card border border-line shadow-card space-y-5 lg:sticky lg:top-4">
              <h3 className="text-sm font-bold text-fg-strong border-b border-line pb-3">
                Yeni Asorti Şablonu
              </h3>
              
              <div className="space-y-4">
                <Field label="Şablon Adı" htmlFor="new-assortment-template-name" required>
                  <Input
                    id="new-assortment-template-name"
                    required 
                    value={newTemplateName} 
                    onChange={e => setNewTemplateName(e.target.value)} 
                    placeholder="Örn. 12'li erkek klasik"
                  />
                </Field>

                <div className="p-4 bg-surface-raised rounded-card space-y-4 border border-line">
                  <div className="text-label font-bold text-fg-muted">Beden / Miktar Ekle</div>
                  <div className="flex gap-2">
                    <Input
                      ref={sizeInputRef}
                      type="text" 
                      placeholder="Beden" 
                      aria-label="Beden"
                      className="w-20 text-center"
                      value={newTemplateItem.size}
                      onChange={e => setNewTemplateItem({ ...newTemplateItem, size: e.target.value })}
                    />
                    <Input
                      type="number" 
                      placeholder="Adet" 
                      aria-label="Adet"
                      min={1}
                      className="w-24 text-center"
                      value={newTemplateItem.quantity}
                      onChange={e => setNewTemplateItem({ ...newTemplateItem, quantity: Number(e.target.value) })}
                    />
                    <Button variant="secondary" onClick={handleAddTemplateItem} className="flex-1">Ekle</Button>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                    {newTemplateItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-surface px-3 py-2 rounded-control border border-line">
                        <div className="flex gap-2 items-center">
                          <span className="text-label font-black text-brand-fg bg-brand-soft px-2 py-0.5 rounded">No: {item.size}</span>
                          <span className="text-xs font-bold text-fg">× {item.quantity} adet</span>
                        </div>
                        <Button variant="ghost" size="sm" iconOnly aria-label={`${item.size} bedenini kaldır`} title={`${item.size} bedenini kaldır`} onClick={() => removeTemplateItem(item.size)} className="text-danger">
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                block
                disabled={newTemplateItems.length === 0 || !newTemplateName}
              >
                Şablonu Kaydet
              </Button>
            </form>
          </div>

          {/* Existing Templates List */}
          <div className="lg:col-span-2">
            <DataGrid
              columns={templateColumns}
              data={assortmentTemplates}
              rowKey={(t) => t.id ?? t.name}
              emptyMessage="Henüz hiçbir asorti şablonu tanımlanmadı."
              rowActions={(t) => (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={() => t.id && deleteTemplate(t.id)}
                  aria-label={`${t.name} şablonunu sil`}
                  title={`${t.name} şablonunu sil`}
                  className="text-danger"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </Button>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}

