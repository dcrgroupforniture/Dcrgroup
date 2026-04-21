// tests/unit_multitenant.test.js
// Unit tests for multi-tenant role/permission logic.
// Pure functions only — no Firebase dependencies.

import test from 'node:test';
import assert from 'node:assert/strict';

// ─── Inline the pure logic from roleService.js ────────────────────────────
// We replicate the pure logic here to avoid ES module CDN imports in tests.

const ROLES = Object.freeze({
  ADMIN:      'admin',
  MANAGER:    'manager',
  AGENTE:     'agente',
  MAGAZZINO:  'magazzino',
  CONTABILE:  'contabile',
});

const MODULES = Object.freeze({
  CLIENTS:    'clients',
  ORDERS:     'orders',
  INCASSI:    'incassi',
  EXPENSES:   'expenses',
  MAGAZZINO:  'magazzino',
  FATTURE:    'fatture',
  ANALYTICS:  'analytics',
  SETTINGS:   'settings',
  USERS:      'users',
});

const ACTIONS = Object.freeze({
  READ:   'read',
  WRITE:  'write',
  DELETE: 'delete',
  EXPORT: 'export',
});

const PERMISSIONS = {
  admin: {
    clients:   new Set(['read','write','delete','export']),
    orders:    new Set(['read','write','delete','export']),
    incassi:   new Set(['read','write','delete','export']),
    expenses:  new Set(['read','write','delete','export']),
    scadenze:  new Set(['read','write','delete','export']),
    suppliers: new Set(['read','write','delete','export']),
    magazzino: new Set(['read','write','delete','export']),
    fatture:   new Set(['read','write','delete','export']),
    listini:   new Set(['read','write','delete','export']),
    crm:       new Set(['read','write','delete','export']),
    analytics: new Set(['read','write','delete','export']),
    settings:  new Set(['read','write','delete','export']),
    users:     new Set(['read','write','delete','export']),
    backup:    new Set(['read','write','delete','export']),
    audit:     new Set(['read','write','delete','export']),
  },
  manager: {
    clients:   new Set(['read','write','export']),
    orders:    new Set(['read','write','delete','export']),
    incassi:   new Set(['read','write','export']),
    expenses:  new Set(['read','write','export']),
    scadenze:  new Set(['read','write','export']),
    suppliers: new Set(['read','write','export']),
    magazzino: new Set(['read','write','export']),
    fatture:   new Set(['read','write','export']),
    listini:   new Set(['read','write','export']),
    crm:       new Set(['read','write','export']),
    analytics: new Set(['read','export']),
    settings:  new Set(['read']),
    users:     new Set(['read']),
    backup:    new Set(['read','export']),
    audit:     new Set(['read']),
  },
  agente: {
    clients:   new Set(['read','write']),
    orders:    new Set(['read','write']),
    incassi:   new Set(['read']),
    listini:   new Set(['read']),
    crm:       new Set(['read','write']),
    analytics: new Set(['read']),
  },
  magazzino: {
    clients:   new Set(['read']),
    orders:    new Set(['read']),
    suppliers: new Set(['read']),
    magazzino: new Set(['read','write']),
    listini:   new Set(['read']),
  },
  contabile: {
    clients:   new Set(['read','export']),
    orders:    new Set(['read','export']),
    incassi:   new Set(['read','write','export']),
    expenses:  new Set(['read','write','export']),
    scadenze:  new Set(['read','write','export']),
    fatture:   new Set(['read','write','export']),
    analytics: new Set(['read','export']),
    audit:     new Set(['read']),
  },
};

function hasPermission(role, module, action) {
  if (!role || !module || !action) return false;
  const rp = PERMISSIONS[role];
  if (!rp) return false;
  const mp = rp[module];
  if (!mp) return false;
  return mp.has(action);
}

const ROLE_RANK = { admin: 0, manager: 1, contabile: 2, agente: 3, magazzino: 4 };
function outranks(a, b) {
  return (ROLE_RANK[a] ?? 99) <= (ROLE_RANK[b] ?? 99);
}

// ─── Tenant utility (pure, no Firebase) ───────────────────────────────────

const DEFAULT_TENANT_ID = 'default_company';

function resolveTenantId(profile) {
  if (!profile || typeof profile !== 'object') return DEFAULT_TENANT_ID;
  return String(profile.companyId || DEFAULT_TENANT_ID);
}

function injectCompanyId(data, companyId) {
  if (!companyId) return data;
  if (data && data.companyId) return data; // Never overwrite.
  return { ...data, companyId };
}

// ─── Tests: role permissions ───────────────────────────────────────────────

test('admin can do everything', () => {
  assert.ok(hasPermission('admin', 'clients', 'delete'));
  assert.ok(hasPermission('admin', 'settings', 'write'));
  assert.ok(hasPermission('admin', 'users', 'delete'));
  assert.ok(hasPermission('admin', 'fatture', 'export'));
});

