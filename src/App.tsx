import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Templates from './components/Inventory/Templates';
import BarcodeCenter from './components/Inventory/BarcodeCenter';
import BulkStockScreen from './components/Inventory/BulkStockScreen';
import Production from './components/Production';
import Orders from './components/Orders';
import Invoices from './components/Invoices';
import Waybills from './components/Waybills';
import Accounting from './components/Accounting';
import Finance from './components/Finance';
import Contacts from './components/Contacts';
import HRManagement from './components/HR';
import UsersManagement from './components/Users';
import ReportsHub from './components/Reports';
import StockSummaryReport from './components/Reports/StockSummaryReport';
import StockDetailReport from './components/Reports/StockDetailReport';
import StockMovementReport from './components/Reports/StockMovementReport';
import BrokenSizeReport from './components/Reports/BrokenSizeReport';
import SettingsHub from './components/Settings';

import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { FeedbackHost } from './lib/feedback';
import LoginScreen from './components/Common/LoginScreen';
import { useIsMobile } from './hooks/useIsMobile';
import MobileApp from './mobile/MobileApp';

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
        <RootSwitch />
        </AuthGate>
    </AuthProvider>
    </ThemeProvider>
  );
}

/** Dar ekranda mobil kabuk, aksi halde masaüstü yönlendirme tablosu. */
function RootSwitch() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileApp />;
  return <DesktopRoutes />;
}

function DesktopRoutes() {
  return (
    <BrowserRouter>
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
            <Route path="orders" element={<Orders />} />
            <Route path="waybills" element={<Waybills />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="finance" element={<Finance />} />
            <Route path="accounting" element={<Accounting />} />
            <Route path="hr" element={<HRManagement />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="users" element={<UsersManagement />} />
            <Route path="settings" element={<SettingsHub />} />
          </Route>
        </Routes>
      </BrowserRouter>
  );
}
