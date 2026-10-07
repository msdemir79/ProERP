import type { ReactNode } from 'react';
import { LayoutDashboard, Users, Package, ShoppingCart } from 'lucide-react';
import { cn } from '../lib/utils';

export type MobileTab = 'summary' | 'contacts' | 'inventory' | 'orders';

const TABS: { key: MobileTab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'summary', label: 'Özet', icon: LayoutDashboard },
  { key: 'contacts', label: 'Cari', icon: Users },
  { key: 'inventory', label: 'Stok', icon: Package },
  { key: 'orders', label: 'Sipariş', icon: ShoppingCart },
];

interface Props {
  title: string;
  active: MobileTab;
  onTab: (t: MobileTab) => void;
  right?: ReactNode;
  children: ReactNode;
}

/**
 * Mobil-özel kabuk: üst başlık çubuğu + alt sekme (bottom-tab) navigasyonu.
 * Masaüstü Layout'tan tamamen ayrıdır; dar ekranda taşma yapmayacak şekilde kuruludur.
 */
export default function MobileShell({ title, active, onTab, right, children }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-2 px-4 pt-[calc(env(safe-area-inset-top)_+_0.75rem)] pb-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-base font-semibold truncate">{title}</h1>
        <div className="shrink-0">{right}</div>
      </header>

      <main className="flex-1 px-3 pt-3 pb-24 space-y-3">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-20 grid grid-cols-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ key, label, icon: Icon }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onTab(key)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors',
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
              )}
            >
              <Icon className={cn('w-5 h-5', isActive && 'stroke-[2.5]')} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
