// services/roleService.js
// RBAC: role definitions, permission matrix, and access checks.
// Roles: admin | manager | agente | magazzino | contabile

export const ROLES = Object.freeze({
  ADMIN:      "admin",
  MANAGER:    "manager",
  AGENTE:     "agente",
  MAGAZZINO:  "magazzino",
  CONTABILE:  "contabile",
});

// Role hierarchy (higher index = more restricted).
const ROLE_RANK = {
  [ROLES.ADMIN]:     0,
  [ROLES.MANAGER]:   1,
  [ROLES.CONTABILE]: 2,
  [ROLES.AGENTE]:    3,
  [ROLES.MAGAZZINO]: 4,
};

// Modules in the system.
export const MODULES = Object.freeze({
  CLIENTS:      "clients",
  ORDERS:       "orders",
  INCASSI:      "incassi",
  EXPENSES:     "expenses",
  SCADENZE:     "scadenze",
  SUPPLIERS:    "suppliers",
  MAGAZZINO:    "magazzino",
  FATTURE:      "fatture",
  LISTINI:      "listini",
  CRM:          "crm",
  ANALYTICS:    "analytics",
  SETTINGS:     "settings",
  USERS:        "users",
  BACKUP:       "backup",
  AUDIT:        "audit",
});

// Actions.
export const ACTIONS = Object.freeze({
  READ:   "read",
  WRITE:  "write",
  DELETE: "delete",
  EXPORT: "export",
});

/**
 * Permission matrix: PERMISSIONS[role][module] = Set<action>
 * Roles not listed for a module/action → denied.
 */
const PERMISSIONS = {
  [ROLES.ADMIN]: {
    // Admin can do everything.
    [MODULES.CLIENTS]:    new Set([...Object.values(ACTIONS)]),
    [MODULES.ORDERS]:     new Set([...Object.values(ACTIONS)]),
    [MODULES.INCASSI]:    new Set([...Object.values(ACTIONS)]),
    [MODULES.EXPENSES]:   new Set([...Object.values(ACTIONS)]),
    [MODULES.SCADENZE]:   new Set([...Object.values(ACTIONS)]),
    [MODULES.SUPPLIERS]:  new Set([...Object.values(ACTIONS)]),
    [MODULES.MAGAZZINO]:  new Set([...Object.values(ACTIONS)]),
    [MODULES.FATTURE]:    new Set([...Object.values(ACTIONS)]),
    [MODULES.LISTINI]:    new Set([...Object.values(ACTIONS)]),
    [MODULES.CRM]:        new Set([...Object.values(ACTIONS)]),
    [MODULES.ANALYTICS]:  new Set([...Object.values(ACTIONS)]),
    [MODULES.SETTINGS]:   new Set([...Object.values(ACTIONS)]),
    [MODULES.USERS]:      new Set([...Object.values(ACTIONS)]),
    [MODULES.BACKUP]:     new Set([...Object.values(ACTIONS)]),
    [MODULES.AUDIT]:      new Set([...Object.values(ACTIONS)]),
  },
  [ROLES.MANAGER]: {
    [MODULES.CLIENTS]:    new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.EXPORT]),
    [MODULES.ORDERS]:     new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.DELETE, ACTIONS.EXPORT]),
    [MODULES.INCASSI]:    new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.EXPORT]),
    [MODULES.EXPENSES]:   new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.EXPORT]),
    [MODULES.SCADENZE]:   new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.EXPORT]),
    [MODULES.SUPPLIERS]:  new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.EXPORT]),
    [MODULES.MAGAZZINO]:  new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.EXPORT]),
    [MODULES.FATTURE]:    new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.EXPORT]),
    [MODULES.LISTINI]:    new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.EXPORT]),
    [MODULES.CRM]:        new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.EXPORT]),
    [MODULES.ANALYTICS]:  new Set([ACTIONS.READ, ACTIONS.EXPORT]),
    [MODULES.SETTINGS]:   new Set([ACTIONS.READ]),
    [MODULES.USERS]:      new Set([ACTIONS.READ]),
    [MODULES.BACKUP]:     new Set([ACTIONS.READ, ACTIONS.EXPORT]),
    [MODULES.AUDIT]:      new Set([ACTIONS.READ]),
  },
  [ROLES.AGENTE]: {
    [MODULES.CLIENTS]:    new Set([ACTIONS.READ, ACTIONS.WRITE]),
    [MODULES.ORDERS]:     new Set([ACTIONS.READ, ACTIONS.WRITE]),
    [MODULES.INCASSI]:    new Set([ACTIONS.READ]),
    [MODULES.LISTINI]:    new Set([ACTIONS.READ]),
    [MODULES.CRM]:        new Set([ACTIONS.READ, ACTIONS.WRITE]),
    [MODULES.ANALYTICS]:  new Set([ACTIONS.READ]),
    // Agenti cannot see prices or financial data.
  },
  [ROLES.MAGAZZINO]: {
    [MODULES.CLIENTS]:    new Set([ACTIONS.READ]),
    [MODULES.ORDERS]:     new Set([ACTIONS.READ]),
    [MODULES.MAGAZZINO]:  new Set([ACTIONS.READ, ACTIONS.WRITE]),
    [MODULES.SUPPLIERS]:  new Set([ACTIONS.READ]),
    [MODULES.LISTINI]:    new Set([ACTIONS.READ]),
  },
  [ROLES.CONTABILE]: {
    [MODULES.CLIENTS]:    new Set([ACTIONS.READ, ACTIONS.EXPORT]),
    [MODULES.ORDERS]:     new Set([ACTIONS.READ, ACTIONS.EXPORT]),
    [MODULES.INCASSI]:    new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.EXPORT]),
    [MODULES.EXPENSES]:   new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.EXPORT]),
    [MODULES.SCADENZE]:   new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.EXPORT]),
    [MODULES.FATTURE]:    new Set([ACTIONS.READ, ACTIONS.WRITE, ACTIONS.EXPORT]),
    [MODULES.ANALYTICS]:  new Set([ACTIONS.READ, ACTIONS.EXPORT]),
    [MODULES.AUDIT]:      new Set([ACTIONS.READ]),
  },
};

