// services/firestoreService.js
// Base SAFE wrapper around Firestore.
// Rule: UI pages must NOT import firebase/firestore directly.

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

const DEBUG = (() => {
  try {
    const v = new URLSearchParams(location.search).get("debug");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
})();

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
  baseList.forEach((item) => map.set(item.id, { ...item }));
  extraList.forEach((item) => {
    const prev = map.get(item.id) || {};
    map.set(item.id, { ...prev, ...item });
  });
  return [...map.values()];
}

export const firestoreService = {
  db,

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
      const normalized = normalizeForCollection(colName, data);
      const ref = await addDoc(collection(db, colName), normalized);
      const twin = twinCollection(colName);
      if (twin) {
        await setDoc(
          doc(db, twin, ref.id),
          normalizeForCollection(twin, normalized),
          { merge: true }
        );
      }
      return ref.id;
    } catch (e) {
      throw normalizeError(e);
    }
  },

  async set(colName, docId, data, { merge = true } = {}) {
    try {
      log("set", colName, docId, { merge });
      const normalized = normalizeForCollection(colName, data);
      await setDoc(doc(db, colName, docId), normalized, { merge });
      const twin = twinCollection(colName);
      if (twin) {
        await setDoc(
          doc(db, twin, docId),
          normalizeForCollection(twin, normalized),
          { merge }
        );
      }
      return docId;
    } catch (e) {
      throw normalizeError(e);
    }
  },

  async update(colName, docId, data) {
    try {
      log("update", colName, docId);
      const normalized = normalizeForCollection(colName, data);
      await updateDoc(doc(db, colName, docId), normalized);
      const twin = twinCollection(colName);
      if (twin) {
        try {
          await updateDoc(doc(db, twin, docId), normalizeForCollection(twin, normalized));
        } catch {
          await setDoc(
            doc(db, twin, docId),
            normalizeForCollection(twin, normalized),
            { merge: true }
          );
        }
      }
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
        try { await deleteDoc(doc(db, twin, docId)); } catch {}
      }
      return docId;
    } catch (e) {
      throw normalizeError(e);
    }
  },

  batch() {
    return writeBatch(db);
  },

  serverTimestamp,
};