test('agente cannot delete clients', () => {
  assert.equal(hasPermission('agente', 'clients', 'delete'), false);
});

test('agente cannot access settings', () => {
  assert.equal(hasPermission('agente', 'settings', 'read'), false);
  assert.equal(hasPermission('agente', 'settings', 'write'), false);
});

test('agente cannot write incassi', () => {
  assert.equal(hasPermission('agente', 'incassi', 'write'), false);
});

test('magazzino cannot access financial modules', () => {
  assert.equal(hasPermission('magazzino', 'incassi', 'read'), false);
  assert.equal(hasPermission('magazzino', 'fatture', 'read'), false);
  assert.equal(hasPermission('magazzino', 'expenses', 'read'), false);
});

test('contabile can read and export orders but not delete', () => {
  assert.ok(hasPermission('contabile', 'orders', 'read'));
  assert.ok(hasPermission('contabile', 'orders', 'export'));
  assert.equal(hasPermission('contabile', 'orders', 'delete'), false);
  assert.equal(hasPermission('contabile', 'orders', 'write'), false);
});

test('manager cannot delete users', () => {
  assert.equal(hasPermission('manager', 'users', 'delete'), false);
  assert.ok(hasPermission('manager', 'users', 'read'));
});

test('unknown role has no permissions', () => {
  assert.equal(hasPermission('superuser', 'clients', 'read'), false);
  assert.equal(hasPermission('', 'clients', 'read'), false);
  assert.equal(hasPermission(null, 'clients', 'read'), false);
});

test('hasPermission with undefined args returns false', () => {
  assert.equal(hasPermission(undefined, undefined, undefined), false);
  assert.equal(hasPermission('admin', undefined, 'read'), false);
  assert.equal(hasPermission('admin', 'clients', undefined), false);
});

// ─── Tests: role hierarchy ─────────────────────────────────────────────────

test('outranks: admin > manager > contabile > agente > magazzino', () => {
  assert.ok(outranks('admin', 'manager'));
  assert.ok(outranks('admin', 'agente'));
  assert.ok(outranks('manager', 'contabile'));
  assert.ok(outranks('contabile', 'agente'));
  assert.ok(outranks('agente', 'magazzino'));
  assert.equal(outranks('magazzino', 'admin'), false);
  assert.equal(outranks('agente', 'admin'), false);
});

test('outranks: same role outranks itself', () => {
  assert.ok(outranks('admin', 'admin'));
  assert.ok(outranks('agente', 'agente'));
});

// ─── Tests: tenant utilities ───────────────────────────────────────────────

test('resolveTenantId: uses profile.companyId when present', () => {
  assert.equal(resolveTenantId({ companyId: 'acme_corp', role: 'admin' }), 'acme_corp');
});

test('resolveTenantId: defaults to default_company when missing', () => {
  assert.equal(resolveTenantId({}), 'default_company');
  assert.equal(resolveTenantId(null), 'default_company');
  assert.equal(resolveTenantId(undefined), 'default_company');
});

test('injectCompanyId: adds companyId to data without one', () => {
  const data = { name: 'Test', amount: 100 };
  const result = injectCompanyId(data, 'acme');
  assert.equal(result.companyId, 'acme');
  assert.equal(result.name, 'Test');
});

test('injectCompanyId: never overwrites existing companyId', () => {
  const data = { name: 'Test', companyId: 'original' };
  const result = injectCompanyId(data, 'different');
  assert.equal(result.companyId, 'original');
});

test('injectCompanyId: noop when no companyId provided', () => {
  const data = { name: 'Test' };
  const result = injectCompanyId(data, null);
  assert.equal(result, data); // Same reference.
});

test('injectCompanyId: does not mutate original object', () => {
  const data = { name: 'Test' };
  const result = injectCompanyId(data, 'acme');
  assert.equal(data.companyId, undefined); // Original untouched.
  assert.equal(result.companyId, 'acme');
});

// ─── Tests: migration logic helpers ───────────────────────────────────────

function docsNeedingMigration(docs) {
  return docs.filter(d => !d.companyId);
}

function applyMigration(docs, companyId) {
  return docs.map(d => d.companyId ? d : { ...d, companyId, _migratedAt: 'now' });
}

test('migration: identifies docs without companyId', () => {
  const docs = [
    { id: '1', name: 'a' },
    { id: '2', name: 'b', companyId: 'existing' },
    { id: '3', name: 'c' },
  ];
  const needs = docsNeedingMigration(docs);
  assert.equal(needs.length, 2);
  assert.deepEqual(needs.map(d => d.id), ['1', '3']);
});

test('migration: apply adds companyId only to docs that need it', () => {
  const docs = [
    { id: '1', name: 'a' },
    { id: '2', name: 'b', companyId: 'other' },
  ];
  const migrated = applyMigration(docs, 'default_company');
  assert.equal(migrated[0].companyId, 'default_company');
  assert.equal(migrated[1].companyId, 'other'); // Preserved.
  assert.equal(migrated[0]._migratedAt, 'now');
  assert.equal(migrated[1]._migratedAt, undefined); // Not touched.
});

