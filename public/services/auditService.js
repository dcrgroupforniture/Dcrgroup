// services/auditService.js
// Fire-and-forget audit logging to the `auditLog` Firestore collection.
// Every write/delete in firestoreService will call logAudit().
// Never throws — failures are silently swallowed so they never block user operations.

import { db, collection, addDoc, serverTimestamp } from '../firebase.js';

const COL = 'auditLog';

/** Cached tenant context (set by firestoreService after auth-guard resolves). */
let _tenantCtx = { companyId: null, uid: null, email: null };

/**
 * Set the active tenant context for audit logging.
 * Called by firestoreService.setTenantContext().
 * @param {{ companyId: string, uid?: string, email?: string }} ctx
 */
export function setAuditTenantContext(ctx) {
  _tenantCtx = { ..._tenantCtx, ...ctx };
}

/**
 * Normalise the audit action verb to a standard short form.
 * @param {string} action
 * @returns {string}
 */
function normaliseAction(action) {
  const a = String(action || '').toLowerCase();
  if (a === 'add' || a === 'create')  return 'add';
  if (a === 'set' || a === 'upsert')  return 'set';
  if (a === 'update' || a === 'edit') return 'update';
  if (a === 'remove' || a === 'delete' || a === 'soft_delete') return a === 'soft_delete' ? 'soft_delete' : 'delete';
  return a;
}

/**
 * Extract a lightweight, safe-to-log payload from a data object.
 * Strips large blobs (base64 images, long texts) to keep log entries small.
 * @param {object|null} data
 * @returns {object|null}
 */
function safePayload(data) {
  if (!data || typeof data !== 'object') return null;
  const MAX_STRING = 200;
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      out[k] = v.length > MAX_STRING ? v.slice(0, MAX_STRING) + '…' : v;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (v && typeof v === 'object' && typeof v.toDate === 'function') {
      // Firestore Timestamp
      out[k] = v.toDate().toISOString();
    } else if (typeof v === 'object') {
      out[k] = '[object]';
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Log a write/delete event to the auditLog collection.
 * Non-blocking: call without await. Failures are silently ignored.
 *
 * @param {object} params
 * @param {string} params.action   - 'add' | 'set' | 'update' | 'delete' | 'soft_delete'
 * @param {string} params.colName  - Firestore collection name
 * @param {string} [params.docId]  - Document ID (if known)
 * @param {object} [params.data]   - Document data (stripped to safe payload)
 */
export function logAudit({ action, colName, docId = null, data = null } = {}) {
  if (!action || !colName) return;

  const { companyId, uid, email } = _tenantCtx;
  const entry = {
    action:    normaliseAction(action),
    col:       colName,
    docId:     docId || null,
    companyId: companyId || null,
    uid:       uid || null,
    email:     email || null,
    at:        serverTimestamp(),
    payload:   safePayload(data),
  };

  // Fire and forget — never block the caller.
  addDoc(collection(db, COL), entry).catch((err) => {
    // Log in development to aid debugging; silent in production.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[auditService] log failed:', err && (err.message || err));
    }
  });
}
