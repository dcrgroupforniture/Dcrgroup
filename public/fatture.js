// fatture.js — Fatture (Invoices) module for DCR GROUP
import { firestoreService as fs } from './services/firestoreService.js';
import { euro, todayISO, escapeHtml, fmtDate } from './utils.js';
import { toCSV, downloadCSV } from './services/exportService.js';
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ── Constants ──────────────────────────────────────────────────────────────

const COL_FATTURE  = 'fatture';
const COL_PAGAMENTI = 'pagamenti';
const COL_CLIENTI  = 'clienti';
const COL_MANDANTI = 'mandanti';

const ALLOWED_NAV = new Set([
  'index.html','clients.html','suppliers.html','listini.html',
  'ordini-clienti.html','incassi.html','spese.html','scadenze.html',
  'agenda.html','statistiche.html','finanze.html','mandanti.html',
  'crm.html','offerte.html','fatture.html','mailing.html',
]);

const TIPO_LABELS = {
  fattura_immediata: 'Fattura Immediata',
  fattura_differita: 'Fattura Differita',
  proforma:          'Proforma',
  nota_credito:      'Nota Credito',
  nota_debito:       'Nota Debito',
};

const STATO_LABELS = {
  bozza:     'Bozza',
  emessa:    'Emessa',
  inviata:   'Inviata',
  pagata:    'Pagata',
  parziale:  'Parziale',
  scaduta:   'Scaduta',
  annullata: 'Annullata',
};

const METODO_LABELS = {
  bonifico: 'Bonifico',
  contanti: 'Contanti',
  carta:    'Carta',
  riba:     'RiBa',
};

// ── State ──────────────────────────────────────────────────────────────────

let fatture   = [];
let filteredFatture = [];
let pagamenti = [];
let clienti   = [];
let mandanti  = [];
let fattRighe = [];        // current editor line items
let currentFattId = null;
let currentUser   = null;
let rigaCounter   = 0;

// ── DOM refs ───────────────────────────────────────────────────────────────

const kpiFatturato   = document.getElementById('kpiFatturato');
const kpiIncassato   = document.getElementById('kpiIncassato');
const kpiDaIncassare = document.getElementById('kpiDaIncassare');
const kpiScaduto     = document.getElementById('kpiScaduto');

const filterTipo     = document.getElementById('filterTipo');
const filterStato    = document.getElementById('filterStato');
const filterAnno     = document.getElementById('filterAnno');
const filterCliente  = document.getElementById('filterCliente');
const btnNewFattura  = document.getElementById('btnNewFattura');

const fattureBody    = document.getElementById('fattureBody');
const fattureEmpty   = document.getElementById('fattureEmpty');
const pagamentiBody  = document.getElementById('pagamentiBody');
const pagamentiEmpty = document.getElementById('pagamentiEmpty');
const scadenzeBody   = document.getElementById('scadenzeBody');
const scadenzeEmpty  = document.getElementById('scadenzeEmpty');

const fattEditorOverlay = document.getElementById('fattEditorOverlay');
const fattEditorTitle   = document.getElementById('fattEditorTitle');
const closefattEditor   = document.getElementById('closefattEditor');
const formFattura       = document.getElementById('formFattura');
const fattNumero        = document.getElementById('fattNumero');
const fattClienteSel    = document.getElementById('fattClienteSel');
const fattMandanteSel   = document.getElementById('fattMandanteSel');
const fattClienteSnapshot = document.getElementById('fattClienteSnapshot');

const fattRigheBody     = document.getElementById('fattRigheBody');
const btnAddFattRiga    = document.getElementById('btnAddFattRiga');
const fattBreakdown     = document.getElementById('fattBreakdown');
const fattImponibile    = document.getElementById('fattImponibile');
const fattIVA           = document.getElementById('fattIVA');
const fattTotale        = document.getElementById('fattTotale');

const btnSalvaBozzaFatt = document.getElementById('btnSalvaBozzaFatt');
const btnEmettiFattura  = document.getElementById('btnEmettiFattura');
const btnAnnullaFattura = document.getElementById('btnAnnullaFattura');

const pagModal       = document.getElementById('pagModal');
const closePagModal  = document.getElementById('closePagModal');
const formPagamento  = document.getElementById('formPagamento');

// ── Auth guard ─────────────────────────────────────────────────────────────

const _unsub = onAuthStateChanged(auth, (user) => {
  _unsub();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  init();
});

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  setupQuickNav();
  setupTabs();
  setupFilters();
  setupEditor();
  setupPaymentModal();

  await Promise.all([loadClienti(), loadMandanti()]);
  await Promise.all([loadFatture(), loadPagamenti()]);
}

// ── Quick Nav ──────────────────────────────────────────────────────────────

function setupQuickNav() {
  const sel = document.getElementById('quickNav');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const v = sel.value;
    if (v && ALLOWED_NAV.has(v)) window.location.href = v;
    sel.value = '';
  });
}

// ── Tabs ───────────────────────────────────────────────────────────────────

function setupTabs() {
  const tabs   = document.querySelectorAll('.fatture-tab');
  const panels = {
    fatture:    document.getElementById('panelFatture'),
    pagamenti:  document.getElementById('panelPagamenti'),
    scadenze:   document.getElementById('panelScadenze'),
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      Object.values(panels).forEach(p => { if (p) p.style.display = 'none'; });
      const target = panels[tab.dataset.tab];
      if (target) target.style.display = 'flex';
    });
  });
}

// ── Filters ────────────────────────────────────────────────────────────────

function setupFilters() {
  [filterTipo, filterStato, filterAnno, filterCliente].forEach(el => {
    if (el) el.addEventListener('input', applyFilters);
  });
  if (btnNewFattura) btnNewFattura.addEventListener('click', () => openEditor());

  // M3-C: CSV export
  const btnCSV = document.getElementById('btnExportFattureCSV');
  if (btnCSV) btnCSV.addEventListener('click', exportFattureCSV);
}

