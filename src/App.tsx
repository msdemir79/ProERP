import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import Layout from './components/Layout';
const OperationsHub = lazy(() => import('./components/OperationsHub'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const Inventory = lazy(() => import('./components/Inventory'));
const Templates = lazy(() => import('./components/Inventory/Templates'));
const BarcodeCenter = lazy(() => import('./components/Inventory/BarcodeCenter'));
const BulkStockScreen = lazy(() => import('./components/Inventory/BulkStockScreen'));
const Production = lazy(() => import('./components/Production'));
const Molds = lazy(() => import('./components/Molds'));
const MoldMovementsScreen = lazy(() => import('./components/Molds/MoldMovementsScreen'));
const MoldSubcontractScreen = lazy(() => import('./components/Molds/MoldSubcontractScreen'));
const MoldReportsScreen = lazy(() => import('./components/Molds/MoldReportsScreen'));
const Orders = lazy(() => import('./components/Orders'));
const Invoices = lazy(() => import('./components/Invoices'));
const Waybills = lazy(() => import('./components/Waybills'));
const Accounting = lazy(() => import('./components/Accounting'));
const Finance = lazy(() => import('./components/Finance'));
const Contacts = lazy(() => import('./components/Contacts'));
const HRManagement = lazy(() => import('./components/HR'));
const UsersManagement = lazy(() => import('./components/Users'));
const ReportsHub = lazy(() => import('./components/Reports'));
const StockSummaryReport = lazy(() => import('./components/Reports/StockSummaryReport'));
const StockDetailReport = lazy(() => import('./components/Reports/StockDetailReport'));
const StockMovementReport = lazy(() => import('./components/Reports/StockMovementReport'));
const BrokenSizeReport = lazy(() => import('./components/Reports/BrokenSizeReport'));
const SettingsHub = lazy(() => import('./components/Settings'));

import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { FeedbackHost } from './lib/feedback';
import LoginScreen from './components/Common/LoginScreen';
import EmptyState from './components/Common/EmptyState';
import { useIsMobile } from './hooks/useIsMobile';
const MobileApp = lazy(() => import('./mobile/MobileApp'));

/**
 * Oturum yoksa giriş ekranını gösterir. Yetkilendirme sunucuda yapıldığı için
 * burada varsayılan bir kullanıcıya düşülmez.
 */
function AuthGate({ children }: { children: ReactNode }) {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-sm">
          <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          Oturum kontrol ediliyor…
        </div>
      </div>
    );
  }

  if (!currentUser) return <LoginScreen />;

  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="shoerp-theme">
      <AuthProvider>
        <FeedbackHost />
        <AuthGate>
          <BrowserRouter>
            <Suspense fallback={<div role="status" className="p-10 text-center text-fg-muted">Sayfa yükleniyor…</div>}><RootSwitch /></Suspense>
          </BrowserRouter>
        </AuthGate>
    </AuthProvider>
    </ThemeProvider>
  );
}

/** Mobil kabuğun desteklediği sayfalar; diğer modüller dar ekranda da gerçek adresleriyle açılır. */
const mobileRoutes = new Set([
  '/', '/contacts', '/inventory', '/orders', '/production',
  '/inventory/workflows', '/orders/workflows', '/production/workflows',
]);

function RootSwitch() {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const route = pathname.replace(/\/+$/, '') || '/';
  if (isMobile && mobileRoutes.has(route)) return <MobileApp />;
  return <DesktopRoutes />;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl rounded-card border border-line bg-surface shadow-card">
      <EmptyState
        icon={<FileQuestion />}
        title="Sayfa bulunamadı"
        description="Adres değişmiş veya yanlış yazılmış olabilir. Ana sayfadan devam edebilirsiniz."
        action={<Link to="/" className="rounded-control bg-brand px-4 py-2 text-xs font-bold text-on-brand hover:bg-brand-hover">Ana sayfaya dön</Link>}
      />
    </div>
  );
}

function DesktopRoutes() {
  return (
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="inventory/templates" element={<Templates />} />
            <Route path="inventory/barcode" element={<BarcodeCenter />} />
            <Route path="inventory/import" element={<BulkStockScreen />} />
            
            <Route path="reports" element={<ReportsHub />} />
            <Route path="reports/summary" element={<StockSummaryReport />} />
            <Route path="reports/detail" element={<StockDetailReport />} />
            <Route path="reports/movements" element={<StockMovementReport />} />
            <Route path="reports/broken" element={<BrokenSizeReport />} />
            
            <Route path="production" element={<Production />} />
            <Route path="production/workflows" element={<OperationsHub />} />
            <Route path="inventory/workflows" element={<OperationsHub />} />
            <Route path="orders/workflows" element={<OperationsHub />} />
            <Route path="molds" element={<Molds />} />
            <Route path="molds/movements" element={<MoldMovementsScreen />} />
            <Route path="molds/subcontract" element={<MoldSubcontractScreen />} />
            <Route path="molds/reports" element={<MoldReportsScreen />} />
            <Route path="orders" element={<Orders />} />
            <Route path="waybills" element={<Waybills />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="finance" element={<Finance />} />
            <Route path="accounting" element={<Accounting />} />
            <Route path="hr" element={<HRManagement />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="users" element={<UsersManagement />} />
            <Route path="settings" element={<SettingsHub />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
  );
}
