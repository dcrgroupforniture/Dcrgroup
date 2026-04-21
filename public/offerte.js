// offerte.js — Offerte (Quotes) module for DCR GROUP
import { firestoreService as fs } from './services/firestoreService.js';
import { euro, todayISO, escapeHtml, fmtDate } from './utils.js';
import { applyBestSconto } from './sconti.js';
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ── Constants ──────────────────────────────────────────────────────────────

const COL_OFFERTE  = 'offerte';
const COL_CLIENTI  = 'clienti';
const COL_MANDANTI = 'mandanti';

const ALLOWED_NAV = new Set([
  'index.html','clients.html','suppliers.html','listini.html',
  'ordini-clienti.html','incassi.html','spese.html','scadenze.html',
  'agenda.html','statistiche.html','finanze.html','mandanti.html',
  'crm.html','offerte.html','fatture.html','mailing.html',
]);

// ── State ──────────────────────────────────────────────────────────────────

let offerte   = [];
let clienti   = [];
let mandanti  = [];
let righe     = [];   // current editor line items
let currentDocId = null;
let rigaCounter  = 0;

// ── DOM refs ───────────────────────────────────────────────────────────────

const kpiTotOff  = document.getElementById('kpiTotOff');
const kpiValOff  = document.getElementById('kpiValOff');
const kpiAccOff  = document.getElementById('kpiAccOff');
const kpiInCorso = document.getElementById('kpiInCorso');

const filterStato    = document.getElementById('filterStato');
const filterAnno     = document.getElementById('filterAnno');
const filterCliente  = document.getElementById('filterCliente');
const filterMandante = document.getElementById('filterMandante');
const btnNewOfferta  = document.getElementById('btnNewOfferta');

const offerteBody  = document.getElementById('offerteBody');
const offerteEmpty = document.getElementById('offerteEmpty');

const offEditorOverlay = document.getElementById('offEditorOverlay');
const offEditorTitle   = document.getElementById('offEditorTitle');
const closeOffEditor   = document.getElementById('closeOffEditor');
const formOfferta      = document.getElementById('formOfferta');
const offNumero        = document.getElementById('offNumero');
const offClienteSel    = document.getElementById('offClienteSel');
const offMandanteSel   = document.getElementById('offMandanteSel');

const righeBody      = document.getElementById('righeBody');
const btnAddRiga     = document.getElementById('btnAddRiga');

const offImponibile  = document.getElementById('offImponibile');
const offIVA         = document.getElementById('offIVA');
const offTotale      = document.getElementById('offTotale');

const btnSalvaBozza   = document.getElementById('btnSalvaBozza');
const btnInviaOfferta = document.getElementById('btnInviaOfferta');
const btnConvertOrdine= document.getElementById('btnConvertOrdine');
const btnApplicaSconto= document.getElementById('btnApplicaSconto');

// ── Auth guard ─────────────────────────────────────────────────────────────

const _unsub = onAuthStateChanged(auth, (user) => {
  _unsub();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  init();
});

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  setupQuickNav();
  await Promise.all([loadClienti(), loadMandanti()]);
  await loadOfferte();
  bindEvents();
}

// ── Quick Nav ──────────────────────────────────────────────────────────────

function setupQuickNav() {
  const sel = document.getElementById('quickNav');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const dest = sel.value;
    if (dest && ALLOWED_NAV.has(dest)) window.location.href = dest;
  });
}

// ── Data loading ───────────────────────────────────────────────────────────

async function loadOfferte() {
  try {
    offerte = await fs.getAllByCompany(COL_OFFERTE);
    offerte.sort((a, b) => String(b.numero || '').localeCompare(String(a.numero || ''), 'it'));
    applyFilters();
  } catch (e) {
    console.error('[offerte] loadOfferte', e);
  }
}

