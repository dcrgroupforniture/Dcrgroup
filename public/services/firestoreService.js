// services/firestoreService.js
// Base SAFE wrapper around Firestore.
// Rule: UI pages must NOT import firebase/firestore directly.
//
// Multi-tenant support:
//   Call firestoreService.setTenantContext({ companyId, role }) after auth
//   to automatically inject companyId into all writes and enforce data isolation.

import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from "../firebase.js";
import { logAudit, setAuditTenantContext } from "./auditService.js";

const DEBUG = (() => {
  try {
    const v = new URLSearchParams(location.search).get("debug");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
})();

// ─── Tenant context ────────────────────────────────────────────────────────

/** Active tenant context set after authentication. */
let _tenantContext = null;

/**
 * Set the active tenant context.
 * Call this once after the user authenticates (from auth-guard or tenantService).
 * @param {{ companyId: string, role: string }|null} ctx
 */
function setTenantContext(ctx) {
  _tenantContext = ctx && ctx.companyId ? ctx : null;
  // Also propagate to auditService so it can record uid/email.
  if (ctx) setAuditTenantContext({ companyId: ctx.companyId, uid: ctx.uid, email: ctx.email });
  log("setTenantContext", _tenantContext);
}

/**
 * Returns the active companyId, or null if no tenant context is set.
 */
function getActiveCompanyId() {
  return _tenantContext ? _tenantContext.companyId : null;
}

/**
 * Injects companyId into data if a tenant context is active.
 * Always returns a new object and preserves existing companyId.
 */
function injectCompanyId(data = {}) {
  const companyId = getActiveCompanyId();
  if (!companyId) return { ...data };
  // Only inject if not already present to avoid overwriting cross-company migrations.
  if (data.companyId) return { ...data };
  return { ...data, companyId };
}

function log(...args) {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.log("[FirestoreService]", ...args);
}

function normalizeError(e) {
  const msg = (e && (e.message || e.toString())) || "Unknown error";
  const code = e && (e.code || e.name);
  return { code, message: msg, raw: e };
}

function toData(docSnap) {
  const data = docSnap.data ? docSnap.data() : {};
  return { id: docSnap.id, ...data };
}

function isClientCollection(colName) {
  return colName === "clienti" || colName === "clients";
}

function twinCollection(colName) {
  if (colName === "clienti") return "clients";
  if (colName === "clients") return "clienti";
  return null;
}

const READ_COLLECTION_TWINS = new Map([
  ["clients", "clienti"],
  ["clienti", "clients"],
  ["orders", "ordini"],
  ["ordini", "orders"],
  ["expenses", "spese"],
  ["spese", "expenses"],
  ["suppliers", "fornitori"],
  ["fornitori", "suppliers"],
  ["payments", "scadenze"],
  ["scadenze", "payments"],
  ["incassi", "incomes"],
  ["incomes", "incassi"],
]);

function readTwinCollection(colName) {
  return READ_COLLECTION_TWINS.get(colName) || null;
}

function mapClientShape(data = {}) {
  const name = String(data.ragioneSociale || data.nome || data.name || "").trim();
  const city = String(data.citta || data.city || data.comune || data.town || "").trim();
  const phone = String(data.telefono || data.phone || "").trim();
  return {
    ...data,
    ragioneSociale: data.ragioneSociale || name,
    nome: data.nome || name,
    name: data.name || name,
    citta: data.citta || city,
    city: data.city || city,
    telefono: data.telefono || phone,
    phone: data.phone || phone,
  };
}

function normalizeForCollection(colName, data = {}) {
  return isClientCollection(colName) ? mapClientShape(data) : data;
}

async function safeGetCollection(colName) {
  try {
    const snap = await getDocs(collection(db, colName));
    return snap.docs.map(toData);
  } catch (e) {
    log("safeGetCollection failed", colName, normalizeError(e));
    return [];
  }
}

async function safeGetCollectionDoc(colName, docId) {
  try {
    const snap = await getDoc(doc(db, colName, docId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    log("safeGetCollectionDoc failed", colName, docId, normalizeError(e));
    return null;
  }
}

function mergeById(baseList = [], extraList = []) {
  const map = new Map();
  baseList.forEach((item) => {
    if (!item || !item.id) return;
    map.set(item.id, { ...item });
  });
  extraList.forEach((item) => {
    if (!item || !item.id) return;
    const prev = map.get(item.id) || {};
    map.set(item.id, { ...prev, ...item });
  });
  return [...map.values()];
}

export const firestoreService = {
  db,

  // ─── Tenant context ───────────────────────────────────────────────────────
  setTenantContext,
  getActiveCompanyId,

  // --- refs ---
  col: (...segments) => collection(db, ...segments),
  doc: (...segments) => doc(db, ...segments),

  // --- builders ---
  where,
  orderBy,
  limit,
  query: (colRef, ...clauses) => query(colRef, ...clauses),

  // --- reads ---
  async getDoc(colName, docId) {
    try {
      log("getDoc", colName, docId);
      if (isClientCollection(colName)) {
        const primary = await safeGetCollectionDoc(colName, docId);
        const twin = await safeGetCollectionDoc(twinCollection(colName), docId);
        if (!primary && !twin) return null;
        return {
          id: docId,
          ...normalizeForCollection(twinCollection(colName), twin || {}),
          ...normalizeForCollection(colName, primary || {}),
        };
      }
      const twinName = readTwinCollection(colName);
      if (twinName) {
        const primary = await safeGetCollectionDoc(colName, docId);
        const twin = await safeGetCollectionDoc(twinName, docId);
        if (!primary && !twin) return null;
        return {
          id: docId,
          ...normalizeForCollection(twinName, twin || {}),
          ...normalizeForCollection(colName, primary || {}),
        };
      }
      const snap = await getDoc(doc(db, colName, docId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (e) {
      throw normalizeError(e);
    }
  },

  async getAll(colName) {
    try {
      log("getAll", colName);
      if (isClientCollection(colName)) {
        const primary = (await safeGetCollection(colName)).map((x) =>
          normalizeForCollection(colName, x)
        );
        const twinName = twinCollection(colName);
        const twin = (await safeGetCollection(twinName)).map((x) =>
          normalizeForCollection(twinName, x)
        );
        return mergeById(twin, primary);
      }
      const twinName = readTwinCollection(colName);
      if (twinName) {
        const primary = (await safeGetCollection(colName)).map((x) =>
          normalizeForCollection(colName, x)
        );
        const twin = (await safeGetCollection(twinName)).map((x) =>
          normalizeForCollection(twinName, x)
        );
        if (primary.length || twin.length) return mergeById(twin, primary);
      }
      const snap = await getDocs(collection(db, colName));
      return snap.docs.map(toData);
    } catch (e) {
      throw normalizeError(e);
    }
  },

  async getAllFromQuery(q, meta = {}) {
    try {
      log("getAllFromQuery", meta.name || "(unnamed)", meta);
      const snap = await getDocs(q);
      return snap.docs.map(toData);
    } catch (e) {
      throw normalizeError(e);
    }
  },

  onSnapshot(q, cb, errCb, meta = {}) {
    log("onSnapshot", meta.name || "(unnamed)", meta);
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map(toData)),
      (e) => (errCb ? errCb(normalizeError(e)) : undefined)
    );
  },

  // --- writes ---
  async add(colName, data) {
    try {
      log("add", colName, data);
      const withTenant = injectCompanyId(data);
      const normalized = normalizeForCollection(colName, withTenant);
      const ref = await addDoc(collection(db, colName), normalized);
      const twin = twinCollection(colName);
      if (twin) {
        await setDoc(
          doc(db, twin, ref.id),
          normalizeForCollection(twin, normalized),
          { merge: true }
        );
      }
      logAudit({ action: 'add', colName, docId: ref.id, data: normalized });
      return ref.id;
    } catch (e) {
      throw normalizeError(e);
    }
  },

  async set(colName, docId, data, { merge = true } = {}) {
    try {
      log("set", colName, docId, { merge });
      const withTenant = injectCompanyId(data);
      const normalized = normalizeForCollection(colName, withTenant);
      await setDoc(doc(db, colName, docId), normalized, { merge });
      const twin = twinCollection(colName);
      if (twin) {
        await setDoc(
          doc(db, twin, docId),
          normalizeForCollection(twin, normalized),
          { merge }
        );
      }
      logAudit({ action: 'set', colName, docId, data: normalized });
      return docId;
    } catch (e) {
      throw normalizeError(e);
    }
  },

  async update(colName, docId, data) {
    try {
      log("update", colName, docId);
      const withTenant = injectCompanyId(data);
      const normalized = normalizeForCollection(colName, withTenant);
      await updateDoc(doc(db, colName, docId), normalized);
      const twin = twinCollection(colName);
      if (twin) {
        try {
          await updateDoc(doc(db, twin, docId), normalizeForCollection(twin, normalized));
        } catch (e) {
          log("update twin fallback to set", colName, twin, docId, normalizeError(e));
          await setDoc(
            doc(db, twin, docId),
            normalizeForCollection(twin, normalized),
            { merge: true }
          );
        }
      }
      logAudit({ action: 'update', colName, docId, data: normalized });
      return docId;
    } catch (e) {
      throw normalizeError(e);
    }
  },

  async remove(colName, docId) {
    try {
      log("remove", colName, docId);
      await deleteDoc(doc(db, colName, docId));
      const twin = twinCollection(colName);
      if (twin) {
        try {
          await deleteDoc(doc(db, twin, docId));
        } catch (e) {
          log("remove twin failed", twin, docId, normalizeError(e));
        }
      }
      logAudit({ action: 'delete', colName, docId });
      return docId;
    } catch (e) {
      throw normalizeError(e);
    }
  },

  /**
   * Add a document to a subcollection.
   * CompanyId is NOT injected since tenant isolation is inherited from the parent document.
   * Audit-logs the write.
   * @param {string} parentColName - e.g. 'suppliers'
   * @param {string} parentId      - e.g. supplierId
   * @param {string} subColName    - e.g. 'invoices'
   * @param {object} data
   * @returns {Promise<string>} new document id
   */
  async addSubDoc(parentColName, parentId, subColName, data) {
    try {
      log("addSubDoc", parentColName, parentId, subColName, data);
      const ref = await addDoc(collection(db, parentColName, parentId, subColName), data);
      logAudit({ action: 'add', colName: `${parentColName}/${parentId}/${subColName}`, docId: ref.id, data });
      return ref.id;
    } catch (e) {
      throw normalizeError(e);
    }
  },

  batch() {
    return writeBatch(db);
  },

  serverTimestamp,

  // ─── Tenant-scoped helpers ─────────────────────────────────────────────────

  /**
   * Get all documents from a collection filtered by companyId.
   * Falls back to getAll() when companyId is absent (backward compat).
   * @param {string} colName
   * @param {string} [companyId] - Defaults to active tenant context.
   */
  async getAllByCompany(colName, companyId) {
    const cid = companyId || getActiveCompanyId();
    if (!cid) return this.getAll(colName);
    try {
      log("getAllByCompany", colName, cid);
      const q = query(collection(db, colName), where("companyId", "==", cid));
      const snap = await getDocs(q);
      return snap.docs.map(toData);
    } catch (e) {
      throw normalizeError(e);
    }
  },

  /**
   * Get a single document, verifying it belongs to the active company.
   * @param {string} colName
   * @param {string} docId
   * @param {string} [companyId]
   */
  async getDocByCompany(colName, docId, companyId) {
    const doc_ = await this.getDoc(colName, docId);
    if (!doc_) return null;
    const cid = companyId || getActiveCompanyId();
    // If no tenant context or document has no companyId (legacy), allow access.
    if (!cid || !doc_.companyId) return doc_;
    return doc_.companyId === cid ? doc_ : null;
  },
};
