// services/tenantService.js
// Resolves the current tenant (company) context from Firebase Auth + Firestore.
// Every authenticated user belongs to exactly one company (companyId).
// Existing single-tenant data defaults to "default_company".

import { auth, db, doc, getDoc } from "../firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const DEFAULT_COMPANY_ID = "default_company";

let _cachedTenant = null;         // { companyId, role, companyName, uid }
let _resolveReady = null;
let _readyPromise = null;

function _makeReadyPromise() {
  _readyPromise = new Promise((resolve) => {
    _resolveReady = resolve;
  });
}
_makeReadyPromise();

// ─── Internal: load user profile from Firestore ────────────────────────────

async function _loadUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return null;
    return snap.data();
  } catch {
    return null;
  }
}

async function _loadCompanyProfile(companyId) {
  if (!companyId || companyId === DEFAULT_COMPANY_ID) return null;
  try {
    const snap = await getDoc(doc(db, "companies", companyId));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

// ─── Bootstrap: listen to Firebase Auth state ─────────────────────────────

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    _cachedTenant = null;
    // Reset the ready promise so next login resolves correctly.
    _makeReadyPromise();
    return;
  }

  const profile = await _loadUserProfile(user.uid);
  const companyId = (profile && profile.companyId) || DEFAULT_COMPANY_ID;
  const role = (profile && profile.role) || "admin"; // default role for legacy single-tenant
  const companyProfile = await _loadCompanyProfile(companyId);

  _cachedTenant = {
    uid: user.uid,
    email: user.email,
    companyId,
    role,
    companyName: (companyProfile && companyProfile.name) || companyId,
  };

  _resolveReady(_cachedTenant);
});

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Returns a Promise that resolves to the tenant context once auth is ready.
 * Always awaits this before performing tenant-scoped operations.
 * @returns {Promise<{uid:string, email:string, companyId:string, role:string, companyName:string}>}
 */
export async function getCurrentTenant() {
  return _readyPromise;
}

/**
 * Returns the companyId for the currently authenticated user.
 * Defaults to "default_company" for legacy single-tenant mode.
 * @returns {Promise<string>}
 */
export async function getCompanyId() {
  const t = await getCurrentTenant();
  return (t && t.companyId) || DEFAULT_COMPANY_ID;
}

/**
 * Returns the role for the currently authenticated user.
 * @returns {Promise<string>}
 */
export async function getUserRole() {
  const t = await getCurrentTenant();
  return (t && t.role) || "admin";
}

/**
 * Synchronous getter for the cached tenant (may be null before auth resolves).
 * Prefer getCurrentTenant() for correctness.
 */
export function getTenantSync() {
  return _cachedTenant;
}

/**
 * The default company ID used for all existing single-tenant data.
 */
export const DEFAULT_TENANT_ID = DEFAULT_COMPANY_ID;