test('migration: 100% coverage when all docs have companyId', () => {
  const docs = [
    { id: '1', companyId: 'x' },
    { id: '2', companyId: 'x' },
  ];
  assert.equal(docsNeedingMigration(docs).length, 0);
});

// ─── Tests: validation logic ───────────────────────────────────────────────

function computeCoverage(docs) {
  const total = docs.length;
  if (total === 0) return 100;
  const withId = docs.filter(d => !!d.companyId).length;
  return Math.round((withId / total) * 100);
}

function detectOrphanOrders(clients, orders) {
  const clientIds = new Set(clients.map(c => c.id));
  return orders.filter(o => o.clientId && !clientIds.has(o.clientId));
}

test('computeCoverage: 100% when all docs have companyId', () => {
  const docs = [{ companyId: 'x' }, { companyId: 'y' }];
  assert.equal(computeCoverage(docs), 100);
});

test('computeCoverage: 50% when half docs have companyId', () => {
  const docs = [{ companyId: 'x' }, {}, { companyId: 'x' }, {}];
  assert.equal(computeCoverage(docs), 50);
});

test('computeCoverage: 100% for empty collection', () => {
  assert.equal(computeCoverage([]), 100);
});

test('detectOrphanOrders: finds orders with missing clientId', () => {
  const clients = [{ id: 'c1' }, { id: 'c2' }];
  const orders = [
    { id: 'o1', clientId: 'c1' },
    { id: 'o2', clientId: 'missing' },
    { id: 'o3', clientId: '' },   // Empty clientId — not an orphan (just unlinked).
  ];
  const orphans = detectOrphanOrders(clients, orders);
  assert.equal(orphans.length, 1);
  assert.equal(orphans[0].id, 'o2');
});

test('detectOrphanOrders: returns empty array when all orders are valid', () => {
  const clients = [{ id: 'c1' }];
  const orders = [{ id: 'o1', clientId: 'c1' }];
  assert.equal(detectOrphanOrders(clients, orders).length, 0);
});

// ─── Auto-scoped query registry tests ─────────────────────────────────────
// Test the scopedAll behaviour without Firebase using a mock firestoreService.

function makeMockFs(activeCompanyId = null) {
  const calls = [];
  return {
    calls,
    getActiveCompanyId: () => activeCompanyId,
    col: (name) => ({ _col: name }),
    query: (colRef, ...clauses) => ({ _col: colRef._col, _clauses: clauses }),
    where: (field, op, value) => ({ _where: { field, op, value } }),
  };
}

function scopedAll(colName, mockFs) {
  return () => {
    const cid = mockFs.getActiveCompanyId();
    if (cid) return mockFs.query(mockFs.col(colName), mockFs.where('companyId', '==', cid));
    return mockFs.query(mockFs.col(colName));
  };
}

function forCompany(companyId, mockFs, colName) {
  if (!companyId) return scopedAll(colName, mockFs);
  return () => mockFs.query(mockFs.col(colName), mockFs.where('companyId', '==', companyId));
}

test('scopedAll: unscoped when no active company', () => {
  const mockFs = makeMockFs(null);
  const q = scopedAll('orders', mockFs)();
  assert.equal(q._col, 'orders');
  assert.equal(q._clauses.length, 0);
});

test('scopedAll: scoped to active company when context is set', () => {
  const mockFs = makeMockFs('acme_corp');
  const q = scopedAll('orders', mockFs)();
  assert.equal(q._col, 'orders');
  assert.equal(q._clauses.length, 1);
  assert.deepEqual(q._clauses[0]._where, { field: 'companyId', op: '==', value: 'acme_corp' });
});

test('scopedAll: different calls with same factory reflect current active company', () => {
  let activeCid = null;
  const mockFs = {
    getActiveCompanyId: () => activeCid,
    col: (n) => ({ _col: n }),
    query: (c, ...cl) => ({ _col: c._col, _clauses: cl }),
    where: (f, o, v) => ({ _where: { field: f, op: o, value: v } }),
  };
  const factory = scopedAll('clients', mockFs);

  // Before auth: unscoped
  const q1 = factory();
  assert.equal(q1._clauses.length, 0);

  // After auth (tenant context set): auto-scoped
  activeCid = 'beta_srl';
  const q2 = factory();
  assert.equal(q2._clauses.length, 1);
  assert.equal(q2._clauses[0]._where.value, 'beta_srl');
});

test('forCompany: explicit companyId overrides active context', () => {
  const mockFs = makeMockFs('active_company');
  const q = forCompany('other_company', mockFs, 'invoices')();
  assert.equal(q._col, 'invoices');
  assert.equal(q._clauses.length, 1);
  assert.equal(q._clauses[0]._where.value, 'other_company');
});

