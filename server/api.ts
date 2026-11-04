import express, { type Request, type Response, type Router } from 'express';
import { execute, query, queryOne, withTransaction } from './db.js';
import { getDef, getMeta, RESOURCE_NAMES } from './registry.js';
import { reseed } from './seed.js';
import type { ResourceDef } from './columns.js';
import type { AppModule, PermissionAction } from '../src/types.js';
import {
  actionForMethod,
  can,
  clearSessionCookie,
  clientIp,
  createSession,
  destroySession,
  destroyUserSessions,
  invalidateUserCache,
  MIN_PASSWORD_LENGTH,
  rateLimit,
  requestToken,
  requireAuth,
  requireSuperAdmin,
  resetRateLimit,
  resolveSession,
  setSessionCookie,
  setUserPassword,
  stopImpersonation,
  validatePasswordStrength,
  verifyPassword,
  type AuthContext,
} from './auth.js';
import { writeAudit, writeAuditInTx, resourceAuditEntry, auditTracksChanges, AUDITED_RESOURCES } from './audit.js';
import type { PoolConnection } from 'mysql2/promise';
import { broadcast, sseHandler } from './sse.js';
import { createBusinessOpsRouter } from './businessOps.js';
import { executeDelete, planDelete, type DeleteContext } from './deletePolicy.js';
import { versionSupported } from './schema.js';
import { assertBalancedJournalEntry } from '../src/lib/accountingValidator.js';
import { allocateDocumentNumber, journalPrefixFor } from './numbering.js';
import { HttpError } from './errors.js';
import { assertResourcePeriod } from './periods.js';
import { storeImageFromDataUrl } from './files.js';
import {
  applyRecipeTargetColor,
  attachProductColors,
  normalizeColorPayload,
  prepareColorWrite,
  propagateColorRename,
  syncProductColorsFromBody,
} from './colorService.js';
import { normalizeMoldPayload, prepareMoldWrite } from './moldService.js';

/* ------------------------------------------------------------------ */
/* Yardımcılar                                                         */
/* ------------------------------------------------------------------ */

/** Gelen değeri kolon tipine göre MySQL'in kabul edeceği hale getirir. */
function coerce(def: ResourceDef, column: string, value: any): any {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const colDef = def.columns.find((c) => c.name === column);
  if (!colDef) return undefined;

  if (def.jsonColumns.includes(column)) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  switch (colDef.type) {
    case 'tinyint':
      return value === true || value === 1 || value === '1' ? 1 : 0;
    case 'datetime': {
      if (value instanceof Date) return value;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case 'decimal':
    case 'bigint':
    case 'int': {
      if (value === '') return null;
      const n = Number(value);
      return Number.isNaN(n) ? null : n;
    }
    default:
      return typeof value === 'object' ? JSON.stringify(value) : value;
  }
}

/** Sürüm kolonu istemci gövdesinden yazılamaz; yalnızca sunucu artırır. */
const SERVER_ONLY_COLUMNS = new Set(['version']);

/**
 * Gövdedeki alanları tablonun kolonlarına göre filtreler.
 * `protectedColumns` (ör. passwordHash) ve sunucuya ait kolonlar (version)
 * istemci gövdesinden hiçbir zaman alınmaz.
 */
function pickColumns(
  resource: string,
  def: ResourceDef,
  body: any,
  opts: { partial: boolean },
): Record<string, any> {
  const meta = getMeta(resource);
  const protectedColumns = new Set(meta.protectedColumns || []);
  // Türetilmiş/bakiye kolonları yalnızca INSERT'te (açılış değeri) yazılabilir;
  // UPDATE yollarında (partial) istemci gövdesinden soyulur — bunlar sadece
  // kontrollü op'larda satır kilidi + hareket/muhasebe kaydıyla güncellenir.
  const derivedColumns = opts.partial ? new Set(meta.derivedColumns || []) : new Set<string>();
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (key === def.primaryKey) continue;
    if (protectedColumns.has(key)) continue;
    if (derivedColumns.has(key)) continue;
    if (SERVER_ONLY_COLUMNS.has(key)) continue;
    const col = def.columns.find((c) => c.name === key);
    if (!col) continue;
    const coerced = coerce(def, key, value);
    if (coerced === undefined) continue;
    out[key] = coerced;
  }
  if (!opts.partial) {
    // INSERT: gönderilmeyen kolonlar için NULL/DEFAULT bırak.
    for (const col of def.columns) {
      if (col.name === def.primaryKey) continue;
      if (protectedColumns.has(col.name)) continue;
      if (!(col.name in out) && def.jsonColumns.includes(col.name)) out[col.name] = null;
    }
  }
  return out;
}

function insertSql(def: ResourceDef, data: Record<string, any>): { sql: string; params: any[] } {
  const keys = Object.keys(data);
  if (!keys.length) {
    return { sql: `INSERT INTO \`${def.table}\` () VALUES ()`, params: [] };
  }
  const cols = keys.map((k) => `\`${k}\``).join(', ');
  const marks = keys.map(() => '?').join(', ');
  return {
    sql: `INSERT INTO \`${def.table}\` (${cols}) VALUES (${marks})`,
    params: keys.map((k) => data[k]),
  };
}

/**
 * pickColumns birincil anahtarı gövdeden ayıklar; INSERT öncesi burada
 * tipi doğrulanmış biçimde geri eklenir. Boş bırakılırsa AUTO_INCREMENT devreye girer.
 */
function withPrimaryKey(def: ResourceDef, data: Record<string, any>, pk: any): Record<string, any> {
  if (pk === undefined || pk === null || pk === '') return data;
  const coerced = coerce(def, def.primaryKey, pk);
  if (coerced === undefined || coerced === null) return data;
  return { ...data, [def.primaryKey]: coerced };
}

/**
 * Her güncellemede `version` artırılır: iyimser kilitleme (optimistic locking)
 * bu sayacı karşılaştırarak eşzamanlı düzenlemeleri 409 ile reddeder.
 */
function updateSql(
  def: ResourceDef,
  data: Record<string, any>,
  whereSql: string,
  withVersion: boolean,
): { sql: string; params: any[] } {
  const keys = Object.keys(data);
  const sets = keys.map((k) => `\`${k}\` = ?`);
  if (withVersion) sets.push('`version` = `version` + 1');
  return {
    sql: `UPDATE \`${def.table}\` SET ${sets.join(', ')} ${whereSql}`,
    params: [...keys.map((k) => data[k])],
  };
}

/** `version` kolonu destekleniyorsa iyimser kilitleme uygulanır (server/schema.ts). */
async function supportsVersion(def: ResourceDef): Promise<boolean> {
  return versionSupported(def.table);
}

/**
 * `If-Match` başlığı veya gövdedeki `expectedVersion` alanından beklenen sürümü okur.
 * Değer verilmezse iyimser kilitleme uygulanmaz (mevcut davranış korunur).
 */
