// services/queryRegistry.js
// Single source of truth for Firestore queries (centralization).

import { firestoreService as fs } from "./firestoreService.js";

export const QUERY = {
  CLIENTS_ALL: () => fs.query(fs.col("clients")),
  ORDERS_ALL: () => fs.query(fs.col("orders")),
  INCOMES_ALL: () => fs.query(fs.col("incassi")),
  EXPENSES_ALL: () => fs.query(fs.col("expenses")),
  DEADLINES_ALL: () => fs.query(fs.col("scadenze")),
  SUPPLIERS_ALL: () => fs.query(fs.col("suppliers")),
  PAYMENTS_ALL: () => fs.query(fs.col("payments")),
  ORDERS_BY_CLIENT: (clientId) => fs.query(fs.col("orders"), fs.where("clientId", "==", clientId)),
  PRICE_REQUESTS_ALL: () => fs.query(fs.col("priceRequests")),

  // ─── Tenant-scoped queries ────────────────────────────────────────────────
  // These filter by companyId. Use when multi-tenant isolation is required.

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
   * Returns a set of queries scoped to a specific company.
   * Usage: const q = QUERY.forCompany(companyId); await fs.getAllFromQuery(q.ORDERS_ALL());
   * @param {string} companyId
   */
  forCompany(companyId) {
    if (!companyId) return QUERY;
    return {
      CLIENTS_ALL:      () => QUERY.CLIENTS_BY_COMPANY(companyId),
      ORDERS_ALL:       () => QUERY.ORDERS_BY_COMPANY(companyId),
      INCOMES_ALL:      () => QUERY.INCOMES_BY_COMPANY(companyId),
      EXPENSES_ALL:     () => QUERY.EXPENSES_BY_COMPANY(companyId),
      DEADLINES_ALL:    () => QUERY.DEADLINES_BY_COMPANY(companyId),
      SUPPLIERS_ALL:    () => QUERY.SUPPLIERS_BY_COMPANY(companyId),
      PAYMENTS_ALL:     () => QUERY.PAYMENTS_BY_COMPANY(companyId),
      ORDERS_BY_CLIENT: (clientId) => QUERY.ORDERS_BY_CLIENT_AND_COMPANY(clientId, companyId),
      PRICE_REQUESTS_ALL: () => fs.query(
        fs.col("priceRequests"),
        fs.where("companyId", "==", companyId)
      ),
    };
  },
};

export const QUERY_META = [
  { name: "CLIENTS_ALL", col: "clients" },
  { name: "ORDERS_ALL", col: "orders" },
  { name: "INCOMES_ALL", col: "incassi" },
  { name: "EXPENSES_ALL", col: "expenses" },
  { name: "DEADLINES_ALL", col: "scadenze" },
  { name: "SUPPLIERS_ALL", col: "suppliers" },
  { name: "PAYMENTS_ALL", col: "payments" },
  { name: "ORDERS_BY_CLIENT", col: "orders", where: "clientId == ?" },
  { name: "PRICE_REQUESTS_ALL", col: "priceRequests" },
];
