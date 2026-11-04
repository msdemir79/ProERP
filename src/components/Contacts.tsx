import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useApiQuery, useApiQueryFull } from '../hooks/useApiQuery';
import type { Contact, EntityType } from '../types';
import PageHeader from './PageHeader';
import DataGrid, { GridColumn, StatusPill } from './Common/DataGrid';
import Button, { buttonClass } from './Common/Button';
import ActionMenu from './Common/ActionMenu';
import SegmentedFilter, { SegmentOption } from './Common/SegmentedFilter';
import EmptyState from './Common/EmptyState';
import DeleteConfirmModal from './Common/DeleteConfirmModal';
import FilterBar from './Common/FilterBar';
import DetailPanel from './Common/DetailPanel';
import StatusBadge from './Common/StatusBadge';
import { Select } from './Common/Field';
import {
  Users,
  UserPlus,
  Phone,
  Mail,
  MapPin,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  CreditCard,
  FileText,
  ShoppingBag,
  Edit,
  Trash2,
  Printer,
  Download,
  LayoutGrid,
  Table as TableIcon,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Percent,
  CheckCircle2,
  ChevronRight,
  Receipt,
  DollarSign,
  MoreHorizontal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { contactService } from '../services/contactService';
import ContactStatementModal from './Contacts/ContactStatementModal';
import ContactFormModal from './Contacts/ContactFormModal';
import QuickPaymentModal from './Contacts/QuickPaymentModal';
import ContactBalanceReportModal from './Contacts/ContactBalanceReportModal';

type FilterType = 'all' | 'customer' | 'supplier' | 'both' | 'receivables' | 'payables' | 'zero' | 'risk_exceeded';
type ViewMode = 'table' | 'grid';
type SortOption = 'code_asc' | 'code_desc' | 'name_asc' | 'name_desc' | 'type_asc' | 'type_desc' | 'balance_desc' | 'balance_asc' | 'recent';

export default function Contacts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedContactId = searchParams.get('contactId');
  const contactsQuery = useApiQueryFull(() => api.contacts.list(), [], ['contacts']);
  const contacts = contactsQuery.data;

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortOption, setSortOption] = useState<SortOption>('code_asc');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [selectedContactForStatement, setSelectedContactForStatement] = useState<Contact | null>(null);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedContactForPayment, setSelectedContactForPayment] = useState<Contact | null>(null);
  const [paymentDefaultType, setPaymentDefaultType] = useState<'income' | 'expense'>('income');

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [deleteConfirmContact, setDeleteConfirmContact] = useState<Contact | null>(null);
  const [detailContact, setDetailContact] = useState<Contact | null>(null);

  useEffect(() => {
    const id = Number(requestedContactId);
    if (!requestedContactId || !Number.isSafeInteger(id) || id <= 0) return;
    let active = true;
    api.contacts.get(id)
      .then(contact => { if (active && contact) setDetailContact(contact); })
      .catch(() => { /* Liste ekranındaki hata durumu mevcut sorgu tarafından gösterilir. */ });
    return () => { active = false; };
  }, [requestedContactId]);

  const closeDetailContact = () => {
    setDetailContact(null);
    if (requestedContactId) {
      setSearchParams(current => {
        const next = new URLSearchParams(current);
        next.delete('contactId');
        return next;
      }, { replace: true });
    }
  };

  // Financial Metrics Calculation
  const metrics = useMemo(() => {
    if (!contacts) return { total: 0, customers: 0, suppliers: 0, receivables: 0, payables: 0, net: 0, riskExceededCount: 0 };
    
    let customers = 0;
    let suppliers = 0;
    let receivables = 0;
    let payables = 0;
    let riskExceededCount = 0;

    for (const c of contacts) {
      if (c.type === 'customer' || c.type === 'both') customers++;
      if (c.type === 'supplier' || c.type === 'both') suppliers++;

      if (c.balance > 0) {
        receivables += c.balance;
      } else if (c.balance < 0) {
        payables += Math.abs(c.balance);
      }

      if (c.creditLimit && c.balance > c.creditLimit) {
        riskExceededCount++;
      }
    }

    return {
      total: contacts.length,
      customers,
      suppliers,
      receivables,
      payables,
      net: receivables - payables,
      riskExceededCount
    };
  }, [contacts]);

  // Unique categories and cities for dropdowns
  const availableCategories = useMemo(() => {
    if (!contacts) return [];
    const set = new Set<string>();
    contacts.forEach(c => { if (c.category) set.add(c.category); });
    return Array.from(set).sort();
  }, [contacts]);

  const availableCities = useMemo(() => {
    if (!contacts) return [];
    const set = new Set<string>();
    contacts.forEach(c => { if (c.city) set.add(c.city); });
    return Array.from(set).sort();
  }, [contacts]);

  // Filtered and Sorted Contacts
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];

    return contacts.filter(c => {
      // Search term
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchName = c.name.toLowerCase().includes(query);
        const matchTitle = c.companyTitle?.toLowerCase().includes(query);
        const matchCode = c.code?.toLowerCase().includes(query);
        const matchPerson = c.contactPerson?.toLowerCase().includes(query);
        const matchPhone = c.phone?.toLowerCase().includes(query) || c.mobile?.toLowerCase().includes(query);
        const matchTax = c.taxNumber?.toLowerCase().includes(query) || c.tcKimlik?.toLowerCase().includes(query);
        const matchCity = c.city?.toLowerCase().includes(query);
        if (!matchName && !matchTitle && !matchCode && !matchPerson && !matchPhone && !matchTax && !matchCity) {
          return false;
        }
      }

      // Filter Type
      if (filterType === 'customer' && c.type !== 'customer' && c.type !== 'both') return false;
      if (filterType === 'supplier' && c.type !== 'supplier' && c.type !== 'both') return false;
      if (filterType === 'both' && c.type !== 'both') return false;
      if (filterType === 'receivables' && c.balance <= 0) return false;
      if (filterType === 'payables' && c.balance >= 0) return false;
      if (filterType === 'zero' && c.balance !== 0) return false;
      if (filterType === 'risk_exceeded' && (!c.creditLimit || c.balance <= c.creditLimit)) return false;

      // City filter
      if (selectedCity !== 'all' && c.city !== selectedCity) return false;

      // Category filter
      if (selectedCategory !== 'all' && c.category !== selectedCategory) return false;

      return true;
    }).sort((a, b) => {
      // 1. Cari Kodu (Varsayılan)
      if (sortOption === 'code_asc') {
        const res = (a.code || '').localeCompare(b.code || '', 'tr', { numeric: true, sensitivity: 'base' });
        return res !== 0 ? res : a.name.localeCompare(b.name, 'tr');
      }
      if (sortOption === 'code_desc') {
        const res = (b.code || '').localeCompare(a.code || '', 'tr', { numeric: true, sensitivity: 'base' });
        return res !== 0 ? res : b.name.localeCompare(a.name, 'tr');
      }

      // 2. Cari / Firma Ünvanı
      if (sortOption === 'name_asc') return a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' });
      if (sortOption === 'name_desc') return b.name.localeCompare(a.name, 'tr', { sensitivity: 'base' });

      // 3. Cari Türü (Müşteri <-> Tedarikçi)
      if (sortOption === 'type_asc') {
        const typePriority: Record<string, number> = { customer: 1, both: 2, supplier: 3 };
        const diff = (typePriority[a.type] || 99) - (typePriority[b.type] || 99);
        return diff !== 0 ? diff : (a.code || '').localeCompare(b.code || '', 'tr', { numeric: true });
      }
      if (sortOption === 'type_desc') {
        const typePriority: Record<string, number> = { supplier: 1, both: 2, customer: 3 };
        const diff = (typePriority[a.type] || 99) - (typePriority[b.type] || 99);
        return diff !== 0 ? diff : (a.code || '').localeCompare(b.code || '', 'tr', { numeric: true });
      }

      // 4. Cari Bakiye
      if (sortOption === 'balance_desc') return b.balance - a.balance;
      if (sortOption === 'balance_asc') return a.balance - b.balance;

      // 5. En Son Eklenenler
      if (sortOption === 'recent') return (b.id || 0) - (a.id || 0);

      return (a.code || '').localeCompare(b.code || '', 'tr', { numeric: true, sensitivity: 'base' });
    });
  }, [contacts, searchTerm, filterType, selectedCity, selectedCategory, sortOption]);

  // Handlers
  const handleOpenAddModal = () => {
    setEditingContact(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setIsFormModalOpen(true);
  };

  const handleSaveContact = async (data: Partial<Contact>) => {
    if (editingContact?.id) {
      await contactService.updateContact(editingContact.id, data);
    } else {
      await contactService.addContact(data as any);
    }
  };

  const handleOpenStatement = (contact: Contact) => {
    setSelectedContactForStatement(contact);
    setIsStatementModalOpen(true);
  };

  const handleOpenPayment = (contact: Contact, type: 'income' | 'expense' = 'income') => {
    setSelectedContactForPayment(contact);
    setPaymentDefaultType(type);
    setIsPaymentModalOpen(true);
  };

  const handleExportCSV = () => {
    const headers = ['Cari Kodu', 'Firma Ünvanı', 'Cari Türü', 'Yetkili', 'Telefon', 'Şehir', 'Vergi No', 'Vade', 'Risk Limiti', 'Bakiye'];
    const rows = filteredContacts.map(c => [
      `"${c.code || c.id}"`,
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.type}"`,
      `"${c.contactPerson || ''}"`,
      `"${c.phone || c.mobile || ''}"`,
      `"${c.city || ''}"`,
      `"${c.taxNumber || ''}"`,
      `"${c.paymentTermDays || ''}"`,
      `"${c.creditLimit || ''}"`,
      c.balance.toFixed(2)
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Cari_Hesaplar_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const contactColumns = useMemo<GridColumn<Contact>[]>(() => [
    {
      key: 'code', title: 'Kod', width: '6.5rem',
      render: (c) => (
        <span className="font-mono font-bold text-indigo-600 whitespace-nowrap">
          {c.code || `CAR-${c.id?.toString().padStart(4, '0')}`}
        </span>
      ),
      filterValue: (c) => c.code || '',
    },
    {
      key: 'name', title: 'Cari / Firma Ünvanı',
      render: (c) => (
        <div className="max-w-xs">
          <div
            onClick={() => handleOpenStatement(c)}
            className="font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight hover:text-indigo-600 cursor-pointer transition-colors"
          >
            {c.name}
          </div>
          {(c.discountRate || 0) > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <span className="text-[10px] bg-amber-50 text-amber-800 px-1.5 py-0.2 rounded font-bold">
                %{c.discountRate} İskonto
              </span>
            </div>
          )}
        </div>
      ),
      filterValue: (c) => `${c.name} ${c.accountCode || ''} ${c.category || ''}`,
    },
    {
      key: 'type', title: 'Tür', width: '7rem',
      render: (c) => {
        if (c.type === 'customer') return <StatusPill tone="blue">Müşteri</StatusPill>;
        if (c.type === 'supplier') return <StatusPill tone="amber">Tedarikçi</StatusPill>;
        return <StatusPill tone="green">Müşteri + Tedarikçi</StatusPill>;
      },
      filterValue: (c) => c.type === 'customer' ? 'Müşteri' : c.type === 'supplier' ? 'Tedarikçi' : 'Müşteri Tedarikçi',
    },
    {
      key: 'contactPerson', title: 'Yetkili & İletişim', width: '12rem',
      render: (c) => (
        <div>
          {c.contactPerson ? (
            <div className="font-bold text-slate-800 dark:text-slate-200">{c.contactPerson}</div>
          ) : (
            <div className="text-slate-400 font-medium">-</div>
          )}
          <div className="flex items-center gap-2 text-label font-mono text-slate-500 dark:text-slate-400">
            {c.phone || c.mobile || c.email || '-'}
          </div>
        </div>
      ),
      filterValue: (c) => `${c.contactPerson || ''} ${c.phone || ''} ${c.mobile || ''} ${c.email || ''}`,
    },
    {
      key: 'city', title: 'Şehir / VKN', width: '10rem',
      render: (c) => (
        <div>
          <div className="font-semibold text-slate-800 dark:text-slate-200">
            {c.city ? `${c.city}${c.district ? ` / ${c.district}` : ''}` : '-'}
          </div>
          {c.taxNumber && (
            <div className="text-label font-mono text-slate-400">
              VKN: {c.taxNumber}
            </div>
          )}
        </div>
      ),
      filterValue: (c) => `${c.city || ''} ${c.taxNumber || ''}`,
    },
    {
      key: 'paymentTermDays', title: 'Vade', align: 'right', width: '5.5rem',
      render: (c) => (
        <span className="font-mono font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
          {c.paymentTermDays ? `${c.paymentTermDays} Gün` : 'Peşin'}
        </span>
      ),
    },
    {
      key: 'balance', title: 'Cari Bakiye (₺)', align: 'right', width: '8.5rem',
      render: (c) => {
        const isRiskExceeded = !!c.creditLimit && c.balance > c.creditLimit;
        return (
          <div className="text-right whitespace-nowrap">
            <div className={`font-mono font-black text-xs ${c.balance > 0 ? 'text-emerald-700' : c.balance < 0 ? 'text-rose-700' : 'text-slate-500 dark:text-slate-400'}`}>
              ₺{Math.abs(c.balance).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-label ml-1 opacity-75">
                {c.balance > 0 ? '(A)' : c.balance < 0 ? '(B)' : ''}
              </span>
            </div>
            {isRiskExceeded && (
              <div className="text-label font-bold text-rose-600 flex items-center justify-end gap-1">
                <AlertTriangle className="w-2.5 h-2.5" /> Risk Aşıldı
              </div>
            )}
          </div>
        );
      },
      filterValue: (c) => `${c.balance || 0}`,
    },
  ], []);

  const filterOptions: SegmentOption[] = useMemo(() => [
    { key: 'all', label: 'Tüm Cariler', count: contacts?.length ?? 0 },
    { key: 'customer', label: 'Müşteriler', count: metrics.customers },
    { key: 'supplier', label: 'Tedarikçiler', count: metrics.suppliers },
    { key: 'receivables', label: 'Alacağımız Olanlar', count: contacts?.filter(c => c.balance > 0).length ?? 0 },
    { key: 'payables', label: 'Borcumuz Olanlar', count: contacts?.filter(c => c.balance < 0).length ?? 0 },
    { key: 'zero', label: 'Sıfır Bakiye', count: contacts?.filter(c => c.balance === 0).length ?? 0 },
    { key: 'risk_exceeded', label: 'Risk Aşanlar', count: metrics.riskExceededCount },
  ], [contacts, metrics]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Fast Actions */}
      <PageHeader
        title="Cari Hesaplar & Finansal Yönetim"
        subtitle="Müşteri ve tedarikçi kartları, borç/alacak bakiyeleri, ekstreler ve risk analizleri"
        badge={`${metrics.total} Cari Kart`}
        icon={Users}
        iconColor="indigo"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => setIsReportModalOpen(true)}>
              Bakiye Raporu
            </Button>

            <Button variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={handleExportCSV}>
              Excel / CSV
            </Button>

            <Button variant="primary" icon={<UserPlus className="h-3.5 w-3.5" />} onClick={handleOpenAddModal}>
              Yeni Cari Kaydı
            </Button>
          </div>
        }
      />

      {/* Finansal özet şeridi: 4 büyük KPI kartı yerine tek satır — aynı bilgi,
          çok daha az dikey alan. Bilgi silinmez, yalnızca yoğunluk azalır. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-line bg-surface px-4 py-2.5 shadow-card">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-brand" />
          <span className="text-label font-bold uppercase tracking-wider text-fg-muted">Toplam Cari</span>
          <span className="font-mono text-sm font-black text-fg-strong">{metrics.total}</span>
          <span className="text-2xs font-semibold text-fg-muted">
            <span className="font-bold text-brand">{metrics.customers} Müşteri</span>
            {' · '}
            <span className="font-bold text-warning">{metrics.suppliers} Tedarikçi</span>
          </span>
        </div>

        <div className="hidden h-5 w-px bg-line sm:block" />

        <div className="flex items-center gap-2">
          <ArrowDownLeft className="h-4 w-4 text-success" />
          <span className="text-label font-bold uppercase tracking-wider text-fg-muted">Alacak</span>
          <span className="font-mono text-sm font-black text-success">
            ₺{metrics.receivables.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="hidden h-5 w-px bg-line sm:block" />

        <div className="flex items-center gap-2">
          <ArrowUpRight className="h-4 w-4 text-danger" />
          <span className="text-label font-bold uppercase tracking-wider text-fg-muted">Borç</span>
          <span className="font-mono text-sm font-black text-danger">
            ₺{metrics.payables.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="hidden h-5 w-px bg-line sm:block" />

        <div className="flex items-center gap-2">
          {metrics.net >= 0 ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-danger" />}
          <span className="text-label font-bold uppercase tracking-wider text-fg-muted">Net</span>
          <span className={`font-mono text-sm font-black ${metrics.net >= 0 ? 'text-success' : 'text-danger'}`}>
            ₺{Math.abs(metrics.net).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-2xs font-semibold text-fg-muted">{metrics.net >= 0 ? 'Alacaklı' : 'Borçlu'}</span>
          {metrics.riskExceededCount > 0 && (
            <span className="flex items-center gap-1 rounded-pill bg-danger-soft px-2 py-0.5 text-[10px] font-bold text-danger">
              <AlertTriangle className="h-3 w-3" />
              {metrics.riskExceededCount} Risk Aşımı
            </span>
          )}
        </div>
      </div>

      {/* Main Control Panel & Filter Bar */}
      <FilterBar
        search={{
          value: searchTerm,
          onChange: setSearchTerm,
          placeholder: 'Cari ünvanı, kod, yetkili, telefon, vergi no veya şehir ile arayın…',
        }}
        clearable={searchTerm !== '' || filterType !== 'all' || selectedCity !== 'all' || selectedCategory !== 'all'}
        onClear={() => { setSearchTerm(''); setFilterType('all'); setSelectedCity('all'); setSelectedCategory('all'); }}
        resultCount={filteredContacts.length}
        filters={
          <>
            <Select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              wrapperClassName="w-auto"
            >
              <option value="all">Tüm Şehirler</option>
              {availableCities.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </Select>

            {availableCategories.length > 0 && (
              <Select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                wrapperClassName="w-auto"
              >
                <option value="all">Tüm Gruplar</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </Select>
            )}

            <Select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              wrapperClassName="w-auto"
              className="cursor-pointer"
            >
              <option value="code_asc">Cari Kodu (A - Z / Artan) [Varsayılan]</option>
              <option value="code_desc">Cari Kodu (Z - A / Azalan)</option>
              <option value="name_asc">Cari / Firma Ünvanı (A - Z)</option>
              <option value="name_desc">Cari / Firma Ünvanı (Z - A)</option>
              <option value="type_asc">Cari Türü (Müşteri &gt; Tedarikçi)</option>
              <option value="type_desc">Cari Türü (Tedarikçi &gt; Müşteri)</option>
              <option value="balance_desc">Bakiye (En Yüksek Alacak)</option>
              <option value="balance_asc">Bakiye (En Yüksek Borç)</option>
              <option value="recent">En Son Eklenenler</option>
            </Select>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 rounded-control border border-line bg-surface-raised p-1">
              <button
                onClick={() => setViewMode('table')}
                title="Tablo Görünümü"
                aria-pressed={viewMode === 'table'}
                className={cn(
                  "rounded-[10px] p-1.5 transition-colors",
                  viewMode === 'table' ? "bg-surface-active text-fg-inverted shadow-card" : "text-fg-muted hover:bg-surface-hover hover:text-fg-strong"
                )}
              >
                <TableIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                title="Kart Görünümü"
                aria-pressed={viewMode === 'grid'}
                className={cn(
                  "rounded-[10px] p-1.5 transition-colors",
                  viewMode === 'grid' ? "bg-surface-active text-fg-inverted shadow-card" : "text-fg-muted hover:bg-surface-hover hover:text-fg-strong"
                )}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </>
        }
      >
        <SegmentedFilter
          ariaLabel="Cari filtre türü"
          options={filterOptions}
          value={filterType}
          onChange={(key) => setFilterType(key as FilterType)}
        />
      </FilterBar>

      {/* Content Area: Table View or Grid View */}
      {filteredContacts.length === 0 ? (
        <div className="rounded-card border border-line bg-surface shadow-card">
          <EmptyState
            icon={<Users />}
            title="Filtreleme kriterlerine uygun cari hesap bulunamadı"
            description="Arama terimini değiştirebilir, filtreleri sıfırlayabilir veya sağ üstteki butonla yeni bir cari hesap kartı ekleyebilirsiniz."
            action={
              <Button
                variant="secondary"
                onClick={() => { setSearchTerm(''); setFilterType('all'); setSelectedCity('all'); setSelectedCategory('all'); }}
              >
                Filtreleri Temizle
              </Button>
            }
          />
        </div>
      ) : viewMode === 'table' ? (
        <DataGrid<Contact>
          columns={contactColumns}
          data={filteredContacts}
          rowKey="id"
          density="compact"
          loading={contactsQuery.loading}
          emptyMessage="Arama kriterlerinize uygun cari hesap bulunamadı."
          onRowClick={(c) => setDetailContact(c)}
          rowActions={(c) => (
            <ActionMenu
              label={`${c.name} işlemleri`}
              icon={<MoreHorizontal className="h-4 w-4" />}
              items={[
                { key: 'detail', label: 'Detay', icon: <ChevronRight className="h-4 w-4" />, onSelect: () => setDetailContact(c) },
                { key: 'statement', label: 'Cari Hesap Ekstresi', icon: <FileText className="h-4 w-4" />, onSelect: () => handleOpenStatement(c) },
                {
                  key: 'payment',
                  label: c.type === 'supplier' ? 'Ödeme Yap' : 'Tahsilat Al',
                  icon: <DollarSign className="h-4 w-4" />,
                  onSelect: () => handleOpenPayment(c, c.type === 'supplier' ? 'expense' : 'income'),
                },
                { key: 'edit', label: 'Cari Kartını Düzenle', icon: <Edit className="h-4 w-4" />, onSelect: () => handleOpenEditModal(c) },
                { key: 'delete', label: 'Cari Kartını Sil', icon: <Trash2 className="h-4 w-4" />, tone: 'danger', onSelect: () => setDeleteConfirmContact(c) },
              ]}
            />
          )}
        />
      ) : (
        /* GRID VIEW (KART GÖRÜNÜMÜ) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredContacts.map((c) => {
            const isRiskExceeded = !!c.creditLimit && c.balance > c.creditLimit;
            return (
              <motion.div
                key={c.id}
                whileHover={{ y: -3 }}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden flex flex-col justify-between group"
              >
                {/* Type ribbon */}
                <div className={cn(
                  "absolute top-0 right-0 px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-bl-xl shadow-xs border-l border-b",
                  c.type === 'customer'
                    ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                    : c.type === 'supplier'
                    ? "bg-amber-50 text-amber-800 border-amber-100"
                    : "bg-emerald-50 text-emerald-800 border-emerald-100"
                )}>
                  {c.type === 'customer' ? 'Müşteri' : c.type === 'supplier' ? 'Tedarikçi' : 'Müşteri+Tedarikçi'}
                </div>

                <div>
                  {/* Top info */}
                  <div className="flex items-start gap-3 mb-4 pr-16">
                    <div className="w-11 h-11 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center font-black text-indigo-600 text-lg shrink-0">
                      {c.name.substring(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-[10px] font-mono font-bold text-slate-400">
                        {c.code || `CAR-${c.id?.toString().padStart(4, '0')}`}
                      </div>
                      <h3 
                        onClick={() => handleOpenStatement(c)}
                        className="font-black text-base text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-snug hover:text-indigo-600 cursor-pointer transition-colors"
                      >
                        {c.name}
                      </h3>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-2 py-3 border-y border-slate-100 dark:border-slate-800 text-xs">
                    {c.contactPerson && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-semibold">{c.contactPerson}</span>
                      </div>
                    )}
                    {(c.phone || c.mobile) && (
                      <div className="flex items-center gap-2 text-slate-600 font-mono">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{c.phone || c.mobile}</span>
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center gap-2 text-slate-600 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </div>
                    )}
                    {c.city && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{c.city} {c.district ? `/ ${c.district}` : ''}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Balance & Actions */}
                <div className="pt-4 mt-2">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {c.balance > 0 ? 'Müşteri Borcu (Alacak)' : c.balance < 0 ? 'Tedarikçi Alacağı (Borç)' : 'Bakiye Durumu'}
                    </div>
                    <div className={cn(
                      "font-mono font-black text-base",
                      c.balance > 0 ? "text-emerald-600" : c.balance < 0 ? "text-rose-600" : "text-slate-600"
                    )}>
                      ₺{Math.abs(c.balance).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleOpenStatement(c)}
                      className="flex items-center justify-center gap-1 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Ekstre
                    </button>
                    <button
                      onClick={() => handleOpenPayment(c, c.type === 'supplier' ? 'expense' : 'income')}
                      className="flex items-center justify-center gap-1 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      {c.type === 'supplier' ? 'Ödeme' : 'Tahsilat'}
                    </button>
                    <button
                      onClick={() => handleOpenEditModal(c)}
                      className="flex items-center justify-center gap-1 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      Düzenle
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Account Statement (Ekstre) */}
      <ContactStatementModal
        isOpen={isStatementModalOpen}
        onClose={() => setIsStatementModalOpen(false)}
        contact={selectedContactForStatement}
        onQuickPayment={(c, type) => {
          setIsStatementModalOpen(false);
          handleOpenPayment(c, type);
        }}
        onNewOrder={(c) => {
          setIsStatementModalOpen(false);
          navigate('/orders');
        }}
      />

      {/* MODAL 2: Contact Form (Add/Edit) */}
      <ContactFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSave={handleSaveContact}
        initialData={editingContact}
        defaultType={filterType === 'supplier' ? 'supplier' : filterType === 'both' ? 'both' : 'customer'}
      />

      {/* MODAL 3: Quick Payment & Collection */}
      <QuickPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        contact={selectedContactForPayment}
        defaultType={paymentDefaultType}
      />

      {/* MODAL 4: General Balance Report */}
      <ContactBalanceReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        contacts={contacts || []}
      />

      {/* MODAL 5: Delete Confirmation */}
      <DeleteConfirmModal
        resource="contacts"
        id={deleteConfirmContact?.id ?? null}
        title="Cari Kartını Sil"
        onClose={() => setDeleteConfirmContact(null)}
        onDeleted={() => {
          setDeleteConfirmContact(null);
          contactsQuery.refetch();
        }}
      />

      {/* PANEL 6: Cari Detayı (DMR Kinetiq — sağdan kayan okunur panel) */}
      <DetailPanel
        isOpen={!!detailContact}
        onClose={closeDetailContact}
        title={detailContact?.name || 'Cari Detayı'}
        widthClass="max-w-[480px]"
        badge={
          detailContact ? (
            <StatusBadge
              tone={
                detailContact.type === 'customer'
                  ? 'brand'
                  : detailContact.type === 'supplier'
                  ? 'warning'
                  : 'success'
              }
            >
              {detailContact.type === 'customer'
                ? 'Müşteri'
                : detailContact.type === 'supplier'
                ? 'Tedarikçi'
                : 'Müşteri+Tedarikçi'}
            </StatusBadge>
          ) : undefined
        }
        footer={
          detailContact ? (
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<FileText className="h-4 w-4" />}
                onClick={() => {
                  const c = detailContact;
                  setDetailContact(null);
                  handleOpenStatement(c);
                }}
              >
                Ekstre
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<DollarSign className="h-4 w-4" />}
                onClick={() => {
                  const c = detailContact;
                  setDetailContact(null);
                  handleOpenPayment(c, c.type === 'supplier' ? 'expense' : 'income');
                }}
              >
                {detailContact.type === 'supplier' ? 'Ödeme' : 'Tahsilat'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Edit className="h-4 w-4" />}
                onClick={() => {
                  const c = detailContact;
                  setDetailContact(null);
                  handleOpenEditModal(c);
                }}
              >
                Düzenle
              </Button>
            </div>
          ) : undefined
        }
      >
        {detailContact &&
          (() => {
            const c = detailContact;
            const money = (v: number) =>
              `₺${Math.abs(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const isRiskExceeded = !!c.creditLimit && c.balance > c.creditLimit;
            const section = (title: string, rows: [string, string][]) => (
              <div>
                <h4 className="mb-2 text-label font-black uppercase tracking-widest text-fg-muted">{title}</h4>
                <dl className="divide-y divide-line overflow-hidden rounded-card border border-line">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                      <dt className="shrink-0 text-xs font-semibold text-fg-muted">{label}</dt>
                      <dd className="min-w-0 break-words text-right text-xs font-bold text-fg-strong">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
            return (
              <div className="space-y-5">
                {/* Bakiye özeti */}
                <div className="rounded-card border border-line bg-surface-hover/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-label font-bold uppercase tracking-wide text-fg-muted">Cari Bakiye</span>
                    <StatusBadge tone={c.balance > 0 ? 'success' : c.balance < 0 ? 'danger' : 'neutral'}>
                      {c.balance > 0 ? 'Alacaklı' : c.balance < 0 ? 'Borçlu' : 'Kapalı'}
                    </StatusBadge>
                  </div>
                  <div
                    className={cn(
                      'mt-1 font-mono text-2xl font-black tabular-nums',
                      c.balance > 0 ? 'text-success' : c.balance < 0 ? 'text-danger' : 'text-fg-strong'
                    )}
                  >
                    {money(c.balance)}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-fg-muted">Kredi / Risk Limiti</div>
                      <div className="font-bold tabular-nums text-fg-strong">{c.creditLimit ? money(c.creditLimit) : '—'}</div>
                    </div>
                    <div>
                      <div className="text-fg-muted">Vade</div>
                      <div className="font-bold text-fg-strong">{c.paymentTermDays ? `${c.paymentTermDays} gün` : '—'}</div>
                    </div>
                  </div>
                  {isRiskExceeded && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-danger">
                      <AlertTriangle className="h-3.5 w-3.5" /> Kredi limiti aşıldı
                    </div>
                  )}
                </div>

                {section('İletişim', [
                  ['Cari Kodu', c.code || '—'],
                  ['Yetkili Kişi', c.contactPerson || '—'],
                  ['Kategori', c.category || '—'],
                  ['Sabit Telefon', c.phone || '—'],
                  ['GSM / Cep', c.mobile || '—'],
                  ['E-posta', c.email || '—'],
                  ['Web Sitesi', c.website || '—'],
                ])}

                {section('Adres', [
                  ['İl / İlçe', [c.city, c.district].filter(Boolean).join(' / ') || '—'],
                  ['Fatura Adresi', c.address || '—'],
                  ['Sevkiyat Adresi', c.shippingAddress || '—'],
                ])}

                {section('Vergi Bilgileri', [
                  ['Vergi Dairesi', c.taxOffice || '—'],
                  ['Vergi No', c.taxNumber || '—'],
                  ['TC Kimlik No', c.tcKimlik || '—'],
                ])}
              </div>
            );
          })()}
      </DetailPanel>
    </div>
  );
}
