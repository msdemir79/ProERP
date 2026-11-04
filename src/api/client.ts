import type {
  StockMovementInput,
  StockMovementResult,
  RecipeConsumptionParams,
  RecipeConsumptionResult,
  ContactBalanceResult,
  Contact,
  ColorMaster,
  ProductColor,
  AssortmentTemplate,
  BarcodeTemplate,
  Product,
  Recipe,
  WorkOrder,
  Mold,
  MoldStock,
  MoldMovement,
  MoldMovementItem,
  MoldSummary,
  MoldMoveInput,
  MoldMoveResult,
  MoldCountAdjustInput,
  MoldCountAdjustResult,
  MoldAllocateInput,
  MoldAllocateResult,
  InventoryLog,
  Transaction,
  AppSettings,
  Order,
  OrderItem,
  Invoice,
  InvoiceItem,
  Waybill,
  WaybillItem,
  Account,
  JournalEntry,
  CashBox,
  BankAccount,
  CheckNote,
  CollectionReceipt,
  Employee,
  AttendanceRecord,
  LeaveRequest,
  AdvanceRequest,
  PayrollRecord,
  AttendancePeriodLock,
  Role,
  AppUser,
  AuditLog,
} from '../types';
import type { MizanRow, MizanLevelFilter } from '../lib/accountCodes';

/* ------------------------------------------------------------------ */
/* Tipler                                                              */
/* ------------------------------------------------------------------ */

export type FilterOp =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'startsWith'
  | 'endsWith'
  | 'contains'
  | 'equalsIgnoreCase'
  | 'isNull'
  | 'notNull';

export interface FilterExpr {
  op: FilterOp;
  value?: string | number | boolean | null;
}

export type FilterValue =
  | string
  | number
  | boolean
  | null
  | (string | number)[]
  | FilterExpr;

export interface ListOptions {
  /** Bileşik anahtar için 'employeeId+date' biçiminde yazılır. */
  where?: Record<string, FilterValue>;
  search?: string;
  orderBy?: string;
  orderDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  select?: string[];
}

/** Dexie'nin `.where('x').startsWith(v)` zincirinin kısa yazımı. */
export function startsWith(value: string): FilterExpr {
  return { op: 'startsWith', value };
}

/** Dexie'nin `.where('x').equalsIgnoreCase(v)` zincirinin kısa yazımı. */
export function equalsIgnoreCase(value: string): FilterExpr {
  return { op: 'equalsIgnoreCase', value };
}

export type Id = number | string;

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* HTTP çekirdeği                                                      */
/* ------------------------------------------------------------------ */

const BASE = '/api';

export async function getWorkflowSummary(): Promise<import('../lib/workflowTypes').WorkflowSummary> {
  return (await http<{ data: import('../lib/workflowTypes').WorkflowSummary }>('/ops/workflow-summary')).data;
}

/**
 * Oturum httpOnly çerezle taşınır (JavaScript belirtece erişemez); bu nedenle
 * isteklerde ayrıca başlık eklenmez, yalnızca aynı kaynak çerezi gönderilir.
 */
type UnauthorizedHandler = () => void;
const unauthorizedHandlers = new Set<UnauthorizedHandler>();

/** Oturum düşerse (401) haber verilir; arayüz giriş ekranına döner. */
export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandlers.add(handler);
  return () => {
    unauthorizedHandlers.delete(handler);
  };
}

function notifyUnauthorized(): void {
  for (const handler of Array.from(unauthorizedHandlers)) {
    try {
      handler();
    } catch (err) {
      console.error('Oturum sonlandırma dinleyicisi hata verdi:', err);
    }
  }
}

const pendingReads = new Map<string, Promise<unknown>>();
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  if ((init?.method || 'GET').toUpperCase() !== 'GET') { pendingReads.clear(); return performHttp<T>(path, init); }
  const existing = pendingReads.get(path);
  if (existing) return existing as Promise<T>;
  const request = performHttp<T>(path, init);
  pendingReads.set(path, request);
  try { return await request; } finally { if (pendingReads.get(path) === request) pendingReads.delete(path); }
}

