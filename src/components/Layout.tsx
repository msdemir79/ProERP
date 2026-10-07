import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useApiQuery } from '../hooks/useApiQuery';
import { 
  LayoutDashboard, 
  Package, 
  Hammer, 
  Wallet, 
  Users, 
  ShoppingCart, 
  Menu, 
  X, 
  Receipt, 
  Truck, 
  Landmark, 
  BookOpen, 
  UserCheck, 
  BarChart3, 
  Settings, 
  ShieldCheck, 
  Lock, 
  Sparkles, 
  Activity,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Camera,
  LogOut,
  UserCog,
  Undo2,
  KeyRound,
  ShieldAlert,
  Barcode,
  FileSpreadsheet
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import UserSwitcherModal from './Users/UserSwitcherModal';
import AccessDenied from './Common/AccessDenied';
import ChangePasswordModal from './Common/ChangePasswordModal';
import CameraBarcodeScannerModal from './Common/CameraBarcodeScannerModal';
import type { AppModule } from '../types';
import { useTheme } from '../context/ThemeContext';

export interface NavItem {
  name: string;
  href: string;
  icon: any;
  module: AppModule;
  colorGradient: string;
  iconColor: string;
  activeGlow: string;
}

const navigation: NavItem[] = [
  { name: 'Panel', href: '/', icon: LayoutDashboard, module: 'dashboard', colorGradient: 'from-indigo-500 to-blue-600', iconColor: 'text-indigo-400', activeGlow: 'shadow-indigo-500/30' },
  { name: 'Stok Yönetimi', href: '/inventory', icon: Package, module: 'inventory', colorGradient: 'from-purple-500 to-indigo-600', iconColor: 'text-purple-400', activeGlow: 'shadow-purple-500/30' },
  { name: 'Barkod Merkezi', href: '/inventory/barcode', icon: Barcode, module: 'inventory', colorGradient: 'from-fuchsia-500 to-purple-600', iconColor: 'text-fuchsia-400', activeGlow: 'shadow-fuchsia-500/30' },
  { name: 'Toplu Stok İşlemleri', href: '/inventory/import', icon: FileSpreadsheet, module: 'inventory', colorGradient: 'from-purple-500 to-fuchsia-600', iconColor: 'text-purple-400', activeGlow: 'shadow-purple-500/30' },
  { name: 'Sipariş Yönetimi', href: '/orders', icon: ShoppingCart, module: 'orders', colorGradient: 'from-blue-500 to-cyan-500', iconColor: 'text-blue-400', activeGlow: 'shadow-blue-500/30' },
  { name: 'İrsaliyeler', href: '/waybills', icon: Truck, module: 'waybills', colorGradient: 'from-amber-500 to-orange-500', iconColor: 'text-amber-400', activeGlow: 'shadow-amber-500/30' },
  { name: 'Faturalar', href: '/invoices', icon: Receipt, module: 'invoices', colorGradient: 'from-emerald-500 to-teal-600', iconColor: 'text-emerald-400', activeGlow: 'shadow-emerald-500/30' },
  { name: 'Finans & Tahsilat', href: '/finance', icon: Landmark, module: 'finance', colorGradient: 'from-teal-500 to-cyan-600', iconColor: 'text-teal-400', activeGlow: 'shadow-teal-500/30' },
  { name: 'Genel Muhasebe', href: '/accounting', icon: BookOpen, module: 'accounting', colorGradient: 'from-violet-500 to-purple-600', iconColor: 'text-violet-400', activeGlow: 'shadow-violet-500/30' },
  { name: 'İnsan Kaynakları (İK)', href: '/hr', icon: UserCheck, module: 'hr', colorGradient: 'from-rose-500 to-pink-600', iconColor: 'text-rose-400', activeGlow: 'shadow-rose-500/30' },
  { name: 'Üretim Planlama', href: '/production', icon: Hammer, module: 'production', colorGradient: 'from-orange-500 to-amber-600', iconColor: 'text-orange-400', activeGlow: 'shadow-orange-500/30' },
  { name: 'Cari Hesaplar', href: '/contacts', icon: Users, module: 'contacts', colorGradient: 'from-pink-500 to-rose-600', iconColor: 'text-pink-400', activeGlow: 'shadow-pink-500/30' },
  { name: 'Raporlar & Analiz', href: '/reports', icon: BarChart3, module: 'reports', colorGradient: 'from-cyan-500 to-blue-600', iconColor: 'text-cyan-400', activeGlow: 'shadow-cyan-500/30' },
  { name: 'Kullanıcılar & Yetkiler', href: '/users', icon: ShieldCheck, module: 'users', colorGradient: 'from-emerald-500 to-green-600', iconColor: 'text-emerald-400', activeGlow: 'shadow-emerald-500/30' },
  { name: 'Ayarlar & Yapılandırma', href: '/settings', icon: Settings, module: 'settings', colorGradient: 'from-slate-400 to-zinc-500', iconColor: 'text-slate-400', activeGlow: 'shadow-slate-500/30' },
];

export default function Layout() {
  const location = useLocation();
  const { theme, setTheme, actualTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isGlobalScannerOpen, setIsGlobalScannerOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  const {
    currentUser,
    currentRole,
    hasPermission,
    isSuperAdmin,
    impersonatedBy,
    passwordWarning,
    stopImpersonation,
    logout
  } = useAuth();

  const appSettings = useApiQuery(() => api.settings.get('global_settings'), [], ['settings']);
  const companyLogo = appSettings?.company?.logo;
  const companyName = appSettings?.company?.companyName || 'ProERP';

  // Determine current active module from path
  const currentPath = location.pathname;
  let currentModule: AppModule = 'dashboard';
  if (currentPath === '/' || currentPath === '') {
    currentModule = 'dashboard';
  } else {
    const segment = currentPath.split('/')[1];
    const match = navigation.find(n => n.href.replace('/', '') === segment);
    if (match) {
      currentModule = match.module;
    }
  }

  const isCurrentModuleAllowed = hasPermission(currentModule, 'view');

  return (
    <div className="flex h-screen pt-[env(safe-area-inset-top)] bg-slate-100 dark:bg-slate-800/70 dark:bg-slate-950 overflow-hidden font-sans transition-colors duration-200">
      {/* Sidebar Desktop */}
      <aside className={cn(
        "hidden md:flex md:flex-col bg-slate-950 border-r border-slate-800/80 shrink-0 transition-all duration-300 ease-in-out relative z-20 shadow-2xl",
        isCollapsed ? "w-20" : "w-64"
      )}>
        <div className={cn(
          "h-14 flex items-center border-b border-slate-800/60 shrink-0",
          isCollapsed ? "justify-center px-0" : "justify-between px-4"
        )}>
          {/* Logo Section */}
          <div className={cn(
            "flex items-center gap-2.5 min-w-0 overflow-hidden transition-all duration-300",
            isCollapsed ? "hidden" : "flex"
          )}>
            {companyLogo ? (
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 p-0.5 shadow-xs shrink-0 flex items-center justify-center overflow-hidden border border-slate-700">
                <img src={companyLogo} alt={companyName} className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div className="w-8 h-8 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center font-black text-white text-xs shadow-sm shadow-indigo-600/30 shrink-0 border border-indigo-400/20">
                P
              </div>
            )}
            <div className="flex flex-col min-w-0 transition-opacity duration-300">
              <span className="text-white font-black tracking-tight text-sm leading-none truncate">{companyName}</span>
              <span className="text-[10px] text-slate-400 font-semibold leading-none mt-1 truncate">Ayakkabı Üretim & ERP</span>
            </div>
          </div>
          
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-all cursor-pointer"
            title={isCollapsed ? "Genişlet" : "Daralt"}
          >
            {isCollapsed ? <PanelLeftOpen className="w-5 h-5 text-indigo-400" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-2.5 py-4 space-y-1.5 overflow-y-auto custom-scrollbar">
          {navigation.map((item) => {
            const isAllowed = hasPermission(item.module, 'view');

            return (
              <div key={item.name} className="relative group">
                <NavLink
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center px-2 py-2 rounded-xl transition-all duration-200 group-hover:bg-slate-900/50 cursor-pointer overflow-hidden relative",
                      isActive 
                        ? "bg-slate-900/90 border border-slate-700/60 shadow-lg" 
                        : isAllowed
                        ? "border border-transparent hover:border-slate-800"
                        : "opacity-60 cursor-not-allowed",
                      isCollapsed ? "justify-center" : "gap-3.5"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* Active Indicator Line */}
                      {isActive && (
                        <div className={cn(
                          "absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-gradient-to-b",
                          item.colorGradient
                        )} />
                      )}

                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110",
                        isActive 
                          ? `bg-gradient-to-tr ${item.colorGradient} text-white shadow-md ${item.activeGlow}`
                          : `bg-slate-900/80 border border-slate-800/80 ${item.iconColor} group-hover:text-white group-hover:border-slate-700`
                      )}>
                        <item.icon className="w-4 h-4" />
                      </div>

                      {!isCollapsed && (
                        <div className="flex items-center justify-between flex-1 min-w-0">
                          <span className={cn(
                            "text-xs tracking-wide truncate transition-colors",
                            isActive ? "text-white font-black" : "text-slate-400 font-semibold group-hover:text-slate-200"
                          )}>
                            {item.name}
                          </span>
                          {!isAllowed && (
                            <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0 ml-1" />
                          )}
                        </div>
                      )}
                    </>
                  )}
                </NavLink>

                {/* Tooltip on Collapsed Desktop View */}
                {isCollapsed && (
                  <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg shadow-xl border border-slate-700 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                    {item.name}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Desktop Active User Bar */}
        <div className="p-3 border-t border-slate-800/60 bg-slate-950/40 shrink-0">
          <button
            type="button"
            onClick={() => setIsSwitcherOpen(true)}
            className={cn(
              "w-full flex items-center p-2 rounded-xl bg-slate-900/60 border border-slate-800/60 hover:bg-slate-800 hover:border-slate-700 transition-all group cursor-pointer",
              isCollapsed ? "justify-center" : "justify-between gap-2"
            )}
            title="Kullanıcı veya rol değiştir"
          >
            <div className="flex items-center gap-2 min-w-0 relative">
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs uppercase shrink-0 shadow-2xs border border-white/10"
                style={{ backgroundColor: currentUser?.color || '#4f46e5' }}
              >
                {currentUser?.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'U'}
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-950 absolute -bottom-0.5 -right-0.5" />
              
              {!isCollapsed && (
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs text-white font-semibold truncate leading-tight group-hover:text-indigo-300 transition-colors">
                    {currentUser?.fullName || 'Giriş Yapılmadı'}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">
                    {currentRole?.name || currentUser?.roleName || 'Tanımsız Rol'}
                  </p>
                </div>
              )}
            </div>
            
            {!isCollapsed && (
              <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 group-hover:text-white transition-colors shrink-0" />
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-xs z-40 md:hidden transition-opacity" 
          onClick={() => setIsMobileMenuOpen(false)} 
        />
      )}

      {/* Sidebar Mobile */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-60 bg-slate-900 text-white z-50 transform transition-transform duration-300 md:hidden border-r border-slate-800 flex flex-col",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-13 px-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            {companyLogo ? (
              <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 p-0.5 shadow-xs shrink-0 flex items-center justify-center overflow-hidden border border-slate-700">
                <img src={companyLogo} alt={companyName} className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white text-xs shrink-0">P</div>
            )}
            <span className="text-white font-bold tracking-tight text-sm truncate">{companyName}</span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} aria-label="Kapat" className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile active user switch button */}
        <div className="p-3 border-b border-slate-800">
          <button
            type="button"
            disabled={!isSuperAdmin}
            onClick={() => {
              if (!isSuperAdmin) return;
              setIsMobileMenuOpen(false);
              setIsSwitcherOpen(true);
            }}
            title={isSuperAdmin ? 'Yetki simülasyonu için başka bir kullanıcıya geç' : 'Aktif kullanıcı'}
            className={`w-full flex items-center justify-between p-2 rounded-xl bg-slate-800/80 border border-slate-700 text-left ${isSuperAdmin ? 'cursor-pointer hover:border-indigo-500/50' : 'cursor-default'}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div 
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0"
                style={{ backgroundColor: currentUser?.color || '#4f46e5' }}
              >
                {currentUser?.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{currentUser?.fullName}</p>
                <p className="text-[10px] text-slate-400 truncate">{currentRole?.name || currentUser?.roleName}</p>
              </div>
            </div>
            {isSuperAdmin && (
              <span className="text-[10px] text-indigo-400 font-semibold underline">Değiştir</span>
            )}
          </button>
        </div>

        <nav className="flex-1 p-2.5 space-y-0.5 overflow-y-auto">
          {navigation.map((item) => {
            const isAllowed = hasPermission(item.module, 'view');
            return (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg transition-all text-xs font-medium",
                    isActive 
                      ? "bg-indigo-600 text-white font-semibold" 
                      : isAllowed
                      ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                      : "text-slate-600 hover:bg-slate-800/40 opacity-70"
                  )
                }
              >
                <div className="flex items-center gap-2.5 min-w-0 truncate">
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.name}</span>
                </div>
                {!isAllowed && <Lock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-13 bg-white dark:bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 flex items-center justify-between px-4 md:px-6 shrink-0 z-10 transition-colors duration-200">
          <div className="flex items-center gap-3 min-w-0">
            <button 
              className="p-1.5 md:hidden text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 shrink-0" 
              onClick={() => setIsMobileMenuOpen(true)} 
              aria-label="Menüyü aç"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 min-w-0">
              {companyLogo && (
                <div className="w-6 h-6 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-0.5 flex items-center justify-center overflow-hidden shrink-0">
                  <img src={companyLogo} alt={companyName} className="max-w-full max-h-full object-contain" />
                </div>
              )}
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tracking-tight truncate">{companyName} Fabrika Sistemi</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200/70 dark:border-emerald-500/20 rounded-md text-[11px] font-medium shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Canlı
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Quick Live Barcode Scanner Button */}
            <button
              onClick={() => setIsGlobalScannerOpen(true)}
              title="Kamera ile Canlı Barkod/Karekod Okut (Stok Sayımı, Mal Kabul, İrsaliye, İş Emri)"
              className="p-2 rounded-xl border border-purple-200 dark:border-purple-800/80 bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <Camera className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="text-xs font-bold hidden xl:inline">Barkod Oku</span>
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={() => setTheme(actualTheme === 'dark' ? 'light' : 'dark')}
              title={actualTheme === 'dark' ? "Açık Temaya Geç" : "Koyu Temaya Geç"}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              {actualTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Aktif kullanıcı kimliği; yetki simülasyonu yalnızca Süper Admin'e açıktır */}
            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shadow-2xs">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center text-white font-bold text-[11px] shadow-xs shrink-0"
                style={{ backgroundColor: currentUser?.color || '#4f46e5' }}
              >
                {currentUser?.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2) || 'U'}
              </div>
              <div className="hidden sm:block text-left leading-tight">
                <span className="block text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                  {currentUser?.fullName}
                </span>
                <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate max-w-[120px]">
                  {currentRole?.name || currentUser?.roleName}
                </span>
              </div>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setIsSwitcherOpen(true)}
                  title="Kullanıcı / Rol Değiştir (yetki simülasyonu)"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-400 text-[10px] font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors"
                >
                  <UserCog className="w-3 h-3" />
                  Değiştir
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsChangePasswordOpen(true)}
                title="Parolamı değiştir"
                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => logout()}
                title="Oturumu kapat"
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="text-right hidden lg:block">
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 font-medium">
                {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>
        </header>

        {/* Yetki simülasyonu bildirimi: kimin adına işlem yapıldığı her zaman görünür */}
        {impersonatedBy && (
          <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/60 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <UserCog className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-xs text-amber-800 dark:text-amber-200 truncate">
                <strong>{impersonatedBy.userName}</strong> yönetici olarak <strong>{currentUser?.fullName}</strong> hesabı adına işlem yapıyorsunuz. Tüm işlemler denetim izine kaydedilir.
              </span>
            </div>
            <button
              type="button"
              onClick={() => stopImpersonation()}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-semibold hover:bg-amber-700 transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
              Kendi hesabıma dön
            </button>
          </div>
        )}

        {/* Zayıf parola uyarısı: kullanıcı kendi parolasını hemen değiştirebilir */}
        {passwordWarning && (
          <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-2 bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900/60 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span className="text-xs text-rose-800 dark:text-rose-200 truncate">{passwordWarning}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsChangePasswordOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-semibold hover:bg-rose-700 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Parolamı Değiştir
            </button>
          </div>
        )}

        {/* Content Area with Permission Guard */}
        <main className="flex-1 overflow-y-auto p-4 md:p-5 custom-scrollbar">
          <div className="max-w-[1560px] mx-auto w-full">
            {isCurrentModuleAllowed ? (
              <Outlet />
            ) : (
              <AccessDenied module={currentModule} />
            )}
          </div>
        </main>
      </div>

      {/* User Switcher Simulator Modal */}
      <UserSwitcherModal
        isOpen={isSwitcherOpen}
        onClose={() => setIsSwitcherOpen(false)}
      />

      {/* Kişinin kendi parolasını değiştirme modalı */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        warning={passwordWarning}
      />

      {/* Global Live Camera Barcode Scanner Modal */}
      <CameraBarcodeScannerModal
        isOpen={isGlobalScannerOpen}
        onClose={() => setIsGlobalScannerOpen(false)}
      />
    </div>
  );
}
