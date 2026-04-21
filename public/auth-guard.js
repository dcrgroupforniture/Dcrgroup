// auth-guard.js
// Includi questo script come <script type="module" src="/auth-guard.js"></script>
// su ogni pagina riservata allo staff. Reindirizza al login se non autenticato.
// Dopo l'autenticazione carica il tenant context (companyId + ruolo) e lo
// inietta nel firestoreService per le scritture multi-tenant.
// Phase 3: Page-level RBAC guard — mostra overlay access-denied se il ruolo
// non ha permesso di lettura sul modulo della pagina corrente.
// Phase 4: Notification bell badge nel top-bar.

import { auth, db, doc, getDoc } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { firestoreService } from './services/firestoreService.js';
import { hasPermission, MODULES, ACTIONS } from './services/roleService.js';
import { fetchNotifications } from './services/notificationService.js';

const LOGIN_PAGE = '/login.html';
const TIMEOUT_MS = 3000;
const DEFAULT_COMPANY_ID = 'default_company';

// ── Page → Module mapping for RBAC page guard ──────────────────────────────
// Pages not listed here are accessible to all authenticated users.
const PAGE_MODULE_MAP = {
  'clients.html':              MODULES.CLIENTS,
  'client.html':               MODULES.CLIENTS,
  'ordini-clienti.html':       MODULES.ORDERS,
  'order.html':                MODULES.ORDERS,
  'quick-order.html':          MODULES.ORDERS,
  'ordini-appunti.html':       MODULES.ORDERS,
  'incassi.html':              MODULES.INCASSI,
  'incassi-calendario.html':   MODULES.INCASSI,
  'incasso.html':              MODULES.INCASSI,
  'incomes.html':              MODULES.INCASSI,
  'spese.html':                MODULES.EXPENSES,
  'spesa.html':                MODULES.EXPENSES,
  'scadenze.html':             MODULES.SCADENZE,
  'finanze.html':              MODULES.SCADENZE,
  'giorno.html':               MODULES.SCADENZE,
  'suppliers.html':            MODULES.SUPPLIERS,
  'supplier.html':             MODULES.SUPPLIERS,
  'purchase.html':             MODULES.SUPPLIERS,
  'listini.html':              MODULES.LISTINI,
  'price-list.html':           MODULES.LISTINI,
  'price-requests.html':       MODULES.LISTINI,
  'crm.html':                  MODULES.CRM,
  'mandanti.html':             MODULES.CRM,
  'offerte.html':              MODULES.CRM,
  'mailing.html':              MODULES.CRM,
  'trattative.html':           MODULES.CRM,
  'sconti.html':               MODULES.FATTURE,
  'solleciti.html':            MODULES.FATTURE,
  'fatture.html':              MODULES.FATTURE,
  'statistiche.html':          MODULES.ANALYTICS,
  'analytics.html':            MODULES.ANALYTICS,
  'audit-log.html':            MODULES.AUDIT,
  'backup.html':               MODULES.BACKUP,
  'admin-portale.html':        MODULES.SETTINGS,
  'companies.html':            MODULES.USERS,
  'migrate-to-multitenant.html': MODULES.SETTINGS,
  'validate-migration.html':   MODULES.SETTINGS,
  'migrazione-ordini.html':    MODULES.SETTINGS,
  'migrazione-ordini-clienti.html': MODULES.SETTINGS,
};

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
    firestoreService.setTenantContext({ companyId, role, uid: user.uid, email: user.email });
    // Expose tenant info globally for pages that need it.
    window.__tenant = { uid: user.uid, email: user.email, companyId, role };
    _injectCompanyBadge(companyId, role);
    _injectNotificationBell();
    _enforcePageAccess(role);
    // Dispatch event so other modules know the tenant is ready.
    document.dispatchEvent(new CustomEvent('tenantReady', { detail: { companyId, role, uid: user.uid, email: user.email } }));
  }).catch((err) => {
    // Firestore unavailable: set default context so writes don't fail.
    console.warn('[auth-guard] Could not load user profile, using default tenant context.', err);
    firestoreService.setTenantContext({ companyId: DEFAULT_COMPANY_ID, role: 'admin', uid: user.uid, email: user.email });
    window.__tenant = { uid: user.uid, email: user.email, companyId: DEFAULT_COMPANY_ID, role: 'admin' };
    _injectCompanyBadge(DEFAULT_COMPANY_ID, 'admin');
    document.dispatchEvent(new CustomEvent('tenantReady', { detail: { companyId: DEFAULT_COMPANY_ID, role: 'admin', uid: user.uid, email: user.email } }));
  });
});