function applyFilters() {
  const tipo     = filterTipo?.value    || '';
  const stato    = filterStato?.value   || '';
  const anno     = filterAnno?.value    || '';
  const cliente  = (filterCliente?.value || '').toLowerCase().trim();

  const filtered = fatture.filter(f => {
    if (tipo   && f.tipo   !== tipo)   return false;
    if (stato  && f.stato  !== stato)  return false;
    if (anno   && String(f.anno) !== anno) return false;
    if (cliente) {
      const snapName = (f.snapRagioneSociale || '').toLowerCase();
      const cl = clienti.find(c => c.id === f.clienteId);
      const clName = (cl ? (cl.ragioneSociale || cl.nome || '') : '').toLowerCase();
      if (!snapName.includes(cliente) && !clName.includes(cliente)) return false;
    }
    return true;
  });

  renderFattureTable(filtered);
  filteredFatture = filtered;

// ── Load Data ──────────────────────────────────────────────────────────────

async function loadFatture() {
  try {
    fatture = await fs.getAllByCompany(COL_FATTURE);
    fatture.sort((a, b) => {
      const numA = String(a.numero || '');
      const numB = String(b.numero || '');
      return numB.localeCompare(numA);
    });
    updateKpis();
    applyFilters();
    renderPagamentiTable();
    renderScadenzeTable();
  } catch (e) {
    console.error('loadFatture error:', e);
  }
}

async function loadPagamenti() {
  try {
    pagamenti = await fs.getAllByCompany(COL_PAGAMENTI);
    pagamenti.sort((a, b) => (b.dataPagamento || '').localeCompare(a.dataPagamento || ''));
    renderPagamentiTable();
  } catch (e) {
    console.error('loadPagamenti error:', e);
  }
}

async function loadClienti() {
  try {
    clienti = await fs.getAllByCompany(COL_CLIENTI);
    clienti.sort((a, b) => {
      const na = a.ragioneSociale || a.nome || '';
      const nb = b.ragioneSociale || b.nome || '';
      return na.localeCompare(nb, 'it');
    });
    populateClienteSelect();
  } catch (e) {
    console.error('loadClienti error:', e);
  }
}

async function loadMandanti() {
  try {
    mandanti = await fs.getAllByCompany(COL_MANDANTI);
    mandanti.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'));
    populateMandanteSelect();
  } catch (e) {
    console.error('loadMandanti error:', e);
  }
}

// ── Selects Population ─────────────────────────────────────────────────────

function populateClienteSelect() {
  if (!fattClienteSel) return;
  const cur = fattClienteSel.value;
  fattClienteSel.innerHTML = '<option value="">— Nessuno —</option>';
  clienti.forEach(c => {
    const label = c.ragioneSociale || c.nome || c.id;
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = label;
    fattClienteSel.appendChild(opt);
  });
  if (cur) fattClienteSel.value = cur;
}

function populateMandanteSelect() {
  if (!fattMandanteSel) return;
  const cur = fattMandanteSel.value;
  fattMandanteSel.innerHTML = '<option value="">— Nessuno —</option>';
  mandanti.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.nome || m.id;
    fattMandanteSel.appendChild(opt);
  });
  if (cur) fattMandanteSel.value = cur;
}

// ── KPIs ───────────────────────────────────────────────────────────────────

function updateKpis() {
  const today = todayISO();
  const fatturato  = fatture.reduce((s, f) => s + Number(f.totale || 0), 0);
  const incassato  = fatture.reduce((s, f) => s + Number(f.totalePagato || 0), 0);
  const daIncassare = fatturato - incassato;
  const scaduto = fatture
    .filter(f =>
      f.dataScadenza && f.dataScadenza < today &&
      ['emessa', 'inviata', 'parziale', 'scaduta'].includes(f.stato)
    )
    .reduce((s, f) => s + Math.max(0, Number(f.totale || 0) - Number(f.totalePagato || 0)), 0);

  if (kpiFatturato)   kpiFatturato.textContent   = euro(fatturato);
  if (kpiIncassato)   kpiIncassato.textContent   = euro(incassato);
  if (kpiDaIncassare) kpiDaIncassare.textContent = euro(daIncassare);
  if (kpiScaduto)     kpiScaduto.textContent     = euro(scaduto);
}

// ── Auto-generate invoice number ───────────────────────────────────────────

async function nextFatturaNumber(anno) {
  const list = await fs.getAllByCompany(COL_FATTURE);
  const yearDocs = list.filter(f => String(f.anno) === String(anno));
  let maxSeq = 0;
  yearDocs.forEach(f => {
    const parts = String(f.numero || '').split('/');
    const seq = parseInt(parts[1] || '0', 10);
    if (seq > maxSeq) maxSeq = seq;
  });
  return `${anno}/${String(maxSeq + 1).padStart(3, '0')}`;
}

// ── Render: Fatture table ──────────────────────────────────────────────────