function expectedVersion(req: Request): number | null {
  const header = req.headers['if-match'];
  if (typeof header === 'string' && header.trim()) {
    const cleaned = header.replace(/^W\//, '').replace(/"/g, '').trim();
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  const fromBody = Number((req.body as any)?.expectedVersion);
  return Number.isFinite(fromBody) && fromBody > 0 ? fromBody : null;
}

/** Sürüm çakışması olduğunda hangi hatanın döneceğine karar verir. */
async function assertVersionMatch(def: ResourceDef, pk: any, expected: number): Promise<void> {
  const row = await queryOne<any>(
    `SELECT \`version\` FROM \`${def.table}\` WHERE \`${def.primaryKey}\` = ?`,
    [pk],
  );
  if (!row) throw new HttpError(404, 'Kayıt bulunamadı.');
  if (Number(row.version) !== expected) {
    throw new HttpError(
      409,
      'Bu kayıt siz düzenlerken başka bir kullanıcı tarafından değiştirildi. Lütfen sayfayı yenileyip tekrar deneyin.',
      'VERSION_CONFLICT',
    );
  }
}

/**
 * Kaynak bazlı iş kuralı doğrulamaları (senkron). Generic CRUD ve /ops/commit
 * aynı kancayı kullanır; böylece iş kuralları hiçbir yazma yolundan atlanamaz.
 */
function applyResourceRules(resource: string, data: Record<string, any>): void {
  if (resource === 'colors') {
    normalizeColorPayload(data);
    return;
  }
  if (resource === 'molds') {
    normalizeMoldPayload(data);
    return;
  }
  // Yevmiye fişi disiplini: denge sunucuda doğrulanır, toplamlar sunucuda hesaplanır.
  if (resource !== 'journalEntries') return;
  if (!('lines' in data)) return;

  let lines: any = data.lines;
  if (typeof lines === 'string') {
    try {
      lines = JSON.parse(lines);
    } catch {
      throw new HttpError(400, 'Yevmiye satırları geçersiz JSON biçiminde.', 'INVALID_JOURNAL_LINES');
    }
  }
  // Satır içermeyen (taslak) kayıtlar denge kontrolüne tabi değildir.
  if (!Array.isArray(lines) || lines.length === 0) return;

  try {
    // Denge kontrolü sıkı toleransla (JOURNAL_BALANCE_TOLERANCE = 0,005) yapılır:
    // 2 haneli toplamlarda bu fiilen tam eşitlik demektir, dolayısıyla buradan
    // geçen bir fiş gerçekten dengelidir ve `isBalanced` işareti doğrudur.
    // (Tolerans eskiden 0,05 idi ve 5 kuruşa kadar dengesiz fiş "dengeli"
    // damgalanıp Mizan'da kalıcı fark bırakıyordu.)
    const { totalDebit, totalCredit } = assertBalancedJournalEntry(lines);
    data.totalDebit = totalDebit;
    data.totalCredit = totalCredit;
    data.isBalanced = 1;
  } catch (err: any) {
    throw new HttpError(422, err?.message || 'Dengesiz yevmiye fişi reddedildi.', 'UNBALANCED_JOURNAL_ENTRY');
  }
}

/**
 * `users.roleCode` / `users.roleName` alanları sunucu tarafında `roleId`'den
 * türetilir. Bu alanlar `protectedColumns` ile istemciye kapatılmıştır; burada
 * yalnızca `roleId` değiştiğinde yeniden hesaplanır ve atama, oturumun yetki
 * çözümlemesiyle (`loadRole`) tutarlı kalır.
 */
async function deriveUserRole(
  conn: PoolConnection,
  data: Record<string, any>,
  opts: { force?: boolean; auth?: AuthContext } = {},
): Promise<void> {
  const hasRoleId = Object.prototype.hasOwnProperty.call(data, 'roleId');
  if (!hasRoleId && !opts.force) return;

  const roleId = data.roleId;
  if (roleId === null || roleId === undefined || roleId === '') {
    // Rol atanmadıysa denormalize alanlar da temizlenir (yetki `can()` ile false döner).
    data.roleId = null;
    data.roleCode = null;
    data.roleName = null;
    return;
  }

  const role = await queryOne<{ code: string; name: string; permissions: any }>(
    'SELECT `code`, `name`, `permissions` FROM `roles` WHERE `id` = ? LIMIT 1',
    [roleId],
  );
  if (!role) {
    // Geçersiz roleId sessizce yazılmaz: denormalize kopya ile gerçek rol ayrışırsa
    // süper admin kapısı gibi kararlar tutarsız hale gelir.
    throw new HttpError(400, `Atanmak istenen rol bulunamadı (id: ${roleId}).`, 'ROLE_NOT_FOUND');
  }
  if (opts.auth?.role?.code !== 'super_admin') {
    if (role.code === 'super_admin') throw new HttpError(403, 'Süper Admin rolünü yalnızca Süper Admin atayabilir.', 'ROLE_ESCALATION');
    const permissions = typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions || {};
    for (const [module, actions] of Object.entries(permissions)) {
      for (const [action, granted] of Object.entries(actions as object)) {
        if (granted && !can(opts.auth?.role || null, module as AppModule, action as PermissionAction)) throw new HttpError(403, 'Kendi yetkilerinizi aşan bir rol atayamazsınız.', 'ROLE_ESCALATION');
      }
    }
  }
  data.roleCode = role.code;
  data.roleName = role.name;
}

/** Gizli kolonları (parola türevleri) istemciye göndermeden önce ayıklar. */
function stripHidden(resource: string, row: any, auth?: AuthContext): any {
  const hidden = getMeta(resource).hidden;
  if (!row) return row;
  const copy: Record<string, any> = { ...row };
  for (const col of hidden || []) delete copy[col];
  if (auth) {
    const allowed = (module: AppModule) => can(auth.role, module, 'view');
    if (resource === 'products' && !allowed('inventory')) for (const key of ['buyingPrice', 'accountingCode', 'purchaseAccountCode']) delete copy[key];
    if (resource === 'contacts' && !allowed('contacts') && !allowed('finance') && !allowed('accounting')) for (const key of ['balance', 'creditLimit', 'bankName', 'iban', 'bankAccountName']) delete copy[key];
    if (resource === 'settings' && !allowed('settings')) {
      for (const [section, module] of [['hr', 'hr'], ['finance', 'finance'], ['production', 'production'], ['stock', 'inventory']] as [string, AppModule][]) if (!allowed(module)) delete copy[section];
    }
  }
  return copy;
}

function stripHiddenRows(resource: string, rows: any[], auth?: AuthContext): any[] {
  const hidden = getMeta(resource).hidden;
  if (!hidden?.length && !auth) return rows;
  return rows.map((row) => stripHidden(resource, row, auth));
}

/* ------------------------------------------------------------------ */
/* Canlı güncelleme (SSE) — server/sse.ts'e taşındı                   */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Silme bağlamı                                                       */
/* ------------------------------------------------------------------ */

/**
 * Kademe 2 silmelerde gerekçe ve oturum sahibinin parolası istemciden gelir.
 * Parola yalnızca doğrulama için kullanılır; ne denetim izine ne de loga yazılır.
 */
function deleteContext(req: Request, source?: Record<string, any>): DeleteContext {
  const body = source ?? (req.body || {});
  return {
    auth: req.auth,
    ip: clientIp(req),
    reason: body.reason == null ? null : String(body.reason),
    password: body.password == null ? null : String(body.password),
  };
}

/* ------------------------------------------------------------------ */
/* Sorgu oluşturma                                                     */
/* ------------------------------------------------------------------ */

interface ListQuery {
  where: Record<string, any>;
  search?: string;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
  select?: string[];
  countOnly?: boolean;
}

const FILTER_OPS = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'startsWith',
  'endsWith',
  'contains',
  'equalsIgnoreCase',
  'isNull',
  'notNull',
] as const;

type FilterOp = (typeof FILTER_OPS)[number];

function isFilterExpr(value: unknown): value is { op: FilterOp; value?: any } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    typeof (value as any).op === 'string' &&
    (FILTER_OPS as readonly string[]).includes((value as any).op)
  );
}

function buildWhere(def: ResourceDef, resource: string, filters: Record<string, any>): { sql: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  for (const [key, raw] of Object.entries(filters || {})) {
    const parts = key.split('+'); // bileşik indeks: [employeeId+date]
    for (const part of parts) {
      if (!def.columns.some((c) => c.name === part)) {
        throw new HttpError(400, `Geçersiz filtre kolonu: ${part} (${resource})`);
      }
    }
    if (isFilterExpr(raw)) {
      if (parts.length > 1) throw new HttpError(400, `Bileşik filtrede operatör kullanılamaz: ${key}`);
      if (raw.op === 'isNull') {
        clauses.push(`\`${parts[0]}\` IS NULL`);
        continue;
      }
      if (raw.op === 'notNull') {
        clauses.push(`\`${parts[0]}\` IS NOT NULL`);
        continue;
      }
      const col = `\`${parts[0]}\``;
      const value = coerce(def, parts[0], raw.value);
      switch (raw.op) {
        case 'eq':
          clauses.push(`${col} = ?`);
          params.push(value);
          break;
        case 'ne':
          clauses.push(`${col} <> ?`);
          params.push(value);
          break;
        case 'gt':
          clauses.push(`${col} > ?`);
          params.push(value);
          break;
        case 'gte':
          clauses.push(`${col} >= ?`);
          params.push(value);
          break;
        case 'lt':
          clauses.push(`${col} < ?`);
          params.push(value);
          break;
        case 'lte':
          clauses.push(`${col} <= ?`);
          params.push(value);
          break;
        case 'like':
          clauses.push(`${col} LIKE ?`);
          params.push(String(raw.value ?? ''));
          break;
        case 'startsWith':
          clauses.push(`${col} LIKE ?`);
          params.push(`${String(raw.value ?? '').replace(/[%_\\]/g, '\\$&')}%`);
          break;
        case 'endsWith':
          clauses.push(`${col} LIKE ?`);
          params.push(`%${String(raw.value ?? '').replace(/[%_\\]/g, '\\$&')}`);
          break;
        case 'contains':
          clauses.push(`${col} LIKE ?`);
          params.push(`%${String(raw.value ?? '').replace(/[%_\\]/g, '\\$&')}%`);
          break;
        case 'equalsIgnoreCase':
          clauses.push(`LOWER(${col}) = LOWER(?)`);
          params.push(value);
          break;
      }
      continue;
    }
    if (raw === null) {
      clauses.push(parts.map((p) => `\`${p}\` IS NULL`).join(' AND '));
    } else if (Array.isArray(raw)) {
      if (!raw.length) {
        clauses.push('1 = 0');
        continue;
      }
      if (parts.length > 1) {
        // Bileşik anahtar: dizi, kolon sırasına göre konumsal değerlerdir ([employeeId+date] → [id, tarih]).
        if (raw.length !== parts.length) {
          throw new HttpError(400, `Bileşik filtre ${parts.length} değer bekliyor: ${key}`);
        }
        clauses.push(`(${parts.map((p) => `\`${p}\` = ?`).join(' AND ')})`);
        for (let i = 0; i < parts.length; i++) params.push(coerce(def, parts[i], raw[i]));
      } else {
        clauses.push(`(\`${parts[0]}\` IN (${raw.map(() => '?').join(', ')}))`);
        for (const v of raw) params.push(coerce(def, parts[0], v));
      }
    } else {
      const coerced = coerce(def, parts[0], raw);
      const cmp = parts.length > 1 ? parts.map((p, i) => `\`${p}\` = ?`) : null;
      if (cmp) {
        clauses.push(`(${cmp.join(' AND ')})`);
        for (let i = 0; i < parts.length; i++) params.push(coerce(def, parts[i], raw));
      } else {
        clauses.push(`\`${parts[0]}\` = ?`);
        params.push(coerced);
      }
    }
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function buildSearch(def: ResourceDef, resource: string, term: string): { sql: string; params: any[] } {
  const cols = getMeta(resource).searchable.filter((c) => def.columns.some((col) => col.name === c));
  if (!cols.length) return { sql: '', params: [] };
  const like = `%${term}%`;
  return {
    sql: `(${cols.map((c) => `\`${c}\` LIKE ?`).join(' OR ')})`,
    params: cols.map(() => like),
  };
}

async function listRows(resource: string, def: ResourceDef, q: ListQuery) {
  const where = buildWhere(def, resource, q.where);
  const clauses: string[] = [];
  if (where.sql) clauses.push(where.sql.replace(/^WHERE /, ''));
  const params = [...where.params];

  if (q.search && q.search.trim()) {
    const s = buildSearch(def, resource, q.search.trim());
    if (s.sql) {
      clauses.push(s.sql);
      params.push(...s.params);
    }
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  if (q.countOnly) {
    const row = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM \`${def.table}\` ${whereSql}`, params);
    return Number((row as any)?.n || 0);
  }

  let orderSql = '';
  const meta = getMeta(resource);
  const requestedOrder = q.orderBy && def.columns.some((c) => c.name === q.orderBy) ? q.orderBy : null;
  if (requestedOrder) {
    orderSql = `ORDER BY \`${requestedOrder}\` ${q.orderDir === 'DESC' ? 'DESC' : 'ASC'}`;
  } else if (meta.defaultOrder) {
    const parts = meta.defaultOrder.split(',').map((p) => {
      const [col, dir] = p.trim().split(/\s+/);
      return def.columns.some((c) => c.name === col) ? `\`${col}\` ${dir || 'ASC'}` : null;
    });
    const valid = parts.filter(Boolean);
    if (valid.length) orderSql = `ORDER BY ${valid.join(', ')}`;
  }

  // Beyaz liste: şemada tanımlı kolonlar dışındaki (eski kurulumlardan kalan
  // pinCode/sessionToken gibi) kolonlar hiçbir zaman dışarı çıkmaz.
  let selectSql = def.columns.map((c) => `\`${c.name}\``).join(', ');
  if (q.select && q.select.length) {
    const cols = q.select.filter((c) => def.columns.some((col) => col.name === c));
    if (cols.length) selectSql = cols.map((c) => `\`${c}\``).join(', ');
  }

  let limitSql = '';
  if (q.limit !== undefined && Number.isFinite(q.limit)) {
    limitSql = `LIMIT ${Math.max(0, Math.floor(q.limit))}`;
    if (q.offset !== undefined && Number.isFinite(q.offset)) limitSql += ` OFFSET ${Math.max(0, Math.floor(q.offset))}`;
  } else if (q.offset !== undefined && Number.isFinite(q.offset)) {
    limitSql = `LIMIT 18446744073709551615 OFFSET ${Math.max(0, Math.floor(q.offset))}`;
  }

  return query(`SELECT ${selectSql} FROM \`${def.table}\` ${whereSql} ${orderSql} ${limitSql}`, params);
}