async function performHttp<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'same-origin',
      ...init,
      headers,
    });
  } catch (err: any) {
    throw new ApiError(
      'Sunucuya bağlanılamadı. Uygulamanın arka uç sunucusu çalışıyor mu?',
      0,
      'NETWORK'
    );
  }

  const text = await res.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!res.ok) {
    // Giriş uçları dışındaki 401 yanıtları "oturum bitti" anlamına gelir.
    if (res.status === 401 && !path.startsWith('/auth/login')) notifyUnauthorized();
    const missingOperation = res.status === 404 && path.startsWith('/ops/')
      && (!payload?.error || payload.error === 'Bilinmeyen API yolu.');
    const message = missingOperation
      ? 'Bu işlem sunucuda bulunamadı. Uygulama sunucusunu güncel sürümle yeniden başlatın.'
      : payload?.error || `İstek başarısız (${res.status})`;
    throw new ApiError(message, res.status, payload?.code);
  }
  return payload as T;
}

function buildQuery(opts: ListOptions = {}): string {
  const params = new URLSearchParams();
  if (opts.where && Object.keys(opts.where).length) params.set('where', JSON.stringify(opts.where));
  if (opts.search) params.set('search', opts.search);
  if (opts.orderBy) params.set('orderBy', opts.orderBy);
  if (opts.orderDir) params.set('orderDir', opts.orderDir);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  if (opts.select?.length) params.set('select', opts.select.join(','));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/* ------------------------------------------------------------------ */
/* Kaynak istemcisi                                                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Silme politikası                                                    */
/* ------------------------------------------------------------------ */

/** 0 = serbest, 1 = uyarılı, 2 = parola + gerekçe, 3 = silinemez. */
export type DeleteTier = 0 | 1 | 2 | 3;

export interface DeletePlan {
  resource: string;
  id: Id;
  label: string;
  tier: DeleteTier;
  summary: string;
  passwordRequired: boolean;
  reasonRequired: boolean;
  cascade: { label: string; count: number }[];
  warnings: string[];
  blocked: { code: string; message: string } | null;
}

export interface DeleteConfirm {
  reason?: string;
  password?: string;
}

export interface ResourceClient<T> {
  readonly name: string;
  list(opts?: ListOptions): Promise<T[]>;
  /** Koşula uyan ilk kaydı döner (Dexie where().equals().first() karşılığı). */
  findOne(where: ListOptions['where']): Promise<T | undefined>;
  get(id: Id): Promise<T | undefined>;
  count(where?: ListOptions['where']): Promise<number>;
  /**
   * `list` ile aynı filtreleri (where + search) uygulayan toplam kayıt sayısı.
   * Sunucu tarafı sayfalama kullanan ekranlarda sayfa sayısı buradan hesaplanır.
   */
  countList(opts?: ListOptions): Promise<number>;
  create(data: Partial<T>): Promise<number>;
  createMany(rows: Partial<T>[]): Promise<number[]>;
  /** id varsa günceller, yoksa ekler (Dexie put karşılığı). */
  save(data: Partial<T> & { id?: Id }): Promise<Id>;
  saveMany(rows: (Partial<T> & { id?: Id })[]): Promise<Id[]>;
  /**
   * Kısmi güncelleme. `expectedVersion` verilirse iyimser kilitleme uygulanır:
   * kayıt bu sürümden sonra değişmişse istek 409 (VERSION_CONFLICT) ile reddedilir.
   */
  update(id: Id, changes: Partial<T>, options?: { expectedVersion?: number }): Promise<number>;
  /** Silme önizlemesi: kademe, birlikte silinecekler, uyarılar ve varsa blokaj. */
  deletePlan(id: Id): Promise<DeletePlan>;
  /** Kademe 2 kayıtlarda `reason` ve `password` zorunludur. */
  remove(id: Id, confirm?: DeleteConfirm): Promise<void>;
  removeMany(ids: Id[], confirm?: DeleteConfirm): Promise<number>;
  removeWhere(where: ListOptions['where'], confirm?: DeleteConfirm): Promise<number>;
  /** Tabloyu tamamen boşaltır (fabrika sıfırlama). */
  clear(): Promise<number>;
}

function resource<T>(name: string): ResourceClient<T> {
  return {
    name,

    async list(opts) {
      const res = await http<{ data: T[] }>(`/${name}${buildQuery(opts)}`);
      return res.data || [];
    },

    async findOne(where) {
      const rows = await this.list({ where, limit: 1 });
      return rows[0];
    },

    async get(id) {
      try {
        const res = await http<{ data: T }>(`/${name}/${encodeURIComponent(String(id))}`);
        return res.data;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return undefined;
        throw err;
      }
    },

    async count(where) {
      return this.countList({ where });
    },

    async countList(opts) {
      const qs = buildQuery(opts);
      const res = await http<{ count: number }>(`/${name}${qs}${qs ? '&' : '?'}count=1`);
      return res.count || 0;
    },

    async create(data) {
      const res = await http<{ data: number }>(`/${name}`, { method: 'POST', body: JSON.stringify(data) });
      return res.data;
    },

    async createMany(rows) {
      if (!rows.length) return [];
      const res = await http<{ data: number[] }>(`/${name}/bulk`, {
        method: 'POST',
        body: JSON.stringify({ mode: 'insert', rows }),
      });
      return res.data || [];
    },

    async save(data) {
      const id = (data as any).id;
      if (id === undefined || id === null || id === '') {
        return this.create(data);
      }
      const res = await http<{ data: { id: Id } }>(`/${name}/${encodeURIComponent(String(id))}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.data.id;
    },

    async saveMany(rows) {
      if (!rows.length) return [];
      const res = await http<{ data: Id[] }>(`/${name}/bulk`, {
        method: 'POST',
        body: JSON.stringify({ mode: 'upsert', rows }),
      });
      return res.data || [];
    },

    async update(id, changes, options) {
      const res = await http<{ data: { changes: number } }>(`/${name}/${encodeURIComponent(String(id))}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...changes,
          ...(options?.expectedVersion ? { expectedVersion: options.expectedVersion } : {}),
        }),
      });
      return res.data?.changes ?? 0;
    },

    async deletePlan(id) {
      const res = await http<{ data: DeletePlan }>(
        `/${name}/delete-plan/${encodeURIComponent(String(id))}`,
      );
      return res.data;
    },

    async remove(id, confirm) {
      await http(`/${name}/${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
        ...(confirm ? { body: JSON.stringify(confirm) } : {}),
      });
    },

    async removeMany(ids, confirm) {
      if (!ids.length) return 0;
      const res = await http<{ data: { deleted: number } }>(`/${name}/bulk-delete`, {
        method: 'POST',
        body: JSON.stringify({ ids, ...(confirm || {}) }),
      });
      return res.data?.deleted ?? 0;
    },

    async removeWhere(where, confirm) {
      const res = await http<{ data: { deleted: number } }>(`/${name}/delete-where`, {
        method: 'POST',
        body: JSON.stringify({ where, ...(confirm || {}) }),
      });
      return res.data?.deleted ?? 0;
    },

    async clear() {
      const res = await http<{ data: { deleted: number } }>(`/${name}/clear`, { method: 'POST' });
      return res.data?.deleted ?? 0;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Kaynak haritası (30 tablo)                                          */
/* ------------------------------------------------------------------ */

export const api = {
  contacts: resource<Contact>('contacts'),
  assortmentTemplates: resource<AssortmentTemplate>('assortmentTemplates'),
  barcodeTemplates: resource<BarcodeTemplate>('barcodeTemplates'),
  products: resource<Product>('products'),
  colors: resource<ColorMaster>('colors'),
  productColors: resource<ProductColor>('productColors'),
  recipes: resource<Recipe>('recipes'),
  workOrders: resource<WorkOrder>('workOrders'),
  molds: resource<Mold>('molds'),
  moldStock: resource<MoldStock>('moldStock'),
  moldMovements: resource<MoldMovement>('moldMovements'),
  moldMovementItems: resource<MoldMovementItem>('moldMovementItems'),
  inventoryLogs: resource<InventoryLog>('inventoryLogs'),
  transactions: resource<Transaction>('transactions'),
  settings: resource<AppSettings>('settings'),
  orders: resource<Order>('orders'),
  orderItems: resource<OrderItem>('orderItems'),
  invoices: resource<Invoice>('invoices'),
  invoiceItems: resource<InvoiceItem>('invoiceItems'),
  waybills: resource<Waybill>('waybills'),
  waybillItems: resource<WaybillItem>('waybillItems'),
  accounts: resource<Account>('accounts'),
  journalEntries: resource<JournalEntry>('journalEntries'),
  cashBoxes: resource<CashBox>('cashBoxes'),
  bankAccounts: resource<BankAccount>('bankAccounts'),
  checks: resource<CheckNote>('checks'),
  collectionReceipts: resource<CollectionReceipt>('collectionReceipts'),
  employees: resource<Employee>('employees'),
  attendanceRecords: resource<AttendanceRecord>('attendanceRecords'),
  leaveRequests: resource<LeaveRequest>('leaveRequests'),
  advanceRequests: resource<AdvanceRequest>('advanceRequests'),
  payrollRecords: resource<PayrollRecord>('payrollRecords'),
  periodLocks: resource<AttendancePeriodLock>('periodLocks'),
  roles: resource<Role>('roles'),
  users: resource<AppUser>('users'),
  auditLogs: resource<AuditLog>('auditLogs'),
};

export type Api = typeof api;

/* ------------------------------------------------------------------ */
/* Toplu işlemler (sunucu tarafı, atomik)                              */
/* ------------------------------------------------------------------ */

const uncertainOperations = new Map<string, string>();
export async function callOp<T = any>(op: string, payload: any = {}): Promise<T> {
  const body = JSON.stringify(payload);
  const fingerprint = `${op}:${body}`;
  const key = uncertainOperations.get(fingerprint) ?? Array.from(crypto.getRandomValues(new Uint8Array(24)), value => value.toString(16).padStart(2, '0')).join('');
  uncertainOperations.set(fingerprint, key);
  try {
    const res = await http<{ data: T }>(`/ops/${op}`, { method: 'POST', headers: { 'Idempotency-Key': key }, body });
    uncertainOperations.delete(fingerprint);
    return res.data;
  } catch (error) {
    // Kesin reddedilen bir isteğin sonraki düzeltilmiş denemesi yeni işlemdir.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) uncertainOperations.delete(fingerprint);
    throw error;
  }
}

/**
 * Silme motorunun generic ucu. Kaynak adı runtime'da gelen ekranlar
 * (onay modalı, silinen kayıtlar ekranı) tip haritasına bağlı kalmadan kullanır.
 */
export const deleteApi = {
  async plan(resource: string, id: Id): Promise<DeletePlan> {
    const res = await http<{ data: DeletePlan }>(`/${resource}/delete-plan/${encodeURIComponent(String(id))}`);
    return res.data;
  },
  async remove(resource: string, id: Id, confirm?: DeleteConfirm): Promise<void> {
    await http(`/${resource}/${encodeURIComponent(String(id))}`, {
      method: 'DELETE',
      ...(confirm ? { body: JSON.stringify(confirm) } : {}),
    });
  },
  async removeMany(resource: string, ids: Id[], confirm?: DeleteConfirm): Promise<number> {
    if (!ids.length) return 0;
    const res = await http<{ data: { deleted: number } }>(`/${resource}/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ ids, ...(confirm || {}) }),
    });
    return res.data?.deleted ?? 0;
  },
};

