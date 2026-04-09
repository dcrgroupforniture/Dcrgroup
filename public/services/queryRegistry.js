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
