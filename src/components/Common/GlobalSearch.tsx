import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Package, Users, CornerDownLeft, Loader2 } from 'lucide-react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useAuth } from '../../context/AuthContext';
import { NAV, leavesOf } from '../../lib/navConfig';
import { usePopover } from './usePopover';
import { cn } from '../../lib/utils';

interface Hit {
  id: string;
  label: string;
  sub?: string;
  href: string;
  kind: 'nav' | 'product' | 'contact';
}

/**
 * DMR Kinetiq üst bar global araması: menü kısayolları + stok kartları + cariler.
 * Stok/cari sonuçları sunucu tarafı `search` ile gelir (tüm liste çekilmez).
 */
export default function GlobalSearch() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const q = debounced;
  const enabled = q.length >= 2;

  const products = useApiQuery(
    () => (enabled && hasPermission('inventory', 'view')
      ? api.products.list({ search: q, limit: 6, select: ['id', 'code', 'name'] })
      : Promise.resolve([])),
    [q, enabled],
    ['products']
  );
  const contacts = useApiQuery(
    () => (enabled && hasPermission('contacts', 'view')
      ? api.contacts.list({ search: q, limit: 6, select: ['id', 'code', 'name', 'type'] })
      : Promise.resolve([])),
    [q, enabled],
    ['contacts']
  );

  const hits = useMemo<Hit[]>(() => {
    const list: Hit[] = [];
    const lq = q.toLocaleLowerCase('tr');
    for (const entry of NAV) {
      if (!hasPermission(entry.module, 'view')) continue;
      for (const leaf of leavesOf(entry)) {
        if (!lq || leaf.name.toLocaleLowerCase('tr').includes(lq)) {
          list.push({ id: `nav-${leaf.href}`, label: leaf.name, sub: entry.label, href: leaf.href, kind: 'nav' });
        }
      }
    }
    if (enabled) {
      for (const p of products || []) {
        list.push({ id: `p-${p.id}`, label: p.name, sub: p.code, href: `/inventory?productId=${p.id}`, kind: 'product' });
      }
      for (const c of contacts || []) {
        list.push({ id: `c-${c.id}`, label: c.name, sub: c.code, href: `/contacts?contactId=${c.id}`, kind: 'contact' });
      }
    }
    return list.slice(0, 12);
  }, [q, enabled, products, contacts, hasPermission]);

  const { panelRef, style } = usePopover(triggerRef, open, () => setOpen(false), {
    width: 380,
    maxHeight: 420,
    align: 'start',
  });

  useEffect(() => setActive(0), [hits.length, q]);

  const go = (hit: Hit) => {
    setOpen(false);
    setQuery('');
    navigate(hit.href);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open || !hits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % hits.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + hits.length) % hits.length); }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[active]); }
  };

  const KindIcon = { nav: CornerDownLeft, product: Package, contact: Users } as const;

  return (
    <div ref={triggerRef} className="relative w-full max-w-md">
      <div className="relative flex items-center">
        <Search className="w-4 h-4 text-fg-muted absolute left-3 pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          type="text"
          placeholder="Ara: menü, stok kartı, cari…"
          className="w-full pl-9 pr-3 py-2 bg-surface-hover/60 border border-line rounded-xl text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-ring transition-colors"
        />
        {enabled && !products && !contacts && (
          <Loader2 className="w-3.5 h-3.5 text-fg-muted absolute right-3 animate-spin" />
        )}
      </div>

      {open && style && (
        <div
          ref={panelRef}
          style={style}
          className="z-50 bg-surface border border-line rounded-card shadow-raised overflow-hidden"
        >
          {hits.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-fg-muted">
              {enabled ? 'Sonuç bulunamadı' : 'En az 2 karakter girin'}
            </p>
          ) : (
            <ul className="max-h-[400px] overflow-y-auto custom-scrollbar py-1">
              {hits.map((hit, i) => {
                const Icon = KindIcon[hit.kind];
                return (
                  <li key={hit.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(hit)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer transition-colors',
                        i === active ? 'bg-brand-soft' : 'hover:bg-surface-hover'
                      )}
                    >
                      <Icon className={cn('w-4 h-4 shrink-0', i === active ? 'text-brand' : 'text-fg-muted')} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-fg-strong truncate">{hit.label}</span>
                        {hit.sub ? <span className="block text-2xs text-fg-muted truncate">{hit.sub}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