export interface GenerateBarcodesResult {
  /** Barkod üretilen ürün id'leri. */
  generated: number[];
  /** Seçili olduğu halde zaten barkodu olan / bulunamayan kart sayısı. */
  skipped: number;
  /** Üretilen toplam barkod adedi (koli + varyant). */
  totalBarcodes: number;
  barcodeType: string;
  barcodePrefix: string;
}

/**
 * Seçili kartlara (veya `onlyMissing` ile barkodu olmayanların tümüne) sunucuda,
 * kilitli sayaçtan toplu barkod üretir. Yalnızca barkodu olmayan ürünlere yazar.
 */
export async function generateBarcodesBulk(payload: { productIds?: number[]; onlyMissing?: boolean }): Promise<GenerateBarcodesResult> {
  return callOp<GenerateBarcodesResult>('generate-barcodes', payload);
}

/* ------------------------------------------------------------------ */
/* Yönetici panosu özeti (sunucu tarafı agregasyon)                    */
/* ------------------------------------------------------------------ */

export interface DashboardCategoryStats { finished: number; semi_finished: number; raw_material: number; accessory: number; }
export interface DashboardStageCounts { kesim: number; dikim: number; montaj: number; finisaj: number; }
export interface DashboardLowStockProduct { id: number; code: string; name: string; stock: number; minStock: number; unit: string; }
export interface DashboardCashFlowDay { name: string; gelir: number; gider: number; }
export interface DashboardRecentTransaction { id: number; type: 'income' | 'expense'; amount: number; date: string; description: string | null; }
export interface DashboardRecentOrder { id: number; orderNumber: string; date: string; grandTotal: number; }