function parseListQuery(req: Request): ListQuery {
  const q: ListQuery = { where: {} };
  if (typeof req.query.where === 'string' && req.query.where.trim()) {
    try {
      q.where = JSON.parse(req.query.where);
    } catch {
      throw new HttpError(400, 'where parametresi geçerli JSON değil.');
    }
  } else if (req.query.where && typeof req.query.where === 'object') {
    q.where = req.query.where as Record<string, any>;
  }
  if (typeof req.query.search === 'string') q.search = req.query.search;
  if (typeof req.query.orderBy === 'string') q.orderBy = req.query.orderBy;
  if (typeof req.query.orderDir === 'string') q.orderDir = req.query.orderDir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  if (req.query.limit !== undefined) q.limit = Number(req.query.limit);
  if (req.query.offset !== undefined) q.offset = Number(req.query.offset);
  if (typeof req.query.select === 'string') q.select = req.query.select.split(',').map((s) => s.trim()).filter(Boolean);
  if (req.query.count === '1' || req.query.count === 'true') q.countOnly = true;
  return q;
}

/* ------------------------------------------------------------------ */
/* Yetki yardımcıları                                                  */
/* ------------------------------------------------------------------ */

/** Kaynak yazma işlemlerinde kullanılan modül/eylem denetimi. */
function assertResourcePermission(resource: string, method: string, auth: AuthContext | undefined): void {
  const meta = getMeta(resource);
  const action = actionForMethod(method);
  if (resource === 'roles' && action !== 'view') assertSuperAdmin(auth, 'Rol/yetki tanımlarını yalnızca Süper Admin değiştirebilir.');
  // Salt-okunur kaynaklar (ör. denetim izi) okunabilir; yazma yolları kapalıdır.
  if (meta.readOnly && action !== 'view') {
    throw new HttpError(403, 'Bu kaynak yalnızca okunabilir; doğrudan yazma kapalıdır.', 'READ_ONLY_RESOURCE');
  }
  if (action === 'view' && meta.readAuthOnly) return;
  if (!can(auth?.role || null, meta.module, action)) {
    throw new HttpError(
      403,
      `"${auth?.user.fullName || 'Kullanıcı'}" kullanıcısının "${meta.module.toUpperCase()}" modülünde "${action.toUpperCase()}" yetkisi yok.`,
      'FORBIDDEN',
    );
  }
}

/** Tüm tabloyu boşaltmak yıkıcı bir yönetici işlemidir. */
function assertSuperAdmin(auth: AuthContext | undefined, message: string): void {
  const isSuper = Boolean(auth?.role?.code === 'super_admin' || auth?.user.roleCode === 'super_admin');
  if (!isSuper) throw new HttpError(403, message, 'SUPER_ADMIN_REQUIRED');
}

/**
 * Kritik kaynakların generic REST yazımlarını, asıl işlemle AYNI transaction
 * içinde denetim izine yazar. Kimlik/rol/IP/zaman sunucudan üretilir; istemci
 * denetim kaydı uyduramaz. Yalnızca AUDITED_RESOURCES listesindeki kaynaklar
 * ve başarılı (satır etkileyen) işlemler kaydedilir.
 */
/**
 * İzlenen alanlarda (renk künyesi, ürün renk listesi) eski → yeni karşılaştırması
 * için kaydın güncelleme öncesi anlık görüntüsü. Yalnızca denetim izine fark
 * yazılan kaynaklarda ve aynı transaction içinde okunur.
 */
async function snapshotForAudit(
  conn: PoolConnection,
  def: ResourceDef,
  resource: string,
  pk: any,
): Promise<Record<string, any> | null> {
  if (!AUDITED_RESOURCES[resource] || !auditTracksChanges(resource)) return null;
  const result = await conn.query(`SELECT * FROM \`${def.table}\` WHERE \`${def.primaryKey}\` = ? LIMIT 1`, [pk]);
  return ((result as any)?.[0] as any[])?.[0] ?? null;
}