test('forCompany: null companyId falls back to scopedAll', () => {
  const mockFs = makeMockFs('active_co');
  const q = forCompany(null, mockFs, 'suppliers')();
  assert.equal(q._col, 'suppliers');
  // Since active_co is set, scopedAll still scopes it
  assert.equal(q._clauses.length, 1);
  assert.equal(q._clauses[0]._where.value, 'active_co');
});

test('scopedAll: works for all 13 core collection names', () => {
  const cols = [
    'clients','orders','incassi','expenses','scadenze','suppliers',
    'payments','priceRequests','trattative','offerte','fatture',
    'pagamenti','crmAttivita',
  ];
  const mockFs = makeMockFs('tenant_x');
  for (const col of cols) {
    const q = scopedAll(col, mockFs)();
    assert.equal(q._col, col, `scopedAll failed for collection: ${col}`);
    assert.equal(q._clauses.length, 1, `scopedAll missing clause for: ${col}`);
    assert.equal(q._clauses[0]._where.value, 'tenant_x');
  }
});

// ─── Phase 3: Page guard RBAC tests ──────────────────────────────────────
// Replicate PAGE_MODULE_MAP logic to test access control decisions.

const TEST_PAGE_MODULE_MAP = {
  'clients.html':     'clients',
  'ordini-clienti.html': 'orders',
  'incassi.html':     'incassi',
  'spese.html':       'expenses',
  'scadenze.html':    'scadenze',
  'suppliers.html':   'suppliers',
  'listini.html':     'listini',
  'crm.html':         'crm',
  'fatture.html':     'fatture',
  'analytics.html':   'analytics',
  'audit-log.html':   'audit',
  'companies.html':   'users',
  'admin-portale.html': 'settings',
};

function canAccessPage(role, pageName, map) {
  const module = map[pageName];
  if (!module) return true; // unmapped pages are open
  return hasPermission(role, module, 'read');
}

test('page guard: admin can access all mapped pages', () => {
  for (const page of Object.keys(TEST_PAGE_MODULE_MAP)) {
    assert.ok(canAccessPage('admin', page, TEST_PAGE_MODULE_MAP), `admin blocked from ${page}`);
  }
});

test('page guard: agente blocked from fatture page', () => {
  assert.equal(canAccessPage('agente', 'fatture.html', TEST_PAGE_MODULE_MAP), false);
});

test('page guard: agente blocked from spese page', () => {
  assert.equal(canAccessPage('agente', 'spese.html', TEST_PAGE_MODULE_MAP), false);
});

test('page guard: agente can access analytics page', () => {
  // agente has READ on analytics per PERMISSIONS
  assert.equal(canAccessPage('agente', 'analytics.html', TEST_PAGE_MODULE_MAP), true);
});

test('page guard: agente can access clients page', () => {
  assert.equal(canAccessPage('agente', 'clients.html', TEST_PAGE_MODULE_MAP), true);
});

test('page guard: agente blocked from audit-log page', () => {
  assert.equal(canAccessPage('agente', 'audit-log.html', TEST_PAGE_MODULE_MAP), false);
});

test('page guard: magazzino blocked from incassi page', () => {
  assert.equal(canAccessPage('magazzino', 'incassi.html', TEST_PAGE_MODULE_MAP), false);
});

test('page guard: magazzino can access suppliers page', () => {
  assert.equal(canAccessPage('magazzino', 'suppliers.html', TEST_PAGE_MODULE_MAP), true);
});

test('page guard: contabile can access fatture page', () => {
  assert.equal(canAccessPage('contabile', 'fatture.html', TEST_PAGE_MODULE_MAP), true);
});

test('page guard: contabile blocked from companies page (users module)', () => {
  assert.equal(canAccessPage('contabile', 'companies.html', TEST_PAGE_MODULE_MAP), false);
});

test('page guard: unmapped pages are open to all roles', () => {
  const unmapped = 'index.html';
  assert.equal(canAccessPage('magazzino', unmapped, TEST_PAGE_MODULE_MAP), true);
  assert.equal(canAccessPage('agente', unmapped, TEST_PAGE_MODULE_MAP), true);
});

// ─── Phase 3: auditService pure logic tests ────────────────────────────────

// Replicate pure functions from auditService without Firestore imports

function auditNormaliseAction(action) {
  const a = String(action || '').toLowerCase();
  if (a === 'add' || a === 'create')  return 'add';
  if (a === 'set' || a === 'upsert')  return 'set';
  if (a === 'update' || a === 'edit') return 'update';
  if (a === 'remove' || a === 'delete' || a === 'soft_delete')
    return a === 'soft_delete' ? 'soft_delete' : 'delete';
  return a;
}

