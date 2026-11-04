import { RESOURCES, type ResourceDef } from './columns.js';
import type { AppModule } from '../src/types.js';

export interface ResourceMeta {
  /** Kaynağın bağlı olduğu yetki modülü (RBAC). Sunucu tarafı izin denetiminde kullanılır. */
  module: AppModule;
  /** ?search= parametresinin aradığı kolonlar */
  searchable: string[];
  /** Varsayılan sıralama (ORDER BY) */
  defaultOrder: string;
  /** Silme öncesi bağlı kayıt kontrolü: { tablo, kolon, mesaj } */
  guards?: { table: string; column: string; message: string }[];
  /** Sadece okunabilir (istemci yazamaz) */
  readOnly?: boolean;
  /** Okuma için modül izni gerekmez; oturum açmış olmak yeterlidir. */
  readAuthOnly?: boolean;
  /** İstemci hiçbir zaman yazamaz (yalnızca sunucu tarafı işlemler yazar). */
  protectedColumns?: string[];
  /**
   * Türetilmiş/bakiye kolonları: generic CRUD ve /ops/commit UPDATE yollarında
   * istemci gövdesinden SOYULUR (INSERT'te açılış değeri olarak yazılabilir).
   * Bu alanlar yalnızca kontrollü iş uçlarında (ops) satır kilidi altında,
   * karşılık gelen hareket + muhasebe kaydıyla birlikte güncellenir.
   */
  derivedColumns?: string[];
  /**
   * Hareket defteri tabloları (ör. inventoryLogs): generic satır yazımı
   * (insert/update/delete/bulk/delete-where) HERKESE kapalıdır; yalnızca
   * sunucu tarafı ops yazar. `clear` mevcut Süper Admin kapısıyla kalır.
   */
  movementTable?: boolean;
  /**
   * Kontrollü yazımlı kaynaklar: satır ekleme/düzenleme generic CRUD ve
   * `/ops/commit` yollarına KAPALIDIR; kayıt yalnızca kendi iş ucundan yazılır
   * (ör. cari hareket → `POST /ops/contact-transaction`), çünkü türetilmiş
   * alanlar (cari bakiyesi) sadece orada satır kilidi altında güncellenir.
   * Silme yolları açıktır: hepsi silme politikası motorundan geçer.
   */
  controlledWrites?: boolean;
  /** Kayıtlar istemciye gönderilmeden önce çıkarılan kolonlar. */
  hidden?: string[];
}

