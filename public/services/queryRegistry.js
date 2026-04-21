// services/queryRegistry.js
// Single source of truth for Firestore queries (centralization).
//
// AUTO-SCOPING: Every _ALL query factory automatically filters by the active
// tenant's companyId (via firestoreService.getActiveCompanyId()) when a tenant
// context has been set via auth-guard. Falls back to an unscoped query for
// backwards compatibility when no context is set (e.g. tests, legacy mode).

import { firestoreService as fs } from "./firestoreService.js";

/**
 * Creates a query factory that auto-scopes to the active company when one is set.
 * @param {string} colName - Firestore collection name
 * @returns {() => import("firebase/firestore").Query}
 */
function scopedAll(colName) {
  return () => {
    const cid = fs.getActiveCompanyId();
    if (cid) return fs.query(fs.col(colName), fs.where("companyId", "==", cid));
    return fs.query(fs.col(colName));
  };
}

export const QUERY = {
  // ─── Core collections (auto-scoped to active company) ─────────────────────
  CLIENTS_ALL:          scopedAll("clients"),
  ORDERS_ALL:           scopedAll("orders"),
  INCOMES_ALL:          scopedAll("incassi"),
  EXPENSES_ALL:         scopedAll("expenses"),
  DEADLINES_ALL:        scopedAll("scadenze"),
  SUPPLIERS_ALL:        scopedAll("suppliers"),
  PAYMENTS_ALL:         scopedAll("payments"),
  PRICE_REQUESTS_ALL:   scopedAll("priceRequests"),

  // ─── New collections (auto-scoped to active company) ──────────────────────
  TRATTATIVE_ALL:       scopedAll("trattative"),
  OFFERTE_ALL:          scopedAll("offerte"),
  FATTURE_ALL:          scopedAll("fatture"),
  PAGAMENTI_ALL:        scopedAll("pagamenti"),
  CRM_ATTIVITA_ALL:     scopedAll("crmAttivita"),
  MANDANTI_ALL:         scopedAll("mandanti"),
  SCONTI_ALL:           scopedAll("sconti"),
  SOLLECITI_ALL:        scopedAll("solleciti"),
  LISTINI_ITEMS_ALL:    scopedAll("listiniItems"),
  SCADENZE_FINANCE_ALL: scopedAll("scadenzeFinance"),
  MAILING_CAMPAIGNS_ALL: scopedAll("mailingCampaigns"),
  MAILING_LOGS_ALL:     scopedAll("mailingLogs"),
  BUDGET_ALL:           scopedAll("budget"),
  AGENDA_EVENTS_ALL:    scopedAll("agendaEvents"),
  NOTIFICATIONS_ALL:    scopedAll("notifications"),

  // ─── Filtered queries (auto-scope company when active) ────────────────────
  ORDERS_BY_CLIENT: (clientId) => {
    const cid = fs.getActiveCompanyId();
    if (cid) return fs.query(fs.col("orders"), fs.where("clientId", "==", clientId), fs.where("companyId", "==", cid));
    return fs.query(fs.col("orders"), fs.where("clientId", "==", clientId));
  },

  // ─── Explicit BY_COMPANY variants (for cross-company admin use) ───────────
  CLIENTS_BY_COMPANY: (companyId) =>
    fs.query(fs.col("clients"), fs.where("companyId", "==", companyId)),
  ORDERS_BY_COMPANY: (companyId) =>
    fs.query(fs.col("orders"), fs.where("companyId", "==", companyId)),
  INCOMES_BY_COMPANY: (companyId) =>
    fs.query(fs.col("incassi"), fs.where("companyId", "==", companyId)),
  EXPENSES_BY_COMPANY: (companyId) =>
    fs.query(fs.col("expenses"), fs.where("companyId", "==", companyId)),
  DEADLINES_BY_COMPANY: (companyId) =>
    fs.query(fs.col("scadenze"), fs.where("companyId", "==", companyId)),
  SUPPLIERS_BY_COMPANY: (companyId) =>
    fs.query(fs.col("suppliers"), fs.where("companyId", "==", companyId)),
  PAYMENTS_BY_COMPANY: (companyId) =>
    fs.query(fs.col("payments"), fs.where("companyId", "==", companyId)),
  ORDERS_BY_CLIENT_AND_COMPANY: (clientId, companyId) =>
    fs.query(fs.col("orders"),
      fs.where("clientId", "==", clientId),
      fs.where("companyId", "==", companyId)),

  /**
   * Returns a set of queries explicitly scoped to a specific company.
   * Useful for admin views that need to query a different company's data.
   * For normal tenant-scoped reads, QUERY._ALL() auto-scopes automatically.
   * @param {string} companyId
   */
  forCompany(companyId) {
    if (!companyId) return QUERY;
    const byCol = (col) => () => fs.query(fs.col(col), fs.where("companyId", "==", companyId));
    return {
      CLIENTS_ALL:          byCol("clients"),
      ORDERS_ALL:           byCol("orders"),
      INCOMES_ALL:          byCol("incassi"),
      EXPENSES_ALL:         byCol("expenses"),
      DEADLINES_ALL:        byCol("scadenze"),
      SUPPLIERS_ALL:        byCol("suppliers"),
      PAYMENTS_ALL:         byCol("payments"),
      PRICE_REQUESTS_ALL:   byCol("priceRequests"),
      TRATTATIVE_ALL:       byCol("trattative"),
      OFFERTE_ALL:          byCol("offerte"),
      FATTURE_ALL:          byCol("fatture"),
      PAGAMENTI_ALL:        byCol("pagamenti"),
      CRM_ATTIVITA_ALL:     byCol("crmAttivita"),
      MANDANTI_ALL:         byCol("mandanti"),
      SCONTI_ALL:           byCol("sconti"),
      SOLLECITI_ALL:        byCol("solleciti"),
      LISTINI_ITEMS_ALL:    byCol("listiniItems"),
      SCADENZE_FINANCE_ALL: byCol("scadenzeFinance"),
      MAILING_CAMPAIGNS_ALL: byCol("mailingCampaigns"),
      MAILING_LOGS_ALL:     byCol("mailingLogs"),
      BUDGET_ALL:           byCol("budget"),
      AGENDA_EVENTS_ALL:    byCol("agendaEvents"),
      NOTIFICATIONS_ALL:    byCol("notifications"),
      ORDERS_BY_CLIENT: (clientId) => QUERY.ORDERS_BY_CLIENT_AND_COMPANY(clientId, companyId),
    };
  },
};