async function auditResourceInTx(
  conn: PoolConnection,
  resource: string,
  action: 'create' | 'update' | 'delete',
  id: string | number | null,
  req: Request,
  body?: unknown,
  before?: Record<string, any> | null,
): Promise<void> {
  const entry = resourceAuditEntry(resource, action, id, body, before);
  if (!entry) return;
  await writeAuditInTx(conn, entry, { auth: req.auth, ip: clientIp(req) });
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export function createApiRouter(): Router {
  const router = express.Router();

  /* ---------------------------------------------------------------- */
  /* Kimlik doğrulama uçları (oturum gerektirmeyen tek uç: /auth/login) */
  /* ---------------------------------------------------------------- */

  router.post('/auth/login', async (req, res, next) => {
    try {
      const ip = clientIp(req);
      const username = String(req.body?.username ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      if (!username || !password) {
        throw new HttpError(400, 'Kullanıcı adı ve parola zorunludur.', 'MISSING_CREDENTIALS');
      }

      const ipLimit = rateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000);
      if (!ipLimit.allowed) {
        throw new HttpError(429, `Çok fazla giriş denemesi yapıldı. ${ipLimit.retryAfterSec} saniye sonra tekrar deneyin.`, 'RATE_LIMITED');
      }
      const userLimit = rateLimit(`login:user:${ip}:${username}`, 8, 15 * 60 * 1000);
      if (!userLimit.allowed) {
        await writeAudit(
          { action: 'login', module: 'auth', description: `Hız sınırına takılan giriş denemesi: "${username}"`, details: `IP: ${ip}` },
          { ip },
        );
        throw new HttpError(429, `Çok fazla hatalı deneme. ${userLimit.retryAfterSec} saniye sonra tekrar deneyin.`, 'RATE_LIMITED');
      }

      const invalid = () => new HttpError(401, 'Kullanıcı adı veya parola hatalı.', 'INVALID_CREDENTIALS');
      const row = await queryOne<any>(
        'SELECT `id`, `username`, `fullName`, `status`, `passwordHash`, `passwordSalt` FROM `users` WHERE `username` = ? LIMIT 1',
        [username],
      );

      if (!row) {
        await writeAudit(
          { action: 'login', module: 'auth', description: `Başarısız giriş denemesi: "${username}" (kullanıcı bulunamadı)`, details: `IP: ${ip}` },
          { ip },
        );
        throw invalid();
      }

      let valid = false;
      let needsRehash = false;
      if (row.passwordHash && row.passwordSalt) {
        const result = await verifyPassword(password, String(row.passwordSalt), String(row.passwordHash));
        valid = result.valid;
        needsRehash = result.needsRehash;
      }

      if (!valid) {
        await writeAudit(
          { action: 'login', module: 'auth', description: `Başarısız giriş denemesi: "${row.fullName || username}" (hatalı parola)`, details: `IP: ${ip}` },
          { ip },
        );
        throw invalid();
      }

      if (row.status !== 'active') {
        await writeAudit(
          { action: 'login', module: 'auth', entityId: row.id, description: `Pasif hesap giriş denemesi: "${row.fullName || username}" (${row.status})`, details: `IP: ${ip}` },
          { ip },
        );
        throw new HttpError(
          403,
          `Hesabınız ${row.status === 'suspended' ? 'askıya alınmıştır' : 'pasif durumdadır'}. Lütfen sistem yöneticisi ile görüşün.`,
          'ACCOUNT_INACTIVE',
        );
      }

      // Eski sha256 kaydı başarılı girişte scrypt'e yükseltilir.
      if (needsRehash) await setUserPassword(Number(row.id), password);

      resetRateLimit(`login:user:${ip}:${username}`);
      const session = createSession({ userId: Number(row.id), ip, userAgent: req.headers['user-agent'] });
      setSessionCookie(res, session.token);
      await execute('UPDATE `users` SET `lastLoginAt` = NOW() WHERE `id` = ?', [row.id]);

      const context = await resolveSession(session.token);
      await writeAudit(
        {
          action: 'login',
          module: 'auth',
          entityId: row.id,
          description: `Oturum açıldı: ${row.fullName || username}`,
          details: needsRehash ? 'Parola kaydı güvenli biçime (scrypt) yükseltildi.' : null,
        },
        { auth: context, ip },
      );

      // Zayıf (kısa) parolalarla giriş yapan kullanıcıya arayüzde uyarı gösterilir.
      const passwordWarning =
        password.length < MIN_PASSWORD_LENGTH
          ? `Parolanız ${password.length} karakter. Güvenlik için en az ${MIN_PASSWORD_LENGTH} karakterlik yeni bir parola belirleyin.`
          : null;

      res.json({
        data: {
          user: context?.user,
          role: context?.role,
          expiresAt: session.expiresAt,
          impersonatedBy: null,
          passwordWarning,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/logout', requireAuth, async (req, res, next) => {
    try {
      const token = requestToken(req);
      await writeAudit(
        { action: 'logout', module: 'auth', entityId: req.auth?.user.id, description: `Oturum kapatıldı: ${req.auth?.user.fullName}` },
        { auth: req.auth, ip: clientIp(req) },
      );
      if (token) destroySession(token);
      clearSessionCookie(res);
      res.json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/auth/session', requireAuth, (req, res) => {
    const context = req.auth!;
    res.json({
      data: {
        user: context.user,
        role: context.role,
        expiresAt: context.session.expiresAt,
        impersonatedBy: context.session.impersonatedBy
          ? { userId: context.session.impersonatedBy.userId, userName: context.session.impersonatedBy.userName }
          : null,
      },
    });
  });

  /** Süper admin, bir kullanıcının yetkilerini test etmek için onun adına oturum açabilir. */
  router.post('/auth/impersonate', requireAuth, requireSuperAdmin, async (req, res, next) => {
    try {
      const admin = req.auth!;
      const targetId = Number(req.body?.userId);
      if (!Number.isFinite(targetId)) throw new HttpError(400, 'Geçerli bir kullanıcı seçilmelidir.');

      const target = await queryOne<any>(
        'SELECT `id`, `fullName`, `username`, `status` FROM `users` WHERE `id` = ? LIMIT 1',
        [targetId],
      );
      if (!target) throw new HttpError(404, 'Kullanıcı bulunamadı.');
      if (target.status !== 'active') throw new HttpError(400, 'Yalnızca aktif kullanıcılar için oturum açılabilir.');

      const originalToken = requestToken(req);
      if (!originalToken) throw new HttpError(400, 'Mevcut oturum belirteci bulunamadı.');

      const session = createSession({
        userId: Number(target.id),
        ip: clientIp(req),
        userAgent: req.headers['user-agent'],
        impersonatedBy: { userId: admin.user.id, userName: admin.user.fullName, originalToken },
      });
      setSessionCookie(res, session.token);
      const context = await resolveSession(session.token);

      await writeAudit(
        {
          action: 'login',
          module: 'auth',
          entityId: target.id,
          description: `Yetki simülasyonu: ${admin.user.fullName}, ${target.fullName || target.username} hesabına geçti.`,
          details: `Modül bazlı yetki testi. Yönetici oturumu açık tutuldu.`,
        },
        { auth: context, ip: clientIp(req) },
      );

      res.json({
        data: {
          user: context?.user,
          role: context?.role,
          expiresAt: session.expiresAt,
          impersonatedBy: { userId: admin.user.id, userName: admin.user.fullName },
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /** Simülasyonu bitirip yöneticinin kendi oturumuna döner. */
  router.post('/auth/impersonate/stop', requireAuth, async (req, res, next) => {
    try {
      const token = requestToken(req);
      const restored = stopImpersonation(token);
      if (!restored) throw new HttpError(400, 'Aktif bir yetki simülasyonu oturumu bulunamadı.', 'NO_IMPERSONATION');

      setSessionCookie(res, restored);
      const context = await resolveSession(restored);
      await writeAudit(
        { action: 'login', module: 'auth', description: `Yetki simülasyonu sona erdi: ${context?.user.fullName} kendi hesabına döndü.` },
        { auth: context, ip: clientIp(req) },
      );
      res.json({
        data: {
          user: context?.user,
          role: context?.role,
          expiresAt: context?.session.expiresAt,
          impersonatedBy: null,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /** Parola değiştirme: kendi hesabı (mevcut parola ile) veya yetkili kullanıcı tarafından. */
  router.post('/auth/password', requireAuth, async (req, res, next) => {
    try {
      const me = req.auth!.user;
      const targetId = req.body?.userId ? Number(req.body.userId) : me.id;
      if (!Number.isFinite(targetId)) throw new HttpError(400, 'Geçerli bir kullanıcı belirtilmelidir.');

      const newPassword = String(req.body?.newPassword ?? '');
      const strengthError = validatePasswordStrength(newPassword);
      if (strengthError) throw new HttpError(400, strengthError, 'WEAK_PASSWORD');

      if (targetId !== me.id) {
        if (!can(req.auth!.role, 'users', 'edit')) {
          throw new HttpError(403, 'Başka bir kullanıcının parolasını yalnızca yetkili kişiler değiştirebilir.', 'FORBIDDEN');
        }
        const target = await queryOne<any>('SELECT `id`, `fullName` FROM `users` WHERE `id` = ? LIMIT 1', [targetId]);
        if (!target) throw new HttpError(404, 'Kullanıcı bulunamadı.');
        await setUserPassword(targetId, newPassword);
        destroyUserSessions(targetId);
        invalidateUserCache(targetId);
        await writeAudit(
          { action: 'update', module: 'users', entityId: targetId, description: `Parola sıfırlandı: ${target.fullName}`, details: `İşlemi yapan: ${me.fullName}` },
          { auth: req.auth, ip: clientIp(req) },
        );
        res.json({ data: { ok: true, userId: targetId } });
        return;
      }

      const currentPassword = String(req.body?.currentPassword ?? '');
      const row = await queryOne<any>('SELECT `passwordHash`, `passwordSalt` FROM `users` WHERE `id` = ? LIMIT 1', [me.id]);
      if (!row?.passwordHash || !row?.passwordSalt) {
        throw new HttpError(400, 'Hesabınızda tanımlı bir parola bulunamadı. Yöneticinizle görüşün.', 'NO_PASSWORD');
      }
      const { valid } = await verifyPassword(currentPassword, String(row.passwordSalt), String(row.passwordHash));
      if (!valid) throw new HttpError(400, 'Mevcut parolanız doğrulanamadı.', 'INVALID_CURRENT_PASSWORD');

      await setUserPassword(me.id, newPassword);
      destroyUserSessions(me.id, requestToken(req) ?? undefined);
      invalidateUserCache(me.id);
      await writeAudit(
        { action: 'update', module: 'users', entityId: me.id, description: `Kullanıcı kendi parolasını değiştirdi: ${me.fullName}`, details: 'Diğer oturumlar kapatıldı.' },
        { auth: req.auth, ip: clientIp(req) },
      );
      res.json({ data: { ok: true, userId: me.id } });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Buradan sonrası oturum gerektirir.                                */
  /* ---------------------------------------------------------------- */
  router.use(requireAuth);

  router.get('/meta/resources', (_req, res) => {
    res.json({
      resources: RESOURCE_NAMES,
      meta: RESOURCE_NAMES.reduce<Record<string, any>>((acc, name) => {
        const def = getDef(name)!;
        const meta = getMeta(name);
        acc[name] = {
          primaryKey: def.primaryKey,
          columns: def.columns.map((c) => c.name),
          jsonColumns: def.jsonColumns,
          searchable: meta.searchable,
          module: meta.module,
          readOnly: Boolean(meta.readOnly),
        };
        return acc;
      }, {}),
    });
  });

  router.get('/events', sseHandler);

  /* ---------------------------------------------------------------- */
  /* Görsel yükleme (#51): base64 data URL → disk dosyası + /uploads   */
  /* URL'i. Ürün/renk görselleri ve firma logosu artık DB'de base64    */
  /* olarak tutulmaz; istemci bu uçtan dönen URL'i ilgili alana yazar. */
  /* ---------------------------------------------------------------- */
  router.post('/files', async (req, res, next) => {
    try {
      const stored = storeImageFromDataUrl(req.body?.dataUrl);
      res.json({ data: { url: stored.url, bytes: stored.bytes } });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* İşlem uçları: stok hareketi, reçete sarfiyatı, cari bakiye        */
  /* (tek transaction + satır kilidi)                                 */
  /* ---------------------------------------------------------------- */
  const { router: opsRouter, deleteEffects } = createBusinessOpsRouter();
  router.use('/ops', opsRouter);

  /* ---------------------------------------------------------------- */
  /* Demo verilerine sıfırlama: yalnızca Süper Admin ve üretim dışında */
  /* ---------------------------------------------------------------- */
  router.post('/ops/reseed', requireSuperAdmin, async (req, res, next) => {
    try {
      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DESTRUCTIVE_OPS !== 'true') {
        throw new HttpError(403, 'Demo verisine sıfırlama üretim ortamında kapalıdır (ALLOW_DESTRUCTIVE_OPS=true ile açılabilir).', 'DESTRUCTIVE_OPS_DISABLED');
      }
      const result = await reseed();
      for (const resource of RESOURCE_NAMES) broadcast(resource, 'seed', []);
      await writeAudit(
        { action: 'system', module: 'system', description: 'Tüm veriler silinip demo fabrika verileri yeniden yüklendi.', details: `Kullanıcı: ${req.auth?.user.fullName}` },
        { auth: req.auth, ip: clientIp(req) },
      );
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Atomik toplu yazma: birden çok tabloya dokunan işlemler          */
  /* tek bir MySQL transaction'ı içinde uygulanır.                    */
  /* ---------------------------------------------------------------- */
  interface Mutation {
    op: 'insert' | 'insertMany' | 'update' | 'updateWhere' | 'delete' | 'deleteWhere' | 'clear';
    resource: string;
    id?: number | string;
    where?: Record<string, any>;
    data?: Record<string, any>;
    rows?: Record<string, any>[];
    /** Kademe 2 silmelerde zorunlu: silme gerekçesi. */
    reason?: string;
    /** Kademe 2 silmelerde zorunlu: oturum sahibinin parolası (saklanmaz). */
    password?: string;
  }

  const MUTATION_ACTIONS: Record<Mutation['op'], PermissionAction> = {
    insert: 'create',
    insertMany: 'create',
    update: 'edit',
    updateWhere: 'edit',
    delete: 'delete',
    deleteWhere: 'delete',
    clear: 'delete',
  };

  router.post('/ops/commit', async (req, res, next) => {
    try {
      const mutations: Mutation[] = Array.isArray(req.body?.mutations) ? req.body.mutations : [];
      if (!mutations.length) throw new HttpError(400, 'Uygulanacak işlem bulunamadı.');
      // Yedek geri yükleme gibi tüm tabloları boşaltıp yeniden dolduran işlemlerde
      // yabancı anahtar sırası gözetilemez; bu bayrak yalnızca Süper Admin'e açıktır.
      const disableFkChecks = req.body?.disableFkChecks === true;
      if (disableFkChecks) {
        assertSuperAdmin(req.auth, 'Yabancı anahtar denetimini devre dışı bırakmak yalnızca Süper Admin yetkisindedir.');
      }

      // Yazma fazından önce tüm işlemlerin yetkisi doğrulanır: yarısı uygulanmış
      // bir toplu işlem oluşmasın.
      for (const m of mutations) {
        const meta = getMeta(m.resource);
        if (!getDef(m.resource)) throw new HttpError(400, `Bilinmeyen kaynak: ${m.resource}`);
        if (meta.readOnly && !disableFkChecks) {
          // Yedek geri yükleme (yalnızca Süper Admin, FK denetimi kapalı) salt-okunur
          // bağ tablolarını (ör. productColors) olduğu gibi geri yazabilir.
          throw new HttpError(403, `"${m.resource}" kaynağı yalnızca okunabilir.`, 'READ_ONLY_RESOURCE');
        }
        // Hareket defteri tabloları toplu işlemde yalnızca `clear` (Süper Admin) ile yazılabilir.
        if (meta.movementTable && m.op !== 'clear') {
          throw new HttpError(
            403,
            `"${m.resource}" bir hareket defteridir; doğrudan toplu yazım kapalıdır. Kontrollü işlemleri (ops) kullanın.`,
            'MOVEMENT_TABLE',
          );
        }
        // Kontrollü yazımlı kaynaklarda ham satır yazımı toplu işlemde de kapalıdır.
        // delete/deleteWhere serbest: ikisi de silme politikası motorundan geçer.
        // Yedek geri yükleme (yalnızca Süper Admin, FK denetimi kapalı) tüm tabloyu
        // boşaltıp anlık görüntüden yeniden doldurduğu için bu kapıdan muaftır —
        // tıpkı salt-okunur bağ tablolarında olduğu gibi (bkz. yukarıdaki readOnly).
        if (meta.controlledWrites && m.op !== 'clear' && m.op !== 'delete' && m.op !== 'deleteWhere' && !disableFkChecks) {
          throw new HttpError(
            403,
            `"${m.resource}" kayıtları yalnızca kendi iş ucuyla yazılır; toplu işlemde ekleme/düzenleme kapalıdır.`,
            'CONTROLLED_RESOURCE',
          );
        }
        const action = MUTATION_ACTIONS[m.op];
        if (m.resource === 'roles' && !disableFkChecks) assertSuperAdmin(req.auth, 'Rol/yetki tanımlarını yalnızca Süper Admin değiştirebilir.');
        if (!action) throw new HttpError(400, `Desteklenmeyen işlem: ${(m as any).op}`);
        if (m.op === 'clear') {
          assertSuperAdmin(req.auth, `"${m.resource}" tablosunu tamamen boşaltmak yalnızca Süper Admin yetkisindedir.`);
        } else if (!can(req.auth?.role || null, meta.module, action)) {
          throw new HttpError(
            403,
            `"${req.auth?.user.fullName}" kullanıcısının "${meta.module.toUpperCase()}" modülünde "${action.toUpperCase()}" yetkisi yok.`,
            'FORBIDDEN',
          );
        }
      }

      const touched = new Set<string>();
      const results: any[] = [];

      await withTransaction(async (conn) => {
        if (disableFkChecks) await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        try {
          for (const m of mutations) {
            const def = getDef(m.resource)!;
            touched.add(m.resource);

            switch (m.op) {
              case 'insert': {
                const data = pickColumns(m.resource, def, m.data || {}, { partial: false });
                applyResourceRules(m.resource, data);
                if (!disableFkChecks) await assertResourcePeriod(conn, m.resource, data, undefined, req.auth);
                if (m.resource === 'users') await deriveUserRole(conn, data, { auth: req.auth });
                const { sql, params } = insertSql(def, data);
                const [r] = await conn.query(sql, params);
                const insertId = (r as any)?.insertId ?? null;
                // Denetim izi generic REST yoluyla AYNI olmalı: aksi halde aynı işlem
                // seçilen uçtan bağımsız olarak izlenir/izlenmez hale gelir.
                if (!disableFkChecks) {
                  await auditResourceInTx(conn, m.resource, 'create', insertId, req, data);
                }
                results.push({ op: m.op, resource: m.resource, id: insertId });
                break;
              }
              case 'insertMany': {
                const rows = Array.isArray(m.rows) ? m.rows : [];
                const ids: any[] = [];
                for (const row of rows) {
                  const data = pickColumns(m.resource, def, row, { partial: false });
                  applyResourceRules(m.resource, data);
                  if (!disableFkChecks) await assertResourcePeriod(conn, m.resource, data, undefined, req.auth);
                  if (m.resource === 'users') await deriveUserRole(conn, data, { auth: req.auth });
                  const { sql, params } = insertSql(def, data);
                  const [r] = await conn.query(sql, params);
                  const newId = (r as any)?.insertId ?? null;
                  ids.push(newId);
                  if (!disableFkChecks) {
                    await auditResourceInTx(conn, m.resource, 'create', newId, req, data);
                  }
                }
                results.push({ op: m.op, resource: m.resource, ids });
                break;
              }
              case 'update': {
                if (m.id === undefined || m.id === null) throw new HttpError(400, 'update için id gerekli.');
                const data = pickColumns(m.resource, def, m.data || {}, { partial: true });
                applyResourceRules(m.resource, data);
                if (m.resource === 'users') await deriveUserRole(conn, data, { auth: req.auth });
                // Fark (eski → yeni) için güncelleme ÖNCESİ anlık görüntü alınır.
                const before = await snapshotForAudit(conn, def, m.resource, coerce(def, def.primaryKey, m.id));
                if (!disableFkChecks) await assertResourcePeriod(conn, m.resource, data, m.id, req.auth);
                const withVersion = await supportsVersion(def);
                const expected = Number((m as any).expectedVersion);
                const hasExpected = Number.isFinite(expected) && expected > 0;
                if (hasExpected && !withVersion) {
                  throw new HttpError(400, 'Bu kurulumda iyimser kilitleme etkin değil (version kolonu yok). `npm run db:migrate` çalıştırın.', 'MIGRATION_REQUIRED');
                }
                const { sql, params } = updateSql(
                  def,
                  data,
                  hasExpected
                    ? `WHERE \`${def.primaryKey}\` = ? AND \`version\` = ?`
                    : `WHERE \`${def.primaryKey}\` = ?`,
                  withVersion,
                );
                const [r] = await conn.query(
                  sql,
                  hasExpected
                    ? [...params, coerce(def, def.primaryKey, m.id), expected]
                    : [...params, coerce(def, def.primaryKey, m.id)],
                );
                if (hasExpected && !(r as any)?.affectedRows) {
                  await assertVersionMatch(def, coerce(def, def.primaryKey, m.id), expected);
                  throw new HttpError(404, 'Kayıt bulunamadı.');
                }
                // Yalnızca gerçekten satır etkileyen güncellemeler izlenir.
                if (!disableFkChecks && (r as any)?.affectedRows) {
                  await auditResourceInTx(conn, m.resource, 'update', m.id, req, data, before);
                }
                results.push({ op: m.op, resource: m.resource, changes: (r as any)?.affectedRows ?? 0 });
                break;
              }
              case 'updateWhere': {
                const where = buildWhere(def, m.resource, m.where || {});
                if (!where.sql) throw new HttpError(400, 'updateWhere için filtre gerekli.');
                const data = pickColumns(m.resource, def, m.data || {}, { partial: true });
                applyResourceRules(m.resource, data);
                if (m.resource === 'users') await deriveUserRole(conn, data, { auth: req.auth });
                // Kilitlenen satırlar hem dönem doğrulaması hem de denetim farkı
                // için aynı anlık görüntüdür. Ayrı ve LIMIT'li okuma 200'den fazla
                // satır güncellendiğinde denetim izini eksik bırakıyordu.
                let beforeRows: any[] = [];
                if (!disableFkChecks) {
                  const [periodRows] = await conn.query<any[]>(`SELECT * FROM \`${def.table}\` ${where.sql} FOR UPDATE`, where.params);
                  for (const periodRow of periodRows) await assertResourcePeriod(conn, m.resource, data, periodRow[def.primaryKey], req.auth);
                  if (AUDITED_RESOURCES[m.resource]) beforeRows = periodRows;
                }
                const { sql, params } = updateSql(def, data, where.sql, await supportsVersion(def));
                const [r] = await conn.query(sql, [...params, ...where.params]);
                if (!disableFkChecks && (r as any)?.affectedRows) {
                  for (const row of beforeRows) {
                    await auditResourceInTx(
                      conn,
                      m.resource,
                      'update',
                      row[def.primaryKey],
                      req,
                      data,
                      row,
                    );
                  }
                }
                results.push({ op: m.op, resource: m.resource, changes: (r as any)?.affectedRows ?? 0 });
                break;
              }
              case 'delete': {
                if (m.id === undefined || m.id === null) throw new HttpError(400, 'delete için id gerekli.');
                const id = coerce(def, def.primaryKey, m.id);
                if (disableFkChecks) {
                  // Yedek geri yükleme: politika motoru devre dışı, ham DELETE.
                  const [r] = await conn.query(`DELETE FROM \`${def.table}\` WHERE \`${def.primaryKey}\` = ?`, [id]);
                  results.push({ op: m.op, resource: m.resource, deleted: (r as any)?.affectedRows ?? 0 });
                } else {
                  const r = await executeDelete(conn, deleteEffects, m.resource, def.table, def.primaryKey, id, deleteContext(req, m));
                  results.push({ op: m.op, resource: m.resource, deleted: r.deleted });
                }
                break;
              }
              case 'deleteWhere': {
                const where = buildWhere(def, m.resource, m.where || {});
                if (!where.sql) throw new HttpError(400, 'deleteWhere için filtre gerekli.');
                if (disableFkChecks) {
                  const [r] = await conn.query(`DELETE FROM \`${def.table}\` ${where.sql}`, where.params);
                  results.push({ op: m.op, resource: m.resource, deleted: (r as any)?.affectedRows ?? 0 });
                  break;
                }
                // Toplu silme de kayıt başına politikadan geçer: kademe, cascade,
                // bakiye geri yazımı ve denetim kaydı atlanamaz.
                const ctx = deleteContext(req, m);
                const idRows = await conn.query<any[]>(
                  `SELECT \`${def.primaryKey}\` AS \`__id\` FROM \`${def.table}\` ${where.sql}`,
                  where.params,
                );
                const ids = ((idRows[0] as any[]) || []).map((r) => r.__id);
                let deleted = 0;
                for (const id of ids) {
                  deleted += (await executeDelete(conn, deleteEffects, m.resource, def.table, def.primaryKey, id, ctx)).deleted;
                }
                results.push({ op: m.op, resource: m.resource, deleted });
                break;
              }
              case 'clear': {
                if (!disableFkChecks) await conn.query('SET FOREIGN_KEY_CHECKS = 0');
                try {
                  const [r] = await conn.query(`DELETE FROM \`${def.table}\``);
                  results.push({ op: m.op, resource: m.resource, deleted: (r as any)?.affectedRows ?? 0 });
                } finally {
                  if (!disableFkChecks) await conn.query('SET FOREIGN_KEY_CHECKS = 1');
                }
                break;
              }
              default:
                throw new HttpError(400, `Desteklenmeyen işlem: ${(m as any).op}`);
            }
          }
        } finally {
          if (disableFkChecks) await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        }

        // Yıkıcı toplu işlemler aynı transaction içinde denetim izine yazılır.
        const destructive = mutations.filter((m) => m.op === 'clear' || m.op === 'deleteWhere');
        if (destructive.length) {
          await writeAuditInTx(
            conn,
            {
              action: 'delete',
              module: 'system',
              description: `Toplu veri silme işlemi uygulandı (${destructive.length} kaynak).`,
              details: destructive.map((m) => `${m.resource}:${m.op}`).join(', ').slice(0, 1000),
            },
            { auth: req.auth, ip: clientIp(req) },
          );
        }
      });

      if (touched.has('users') || touched.has('roles')) invalidateUserCache();

      for (const resource of touched) broadcast(resource, 'update', []);

      res.json({ data: { results } });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Kaynak uçları (RBAC denetimli)                                   */
  /* ---------------------------------------------------------------- */

  /** İstek yolundaki kaynağa göre modül/eylem iznini denetler. */
  const resourceAccess = (req: Request, _res: Response, next: any) => {
    try {
      const resource = String(req.params.resource || '');
      if (!getDef(resource)) throw new HttpError(404, `Bilinmeyen kaynak: ${resource}`);
      assertResourcePermission(resource, req.method, req.auth);
      // Hareket defteri tablolarında (ör. inventoryLogs) generic satır yazımı kapalıdır;
      // yalnızca kontrollü op'lar yazar. `clear` ise mevcut Süper Admin kapısıyla kalır.
      const meta = getMeta(resource);
      const isWrite = req.method.toUpperCase() !== 'GET';
      const isClear = req.path.endsWith('/clear');
      if (meta.movementTable && isWrite && !isClear) {
        throw new HttpError(
          403,
          `"${resource}" bir hareket defteridir; doğrudan kayıt ekleme/düzenleme/silme kapalıdır. Stok hareketleri kontrollü işlemler (ops) üzerinden yapılır.`,
          'MOVEMENT_TABLE',
        );
      }
      // Kontrollü yazımlı kaynaklarda (ör. cari hareketler) satır ekleme/düzenleme
      // kapalıdır: türetilmiş alanlar (cari bakiyesi) yalnızca kendi iş ucunda,
      // satır kilidi altında güncellenir. Silme yolları açık kalır çünkü hepsi
      // silme politikası motorundan (kademe + gerekçe + parola + cascade) geçer.
      const isDeleteFlow =
        req.method.toUpperCase() === 'DELETE' || req.path.endsWith('/bulk-delete') || req.path.endsWith('/delete-where');
      if (meta.controlledWrites && isWrite && !isClear && !isDeleteFlow) {
        throw new HttpError(
          403,
          `"${resource}" kayıtları yalnızca kendi ekranından oluşturulur/düzenlenir; doğrudan satır yazımı kapalıdır. Silme, silme politikası üzerinden yapılabilir.`,
          'CONTROLLED_RESOURCE',
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };

  // ---- Liste / sayım ----
  router.get('/:resource', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;
      const q = parseListQuery(req);
      const result = await listRows(resource, def, q);
      if (q.countOnly) res.json({ count: result });
      else {
        // Ürün renkleri artık productColors bağında tutulur; okuma yolunda
        // merkezi kartlardan zenginleştirilir (colors/colorRefs).
        const rows = resource === 'products' ? await attachProductColors(result as any[]) : (result as any[]);
        res.json({ data: stripHiddenRows(resource, rows, req.auth) });
      }
    } catch (err) {
      next(err);
    }
  });

  // ---- Tek kayıt ----
  router.get('/:resource/:id', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;
      const columns = def.columns.map((c) => `\`${c.name}\``).join(', ');
      const row = await queryOne(
        `SELECT ${columns} FROM \`${def.table}\` WHERE \`${def.primaryKey}\` = ?`,
        [coerce(def, def.primaryKey, req.params.id)]
      );
      if (!row) throw new HttpError(404, 'Kayıt bulunamadı.');
      const enriched = resource === 'products' ? (await attachProductColors([row as any]))[0] : row;
      res.json({ data: stripHidden(resource, enriched, req.auth) });
    } catch (err) {
      next(err);
    }
  });

  // ---- Oluştur (tek veya toplu) ----
  router.post('/:resource', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;

      const body = req.body;
      const rows: any[] = Array.isArray(body) ? body : [body];
      if (!rows.length) throw new HttpError(400, 'Eklenecek kayıt yok.');

      // Kullanıcı oluşturmada parola zorunludur; parola hiçbir zaman gövdedeki
      // hash alanlarından alınmaz, sunucuda üretilir.
      if (resource === 'users') {
        const password = String(rows[0]?.password ?? '');
        const strengthError = validatePasswordStrength(password);
        if (strengthError) throw new HttpError(400, `Yeni kullanıcı için parola zorunludur. ${strengthError}`, 'WEAK_PASSWORD');
      }

      const ids = await withTransaction(async (conn) => {
        const created: any[] = [];
        for (const row of rows) {
          const data = withPrimaryKey(def, pickColumns(resource, def, row, { partial: false }), row?.[def.primaryKey]);
          if (def.timestamps.includes('createdAt') && !data.createdAt) data.createdAt = new Date();
          if (def.timestamps.includes('updatedAt') && !data.updatedAt) data.updatedAt = new Date();
          applyResourceRules(resource, data);
          if (resource === 'users') await deriveUserRole(conn, data, { auth: req.auth });
          // Renk kodu boşsa kilitli sayaçtan üretilir; kod benzersizliği burada
          // açıkça denetlenir (UNIQUE çakışması 500'e düşmesin).
          if (resource === 'colors') await prepareColorWrite(conn, data, { id: data[def.primaryKey] ?? null });
          if (resource === 'molds') await prepareMoldWrite(conn, data, { id: data[def.primaryKey] ?? null });
          if (resource === 'recipes') await applyRecipeTargetColor(conn, data);
          // Yevmiye fiş numarası her zaman sunucuda, kilitli sayaçtan üretilir
          // (item 8). İstemciden gelen entryNumber yok sayılır; böylece eşzamanlı
          // isteklerde UNIQUE çakışması (ER_DUP_ENTRY → 500) oluşmaz.
          if (resource === 'journalEntries') {
            const year = data.date ? new Date(data.date).getFullYear() : new Date().getFullYear();
            data.entryNumber = await allocateDocumentNumber(conn, {
              table: 'journalEntries',
              prefix: journalPrefixFor(data.entryType),
              pad: 6,
              year,
            });
          }
          if (!Object.keys(data).length) {
            const [r] = await conn.query(`INSERT INTO \`${def.table}\` () VALUES ()`);
            created.push((r as any).insertId);
            continue;
          }
          await assertResourcePeriod(conn, resource, data, undefined, req.auth);
          const { sql, params } = insertSql(def, data);
          const [r] = await conn.query(sql, params);
          const newId = data[def.primaryKey] ?? (r as any).insertId;
          created.push(newId);
          // Ürünün renk bağları aynı transaction içinde productColors'a yazılır.
          if (resource === 'products' && newId) await syncProductColorsFromBody(conn, Number(newId), row);
        }
        // Kritik kaynak oluşturulmaları aynı transaction içinde auditlenir.
        for (const id of created) await auditResourceInTx(conn, resource, 'create', id, req, rows[0]);
        return created;
      });

      if (resource === 'users') {
        for (let i = 0; i < ids.length; i++) {
          const password = rows[i]?.password ?? rows[0]?.password;
          if (password) await setUserPassword(Number(ids[i]), String(password));
        }
        invalidateUserCache();
      }

      broadcast(resource, 'create', ids);
      res.status(201).json({ data: Array.isArray(body) ? ids : ids[0], ids });
    } catch (err) {
      next(err);
    }
  });

  // ---- Kısmi güncelleme ----
  router.patch('/:resource/:id', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;

      const data = pickColumns(resource, def, req.body, { partial: true });
      if (def.timestamps.includes('updatedAt')) data.updatedAt = new Date();
      // Ürün kartında yalnızca renk seçimi değişmiş olabilir (colorIds); bu
      // durumda kolon gövdesi boş olsa da yazma işlemi geçerlidir.
      const hasColorSync = resource === 'products' && (Array.isArray(req.body?.colorIds) || Array.isArray(req.body?.colors));
      if (!Object.keys(data).length && !hasColorSync) throw new HttpError(400, 'Güncellenecek alan yok.');

      applyResourceRules(resource, data);
      // Parola gövde alanı yazma öncesi doğrulanır (yarım kalmış güncelleme olmasın).
      await assertUserPasswordChange(req, resource, req.body, req.params.id);

      const pk = coerce(def, def.primaryKey, req.params.id);
      const withVersion = await supportsVersion(def);
      const expected = expectedVersion(req);
      if (expected !== null && !withVersion) {
        throw new HttpError(400, 'Bu kurulumda iyimser kilitleme etkin değil (version kolonu yok). `npm run db:migrate` çalıştırın.', 'MIGRATION_REQUIRED');
      }
      const affected = await withTransaction(async (conn) => {
        const before = await snapshotForAudit(conn, def, resource, pk);
        await assertResourcePeriod(conn, resource, data, pk, req.auth);
        // Renk kodu değişiyorsa benzersizlik transaction içinde denetlenir.
        if (resource === 'colors') await prepareColorWrite(conn, data, { id: pk });
        if (resource === 'molds') await prepareMoldWrite(conn, data, { id: pk });
        if (resource === 'recipes') await applyRecipeTargetColor(conn, data);
        // Rol ataması `roleId` üzerinden yapılır; denormalize kopyalar sunucuda türetilir.
        if (resource === 'users') await deriveUserRole(conn, data, { auth: req.auth });

        let changes = 0;
        if (Object.keys(data).length) {
          const { sql, params } = updateSql(
            def,
            data,
            expected === null
              ? `WHERE \`${def.primaryKey}\` = ?`
              : `WHERE \`${def.primaryKey}\` = ? AND \`version\` = ?`,
            withVersion,
          );
          const [r] = await conn.query(sql, expected === null ? [...params, pk] : [...params, pk, expected]);
          changes = (r as any)?.affectedRows ?? 0;
          if (!changes) return 0;
          // Kritik kaynak güncellemeleri aynı transaction içinde auditlenir.
          await auditResourceInTx(conn, resource, 'update', req.params.id, req, req.body, before);
          // Renk adı değiştiyse ürünü kullanan kart JSON'ları da aynı transaction'da güncellenir.
          if (resource === 'colors') await propagateColorRename(conn, Number(pk), before, data);
        }

        const links = resource === 'products' ? await syncProductColorsFromBody(conn, Number(pk), req.body) : 0;
        return changes || links;
      });
      if (!affected) {
        // Sürüm koşulu verildiyse 404 mü 409 mu olduğunu ayırt et.
        if (expected !== null) await assertVersionMatch(def, pk, expected);
        throw new HttpError(404, 'Kayıt bulunamadı.');
      }

      await applyUserSecuritySideEffects(resource, req.params.id, data, req.body, requestToken(req));
      broadcast(resource, 'update', [req.params.id]);
      res.json({ data: { id: req.params.id, changes: affected } });
    } catch (err) {
      next(err);
    }
  });

  // ---- Tam değiştirme (Dexie put karşılığı) ----
  router.put('/:resource/:id', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;

      const id = coerce(def, def.primaryKey, req.params.id);
      const existing = await queryOne(`SELECT \`${def.primaryKey}\` FROM \`${def.table}\` WHERE \`${def.primaryKey}\` = ?`, [id]);

      const data = pickColumns(resource, def, req.body, { partial: true });
      if (def.timestamps.includes('updatedAt')) data.updatedAt = new Date();

      if (existing) {
        if (!Object.keys(data).length) throw new HttpError(400, 'Güncellenecek alan yok.');
        applyResourceRules(resource, data);
        await assertUserPasswordChange(req, resource, req.body, req.params.id);
        const withVersion = await supportsVersion(def);
        const expected = expectedVersion(req);
        if (expected !== null && !withVersion) {
          throw new HttpError(400, 'Bu kurulumda iyimser kilitleme etkin değil (version kolonu yok). `npm run db:migrate` çalıştırın.', 'MIGRATION_REQUIRED');
        }
        const affected = await withTransaction(async (conn) => {
          const before = await snapshotForAudit(conn, def, resource, id);
          await assertResourcePeriod(conn, resource, data, id, req.auth);
          if (resource === 'colors') await prepareColorWrite(conn, data, { id });
          if (resource === 'molds') await prepareMoldWrite(conn, data, { id });
          if (resource === 'recipes') await applyRecipeTargetColor(conn, data);
          // SQL, transaction içinde kesinleşen alanlardan (renk kodu, targetColorId) kurulur.
          const { sql, params } = updateSql(
            def,
            data,
            expected === null
              ? `WHERE \`${def.primaryKey}\` = ?`
              : `WHERE \`${def.primaryKey}\` = ? AND \`version\` = ?`,
            withVersion,
          );
          const [r] = await conn.query(sql, expected === null ? [...params, id] : [...params, id, expected]);
          const changes = (r as any)?.affectedRows ?? 0;
          if (!changes) return 0;
          await auditResourceInTx(conn, resource, 'update', req.params.id, req, req.body, before);
          if (resource === 'colors') await propagateColorRename(conn, Number(id), before, data);
          if (resource === 'products') await syncProductColorsFromBody(conn, Number(id), req.body);
          return changes;
        });
        if (!affected) {
          if (expected !== null) await assertVersionMatch(def, id, expected);
          throw new HttpError(404, 'Kayıt bulunamadı.');
        }
        await applyUserSecuritySideEffects(resource, req.params.id, data, req.body, requestToken(req));
        broadcast(resource, 'update', [req.params.id]);
        res.json({ data: { id: req.params.id, created: false } });
      } else {
        if (resource === 'users') {
          const strengthError = validatePasswordStrength(String(req.body?.password ?? ''));
          if (strengthError) throw new HttpError(400, `Yeni kullanıcı için parola zorunludur. ${strengthError}`, 'WEAK_PASSWORD');
        }
        const insertData = withPrimaryKey(
          def,
          { ...pickColumns(resource, def, req.body, { partial: false }), ...data },
          id
        );
        if (def.timestamps.includes('createdAt') && !insertData.createdAt) insertData.createdAt = new Date();
        applyResourceRules(resource, insertData);
        await withTransaction(async (conn) => {
          // Renk kodu transaction içinde (kilitli sayaçtan) üretilir; INSERT SQL'i bu yüzden burada kurulur.
          await assertResourcePeriod(conn, resource, insertData, undefined, req.auth);
          if (resource === 'colors') await prepareColorWrite(conn, insertData, { id });
          if (resource === 'molds') await prepareMoldWrite(conn, insertData, { id });
          if (resource === 'recipes') await applyRecipeTargetColor(conn, insertData);
          if (resource === 'users') await deriveUserRole(conn, insertData, { auth: req.auth });
          const { sql, params } = insertSql(def, insertData);
          await conn.query(sql, params);
          await auditResourceInTx(conn, resource, 'create', req.params.id, req, req.body);
          if (resource === 'products') await syncProductColorsFromBody(conn, Number(id), req.body);
        });
        if (resource === 'users' && req.body?.password) {
          await setUserPassword(Number(id), String(req.body.password));
          invalidateUserCache();
        }
        broadcast(resource, 'create', [id]);
        res.status(201).json({ data: { id, created: true } });
      }
    } catch (err) {
      next(err);
    }
  });

  // ---- Toplu ekleme / güncelleme ----
  router.post('/:resource/bulk', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;

      const body = req.body as { mode?: 'insert' | 'upsert'; rows?: any[] };
      const rows = Array.isArray(body?.rows) ? body.rows : Array.isArray(body) ? (body as any) : null;
      if (!rows || !rows.length) throw new HttpError(400, 'Toplu işlem için kayıt listesi gerekli.');
      if (resource === 'users' && body?.mode !== 'upsert') {
        throw new HttpError(400, 'Kullanıcılar toplu ekleme ile oluşturulamaz; parola gerektirir.', 'PASSWORD_REQUIRED');
      }

      const ids = await withTransaction(async (conn) => {
        const created: any[] = [];
        for (const row of rows) {
          const pk = row?.[def.primaryKey];
          const data = withPrimaryKey(def, pickColumns(resource, def, row, { partial: false }), pk);
          if (def.timestamps.includes('createdAt') && !data.createdAt) data.createdAt = new Date();
          if (def.timestamps.includes('updatedAt') && !data.updatedAt) data.updatedAt = new Date();
          applyResourceRules(resource, data);

          if (resource === 'users') await deriveUserRole(conn, data, { auth: req.auth });
          if (body?.mode === 'upsert' && pk !== undefined && pk !== null && pk !== '') {
            // UPDATE dalında türetilmiş/bakiye kolonları (balance, stock, ...) soyulur:
            // bunlar yalnızca kontrollü op'larda satır kilidi + hareket/muhasebe kaydıyla
            // güncellenebilir. INSERT (açılış değeri) için `data` türetilmiş kolonları korur.
            const updateData = pickColumns(resource, def, row, { partial: true });
            await assertResourcePeriod(conn, resource, updateData, pk, req.auth);
            const keys = Object.keys(updateData).filter((k) => k !== def.primaryKey);
            if (keys.length) {
              if (resource === 'colors') await prepareColorWrite(conn, updateData, { id: pk });
              if (resource === 'molds') await prepareMoldWrite(conn, updateData, { id: pk });
              if (resource === 'recipes') await applyRecipeTargetColor(conn, updateData);
              if (resource === 'users') await deriveUserRole(conn, updateData, { auth: req.auth });
              const { sql, params } = updateSql(
                def,
                updateData,
                `WHERE \`${def.primaryKey}\` = ?`,
                await supportsVersion(def),
              );
              const [r] = await conn.query(sql, [...params, coerce(def, def.primaryKey, pk)]);
              if ((r as any).affectedRows) {
                created.push(pk);
                if (resource === 'products') await syncProductColorsFromBody(conn, Number(pk), row);
                continue;
              }
            }
          }
          if (resource === 'colors') await prepareColorWrite(conn, data, { id: data[def.primaryKey] ?? null });
          if (resource === 'molds') await prepareMoldWrite(conn, data, { id: data[def.primaryKey] ?? null });
          if (resource === 'recipes') await applyRecipeTargetColor(conn, data);
          await assertResourcePeriod(conn, resource, data, undefined, req.auth);
          const { sql, params } = insertSql(def, data);
          const [r] = await conn.query(sql, params);
          const newId = data[def.primaryKey] ?? (r as any).insertId;
          created.push(newId);
          if (resource === 'products' && newId) await syncProductColorsFromBody(conn, Number(newId), row);
        }
        // Kritik kaynakların toplu yazımları tek özet kayıt olarak auditlenir.
        if (AUDITED_RESOURCES[resource]) {
          await writeAuditInTx(
            conn,
            {
              action: body?.mode === 'upsert' ? 'update' : 'create',
              module: AUDITED_RESOURCES[resource].module,
              description: `${AUDITED_RESOURCES[resource].label} toplu ${body?.mode === 'upsert' ? 'güncelleme' : 'ekleme'}: ${created.length} kayıt`,
              details: `ID'ler: ${created.slice(0, 50).join(', ')}`.slice(0, 1000),
            },
            { auth: req.auth, ip: clientIp(req) },
          );
        }
        return created;
      });

      if (resource === 'users' || resource === 'roles') invalidateUserCache();
      broadcast(resource, 'create', ids);
      res.status(201).json({ data: ids, ids });
    } catch (err) {
      next(err);
    }
  });

  // ---- Silme önizlemesi: kademe, birlikte silinecekler, uyarılar, blokaj ----
  router.get('/:resource/delete-plan/:id', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;
      const id = coerce(def, def.primaryKey, req.params.id);
      const { plan } = await withTransaction(async (conn) =>
        planDelete(conn, deleteEffects, resource, def.table, def.primaryKey, id),
      );
      res.json({ data: plan });
    } catch (err) {
      next(err);
    }
  });

  // ---- Sil ----
  router.delete('/:resource/:id', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;
      const id = coerce(def, def.primaryKey, req.params.id);

      const result = await withTransaction(async (conn) =>
        executeDelete(conn, deleteEffects, resource, def.table, def.primaryKey, id, deleteContext(req)),
      );

      if (resource === 'roles') invalidateUserCache();
      if (resource === 'users') {
        invalidateUserCache(Number(id));
        destroyUserSessions(Number(id));
      }

      broadcast(resource, 'delete', [req.params.id]);
      if (result.touchedProducts.length) {
        broadcast('products', 'update', result.touchedProducts.map(String));
        broadcast('inventoryLogs', 'update', []);
      }
      // Silme cari/kasa/banka bakiyesini ve muhasebeyi de etkiler.
      for (const related of ['contacts', 'cashBoxes', 'bankAccounts', 'transactions', 'journalEntries', 'orders', 'waybills']) {
        if (related !== resource) broadcast(related, 'update', []);
      }

      res.json({ data: { id: req.params.id, deleted: result.deleted, plan: result.plan } });
    } catch (err) {
      next(err);
    }
  });

  // ---- Toplu sil ----
  router.post('/:resource/bulk-delete', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;

      const ids: any[] = req.body?.ids || [];
      if (!ids.length) throw new HttpError(400, 'Silinecek kayıt yok.');
      const ctx = deleteContext(req);

      const deletedIds: string[] = [];
      const touchedProducts = new Set<number>();
      const deletedCount = await withTransaction(async (conn) => {
        let changes = 0;
        for (const rawId of ids) {
          const id = coerce(def, def.primaryKey, rawId);
          const r = await executeDelete(conn, deleteEffects, resource, def.table, def.primaryKey, id, ctx);
          changes += r.deleted;
          deletedIds.push(String(id));
          for (const pid of r.touchedProducts) touchedProducts.add(pid);
        }
        return changes;
      });

      if (resource === 'users' || resource === 'roles') invalidateUserCache();
      if (resource === 'users') for (const id of ids) destroyUserSessions(Number(id));

      broadcast(resource, 'delete', deletedIds);
      if (touchedProducts.size) {
        broadcast('products', 'update', [...touchedProducts].map(String));
        broadcast('inventoryLogs', 'update', []);
      }
      res.json({ data: { deleted: deletedCount } });
    } catch (err) {
      next(err);
    }
  });

  // ---- Koşullu toplu silme ----
  router.post('/:resource/delete-where', resourceAccess, async (req, res, next) => {
    try {
      const resource = req.params.resource;
      const def = getDef(resource)!;

      const where = buildWhere(def, resource, req.body?.where || {});
      if (!where.sql) throw new HttpError(400, 'Koşulsuz silme engellendi. Filtre gerekli.');
      const ctx = deleteContext(req);

      const deletedIds: string[] = [];
      const touchedProducts = new Set<number>();
      const deleted = await withTransaction(async (conn) => {
        const idRows = await conn.query<any[]>(
          `SELECT \`${def.primaryKey}\` AS \`__id\` FROM \`${def.table}\` ${where.sql}`,
          where.params,
        );
        let changes = 0;
        for (const row of (idRows[0] as any[]) || []) {
          const r = await executeDelete(conn, deleteEffects, resource, def.table, def.primaryKey, row.__id, ctx);
          changes += r.deleted;
          deletedIds.push(String(row.__id));
          for (const pid of r.touchedProducts) touchedProducts.add(pid);
        }
        return changes;
      });

      broadcast(resource, 'delete', deletedIds);
      if (touchedProducts.size) {
        broadcast('products', 'update', [...touchedProducts].map(String));
        broadcast('inventoryLogs', 'update', []);
      }
      res.json({ data: { deleted } });
    } catch (err) {
      next(err);
    }
  });

  // Kaynağı tamamen boşaltır (fabrika sıfırlama / yedek geri yükleme).
  // FK kısıtları geçici olarak devre dışı bırakılır; bağlantı havuza dönerken geri açılır.
  router.post(
    '/:resource/clear',
    resourceAccess,
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        const resource = req.params.resource;
        const def = getDef(resource)!;

        const deleted = await withTransaction(async (conn) => {
          await conn.query('SET FOREIGN_KEY_CHECKS = 0');
          try {
            const [result] = await conn.query(`DELETE FROM \`${def.table}\``);
            return (result as any)?.affectedRows ?? 0;
          } finally {
            await conn.query('SET FOREIGN_KEY_CHECKS = 1');
          }
        });

        await writeAudit(
          {
            action: 'delete',
            module: 'system',
            description: `Tablo tamamen boşaltıldı: ${resource}`,
            details: `Silinen kayıt: ${deleted}`,
          },
          { auth: req.auth, ip: clientIp(req) },
        );

        broadcast(resource, 'delete', []);
        res.json({ data: { deleted } });
      } catch (err) {
        next(err);
      }
    },
  );

  // ---- Hata yönetimi ----
  router.use((err: any, _req: Request, res: Response, _next: any) => {
    const status = typeof err?.status === 'number' ? err.status : 500;
    // 5xx: iç hata detayları (DB, yığın izi) istemciye sızmamalı; sunucu tarafında loglanır.
    if (status >= 500) {
      console.error('[API]', err);
      res.status(status).json({ error: 'Sunucu hatası oluştu. Lütfen tekrar deneyin.' });
      return;
    }
    // 4xx: kontrollü iş kuralı hataları (OpError/HttpError) — mesaj ve kod güvenli.
    res.status(status).json({
      error: err?.message || 'İstek işlenemedi.',
      code: err?.code,
    });
  });

  return router;
}

/* ------------------------------------------------------------------ */
/* Kullanıcı güvenliği yan etkileri                                    */
/* ------------------------------------------------------------------ */

/**
 * Kullanıcı kaydındaki parola / durum / rol değişikliklerinde oturumları
 * ve yetki önbelleğini tutarlı tutar.
 */
async function applyUserSecuritySideEffects(
  resource: string,
  rawId: string,
  data: Record<string, any>,
  body: any,
  currentToken?: string | null,
): Promise<void> {
  if (resource !== 'users') {
    if (resource === 'roles') invalidateUserCache();
    return;
  }
  const userId = Number(rawId);
  if (!Number.isFinite(userId)) return;

  if (body?.password) {
    await setUserPassword(userId, String(body.password));
    // Kullanıcının diğer cihazlardaki oturumları kapatılır; işlemi yapan
    // yönetici kendi oturumunu kaybetmez.
    destroyUserSessions(userId, currentToken ?? undefined);
  }

  // Pasife alınan/askıya alınan kullanıcının açık oturumları kapatılır.
  if (data.status && data.status !== 'active') {
    destroyUserSessions(userId);
  }

  invalidateUserCache(userId);
}

/**
 * Kullanıcı kaydındaki `password` alanını doğrular.
 * Kişi kendi parolasını değiştiriyorsa mevcut parolasını da girmek zorundadır;
 * başka bir kullanıcının parolasını yalnızca `users:edit` yetkisi olan değiştirebilir.
 * Parola değeri hiçbir zaman doğrudan kolona yazılmaz (pickColumns atlar).
 */
async function assertUserPasswordChange(
  req: Request,
  resource: string,
  body: any,
  rawId: unknown,
): Promise<void> {
  if (resource !== 'users' || !body?.password) return;

  const strengthError = validatePasswordStrength(String(body.password));
  if (strengthError) throw new HttpError(400, strengthError, 'WEAK_PASSWORD');

  const auth = req.auth!;
  const targetId = Number(rawId);

  if (targetId === auth.user.id) {
    const row = await queryOne<any>('SELECT `passwordHash`, `passwordSalt` FROM `users` WHERE `id` = ? LIMIT 1', [auth.user.id]);
    if (!row?.passwordHash || !row?.passwordSalt) {
      throw new HttpError(400, 'Hesabınızda tanımlı bir parola bulunamadı.', 'NO_PASSWORD');
    }
    const { valid } = await verifyPassword(String(body?.currentPassword ?? ''), String(row.passwordSalt), String(row.passwordHash));
    if (!valid) {
      throw new HttpError(400, 'Kendi parolanızı değiştirmek için mevcut parolanızı doğru girmelisiniz.', 'INVALID_CURRENT_PASSWORD');
    }
    return;
  }

  if (!can(auth.role, 'users', 'edit')) {
    throw new HttpError(403, 'Başka bir kullanıcının parolasını değiştirme yetkiniz yok.', 'FORBIDDEN');
  }
}