function auditSafePayload(data) {
  if (!data || typeof data !== 'object') return null;
  const MAX_STRING = 200;
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      out[k] = v.length > MAX_STRING ? v.slice(0, MAX_STRING) + '…' : v;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (typeof v === 'object') {
      out[k] = '[object]';
    }
  }
  return Object.keys(out).length ? out : null;
}

test('auditService: normaliseAction maps common verbs', () => {
  assert.equal(auditNormaliseAction('add'),    'add');
  assert.equal(auditNormaliseAction('create'), 'add');
  assert.equal(auditNormaliseAction('set'),    'set');
  assert.equal(auditNormaliseAction('upsert'), 'set');
  assert.equal(auditNormaliseAction('update'), 'update');
  assert.equal(auditNormaliseAction('edit'),   'update');
  assert.equal(auditNormaliseAction('remove'), 'delete');
  assert.equal(auditNormaliseAction('delete'), 'delete');
  assert.equal(auditNormaliseAction('soft_delete'), 'soft_delete');
});

test('auditService: safePayload truncates long strings', () => {
  const long = 'x'.repeat(300);
  const result = auditSafePayload({ name: long, amount: 42 });
  assert.equal(result.name.length, 201); // 200 chars + '…'
  assert.ok(result.name.endsWith('…'));
  assert.equal(result.amount, 42);
});

test('auditService: safePayload strips null/undefined values', () => {
  const result = auditSafePayload({ a: null, b: undefined, c: 'ok' });
  assert.ok(!('a' in result));
  assert.ok(!('b' in result));
  assert.equal(result.c, 'ok');
});

test('auditService: safePayload returns null for non-objects', () => {
  assert.equal(auditSafePayload(null), null);
  assert.equal(auditSafePayload('string'), null);
  assert.equal(auditSafePayload(42), null);
});

test('auditService: safePayload marks nested objects as [object]', () => {
  const result = auditSafePayload({ meta: { key: 'val' } });
  assert.equal(result.meta, '[object]');
});

test('auditService: safePayload preserves booleans', () => {
  const result = auditSafePayload({ active: true, deleted: false });
  assert.equal(result.active, true);
  assert.equal(result.deleted, false);
});

// ─── Phase 4: notificationService pure logic tests ──────────────────────────

// Replicate pure functions from notificationService (no Firestore)