async function loadClienti() {
  try {
    clienti = await fs.getAllByCompany(COL_CLIENTI);
    clienti.sort((a, b) =>
      String(a.ragioneSociale || a.nome || '').localeCompare(
        String(b.ragioneSociale || b.nome || ''), 'it'
      )
    );
    populateSelect(offClienteSel, clienti, (c) => c.ragioneSociale || c.nome || c.id);
  } catch (e) {
    console.error('[offerte] loadClienti', e);
  }
}

async function loadMandanti() {
  try {
    mandanti = await fs.getAllByCompany(COL_MANDANTI);
    mandanti.sort((a, b) =>
      String(a.ragioneSociale || a.nome || '').localeCompare(
        String(b.ragioneSociale || b.nome || ''), 'it'
      )
    );
    populateSelect(offMandanteSel, mandanti, (m) => m.ragioneSociale || m.nome || m.id);
  } catch (e) {
    console.error('[offerte] loadMandanti', e);
  }
}

function populateSelect(selEl, items, labelFn) {
  const current = selEl.value;
  while (selEl.options.length > 1) selEl.remove(1);
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = labelFn(item);
    selEl.appendChild(opt);
  });
  if (current) selEl.value = current;
}

// ── Auto-number generation ─────────────────────────────────────────────────

async function generateNumero(anno) {
  try {
    const all = await fs.getAllByCompany(COL_OFFERTE);
    const prefix = `OFR-${anno}-`;
    let max = 0;
    all.forEach((o) => {
      if (String(o.numero || '').startsWith(prefix)) {
        const seq = parseInt(String(o.numero).slice(prefix.length), 10);
        if (!isNaN(seq) && seq > max) max = seq;
      }
    });
    const next = String(max + 1).padStart(3, '0');
    return `${prefix}${next}`;
  } catch (e) {
    console.error('[offerte] generateNumero', e);
    return `OFR-${anno}-001`;
  }
}

// ── Filters ────────────────────────────────────────────────────────────────

function applyFilters() {
  const stato    = filterStato.value.trim().toLowerCase();
  const anno     = filterAnno.value.trim();
  const cliente  = filterCliente.value.trim().toLowerCase();
  const mandante = filterMandante.value.trim().toLowerCase();

  const filtered = offerte.filter((o) => {
    if (stato    && String(o.stato || '').toLowerCase() !== stato) return false;
    if (anno     && String(o.anno  || '') !== anno)                 return false;
    if (cliente  && !String(o.clienteNome || '').toLowerCase().includes(cliente)) return false;
    if (mandante && !String(o.mandanteNome || '').toLowerCase().includes(mandante)) return false;
    return true;
  });

  renderTable(filtered);
  updateKpis(filtered);
}

// ── KPIs ───────────────────────────────────────────────────────────────────

function updateKpis(list) {
  kpiTotOff.textContent  = list.length;
  kpiValOff.textContent  = euro(list.reduce((s, o) => s + (Number(o.totale) || 0), 0));
  kpiAccOff.textContent  = list.filter((o) => o.stato === 'accettata').length;
  kpiInCorso.textContent = list.filter((o) => o.stato === 'inviata' || o.stato === 'bozza').length;
}

// ── Table render ───────────────────────────────────────────────────────────

function statoBadge(stato) {
  const s = String(stato || 'bozza').toLowerCase();
  const labels = {
    bozza:     'Bozza',
    inviata:   'Inviata',
    accettata: 'Accettata',
    rifiutata: 'Rifiutata',
    scaduta:   'Scaduta',
  };
  return `<span class="off-stato-badge off-stato-${escapeHtml(s)}">${escapeHtml(labels[s] || s)}</span>`;
}

