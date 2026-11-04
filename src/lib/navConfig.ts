import {
  LayoutDashboard,
  Hammer,
  Boxes,
  Package,
  ShoppingCart,
  Landmark,
  UserCheck,
  BarChart3,
  Settings,
} from 'lucide-react';
import type { AppModule } from '../types';

export interface NavLeaf {
  name: string;
  href: string;
  module: AppModule;
}

export interface NavEntry {
  label: string;
  icon: any;
  module: AppModule;
  /** Tekil girişler için doğrudan route; grup girişlerde undefined. */
  href?: string;
  items?: NavLeaf[];
}

/**
 * DMR Kinetiq gruplu sol navigasyon modeli. Mevcut route'arı yeniden düzenlemeden
 * gruplar; yeni modüller buraya grup+alt-menü olarak eklenir.
 */
export const NAV: NavEntry[] = [
  { label: 'Ana Sayfa', icon: LayoutDashboard, module: 'dashboard', href: '/' },
  {
    label: 'Üretim',
    icon: Hammer,
    module: 'production',
    items: [{ name: 'Üretim Planlama', href: '/production', module: 'production' }, { name: 'Kalite & Operasyonlar', href: '/production/workflows', module: 'production' }],
  },
  {
    label: 'Kalıp',
    icon: Boxes,
    module: 'molds',
    items: [
      { name: 'Kalıp Genel Bakış', href: '/molds', module: 'molds' },
      { name: 'Kalıp Hareketleri', href: '/molds/movements', module: 'molds' },
      { name: 'Fason Takip', href: '/molds/subcontract', module: 'molds' },
      { name: 'Kalıp Raporları', href: '/molds/reports', module: 'molds' },
    ],
  },
  {
    label: 'Stok',
    icon: Package,
    module: 'inventory',
    items: [
      { name: 'Stok Yönetimi', href: '/inventory', module: 'inventory' },
      { name: 'Rezervasyon & Operasyonlar', href: '/inventory/workflows', module: 'inventory' },
      { name: 'Barkod Merkezi', href: '/inventory/barcode', module: 'inventory' },
      { name: 'Toplu Stok İşlemleri', href: '/inventory/import', module: 'inventory' },
    ],
  },
  {
    label: 'Satış',
    icon: ShoppingCart,
    module: 'orders',
    items: [
      { name: 'Siparişler', href: '/orders', module: 'orders' },
      { name: 'Satın Alma Talepleri', href: '/orders/workflows', module: 'orders' },
      { name: 'İrsaliyeler', href: '/waybills', module: 'waybills' },
      { name: 'Faturalar', href: '/invoices', module: 'invoices' },
    ],
  },
  {
    label: 'Finans',
    icon: Landmark,
    module: 'finance',
    items: [
      { name: 'Finans & Tahsilat', href: '/finance', module: 'finance' },
      { name: 'Genel Muhasebe', href: '/accounting', module: 'accounting' },
    ],
  },
  {
    label: 'İK & CRM',
    icon: UserCheck,
    module: 'hr',
    items: [
      { name: 'İnsan Kaynakları', href: '/hr', module: 'hr' },
      { name: 'Cari Hesaplar', href: '/contacts', module: 'contacts' },
    ],
  },
  { label: 'Raporlar', icon: BarChart3, module: 'reports', href: '/reports' },
  {
    label: 'Yönetim',
    icon: Settings,
    module: 'settings',
    items: [
      { name: 'Kullanıcılar & Yetkiler', href: '/users', module: 'users' },
      { name: 'Ayarlar & Yapılandırma', href: '/settings', module: 'settings' },
    ],
  },
];

export function leavesOf(entry: NavEntry): NavLeaf[] {
  if (entry.href) return [{ name: entry.label, href: entry.href, module: entry.module }];
  return entry.items || [];
}

export function moduleForPath(pathname: string): AppModule {
  if (pathname === '/' || pathname === '') return 'dashboard';
  const segment = pathname.split('/')[1];
  for (const entry of NAV) {
    for (const leaf of leavesOf(entry)) {
      if (leaf.href.replace('/', '') === segment) return leaf.module;
    }
  }
  return 'dashboard';
}

/**
 * Yolun okunabilir sayfa adı (ör. hata sınırı başlığı için).
 * Bilinmeyen yolda `undefined` döner; çağıran genel bir başlığa düşebilir.
 */
export function labelForPath(pathname: string): string | undefined {
  if (pathname === '/' || pathname === '') {
    const dashboard = NAV.find((e) => e.href === '/');
    return dashboard?.label;
  }
  const pageLabels: Record<string, string> = {
    '/inventory/templates': 'Şablon Yönetimi',
    '/reports/summary': 'Stok Özeti',
    '/reports/detail': 'Stok Detay ve Asorti Raporu',
    '/reports/movements': 'Stok Hareketleri',
    '/reports/broken': 'Kırık Beden Raporu',
  };
  if (pageLabels[pathname]) return pageLabels[pathname];
  // Önce tam yaprağı ara; aksi halde /production/workflows için ilk
  // /production eşleşir ve tarayıcı başlığı yanlış görünür.
  for (const entry of NAV) {
    for (const leaf of leavesOf(entry)) {
      if (leaf.href === pathname) return leaf.name;
    }
  }
  const segment = pathname.split('/')[1];
  for (const entry of NAV) {
    for (const leaf of leavesOf(entry)) {
      if (leaf.href === `/${segment}`) return leaf.name;
    }
  }
  return undefined;
}
