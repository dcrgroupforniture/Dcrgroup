// services/clientAnalyticsService.js
import { normalizeOrder, normalizeClient } from "./schemaService.js";

const itMoney = (n) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n) || 0);

function monthKey(y, m) {
  return `${y}-${String(m).padStart(2, "0")}`;
}
function safeDate(order) {
  const raw = order.createdAtISO || order.createdAtDate || order.dateISO || order.dateObj || order.date || order.createdAt;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
function orderClientId(o) {
  return o.clientId || o.clientID || o.clienteId || "";
}
function orderClientName(o){
  return String(o.clientName || o.clienteNome || o.cliente || o.nomeCliente || "").trim();
}
function orderTotal(o) {
  const n = Number(o.total || o.totale || o.amount || 0);
  return Number.isFinite(n) ? n : 0;
}
function clientNameFromId(clients, id) {
  const c = clients.find((x) => x.id === id);
  return (c && (c.name || c.nome)) || id || "Cliente";
}

export function buildClientDashboard({ clientsRaw = [], ordersRaw = [] }, year) {
  const clients = clientsRaw.map(normalizeClient);
  const orders = ordersRaw.map(normalizeOrder);
  const y = Number(year) || new Date().getFullYear();

  const months = Array.from({ length: 12 }, (_, i) => monthKey(y, i + 1));
  const monthLabels = ["01","02","03","04","05","06","07","08","09","10","11","12"];
  const revenueByMonth = Object.fromEntries(months.map((m) => [m, 0]));
  const ordersByMonth = Object.fromEntries(months.map((m) => [m, 0]));
  const servedByMonth = Object.fromEntries(months.map((m) => [m, new Set()]));
  const revenueByClient = new Map();
  const ordersByClient = new Map();

  for (const o of orders) {
    const d = safeDate(o);
    if (!d || d.getFullYear() !== y) continue;
    const mk = monthKey(y, d.getMonth() + 1);
    const total = orderTotal(o);
    const cid = orderClientId(o) || orderClientName(o);
    revenueByMonth[mk] += total;
    ordersByMonth[mk] += 1;
    if (cid) {
      servedByMonth[mk].add(cid);
      revenueByClient.set(cid, (revenueByClient.get(cid) || 0) + total);
      ordersByClient.set(cid, (ordersByClient.get(cid) || 0) + 1);
    }
  }

  const totalYearRevenue = Object.values(revenueByMonth).reduce((a, b) => a + b, 0);
  const totalYearOrders = Object.values(ordersByMonth).reduce((a, b) => a + b, 0);
  const avgOrder = totalYearOrders > 0 ? totalYearRevenue / totalYearOrders : 0;
  const activeClients = months.map((m) => servedByMonth[m].size);
  const uniqueClientsYear = new Set(Object.values(servedByMonth).flatMap((set) => Array.from(set))).size;
  const totalClientsYear = uniqueClientsYear;
  const revenueSeries = months.map((m) => Number(revenueByMonth[m].toFixed(2)));
  const ordersSeries = months.map((m) => ordersByMonth[m]);

  const topRevenue = Array.from(revenueByClient.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cid, tot], i) => ({
      n: i + 1,
      name: clientNameFromId(clients, cid) || cid || "Cliente",
      tot,
      totFmt: itMoney(tot),
    }));

  const topOrders = Array.from(ordersByClient.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cid, cnt], i) => ({
      n: i + 1,
      name: clientNameFromId(clients, cid) || cid || "Cliente",
      cnt,
    }));

  return {
    year: y,
    months,
    monthLabels,
    avgOrder,
    avgOrderFmt: itMoney(avgOrder),
    activeClients,
    totalClientsYear,
    uniqueClientsYear,
    revenueSeries,
    ordersSeries,
    topRevenue,
    topOrders,
  };
}
