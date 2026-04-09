// services/incomeService.js
// Single source of truth for incassi (manual + automatic) and KPI datasets.

import { firestoreService as fs } from "./firestoreService.js";
import { QUERY } from "./queryRegistry.js";
import { normalizeIncome, normalizeOrder, schemaUtils } from "./schemaService.js";

const USER_ALIASES = {
  "MORENA": "FORMICA MORENA LUCIA",
  "MARIA RITA": "TOLEDO MARIA RITA",
  "TOLEDO": "TOLEDO MARIA RITA",
  "MATINO": "MARINO FRANCESCO",
  "MARINO": "MARINO FRANCESCO",
  "SIGNORA BELLA": "SIGNORA BELLA",
  "SGNORA BELLA": "SIGNORA BELLA",
  "ELENA": "TERRANOVA MARIA ELENA",
  "MAIDA": "MAIDA RITA",
  "GIOVANNA CARDIZARO": "GIOVANNA CARDIZZARO",
  "GIOVANNA CARDIZZARO": "GIOVANNA CARDIZZARO",
  "MANGIAPANE": "MANGIAPANE GIUSEPPINA",
  "PIRRELLO": "PARRUCCHIERIA PIRRELLO",
  "MUNDA": "MUNDA MARIA RITA",
  "BELLAVIA ELVIRA": "BELLAVIA ELVIRA",
  "MILITELLO BRUNELLA": "MILITELLO BRUNELLA",
  "VITELLO GAETANO": "VITELLO GAETANO",
  "VITELLO PIETRO": "VITELLO PIETRO",
  "VALERIA GUELI": "GUELI VALERIA",
  "SANCATALDO": "BAGLIO SAN CATALDO",
  "SANCATALDO BAGLIO": "BAGLIO SAN CATALDO",
  "PALMERI": "PALMERI NUNZIA",
  "ALESSIA FAVATA": "FAVATA ALESSIA",
  "ELISA RUSSOTTO": "HAIR BEAUTY DI RUSSOTTO ELISA",
  "MELINDA": "MELINDA",
  "SAMANTHA": "SAMANTHA",
  "CIPOLLA": "CIPOLLA",
  "TOLEDO 50": "TOLEDO MARIA RITA",
};

function canonicalName(v) {
  return String(v || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAmountFromLine(line) {
  if (!line) return 0;
  const matches = String(line).match(/\d+(?:[.,]\d+)?/g);
  if (!matches?.length) return 0;
  const last = matches[matches.length - 1].replace(",", ".");
  const n = Number(last);
  return Number.isFinite(n) ? n : 0;
}

function extractNameFromLine(line) {
  const s = String(line || "").trim();
  if (!s) return "";
  const amount = parseAmountFromLine(s);
  if (!amount) return s;
  const idx = s.lastIndexOf(String(amount).replace(".", ","));
  if (idx > 0) return s.slice(0, idx).replace(/[,(][^)]+[)]/g, " ").trim();
  return s.replace(/\d+(?:[.,]\d+)?[^\d]*$/g, "").replace(/[,(][^)]+[)]/g, " ").trim();
}