/**
 * Check if a role has permission for a given module and action.
 * @param {string} role - One of ROLES values
 * @param {string} module - One of MODULES values
 * @param {string} action - One of ACTIONS values
 * @returns {boolean}
 */
export function hasPermission(role, module, action) {
  if (!role || !module || !action) return false;
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return false;
  const modulePerms = rolePerms[module];
  if (!modulePerms) return false;
  return modulePerms.has(action);
}

/**
 * Check if a role can read a module (convenience wrapper).
 * @param {string} role
 * @param {string} module
 * @returns {boolean}
 */
export function canRead(role, module) {
  return hasPermission(role, module, ACTIONS.READ);
}

/**
 * Check if a role can write to a module.
 * @param {string} role
 * @param {string} module
 * @returns {boolean}
 */
export function canWrite(role, module) {
  return hasPermission(role, module, ACTIONS.WRITE);
}

/**
 * Check if a role can delete in a module.
 * @param {string} role
 * @param {string} module
 * @returns {boolean}
 */
export function canDelete(role, module) {
  return hasPermission(role, module, ACTIONS.DELETE);
}

/**
 * Return all allowed actions for a given role and module.
 * @param {string} role
 * @param {string} module
 * @returns {string[]}
 */
export function getAllowedActions(role, module) {
  const rolePerms = PERMISSIONS[role];
  if (!rolePerms) return [];
  const modulePerms = rolePerms[module];
  if (!modulePerms) return [];
  return [...modulePerms];
}

/**
 * Returns true if roleA outranks (or equals) roleB in the hierarchy.
 * Lower rank = more privileges.
 * @param {string} roleA
 * @param {string} roleB
 * @returns {boolean}
 */
export function outranks(roleA, roleB) {
  const rankA = ROLE_RANK[roleA] ?? 99;
  const rankB = ROLE_RANK[roleB] ?? 99;
  return rankA <= rankB;
}

/**
 * Returns human-readable Italian label for a role.
 * @param {string} role
 * @returns {string}
 */
export function roleLabel(role) {
  const labels = {
    [ROLES.ADMIN]:     "Amministratore",
    [ROLES.MANAGER]:   "Manager",
    [ROLES.AGENTE]:    "Agente",
    [ROLES.MAGAZZINO]: "Magazzino",
    [ROLES.CONTABILE]: "Contabile",
  };
  return labels[role] || role || "—";
}