export interface DashboardStats {
  income: number; expense: number; profit: number;
  cashBalance: number; bankBalance: number; totalLiquidAssets: number;
  customerChecksCount: number; customerChecksTotal: number; issuedChecksTotal: number;
  activeEmployeesCount: number; sgkEmployees: number; dailyEmployees: number;
  totalNetPayroll: number; totalEmployerCost: number; unpaidPayrollsCount: number; unaccountedPayrollsCount: number;
  pendingAdvancesCount: number; pendingAdvanceTotal: number;
  totalJournals: number; unbalancedJournals: number; netKdvDifference: number; kdv191Debit: number; kdv391Credit: number;
  openSalesInvoicesCount: number; openSalesTotal: number; openPurchaseTotal: number;
  uninvoicedWaybillsCount: number;
  lowStockProducts: DashboardLowStockProduct[]; lowStockCount: number;
  salesOrdersCount: number; totalOrderQty: number; totalShippedQty: number; remainingToShip: number;
  activeWorkOrdersCount: number; totalProducedQty: number; totalInProductionQty: number;
  stageCounts: DashboardStageCounts; categoryStats: DashboardCategoryStats;
}

export interface DashboardSummary {
  stats: DashboardStats;
  productCount: number;
  recentTransactions: DashboardRecentTransaction[];
  recentOrders: DashboardRecentOrder[];
  cashFlowByDay: DashboardCashFlowDay[];
}