function sumAmountsFromNotes(note) {
  return String(note || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .reduce((s, l) => s + parseAmountFromLine(l), 0);
}

function isGhostKnown(dateISO, amount, note, clientName) {
  const day = String(dateISO || '');
  const a = Number(amount);
  const c = String(clientName || '').toLowerCase();
  const n = String(note || '').toLowerCase();

  if (day === '2026-02-26') {
    if (!Number.isFinite(a) || Math.abs(a - 750) > 0.01) return false;
    return c.includes('maida') || n.includes('maida');
  }

  if (day === '2026-03-06') {
    if (!Number.isFinite(a) || Math.abs(a - 350) > 0.01) return false;
    return c.includes('maida') || n.includes('maida');
  }

  if (day === '2026-03-11') {
    if (!Number.isFinite(a) || Math.abs(a - 372) > 0.01) return false;
    return c.includes('militello') || c.includes('brunella') || n.includes('militello') || n.includes('brunella');
  }

  return false;
}

function withinYear(dateISO, year) {
  return String(dateISO || "").startsWith(String(year) + "-");
}

function withinMonth(dateISO, year, month1to12) {
  return String(dateISO || "").startsWith(`${year}-${String(month1to12).padStart(2, "0")}-`);
}

function buildClientResolver(clientsRaw = []) {
  const byCanon = new Map();
  for (const c of clientsRaw) {
    const name = String(c.name || c.nome || c.ragioneSociale || "").trim();
    if (!name) continue;
    const canon = canonicalName(name);
    byCanon.set(canon, { clientId: c.id, clientName: name });
  }

  function resolve(raw) {
    const original = String(raw || "").trim();
    if (!original) return { clientId: "", clientName: "" };
    const canon = canonicalName(original);
    const alias = USER_ALIASES[canon] || canon;
    if (byCanon.has(alias)) return byCanon.get(alias);
    if (byCanon.has(canon)) return byCanon.get(canon);

    // contains match, useful for partial notes like "MANGIAPANE" or "TOLEDO MARIA"
    for (const [key, val] of byCanon.entries()) {
      if (key.includes(alias) || alias.includes(key)) return val;
    }
    return { clientId: "", clientName: original };
  }

  return { resolve };
}

function extractClientNameFromIncomeNote(note) {
  const s = String(note || "").trim();
  if (!s) return "";
  // Typical order sync note: "CLIENTE • €300,00 • saldo"
  if (s.includes("•")) {
    const first = s.split("•")[0].trim();
    if (first) return first;
  }
  // Fallback: use first non-empty line and strip trailing amount
  const line = s.split(/\r?\n/).map(x => x.trim()).find(Boolean) || "";
  if (!line) return "";
  return extractNameFromLine(line);
}

function resolveIncomeIdentity(n, resolver, ordersById, clientsById) {
  const order = String(n.orderId || "").trim() ? ordersById.get(String(n.orderId || "").trim()) : null;
  const rawName = String(
    n.clientName ||
    order?.clientName ||
    clientsById.get(String(n.clientId || "").trim())?.name ||
    clientsById.get(String(order?.clientId || "").trim())?.name ||
    extractClientNameFromIncomeNote(n.note) ||
    ""
  ).trim();

  const mapped = resolver.resolve(rawName);
  const clientId = String(
    n.clientId ||
    order?.clientId ||
    mapped.clientId ||
    ""
  ).trim();

  const byIdName = clientsById.get(clientId)?.name || clientsById.get(clientId)?.nome || "";
  const clientName = String(
    byIdName ||
    mapped.clientName ||
    rawName ||
    ""
  ).trim();

  return { clientId, clientName, order };
}

function entriesFromLegacyDayDoc(dayISO, data, resolver) {
  const entries = [];
  const arr = Array.isArray(data?.entries) ? data.entries : [];
  if (arr.length) {
    for (const item of arr) {
      const amount = Number(item?.amount);
      if (!(amount > 0)) continue;
      const rawName = String(item?.clientName || item?.cliente || item?.name || "").trim();
      const mapped = resolver.resolve(rawName);
      entries.push({
        id: `${dayISO}#${entries.length + 1}`,
        dateISO: dayISO,
        amount: Number(amount.toFixed(2)),
        note: String(item?.note || "").trim() || `${mapped.clientName || rawName} ${amount}`,
        source: "manuale",
        orderId: "",
        clientId: mapped.clientId || "",
        clientName: mapped.clientName || rawName,
      });
    }
    return entries;
  }

  const lines = String(data?.note || data?.notes || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const amount = parseAmountFromLine(line);
    if (!(amount > 0)) continue;
    const rawName = extractNameFromLine(line);
    const mapped = resolver.resolve(rawName);
    entries.push({
      id: `${dayISO}#${entries.length + 1}`,
      dateISO: dayISO,
      amount: Number(amount.toFixed(2)),
      note: line,
      source: "manuale",
      orderId: "",
      clientId: mapped.clientId || "",
      clientName: mapped.clientName || rawName,
    });
  }
  return entries;
}

export async function getNormalizedIncomesAndOrders() {
  const [incRaw, ordersRaw, clientsRaw] = await Promise.all([
    fs.getAllFromQuery(QUERY.INCOMES_ALL(), { name: "INCOMES_ALL" }),
    fs.getAllFromQuery(QUERY.ORDERS_ALL(), { name: "ORDERS_ALL" }),
    fs.getAllFromQuery(QUERY.CLIENTS_ALL(), { name: "CLIENTS_ALL" }),
  ]);

  const resolver = buildClientResolver(clientsRaw);
  const orders = ordersRaw.map(normalizeOrder);
  const orderIds = new Set(orders.map((o) => o.id));
  const ordersById = new Map(orders.map((o) => [String(o.id || "").trim(), o]));
  const clientsById = new Map(clientsRaw.map((c) => [String(c.id || "").trim(), c]));
  const incomes = [];
  const manualKeys = new Set();
  const manualDays = new Set();

  const dayDocs = [];
  const normalDocs = [];
  for (const d of incRaw) {
    const x = d || {};
    const isDayDoc = /^\d{4}-\d{2}-\d{2}$/.test(String(d?.id || "")) && !x.orderId && !x.clientId && !x.createdAt;
    if (isDayDoc) dayDocs.push(d); else normalDocs.push(d);
  }

  // PASS 1: manual day documents always win for that day.
  for (const d of dayDocs) {
    const dayISO = schemaUtils.dateISOFromAny(d.id, d.id);
    if (!dayISO) continue;
    manualDays.add(dayISO);
    const parsed = entriesFromLegacyDayDoc(dayISO, d || {}, resolver);
    for (const e of parsed) {
      if (isGhostKnown(e.dateISO, e.amount, e.note, e.clientName)) continue;
      const mkey = `${e.dateISO}|${canonicalName(e.clientName)}|${Number(e.amount).toFixed(2)}`;
      manualKeys.add(mkey);
      incomes.push(e);
    }
  }

  // PASS 2: normal records / auto order records.
  for (const d of normalDocs) {
    const n = normalizeIncome(d);
    if (!n.dateISO || n.isDeleted) continue;
    const oid = String(n.orderId || "").trim();
    if (oid && !orderIds.has(oid)) continue;

    // If a manual day document exists for the same date, use ONLY the manual snapshot for that day.
    const isOrderAuto = Boolean(oid) || String(n.source || '').toLowerCase() === 'ordine';
    if (manualDays.has(n.dateISO) && !isOrderAuto) continue;

    let amount = n.amount;
    if (!Number.isFinite(amount) || amount <= 0) amount = Number(sumAmountsFromNotes(n.note).toFixed(2));
    if (!(amount > 0)) continue;

    const { clientId, clientName } = resolveIncomeIdentity(n, resolver, ordersById, clientsById);
    if (isGhostKnown(n.dateISO, amount, n.note, clientName)) continue;
    const mkey = `${n.dateISO}|${canonicalName(clientName)}|${Number(amount).toFixed(2)}`;
    if (manualKeys.has(mkey)) continue;

    incomes.push({
      id: n.id,
      dateISO: n.dateISO,
      amount: Number(amount.toFixed(2)),
      note: n.note,
      source: oid ? "ordine" : String(n.source || "manuale"),
      orderId: oid,
      clientId,
      clientName,
      kind: String(n.kind || n.paymentType || ''),
      paymentType: String(n.paymentType || n.kind || ''),
    });
  }

  incomes.sort((a, b) => `${a.dateISO}|${a.clientName}`.localeCompare(`${b.dateISO}|${b.clientName}`));
  return { incomes, orders, clients: clientsRaw, resolver };
}

export async function getYearlyIncomesTotal(year) {
  const { incomes } = await getNormalizedIncomesAndOrders();
  return Number(incomes.filter((i) => withinYear(i.dateISO, year)).reduce((s, i) => s + i.amount, 0).toFixed(2));
}

export async function getMonthlyIncomesTotal(year, month1to12) {
  const { incomes } = await getNormalizedIncomesAndOrders();
  return Number(incomes.filter((i) => withinMonth(i.dateISO, year, month1to12)).reduce((s, i) => s + i.amount, 0).toFixed(2));
}

export async function getDailyIncomesTotal(dateISO) {
  const { incomes } = await getNormalizedIncomesAndOrders();
  return Number(incomes.filter((i) => i.dateISO === String(dateISO).slice(0,10)).reduce((s, i) => s + i.amount, 0).toFixed(2));
}

export async function getCalendarByMonth(year, month1to12) {
  const { incomes } = await getNormalizedIncomesAndOrders();
  const map = new Map();
  for (const i of incomes) {
    if (!withinMonth(i.dateISO, year, month1to12)) continue;
    map.set(i.dateISO, Number(((map.get(i.dateISO) || 0) + i.amount).toFixed(2)));
  }
  return map;
}

export async function getYearlyMonthlySeries(year) {
  const { incomes } = await getNormalizedIncomesAndOrders();
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const values = months.map((m) => Number(incomes.filter((i) => withinMonth(i.dateISO, year, m)).reduce((s, i) => s + i.amount, 0).toFixed(2)));
  return { months, values };
}

export async function getOutstandingByMonth(year) {
  const { orders } = await getNormalizedIncomesAndOrders();
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const values = months.map((m) => Number(orders.filter((o) => withinMonth(o.createdAtISO, year, m) && (o.deposit > 0)).reduce((s,o)=>s+Math.max(0,(o.total||0)-(o.deposit||0)),0).toFixed(2)));
  return { months, values };
}

export async function getOutstandingTotal(year) {
  const { orders } = await getNormalizedIncomesAndOrders();
  return Number(orders.reduce((sum, o) => {
    const residual = Number(o?.residual);
    if (Number.isFinite(residual) && residual > 0) return sum + residual;
    const total = Number(o?.total) || 0;
    const deposit = Number(o?.deposit) || 0;
    const status = String(o?.status || '').toLowerCase();
    if (status === 'da_incassare' && total > 0) return sum + total;
    if (deposit > 0 && total > deposit) return sum + (total - deposit);
    return sum;
  }, 0).toFixed(2));
}

export async function listIncomesByDay(dateISO) {
  const key = String(dateISO).slice(0,10);
  const { incomes } = await getNormalizedIncomesAndOrders();
  return incomes.filter((i) => i.dateISO === key).sort((a,b)=>(a.clientName||"").localeCompare(b.clientName||""));
}

export async function listIncomesByMonth(year, month1to12) {
  const { incomes } = await getNormalizedIncomesAndOrders();
  return incomes.filter((i)=>withinMonth(i.dateISO, year, month1to12)).sort((a,b)=>`${a.dateISO}|${a.clientName}`.localeCompare(`${b.dateISO}|${b.clientName}`));
}

export async function listIncomesByYear(year) {
  const { incomes } = await getNormalizedIncomesAndOrders();
  return incomes.filter((i)=>withinYear(i.dateISO, year)).sort((a,b)=>`${a.dateISO}|${a.clientName}`.localeCompare(`${b.dateISO}|${b.clientName}`));
}

export async function getManualDaySnapshot(dayISO) {
  const raw = await fs.getDoc('incassi', dayISO);
  const { clients = [], resolver } = await getNormalizedIncomesAndOrders();
  let rows = [];
  const seen = new Set();

  const pushDeduped = (clientName, amount, note = '') => {
    const cleanName = String(clientName || '').trim();
    const amt = Number(amount);
    if (!(amt > 0)) return;
    const mapped = resolver.resolve(cleanName);
    const finalName = mapped.clientName || cleanName || 'Incasso';
    const key = `${canonicalName(finalName)}|${amt.toFixed(2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      dateISO: dayISO,
      clientId: mapped.clientId || '',
      clientName: finalName,
      amount: Number(amt.toFixed(2)),
      note: note || `${finalName} ${amt}`,
      source: 'manuale',
    });
  };

  if (raw && Array.isArray(raw.entries) && raw.entries.length) {
    for (const item of raw.entries) {
      pushDeduped(item?.clientName || item?.cliente || item?.name || '', item?.amount, item?.note || '');
    }
  } else if (raw && String(raw.note || '').trim()) {
    const parsed = parseEntriesFromFreeText(String(raw.note || ''), clients);
    for (const item of parsed) pushDeduped(item.clientName, item.amount, item.note || '');
  }

  const noteText = rows.map((r)=>`${r.clientName || 'Incasso'} ${String(r.amount).replace('.', ',')}`).join('\n');
  const total = Number(rows.reduce((s,r)=>s+r.amount,0).toFixed(2));
  return { doc: raw, rows, noteText, total };
}

export function parseEntriesFromFreeText(text, clientsRaw = []) {
  const resolver = buildClientResolver(clientsRaw);
  const lines = String(text || '').split(/\r?\n/).map((l)=>l.trim()).filter(Boolean);
  const entries = [];
  for (const line of lines) {
    const amount = parseAmountFromLine(line);
    if (!(amount > 0)) continue;
    const rawName = extractNameFromLine(line);
    const mapped = resolver.resolve(rawName);
    entries.push({
      clientId: mapped.clientId || '',
      clientName: mapped.clientName || rawName,
      amount: Number(amount.toFixed(2)),
      note: line,
    });
  }
  return entries;
}

export const incomeFormat = {
  itMoney: (n) => new Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR' }).format(Number(n)||0),
};
