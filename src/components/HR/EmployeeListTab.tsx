import React, { useState } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Phone,
  Shield,
  DollarSign,
  LayoutGrid,
  Table
} from 'lucide-react';
import { cn } from '../../lib/utils';
import DataGrid, { StatusPill, type GridColumn } from '../Common/DataGrid';
import DetailPanel from '../Common/DetailPanel';
import { DetailSection, DetailSummary, DetailTiles } from '../Common/DetailPanelContent';
import StatusBadge from '../Common/StatusBadge';
import type { Employee, SgkStatus } from '../../types';
import DeleteConfirmModal from '../Common/DeleteConfirmModal';
import EmployeeModal from './EmployeeModal';

interface EmployeeListTabProps {
  employees: Employee[];
  onRefresh: () => void;
}

export default function EmployeeListTab({ employees, onRefresh }: EmployeeListTabProps) {
  const [sgkFilter, setSgkFilter] = useState<'all' | SgkStatus>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'passive'>('active');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmp, setDeletingEmp] = useState<Employee | null>(null);
  const [detailEmp, setDetailEmp] = useState<Employee | null>(null);

  const handleEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setIsModalOpen(true);
  };

  const handleDelete = (emp: Employee) => setDeletingEmp(emp);

  const filteredEmployees = employees.filter((emp) => {
    if (statusFilter !== 'all' && emp.status !== statusFilter) return false;
    if (sgkFilter !== 'all' && emp.sgkStatus !== sgkFilter) return false;
    if (deptFilter !== 'all' && emp.department !== deptFilter) return false;
    return true;
  });

  // Department list from existing employees
  const departments = Array.from(new Set(employees.map(e => e.department)));

  const employeeColumns: GridColumn<Employee>[] = [
    {
      key: 'employee',
      title: 'Sicil & Personel',
      render: (emp) => (
        <div className="flex items-center gap-3">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0',
            emp.sgkStatus === 'sgk_li' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
            {emp.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
          </div>
          <div>
            <span className="font-semibold text-slate-900 dark:text-slate-100 block">
              {emp.name}
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              {emp.employeeCode}
            </span>
          </div>
        </div>
      ),
      filterValue: (emp) => `${emp.name} ${emp.employeeCode} ${emp.position} ${emp.phone ?? ''}`
    },
    {
      key: 'position',
      title: 'Görev / Departman',
      render: (emp) => (
        <div>
          <span className="font-medium text-slate-800 dark:text-slate-200 block">
            {emp.position}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {emp.department}
          </span>
        </div>
      ),
      filterValue: (emp) => `${emp.position} ${emp.department}`
    },
    {
      key: 'sgkStatus',
      title: 'SGK Durumu',
      render: (emp) => (
        <StatusPill tone={emp.sgkStatus === 'sgk_li' ? 'green' : 'amber'}>
          {emp.sgkStatus === 'sgk_li' ? 'SGK\'lı' : 'Yevmiyeli'}
        </StatusPill>
      ),
      filterValue: (emp) => emp.sgkStatus === 'sgk_li' ? 'SGKlı' : 'Yevmiyeli'
    },
    {
      key: 'baseSalary',
      title: 'Ücret Tipi & Baz Maaş',
      align: 'right',
      filterable: false,
      render: (emp) => (
        <div className="font-mono">
          <div className="font-semibold text-slate-900 dark:text-slate-100">
            ₺{emp.baseSalary.toLocaleString('tr-TR')}
          </div>
          <div className="text-[10px] text-slate-400 font-sans">
            {emp.salaryType === 'daily' ? 'Günlük Yevmiye' : emp.salaryType === 'monthly_gross' ? 'Aylık Brüt' : 'Aylık Net'}
          </div>
        </div>
      )
    },
    {
      key: 'hireDate',
      title: 'İşe Giriş',
      render: (emp) => (
        <span className="font-mono text-[11px] text-slate-600">
          {new Date(emp.hireDate).toLocaleDateString('tr-TR')}
        </span>
      ),
      filterValue: (emp) => new Date(emp.hireDate).toLocaleDateString('tr-TR')
    },
    {
      key: 'remainingLeave',
      title: 'Kalan İzin',
      render: (emp) => (
        <span className="font-mono font-semibold text-indigo-600 text-[11px]">
          {Math.max(0, (emp.entitledAnnualLeave ?? 14) - (emp.usedAnnualLeave ?? 0))} Gün
        </span>
      ),
      filterValue: (emp) => String(Math.max(0, (emp.entitledAnnualLeave ?? 14) - (emp.usedAnnualLeave ?? 0)))
    },
    {
      key: 'phone',
      title: 'İletişim',
      render: (emp) => (
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          <div>{emp.phone || '-'}</div>
          {emp.iban && (
            <div className="text-[10px] font-mono text-slate-400 truncate max-w-[120px]" title={emp.iban}>
              {emp.iban}
            </div>
          )}
        </div>
      ),
      filterValue: (emp) => `${emp.phone ?? ''} ${emp.iban ?? ''}`
    }
  ];

  return (
    <div className="space-y-4">
      {/* Top Filter and Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 shadow-xs">
        
        <div className="flex flex-wrap items-center gap-2.5 flex-1 w-full sm:w-auto">
          {/* SGK Status Filter */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs shrink-0">
            <button
              onClick={() => setSgkFilter('all')}
              className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-colors cursor-pointer ${
                sgkFilter === 'all' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              Tümü ({employees.length})
            </button>
            <button
              onClick={() => setSgkFilter('sgk_li')}
              className={`px-2.5 py-1 rounded-md font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
                sgkFilter === 'sgk_li' ? 'bg-white dark:bg-slate-900 text-emerald-700 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              <Shield className="w-3 h-3 text-emerald-600" />
              SGK'lı ({employees.filter(e => e.sgkStatus === 'sgk_li').length})
            </button>
            <button
              onClick={() => setSgkFilter('sgk_siz')}
              className={`px-2.5 py-1 rounded-md font-semibold text-[11px] flex items-center gap-1 transition-colors cursor-pointer ${
                sgkFilter === 'sgk_siz' ? 'bg-white dark:bg-slate-900 text-amber-700 shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200'
              }`}
            >
              <DollarSign className="w-3 h-3 text-amber-600" />
              Yevmiyeli ({employees.filter(e => e.sgkStatus === 'sgk_siz').length})
            </button>
          </div>

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none shrink-0"
          >
            <option value="all">Tüm Departmanlar</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'passive')}
            className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none shrink-0"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="active">Aktif</option>
            <option value="passive">Pasif</option>
          </select>
        </div>

        {/* View Mode Toggle & Add Button */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end shrink-0">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700/60">
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium text-xs flex items-center gap-1.5 transition-all cursor-pointer",
                viewMode === 'table' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xs font-semibold" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
              )}
              title="Tablo Görünümü"
            >
              <Table className="w-3.5 h-3.5" />
              <span>Tablo</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={cn(
                "px-2.5 py-1 rounded-md font-medium text-xs flex items-center gap-1.5 transition-all cursor-pointer",
                viewMode === 'cards' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xs font-semibold" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200"
              )}
              title="Kart Görünümü"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kartlar</span>
            </button>
          </div>

          <button
            onClick={() => {
              setEditingEmployee(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni Personel</span>
          </button>
        </div>
      </div>

      {/* Main Employee Content (Table vs Cards) */}
      {viewMode === 'table' ? (
        /* TABLO GÖRÜNÜMÜ */
        <DataGrid
          columns={employeeColumns}
          data={filteredEmployees}
          rowKey={(emp) => emp.id ?? emp.employeeCode}
          onRowClick={(emp) => setDetailEmp(emp)}
          emptyMessage="Arama kriterlerinize uygun personel bulunamadı."
          rowActions={(emp) => (
            <>
              <button
                onClick={() => handleEdit(emp)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                title="Düzenle"
              >
                <Edit className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDelete(emp)}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                title="Sil"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        />
      ) : (
        /* KART GÖRÜNÜMÜ */
        filteredEmployees.length === 0 ? (
          <div className="p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 text-center text-slate-400 text-xs">
            Arama kriterlerinize uygun personel bulunamadı.
          </div>
        ) : (
        /* KART GÖRÜNÜMÜ */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredEmployees.map((emp) => {
            const isSgk = emp.sgkStatus === 'sgk_li';
            const remainingLeave = Math.max(0, (emp.entitledAnnualLeave ?? 14) - (emp.usedAnnualLeave ?? 0));

            return (
              <div
                key={emp.id}
                onClick={() => setDetailEmp(emp)}
                className="cursor-pointer bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 shadow-xs hover:border-slate-300 transition-all p-4 flex flex-col justify-between group"
              >
                <div className="space-y-3">
                  {/* Top info */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs ${
                        isSgk ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {emp.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </div>
                      <div>
                        <h4 className="font-semibold text-xs text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">
                          {emp.name}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono">{emp.employeeCode}</span>
                          <span>•</span>
                          <span>{emp.position}</span>
                        </div>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      isSgk 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60' 
                        : 'bg-amber-50 text-amber-700 border-amber-200/60'
                    }`}>
                      {isSgk ? 'SGK\'lı' : 'Yevmiyeli'}
                    </span>
                  </div>

                  {/* Department & Wage details */}
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-slate-600">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">Departman:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">{emp.department}</span>
                    </div>

                    <div className="flex justify-between items-center text-slate-600">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {emp.salaryType === 'daily' ? 'Günlük Yevmiye:' : 'Aylık Ücret:'}
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 text-[11px]">
                        ₺{emp.baseSalary.toLocaleString('tr-TR')} 
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 font-normal ml-1">
                          {emp.salaryType === 'daily' ? '/ gün' : emp.salaryType === 'monthly_gross' ? '(Brüt)' : '(Net)'}
                        </span>
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-slate-600">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">Kalan İzin:</span>
                      <span className="font-mono font-semibold text-indigo-600 text-[11px]">
                        {remainingLeave} Gün
                      </span>
                    </div>
                  </div>

                  {/* Contact Snippets */}
                  <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    {emp.phone && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{emp.phone}</span>
                      </div>
                    )}
                    {emp.paymentMethod === 'bank' && emp.iban && (
                      <div className="text-[10px] font-mono text-slate-400 truncate" title={emp.iban}>
                        IBAN: {emp.iban}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Giriş: {new Date(emp.hireDate).toLocaleDateString('tr-TR')}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEdit(emp); }}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      title="Düzenle"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(emp); }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )
      )}

      {/* Employee Detail Panel */}
      {detailEmp && (() => {
        const salaryLabel = detailEmp.salaryType === 'daily' ? 'Günlük Yevmiye'
          : detailEmp.salaryType === 'hourly' ? 'Saatlik Ücret'
          : detailEmp.salaryType === 'monthly_gross' ? 'Aylık Brüt'
          : 'Aylık Net';
        const remainingLeave = Math.max(0, (detailEmp.entitledAnnualLeave ?? 14) - (detailEmp.usedAnnualLeave ?? 0));
        return (
          <DetailPanel
            isOpen={!!detailEmp}
            onClose={() => setDetailEmp(null)}
            title={detailEmp.name}
            widthClass="max-w-[440px]"
            badge={(
              <StatusBadge tone={detailEmp.status === 'active' ? 'success' : 'neutral'}>
                {detailEmp.status === 'active' ? 'Aktif' : 'Pasif'}
              </StatusBadge>
            )}
            footer={(
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { const e = detailEmp; setDetailEmp(null); handleEdit(e); }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-control bg-brand px-3 py-2 text-xs font-black text-white transition-colors hover:bg-brand-hover cursor-pointer"
                >
                  <Edit className="h-3.5 w-3.5" />
                  Düzenle
                </button>
                <button
                  type="button"
                  onClick={() => { const e = detailEmp; setDetailEmp(null); handleDelete(e); }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-control border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-black text-danger transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Sil
                </button>
              </div>
            )}
          >
            <div className="space-y-4">
              <DetailSummary
                label={salaryLabel}
                value={detailEmp.baseSalary.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                unit="₺"
                tone="brand"
                badge={detailEmp.sgkStatus === 'sgk_li' ? "SGK'lı" : 'Yevmiyeli'}
              >
                <div className="mt-2 text-xs font-bold text-fg-muted">
                  {detailEmp.department} · {detailEmp.position}
                </div>
              </DetailSummary>

              <DetailTiles
                cols={3}
                items={[
                  { label: 'Kalan İzin', value: `${remainingLeave} Gün` },
                  { label: 'Kullanılan', value: `${detailEmp.usedAnnualLeave ?? 0} Gün` },
                  { label: 'Hak Edilen', value: `${detailEmp.entitledAnnualLeave ?? 14} Gün` },
                ]}
              />

              <DetailSection
                title="Personel Bilgileri"
                rows={[
                  { label: 'Sicil No', value: detailEmp.employeeCode },
                  { label: 'T.C. Kimlik', value: detailEmp.tcNo || '—' },
                  { label: 'İşe Giriş', value: new Date(detailEmp.hireDate).toLocaleDateString('tr-TR') },
                  { label: 'Çıkış', value: detailEmp.terminationDate ? new Date(detailEmp.terminationDate).toLocaleDateString('tr-TR') : '—' },
                ]}
              />

              <DetailSection
                title="İletişim & Ödeme"
                rows={[
                  { label: 'Telefon', value: detailEmp.phone || '—' },
                  { label: 'E-posta', value: detailEmp.email || '—' },
                  { label: 'Ödeme', value: detailEmp.paymentMethod === 'bank' ? 'Banka' : 'Nakit' },
                  { label: 'IBAN', value: detailEmp.iban ? <span className="font-mono select-all">{detailEmp.iban}</span> : '—' },
                ]}
              />

              {detailEmp.address && (
                <DetailSection title="Adres">
                  <p className="rounded-card border border-line bg-surface-hover/40 p-3 text-xs font-semibold text-fg">{detailEmp.address}</p>
                </DetailSection>
              )}
            </div>
          </DetailPanel>
        );
      })()}

      {/* Employee Modal */}
      <EmployeeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        employee={editingEmployee}
        onSaved={onRefresh}
      />

      {deletingEmp && (
        <DeleteConfirmModal
          resource="employees"
          id={deletingEmp.id ?? null}
          title="Personel Kartını Sil"
          onClose={() => setDeletingEmp(null)}
          onDeleted={() => {
            setDeletingEmp(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
