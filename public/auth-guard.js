// auth-guard.js
// Includi questo script come <script type="module" src="/auth-guard.js"></script>
// su ogni pagina riservata allo staff. Reindirizza al login se non autenticato.
// Dopo l'autenticazione carica il tenant context (companyId + ruolo) e lo
// inietta nel firestoreService per le scritture multi-tenant.

import { auth, db, doc, getDoc } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { firestoreService } from './services/firestoreService.js';

const LOGIN_PAGE = '/login.html';
const TIMEOUT_MS = 3000;
const DEFAULT_COMPANY_ID = 'default_company';

// ── Session inactivity timeout (30 min warning, 35 min logout) ──
const WARN_MS  = 30 * 60 * 1000;  // 30 minutes
const LOGOUT_MS = 35 * 60 * 1000; // 35 minutes

(function setupInactivityTimeout() {
  let warnTimer, logoutTimer;
  let toastEl = null;

  function clearTimers() {
    clearTimeout(warnTimer);
    clearTimeout(logoutTimer);
  }

  function removeToast() {
    if (toastEl) { toastEl.remove(); toastEl = null; }
  }

  function showToast() {
    removeToast();
    toastEl = document.createElement('div');
    toastEl.id = 'session-timeout-toast';
    toastEl.style.cssText = [
      'position:fixed','top:calc(64px + env(safe-area-inset-top))','left:50%',
      'transform:translateX(-50%)','z-index:99998',
      'background:#1e293b','color:#fff',
      'padding:12px 20px','border-radius:14px',
      'font-size:13px','font-weight:700',
      'box-shadow:0 8px 24px rgba(0,0,0,.35)',
      'display:flex','align-items:center','gap:12px',
    ].join(';');
    toastEl.innerHTML = `
      <span>⏱ Sessione in scadenza — clicca per restare connesso</span>
      <button id="session-stay-btn" style="background:rgba(255,255,255,.15);border:none;color:#fff;padding:6px 12px;border-radius:10px;font-weight:800;cursor:pointer">Resto</button>
    `;
    document.body.appendChild(toastEl);
    document.getElementById('session-stay-btn')?.addEventListener('click', resetTimers);
  }

  function resetTimers() {
    clearTimers();
    removeToast();
    warnTimer  = setTimeout(showToast, WARN_MS);
    logoutTimer = setTimeout(() => {
      import('./firebase.js').then(({ auth }) => {
        import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js').then(({ signOut }) => {
          signOut(auth).catch(() => {}).finally(() => {
            window.location.replace(LOGIN_PAGE + '?reason=timeout');
          });
        });
      });
    }, LOGOUT_MS);
  }

  // Start timers on user activity
  const events = ['mousedown','keydown','touchstart','scroll','click'];
  events.forEach(ev => document.addEventListener(ev, resetTimers, { passive: true }));
  resetTimers();
})();

new Promise((resolve) => {
  let done = false;
  const finish = (user) => {
    if (done) return;
    done = true;
    try { unsub && unsub(); } catch {}
    resolve(user);
  };
  let unsub = null;
  try {
    unsub = onAuthStateChanged(auth, (user) => finish(user));
  } catch {
    finish(null);
    return;
  }
  setTimeout(() => finish(null), TIMEOUT_MS);
}).then((user) => {
  if (!user) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`${LOGIN_PAGE}?next=${next}`);
    return;
  }
  // Load tenant context and inject into firestoreService.
  getDoc(doc(db, 'users', user.uid)).then((snap) => {
    const profile = snap.exists() ? snap.data() : {};
    const companyId = profile.companyId || DEFAULT_COMPANY_ID;
    const role = profile.role || 'admin';
    firestoreService.setTenantContext({ companyId, role });
    // Expose tenant info globally for pages that need it.
    window.__tenant = { uid: user.uid, email: user.email, companyId, role };
  }).catch((err) => {
    // Firestore unavailable: set default context so writes don't fail.
    console.warn('[auth-guard] Could not load user profile, using default tenant context.', err);
    firestoreService.setTenantContext({ companyId: DEFAULT_COMPANY_ID, role: 'admin' });
    window.__tenant = { uid: user.uid, email: user.email, companyId: DEFAULT_COMPANY_ID, role: 'admin' };
  });
});
