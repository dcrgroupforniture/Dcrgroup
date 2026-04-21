// analytics.js — Dashboard Analitica (M4-A + M4-B)
import { firestoreService as fs } from './services/firestoreService.js';
import { euro, todayISO, escapeHtml, monthLabel } from './utils.js';
import { toCSV, downloadCSV, exportToPDF, exportToXML, downloadXML } from './services/exportService.js';
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const ALLOWED_NAV = new Set([
  'index.html','clients.html','suppliers.html','listini.html',
  'ordini-clienti.html','incassi.html','spese.html','scadenze.html',
  'agenda.html','statistiche.html','finanze.html','mandanti.html',
  'crm.html','offerte.html','fatture.html','mailing.html',
  'sconti.html','solleciti.html','analytics.html',
]);

let fatture   = [];
let mandanti  = [];
let clienteData  = [];
let mandanteData = [];
let periodoData  = [];

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  init();
});

async function init() {
  setupQuickNav();
  setupAnnoSelect();
  await loadData();
  bindEvents();
}

function setupQuickNav() {
  const sel = document.getElementById('quickNav');
  if (!sel) return;
  sel.addEventListener('change', () => {
    if (sel.value && ALLOWED_NAV.has(sel.value)) window.location.href = sel.value;
  });
}

function setupAnnoSelect() {
  const sel = document.getElementById('filterAnno');
  if (!sel) return;
  const current = new Date().getFullYear();
  for (let y = current; y >= current - 2; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === current) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function loadData() {
  try {
    fatture  = await fs.getAllByCompany('fatture');
    mandanti = await fs.getAllByCompany('mandanti');
  } catch (e) {
    fatture = []; mandanti = [];
  }
  computeAll();
}

function getFilters() {
  return {
    anno: document.getElementById('filterAnno')?.value || String(new Date().getFullYear()),
    mese: document.getElementById('filterMese')?.value || '',
  };
}

function filterFatture() {
  const { anno, mese } = getFilters();
  return fatture.filter(f => {
    if (!f.dataEmissione) return false;
    if (f.stato === 'bozza') return false;
    if (anno && !f.dataEmissione.startsWith(anno)) return false;
    if (mese && f.dataEmissione.slice(5, 7) !== mese) return false;
    return true;
  });
}

function computeAll() {
  const list = filterFatture();

  // KPIs
  const totFatturato   = list.reduce((a, f) => a + Number(f.totale || 0), 0);
  const totIncassato   = list.reduce((a, f) => a + Number(f.totalePagato || 0), 0);
  const totDaIncassare = list.filter(f => f.stato !== 'pagata' && f.stato !== 'annullata')
                             .reduce((a, f) => a + Math.max(0, Number(f.totale || 0) - Number(f.totalePagato || 0)), 0);
  const clientiAttivi  = new Set(list.map(f => f.clienteId).filter(Boolean)).size;

  document.getElementById('kpiFatturato').textContent   = euro(totFatturato);
  document.getElementById('kpiIncassato').textContent   = euro(totIncassato);
  document.getElementById('kpiDaIncassare').textContent = euro(totDaIncassare);
  document.getElementById('kpiClientiAttivi').textContent = clientiAttivi;

  computeByCliente(list);
  computeByMandante(list);
  computeByPeriodo(list);
}

function computeByCliente(list) {
  const map = {};
  list.forEach(f => {
    const key = f.clienteId || '__nessuno__';
    if (!map[key]) map[key] = { clienteNome: f.snapRagioneSociale || f.clienteId || '—', nFatture: 0, fatturato: 0, incassato: 0, daIncassare: 0 };
    map[key].nFatture++;
    map[key].fatturato   += Number(f.totale || 0);
    map[key].incassato   += Number(f.totalePagato || 0);
    if (!['pagata','annullata'].includes(f.stato)) {
      map[key].daIncassare += Math.max(0, Number(f.totale || 0) - Number(f.totalePagato || 0));
    }
  });
  clienteData = Object.values(map).sort((a, b) => b.fatturato - a.fatturato);
  renderSection('bodyCliente', 'tableCliente', 'loadingCliente', 'emptyCliente', clienteData,
    ['clienteNome','nFatture','fatturato','incassato','daIncassare'],
    ['Cliente','N° Fatture','Fatturato','Incassato','Da Incassare'],
    r => [escapeHtml(r.clienteNome), r.nFatture, euro(r.fatturato), euro(r.incassato), euro(r.daIncassare)]
  );
}

function computeByMandante(list) {
  const map = {};
  list.forEach(f => {
    const mn = mandanti.find(m => m.id === f.mandanteId);
    const key = f.mandanteId || '__nessuno__';
    if (!map[key]) map[key] = { mandanteNome: (mn ? (mn.ragioneSociale || mn.nome || '') : f.mandanteId || '—'), nFatture: 0, fatturato: 0, incassato: 0, daIncassare: 0 };
    map[key].nFatture++;
    map[key].fatturato   += Number(f.totale || 0);
    map[key].incassato   += Number(f.totalePagato || 0);
    if (!['pagata','annullata'].includes(f.stato)) {
      map[key].daIncassare += Math.max(0, Number(f.totale || 0) - Number(f.totalePagato || 0));
    }
  });
  mandanteData = Object.values(map).sort((a, b) => b.fatturato - a.fatturato);
  renderSection('bodyMandante', 'tableMandante', 'loadingMandante', 'emptyMandante', mandanteData,
    ['mandanteNome','nFatture','fatturato','incassato','daIncassare'],
    ['Mandante','N° Fatture','Fatturato','Incassato','Da Incassare'],
    r => [escapeHtml(r.mandanteNome), r.nFatture, euro(r.fatturato), euro(r.incassato), euro(r.daIncassare)]
  );
}

function computeByPeriodo(list) {
  const { anno } = getFilters();
  const map = {};
  for (let m = 1; m <= 12; m++) {
    const key = `${anno}-${String(m).padStart(2,'0')}`;
    map[key] = { mese: key, meseLbl: monthLabel(key), nFatture: 0, fatturato: 0, incassato: 0 };
  }
  list.forEach(f => {
    const key = f.dataEmissione ? f.dataEmissione.slice(0, 7) : null;
    if (!key || !map[key]) return;
    map[key].nFatture++;
    map[key].fatturato += Number(f.totale || 0);
    map[key].incassato += Number(f.totalePagato || 0);
  });
  periodoData = Object.values(map);
  renderSection('bodyPeriodo', 'tablePeriodo', 'loadingPeriodo', 'emptyPeriodo', periodoData,
    ['meseLbl','nFatture','fatturato','incassato'],
    ['Mese','Fatture Emesse','Fatturato','Incassato'],
    r => [escapeHtml(r.meseLbl), r.nFatture, euro(r.fatturato), euro(r.incassato)]
  );
}

function renderSection(bodyId, tableId, loadingId, emptyId, data, fields, headers, cellFn) {
  const tbody   = document.getElementById(bodyId);
  const table   = document.getElementById(tableId);
  const loading = document.getElementById(loadingId);
  const empty   = document.getElementById(emptyId);
  if (loading) loading.style.display = 'none';

  if (!data.length) {
    if (table) table.style.display = 'none';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (table) table.style.display = '';
  tbody.innerHTML = data.map(r => {
    const cells = cellFn(r);
    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
  }).join('');
}

function bindEvents() {
  document.getElementById('btnApplyFilter')?.addEventListener('click', computeAll);

  // CSV exports
  document.getElementById('btnCsvCliente')?.addEventListener('click', () => {
    downloadCSV(toCSV(['Cliente','N° Fatture','Fatturato','Incassato','Da Incassare'],
      ['clienteNome','nFatture','fatturato','incassato','daIncassare'],
      clienteData.map(r => ({ ...r, fatturato: r.fatturato.toFixed(2), incassato: r.incassato.toFixed(2), daIncassare: r.daIncassare.toFixed(2) }))),
      `analytics_cliente_${todayISO()}`);
  });
  document.getElementById('btnCsvMandante')?.addEventListener('click', () => {
    downloadCSV(toCSV(['Mandante','N° Fatture','Fatturato','Incassato','Da Incassare'],
      ['mandanteNome','nFatture','fatturato','incassato','daIncassare'],
      mandanteData.map(r => ({ ...r, fatturato: r.fatturato.toFixed(2), incassato: r.incassato.toFixed(2), daIncassare: r.daIncassare.toFixed(2) }))),
      `analytics_mandante_${todayISO()}`);
  });
  document.getElementById('btnCsvPeriodo')?.addEventListener('click', () => {
    downloadCSV(toCSV(['Mese','Fatture Emesse','Fatturato','Incassato'],
      ['meseLbl','nFatture','fatturato','incassato'],
      periodoData.map(r => ({ ...r, fatturato: r.fatturato.toFixed(2), incassato: r.incassato.toFixed(2) }))),
      `analytics_periodo_${todayISO()}`);
  });

  // PDF exports
  document.getElementById('btnPdfCliente')?.addEventListener('click', () => {
    const html = document.getElementById('tableCliente')?.outerHTML || '';
    exportToPDF(html, 'Analisi Per Cliente');
  });
  document.getElementById('btnPdfMandante')?.addEventListener('click', () => {
    const html = document.getElementById('tableMandante')?.outerHTML || '';
    exportToPDF(html, 'Analisi Per Mandante');
  });
  document.getElementById('btnPdfPeriodo')?.addEventListener('click', () => {
    const html = document.getElementById('tablePeriodo')?.outerHTML || '';
    exportToPDF(html, 'Analisi Per Periodo');
  });
}