/**
 * Enforces page-level RBAC. If the current page is mapped to a module and the
 * user's role does not have READ permission, renders an access-denied overlay
 * and hides the page body content.
 * @param {string} role
 */
function _enforcePageAccess(role) {
  const pageName = location.pathname.split('/').pop() || 'index.html';
  const module = PAGE_MODULE_MAP[pageName];
  if (!module) return; // Page not in the map → no restriction

  const allowed = hasPermission(role, module, ACTIONS.READ);
  if (allowed) {
    // Expose helper flags for UI permission controls
    window.__canWrite  = hasPermission(role, module, ACTIONS.WRITE);
    window.__canDelete = hasPermission(role, module, ACTIONS.DELETE);
    window.__canExport = hasPermission(role, module, ACTIONS.EXPORT);
    return;
  }

  // Not allowed — show overlay immediately and suppress page content.
  document.body.style.overflow = 'hidden';
  const overlay = document.createElement('div');
  overlay.id = '__access-denied-overlay';
  overlay.style.cssText = [
    'position:fixed','inset:0','z-index:99990',
    'display:flex','flex-direction:column','align-items:center','justify-content:center',
    'background:#0f172a','color:#f1f5f9',
    'font-family:system-ui,sans-serif','padding:32px','text-align:center',
  ].join(';');

  // Build overlay using DOM APIs to avoid XSS from role value
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('width', '64'); icon.setAttribute('height', '64');
  icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', '#ef4444'); icon.setAttribute('stroke-width', '1.5');
  icon.setAttribute('stroke-linecap', 'round'); icon.setAttribute('stroke-linejoin', 'round');
  icon.style.marginBottom = '20px';
  icon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>';

  const heading = document.createElement('h2');
  heading.style.cssText = 'margin:0 0 10px;font-size:24px;font-weight:900';
  heading.textContent = 'Accesso negato';

  const para = document.createElement('p');
  para.style.cssText = 'color:#94a3b8;margin:0 0 28px;max-width:360px';
  para.textContent = 'Il tuo ruolo (';
  const strong = document.createElement('strong');
  strong.style.color = '#818cf8';
  strong.textContent = role; // textContent is safe
  para.appendChild(strong);
  para.appendChild(document.createTextNode(') non ha i permessi necessari per accedere a questa pagina.'));

  const link = document.createElement('a');
  link.href = '/index.html';
  link.style.cssText = 'background:#6366f1;color:#fff;padding:12px 28px;border-radius:12px;font-weight:700;font-size:15px;text-decoration:none;display:inline-block';
  link.textContent = '← Torna alla home';

  overlay.append(icon, heading, para, link);
  document.body.appendChild(overlay);
}

/**
 * Injects a small company badge into the .top-bar element so every page
 * shows which tenant is active. Only shown when companyId is not the legacy
 * default, or when the user is an admin (to aid orientation).
 */
function _injectCompanyBadge(companyId, role) {
  if (!companyId) return;
  // Skip if a badge is already present (e.g. companies.html injects its own).
  if (document.getElementById('__tenant-badge')) return;
  const topBar = document.querySelector('.top-bar');
  if (!topBar) return;
  const badge = document.createElement('span');
  badge.id = '__tenant-badge';
  badge.style.cssText = [
    'font-size:11px','font-weight:700','padding:3px 10px',
    'border-radius:20px','margin-left:auto','flex-shrink:0',
    'background:rgba(99,102,241,.18)','color:#818cf8',
    'white-space:nowrap','overflow:hidden','text-overflow:ellipsis','max-width:120px',
  ].join(';');
  badge.title = `Azienda: ${companyId} | Ruolo: ${role}`;
  badge.textContent = companyId === DEFAULT_COMPANY_ID ? role : companyId;
  topBar.appendChild(badge);
}

