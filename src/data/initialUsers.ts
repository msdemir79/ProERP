import type { AppUser } from '../types';

export const INITIAL_USERS: AppUser[] = [
  {
    username: 'mdemir',
    fullName: 'Mehmet Demir',
    email: 'MSdemir@gmail.com',
    phone: '0 (532) 555 10 01',
    title: 'Genel Müdür / Sistem Yöneticisi',
    department: 'YÖNETİM',
    roleCode: 'super_admin',
    roleName: 'Süper Admin / Sistem Yöneticisi',
    status: 'active',
    color: '#4f46e5', // indigo
    lastLoginAt: new Date(),
    createdAt: new Date('2024-01-01'),
    notes: 'Şirket ortağı ve fabrika genel koordinatörü.'
  },
  {
    username: 'ayildiz',
    fullName: 'Ayşe Yıldız',
    email: 'ayse.yildiz@dmr-nexus.example',
    phone: '0 (533) 444 20 02',
    title: 'Satış & Pazarlama Müdürü',
    department: 'SATIŞ & PAZARLAMA',
    roleCode: 'sales_manager',
    roleName: 'Satış & Pazarlama Yöneticisi',
    status: 'active',
    color: '#059669', // emerald
    lastLoginAt: new Date(Date.now() - 3600000 * 2),
    createdAt: new Date('2024-02-15'),
    notes: 'Yurt içi toptan satışlar ve müşteri sipariş onay sorumlusu.'
  },
  {
    username: 'kcelik',
    fullName: 'Kemal Çelik',
    email: 'kemal.celik@dmr-nexus.example',
    phone: '0 (535) 333 30 03',
    title: 'Üretim & İmalat Şefi',
    department: 'ÜRETİM & FABRİKA',
    roleCode: 'production_manager',
    roleName: 'Üretim Planlama & İmalat Şefi',
    status: 'active',
    color: '#7c3aed', // violet
    lastLoginAt: new Date(Date.now() - 3600000 * 5),
    createdAt: new Date('2024-03-01'),
    notes: 'Bant aşamaları (kesim, saya, montaj) ve iş emri yöneticisi.'
  },
  {
    username: 'hkaya',
    fullName: 'Hasan Kaya',
    email: 'hasan.kaya@dmr-nexus.example',
    phone: '0 (542) 222 40 04',
    title: 'Depo & Sevkiyat Sorumlusu',
    department: 'DEPO & LOJİSTİK',
    roleCode: 'warehouse_keeper',
    roleName: 'Satın Alma & Depo Görevlisi',
    status: 'active',
    color: '#d97706', // amber
    lastLoginAt: new Date(Date.now() - 3600000 * 12),
    createdAt: new Date('2024-04-10'),
    notes: 'Deri, astar, taban kabulleri ve sevk irsaliyeleri takibi.'
  },
  {
    username: 'fyilmaz',
    fullName: 'Fatma Yılmaz',
    email: 'fatma.yilmaz@dmr-nexus.example',
    phone: '0 (544) 111 50 05',
    title: 'İnsan Kaynakları Uzmanı',
    department: 'İNSAN KAYNAKLARI',
    roleCode: 'hr_manager',
    roleName: 'İnsan Kaynakları (İK) Sorumlusu',
    status: 'active',
    color: '#e11d48', // rose
    lastLoginAt: new Date(Date.now() - 3600000 * 24),
    createdAt: new Date('2024-05-01'),
    notes: 'Personel özlük dosyaları, günlük puantaj ve bordro hazırlığı.'
  },
  {
    username: 'saksoy',
    fullName: 'Selin Aksoy',
    email: 'selin.aksoy@dmr-nexus.example',
    phone: '0 (530) 999 60 06',
    title: 'Mali İşler & Muhasebe Müdürü',
    department: 'FİNANS & MUHASEBE',
    roleCode: 'finance_manager',
    roleName: 'Mali İşler & Muhasebe Müdürü',
    status: 'active',
    color: '#0891b2', // cyan
    lastLoginAt: new Date(Date.now() - 3600000 * 48),
    createdAt: new Date('2024-05-15'),
    notes: 'Kasa/Banka mutabakatları, yevmiye fişleri ve mizan kontrolü.'
  },
  {
    username: 'bsahin',
    fullName: 'Bülent Şahin',
    email: 'bulent.sahin@dmr-nexus.example',
    phone: '0 (555) 888 70 07',
    title: 'Bağımsız Denetçi / Kalite Kontrolör',
    department: 'DENETİM & KALİTE',
    roleCode: 'auditor',
    roleName: 'Sadece Okuyucu (Denetçi / İzleyici)',
    status: 'active',
    color: '#475569', // slate
    lastLoginAt: new Date(Date.now() - 3600000 * 72),
    createdAt: new Date('2024-06-01'),
    notes: 'Sistem geneli izleme, denetleme ve rapor inceleme yetkisi.'
  }
];
