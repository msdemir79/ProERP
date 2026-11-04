import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Menu,
  X,
  Camera,
  Lock,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
  Undo2,
  KeyRound,
  ShieldAlert,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { NAV, leavesOf, moduleForPath, labelForPath, type NavEntry, type NavLeaf } from '../lib/navConfig';
import UserSwitcherModal from './Users/UserSwitcherModal';
import AccessDenied from './Common/AccessDenied';
import ChangePasswordModal from './Common/ChangePasswordModal';
import CameraBarcodeScannerModal from './Common/CameraBarcodeScannerModal';
import GlobalSearch from './Common/GlobalSearch';
import NotificationBell from './Common/NotificationBell';
import UserMenu from './Common/UserMenu';

const BRAND_NAME = 'DMR Nexus';

export default function Layout() {
  const { actualTheme, setTheme } = useTheme();
  const location = useLocation();
  const pathname = location.pathname;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isGlobalScannerOpen, setIsGlobalScannerOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved ? JSON.parse(saved) : false;
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  const {
    currentUser,
    hasPermission,
    impersonatedBy,
    passwordWarning,
    stopImpersonation,
  } = useAuth();

  const currentModule = moduleForPath(pathname);
  const isCurrentModuleAllowed = hasPermission(currentModule, 'view');
  const pageTitle = labelForPath(pathname);

  // Sekme başlığı aktif sayfayı yansıtsın: çok sekmeli kullanımda ve tarayıcı
  // geçmişinde hangi ekranın açık olduğu okunabilir olur.
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · ${BRAND_NAME}` : BRAND_NAME;
  }, [pageTitle]);

  const isLeafActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');

  // Aktif yolu içeren grubu otomatik genişlet.
  useEffect(() => {
    for (const entry of NAV) {
      if (!entry.items) continue;
      if (entry.items.some((leaf) => isLeafActive(leaf.href))) {
        setExpanded((prev) => (prev[entry.label] ? prev : { ...prev, [entry.label]: true }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleGroup = (label: string) =>
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));

  const entryAllowed = (entry: NavEntry) => hasPermission(entry.module, 'view');
  const leafAllowed = (leaf: NavLeaf) => hasPermission(leaf.module, 'view');

  const Logo = ({ size = 'md' }: { size?: 'md' | 'sm' }) => (
    <img
      src="/brand/dmr-nexus-icon.png"
      alt={BRAND_NAME}
      className={cn('shrink-0 object-contain', size === 'md' ? 'w-8 h-8' : 'w-7 h-7')}
    />
  );

  /* ---------------------------------- Desktop sidebar --------------------------------- */
  const renderDesktopEntry = (entry: NavEntry) => {
    const allowed = entryAllowed(entry);
    const leaves = leavesOf(entry);
    const groupActive = leaves.some((leaf) => isLeafActive(leaf.href));
    const isOpen = expanded[entry.label] ?? false;
    const Icon = entry.icon;

    // Daraltılmış mod: yalnızca ikon; gruplar ilk yaprağa gider.
    if (isCollapsed) {
      const target = leaves[0]?.href ?? '/';
      return (
        <div key={entry.label} className="relative group">
          <NavLink
            to={target}
            className={cn(
              'flex items-center justify-center px-2 py-2 rounded-xl transition-all cursor-pointer',
              groupActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900/60',
              !allowed && 'opacity-50'
            )}
          >
            <Icon className="w-5 h-5" />
            {!allowed && <Lock className="w-3 h-3 absolute top-1 right-1 text-slate-500" />}
          </NavLink>
          <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg shadow-xl border border-slate-700 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
            {entry.label}
          </div>
        </div>
      );
    }

    // Tek yapraklı giriş: doğrudan bağlantı.
    if (entry.href) {
      const leaf = leaves[0];
      return (
        <NavLink
          key={entry.label}
          to={entry.href}
          className={cn(
            'relative flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all cursor-pointer',
            isLeafActive(entry.href)
              ? 'bg-indigo-600 text-white font-semibold'
              : allowed
              ? 'text-slate-400 hover:text-white hover:bg-slate-900/60'
              : 'text-slate-500 opacity-60 cursor-not-allowed'
          )}
        >
          {isLeafActive(entry.href) && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-white/80" />
          )}
          <Icon className="w-5 h-5 shrink-0" />
          <span className="text-xs tracking-wide truncate flex-1">{entry.label}</span>
          {!allowed && <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
        </NavLink>
      );
    }

    // Grup girişi: genişleyebilir başlık + alt bağlantılar.
    return (
      <div key={entry.label}>
        <button
          type="button"
          onClick={() => toggleGroup(entry.label)}
          className={cn(
            'w-full flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all cursor-pointer',
            groupActive ? 'text-white bg-slate-900/70' : 'text-slate-400 hover:text-white hover:bg-slate-900/60',
            !allowed && 'opacity-60'
          )}
        >
          <Icon className={cn('w-5 h-5 shrink-0', groupActive && 'text-indigo-400')} />
          <span className="text-xs font-semibold tracking-wide truncate flex-1 text-left">{entry.label}</span>
          {!allowed && <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
          <ChevronDown className={cn('w-4 h-4 shrink-0 transition-transform', isOpen && 'rotate-180')} />
        </button>
        {isOpen && (
          <div className="mt-0.5 mb-1 ml-4 pl-3 border-l border-slate-800 space-y-0.5">
            {entry.items!.map((leaf) => {
              const ok = leafAllowed(leaf);
              return (
                <NavLink
                  key={leaf.href}
                  to={leaf.href}
                  className={cn(
                    'relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer',
                    isLeafActive(leaf.href)
                      ? 'bg-indigo-600 text-white font-semibold'
                      : ok
                      ? 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                      : 'text-slate-500 opacity-60 cursor-not-allowed'
                  )}
                >
                  <span className="truncate flex-1">{leaf.name}</span>
                  {!ok && <Lock className="w-3 h-3 text-slate-500 shrink-0" />}
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  /* ---------------------------------- Mobile sidebar ---------------------------------- */
  const renderMobileEntry = (entry: NavEntry) => {
    const allowed = entryAllowed(entry);
    const Icon = entry.icon;

    if (entry.href) {
      return (
        <NavLink
          key={entry.label}
          to={entry.href}
          onClick={() => setIsMobileMenuOpen(false)}
          className={cn(
            'flex items-center justify-between px-3 py-2 rounded-lg transition-all text-xs font-medium',
            isLeafActive(entry.href)
              ? 'bg-indigo-600 text-white font-semibold'
              : allowed
              ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
              : 'text-slate-600 opacity-70'
          )}
        >
          <span className="flex items-center gap-2.5 min-w-0 truncate">
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{entry.label}</span>
          </span>
          {!allowed && <Lock className="w-3.5 h-3.5 text-slate-500" />}
        </NavLink>
      );
    }

    return (
      <div key={entry.label}>
        <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" />
          {entry.label}
          {!allowed && <Lock className="w-3 h-3" />}
        </p>
        <div className="space-y-0.5">
          {entry.items!.map((leaf) => {
            const ok = leafAllowed(leaf);
            return (
              <NavLink
                key={leaf.href}
                to={leaf.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  'flex items-center justify-between px-3 py-2 rounded-lg transition-all text-xs font-medium',
                  isLeafActive(leaf.href)
                    ? 'bg-indigo-600 text-white font-semibold'
                    : ok
                    ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    : 'text-slate-600 opacity-70'
                )}
              >
                <span className="truncate">{leaf.name}</span>
                {!ok && <Lock className="w-3.5 h-3.5 text-slate-500" />}
              </NavLink>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="erp-shell flex h-screen pt-[env(safe-area-inset-top)] bg-canvas overflow-hidden font-sans transition-colors duration-200">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'erp-sidebar hidden md:flex md:flex-col bg-slate-950 border-r border-slate-800/80 shrink-0 transition-all duration-300 ease-in-out relative z-20 shadow-2xl',
          isCollapsed ? 'w-[68px]' : 'w-60'
        )}
      >
        <div
          className={cn(
            'h-14 flex items-center border-b border-slate-800/60 shrink-0',
            isCollapsed ? 'justify-center px-0' : 'justify-between px-3.5'
          )}
        >
          <div className={cn('flex items-center gap-2.5 min-w-0 overflow-hidden', isCollapsed && 'hidden')}>
            <Logo />
            <div className="flex flex-col min-w-0">
              <span className="text-white font-black tracking-tight text-sm leading-none truncate">{BRAND_NAME}</span>
              <span className="text-[10px] text-slate-400 font-semibold leading-none mt-1 truncate">
                Ayakkabı Üretim & ERP
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all cursor-pointer"
            title={isCollapsed ? 'Genişlet' : 'Daralt'}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="w-5 h-5 text-indigo-400" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto custom-scrollbar">
          {NAV.map(renderDesktopEntry)}
        </nav>
      </aside>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 md:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 w-64 bg-slate-900 text-white z-50 transform transition-transform duration-300 md:hidden border-r border-slate-800 flex flex-col',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Logo size="sm" />
            <span className="text-white font-bold tracking-tight text-sm truncate">{BRAND_NAME}</span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Kapat"
            className="text-slate-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 p-2.5 overflow-y-auto custom-scrollbar">{NAV.map(renderMobileEntry)}</nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-surface border-b border-line flex items-center gap-3 px-3 md:px-5 shrink-0 z-10 transition-colors duration-200">
          <button
            className="p-1.5 md:hidden text-fg-muted hover:text-fg rounded-lg hover:bg-surface-hover shrink-0 cursor-pointer"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Menüyü aç"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0 flex justify-start md:justify-center">
            <GlobalSearch />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setTheme(actualTheme === 'dark' ? 'light' : 'dark')}
              aria-label={actualTheme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
              title={actualTheme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
              className="p-2 rounded-xl border border-line bg-surface-raised text-brand hover:bg-brand-soft transition-colors cursor-pointer"
            >
              {actualTheme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
            <button
              onClick={() => setIsGlobalScannerOpen(true)}
              title="Kamera ile Canlı Barkod/Karekod Okut"
              className="p-2 rounded-xl border border-line text-fg-muted hover:text-brand hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <Camera className="w-[18px] h-[18px]" />
            </button>
            <NotificationBell />
            <UserMenu
              onOpenSwitcher={() => setIsSwitcherOpen(true)}
              onOpenChangePassword={() => setIsChangePasswordOpen(true)}
            />
            <div className="hidden lg:block text-2xs font-medium text-fg-muted tabular-nums pl-1">
              {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </header>

        {/* Yetki simülasyonu bildirimi */}
        {impersonatedBy && (
          <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-2 bg-warning-soft border-b border-line shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <UserCog className="w-4 h-4 text-warning shrink-0" />
              <span className="text-xs text-fg truncate">
                <strong>{impersonatedBy.userName}</strong> yönetici olarak{' '}
                <strong>{currentUser?.fullName}</strong> hesabı adına işlem yapıyorsunuz. Tüm işlemler denetim
                izine kaydedilir.
              </span>
            </div>
            <button
              type="button"
              onClick={() => stopImpersonation()}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-warning text-white text-2xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Kendi hesabıma dön
            </button>
          </div>
        )}

        {/* Zayıf parola uyarısı */}
        {passwordWarning && (
          <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-2 bg-danger-soft border-b border-line shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert className="w-4 h-4 text-danger shrink-0" />
              <span className="text-xs text-fg truncate">{passwordWarning}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsChangePasswordOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-danger text-white text-2xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Parolamı Değiştir
            </button>
          </div>
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-5 custom-scrollbar">
          <div className="max-w-[1560px] mx-auto w-full">
            {isCurrentModuleAllowed ? <Outlet /> : <AccessDenied module={currentModule} />}
          </div>
        </main>
      </div>

      <UserSwitcherModal isOpen={isSwitcherOpen} onClose={() => setIsSwitcherOpen(false)} />
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        warning={passwordWarning}
      />
      <CameraBarcodeScannerModal isOpen={isGlobalScannerOpen} onClose={() => setIsGlobalScannerOpen(false)} />
    </div>
  );
}
