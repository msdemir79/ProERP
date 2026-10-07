import { useMemo } from 'react';
import { Phone, Mail, MapPin } from 'lucide-react';
import { api } from '../api/client';
import { useApiQueryFull } from '../hooks/useApiQuery';
import type { Contact, Transaction } from '../types';
import { formatTRY, formatDate } from './format';
import MobileSheet from './MobileSheet';
import { cn } from '../lib/utils';

const TYPE_LABEL: Record<string, string> = {
  customer: 'Müşteri',
  supplier: 'Tedarikçi',
  both: 'Müşteri+Tedarikçi',
};

function Row({ icon: Icon, label, value, href }: { icon?: typeof Phone; label: string; value?: string | null; href?: string }) {
  if (!value) return null;
  const content = (
    <>
      {Icon && <Icon className="w-4 h-4 text-slate-400 shrink-0" />}
      <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">{label}:</span>
      <span className="text-sm truncate">{value}</span>
    </>
  );
  return href ? (
    <a href={href} className="flex items-center gap-2 rounded-lg px-1 py-1 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">{content}</a>
  ) : (
    <div className="flex items-center gap-2 px-1 py-1 text-slate-700 dark:text-slate-200">{content}</div>
  );
}

/** Cari detayı: iletişim (dokun-ara), bakiye ve son işlemler. */
export default function MobileContactDetail({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const cid = contact.id ?? -1;
  const { data, loading } = useApiQueryFull<Transaction[]>(
    () => (cid >= 0 ? api.transactions.list({ where: { contactId: cid } }) : Promise.resolve([])),
    [cid],
    ['transactions'],
  );

  const recent = useMemo(
    () => [...(data ?? [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10),
    [data],
  );

  const bal = contact.balance || 0;
  const phone = contact.mobile || contact.phone;

  return (
    <MobileSheet title={contact.name} subtitle={`${contact.code ?? '-'} · ${TYPE_LABEL[contact.type] ?? contact.type}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Bakiye</div>
            <div className={cn('text-xl font-bold tabular-nums', bal > 0 ? 'text-emerald-600 dark:text-emerald-400' : bal < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100')}>
              {formatTRY(bal)}
            </div>
            <div className="text-[10px] text-slate-400">{bal >= 0 ? 'Alacak' : 'Borç'}</div>
          </div>
          {phone && (
            <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">
              <Phone className="w-4 h-4" /> Ara
            </a>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-2 space-y-0.5">
          <Row icon={Phone} label="Yetkili" value={contact.contactPerson} />
          <Row icon={Phone} label="GSM" value={contact.mobile} href={contact.mobile ? `tel:${contact.mobile.replace(/\s/g, '')}` : undefined} />
          <Row icon={Phone} label="Tel" value={contact.phone} href={contact.phone ? `tel:${contact.phone.replace(/\s/g, '')}` : undefined} />
          <Row icon={Mail} label="E-posta" value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
          <Row icon={MapPin} label="İl/İlçe" value={[contact.city, contact.district].filter(Boolean).join(' / ')} />
          <Row icon={MapPin} label="Adres" value={contact.address} />
          {contact.paymentTermDays !== undefined && <Row label="Vade" value={`${contact.paymentTermDays} gün`} />}
          {contact.taxNumber && <Row label="Vergi No" value={contact.taxNumber} />}
        </div>

        <section>
          <h3 className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Son İşlemler</h3>
          {loading && <div className="py-4 text-center text-xs text-slate-500">Yükleniyor…</div>}
          {!loading && recent.length === 0 && <div className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">İşlem yok.</div>}
          <div className="space-y-1.5">
            {recent.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-slate-100 dark:border-slate-800 px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="text-xs truncate">{t.description || t.category}</div>
                  <div className="text-[10px] text-slate-400">{formatDate(t.date)}{t.documentNo ? ` · ${t.documentNo}` : ''}</div>
                </div>
                <span className={cn('text-xs font-bold tabular-nums shrink-0', t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                  {t.type === 'income' ? '+' : '−'}{formatTRY(t.amount || 0)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </MobileSheet>
  );
}
