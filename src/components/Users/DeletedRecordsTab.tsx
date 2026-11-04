import React, { useState } from 'react';
import { Trash2, Download, Info } from 'lucide-react';
import { useApiQuery } from '../../hooks/useApiQuery';
import { userService } from '../../services/userService';
import { exportToCsv } from '../../lib/exportService';
import { showToast } from '../../lib/feedback';
import DataGrid, { StatusPill, type GridColumn, type PillTone } from '../Common/DataGrid';
import DetailPanel from '../Common/DetailPanel';
import { DetailSection, DetailTiles } from '../Common/DetailPanelContent';
import StatusBadge from '../Common/StatusBadge';
import type { AuditLog } from '../../types';
import { ALL_APP_MODULES } from '../../data/initialRoles';

/** Satırın ekran adı: kayıt tanıtıcısı varsa o, yoksa açıklama. */
function recordLabel(log: AuditLog): string {
  return log.recordSummary?.trim() || log.description;
}

function moduleLabel(moduleId: string): string {
  return ALL_APP_MODULES.find(m => m.id === moduleId)?.name || moduleId;
}

function formatTimestamp(value: Date | string): string {
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export default function DeletedRecordsTab() {
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const logs = useApiQuery(
    () => userService.getDeletedRecords({ module: selectedModule }),
    [selectedModule],
    ['auditLogs']
  ) || [];

  const deniedCount = logs.filter(l => l.action === 'delete_denied').length;

  const columns: GridColumn<AuditLog>[] = [
    {
      key: 'timestamp',
      title: 'Tarih & Saat',
      render: (log) => (
        <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
          {formatTimestamp(log.timestamp)}
        </span>
      ),
      sortValue: (log) => new Date(log.timestamp).getTime(),
    },
    {
      key: 'userName',
      title: 'Kullanıcı & Rol',
      render: (log) => (
        <>
          <div className="font-semibold text-slate-900 dark:text-slate-100 leading-tight">
            {log.userName}
          </div>
          <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono mt-0.5">
            {log.userRole}
          </div>
        </>
      ),
      filterValue: (log) => `${log.userName} ${log.userRole}`,
    },
    {
      key: 'module',
      title: 'Modül',
      render: (log) => <StatusPill tone="slate">{moduleLabel(log.module)}</StatusPill>,
      filterValue: (log) => moduleLabel(log.module),
    },
    {
      key: 'action',
      title: 'Sonuç',
      render: (log) => {
        const tone: PillTone = log.action === 'delete_denied' ? 'amber' : 'red';
        const label = log.action === 'delete_denied' ? 'Reddedildi' : 'Silindi';
        return <StatusPill tone={tone}>{label}</StatusPill>;
      },
      filterValue: (log) => (log.action === 'delete_denied' ? 'Reddedildi' : 'Silindi'),
    },
    {
      key: 'recordSummary',
      title: 'Kayıt',
      render: (log) => (
        <>
          <div className="font-medium text-slate-900 dark:text-slate-100 line-clamp-1">
            {recordLabel(log)}
          </div>
          {log.details && (
            <div className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-1 mt-0.5">
              {log.details}
            </div>
          )}
        </>
      ),
      filterValue: (log) => `${recordLabel(log)} ${log.description} ${log.details ?? ''}`,
    },
    {
      key: 'reason',
      title: 'Gerekçe',
      render: (log) => (
        <span className="text-slate-700 dark:text-slate-300 line-clamp-2">
          {log.reason?.trim() || (log.action === 'delete_denied' ? 'Parola doğrulanamadı' : '—')}
        </span>
      ),
      filterValue: (log) => log.reason ?? '',
    },
    {
      key: 'ipAddress',
      title: 'İstemci IP',
      align: 'right',
      render: (log) => (
        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">
          {log.ipAddress || '—'}
        </span>
      ),
      filterValue: (log) => log.ipAddress ?? '',
    },
  ];

  const handleExport = () => {
    if (logs.length === 0) {
      showToast('Dışa aktarılacak silme kaydı bulunamadı.', 'warning');
      return;
    }

    const headers = ['Tarih & Saat', 'Kullanıcı', 'Rolü', 'Modül', 'Sonuç', 'Kayıt', 'Açıklama', 'Birlikte Silinenler', 'Gerekçe', 'IP Adresi'];
    const rows = logs.map(l => [
      formatTimestamp(l.timestamp),
      l.userName,
      l.userRole,
      moduleLabel(l.module),
      l.action === 'delete_denied' ? 'Reddedildi' : 'Silindi',
      recordLabel(l),
      l.description,
      l.details || '-',
      l.reason || '-',
      l.ipAddress || '-'
    ]);

    const dateStr = new Date().toISOString().slice(0, 10);
    exportToCsv(`DMR Nexus_Silinen_Kayitlar_${dateStr}.csv`, headers, rows);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800/80 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="w-full sm:w-52">
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition-all"
            >
              <option value="all">Tüm Modüller</option>
              <option value="users">Kullanıcılar & Roller</option>
              {ALL_APP_MODULES.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
            <span className="px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 font-semibold">
              {logs.length - deniedCount} silinen
            </span>
            <span className="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold">
              {deniedCount} reddedilen
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center">
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            Excel'e Aktar
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300">
        <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <p>
          Silme hareketleri kalıcıdır: bu liste kimin, ne zaman, hangi kaydı sildiğini gösterir ancak
          kaydı geri yüklemez. Kurtarma yalnızca <code className="font-mono text-slate-900 dark:text-slate-100">npm run db:restore</code> ile
          alınan yedekten yapılır. Kademe 2 kayıtlarda gerekçe ve parola doğrulaması zorunludur; hatalı
          parola denemeleri de "Reddedildi" olarak burada iz bırakır.
        </p>
      </div>

      <DataGrid
        columns={columns}
        data={logs}
        rowKey={(log) => log.id ?? `${new Date(log.timestamp).getTime()}-${log.userName}`}
        onRowClick={(log) => setSelected(log)}
        defaultSort={{ key: 'timestamp', dir: 'desc' }}
        emptyMessage="Seçili modüle ait silme hareketi bulunamadı."
        toolbar={
          <>
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-600" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Silinen Kayıtlar ({logs.length})
              </h3>
            </div>
            <span className="ml-auto text-[11px] text-slate-600 dark:text-slate-400">
              Denetim izinden otomatik süzülür (salt okunur)
            </span>
          </>
        }
      />

      {/* Silme Hareketi Detay Paneli */}
      {selected && (() => {
        const isDenied = selected.action === 'delete_denied';
        return (
          <DetailPanel
            isOpen={!!selected}
            onClose={() => setSelected(null)}
            title={isDenied ? 'Reddedilen Silme Denemesi' : 'Silme Hareketi Detayı'}
            widthClass="max-w-[440px]"
            badge={(
              <StatusBadge tone={isDenied ? 'warning' : 'danger'}>
                {isDenied ? 'Reddedildi' : 'Kalıcı olarak silindi'}
              </StatusBadge>
            )}
            footer={(
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex w-full items-center justify-center rounded-control bg-brand px-3 py-2 text-xs font-black text-white transition-colors hover:bg-brand-hover cursor-pointer"
              >
                Kapat
              </button>
            )}
          >
            <div className="space-y-4">
              <DetailTiles
                items={[
                  { label: 'Tarih & Saat', value: formatTimestamp(selected.timestamp) },
                  { label: 'Modül', value: moduleLabel(selected.module) },
                  { label: 'İşlemi Yapan', value: selected.userName },
                  { label: 'İstemci IP', value: selected.ipAddress || '—' },
                ]}
              />

              <DetailSection
                title="Hareket"
                rows={[
                  { label: 'Rolü', value: selected.userRole },
                  { label: 'Kayıt', value: recordLabel(selected) },
                ]}
              />

              <DetailSection title="Açıklama">
                <p className="rounded-card border border-line bg-surface p-3 text-xs font-medium text-fg-strong">
                  {selected.description}
                </p>
              </DetailSection>

              {selected.details && (
                <DetailSection title="Birlikte Silinenler">
                  <p className="rounded-card border border-line bg-surface-hover/40 p-3 text-xs text-fg">
                    {selected.details}
                  </p>
                </DetailSection>
              )}

              <DetailSection title="Gerekçe">
                <p className="whitespace-pre-wrap rounded-card border border-line bg-surface p-3 text-xs text-fg">
                  {selected.reason?.trim() || (isDenied ? 'Parola doğrulanamadı; kayıt silinmedi.' : 'Gerekçe girilmedi (bu kademe için zorunlu değil).')}
                </p>
              </DetailSection>

              {selected.entityId != null && (
                <p className="border-t border-line pt-3 text-2xs text-fg-muted">
                  Kayıt kimliği: <strong className="font-mono text-fg-strong">{String(selected.entityId)}</strong>
                </p>
              )}
            </div>
          </DetailPanel>
        );
      })()}
    </div>
  );
}
