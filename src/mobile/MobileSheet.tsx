import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Ortak mobil alt-sayfa (bottom-sheet): karartılmış fon + alttan yükselen panel.
 * İçerik kaydırılabilir; alt güvenli-alan boşluğu korunur.
 */
export default function MobileSheet({ title, subtitle, onClose, children }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Kapat"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
      />
      <div className="relative flex max-h-[88vh] flex-col rounded-t-2xl bg-white dark:bg-slate-900 shadow-xl border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-4 pt-3.5 pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">{title}</h2>
            {subtitle && <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 pb-[calc(env(safe-area-inset-bottom)_+_0.75rem)]">{children}</div>
      </div>
    </div>
  );
}