export const META: Record<string, ResourceMeta> = {
  operationRequests: { module: 'users', searchable: [], defaultOrder: 'id DESC', readOnly: true, hidden: ['requestKey', 'payloadHash', 'result'] },
  stockReservations: { module: 'inventory', searchable: [], defaultOrder: 'id DESC', readOnly: true },
  stockCounts: { module: 'inventory', searchable: ['countNumber', 'notes'], defaultOrder: 'id DESC', readOnly: true },
  qualityChecks: { module: 'production', searchable: ['notes'], defaultOrder: 'id DESC', readOnly: true },
  purchaseRequests: { module: 'orders', searchable: ['requestNumber', 'notes'], defaultOrder: 'id DESC', readOnly: true },
  contacts: {
    module: 'contacts',
    /**
     * Cari kartları sipariş, irsaliye, fatura ve finans ekranlarının ortak
     * referans verisidir; okuma için oturum yeterlidir (yazma modül iznine bağlıdır).
     */
    readAuthOnly: true,
    searchable: ['code', 'name', 'companyTitle', 'contactPerson', 'phone', 'mobile', 'email', 'taxNumber'],
    defaultOrder: 'name ASC',
    /** Cari bakiyesi yalnızca kontrollü finans uçlarında (fatura, tahsilat/tediye, açılış, reset) değişir. */
    derivedColumns: ['balance'],
    guards: [
      { table: 'orders', column: 'contactId', message: 'Bu cariye bağlı siparişler var. Önce siparişleri silin.' },
      { table: 'invoices', column: 'contactId', message: 'Bu cariye bağlı faturalar var. Önce faturaları silin.' },
      { table: 'waybills', column: 'contactId', message: 'Bu cariye bağlı irsaliyeler var. Önce irsaliyeleri silin.' },
      { table: 'transactions', column: 'contactId', message: 'Bu cariye bağlı kasa/banka hareketleri var.' },
      { table: 'collectionReceipts', column: 'contactId', message: 'Bu cariye bağlı tahsilat/tediye makbuzları var.' },
      { table: 'checks', column: 'contactId', message: 'Bu cariye bağlı çek/senet kayıtları var.' },
    ],
  },
  assortmentTemplates: { module: 'inventory', searchable: ['name'], defaultOrder: 'name ASC' },
  barcodeTemplates: { module: 'inventory', searchable: ['name', 'description'], defaultOrder: 'name ASC' },
  /**
   * Merkezi renk kartları (color master). Stok, üretim, sipariş, irsaliye ve
   * fatura ekranlarının ortak referans verisidir; okuma için oturum yeterlidir.
   * Hiçbir yerde referans verilmeyen renk silinebilir; kullanılan renk silme
   * motoru tarafından bloklanır (bkz. deletePolicy.ts → COLOR_IN_USE), o durumda
   * pasifleştirme kullanılır. rgbCode yalnızca hexCode'tan türetilir.
   */
  colors: {
    module: 'colors',
    readAuthOnly: true,
    searchable: ['code', 'name', 'groupName', 'pantoneCode', 'manufacturerCode'],
    defaultOrder: 'name ASC',
    protectedColumns: ['rgbCode'],
  },
  /** Ürün ↔ renk bağı; yalnızca ürün kartı yazımında (productColors senkronu) güncellenir. */
  productColors: { module: 'colors', searchable: [], defaultOrder: 'sortOrder ASC', readOnly: true },
  products: {
    module: 'inventory',
    /**
     * Ürün kartları sipariş, irsaliye, fatura ve üretim ekranlarında seçim
     * listesi olarak kullanılır; okuma için oturum yeterlidir.
     */
    readAuthOnly: true,
    searchable: ['code', 'name', 'barcode', 'moldCode', 'moldGroup', 'subType', 'brand', 'category', 'documentNo'],
    defaultOrder: 'name ASC',
    /**
     * Stok ve varyant stoğu yalnızca kontrollü uçlarda (stok hareketi, fatura/irsaliye
     * stok düşümü, varyant senkronu, reset) satır kilidi altında ve inventoryLogs
     * kaydıyla birlikte güncellenir.
     */
    derivedColumns: ['stock', 'variantBarcodes'],
    guards: [
      { table: 'orderItems', column: 'productId', message: 'Bu ürüne bağlı sipariş kalemleri var.' },
      { table: 'waybillItems', column: 'productId', message: 'Bu ürüne bağlı irsaliye kalemleri var.' },
      { table: 'invoiceItems', column: 'productId', message: 'Bu ürüne bağlı fatura kalemleri var.' },
      { table: 'workOrders', column: 'productId', message: 'Bu ürüne bağlı iş emirleri var.' },
      { table: 'inventoryLogs', column: 'productId', message: 'Bu ürünün stok hareketleri var; hareket defteri ile ürün kartı birlikte silinemez.' },
      { table: 'recipes', column: 'productId', message: 'Bu ürüne ait reçete var. Önce reçeteyi silin.' },
    ],
  },
  recipes: {
    module: 'production',
    searchable: ['name', 'targetColor'],
    defaultOrder: 'id DESC',
    guards: [{ table: 'workOrders', column: 'recipeId', message: 'Bu reçeteye bağlı iş emirleri var.' }],
  },
  workOrders: {
    controlledWrites: true,
    module: 'production',
    searchable: ['barcode', 'orderNumber', 'customerName', 'documentNo', 'moldCode', 'moldGroup', 'color', 'line'],
    defaultOrder: 'id DESC',
  },
  /**
   * Kalıp (last) ana kartı. Ayakkabı kalıpları çift bazında, numara kırılımlı
   * ve konum kovalarıyla takip edilir; numara kümesi asorti şablonundan türer.
   * code otomatik `KLP-` numarası alır (numbering.ts).
   */
  molds: {
    module: 'molds',
    searchable: ['code', 'name', 'brand', 'moldType', 'material', 'supplierName', 'barcode', 'sizeRange'],
    defaultOrder: 'name ASC',
  },
  /** Kalıp stok kovaları: yalnızca hareket op'ları yazar; çift/konum bütünlüğü satır kilidi altında korunur. */
  moldStock: { module: 'molds', searchable: [], defaultOrder: 'id ASC', movementTable: true },
  /** Kalıp hareket başlıkları (ledger): generic satır yazımı kapalı, yalnızca op'lar yazar. */
  moldMovements: { module: 'molds', searchable: ['movementNo', 'description', 'documentRef', 'deliveredBy', 'receivedBy'], defaultOrder: 'id DESC', movementTable: true },
  /** Kalıp hareket satırları (numara bazında çift / tek parça). */
  moldMovementItems: { module: 'molds', searchable: [], defaultOrder: 'id ASC', movementTable: true },
  inventoryLogs: { module: 'inventory', searchable: ['description', 'color', 'size'], defaultOrder: 'id DESC', movementTable: true },
  /**
   * Cari hareketler: bakiyeyi değiştiren bir kayıttır, bu yüzden yalnızca
   * kontrollü uçtan (`POST /ops/contact-transaction`) yazılır; generic
   * INSERT/PATCH bakiyeyi güncellemediği için kapalıdır (CONTROLLED_RESOURCE).
   * Silme deletePolicy üzerinden fizikseldir ve cari bakiyesi aynı transaction
   * içinde geri hesaplanır (ters kayıt üretilmez).
   * `status`/`cancelledAt`/`reversalOfId` eski soft-cancel modelinden kalan
   * kolonlardır; istemci yazamasın diye korunur, migration ile kaldırılacak.
   */
  transactions: {
    module: 'finance',
    searchable: ['description', 'category', 'documentNo'],
    defaultOrder: 'date DESC',
    protectedColumns: ['status', 'cancelledAt', 'reversalOfId'],
    controlledWrites: true,
  },
  /** Firma künyesi/logo gibi kabuk ayarları arayüzün her yerinde okunur. */
  settings: { module: 'settings', searchable: [], defaultOrder: 'id ASC', readAuthOnly: true },
  /**
   * Belge/fiş numarası sayaçları (scope, prefix, year, lastNumber). Yalnızca
   * sunucu tarafı numbering.ts tarafından atomik UPDATE/INSERT ile yönetilir;
   * istemci hiçbir zaman yazamaz (readOnly) ve okuma `settings` iznine bağlıdır
   * (META dışı kalıp `dashboard` fallback'ine düşmesin diye açıkça tanımlandı).
   */
  documentNumbers: { module: 'settings', searchable: ['scope', 'prefix'], defaultOrder: 'scope ASC, prefix ASC, year ASC', readOnly: true },
  orders: {
    controlledWrites: true,
    module: 'orders',
    searchable: ['orderNumber', 'notes'],
    defaultOrder: 'id DESC',
    /** Sipariş kalemleri silme motoru tarafından cascade ile kaldırılır; guard yalnızca gerçek bağımlılıklar için. */
    guards: [
      { table: 'waybills', column: 'orderId', message: 'Bu siparişe bağlı irsaliyeler var.' },
      { table: 'invoices', column: 'orderId', message: 'Bu siparişe bağlı faturalar var.' },
    ],
  },
  orderItems: { module: 'orders', searchable: [], defaultOrder: 'id ASC', controlledWrites: true },
  /**
   * Fatura: tutar, ödeme durumu ve cari/stok/muhasebe etkileri yalnızca
   * create/issue/cancel/delete-invoice op'larında (satır kilidi altında, tek
   * transaction) belirlenir. Generic INSERT/UPDATE cari bakiyesini, stoğu ve
   * muhasebe fişini güncellemediği için kapalıdır (CONTROLLED_RESOURCE); silme
   * yolları silme politikası motorundan geçer. Yedek geri yükleme (Süper Admin,
   * FK denetimi kapalı) toplu `insertMany` ile bu kapıdan muaftır.
   */
  invoices: {
    module: 'invoices',
    searchable: ['invoiceNumber', 'orderNumber', 'waybillNumber', 'ettn', 'notes'],
    defaultOrder: 'id DESC',
    /** Ödeme durumu ve ödenen tutar yalnızca tahsilat/tediye op'unda (satır kilidi + muhasebe) belirlenir; istemci generic INSERT/UPDATE'te yazamaz. */
    protectedColumns: ['paidAmount', 'paymentStatus'],
    controlledWrites: true,
  },
  /** Fatura satırları faturanın bir parçasıdır; yalnızca create-invoice op'unda yazılır, tek başına generic yazıma kapalıdır. */
  invoiceItems: { module: 'invoices', searchable: ['productCode', 'productName'], defaultOrder: 'id ASC', controlledWrites: true },
  waybills: {
    controlledWrites: true,
    module: 'waybills',
    searchable: ['waybillNumber', 'orderNumber', 'contactName', 'ettn', 'vehiclePlate', 'notes'],
    defaultOrder: 'id DESC',
    /** Fatura bağı yalnızca create/issue/cancel/delete-invoice op'larında (satır kilidi altında) belirlenir; istemci generic yazımda yazamaz. */
    protectedColumns: ['invoicedStatus', 'invoiceId', 'invoiceNumber'],
  },
  waybillItems: { module: 'waybills', searchable: ['productCode', 'productName'], defaultOrder: 'id ASC', controlledWrites: true },
  accounts: { module: 'accounting', searchable: ['code', 'name', 'description'], defaultOrder: 'code ASC' },
  journalEntries: {
    module: 'accounting',
    searchable: ['entryNumber', 'description', 'documentNumber', 'documentType'],
    defaultOrder: 'id DESC',
  },
  cashBoxes: { module: 'finance', searchable: ['code', 'name', 'responsiblePerson'], defaultOrder: 'code ASC', derivedColumns: ['balance'] },
  bankAccounts: { module: 'finance', searchable: ['bankName', 'iban', 'accountNumber'], defaultOrder: 'id ASC', derivedColumns: ['balance'] },
  /**
   * Çek: kayıt ve durum geçişleri (ciro, tahsil, karşılıksız vb.) yalnızca
   * /ops/receipt ve /ops/check-status uçlarında — kasa/banka/cari + muhasebe ile
   * birlikte, satır kilidi altında — yazılır. Generic INSERT/UPDATE bu yan
   * etkileri üretmediği için kapalıdır (CONTROLLED_RESOURCE); silme yolları
   * silme politikası motorundan geçer. Yedek geri yükleme (Süper Admin, FK
   * denetimi kapalı) toplu `insertMany` ile bu kapıdan muaftır.
   */
  checks: {
    module: 'finance',
    searchable: ['portfolioNumber', 'serialNumber', 'bankName', 'drawer', 'contactName'],
    defaultOrder: 'dueDate ASC',
    /** Çek durumu ve ciro bilgileri yalnızca /ops/check-status ucunda (kasa/banka/cari + muhasebe ile) belirlenir; istemci generic yazımda yazamaz. */
    protectedColumns: ['status', 'statusChangeDate', 'endorsedToContactId', 'endorsedToContactName', 'journalEntryId'],
    controlledWrites: true,
  },
  /** Tahsilat makbuzu yalnızca /ops/receipt ucunda (cari + kasa/banka + muhasebe ile) yazılır; generic yazım bakiyeyi güncellemediği için kapalıdır. Yedek geri yükleme muaftır. */
  collectionReceipts: { module: 'finance', searchable: ['receiptNumber', 'contactName', 'description'], defaultOrder: 'id DESC', protectedColumns: ['isAccounted', 'journalEntryId'], controlledWrites: true },
  employees: {
    module: 'hr',
    searchable: ['employeeCode', 'name', 'tcNo', 'department', 'position', 'phone'],
    defaultOrder: 'name ASC',
    guards: [
      { table: 'attendanceRecords', column: 'employeeId', message: 'Personelin puantaj kayıtları var.' },
      { table: 'payrollRecords', column: 'employeeId', message: 'Personelin bordro kayıtları var.' },
      { table: 'advanceRequests', column: 'employeeId', message: 'Personelin avans kayıtları var.' },
      { table: 'leaveRequests', column: 'employeeId', message: 'Personelin izin kayıtları var.' },
    ],
  },
  attendanceRecords: { module: 'hr', searchable: ['status', 'notes'], defaultOrder: 'date DESC' },
  leaveRequests: { module: 'hr', searchable: ['employeeName', 'leaveType', 'reason'], defaultOrder: 'id DESC' },
  advanceRequests: { module: 'hr', searchable: ['employeeName', 'description'], defaultOrder: 'id DESC' },
  payrollRecords: { module: 'hr', searchable: ['employeeName', 'employeeCode', 'department'], defaultOrder: 'id DESC', protectedColumns: ['paymentStatus', 'isAccounted', 'journalEntryId', 'parameterSnapshot'], controlledWrites: true },
  periodLocks: { module: 'hr', searchable: [], defaultOrder: 'year DESC, month DESC' },
  /** Roller her oturum sahibi tarafından okunabilir; kendi rolünü çözmek için gerekir. */
  roles: { module: 'users', searchable: ['code', 'name', 'description'], defaultOrder: 'id ASC', readAuthOnly: true },
  users: {
    module: 'users',
    searchable: ['username', 'fullName', 'email', 'department', 'title'],
    defaultOrder: 'id ASC',
    /**
     * `roleCode`/`roleName` DENORMALİZE kopyalardır ve sunucu tarafında `roleId`'den
     * türetilir. İstemciden yazılabilseydi, `users:edit` yetkisi olan bir kullanıcı
     * kendi `roleCode` alanını 'super_admin' yaparak yalnızca Süper Admin'e açık
     * kapıları (tablo boşaltma, FK denetimsiz toplu yazma, reset) açabilirdi.
     * Rol ataması `roleId` üzerinden yapılır; bu iki alan istemciye kapalıdır.
     */
    protectedColumns: ['passwordHash', 'passwordSalt', 'roleCode', 'roleName'],
    hidden: ['passwordHash', 'passwordSalt'],
  },
  /** Denetim izi yalnızca sunucu tarafından yazılır; istemci sadece okur. */
  auditLogs: {
    module: 'users',
    searchable: ['userName', 'action', 'module', 'description', 'entityId'],
    defaultOrder: 'id DESC',
    readOnly: true,
  },
};

const FALLBACK_META: ResourceMeta = { module: 'dashboard', searchable: [], defaultOrder: 'id ASC' };

export function getMeta(resource: string): ResourceMeta {
  return META[resource] || FALLBACK_META;
}

export function getDef(resource: string): ResourceDef | undefined {
  return RESOURCES[resource];
}

export const RESOURCE_NAMES = Object.keys(RESOURCES);
