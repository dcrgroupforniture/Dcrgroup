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
    magazzino: new Set(['read','write','delete','export']),
    fatture:   new Set(['read','write','delete','export']),
    analytics: new Set(['read','write','delete','export']),
    settings:  new Set(['read','write','delete','export']),
    users:     new Set(['read','write','delete','export']),
  },
  manager: {
    clients:   new Set(['read','write','export']),
    orders:    new Set(['read','write','delete','export']),
    incassi:   new Set(['read','write','export']),
    expenses:  new Set(['read','write','export']),
    magazzino: new Set(['read','write','export']),
    fatture:   new Set(['read','write','export']),
    analytics: new Set(['read','export']),
    settings:  new Set(['read']),
    users:     new Set(['read']),
  },
  agente: {
    clients:   new Set(['read','write']),
    orders:    new Set(['read','write']),
    incassi:   new Set(['read']),
    analytics: new Set(['read']),
  },
  magazzino: {
    clients:   new Set(['read']),
    orders:    new Set(['read']),
    magazzino: new Set(['read','write']),
  },
  contabile: {
    clients:   new Set(['read','export']),
    orders:    new Set(['read','export']),
    incassi:   new Set(['read','write','export']),
    expenses:  new Set(['read','write','export']),
    fatture:   new Set(['read','write','export']),
    analytics: new Set(['read','export']),
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
