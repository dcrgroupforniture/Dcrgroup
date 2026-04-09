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
      const snap = await getDoc(doc(db, colName, docId));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } catch (e) {
      throw normalizeError(e);
    }
  },

  async getAll(colName) {
    try {
      log("getAll", colName);
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
      const ref = await addDoc(collection(db, colName), data);
      return ref.id;
    } catch (e) {
      throw normalizeError(e);
    }
  },

  async set(colName, docId, data, { merge = true } = {}) {
    try {
      log("set", colName, docId, { merge });
      await setDoc(doc(db, colName, docId), data, { merge });
      return docId;
    } catch (e) {
      throw normalizeError(e);
    }
  },

  async update(colName, docId, data) {
    try {
      log("update", colName, docId);
      await updateDoc(doc(db, colName, docId), data);
      return docId;
    } catch (e) {
      throw normalizeError(e);
    }
  },

  async remove(colName, docId) {
    try {
      log("remove", colName, docId);
      await deleteDoc(doc(db, colName, docId));
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
