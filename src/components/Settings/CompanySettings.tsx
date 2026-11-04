import React, { useState } from 'react';
import {
  Building2,
  Save,
  Check,
  Database,
  Download,
  Upload,
  AlertTriangle,
  RefreshCw,
  ImageIcon,
  Trash2,
  UploadCloud,
  RotateCcw,
  CheckCircle2,
  X,
} from 'lucide-react';
import { api, commit, reseedDatabase, uploadImage, type Mutation } from '../../api/client';
import { invoiceService } from '../../services/invoiceService';
import { useAuth } from '../../context/AuthContext';
import Modal from '../Modal';
import { showToast, confirmDialog } from '../../lib/feedback';
import SettingsSection from './SettingsSection';
import { Field, Input, Textarea } from '../Common/Field';
import Button from '../Common/Button';
import { cn } from '../../lib/utils';
import type { AppSettings, CompanySettings as CompanySettingsType } from '../../types';

interface CompanySettingsProps {
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => Promise<void>;
}

export default function CompanySettings({ settings, onSave }: CompanySettingsProps) {
  // Yedekleme/geri yükleme ve sıfırlama işlemleri yıkıcıdır: yalnızca Süper Admin.
  const { isSuperAdmin } = useAuth();
  const [comp, setComp] = useState<CompanySettingsType>(settings.company || {
    companyName: 'DMR Nexus',
    companyTitle: 'DMR Nexus',
    taxOffice: 'Güngören Vergi Dairesi',
    taxNumber: '7340981245',
    tradeRegistryNo: '458921-5',
    phone: '+90 212 555 44 33',
    email: '',
    website: '',
    address: 'Sanayi Cad. Ayakkabıcılar Sanayi Sitesi No: 42 Kat: 3 Güngören',
    city: 'İstanbul / TÜRKİYE',
    bankName: 'Garanti BBVA - Merter Kurumsal',
    iban: 'TR12 0006 2000 1234 5678 9012 34'
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isClearingMovements, setIsClearingMovements] = useState(false);

  // Modal states replacing blocked browser confirm()
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isDemoConfirmOpen, setIsDemoConfirmOpen] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    details?: string[];
  } | null>(null);

  // Reset Movements Except Today's Orders
  const executeResetExceptToday = async () => {
    setIsClearingMovements(true);
    try {
      const res = await invoiceService.resetExceptTodayOrders({ clearWorkOrders: true });
      setIsResetConfirmOpen(false);
      setFeedbackNotice({
        type: 'success',
        title: 'Hareket Sıfırlama Başarılı!',
        message: 'Bugün girilen siparişler hariç tüm hareketler ve üretim planlama verileri temizlendi.',
        details: [
          `Korunan Bugün Siparişleri: ${res.keptOrdersCount} adet`,
          `Silinen Eski Siparişler: ${res.deletedOrdersCount} adet`,
          `Silinen Üretim İş Emirleri: ${res.deletedWorkOrdersCount} adet`,
          'Stok, Cari, TDHP Kartları ve Reçeteler eksiksiz korundu.'
        ]
      });
    } catch (err: any) {
      console.error('Sıfırlama hatası:', err);
      setFeedbackNotice({
        type: 'error',
        title: 'Sıfırlama Sırasında Sorun Oluştu',
        message: err?.message || 'İşlem tamamlanırken bir hata oluştu. Lütfen tekrar deneyiniz.'
      });
    } finally {
      setIsClearingMovements(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo görsel boyutu maksimum 2MB olmalıdır.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        // Logo artık settings.company JSON içinde base64 tutulmaz; sunucuya
        // yüklenip URL saklanır (#51).
        const url = await uploadImage(base64);
        setComp(prev => ({ ...prev, logo: url }));
      } catch (err) {
        console.error('Logo yüklenemedi:', err);
        showToast('Logo yüklenirken bir hata oluştu.', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setComp(prev => ({ ...prev, logo: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated: AppSettings = {
        ...settings,
        company: comp
      };
      await onSave(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Firma ayarları kaydedilemedi:', err);
      showToast('Firma bilgileri kaydedilirken hata oluştu.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Kayıtları JSON olarak dışa aktar (tam yedek değil: görsel/sayaç/audit yok).
  const handleExportBackup = async () => {
    setIsBackingUp(true);
    try {
      const dump = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        products: await api.products.list(),
        colors: await api.colors.list(),
        productColors: await api.productColors.list(),
        contacts: await api.contacts.list(),
        orders: await api.orders.list(),
        orderItems: await api.orderItems.list(),
        invoices: await api.invoices.list(),
        invoiceItems: await api.invoiceItems.list(),
        waybills: await api.waybills.list(),
        waybillItems: await api.waybillItems.list(),
        recipes: await api.recipes.list(),
        workOrders: await api.workOrders.list(),
        transactions: await api.transactions.list(),
        bankAccounts: await api.bankAccounts.list(),
        cashBoxes: await api.cashBoxes.list(),
        checks: await api.checks.list(),
        accounts: await api.accounts.list(),
        journalEntries: await api.journalEntries.list(),
        employees: await api.employees.list(),
        attendanceRecords: await api.attendanceRecords.list(),
        leaveRequests: await api.leaveRequests.list(),
        payrollRecords: await api.payrollRecords.list(),
        assortmentTemplates: await api.assortmentTemplates.list(),
        settings: await api.settings.list()
      };

      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DMR Nexus_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Yedekleme hatası:', err);
      showToast('Veritabanı yedeği alınırken bir sorun oluştu.', 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  // JSON dosyasını içe aktar (tam sistem geri yükleme değil).
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!(await confirmDialog('DİKKAT: JSON verilerini içe aktarmak mevcut kayıtların üzerine yazabilir (görseller, sayaçlar ve denetim izi dahil değildir). Devam etmek istiyor musunuz?', { tone: 'danger', confirmText: 'İçe Aktar' }))) {
      e.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const mutations: Mutation[] = [];
      const pushRestore = (resource: string, rows: any[] | undefined) => {
        if (!rows) return;
        mutations.push({ op: 'clear', resource });
        if (rows.length) mutations.push({ op: 'insertMany', resource, rows });
      };
      // Renk kartları ürünlerden önce geri yüklenir: productColors bağı hem
      // products'a hem colors'a FK ile bağlıdır.
      pushRestore('colors', data.colors);
      pushRestore('products', data.products);
      pushRestore('productColors', data.productColors);
      pushRestore('contacts', data.contacts);
      pushRestore('orders', data.orders);
      pushRestore('orderItems', data.orderItems);
      pushRestore('invoices', data.invoices);
      pushRestore('invoiceItems', data.invoiceItems);
      pushRestore('waybills', data.waybills);
      pushRestore('waybillItems', data.waybillItems);
      pushRestore('recipes', data.recipes);
      pushRestore('workOrders', data.workOrders);
      pushRestore('transactions', data.transactions);
      pushRestore('bankAccounts', data.bankAccounts);
      pushRestore('cashBoxes', data.cashBoxes);
      pushRestore('checks', data.checks);
      pushRestore('accounts', data.accounts);
      pushRestore('journalEntries', data.journalEntries);
      pushRestore('employees', data.employees);
      pushRestore('attendanceRecords', data.attendanceRecords);
      pushRestore('leaveRequests', data.leaveRequests);
      pushRestore('payrollRecords', data.payrollRecords);
      pushRestore('assortmentTemplates', data.assortmentTemplates);
      pushRestore('settings', data.settings);

      await commit(mutations, { disableFkChecks: true });

      showToast('JSON verileri içe aktarıldı! Sayfa yenilenecek.', 'success');
      window.location.reload();
    } catch (err) {
      console.error('Geri yükleme hatası:', err);
      showToast('Yedek dosyası okunamadı veya biçimi geçersiz.', 'error');
    } finally {
      e.target.value = '';
    }
  };

  // Re-seed Database with demo data
  const executeResetToDemo = async () => {
    setIsResetting(true);
    try {
      await reseedDatabase();
      setIsDemoConfirmOpen(false);
      setFeedbackNotice({
        type: 'success',
        title: 'Demo Verileri Yüklendi!',
        message: 'Tüm sistem varsayılan zengin ayakkabı demo verileriyle yenilendi.'
      });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      console.error('Sıfırlama hatası:', err);
      setFeedbackNotice({
        type: 'error',
        title: 'Demo Yükleme Hatası',
        message: err?.message || 'Demo verileri yüklenirken bir hata oluştu.'
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Feedback Notice Banner */}
      {feedbackNotice && (
        <div
          className={cn(
            'flex items-start justify-between gap-3 rounded-card border p-4',
            feedbackNotice.type === 'success'
              ? 'border-success/30 bg-success-soft text-success'
              : 'border-danger/30 bg-danger-soft text-danger',
          )}
        >
          <div className="flex items-start gap-3">
            {feedbackNotice.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider">{feedbackNotice.title}</h4>
              <p className="mt-0.5 text-xs font-semibold opacity-90">{feedbackNotice.message}</p>
              {feedbackNotice.details && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-2xs font-semibold opacity-85">
                  {feedbackNotice.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <button type="button" onClick={() => setFeedbackNotice(null)} className="cursor-pointer rounded p-1 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-card border border-success/30 bg-success-soft px-3.5 py-2.5 text-xs font-bold text-success">
          <Check className="h-4 w-4" />
          Firma künye ve antet bilgileri başarıyla kaydedildi.
        </div>
      )}

      {/* SECTION 1: FİRMA KİMLİK VE ANTET BİLGİLERİ */}
      <SettingsSection
        title="Firma Künyesi & Antet"
        description="Resmi fatura, sevk irsaliyesi ve sipariş çıktılarında basılacak bilgiler"
        icon={<Building2 />}
        keywords="firma ünvan vergi dairesi vkno ticaret sicil adres telefon email banka iban logo antet"
      >
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          {/* LOGO YÜKLEME ALANI */}
          <div className="space-y-3 rounded-card border border-line bg-surface-hover/40 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-fg-strong">
                  <ImageIcon className="h-4 w-4 text-brand" />
                  Firma Logosu
                </span>
                <p className="mt-0.5 text-2xs font-semibold text-fg-muted">Logo yan menüde ve tüm sayfa başlıklarında gösterilir. (PNG, JPG, SVG - max 2MB)</p>
              </div>
              {comp.logo && (
                <Button type="button" variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={handleRemoveLogo}>
                  Logoyu Kaldır
                </Button>
              )}
            </div>

            <div className="flex flex-col items-center gap-4 sm:flex-row">
              {comp.logo ? (
                <div className="shrink-0 text-center">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-card border-2 border-brand/30 bg-white p-2">
                    <img src={comp.logo} alt="Firma Logosu" className="max-h-full max-w-full object-contain" />
                  </div>
                </div>
              ) : (
                <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-card border-2 border-dashed border-line text-fg-muted">
                  <ImageIcon className="h-8 w-8" />
                  <span className="mt-1 text-2xs font-semibold">Logo Yok</span>
                </div>
              )}

              <label className="group flex w-full flex-1 cursor-pointer flex-col items-center justify-center rounded-control border border-line bg-surface px-4 py-3 text-center shadow-card transition-colors hover:border-brand hover:bg-brand-soft">
                <span className="flex items-center gap-2 text-xs font-bold text-fg-strong group-hover:text-brand">
                  <UploadCloud className="h-4 w-4 text-brand" />
                  {comp.logo ? 'Logoyu Değiştir' : 'Yeni Logo Görseli Yükle'}
                </span>
                <span className="mt-0.5 text-2xs font-semibold text-fg-muted">Görsel dosyası seçmek için tıklayın</span>
                <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Firma Kısa Adı (Ticari Marka)" required>
              <Input type="text" required value={comp.companyName || ''} onChange={(e) => setComp({ ...comp, companyName: e.target.value })} />
            </Field>
            <Field label="Resmi Ticari Ünvan" required>
              <Input type="text" required value={comp.companyTitle || ''} onChange={(e) => setComp({ ...comp, companyTitle: e.target.value })} />
            </Field>
            <Field label="Vergi Dairesi">
              <Input type="text" value={comp.taxOffice || ''} onChange={(e) => setComp({ ...comp, taxOffice: e.target.value })} />
            </Field>
            <Field label="Vergi Kimlik Numarası (VKN)">
              <Input type="text" className="font-mono" value={comp.taxNumber || ''} onChange={(e) => setComp({ ...comp, taxNumber: e.target.value })} />
            </Field>
            <Field label="Telefon">
              <Input type="text" value={comp.phone || ''} onChange={(e) => setComp({ ...comp, phone: e.target.value })} />
            </Field>
            <Field label="E-Posta">
              <Input type="email" value={comp.email || ''} onChange={(e) => setComp({ ...comp, email: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Firma Adresi">
                <Textarea rows={2} value={comp.address || ''} onChange={(e) => setComp({ ...comp, address: e.target.value })} />
              </Field>
            </div>
            <Field label="Banka & Şube">
              <Input type="text" placeholder="Örn: Garanti BBVA Merter" value={comp.bankName || ''} onChange={(e) => setComp({ ...comp, bankName: e.target.value })} />
            </Field>
            <Field label="IBAN Numarası">
              <Input type="text" className="font-mono" placeholder="TRXX 0000 0000 0000 0000 00" value={comp.iban || ''} onChange={(e) => setComp({ ...comp, iban: e.target.value })} />
            </Field>
          </div>

          <div className="flex justify-end border-t border-line pt-1">
            <Button type="submit" variant="primary" icon={<Save className="h-4 w-4" />} loading={isSaving}>
              Firma Bilgilerini Kaydet
            </Button>
          </div>
        </form>
      </SettingsSection>

      {/* SECTION 2: VERİTABANI YÖNETİMİ, YEDEKLEME VE SIFIRLAMA */}
      <SettingsSection
        title="Veritabanı Yedekleme & Sistem Araçları"
        description="JSON veri dışa/içe aktarma, hareket ve demo sıfırlama araçları"
        icon={<Database />}
        keywords="yedek json dışa içe aktar sıfırla hareket demo veritabanı db:backup db:restore"
      >
        <p className="border-b border-line bg-surface-hover/40 px-4 py-2.5 text-2xs font-semibold text-fg-muted">
          Tam sistem yedeği (SQL + görseller) sunucu tarafında <code className="font-mono text-fg-strong">npm run db:backup</code> ile alınır. Buradaki araçlar kısmi JSON dışa/içe aktarımdır.
        </p>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Reset Movements Except Today's Orders */}
          <div className="flex flex-col justify-between gap-3 rounded-card border border-warning/30 bg-warning-soft/40 p-3.5">
            <div className="space-y-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-control bg-warning/15 text-warning">
                <RotateCcw className="h-4 w-4" />
              </div>
              <h4 className="text-xs font-black uppercase tracking-wider text-fg-strong">Hareketleri Sıfırla</h4>
              <p className="text-2xs font-semibold text-fg-muted">Bugün girilen siparişler hariç; stok, cari, finans, TDHP ve üretim hareketlerini temizler. Kartlar korunur.</p>
              {!isSuperAdmin && <p className="text-2xs font-bold text-danger">Yalnızca Süper Admin yetkisindedir.</p>}
            </div>
            <Button type="button" variant="primary" block disabled={!isSuperAdmin || isClearingMovements} title={isSuperAdmin ? undefined : 'Bu işlem yalnızca Süper Admin yetkisindedir'} onClick={() => setIsResetConfirmOpen(true)}>
              <RotateCcw className={cn('h-4 w-4', isClearingMovements && 'animate-spin')} />
              {isClearingMovements ? 'Temizleniyor...' : 'Hareketleri Sıfırla'}
            </Button>
          </div>

          {/* Backup */}
          <div className="flex flex-col justify-between gap-3 rounded-card border border-line bg-surface p-3.5">
            <div className="space-y-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-control bg-success/15 text-success">
                <Download className="h-4 w-4" />
              </div>
              <h4 className="text-xs font-black uppercase tracking-wider text-fg-strong">Veri Dışa Aktarma (JSON)</h4>
              <p className="text-2xs font-semibold text-fg-muted">Stok, sipariş, irsaliye, cari ve ayarları tek JSON'da indirir. <strong className="text-fg-strong">Tam yedek DEĞİLDİR:</strong> görseller/sayaçlar/denetim izi içermez.</p>
              {!isSuperAdmin && <p className="text-2xs font-bold text-danger">Tüm modülleri okuma yetkisi gerektirir (Süper Admin).</p>}
            </div>
            <Button type="button" variant="secondary" block disabled={!isSuperAdmin || isBackingUp} title={isSuperAdmin ? undefined : 'Bu işlem yalnızca Süper Admin yetkisindedir'} onClick={handleExportBackup}>
              <Download className="h-4 w-4" />
              {isBackingUp ? 'İndiriliyor...' : 'Verileri Dışa Aktar'}
            </Button>
          </div>

          {/* Restore */}
          <div className="flex flex-col justify-between gap-3 rounded-card border border-line bg-surface p-3.5">
            <div className="space-y-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-control bg-info/15 text-info">
                <Upload className="h-4 w-4" />
              </div>
              <h4 className="text-xs font-black uppercase tracking-wider text-fg-strong">JSON Verileri İçe Aktar</h4>
              <p className="text-2xs font-semibold text-fg-muted">Dışa aktarılan JSON'u yükleyerek kayıtları yeniler. <strong className="text-fg-strong">Tam geri yükleme DEĞİLDİR</strong> (görsel/sayaç/denetim izi dönmez).</p>
              {!isSuperAdmin && <p className="text-2xs font-bold text-danger">Yalnızca Süper Admin yetkisindedir.</p>}
            </div>
            <label className={cn('flex w-full items-center justify-center gap-1.5 rounded-control px-3 py-2 text-xs font-black uppercase tracking-wider text-white shadow-card', isSuperAdmin ? 'cursor-pointer bg-info hover:bg-info/90' : 'cursor-not-allowed bg-fg-muted/40')}>
              <Upload className="h-4 w-4" />
              JSON Dosyası Seç
              <input type="file" accept=".json" onChange={handleImportBackup} disabled={!isSuperAdmin} className="hidden" />
            </label>
          </div>

          {/* Reset Demo */}
          <div className="flex flex-col justify-between gap-3 rounded-card border border-danger/30 bg-danger-soft/40 p-3.5">
            <div className="space-y-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-control bg-danger/15 text-danger">
                <RefreshCw className="h-4 w-4" />
              </div>
              <h4 className="text-xs font-black uppercase tracking-wider text-fg-strong">Fabrika / Demo Verisi</h4>
              <p className="text-2xs font-semibold text-fg-muted">Tüm tabloları sıfırlar ve zengin ayakkabı imalat demo verilerini tekrar yükler.</p>
              {!isSuperAdmin && <p className="text-2xs font-bold text-danger">Yalnızca Süper Admin yetkisindedir.</p>}
            </div>
            <Button type="button" variant="danger" block disabled={!isSuperAdmin || isResetting} title={isSuperAdmin ? undefined : 'Bu işlem yalnızca Süper Admin yetkisindedir'} onClick={() => setIsDemoConfirmOpen(true)}>
              <RefreshCw className={cn('h-4 w-4', isResetting && 'animate-spin')} />
              {isResetting ? 'Yükleniyor...' : 'Demo Verilerini Yükle'}
            </Button>
          </div>
        </div>
      </SettingsSection>

      {/* Confirmation Modal: Reset Movements */}
      <Modal isOpen={isResetConfirmOpen} onClose={() => setIsResetConfirmOpen(false)} title="Hareketleri Sıfırla (Kartlar Dursun)" size="lg">
        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3 rounded-card border border-warning/30 bg-warning-soft/50 p-4 text-fg-strong">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-warning" />
            <div className="space-y-1 text-xs">
              <p className="text-sm font-bold">Bu işlem geri alınamaz!</p>
              <p>Bugün girilen siparişler haricindeki tüm geçmiş işlem ve hareket kayıtları temizlenecektir.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
            <div className="space-y-2 rounded-card border border-success/30 bg-success-soft/50 p-3.5">
              <div className="flex items-center gap-1.5 font-bold text-success">
                <Check className="h-4 w-4" />
                <span>KORUNACAK KARTLAR</span>
              </div>
              <ul className="list-disc space-y-1 pl-4 text-2xs font-semibold text-fg">
                <li>Stok & Hammadde Kartları (Bakiye sıfırlanır)</li>
                <li>Cari Hesap Kartları (Müşteri & Tedarikçi)</li>
                <li>TDHP Hesap Planı Kartları</li>
                <li>Ürün Reçeteleri (BOM) & Şablonlar</li>
                <li>Personel & Kullanıcı Kartları</li>
                <li><strong>Bugün girilen siparişler</strong> ve kalemleri</li>
              </ul>
            </div>

            <div className="space-y-2 rounded-card border border-danger/30 bg-danger-soft/50 p-3.5">
              <div className="flex items-center gap-1.5 font-bold text-danger">
                <Trash2 className="h-4 w-4" />
                <span>TEMİZLENECEK HAREKETLER</span>
              </div>
              <ul className="list-disc space-y-1 pl-4 text-2xs font-semibold text-fg">
                <li>Eski siparişler ve geçmiş sipariş kayıtları</li>
                <li>Stok giriş / çıkış / transfer hareket logları</li>
                <li>Üretim iş emirleri (sıfırdan başlama)</li>
                <li>Satış ve alış faturaları & irsaliyeler</li>
                <li>Kasa, banka, çek ve tahsilat hareketleri</li>
                <li>TDHP Yevmiye defteri kayıtları</li>
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
            <Button type="button" variant="secondary" onClick={() => setIsResetConfirmOpen(false)}>Vazgeç</Button>
            <Button type="button" variant="primary" disabled={isClearingMovements} onClick={executeResetExceptToday}>
              <RotateCcw className={cn('h-4 w-4', isClearingMovements && 'animate-spin')} />
              {isClearingMovements ? 'Sıfırlanıyor...' : 'Evet, Hareketleri Sıfırla'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal: Demo Data Reset */}
      <Modal isOpen={isDemoConfirmOpen} onClose={() => setIsDemoConfirmOpen(false)} title="Fabrika / Demo Verilerine Sıfırla" size="md">
        <div className="space-y-4 p-5">
          <div className="flex items-start gap-3 rounded-card border border-danger/30 bg-danger-soft/50 p-4 text-fg-strong">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-danger" />
            <div className="space-y-1 text-xs">
              <p className="text-sm font-bold">Tüm Veriler Silinecektir!</p>
              <p>Mevcut tüm tablolar sıfırlanacak ve hazır ayakkabı imalat demo verileri yüklenecektir. Bu işlem geri alınamaz.</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-line pt-3">
            <Button type="button" variant="secondary" onClick={() => setIsDemoConfirmOpen(false)}>Vazgeç</Button>
            <Button type="button" variant="danger" disabled={isResetting} onClick={executeResetToDemo}>
              <RefreshCw className={cn('h-4 w-4', isResetting && 'animate-spin')} />
              {isResetting ? 'Yükleniyor...' : 'Evet, Demo Verisi Yükle'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
