import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';

export type PageHeaderColor = 'indigo' | 'emerald' | 'purple' | 'amber' | 'blue' | 'rose' | 'slate';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string;
  icon: LucideIcon;
  iconColor?: PageHeaderColor;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

const colorStyles: Record<PageHeaderColor, {
  gradient: string;
  badge: string;
}> = {
  indigo: {
    gradient: 'from-indigo-600 to-indigo-800 text-white',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/70',
  },
  emerald: {
    gradient: 'from-emerald-600 to-emerald-800 text-white',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/70',
  },
  purple: {
    gradient: 'from-purple-600 to-purple-800 text-white',
    badge: 'bg-purple-50 text-purple-700 border-purple-200/70',
  },
  amber: {
    gradient: 'from-amber-500 to-amber-700 text-white',
    badge: 'bg-amber-50 text-amber-800 border-amber-200/70',
  },
  blue: {
    gradient: 'from-blue-600 to-blue-800 text-white',
    badge: 'bg-blue-50 text-blue-700 border-blue-200/70',
  },
  rose: {
    gradient: 'from-rose-600 to-rose-800 text-white',
    badge: 'bg-rose-50 text-rose-700 border-rose-200/70',
  },
  slate: {
    gradient: 'from-slate-700 to-slate-900 text-white',
    badge: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700',
  },
};

export default function PageHeader({
  title,
  subtitle,
  badge,
  icon: Icon,
  iconColor = 'indigo',
  actions,
  children,
  className
}: PageHeaderProps) {
  const styles = colorStyles[iconColor] || colorStyles.indigo;
  const formattedTitle = title;

  return (
    <div className={cn("bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 font-sans transition-colors duration-200", className)}>
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="relative shrink-0 group">
          <div className="w-11 h-11 rounded-xl bg-slate-950 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-xs overflow-hidden transition-transform group-hover:scale-105">
            <img src="/brand/dmr-nexus-icon.png" alt="DMR Nexus" className="w-full h-full object-contain" />
          </div>
          <div className={cn(
            "absolute -bottom-1 -right-1 w-5 h-5 rounded-md flex items-center justify-center text-white shadow-xs bg-gradient-to-br ring-2 ring-white dark:ring-slate-900",
            styles.gradient
          )}>
            <Icon className="w-3 h-3" />
          </div>
        </div>
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-snug truncate normal-case">
              {formattedTitle}
            </h1>
            {badge && (
              <span className={cn("px-2 py-0.5 rounded-md border text-[10px] font-semibold shrink-0 normal-case", styles.badge)}>
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {(actions || children) && (
        <div className="flex flex-wrap items-center gap-2 shrink-0 md:ml-auto">
          {actions}
          {children}
        </div>
      )}
    </div>
  );
}