/**
 * Injects a 🔔 notification bell button into .top-bar.
 * Shows a count badge when there are active alerts.
 * Loads notifications lazily after tenantReady (non-blocking).
 */
function _injectNotificationBell() {
  if (document.getElementById('__notif-bell')) return;
  const topBar = document.querySelector('.top-bar');
  if (!topBar) return;

  // Bell button wrapper
  const wrapper = document.createElement('div');
  wrapper.id = '__notif-bell';
  wrapper.style.cssText = 'position:relative;display:inline-flex;align-items:center;flex-shrink:0;cursor:pointer';
  wrapper.title = 'Notifiche';
  wrapper.setAttribute('role', 'button');
  wrapper.setAttribute('tabindex', '0');
  wrapper.setAttribute('aria-label', 'Notifiche');

  const bell = document.createElement('span');
  bell.style.cssText = 'font-size:20px;line-height:1;user-select:none';
  bell.textContent = '🔔';

  const badge = document.createElement('span');
  badge.id = '__notif-count';
  badge.style.cssText = [
    'position:absolute','top:-4px','right:-6px',
    'min-width:16px','height:16px',
    'background:#ef4444','color:#fff',
    'font-size:10px','font-weight:900','line-height:16px',
    'text-align:center','padding:0 3px',
    'border-radius:999px',
    'display:none',
  ].join(';');

  wrapper.appendChild(bell);
  wrapper.appendChild(badge);
  topBar.appendChild(wrapper);

  // Dropdown panel
  const panel = document.createElement('div');
  panel.id = '__notif-panel';
  panel.style.cssText = [
    'position:fixed','top:calc(60px + env(safe-area-inset-top))','right:12px',
    'width:320px','max-height:60vh','overflow-y:auto',
    'background:#1e293b','border:1px solid rgba(255,255,255,.12)',
    'border-radius:16px','box-shadow:0 8px 32px rgba(0,0,0,.4)',
    'z-index:9999','display:none','padding:8px',
  ].join(';');
  document.body.appendChild(panel);

  // Toggle panel on bell click
  function togglePanel() {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }
  wrapper.addEventListener('click', togglePanel);
  wrapper.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') togglePanel(); });
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target) && !panel.contains(e.target)) panel.style.display = 'none';
  });

  // Load and render notifications (non-blocking, after tenant is ready)
  function loadAndRender() {
    fetchNotifications().then(({ notifications, count }) => {
      if (count > 0) {
        badge.textContent = String(count > 9 ? '9+' : count);
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }

      panel.innerHTML = '';
      if (!notifications.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:16px;text-align:center;color:#94a3b8;font-size:13px';
        empty.textContent = '✅ Nessuna notifica attiva';
        panel.appendChild(empty);
        return;
      }

      notifications.forEach(n => {
        const item = document.createElement('a');
        item.href = n.link || '#';
        item.style.cssText = [
          'display:block','padding:12px 14px','margin-bottom:4px',
          'border-radius:12px','text-decoration:none',
          'background:' + (n.severity === 'danger' ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.10)'),
          'border:1px solid ' + (n.severity === 'danger' ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.25)'),
          'cursor:pointer',
        ].join(';');

        const icon = n.severity === 'danger' ? '🔴' : '🟡';
        const title = document.createElement('div');
        title.style.cssText = 'font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:3px';
        title.textContent = icon + ' ' + n.title;

        const detail = document.createElement('div');
        detail.style.cssText = 'font-size:12px;color:#94a3b8';
        detail.textContent = n.detail;

        item.appendChild(title);
        item.appendChild(detail);
        panel.appendChild(item);
      });
    }).catch(() => {/* silent */});
  }

  // Load after tenant resolves (or immediately if already ready)
  if (window.__tenant) {
    loadAndRender();
  } else {
    document.addEventListener('tenantReady', loadAndRender, { once: true });
  }
}

