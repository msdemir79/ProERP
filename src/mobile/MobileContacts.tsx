import { useMemo, useState } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import { api } from '../api/client';
import { useApiQueryFull } from '../hooks/useApiQuery';
import type { Contact } from '../types';
import { formatTRY } from './format';
import { cn } from '../lib/utils';
import MobileContactDetail from './MobileContactDetail';

const TYPE_LABEL: Record<string, string> = {
  customer: 'Müşteri',
  supplier: 'Tedarikçi',
  both: 'Müşteri+Tedarikçi',
};

/** Mobil cari listesi: arama + bakiye; satıra dokununca detay sayfası açılır. */
export default function MobileContacts() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Contact | null>(null);
  const { data, loading } = useApiQueryFull<Contact[]>(() => api.contacts.list(), [], ['contacts']);

  const rows = useMemo(() => {
    const all = data ?? [];
    const term = q.trim().toLocaleLowerCase('tr-TR');
    const filtered = term
      ? all.filter((c) =>
          `${c.name} ${c.code ?? ''} ${c.contactPerson ?? ''}`.toLocaleLowerCase('tr-TR').includes(term),
        )
      : all;
    return filtered.slice(0, 200);
  }, [data, q]);

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari ara (ad, kod, yetkili)"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {loading && <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Yükleniyor…</div>}

      {!loading && rows.length === 0 && (
        <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Sonuç bulunamadı.</div>
      )}

      <div className="space-y-2">
        {rows.map((c) => {
          const bal = c.balance || 0;
          return (
            <button
              type="button"
              key={c.id ?? c.code ?? c.name}
              onClick={() => setSel(c)}
              className="w-full flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{c.name}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {c.code ?? '-'} · {TYPE_LABEL[c.type] ?? c.type}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div
                  className={cn(
                    'text-sm font-bold tabular-nums',
                    bal > 0 ? 'text-emerald-600 dark:text-emerald-400' : bal < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400',
                  )}
                >
                  {formatTRY(bal)}
                </div>
                <div className="text-[10px] text-slate-400">{bal >= 0 ? 'Alacak' : 'Borç'}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
            </button>
          );
        })}
      </div>

      {sel && <MobileContactDetail contact={sel} onClose={() => setSel(null)} />}
    </>
  );
}