function renderFattureTable(list) {
  if (!fattureBody) return;
  const today = todayISO();

  if (!list.length) {
    fattureBody.innerHTML = '';
    fattureEmpty.classList.add('visible');
    return;
  }
  fattureEmpty.classList.remove('visible');

  fattureBody.innerHTML = list.map(f => {
    const cl = clienti.find(c => c.id === f.clienteId);
    const mn = mandanti.find(m => m.id === f.mandanteId);
    const clienteLabel = f.snapRagioneSociale || (cl ? (cl.ragioneSociale || cl.nome || '—') : '—');
    const mandanteLabel = mn ? (mn.nome || '—') : '—';

    const isScaduta = f.dataScadenza && f.dataScadenza < today && !['pagata','annullata','bozza'].includes(f.stato);

    return `<tr>
      <td><strong>${escapeHtml(f.numero || '—')}</strong></td>
      <td>${tipoBadge(f.tipo)}</td>
      <td>${escapeHtml(fmtDate(f.dataEmissione))}</td>
      <td>${escapeHtml(clienteLabel)}</td>
      <td>${escapeHtml(mandanteLabel)}</td>
      <td>${euro(f.totale)}</td>
      <td>${euro(f.totalePagato)}</td>
      <td>${statoBadge(f.stato)}</td>
      <td class="${isScaduta ? 'fatt-scad-overdue' : ''}">${escapeHtml(fmtDate(f.dataScadenza))}</td>
      <td>
        <div class="fatt-td-actions">
          <button class="fatture-btn fatture-btn-sm" onclick="window._fattEdit('${escapeHtml(f.id)}')">✏️ Modifica</button>
          ${['bozza','emessa','inviata','parziale','scaduta'].includes(f.stato) ? `<button class="fatture-btn fatture-btn-sm fatture-btn-primary" onclick="window._fattPaga('${escapeHtml(f.id)}')">💰 Pagamento</button>` : ''}
          <button class="fatture-btn fatture-btn-sm" onclick="window._fattStampa('${escapeHtml(f.id)}')">🖨️ Stampa</button>
          ${f.stato !== 'bozza' ? `<button class="fatture-btn fatture-btn-sm" onclick="window._fattXML('${escapeHtml(f.id)}')">📄 XML SdI</button>` : ''}
          ${f.stato === 'bozza' ? `<button class="fatture-btn fatture-btn-sm fatture-btn-danger" onclick="window._fattDelete('${escapeHtml(f.id)}')">🗑️</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Render: Pagamenti table ────────────────────────────────────────────────

function renderPagamentiTable() {
  if (!pagamentiBody) return;

  if (!pagamenti.length) {
    pagamentiBody.innerHTML = '';
    pagamentiEmpty.classList.add('visible');
    return;
  }
  pagamentiEmpty.classList.remove('visible');

  pagamentiBody.innerHTML = pagamenti.map(p => {
    const fatt = fatture.find(f => f.id === p.fatturaId);
    const cl   = clienti.find(c => c.id === p.clienteId) || (fatt ? clienti.find(c => c.id === fatt.clienteId) : null);
    const fattLabel = fatt ? (fatt.numero || fatt.id) : (p.fatturaId || '—');
    const clienteLabel = (fatt && fatt.snapRagioneSociale) || (cl ? (cl.ragioneSociale || cl.nome || '—') : '—');
    return `<tr>
      <td>${escapeHtml(fmtDate(p.dataPagamento))}</td>
      <td><strong>${escapeHtml(fattLabel)}</strong></td>
      <td>${escapeHtml(clienteLabel)}</td>
      <td><strong>${euro(p.importo)}</strong></td>
      <td>${escapeHtml(METODO_LABELS[p.metodo] || p.metodo || '—')}</td>
      <td>${escapeHtml(p.riferimento || '—')}</td>
      <td>${escapeHtml(p.note || '—')}</td>
    </tr>`;
  }).join('');
}

// ── Render: Scadenze table ─────────────────────────────────────────────────

function renderScadenzeTable() {
  if (!scadenzeBody) return;
  const today = todayISO();

  const withScad = fatture
    .filter(f => f.dataScadenza && !['pagata','annullata','bozza'].includes(f.stato))
    .sort((a, b) => (a.dataScadenza || '').localeCompare(b.dataScadenza || ''));

  if (!withScad.length) {
    scadenzeBody.innerHTML = '';
    scadenzeEmpty.classList.add('visible');
    return;
  }
  scadenzeEmpty.classList.remove('visible');

  scadenzeBody.innerHTML = withScad.map(f => {
    const cl = clienti.find(c => c.id === f.clienteId);
    const clienteLabel = f.snapRagioneSociale || (cl ? (cl.ragioneSociale || cl.nome || '—') : '—');
    const residuo = Math.max(0, Number(f.totale || 0) - Number(f.totalePagato || 0));
    const isOverdue = f.dataScadenza < today;
    const isToday   = f.dataScadenza === today;
    const scadClass = isOverdue ? 'fatt-scad-overdue' : isToday ? 'fatt-scad-today' : 'fatt-scad-ok';
    const statoDisplay = isOverdue && f.stato !== 'scaduta' ? 'scaduta' : f.stato;
    return `<tr>
      <td class="${scadClass}"><strong>${escapeHtml(fmtDate(f.dataScadenza))}</strong></td>
      <td><strong>${escapeHtml(f.numero || '—')}</strong></td>
      <td>${tipoBadge(f.tipo)}</td>
      <td>${escapeHtml(clienteLabel)}</td>
      <td>${euro(f.totale)}</td>
      <td><strong>${euro(residuo)}</strong></td>
      <td>${statoBadge(statoDisplay)}</td>
    </tr>`;
  }).join('');
}

// ── Badges ─────────────────────────────────────────────────────────────────

function statoBadge(stato) {
  const label = escapeHtml(STATO_LABELS[stato] || stato || '—');
  const cls = `fatt-stato-badge fatt-stato-${escapeHtml(stato || 'bozza')}`;
  return `<span class="${cls}">${label}</span>`;
}

function tipoBadge(tipo) {
  if (!tipo) return '—';
  return `<span class="fatt-tipo-badge">${escapeHtml(TIPO_LABELS[tipo] || tipo)}</span>`;
}

// ── Editor ─────────────────────────────────────────────────────────────────

function setupEditor() {
  if (closefattEditor) closefattEditor.addEventListener('click', closeEditor);
  if (btnAddFattRiga)  btnAddFattRiga.addEventListener('click', addFattRiga);

  if (btnSalvaBozzaFatt) btnSalvaBozzaFatt.addEventListener('click', () => saveFattura('bozza'));
  if (btnEmettiFattura)  btnEmettiFattura.addEventListener('click',  () => saveFattura('emessa'));
  if (btnAnnullaFattura) btnAnnullaFattura.addEventListener('click', () => annullaFattura());

  if (fattClienteSel) {
    fattClienteSel.addEventListener('change', fillClienteSnapshot);
  }

  // Close overlay on background click
  if (fattEditorOverlay) {
    fattEditorOverlay.addEventListener('click', (e) => {
      if (e.target === fattEditorOverlay) closeEditor();
    });
  }
}

async function openEditor(fattura = null) {
  currentFattId = fattura ? fattura.id : null;
  fattRighe = [];
  rigaCounter = 0;
  if (fattRigheBody) fattRigheBody.innerHTML = '';

  formFattura.reset();
  const today = todayISO();

  if (fattura) {
    fattEditorTitle.textContent = `Fattura ${fattura.numero || ''}`;
    // Fill form fields
    setField('tipo',           fattura.tipo            || 'fattura_immediata');
    setField('dataEmissione',  fattura.dataEmissione   || today);
    setField('dataScadenza',   fattura.dataScadenza    || '');
    setField('clienteId',      fattura.clienteId       || '');
    setField('mandanteId',     fattura.mandanteId      || '');
    setField('metodoPagamento',fattura.metodoPagamento || 'bonifico');
    setField('nRate',          fattura.nRate           || 1);
    setField('note',           fattura.note            || '');
    setField('docId',          fattura.id);
    setField('anno',           fattura.anno            || '');
    setField('stato',          fattura.stato           || 'bozza');
    if (fattNumero) fattNumero.value = fattura.numero || '';

    // Snapshot
    setField('snapRagioneSociale', fattura.snapRagioneSociale || '');
    setField('snapPartitaIVA',     fattura.snapPartitaIVA     || '');
    setField('snapIndirizzo',      fattura.snapIndirizzo      || '');
    setField('snapPec',            fattura.snapPec            || '');
    setField('snapSdi',            fattura.snapSdi            || '');
    if (fattura.clienteId && fattClienteSnapshot) fattClienteSnapshot.style.display = '';

    // Lines
    const righeData = Array.isArray(fattura.righe) ? fattura.righe : [];
    righeData.forEach(r => addFattRiga(r));

    // Footer buttons
    if (btnAnnullaFattura) btnAnnullaFattura.style.display = !['bozza','annullata','pagata'].includes(fattura.stato) ? '' : 'none';
    if (btnEmettiFattura)  btnEmettiFattura.style.display  = fattura.stato === 'bozza' ? '' : 'none';
  } else {
    fattEditorTitle.textContent = 'Nuova Fattura';
    setField('dataEmissione', today);
    setField('tipo', 'fattura_immediata');
    setField('metodoPagamento', 'bonifico');
    setField('nRate', 1);
    if (fattNumero) fattNumero.value = '';
    if (fattClienteSnapshot) fattClienteSnapshot.style.display = 'none';
    if (btnAnnullaFattura) btnAnnullaFattura.style.display = 'none';
    if (btnEmettiFattura)  btnEmettiFattura.style.display  = '';
    // Add one empty line by default
    addFattRiga();
  }

  calcFattTotals();
  if (fattEditorOverlay) fattEditorOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeEditor() {
  if (fattEditorOverlay) fattEditorOverlay.style.display = 'none';
  document.body.style.overflow = '';
  currentFattId = null;
  fattRighe = [];
  rigaCounter = 0;
}

function setField(name, value) {
  const el = formFattura.elements[name];
  if (!el) return;
  el.value = value ?? '';
}

// ── Cliente Snapshot ───────────────────────────────────────────────────────

function fillClienteSnapshot() {
  const clienteId = fattClienteSel?.value;
  if (!clienteId) {
    if (fattClienteSnapshot) fattClienteSnapshot.style.display = 'none';
    return;
  }
  const c = clienti.find(cl => cl.id === clienteId);
  if (!c) return;

  const indirizzo = [c.indirizzo, c.cap, c.citta, c.provincia].filter(Boolean).join(', ');
  setField('snapRagioneSociale', c.ragioneSociale || c.nome || '');
  setField('snapPartitaIVA',     c.partitaIVA    || c.piva || '');
  setField('snapIndirizzo',      indirizzo);
  setField('snapPec',            c.pec           || '');
  setField('snapSdi',            c.sdi           || c.codiceSdi || '');

  if (fattClienteSnapshot) fattClienteSnapshot.style.display = '';
}

// ── Invoice Lines ──────────────────────────────────────────────────────────

function addFattRiga(data = {}) {
  const id = ++rigaCounter;
  const riga = {
    _id:          id,
    codice:       data.codice       || '',
    descrizione:  data.descrizione  || '',
    qta:          data.qta          ?? 1,
    um:           data.um           || 'pz',
    prezzoUnit:   data.prezzoUnit   ?? 0,
    sconto:       data.sconto       ?? 0,
    aliquotaIVA:  data.aliquotaIVA  ?? 22,
    totaleRiga:   data.totaleRiga   ?? 0,
  };
  fattRighe.push(riga);
  renderRiga(riga);
  calcFattTotals();
}

function renderRiga(riga) {
  if (!fattRigheBody) return;
  const tr = document.createElement('tr');
  tr.dataset.rigaId = riga._id;
  tr.innerHTML = `
    <td><input type="text"   class="r-codice"      value="${escapeHtml(riga.codice)}"      placeholder="Cod."/></td>
    <td><input type="text"   class="r-descr"       value="${escapeHtml(riga.descrizione)}" placeholder="Descrizione prodotto/servizio" style="min-width:160px"/></td>
    <td><input type="number" class="r-qta"         value="${riga.qta}"     min="0" step="0.001" style="width:60px"/></td>
    <td><input type="text"   class="r-um"          value="${escapeHtml(riga.um)}"           style="width:50px"/></td>
    <td><input type="number" class="r-prezzo"      value="${riga.prezzoUnit}" min="0" step="0.01" style="width:90px"/></td>
    <td><input type="number" class="r-sconto"      value="${riga.sconto}"  min="0" max="100" step="0.01" style="width:70px"/></td>
    <td><input type="number" class="r-iva"         value="${riga.aliquotaIVA}" min="0" max="100" step="1" style="width:60px"/></td>
    <td><span  class="totale-riga" id="tot-riga-${riga._id}">${euro(riga.totaleRiga)}</span></td>
    <td><button type="button" class="fatture-btn fatture-btn-sm fatture-btn-danger r-del" title="Rimuovi">✕</button></td>
  `;

  // Live recalc on any input change
  tr.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
    syncRiga(riga._id, tr);
    calcFattTotals();
  }));

  tr.querySelector('.r-del').addEventListener('click', () => {
    removeRiga(riga._id);
  });

  fattRigheBody.appendChild(tr);
}

function syncRiga(id, tr) {
  const riga = fattRighe.find(r => r._id === id);
  if (!riga) return;
  riga.codice      = tr.querySelector('.r-codice').value;
  riga.descrizione = tr.querySelector('.r-descr').value;
  riga.qta         = parseFloat(tr.querySelector('.r-qta').value)    || 0;
  riga.um          = tr.querySelector('.r-um').value;
  riga.prezzoUnit  = parseFloat(tr.querySelector('.r-prezzo').value)  || 0;
  riga.sconto      = parseFloat(tr.querySelector('.r-sconto').value)  || 0;
  riga.aliquotaIVA = parseFloat(tr.querySelector('.r-iva').value)     || 0;
  riga.totaleRiga  = calcRigaTotale(riga);
  const el = document.getElementById(`tot-riga-${id}`);
  if (el) el.textContent = euro(riga.totaleRiga);
}

function calcRigaTotale(riga) {
  const lordo = riga.qta * riga.prezzoUnit;
  const scontato = lordo * (1 - riga.sconto / 100);
  return Math.round(scontato * 100) / 100;
}

function removeRiga(id) {
  fattRighe = fattRighe.filter(r => r._id !== id);
  const tr = fattRigheBody?.querySelector(`tr[data-riga-id="${id}"]`);
  if (tr) tr.remove();
  calcFattTotals();
}

// ── Totals Calculation ─────────────────────────────────────────────────────

function calcFattTotals() {
  // Sync all rows first
  if (fattRigheBody) {
    fattRigheBody.querySelectorAll('tr[data-riga-id]').forEach(tr => {
      const id = parseInt(tr.dataset.rigaId, 10);
      syncRiga(id, tr);
    });
  }

  // Group by IVA rate
  const byIVA = {};
  fattRighe.forEach(r => {
    const rate = r.aliquotaIVA;
    if (!byIVA[rate]) byIVA[rate] = { imponibile: 0, iva: 0 };
    byIVA[rate].imponibile += r.totaleRiga;
    byIVA[rate].iva        += r.totaleRiga * (rate / 100);
  });

  let totImponibile = 0;
  let totIVA        = 0;

  // Breakdown HTML
  let breakdownHtml = '';
  Object.entries(byIVA).sort(([a],[b]) => Number(a) - Number(b)).forEach(([rate, vals]) => {
    totImponibile += vals.imponibile;
    totIVA        += vals.iva;
    breakdownHtml += `<div class="fatt-breakdown-row">
      <span>Imponibile IVA ${escapeHtml(rate)}%</span>
      <span>${euro(vals.imponibile)}</span>
    </div>
    <div class="fatt-breakdown-row">
      <span>IVA ${escapeHtml(rate)}%</span>
      <span>${euro(vals.iva)}</span>
    </div>`;
  });

  const totDoc = totImponibile + totIVA;

  if (fattBreakdown)  fattBreakdown.innerHTML   = breakdownHtml;
  if (fattImponibile) fattImponibile.textContent = euro(totImponibile);
  if (fattIVA)        fattIVA.textContent        = euro(totIVA);
  if (fattTotale)     fattTotale.textContent     = euro(totDoc);
}

// ── Save Fattura ───────────────────────────────────────────────────────────

async function saveFattura(targetStato) {
  // Sync all rows before save
  if (fattRigheBody) {
    fattRigheBody.querySelectorAll('tr[data-riga-id]').forEach(tr => {
      syncRiga(parseInt(tr.dataset.rigaId, 10), tr);
    });
  }
  calcFattTotals();

  const fd = new FormData(formFattura);
  const tipo           = fd.get('tipo')            || 'fattura_immediata';
  const dataEmissione  = fd.get('dataEmissione')   || todayISO();
  const dataScadenza   = fd.get('dataScadenza')    || '';
  const clienteId      = fd.get('clienteId')       || '';
  const mandanteId     = fd.get('mandanteId')      || '';
  const metodoPagamento= fd.get('metodoPagamento') || 'bonifico';
  const nRate          = parseInt(fd.get('nRate') || '1', 10);
  const note           = fd.get('note')            || '';
  const anno           = dataEmissione.slice(0, 4);

  // Totals
  let totImponibile = 0;
  let totIVA        = 0;
  fattRighe.forEach(r => {
    totImponibile += r.totaleRiga;
    totIVA        += r.totaleRiga * (r.aliquotaIVA / 100);
  });
  const totale = totImponibile + totIVA;

  // Numero
  let numero = fattNumero?.value?.trim();
  if (!numero && targetStato !== 'bozza') {
    numero = await nextFatturaNumber(anno);
  }
  if (!numero && targetStato === 'bozza') {
    numero = await nextFatturaNumber(anno);
  }
  if (fattNumero) fattNumero.value = numero;

  // Snapshot
  const snapRagioneSociale = fd.get('snapRagioneSociale') || '';
  const snapPartitaIVA     = fd.get('snapPartitaIVA')     || '';
  const snapIndirizzo      = fd.get('snapIndirizzo')       || '';
  const snapPec            = fd.get('snapPec')             || '';
  const snapSdi            = fd.get('snapSdi')             || '';

  // righe clean (strip internal _id)
  const righeClean = fattRighe.map(r => ({
    codice:      r.codice,
    descrizione: r.descrizione,
    qta:         r.qta,
    um:          r.um,
    prezzoUnit:  r.prezzoUnit,
    sconto:      r.sconto,
    aliquotaIVA: r.aliquotaIVA,
    totaleRiga:  r.totaleRiga,
  }));

  const docData = {
    tipo, numero, dataEmissione, dataScadenza,
    clienteId, mandanteId, metodoPagamento, nRate, note,
    anno: parseInt(anno, 10),
    stato:        targetStato,
    righe:        righeClean,
    imponibile:   Math.round(totImponibile * 100) / 100,
    totaleIVA:    Math.round(totIVA * 100) / 100,
    totale:       Math.round(totale * 100) / 100,
    totalePagato: 0,
    snapRagioneSociale, snapPartitaIVA, snapIndirizzo, snapPec, snapSdi,
    updatedAt:    new Date().toISOString(),
    updatedBy:    currentUser?.email || '',
  };

  try {
    if (currentFattId) {
      // Preserve totalePagato on update
      const existing = fatture.find(f => f.id === currentFattId);
      if (existing) docData.totalePagato = Number(existing.totalePagato || 0);
      await fs.update(COL_FATTURE, currentFattId, docData);
    } else {
      docData.createdAt = new Date().toISOString();
      docData.createdBy = currentUser?.email || '';
      docData.totalePagato = 0;
      currentFattId = await fs.add(COL_FATTURE, docData);
    }

    await loadFatture();

    // M3-A: generate rate automatiche when emessa + nRate > 1 + dataScadenza
    if (targetStato === 'emessa' && nRate > 1 && dataScadenza) {
      try {
        const rateCount = await generateRate({
          fatturaId: currentFattId,
          clienteId,
          clienteNome: fd.get('snapRagioneSociale') || '',
          totale,
          nRate,
          dataScadenza,
        });
        showToast(`Generate ${rateCount} rate per questa fattura`);
      } catch (rateErr) {
        console.warn('generateRate error', rateErr);
      }
    }

    closeEditor();
  } catch (e) {
    console.error('saveFattura error:', e);
    alert('Errore nel salvataggio: ' + (e.message || JSON.stringify(e)));
  }
}

// ── Rate automatiche (M3-A) ────────────────────────────────────────────────

async function generateRate({ fatturaId, clienteId, clienteNome, totale, nRate, dataScadenza }) {
  const baseImporto = Math.round((totale / nRate) * 100) / 100;
  const tasks = [];
  for (let i = 1; i <= nRate; i++) {
    const scadDate = new Date(dataScadenza);
    // Advance by (i-1) calendar months, clamping to end-of-month
    scadDate.setMonth(scadDate.getMonth() + (i - 1));
    const dataScadenzaRata = scadDate.toISOString().slice(0, 10);
    const isLast = i === nRate;
    const importoRata = isLast
      ? Math.round((totale - baseImporto * (nRate - 1)) * 100) / 100
      : baseImporto;
    tasks.push(fs.add('scadenzeFinance', {
      fatturaId,
      clienteId,
      clienteNome,
      importoRata,
      numeroPer: `${i}/${nRate}`,
      dataScadenzaRata,
      stato: 'aperta',
      createdAt: new Date().toISOString(),
    }));
  }
  await Promise.all(tasks);
  return nRate;
}

// ── Toast helper ───────────────────────────────────────────────────────────

function showToast(msg, duration = 3000) {
  let toast = document.getElementById('fatt-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'fatt-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:10px 22px;border-radius:8px;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .3s;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

// ── Export CSV (M3-C) ──────────────────────────────────────────────────────

function exportFattureCSV() {
  const headers = ['Numero','Tipo','Data Emissione','Data Scadenza','Cliente','Mandante','Imponibile','Totale IVA','Totale','Totale Pagato','Stato'];
  const fields  = ['numero','tipo','dataEmissione','dataScadenza','clienteLabel','mandanteLabel','imponibile','totaleIVA','totale','totalePagato','stato'];
  const rows = filteredFatture.map(f => {
    const cl = clienti.find(c => c.id === f.clienteId);
    const mn = mandanti.find(m => m.id === f.mandanteId);
    return {
      ...f,
      clienteLabel: f.snapRagioneSociale || (cl ? (cl.ragioneSociale || cl.nome || '') : ''),
      mandanteLabel: mn ? (mn.nome || mn.ragioneSociale || '') : '',
    };
  });
  downloadCSV(toCSV(headers, fields, rows), `fatture_${todayISO()}`);
}

// ── XML SdI (M3-D) ────────────────────────────────────────────────────────

function generateFatturaPA(fattura) {
  const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const tipo = (fattura.tipo === 'nota_credito') ? 'TD04' : 'TD01';
  const righeXml = (fattura.righe || []).map((r, i) => `
    <DettaglioLinee>
      <NumeroLinea>${i + 1}</NumeroLinea>
      <Descrizione>${esc(r.descrizione || r.codice || 'Servizio')}</Descrizione>
      <Quantita>${Number(r.qta || r.quantita || 1).toFixed(2)}</Quantita>
      <PrezzoUnitario>${Number(r.prezzoUnit || r.prezzoUnitario || 0).toFixed(2)}</PrezzoUnitario>
      <AliquotaIVA>${Number(r.aliquotaIVA || 22).toFixed(2)}</AliquotaIVA>
      <PrezzoTotale>${Number(r.totaleRiga || 0).toFixed(2)}</PrezzoTotale>
    </DettaglioLinee>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>00000000000</IdCodice></IdTrasmittente>
      <ProgressivoInvio>1</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${esc(fattura.snapSdi || '0000000')}</CodiceDestinatario>
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>00000000000</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>DCR GROUP</Denominazione></Anagrafica>
        <RegimeFiscale>RF01</RegimeFiscale>
      </DatiAnagrafici>
      <Sede><Indirizzo>Via Placeholder 1</Indirizzo><CAP>00100</CAP><Comune>Roma</Comune><Provincia>RM</Provincia><Nazione>IT</Nazione></Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${esc(fattura.snapPartitaIVA || '00000000000')}</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>${esc(fattura.snapRagioneSociale || '')}</Denominazione></Anagrafica>
      </DatiAnagrafici>
      <Sede><Indirizzo>${esc(fattura.snapIndirizzo || 'N/D')}</Indirizzo><CAP>00000</CAP><Comune>N/D</Comune><Nazione>IT</Nazione></Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${tipo}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${esc(fattura.dataEmissione || '')}</Data>
        <Numero>${esc(fattura.numero || '')}</Numero>
        <ImportoTotaleDocumento>${Number(fattura.totale || 0).toFixed(2)}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>${righeXml}
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>${Number(fattura.imponibile || 0).toFixed(2)}</ImponibileImporto>
        <Imposta>${Number(fattura.totaleIVA || 0).toFixed(2)}</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
    <DatiPagamento>
      <CondizioniPagamento>TP01</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>MP05</ModalitaPagamento>
        <DataScadenzaPagamento>${esc(fattura.dataScadenza || fattura.dataEmissione || '')}</DataScadenzaPagamento>
        <ImportoPagamento>${Number(fattura.totale || 0).toFixed(2)}</ImportoPagamento>
      </DettaglioPagamento>
    </DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;
}

function downloadFatturaXML(fattura) {
  const xml = generateFatturaPA(fattura);
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `FatturaPA_${(fattura.numero || fattura.id || 'doc').replace(/\//g, '-')}.xml`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

async function annullaFattura() {
  if (!currentFattId) return;
  if (!confirm('Sei sicuro di voler annullare questa fattura? L\'operazione non può essere disfatta.')) return;
  try {
    await fs.update(COL_FATTURE, currentFattId, {
      stato: 'annullata',
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.email || '',
    });
    await loadFatture();
    closeEditor();
  } catch (e) {
    console.error('annullaFattura error:', e);
    alert('Errore: ' + (e.message || JSON.stringify(e)));
  }
}

// ── Delete Fattura ─────────────────────────────────────────────────────────

async function deleteFattura(id) {
  if (!confirm('Eliminare definitivamente questa bozza?')) return;
  try {
    await fs.remove(COL_FATTURE, id);
    await loadFatture();
  } catch (e) {
    console.error('deleteFattura error:', e);
    alert('Errore: ' + (e.message || JSON.stringify(e)));
  }
}

// ── Payment Modal ──────────────────────────────────────────────────────────

function setupPaymentModal() {
  if (closePagModal) closePagModal.addEventListener('click', closePaymentModal);

  if (pagModal) {
    pagModal.addEventListener('click', (e) => {
      if (e.target === pagModal) closePaymentModal();
    });
  }

  if (formPagamento) {
    formPagamento.addEventListener('submit', async (e) => {
      e.preventDefault();
      await submitPagamento();
    });
  }
}

function openPaymentModal(fatturaId) {
  const fattura = fatture.find(f => f.id === fatturaId);
  if (!fattura) return;

  formPagamento.reset();
  formPagamento.elements['fatturaId'].value  = fatturaId;
  formPagamento.elements['clienteId'].value  = fattura.clienteId || '';
  formPagamento.elements['fatturaNome'].value = `${fattura.numero || fatturaId} — ${fattura.snapRagioneSociale || ''}`;
  formPagamento.elements['dataPagamento'].value = todayISO();

  const residuo = Math.max(0, Number(fattura.totale || 0) - Number(fattura.totalePagato || 0));
  formPagamento.elements['importo'].value = residuo.toFixed(2);

  if (pagModal) pagModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePaymentModal() {
  if (pagModal) pagModal.style.display = 'none';
  document.body.style.overflow = '';
}

async function submitPagamento() {
  const fd         = new FormData(formPagamento);
  const fatturaId  = fd.get('fatturaId');
  const clienteId  = fd.get('clienteId') || '';
  const importo    = parseFloat(fd.get('importo') || '0');
  const data       = fd.get('dataPagamento') || todayISO();
  const metodo     = fd.get('metodo')        || 'bonifico';
  const riferimento= fd.get('riferimento')   || '';
  const note       = fd.get('note')          || '';

  if (!fatturaId || importo <= 0) {
    alert('Inserisci un importo valido.');
    return;
  }

  try {
    await registraPagamento(fatturaId, importo, data, metodo, riferimento, note, clienteId);
    closePaymentModal();
  } catch (e) {
    console.error('submitPagamento error:', e);
    alert('Errore: ' + (e.message || JSON.stringify(e)));
  }
}

async function registraPagamento(fatturaId, importo, dataPagamento, metodo, riferimento, note, clienteId) {
  // 1. Add to pagamenti collection
  await fs.add(COL_PAGAMENTI, {
    fatturaId,
    clienteId,
    importo:       Number(importo),
    dataPagamento,
    metodo,
    riferimento,
    note,
    createdAt:     new Date().toISOString(),
    createdBy:     currentUser?.email || '',
  });

  // 2. Sum all payments for this fattura
  const allPag = await fs.getAllByCompany(COL_PAGAMENTI);
  const totalePagato = allPag
    .filter(p => p.fatturaId === fatturaId)
    .reduce((s, p) => s + Number(p.importo || 0), 0);

  // 3. Determine new stato
  const fattura = fatture.find(f => f.id === fatturaId);
  const today   = todayISO();
  let newStato;
  if (totalePagato >= Number(fattura?.totale || 0)) {
    newStato = 'pagata';
  } else if (totalePagato > 0) {
    newStato = 'parziale';
  } else if (fattura?.dataScadenza && fattura.dataScadenza < today) {
    newStato = 'scaduta';
  } else {
    newStato = fattura?.stato || 'emessa';
  }

  // 4. Update fattura
  await fs.update(COL_FATTURE, fatturaId, {
    totalePagato: Math.round(totalePagato * 100) / 100,
    stato:        newStato,
    updatedAt:    new Date().toISOString(),
  });

  // 5. Reload both datasets
  await Promise.all([loadFatture(), loadPagamenti()]);
}

// ── Print ──────────────────────────────────────────────────────────────────

function printFattura(fattura) {
  const cl = clienti.find(c => c.id === fattura.clienteId);
  const mn = mandanti.find(m => m.id === fattura.mandanteId);
  const clienteLabel = fattura.snapRagioneSociale || (cl ? (cl.ragioneSociale || cl.nome || '—') : '—');
  const mandanteLabel = mn ? (mn.nome || '—') : '—';

  const righeRows = (fattura.righe || []).map(r => `
    <tr>
      <td>${escapeHtml(r.codice || '')}</td>
      <td>${escapeHtml(r.descrizione || '')}</td>
      <td style="text-align:right">${r.qta}</td>
      <td>${escapeHtml(r.um || '')}</td>
      <td style="text-align:right">${euro(r.prezzoUnit)}</td>
      <td style="text-align:right">${r.sconto || 0}%</td>
      <td style="text-align:right">${r.aliquotaIVA || 0}%</td>
      <td style="text-align:right"><strong>${euro(r.totaleRiga)}</strong></td>
    </tr>`).join('');

  const html = `
    <div style="font-family:Arial,sans-serif;color:#000;max-width:800px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
        <div>
          <h1 style="margin:0;font-size:22px;color:#ec4899">${escapeHtml(TIPO_LABELS[fattura.tipo] || 'Fattura')}</h1>
          <div style="font-size:28px;font-weight:700;margin-top:4px">${escapeHtml(fattura.numero || '—')}</div>
        </div>
        <div style="text-align:right">
          <div><strong>DCR GROUP</strong></div>
          <div style="font-size:13px;color:#555">Agenti di Commercio</div>
          ${mandanteLabel !== '—' ? `<div style="margin-top:6px;font-size:12px">Mandante: <strong>${escapeHtml(mandanteLabel)}</strong></div>` : ''}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
        <div style="border:1px solid #ddd;border-radius:8px;padding:14px">
          <div style="font-size:11px;text-transform:uppercase;color:#888;margin-bottom:6px">Cliente</div>
          <div><strong>${escapeHtml(clienteLabel)}</strong></div>
          ${fattura.snapPartitaIVA ? `<div style="font-size:12px">P.IVA: ${escapeHtml(fattura.snapPartitaIVA)}</div>` : ''}
          ${fattura.snapIndirizzo  ? `<div style="font-size:12px">${escapeHtml(fattura.snapIndirizzo)}</div>` : ''}
          ${fattura.snapPec        ? `<div style="font-size:12px">PEC: ${escapeHtml(fattura.snapPec)}</div>` : ''}
          ${fattura.snapSdi        ? `<div style="font-size:12px">SDI: ${escapeHtml(fattura.snapSdi)}</div>` : ''}
        </div>
        <div style="border:1px solid #ddd;border-radius:8px;padding:14px">
          <div style="font-size:11px;text-transform:uppercase;color:#888;margin-bottom:6px">Dati Documento</div>
          <div style="font-size:13px"><strong>Data emissione:</strong> ${escapeHtml(fmtDate(fattura.dataEmissione))}</div>
          ${fattura.dataScadenza ? `<div style="font-size:13px"><strong>Scadenza:</strong> ${escapeHtml(fmtDate(fattura.dataScadenza))}</div>` : ''}
          <div style="font-size:13px"><strong>Pagamento:</strong> ${escapeHtml(METODO_LABELS[fattura.metodoPagamento] || fattura.metodoPagamento || '—')}</div>
          ${fattura.nRate > 1 ? `<div style="font-size:13px"><strong>Rate:</strong> ${fattura.nRate}</div>` : ''}
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px;text-align:left;border-bottom:2px solid #ec4899">Cod.</th>
            <th style="padding:8px;text-align:left;border-bottom:2px solid #ec4899">Descrizione</th>
            <th style="padding:8px;text-align:right;border-bottom:2px solid #ec4899">Qtà</th>
            <th style="padding:8px;text-align:left;border-bottom:2px solid #ec4899">U.M.</th>
            <th style="padding:8px;text-align:right;border-bottom:2px solid #ec4899">P.Unit</th>
            <th style="padding:8px;text-align:right;border-bottom:2px solid #ec4899">Sc.%</th>
            <th style="padding:8px;text-align:right;border-bottom:2px solid #ec4899">IVA%</th>
            <th style="padding:8px;text-align:right;border-bottom:2px solid #ec4899">Totale</th>
          </tr>
        </thead>
        <tbody>${righeRows}</tbody>
      </table>

      <div style="display:flex;justify-content:flex-end;margin-bottom:24px">
        <div style="border:1px solid #ddd;border-radius:8px;padding:14px;min-width:240px">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px">
            <span>Imponibile</span><span>${euro(fattura.imponibile)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px">
            <span>IVA</span><span>${euro(fattura.totaleIVA)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;padding-top:8px;border-top:2px solid #ec4899;color:#ec4899">
            <span>Totale</span><span>${euro(fattura.totale)}</span>
          </div>
        </div>
      </div>

      ${fattura.note ? `<div style="border:1px solid #ddd;border-radius:8px;padding:12px;font-size:12px;color:#555"><strong>Note:</strong> ${escapeHtml(fattura.note)}</div>` : ''}
    </div>`;

  const area = document.getElementById('fattPrintArea');
  if (area) {
    area.innerHTML = html;
    area.style.display = 'block';
    window.print();
    setTimeout(() => { area.style.display = 'none'; area.innerHTML = ''; }, 500);
  }
}

// ── Global handlers (called from inline onclick) ───────────────────────────

window._fattEdit = async (id) => {
  const f = fatture.find(x => x.id === id);
  if (f) await openEditor(f);
};

window._fattPaga = (id) => {
  openPaymentModal(id);
};

window._fattStampa = (id) => {
  const f = fatture.find(x => x.id === id);
  if (f) printFattura(f);
};

window._fattDelete = (id) => {
  deleteFattura(id);
};

window._fattXML = (id) => {
  const f = fatture.find(x => x.id === id);
  if (f) downloadFatturaXML(f);
};
