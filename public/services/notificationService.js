// services/notificationService.js
// Calcola alert in-app per: scadenze in arrivo, fatture scadute e solleciti pending.
// Tutte le funzioni sono pure (accettano array di dati già caricati) per testabilità.
// La funzione fetchNotifications() carica i dati da Firestore in modo lazy.

import { firestoreService as fs } from './firestoreService.js';
import { QUERY } from './queryRegistry.js';
import { normalizeDeadline } from './schemaService.js';

// ─── Types ────────────────────────────────────────────────────────────────────
// Notification object shape:
// { id: string, type: 'scadenza'|'fattura'|'sollecito', severity: 'warning'|'danger', title: string, detail: string, link: string }

// ─── Pure helpers (exported for testing) ─────────────────────────────────────

/**
 * Returns ISO date string for today + N days.
 * @param {number} days
 * @param {string} [baseISO] - base date (defaults to today)
 * @returns {string}
 */
export function addDays(days, baseISO) {
  const d = baseISO ? new Date(baseISO + 'T00:00:00') : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Filter deadlines that are unpaid and due within the next `days` days.
 * @param {object[]} deadlines - normalized deadline objects (dateISO, amount, note, pagata, isDeleted)
 * @param {number} [days=7]
 * @param {string} [todayISO]
 * @returns {object[]}
 */
export function filterUpcomingDeadlines(deadlines, days = 7, todayISO) {
  const today = todayISO || new Date().toISOString().slice(0, 10);
  const limit = addDays(days, today);
  return (deadlines || []).filter(d =>
    !d.isDeleted &&
    !d.pagata &&
    d.dateISO >= today &&
    d.dateISO <= limit &&
    (d.amount || 0) > 0
  );
}

/**
 * Filter deadlines that are overdue (date < today, not paid).
 * @param {object[]} deadlines
 * @param {string} [todayISO]
 * @returns {object[]}
 */
export function filterOverdueDeadlines(deadlines, todayISO) {
  const today = todayISO || new Date().toISOString().slice(0, 10);
  return (deadlines || []).filter(d =>
    !d.isDeleted &&
    !d.pagata &&
    d.dateISO < today &&
    (d.amount || 0) > 0
  );
}

/**
 * Filter invoices (fatture) that are past due and have an outstanding balance.
 * @param {object[]} fatture - raw fatture from Firestore
 * @param {string} [todayISO]
 * @returns {object[]}
 */
export function filterOverdueFatture(fatture, todayISO) {
  const today = todayISO || new Date().toISOString().slice(0, 10);
  return (fatture || []).filter(f =>
    f.dataScadenza &&
    f.dataScadenza < today &&
    !['pagata', 'annullata', 'bozza'].includes(f.stato) &&
    (Number(f.totale || 0) - Number(f.totalePagato || 0)) > 0
  );
}

/**
 * Filter solleciti (invoice reminders) that have not been sent yet.
 * @param {object[]} solleciti - raw solleciti from Firestore
 * @returns {object[]}
 */
export function filterPendingSolleciti(solleciti) {
  return (solleciti || []).filter(s =>
    s.stato !== 'inviato' && s.stato !== 'annullato'
  );
}

/**
 * Build notification array from pre-loaded data arrays.
 * All parameters are optional; missing arrays produce zero alerts.
 *
 * @param {object} params
 * @param {object[]} [params.deadlines]   - normalized deadlines
 * @param {object[]} [params.fatture]     - raw fatture
 * @param {object[]} [params.solleciti]   - raw solleciti
 * @param {number}   [params.upcomingDays=7]
 * @param {string}   [params.todayISO]
 * @returns {{ notifications: object[], count: number }}
 */
export function buildNotifications({ deadlines = [], fatture = [], solleciti = [], upcomingDays = 7, todayISO } = {}) {
  const today = todayISO || new Date().toISOString().slice(0, 10);
  const notifications = [];

  // 1. Scadenze in arrivo
  const upcoming = filterUpcomingDeadlines(deadlines, upcomingDays, today);
  if (upcoming.length > 0) {
    const total = upcoming.reduce((s, d) => s + (d.amount || 0), 0);
    notifications.push({
      id:       'scadenze_upcoming',
      type:     'scadenza',
      severity: 'warning',
      title:    `${upcoming.length} scadenz${upcoming.length === 1 ? 'a' : 'e'} nei prossimi ${upcomingDays} giorni`,
      detail:   `Totale: ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(total)}`,
      link:     '/scadenze.html',
    });
  }

  // 2. Scadenze scadute non pagate
  const overdue = filterOverdueDeadlines(deadlines, today);
  if (overdue.length > 0) {
    const total = overdue.reduce((s, d) => s + (d.amount || 0), 0);
    notifications.push({
      id:       'scadenze_overdue',
      type:     'scadenza',
      severity: 'danger',
      title:    `${overdue.length} scadenz${overdue.length === 1 ? 'a' : 'e'} scadut${overdue.length === 1 ? 'a' : 'e'} non pagate`,
      detail:   `Totale: ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(total)}`,
      link:     '/scadenze.html',
    });
  }

  // 3. Fatture scadute
  const overdueFatt = filterOverdueFatture(fatture, today);
  if (overdueFatt.length > 0) {
    const total = overdueFatt.reduce((s, f) => s + Math.max(0, Number(f.totale || 0) - Number(f.totalePagato || 0)), 0);
    notifications.push({
      id:       'fatture_overdue',
      type:     'fattura',
      severity: 'danger',
      title:    `${overdueFatt.length} fattur${overdueFatt.length === 1 ? 'a scaduta' : 'e scadute'} non pagate`,
      detail:   `Esposto: ${new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(total)}`,
      link:     '/solleciti.html',
    });
  }

  // 4. Solleciti pending
  const pending = filterPendingSolleciti(solleciti);
  if (pending.length > 0) {
    notifications.push({
      id:       'solleciti_pending',
      type:     'sollecito',
      severity: 'warning',
      title:    `${pending.length} sollecit${pending.length === 1 ? 'o da inviare' : 'i da inviare'}`,
      detail:   'Vai a Solleciti per inviarli',
      link:     '/solleciti.html',
    });
  }

  return { notifications, count: notifications.length };
}

// ─── Firestore fetch ───────────────────────────────────────────────────────────

let _cached = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch notifications from Firestore, with a 5-minute in-memory cache.
 * Never throws — returns { notifications: [], count: 0 } on any error.
 * @param {{ force?: boolean, upcomingDays?: number }} [opts]
 * @returns {Promise<{ notifications: object[], count: number }>}
 */
export async function fetchNotifications({ force = false, upcomingDays = 7 } = {}) {
  if (!force && _cached && Date.now() < _cacheExpiry) return _cached;

  try {
    const [rawDeadlines, rawFatture, rawSolleciti] = await Promise.all([
      fs.getAllFromQuery(QUERY.DEADLINES_ALL(), { name: 'DEADLINES_ALL' }).catch(() => []),
      fs.getAllFromQuery(QUERY.FATTURE_ALL(),   { name: 'FATTURE_ALL'   }).catch(() => []),
      fs.getAllFromQuery(QUERY.SOLLECITI_ALL(), { name: 'SOLLECITI_ALL' }).catch(() => []),
    ]);

    const deadlines = rawDeadlines.map(normalizeDeadline);
    const result = buildNotifications({ deadlines, fatture: rawFatture, solleciti: rawSolleciti, upcomingDays });
    _cached = result;
    _cacheExpiry = Date.now() + CACHE_TTL_MS;
    return result;
  } catch (e) {
    console.warn('[notificationService] fetch failed:', e);
    return { notifications: [], count: 0 };
  }
}

/**
 * Invalidate the notifications cache (call after a write that may affect alerts).
 */
export function invalidateNotificationsCache() {
  _cached = null;
  _cacheExpiry = 0;
}
