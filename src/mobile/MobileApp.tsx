import { lazy, Suspense, useEffect, useState } from 'react';
import { LogOut, ScanBarcode } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import MobileShell, { type MobileTab } from './MobileShell';
import MobileDashboard from './MobileDashboard';
import MobileContacts from './MobileContacts';
import MobileInventory from './MobileInventory';
import MobileOrders from './MobileOrders';
import MobileProduction from './MobileProduction';
import CameraBarcodeScannerModal from '../components/Common/CameraBarcodeScannerModal';
import Button from '../components/Common/Button';
const OperationsHub = lazy(() => import('../components/OperationsHub'));
import {
  initNativeBridge,
  updateNativeStatusBar,
  registerBackButtonHandler,
  isNativeApp,
  scanBarcodeNative,
} from './nativeBridge';

const TITLES: Record<MobileTab, string> = {
  summary: 'DMR Nexus Özet',
  contacts: 'Cari Hesaplar',
  inventory: 'Stok Durumu',
  orders: 'Siparişler',
  production: 'Üretim Planlama',
};

const TAB_PATHS: Record<MobileTab, string> = {
  summary: '/',
  contacts: '/contacts',
  inventory: '/inventory',
  orders: '/orders',
  production: '/production',
};

function tabForPath(pathname: string): MobileTab {
  if (pathname.startsWith('/contacts')) return 'contacts';
  if (pathname.startsWith('/inventory')) return 'inventory';
  if (pathname.startsWith('/orders')) return 'orders';
  if (pathname.startsWith('/production')) return 'production';
  return 'summary';
}

/**
 * Mobil uygulama kökü: alt sekmeleri URL ile eşler ve tarayıcı geçmişini korur.
 * Masaüstü Layout'undan ayrıdır; AuthGate oturum yoksa giriş ekranını gösterir.
 */
export default function MobileApp() {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, '') || '/';
  const navigate = useNavigate();
  const tab = tabForPath(pathname);
  const operationsOpen = pathname.endsWith('/workflows');
  const [scannerOpen, setScannerOpen] = useState(false);
  const { logout, hasPermission } = useAuth();
  const { actualTheme } = useTheme();

  const handleHeaderScan = async () => {
    if (operationsOpen) navigate(TAB_PATHS[tab]);
    if (isNativeApp()) {
      const code = await scanBarcodeNative();
      if (code) {
        if (code.startsWith('WO-')) {
          navigate(TAB_PATHS.production);
        } else {
          navigate(TAB_PATHS.inventory);
        }
      }
      return;
    }
    setScannerOpen(true);
  };

  // Android geri tuşu: özet sekmesinde değilsek önce özete dön
  useEffect(() => {
    if (tab === 'summary' && !operationsOpen) return;
    return registerBackButtonHandler(() => {
      if (operationsOpen) { navigate(TAB_PATHS[tab]); return true; }
      navigate(TAB_PATHS.summary);
      return true;
    });
  }, [tab, operationsOpen, navigate]);

  // Durum çubuğunu (StatusBar) aktif tema ile eşle
  useEffect(() => {
    void updateNativeStatusBar(actualTheme === 'dark');
  }, [actualTheme]);

  // Mobil köprü başlat (Splash ekranını kapat, durum çubuğunu ayarla, geri tuşunu dinle)
  useEffect(() => {
    void initNativeBridge({
      isDark: actualTheme === 'dark',
      onDefaultBack: () => {
        const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
        if (currentPath === '/') return false;
        const target = currentPath.endsWith('/workflows')
          ? currentPath.slice(0, -'/workflows'.length)
          : TAB_PATHS.summary;
        navigate(target);
        return true;
      },
    });
  }, []);

  return (
    <>
      <MobileShell
        title={TITLES[tab]}
        active={tab}
        onTab={next => navigate(TAB_PATHS[next])}
        right={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleHeaderScan}
              title="Kamera Barkod Okuyucu"
              aria-label="Kamera barkod okuyucu aç"
              className="rounded-lg p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
            >
              <ScanBarcode className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              title="Çıkış"
              aria-label="Çıkış yap"
              className="rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        }
      >
        {(['inventory', 'orders', 'production'] as string[]).includes(tab) && hasPermission(tab as 'inventory' | 'orders' | 'production', 'view') && <Button className="w-full" onClick={() => navigate(operationsOpen ? TAB_PATHS[tab] : `${TAB_PATHS[tab]}/workflows`)}>{operationsOpen ? 'Modüle geri dön' : tab === 'inventory' ? 'Stok rezervasyonları' : tab === 'orders' ? 'Satın alma talepleri' : 'Kalite kontrolleri'}</Button>}
        {operationsOpen ? <Suspense fallback={<p role="status">Operasyonlar yükleniyor…</p>}><OperationsHub key={tab} initialTab={tab === 'production' ? 'quality' : tab === 'orders' ? 'purchasing' : 'reservations'} /></Suspense> : <>
          {tab === 'summary' && <MobileDashboard />}
          {tab === 'contacts' && <MobileContacts />}
          {tab === 'inventory' && <MobileInventory />}
          {tab === 'orders' && <MobileOrders />}
          {tab === 'production' && <MobileProduction />}
        </>}
      </MobileShell>

      {scannerOpen && (
        <CameraBarcodeScannerModal
          isOpen={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onProductScanned={(p) => {
            setScannerOpen(false);
            navigate(TAB_PATHS.inventory);
          }}
          onWorkOrderFound={(wo) => {
            setScannerOpen(false);
            navigate(TAB_PATHS.production);
          }}
        />
      )}
    </>
  );
}