function addDays(days, baseISO) {
  const d = baseISO ? new Date(baseISO + 'T00:00:00') : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function filterUpcomingDeadlines(deadlines, days, todayISO) {
  const today = todayISO || new Date().toISOString().slice(0, 10);
  const limit = addDays(days, today);
  return (deadlines || []).filter(d =>
    !d.isDeleted && !d.pagata && d.dateISO >= today && d.dateISO <= limit && (d.amount || 0) > 0
  );
}

function filterOverdueDeadlines(deadlines, todayISO) {
  const today = todayISO || new Date().toISOString().slice(0, 10);
  return (deadlines || []).filter(d =>
    !d.isDeleted && !d.pagata && d.dateISO < today && (d.amount || 0) > 0
  );
}

function filterOverdueFatture(fatture, todayISO) {
  const today = todayISO || new Date().toISOString().slice(0, 10);
  return (fatture || []).filter(f =>
    f.dataScadenza && f.dataScadenza < today &&
    !['pagata','annullata','bozza'].includes(f.stato) &&
    (Number(f.totale || 0) - Number(f.totalePagato || 0)) > 0
  );
}

function filterPendingSolleciti(solleciti) {
  return (solleciti || []).filter(s => s.stato !== 'inviato' && s.stato !== 'annullato');
}

function buildNotifications({ deadlines = [], fatture = [], solleciti = [], upcomingDays = 7, todayISO } = {}) {
  const today = todayISO || new Date().toISOString().slice(0, 10);
  const notifications = [];

  const upcoming = filterUpcomingDeadlines(deadlines, upcomingDays, today);
  if (upcoming.length > 0) notifications.push({ id: 'scadenze_upcoming', type: 'scadenza', severity: 'warning' });

  const overdue = filterOverdueDeadlines(deadlines, today);
  if (overdue.length > 0) notifications.push({ id: 'scadenze_overdue', type: 'scadenza', severity: 'danger' });

  const overdueFatt = filterOverdueFatture(fatture, today);
  if (overdueFatt.length > 0) notifications.push({ id: 'fatture_overdue', type: 'fattura', severity: 'danger' });

  const pending = filterPendingSolleciti(solleciti);
  if (pending.length > 0) notifications.push({ id: 'solleciti_pending', type: 'sollecito', severity: 'warning' });

  return { notifications, count: notifications.length };
}

const TODAY = '2026-04-21';

test('notificationService: addDays adds days correctly', () => {
  assert.equal(addDays(7,  '2026-04-21'), '2026-04-28');
  assert.equal(addDays(0,  '2026-04-21'), '2026-04-21');
  assert.equal(addDays(-1, '2026-04-21'), '2026-04-20');
});

test('notificationService: filterUpcomingDeadlines returns deadlines within window', () => {
  const ds = [
    { dateISO: '2026-04-22', amount: 100, pagata: false, isDeleted: false },
    { dateISO: '2026-04-28', amount: 200, pagata: false, isDeleted: false },
    { dateISO: '2026-04-29', amount: 50,  pagata: false, isDeleted: false }, // outside 7d
    { dateISO: '2026-04-20', amount: 100, pagata: false, isDeleted: false }, // past
    { dateISO: '2026-04-23', amount: 0,   pagata: false, isDeleted: false }, // zero amount
    { dateISO: '2026-04-23', amount: 100, pagata: true,  isDeleted: false }, // paid
  ];
  const result = filterUpcomingDeadlines(ds, 7, TODAY);
  assert.equal(result.length, 2);
  assert.ok(result.every(d => d.dateISO <= '2026-04-28'));
});

test('notificationService: filterOverdueDeadlines returns only past unpaid', () => {
  const ds = [
    { dateISO: '2026-04-20', amount: 100, pagata: false, isDeleted: false },
    { dateISO: '2026-04-21', amount: 100, pagata: false, isDeleted: false }, // today = not overdue
    { dateISO: '2026-04-19', amount: 100, pagata: true,  isDeleted: false }, // paid
    { dateISO: '2026-04-18', amount: 100, pagata: false, isDeleted: true  }, // deleted
  ];
  const result = filterOverdueDeadlines(ds, TODAY);
  assert.equal(result.length, 1);
  assert.equal(result[0].dateISO, '2026-04-20');
});

test('notificationService: filterOverdueFatture excludes paid/bozza/annullata', () => {
  const fatture = [
    { dataScadenza: '2026-04-20', stato: 'emessa',   totale: 500, totalePagato: 0 },
    { dataScadenza: '2026-04-20', stato: 'pagata',   totale: 500, totalePagato: 500 },
    { dataScadenza: '2026-04-20', stato: 'bozza',    totale: 100, totalePagato: 0 },
    { dataScadenza: '2026-04-20', stato: 'annullata', totale: 100, totalePagato: 0 },
    { dataScadenza: '2026-04-22', stato: 'emessa',   totale: 100, totalePagato: 0 }, // future
  ];
  const result = filterOverdueFatture(fatture, TODAY);
  assert.equal(result.length, 1);
  assert.equal(result[0].stato, 'emessa');
});

test('notificationService: filterOverdueFatture includes partially paid', () => {
  const fatture = [
    { dataScadenza: '2026-04-20', stato: 'emessa', totale: 500, totalePagato: 200 },
  ];
  const result = filterOverdueFatture(fatture, TODAY);
  assert.equal(result.length, 1);
});

test('notificationService: filterPendingSolleciti excludes inviato/annullato', () => {
  const solleciti = [
    { stato: 'bozza' },
    { stato: 'inviato' },
    { stato: 'annullato' },
    { stato: 'da_inviare' },
    {},
  ];
  const result = filterPendingSolleciti(solleciti);
  assert.equal(result.length, 3); // bozza, da_inviare, {}
});

test('notificationService: buildNotifications returns empty when all ok', () => {
  const result = buildNotifications({ todayISO: TODAY });
  assert.equal(result.count, 0);
  assert.deepStrictEqual(result.notifications, []);
});

test('notificationService: buildNotifications detects all alert types', () => {
  const deadlines = [
    { dateISO: '2026-04-22', amount: 100, pagata: false, isDeleted: false }, // upcoming
    { dateISO: '2026-04-19', amount: 100, pagata: false, isDeleted: false }, // overdue
  ];
  const fatture = [
    { dataScadenza: '2026-04-19', stato: 'emessa', totale: 500, totalePagato: 0 },
  ];
  const solleciti = [{ stato: 'bozza' }];
  const result = buildNotifications({ deadlines, fatture, solleciti, upcomingDays: 7, todayISO: TODAY });
  assert.equal(result.count, 4);
  const ids = result.notifications.map(n => n.id);
  assert.ok(ids.includes('scadenze_upcoming'));
  assert.ok(ids.includes('scadenze_overdue'));
  assert.ok(ids.includes('fatture_overdue'));
  assert.ok(ids.includes('solleciti_pending'));
});

test('notificationService: buildNotifications with only upcoming deadline', () => {
  const deadlines = [
    { dateISO: '2026-04-25', amount: 300, pagata: false, isDeleted: false },
  ];
  const result = buildNotifications({ deadlines, todayISO: TODAY });
  assert.equal(result.count, 1);
  assert.equal(result.notifications[0].id, 'scadenze_upcoming');
  assert.equal(result.notifications[0].severity, 'warning');
});

// ─── Phase 5: agenda KPI month-filter pure logic tests ──────────────────────

// Replicate the pure functions used in agenda.html's loadKPIs / loadExternalEvents

function isSameMonthAgenda(iso, y, m) {
  if (!iso) return false;
  const d = new Date(iso + 'T00:00:00');
  return d.getFullYear() === y && d.getMonth() === m;
}

function resolveAmountAgenda(d, keys) {
  for (const k of keys) {
    const v = Number(d[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return 0;
}

function kpiFromDocs(docs, { y, m }) {
  let total = 0;
  docs.forEach(d => {
    if (d.isDeleted) return;
    const iso = d.dateISO || d.id;
    if (isSameMonthAgenda(iso, y, m)) total += resolveAmountAgenda(d, ['amount', 'importo']);
  });
  return total;
}

const YEAR = 2026;
const MONTH = 3; // April = index 3 (getMonth() is 0-based)

test('agenda kpi: sums incassi for current month only', () => {
  const docs = [
    { id: 'a', dateISO: '2026-04-10', amount: 100, isDeleted: false },
    { id: 'b', dateISO: '2026-04-25', amount: 200, isDeleted: false },
    { id: 'c', dateISO: '2026-03-15', amount: 500, isDeleted: false }, // different month
    { id: 'd', dateISO: '2026-04-05', amount: 50,  isDeleted: true  }, // deleted
  ];
  assert.equal(kpiFromDocs(docs, { y: YEAR, m: MONTH }), 300);
});

test('agenda kpi: empty docs gives zero', () => {
  assert.equal(kpiFromDocs([], { y: YEAR, m: MONTH }), 0);
});

test('agenda kpi: falls back to d.id when dateISO missing', () => {
  const docs = [
    { id: '2026-04-12', amount: 150, isDeleted: false }, // id used as date
    { id: '2026-05-01', amount: 999, isDeleted: false }, // id in different month
  ];
  assert.equal(kpiFromDocs(docs, { y: YEAR, m: MONTH }), 150);
});

test('agenda kpi: uses importo when amount is absent', () => {
  const docs = [
    { id: 'x', dateISO: '2026-04-20', importo: 400, isDeleted: false },
  ];
  assert.equal(kpiFromDocs(docs, { y: YEAR, m: MONTH }), 400);
});

test('agenda: isSameMonthAgenda handles edge dates', () => {
  assert.ok(isSameMonthAgenda('2026-04-01', 2026, 3));
  assert.ok(isSameMonthAgenda('2026-04-30', 2026, 3));
  assert.ok(!isSameMonthAgenda('2026-05-01', 2026, 3));
  assert.ok(!isSameMonthAgenda('2026-03-31', 2026, 3));
  assert.ok(!isSameMonthAgenda(null, 2026, 3));
  assert.ok(!isSameMonthAgenda('', 2026, 3));
});

test('agenda: resolveAmountAgenda picks first valid positive key', () => {
  assert.equal(resolveAmountAgenda({ amount: 0, importo: 200 }, ['amount', 'importo']), 200);
  assert.equal(resolveAmountAgenda({ amount: 100 }, ['amount', 'importo']), 100);
  assert.equal(resolveAmountAgenda({ }, ['amount', 'importo']), 0);
  assert.equal(resolveAmountAgenda({ amount: -5, importo: 300 }, ['amount', 'importo']), 300);
});

// ─── Phase 6: finanze.html pure KPI logic tests ─────────────────────────────

// Replicate the pure date-filter logic used in finanze.html KPIs

function finanzeKpiFromDocs(docs, { ymStr, y }) {
  let speseMese = 0, speseAnno = 0;
  docs.forEach(d => {
    const dateKey = String(d.date || d.dateISO || d.id || '').slice(0, 10);
    if (!dateKey) return;
    const amount = Number(d.amount || 0);
    if (dateKey.startsWith(ymStr)) speseMese += amount;
    if (dateKey.startsWith(String(y))) speseAnno += amount;
  });
  return { speseMese, speseAnno };
}

test('finanze kpi: sums spese by month and by year', () => {
  const docs = [
    { id: 'a', dateISO: '2026-04-10', amount: 100 },
    { id: 'b', date: '2026-04-25', amount: 200 },
    { id: 'c', dateISO: '2026-03-15', amount: 500 }, // different month, same year
    { id: 'd', dateISO: '2025-04-05', amount: 999 }, // different year
  ];
  const { speseMese, speseAnno } = finanzeKpiFromDocs(docs, { ymStr: '2026-04', y: 2026 });
  assert.equal(speseMese, 300);
  assert.equal(speseAnno, 800); // 100+200+500
});

test('finanze kpi: empty docs gives zeros', () => {
  const { speseMese, speseAnno } = finanzeKpiFromDocs([], { ymStr: '2026-04', y: 2026 });
  assert.equal(speseMese, 0);
  assert.equal(speseAnno, 0);
});

// Replicate scadenze filter in loadScadenze / loadPrevisione

function finanzeFilterScadenze(docs, { today, cutoff }) {
  return docs
    .filter(d => {
      if (d.isDeleted || d.paid) return false;
      const dk = String(d.dateISO || d.id || '').slice(0, 10);
      return dk && dk >= today && dk <= cutoff;
    })
    .map(d => ({
      date: String(d.dateISO || d.id || '').slice(0, 10),
      amount: Number(d.amount || d.importo || 0),
      note: String(d.note || 'Scadenza').slice(0, 50),
    }));
}

test('finanze scadenze: filters to date window only', () => {
  const today = '2026-04-21';
  const cutoff = '2026-07-21'; // +90 days
  const docs = [
    { id: '2026-04-21', amount: 100, isDeleted: false, paid: false }, // today, included
    { id: '2026-06-01', amount: 200, isDeleted: false, paid: false }, // in window
    { id: '2026-04-20', amount: 999, isDeleted: false, paid: false }, // before today
    { id: '2026-07-22', amount: 999, isDeleted: false, paid: false }, // after cutoff
    { id: '2026-05-10', amount: 50,  isDeleted: true,  paid: false }, // deleted
    { id: '2026-05-15', amount: 75,  isDeleted: false, paid: true  }, // paid
  ];
  const result = finanzeFilterScadenze(docs, { today, cutoff });
  assert.equal(result.length, 2);
  assert.equal(result.reduce((s, x) => s + x.amount, 0), 300);
});

test('finanze scadenze: uses dateISO over id', () => {
  const docs = [
    { id: 'wrong', dateISO: '2026-04-22', amount: 100, isDeleted: false, paid: false },
  ];
  const result = finanzeFilterScadenze(docs, { today: '2026-04-21', cutoff: '2026-07-21' });
  assert.equal(result.length, 1);
  assert.equal(result[0].date, '2026-04-22');
});

// ─── Phase 7: admin-portale genPassword + price-list groupByCategory ─────────

// Replicate genPassword logic from admin-portale.html

function genPassword(len = 10) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  let pwd = '';
  for (let i = 0; i < len; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

test('genPassword: generates string of requested length', () => {
  assert.equal(genPassword(10).length, 10);
  assert.equal(genPassword(16).length, 16);
  assert.equal(genPassword(1).length, 1);
});

test('genPassword: only uses allowed character set', () => {
  const allowed = new Set('ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#');
  for (let i = 0; i < 20; i++) {
    const pwd = genPassword(20);
    for (const ch of pwd) assert.ok(allowed.has(ch), `unexpected char: ${ch}`);
  }
});

test('genPassword: produces unique passwords', () => {
  const passwords = new Set(Array.from({ length: 50 }, () => genPassword(10)));
  assert.ok(passwords.size > 1, 'all passwords were identical');
});

// Replicate groupByCategory logic from price-list.js

function groupByCategory(data) {
  const grouped = {};
  data.forEach(p => {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  });
  return grouped;
}

function filterPriceList(products, query) {
  const q = (query || '').toLowerCase();
  if (!q) return products;
  return products.filter(p =>
    (p.name || '').toLowerCase().includes(q) ||
    (p.category || '').toLowerCase().includes(q)
  );
}

test('price-list groupByCategory: groups products by category', () => {
  const products = [
    { name: 'Sedia A', category: 'Sedie', price: 100 },
    { name: 'Sedia B', category: 'Sedie', price: 150 },
    { name: 'Tavolo X', category: 'Tavoli', price: 400 },
  ];
  const grouped = groupByCategory(products);
  assert.equal(Object.keys(grouped).length, 2);
  assert.equal(grouped['Sedie'].length, 2);
  assert.equal(grouped['Tavoli'].length, 1);
});

test('price-list groupByCategory: empty list gives empty object', () => {
  const grouped = groupByCategory([]);
  assert.equal(Object.keys(grouped).length, 0);
});

test('price-list filterPriceList: filters by name', () => {
  const products = [
    { name: 'Sedia A', category: 'Sedie', price: 100 },
    { name: 'Tavolo X', category: 'Tavoli', price: 400 },
  ];
  const result = filterPriceList(products, 'sedia');
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Sedia A');
});

test('price-list filterPriceList: filters by category', () => {
  const products = [
    { name: 'Sedia A', category: 'Sedie', price: 100 },
    { name: 'Tavolo X', category: 'Tavoli', price: 400 },
  ];
  const result = filterPriceList(products, 'tavoli');
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Tavolo X');
});

test('price-list filterPriceList: empty query returns all', () => {
  const products = [
    { name: 'Sedia A', category: 'Sedie', price: 100 },
    { name: 'Tavolo X', category: 'Tavoli', price: 400 },
  ];
  assert.equal(filterPriceList(products, '').length, 2);
  assert.equal(filterPriceList(products, null).length, 2);
});

test('price-list filterPriceList: no match returns empty array', () => {
  const products = [
    { name: 'Sedia A', category: 'Sedie', price: 100 },
  ];
  assert.equal(filterPriceList(products, 'armadio').length, 0);
});