function renderTable(list) {
  if (!list.length) {
    offerteBody.innerHTML = '';
    offerteEmpty.classList.add('visible');
    return;
  }
  offerteEmpty.classList.remove('visible');

  offerteBody.innerHTML = list.map((o) => `
    <tr>
      <td><strong>${escapeHtml(o.numero || '—')}</strong></td>
      <td>${escapeHtml(fmtDate(o.data))}</td>
      <td>${escapeHtml(o.clienteNome || '—')}</td>
      <td>${escapeHtml(o.mandanteNome || '—')}</td>
      <td>${euro(o.totale)}</td>
      <td>${statoBadge(o.stato)}</td>
      <td>${escapeHtml(fmtDate(o.validaFino))}</td>
      <td>
        <button class="offerte-btn offerte-btn-sm" data-action="edit" data-id="${escapeHtml(o.id)}">✏️</button>
        <button class="offerte-btn offerte-btn-sm offerte-btn-danger" data-action="delete" data-id="${escapeHtml(o.id)}">🗑</button>
      </td>
    </tr>
  `).join('');
}

// ── Editor ─────────────────────────────────────────────────────────────────

async function openEditor(offerta = null) {
  currentDocId = offerta ? offerta.id : null;
  righe = [];
  rigaCounter = 0;
  righeBody.innerHTML = '';

  formOfferta.reset();

  if (offerta) {
    offEditorTitle.textContent = `Modifica Offerta ${escapeHtml(offerta.numero || '')}`;
    offNumero.value = offerta.numero || '';
    formOfferta.elements['data'].value      = offerta.data || '';
    formOfferta.elements['validaFino'].value = offerta.validaFino || '';
    formOfferta.elements['stato'].value     = offerta.stato || 'bozza';
    formOfferta.elements['clienteId'].value  = offerta.clienteId || '';
    formOfferta.elements['mandanteId'].value = offerta.mandanteId || '';
    formOfferta.elements['note'].value       = offerta.note || '';
    formOfferta.elements['docId'].value      = offerta.id;
    formOfferta.elements['anno'].value       = offerta.anno || '';

    (offerta.righe || []).forEach((r) => addRiga(r));

    btnConvertOrdine.style.display = offerta.stato === 'accettata' ? '' : 'none';
  } else {
    offEditorTitle.textContent = 'Nuova Offerta';
    const anno = new Date().getFullYear();
    formOfferta.elements['data'].value  = todayISO();
    formOfferta.elements['stato'].value = 'bozza';
    formOfferta.elements['anno'].value  = anno;
    formOfferta.elements['docId'].value = '';
    offNumero.value = '';
    btnConvertOrdine.style.display = 'none';

    const num = await generateNumero(anno);
    offNumero.value = num;
  }

  calcTotals();
  offEditorOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeEditor() {
  offEditorOverlay.style.display = 'none';
  document.body.style.overflow = '';
  currentDocId = null;
  righe = [];
  rigaCounter = 0;
  formOfferta.reset();
  righeBody.innerHTML = '';
  calcTotals();
}

// ── Righe (line items) ─────────────────────────────────────────────────────

function makeRiga(data = {}) {
  const id = ++rigaCounter;
  return {
    id,
    codice:         data.codice         || '',
    descrizione:    data.descrizione    || '',
    quantita:       data.quantita       ?? 1,
    prezzoUnitario: data.prezzoUnitario ?? 0,
    sconto:         data.sconto         ?? 0,
    aliquotaIVA:    data.aliquotaIVA    ?? 22,
    totaleRiga:     data.totaleRiga     ?? 0,
  };
}

function addRiga(data = {}) {
  const riga = makeRiga(data);
  righe.push(riga);

  const totale = calcRiga(riga);
  riga.totaleRiga = totale;

  const tr = document.createElement('tr');
  tr.dataset.rigaId = riga.id;
  tr.innerHTML = `
    <td><input type="text"   data-field="codice"          value="${escapeHtml(riga.codice)}"                           placeholder="COD"/></td>
    <td><input type="text"   data-field="descrizione"     value="${escapeHtml(riga.descrizione)}"                      placeholder="Descrizione prodotto"/></td>
    <td><input type="number" data-field="quantita"        value="${riga.quantita}"        min="0" step="any"           placeholder="1"/></td>
    <td><input type="number" data-field="prezzoUnitario"  value="${riga.prezzoUnitario}"  min="0" step="any"           placeholder="0,00"/></td>
    <td><input type="number" data-field="sconto"          value="${riga.sconto}"          min="0" max="100" step="any" placeholder="0"/></td>
    <td><input type="number" data-field="aliquotaIVA"     value="${riga.aliquotaIVA}"     min="0" max="100" step="any" placeholder="22"/></td>
    <td class="off-riga-totale" data-riga-totale="${riga.id}">${euro(totale)}</td>
    <td class="off-riga-del">
      <button type="button" class="offerte-btn offerte-btn-sm offerte-btn-danger" data-action="removeRiga" data-riga-id="${riga.id}">✕</button>
    </td>
  `;
  righeBody.appendChild(tr);

  return riga;
}

function removeRiga(id) {
  const numId = Number(id);
  righe = righe.filter((r) => r.id !== numId);
  const tr = righeBody.querySelector(`tr[data-riga-id="${id}"]`);
  if (tr) tr.remove();
  calcTotals();
}

function calcRiga(riga) {
  const qty   = Number(riga.quantita)       || 0;
  const price = Number(riga.prezzoUnitario) || 0;
  const disc  = Math.min(100, Math.max(0, Number(riga.sconto) || 0));
  return qty * price * (1 - disc / 100);
}

function calcTotals() {
  let imponibile = 0;
  let totalIVA   = 0;

  righe.forEach((r) => {
    const base = calcRiga(r);
    const iva  = base * ((Number(r.aliquotaIVA) || 0) / 100);
    imponibile += base;
    totalIVA   += iva;
  });

  const totale = imponibile + totalIVA;
  offImponibile.textContent = euro(imponibile);
  offIVA.textContent        = euro(totalIVA);
  offTotale.textContent     = euro(totale);
}

// ── Save ───────────────────────────────────────────────────────────────────

async function saveOfferta(overrideStato = null) {
  const els   = formOfferta.elements;
  const data  = els['data'].value;
  const stato = overrideStato || els['stato'].value;

  if (!data) {
    alert('Inserisci la data dell\'offerta.');
    return;
  }

  const anno      = Number(els['anno'].value) || new Date().getFullYear();
  const docId     = els['docId'].value || null;
  const numero    = offNumero.value;
  const clienteId = els['clienteId'].value;
  const mandanteId= els['mandanteId'].value;

  const clienteObj  = clienti.find((c) => c.id === clienteId);
  const mandanteObj = mandanti.find((m) => m.id === mandanteId);

  const clienteNome  = clienteObj  ? (clienteObj.ragioneSociale  || clienteObj.nome  || '') : '';
  const mandanteNome = mandanteObj ? (mandanteObj.ragioneSociale || mandanteObj.nome || '') : '';

  // Recalc fresh totals
  let imponibile = 0;
  let totalIVA   = 0;
  const righeData = righe.map((r) => {
    const base = calcRiga(r);
    const iva  = base * ((Number(r.aliquotaIVA) || 0) / 100);
    imponibile += base;
    totalIVA   += iva;
    return {
      codice:         r.codice,
      descrizione:    r.descrizione,
      quantita:       Number(r.quantita)       || 0,
      prezzoUnitario: Number(r.prezzoUnitario) || 0,
      sconto:         Number(r.sconto)         || 0,
      aliquotaIVA:    Number(r.aliquotaIVA)    || 0,
      totaleRiga:     base,
    };
  });
  const totale = imponibile + totalIVA;

  const payload = {
    numero,
    anno,
    data,
    validaFino:   els['validaFino'].value || '',
    stato,
    clienteId:    clienteId  || '',
    clienteNome,
    mandanteId:   mandanteId || '',
    mandanteNome,
    note:         els['note'].value || '',
    righe:        righeData,
    imponibile,
    totalIVA,
    totale,
    updatedAt:    fs.serverTimestamp(),
  };

  try {
    if (docId) {
      await fs.update(COL_OFFERTE, docId, payload);
    } else {
      payload.createdAt = fs.serverTimestamp();
      const newId = await fs.add(COL_OFFERTE, payload);
      els['docId'].value = newId;
      currentDocId = newId;
    }

    await loadOfferte();
    // Update stato select in form to reflect saved value
    els['stato'].value = stato;
    btnConvertOrdine.style.display = stato === 'accettata' ? '' : 'none';
  } catch (e) {
    console.error('[offerte] saveOfferta', e);
    alert('Errore nel salvataggio dell\'offerta: ' + (e.message || e));
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────

async function deleteOfferta(id) {
  const o = offerte.find((x) => x.id === id);
  const label = o ? `${o.numero || id}` : id;
  if (!confirm(`Eliminare l'offerta ${label}?`)) return;
  try {
    await fs.remove(COL_OFFERTE, id);
    await loadOfferte();
  } catch (e) {
    console.error('[offerte] deleteOfferta', e);
    alert('Errore nell\'eliminazione: ' + (e.message || e));
  }
}

// ── Event delegation for righe inputs ─────────────────────────────────────

function handleRigheInput(e) {
  const input = e.target;
  if (!input.dataset.field) return;

  const tr = input.closest('tr[data-riga-id]');
  if (!tr) return;

  const rigaId = Number(tr.dataset.rigaId);
  const riga   = righe.find((r) => r.id === rigaId);
  if (!riga) return;

  const field = input.dataset.field;
  const numericFields = ['quantita','prezzoUnitario','sconto','aliquotaIVA'];
  riga[field] = numericFields.includes(field) ? (Number(input.value) || 0) : input.value;

  if (numericFields.includes(field)) {
    const newTotale = calcRiga(riga);
    riga.totaleRiga = newTotale;
    const cell = tr.querySelector(`[data-riga-totale="${rigaId}"]`);
    if (cell) cell.textContent = euro(newTotale);
    calcTotals();
  }
}

// ── Events ─────────────────────────────────────────────────────────────────

function bindEvents() {
  // Filters
  filterStato.addEventListener('change', applyFilters);
  filterAnno.addEventListener('input', applyFilters);
  filterCliente.addEventListener('input', applyFilters);
  filterMandante.addEventListener('input', applyFilters);

  // New offer
  btnNewOfferta.addEventListener('click', () => openEditor());

  // Table actions (edit / delete)
  offerteBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'edit') {
      const o = offerte.find((x) => x.id === id);
      if (o) openEditor(o);
    } else if (action === 'delete') {
      deleteOfferta(id);
    }
  });

  // Close editor
  closeOffEditor.addEventListener('click', closeEditor);
  offEditorOverlay.addEventListener('click', (e) => {
    if (e.target === offEditorOverlay) closeEditor();
  });

  // Keyboard close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && offEditorOverlay.style.display !== 'none') closeEditor();
  });

  // Add riga
  btnAddRiga.addEventListener('click', () => {
    addRiga();
    calcTotals();
  });

  // Remove riga (delegated)
  righeBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="removeRiga"]');
    if (!btn) return;
    removeRiga(btn.dataset.rigaId);
  });

  // Riga input changes
  righeBody.addEventListener('input', handleRigheInput);

  // Save buttons
  btnSalvaBozza.addEventListener('click', async () => {
    await saveOfferta('bozza');
  });

  btnInviaOfferta.addEventListener('click', async () => {
    const els = formOfferta.elements;
    if (!els['data'].value) {
      alert('Inserisci la data dell\'offerta.');
      return;
    }
    if (!els['clienteId'].value) {
      alert('Seleziona un cliente prima di inviare l\'offerta.');
      return;
    }
    await saveOfferta('inviata');
  });

  btnConvertOrdine.addEventListener('click', async () => {
    if (!currentDocId) return;
    const offerta = offerte.find(o => o.id === currentDocId);
    if (!offerta) return;
    if (offerta.ordineId) {
      alert('Questa offerta è già stata convertita in ordine.');
      return;
    }
    if (!confirm(`Convertire l'offerta ${offerta.numero || currentDocId} in un ordine?`)) return;

    const righeOrdine = (offerta.righe || []).map(r => ({
      codice:         r.codice || '',
      descrizione:    r.descrizione || '',
      quantita:       Number(r.quantita) || 0,
      prezzoUnitario: Number(r.prezzoUnitario) || 0,
      sconto:         Number(r.sconto) || 0,
      aliquotaIVA:    Number(r.aliquotaIVA) || 0,
      totaleRiga:     Number(r.totaleRiga) || 0,
    }));

    const orderData = {
      clienteId:     offerta.clienteId     || '',
      clienteNome:   offerta.clienteNome   || '',
      mandanteId:    offerta.mandanteId    || '',
      mandanteNome:  offerta.mandanteNome  || '',
      righe:         righeOrdine,
      totale:        Number(offerta.totale) || 0,
      stato:         'da_incassare',
      source:        'offerta_import',
      offertaId:     currentDocId,
      offertaNumero: offerta.numero || '',
      createdAt:     fs.serverTimestamp(),
    };

    try {
      const newOrderId = await fs.add('orders', orderData);
      await fs.update(COL_OFFERTE, currentDocId, { ordineId: newOrderId });
      const idx = offerte.findIndex(o => o.id === currentDocId);
      if (idx !== -1) offerte[idx].ordineId = newOrderId;
      alert(`Ordine creato con successo (ID: ${newOrderId}). Vuoi aprire la pagina ordini?`);
      if (confirm('Vai alla pagina Ordini Clienti?')) {
        window.location.href = 'ordini-clienti.html';
      }
    } catch (e) {
      console.error('[offerte] convertOrdine', e);
      alert('Errore nella conversione: ' + (e.message || e));
    }
  });

  // M2-D: Applica sconto
  if (btnApplicaSconto) {
    btnApplicaSconto.addEventListener('click', async () => {
      const clienteId  = formOfferta.elements['clienteId']?.value  || '';
      const mandanteId = formOfferta.elements['mandanteId']?.value || '';
      let imponibile = 0;
      righe.forEach(r => { imponibile += calcRiga(r); });
      try {
        const sconto = await applyBestSconto(clienteId, mandanteId, imponibile);
        if (!sconto) {
          alert('Nessuna regola di sconto applicabile per questa combinazione.');
          return;
        }
        const label = sconto.tipoSconto === 'valore_fisso'
          ? `€ ${sconto.valore}`
          : `${sconto.valore}%`;
        if (confirm(`Applicare sconto "${label}" (priorità ${sconto.priorita})?\nNote: ${sconto.note || '—'}`)) {
          righe.forEach(r => { r.sconto = Number(sconto.valore) || 0; });
          // re-render righe
          righeBody.querySelectorAll('tr[data-riga-id]').forEach(tr => {
            const rid  = Number(tr.dataset.rigaId);
            const riga = righe.find(r => r.id === rid);
            if (!riga) return;
            const inp = tr.querySelector('[data-field="sconto"]');
            if (inp) inp.value = riga.sconto;
            riga.totaleRiga = calcRiga(riga);
            const cell = tr.querySelector(`[data-riga-totale="${rid}"]`);
            if (cell) cell.textContent = euro(riga.totaleRiga);
          });
          calcTotals();
        }
      } catch (err) {
        console.error('[offerte] applySconto', err);
        alert('Errore: ' + (err.message || err));
      }
    });
  }
}