/** Pano özetini tek istekte, sunucuda agregatlanmış olarak çeker. */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const res = await http<{ data: DashboardSummary }>(`/ops/dashboard-summary`, { method: 'GET' });
  return res.data;
}

/* ------------------------------------------------------------------ */
/* Kalıp (last) takip op'ları                                          */
/* ------------------------------------------------------------------ */

/** Kalıp genel bakış: konum bazında çift toplamları + kalıp başına kırılım. */
export async function getMoldSummary(): Promise<MoldSummary> {
  const res = await http<{ data: MoldSummary }>(`/ops/mold-summary`, { method: 'GET' });
  return res.data;
}

/** Kalıp hareketi: bir çift kaynaktan hedefe atomik taşınır. */
export async function moldMove(input: MoldMoveInput): Promise<MoldMoveResult> {
  return callOp<MoldMoveResult>('mold-move', input);
}

/** Fiziki sayım düzeltmesi: seçilen konum sayılan mutlak değere ayarlanır. */
export async function moldCountAdjust(input: MoldCountAdjustInput): Promise<MoldCountAdjustResult> {
  return callOp<MoldCountAdjustResult>('mold-count-adjust', input);
}

/** Kalıp çiftlerini bir iş emrine tahsis eder (fabrika deposu → allocated). */
export async function moldAllocate(input: MoldAllocateInput): Promise<MoldAllocateResult> {
  return callOp<MoldAllocateResult>('mold-allocate', input);
}

