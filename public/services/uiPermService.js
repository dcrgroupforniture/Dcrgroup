// services/uiPermService.js
// UI-level RBAC helper: hides/disables DOM elements that the current user's
// role is not permitted to use.
//
// Usage (in any page module):
//   import { applyRoleUI } from './services/uiPermService.js';
//   document.addEventListener('tenantReady', (e) => applyRoleUI(e.detail.role, 'fatture'));
//
// Mark elements in HTML with:
//   data-action="write"   → hidden/disabled unless user canWrite module
//   data-action="delete"  → hidden/disabled unless user canDelete module
//   data-action="export"  → hidden/disabled unless user canExport module
//
// Optionally scope to a specific module:
//   data-module="clients" → override the default module for this element

import { hasPermission, ACTIONS } from './roleService.js';

/**
 * Apply role-based UI visibility to the current page.
 * Hides or disables elements marked with data-action and (optionally) data-module.
 *
 * @param {string} role    - Current user role (from window.__tenant.role)
 * @param {string} [defaultModule] - Default module to use if element has no data-module
 */
export function applyRoleUI(role, defaultModule) {
  if (!role) return;

  const elements = document.querySelectorAll('[data-action]');
  elements.forEach(el => {
    const action = el.dataset.action;
    const module = el.dataset.module || defaultModule;
    if (!module || !action) return;

    let permitted;
    switch (action) {
      case 'write':  permitted = hasPermission(role, module, ACTIONS.WRITE);  break;
      case 'delete': permitted = hasPermission(role, module, ACTIONS.DELETE); break;
      case 'export': permitted = hasPermission(role, module, ACTIONS.EXPORT); break;
      case 'read':   permitted = hasPermission(role, module, ACTIONS.READ);   break;
      default:       permitted = true; // Unknown action → don't hide
    }

    if (!permitted) {
      if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
        el.disabled = true;
        el.title = 'Non hai il permesso per questa azione';
        el.style.opacity = '0.35';
        el.style.cursor = 'not-allowed';
      } else {
        el.style.display = 'none';
      }
    }
  });
}

/**
 * Convenience: apply role UI after tenantReady fires (or immediately if already fired).
 * Call this once per page, passing the module key for the page.
 *
 * @param {string} module - MODULES key for the current page (e.g. 'fatture')
 */
export function autoApplyRoleUI(module) {
  function apply() {
    const role = window.__tenant?.role;
    if (role) applyRoleUI(role, module);
  }

  if (window.__tenant) {
    // Auth already resolved
    apply();
  } else {
    document.addEventListener('tenantReady', apply, { once: true });
  }
}