export const QUERY_META = [
  { name: "CLIENTS_ALL",          col: "clients" },
  { name: "ORDERS_ALL",           col: "orders" },
  { name: "INCOMES_ALL",          col: "incassi" },
  { name: "EXPENSES_ALL",         col: "expenses" },
  { name: "DEADLINES_ALL",        col: "scadenze" },
  { name: "SUPPLIERS_ALL",        col: "suppliers" },
  { name: "PAYMENTS_ALL",         col: "payments" },
  { name: "ORDERS_BY_CLIENT",     col: "orders",        where: "clientId == ?" },
  { name: "PRICE_REQUESTS_ALL",   col: "priceRequests" },
  { name: "TRATTATIVE_ALL",       col: "trattative" },
  { name: "OFFERTE_ALL",          col: "offerte" },
  { name: "FATTURE_ALL",          col: "fatture" },
  { name: "PAGAMENTI_ALL",        col: "pagamenti" },
  { name: "CRM_ATTIVITA_ALL",     col: "crmAttivita" },
  { name: "MANDANTI_ALL",         col: "mandanti" },
  { name: "SCONTI_ALL",           col: "sconti" },
  { name: "SOLLECITI_ALL",        col: "solleciti" },
  { name: "LISTINI_ITEMS_ALL",    col: "listiniItems" },
  { name: "SCADENZE_FINANCE_ALL", col: "scadenzeFinance" },
  { name: "MAILING_CAMPAIGNS_ALL", col: "mailingCampaigns" },
  { name: "MAILING_LOGS_ALL",     col: "mailingLogs" },
  { name: "BUDGET_ALL",           col: "budget" },
  { name: "AGENDA_EVENTS_ALL",    col: "agendaEvents" },
  { name: "NOTIFICATIONS_ALL",    col: "notifications" },
];