/** İş emrine tahsisli kalıp çiftlerini fabrika deposuna geri alır. */
export async function moldDeallocate(input: MoldAllocateInput): Promise<MoldAllocateResult> {
  return callOp<MoldAllocateResult>('mold-deallocate', input);
}

/**
 * Mizan (trial balance) — sunucuda hesaplanır.
 * journalEntries satırları SQL GROUP BY ile kesin hesap kodu bazında toplanır,
 * üst kodlara yuvarlanır; istemciye yalnızca hazır MizanRow[] döner.
 */
export async function getMizanSummary(options?: {
  startDate?: Date;
  endDate?: Date;
  onlyWithBalance?: boolean;
  levelFilter?: MizanLevelFilter;
}): Promise<MizanRow[]> {
  const params = new URLSearchParams();
  if (options?.startDate) params.set('startDate', new Date(options.startDate).toISOString());
  if (options?.endDate) params.set('endDate', new Date(options.endDate).toISOString());
  if (options?.onlyWithBalance) params.set('onlyWithBalance', '1');
  if (options?.levelFilter && options.levelFilter !== 'all') params.set('levelFilter', options.levelFilter);
  const qs = params.toString();
  const res = await http<{ data: MizanRow[] }>(`/ops/mizan${qs ? `?${qs}` : ''}`, { method: 'GET' });
  return res.data;
}

/** Raporlar ana sayfa (Genel Yönetim Özeti) KPI'ları — sunucuda agregatlanır. */
export interface ReportsSummary {
  inventory: { totalStockCount: number; criticalStockCount: number };
  production: { activeWorkOrdersCount: number; activePairsInProduction: number };
  finance: { totalLiquidity: number };
  hr: { totalEmployeesCount: number; currentMonthEmployerCost: number };
  accounting: { kdv191: number; kdv391: number; netKdvDiff: number };
  orders: { salesOrdersCount: number };
}

/**
 * Raporlar özet KPI'larını tek istekte çeker. Eskiden 9 tam tablo indirilip
 * istemcide reduce ile hesaplanıyordu; artık her bölüm SQL ile sunucuda toplanır
 * ve kullanıcının görüntüleme yetkisine göre koşullu çalışır (yetkisiz → 0).
 */
export async function getReportsSummary(): Promise<ReportsSummary> {
  const res = await http<{ data: ReportsSummary }>(`/ops/reports-summary`, { method: 'GET' });
  return res.data;
}

/* ------------------------------------------------------------------ */
/* Atomik toplu yazma                                                  */
/* ------------------------------------------------------------------ */

export type Mutation =
  | { op: 'insert'; resource: string; data: Record<string, any> }
  | { op: 'insertMany'; resource: string; rows: Record<string, any>[] }
  | {
      op: 'update';
      resource: string;
      id: Id;
      data: Record<string, any>;
      /** Verilirse kayıt bu sürümden sonra değişmişse işlem 409 ile reddedilir. */
      expectedVersion?: number;
    }
  | { op: 'updateWhere'; resource: string; where: ListOptions['where']; data: Record<string, any> }
  | { op: 'delete'; resource: string; id: Id }
  | { op: 'deleteWhere'; resource: string; where: ListOptions['where'] }
  | { op: 'clear'; resource: string };

export interface CommitResult {
  op: string;
  resource: string;
  id?: Id;
  ids?: Id[];
  changes?: number;
  deleted?: number;
}

/**
 * Birden çok tabloya dokunan yazma işlemlerini tek bir MySQL transaction'ı
 * içinde uygular. Okumalar önceden yapılır; yazma fazı atomiktir.
 *
 * `disableFkChecks`, tüm tabloları boşaltıp yeniden dolduran yedek geri
 * yükleme işlemlerinde yabancı anahtar sırasını devre dışı bırakır.
 */
