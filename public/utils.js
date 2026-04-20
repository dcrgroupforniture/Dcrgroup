// utils.js — Shared utility functions (ES module)
// Imported by all page modules to eliminate duplicated helper code.

/**
 * Format a number as EUR currency (Italian locale).
 * Returns "€ 0,00" for null, undefined, NaN or 0.
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
export function euro(n) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
}

/**
 * Return today's date as an ISO 8601 string (YYYY-MM-DD).
 * @returns {string}
 */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Escape a string for safe HTML output.
 * Replaces &, <, >, ", ' with their HTML entities.
 * @param {*} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

/**
 * Format an ISO date string (YYYY-MM-DD) as DD/MM/YYYY.
 * Returns '—' for empty or null input.
 * @param {string|null|undefined} iso
 * @returns {string}
 */
export function fmtDate(iso) {
  if (!iso || iso.length < 10) return iso || '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Format a YYYY-MM string as a capitalized Italian month/year label.
 * e.g. "2024-03" → "Marzo 2024"
 * @param {string} ym  e.g. "2024-03"
 * @returns {string}
 */
export function monthLabel(ym) {
  if (!ym || ym.length < 7) return ym || '';
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
