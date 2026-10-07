import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import MobileShell, { type MobileTab } from './MobileShell';
import MobileDashboard from './MobileDashboard';
import MobileContacts from './MobileContacts';
import MobileInventory from './MobileInventory';
import MobileOrders from './MobileOrders';
import MobileProduction from './MobileProduction';

const TITLES: Record<MobileTab, string> = {
  summary: 'ProERP Özet',
  contacts: 'Cari Hesaplar',
  inventory: 'Stok Durumu',
  orders: 'Siparişler',
  production: 'Üretim Planlama',
};

/**
 * Mobil uygulama kökü: alt-sekme ile dört ekran arasında geçiş yapar.
 * Masaüstü Layout/Router'dan tamamen ayrıdır; AuthGate oturum yoksa giriş ekranını gösterir.
 */
export default function MobileApp() {
  const [tab, setTab] = useState<MobileTab>('summary');
  const { logout } = useAuth();

  return (
    <MobileShell
      title={TITLES[tab]}
      active={tab}
      onTab={setTab}
      right={
        <button
          type="button"
          onClick={() => void logout()}
          title="Çıkış"
          aria-label="Çıkış yap"
          className="rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <LogOut className="w-5 h-5" />
        </button>
      }
    >
      {tab === 'summary' && <MobileDashboard />}
      {tab === 'contacts' && <MobileContacts />}
      {tab === 'inventory' && <MobileInventory />}
      {tab === 'orders' && <MobileOrders />}
      {tab === 'production' && <MobileProduction />}
    </MobileShell>
  );
}
