// services/exportService.js
// Utility for exporting data to CSV. No Firestore access — pure data transforms.

/**
 * Convert an array of objects to a CSV string.
 * @param {string[]} headers - Display header names (in order)
 * @param {string[]} fields  - Object field names matching headers
 * @param {object[]} rows    - Array of data objects
 * @returns {string} CSV text with BOM for Excel UTF-8 compatibility
 */
export function toCSV(headers, fields, rows) {
  const escape = (v) => {
    const s = String(v ?? '').replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };

  const lines = [
    headers.map(escape).join(','),
    ...rows.map(r => fields.map(f => escape(r[f] ?? '')).join(',')),
  ];

  // BOM for Excel UTF-8
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * Trigger a CSV file download in the browser.
 * @param {string} csv      - CSV content
 * @param {string} filename - File name (without extension)
 */
export function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ── Preset exporters for each entity type ──

export function exportIncassi(incomes) {
  const headers = ['Data', 'Cliente', 'Importo (€)', 'Tipo', 'Note', 'ID Ordine'];
  const fields  = ['dateISO', 'clientName', 'amount', 'paymentType', 'note', 'orderId'];
  downloadCSV(toCSV(headers, fields, incomes), `incassi_${_today()}`);
}

export function exportSpese(expenses) {
  const headers = ['Data', 'Descrizione', 'Importo (€)', 'Categoria', 'Note'];
  const fields  = ['dateISO', 'description', 'amount', 'category', 'note'];
  const rows = expenses.map(e => ({
    ...e,
    dateISO: e.dateISO || e.date || '',
    description: e.note || e.description || e.category || '',
  }));
  downloadCSV(toCSV(headers, fields, rows), `spese_${_today()}`);
}

export function exportOrdini(orders) {
  const headers = ['Data', 'Cliente', 'Totale (€)', 'Acconto (€)', 'Stato', 'Note'];
  const fields  = ['createdAtISO', 'clientName', 'total', 'deposit', 'status', 'note'];
  const rows = orders.map(o => ({
    ...o,
    createdAtISO: String(o.createdAtISO || '').slice(0, 10),
  }));
  downloadCSV(toCSV(headers, fields, rows), `ordini_${_today()}`);
}

export function exportScadenze(deadlines) {
  const headers = ['Data', 'Descrizione', 'Importo (€)', 'Note'];
  const fields  = ['dateISO', 'note', 'amount', 'extraNote'];
  const rows = deadlines.map(d => ({
    ...d,
    extraNote: d.description || '',
  }));
  downloadCSV(toCSV(headers, fields, rows), `scadenze_${_today()}`);
}

export function exportClienti(clients) {
  const headers = ['Nome', 'Email', 'Telefono', 'Totale Ordini (€)'];
  const fields  = ['name', 'email', 'phone', 'totalOrders'];
  downloadCSV(toCSV(headers, fields, clients), `clienti_${_today()}`);
}

function _today() {
  return new Date().toISOString().slice(0, 10);
}

// ── M4-B: XML Export ──────────────────────────────────────────────────────

/**
 * Generate a simple XML string from an array of objects.
 * @param {object[]} data
 * @param {string} rootTag
 * @param {string} rowTag
 * @returns {string}
 */
export function exportToXML(data, rootTag = 'data', rowTag = 'item') {
  const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const rows = data.map(item =>
    `  <${rowTag}>\n` +
    Object.entries(item).map(([k, v]) => `    <${esc(k)}>${esc(v)}</${esc(k)}>`).join('\n') +
    `\n  </${rowTag}>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${rootTag}>\n${rows}\n</${rootTag}>`;
}

/**
 * Download generated XML as a file.
 * @param {string} xml
 * @param {string} filename
 */
export function downloadXML(xml, filename) {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.xml`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// ── M4-B: PDF Export (print approach) ─────────────────────────────────────

/**
 * Export a table as a printable PDF via window.print().
 * @param {string} tableHtml - Full HTML of the table
 * @param {string} title     - Page title shown in PDF header
 */
export function exportToPDF(tableHtml, title = 'Report') {
  // Full HTML-escape for the title (user-supplied string).
  // tableHtml is always generated internally by analytics.js using escapeHtml()
  // on every cell value, so it is already sanitized before being passed here.
  const esc = (s) => String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  let printDiv = document.getElementById('_pdf-print-div');
  if (!printDiv) {
    printDiv = document.createElement('div');
    printDiv.id = '_pdf-print-div';
    printDiv.style.cssText = 'display:none;position:fixed;inset:0;background:#fff;z-index:99999;padding:24px;';
    document.body.appendChild(printDiv);
  }
  printDiv.innerHTML = `<style>
    @media print {
      body > *:not(#_pdf-print-div) { display: none !important; }
      #_pdf-print-div { display: block !important; }
    }
    #_pdf-print-div table { width:100%; border-collapse:collapse; font-size:12px; }
    #_pdf-print-div th, #_pdf-print-div td { border:1px solid #999; padding:6px 10px; }
    #_pdf-print-div th { background:#f0f0f0; }
    #_pdf-print-div h2 { margin-bottom:12px; }
  </style>
  <h2>${esc(title)}</h2>
  ${tableHtml}`;
  printDiv.style.display = 'block';
  window.print();
  setTimeout(() => {
    printDiv.style.display = 'none';
    printDiv.innerHTML = '';
  }, 1000);
}
