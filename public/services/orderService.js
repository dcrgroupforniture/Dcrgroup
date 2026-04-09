// services/orderService.js
// Centralized Orders access (no UI should query Firestore directly).

import { firestoreService as fs } from "./firestoreService.js";
import { QUERY } from "./queryRegistry.js";
import { normalizeOrder } from "./schemaService.js";

export async function listOrders() {
  const raw = await fs.getAllFromQuery(QUERY.ORDERS_ALL(), { name: "ORDERS_ALL" });
  return raw.map(normalizeOrder);
}

export async function listOrdersByClient(clientId) {
  if (!clientId) return [];
  const raw = await fs.getAllFromQuery(QUERY.ORDERS_BY_CLIENT(clientId), { name: "ORDERS_BY_CLIENT" });
  return raw.map(normalizeOrder);
}

export function calcOutstandingForOrder(order) {
  const total = Number(order?.total) || 0;
  const dep = Number(order?.deposit) || 0;
  if (dep <= 0) return 0;
  return Math.max(0, total - dep);
}