export async function commit(mutations: Mutation[], options?: { disableFkChecks?: boolean }): Promise<CommitResult[]> {
  if (!mutations.length) return [];
  const res = await http<{ data: { results: CommitResult[] } }>('/ops/commit', {
    method: 'POST',
    body: JSON.stringify({ mutations, disableFkChecks: options?.disableFkChecks === true }),
  });
  return res.data?.results || [];
}

/* ------------------------------------------------------------------ */
/* Atomik işlem uçları (stok, reçete, cari bakiye)                     */
/* ------------------------------------------------------------------ */

/**
 * Stok hareketi: miktar, varyant stoğu, ağırlıklı ortalama maliyet ve
 * stok hareket kaydı sunucuda tek transaction içinde uygulanır.
 */
export async function stockMovement(input: StockMovementInput): Promise<StockMovementResult> {
  return callOp<StockMovementResult>('stock-movement', input);
}

/**
 * Reçete (BOM) sarfiyatı ve mamul stoğa girişi tek transaction içinde
 * uygulanır; hammadde satırları kilitlenerek eşzamanlı sarfiyat güvenli hale gelir.
 */
export async function consumeRecipe(params: RecipeConsumptionParams): Promise<RecipeConsumptionResult> {
  return callOp<RecipeConsumptionResult>('consume-recipe', params);
}

/** Cari bakiyeyi sunucuda, cari satırı kilitlenerek yeniden hesaplar. */
export async function recalculateContactBalance(contactId: number): Promise<ContactBalanceResult> {
  return callOp<ContactBalanceResult>('recalculate-contact-balance', { contactId });
}

/** Tüm tabloları boşaltıp demo verisini baştan yükler. */
export async function reseedDatabase(): Promise<{ created: boolean }> {
  const res = await http<{ data: { created: boolean } }>('/ops/reseed', { method: 'POST' });
  return res.data || { created: false };
}

/**
 * base64 data URL görseli sunucuya yükler ve kalıcı `/uploads/<hash>.<ext>`
 * URL'ini döner (#51). Ürün/renk görselleri ve firma logosu artık DB'de base64
 * olarak tutulmaz; bu URL ilgili alana yazılır ve `<img src>` ile aynı şekilde
 * görüntülenir.
 */
export async function uploadImage(dataUrl: string): Promise<string> {
  const res = await http<{ data: { url: string } }>('/files', {
    method: 'POST',
    body: JSON.stringify({ dataUrl }),
  });
  return res.data.url;
}

export async function health(): Promise<{ status: string; database: { connected: boolean; version?: string; error?: string } }> {
  return http('/health');
}

/* ------------------------------------------------------------------ */
/* Kimlik doğrulama ve oturum uçları                                    */
/* ------------------------------------------------------------------ */

export interface SessionPayload {
  user: AppUser | null;
  role: Role | null;
  expiresAt?: number;
  impersonatedBy?: { userId: number; userName: string } | null;
  /** Girişte zayıf parola tespit edilirse doldurulur. */
  passwordWarning?: string | null;
}

export const authApi = {
  async login(username: string, password: string): Promise<SessionPayload> {
    const res = await http<{ data: SessionPayload }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    return res.data;
  },

  async logout(): Promise<void> {
    await http('/auth/logout', { method: 'POST' });
  },

  /** Oturum yoksa null döner (401 beklenen bir durumdur). */
  async session(): Promise<SessionPayload | null> {
    try {
      const res = await http<{ data: SessionPayload }>('/auth/session');
      return res.data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },

  /** Yalnızca süper admin: başka bir kullanıcının yetkileriyle oturum açar. */
  async impersonate(userId: number): Promise<SessionPayload> {
    const res = await http<{ data: SessionPayload }>('/auth/impersonate', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    return res.data;
  },

  async stopImpersonation(): Promise<SessionPayload> {
    const res = await http<{ data: SessionPayload }>('/auth/impersonate/stop', { method: 'POST' });
    return res.data;
  },

  async changePassword(input: { userId?: number; currentPassword?: string; newPassword: string }): Promise<void> {
    await http('/auth/password', { method: 'POST', body: JSON.stringify(input) });
  },
};
