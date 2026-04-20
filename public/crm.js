// crm.js — CRM Attività module for DCR GROUP
import { firestoreService as fs } from './services/firestoreService.js';
import { todayISO, escapeHtml, fmtDate } from './utils.js';
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ── State ──────────────────────────────────────────────────────────────────

let attivita  = [];
let clienti   = [];
let mandanti  = [];
let currentUser = null;

// ── DOM refs ───────────────────────────────────────────────────────────────

const kpiTotale   = document.getElementById('kpiTotale');
const kpiVisite   = document.getElementById('kpiVisite');
const kpiChiamate = document.getElementById('kpiChiamate');
const kpiEmail    = document.getElementById('kpiEmail');

const filterTipo      = document.getElementById('filterTipo');
const filterDataDa    = document.getElementById('filterDataDa');
const filterDataA     = document.getElementById('filterDataA');
const filterCliente   = document.getElementById('filterCliente');
const filterMandante  = document.getElementById('filterMandante');
const btnNewAttivita  = document.getElementById('btnNewAttivita');

const crmBody    = document.getElementById('crmBody');
const crmEmpty   = document.getElementById('crmEmpty');

const modalAttivita      = document.getElementById('modalAttivita');
const modalAttivitaTitle = document.getElementById('modalAttivitaTitle');
const closeModalAttivita = document.getElementById('closeModalAttivita');
const formAttivita       = document.getElementById('formAttivita');

const selectCliente  = document.getElementById('selectCliente');
const selectMandante = document.getElementById('selectMandante');

// ── Auth guard ─────────────────────────────────────────────────────────────

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  init();
});

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  await Promise.all([loadClienti(), loadMandanti()]);
  populateClienteSelect();
  populateMandanteSelect();
  await loadAttivita();
  bindEvents();
  setupTabs();
  setupTrattativeEvents();
}

// ── Data loading ───────────────────────────────────────────────────────────

async function loadAttivita() {
  let loaded = false;
  try {
    const q = fs.col('crmAttivita');
    const { query, orderBy } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const sorted = query(q, orderBy('data', 'desc'));
    attivita = await fs.getAllFromQuery(sorted, { name: 'crmAttivita' });
    loaded = true;
  } catch (e) {
    console.warn('[crm] loadAttivita query failed, fallback to getAll', e);
  }
  if (!loaded) {
    try {
      attivita = await fs.getAll('crmAttivita');
      loaded = true;
    } catch (e) {
      console.error('[crm] loadAttivita getAll failed', e);
      attivita = [];
    }
  }
  attivita.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  applyFilters();
}

async function loadClienti() {
  try {
    clienti = await fs.getAll('clienti');
  } catch {
    clienti = [];
  }
}

async function loadMandanti() {
  try {
    mandanti = await fs.getAll('mandanti');
  } catch {
    mandanti = [];
  }
}

// ── Selects population ─────────────────────────────────────────────────────

function populateClienteSelect() {
  const sorted = [...clienti].sort((a, b) => {
    const na = a.ragioneSociale || a.nome || '';
    const nb = b.ragioneSociale || b.nome || '';
    return na.localeCompare(nb, 'it');
  });
  selectCliente.innerHTML = '<option value="">— Nessuno —</option>' +
    sorted.map(c => {
      const name = escapeHtml(c.ragioneSociale || c.nome || c.id);
      return `<option value="${escapeHtml(c.id)}">${name}</option>`;
    }).join('');
}

function populateMandanteSelect() {
  const sorted = [...mandanti].sort((a, b) =>
    (a.ragioneSociale || '').localeCompare(b.ragioneSociale || '', 'it')
  );
  selectMandante.innerHTML = '<option value="">— Nessuno —</option>' +
    sorted.map(m => {
      const name = escapeHtml(m.ragioneSociale || m.nome || m.id);
      return `<option value="${escapeHtml(m.id)}">${name}</option>`;
    }).join('');
}

// ── Filtering ──────────────────────────────────────────────────────────────

function applyFilters() {
  const tipo     = filterTipo.value.trim().toLowerCase();
  const dataDa   = filterDataDa.value;
  const dataA    = filterDataA.value;
  const cliente  = filterCliente.value.trim().toLowerCase();
  const mandante = filterMandante.value.trim().toLowerCase();

  const list = attivita.filter(a => {
    if (tipo && (a.tipo || '').toLowerCase() !== tipo) return false;
    if (dataDa && (a.data || '') < dataDa) return false;
    if (dataA  && (a.data || '') > dataA)  return false;
    if (cliente) {
      const cn = (a.clienteNome || '').toLowerCase();
      if (!cn.includes(cliente)) return false;
    }
    if (mandante) {
      const mn = (a.mandanteNome || '').toLowerCase();
      if (!mn.includes(mandante)) return false;
    }
    return true;
  });

  updateKpis(list);
  renderTable(list);
}

// ── KPIs ───────────────────────────────────────────────────────────────────

function updateKpis(list) {
  kpiTotale.textContent   = list.length;
  kpiVisite.textContent   = list.filter(a => a.tipo === 'visita').length;
  kpiChiamate.textContent = list.filter(a => a.tipo === 'chiamata').length;
  kpiEmail.textContent    = list.filter(a => a.tipo === 'email').length;
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderTable(list) {
  if (!list.length) {
    crmBody.innerHTML = '';
    crmEmpty.classList.add('visible');
    return;
  }
  crmEmpty.classList.remove('visible');

  crmBody.innerHTML = list.map(a => {
    const data      = escapeHtml(fmtDate(a.data) || a.data || '—');
    const tipo      = escapeHtml(a.tipo || '');
    const cliente   = escapeHtml(a.clienteNome || '—');
    const mandante  = escapeHtml(a.mandanteNome || '—');
    const esito     = a.esito || 'neutro';
    const desc      = escapeHtml(a.descrizione || '');
    const id        = escapeHtml(a.id);

    const tipoBadge = tipo
      ? `<span class="crm-badge crm-badge-${tipo}">${tipo}</span>`
      : '<span class="crm-badge">—</span>';

    const esitoBadge = `<span class="crm-esito-badge crm-esito-${escapeHtml(esito)}">${escapeHtml(labelEsito(esito))}</span>`;

    return `<tr>
      <td>${data}</td>
      <td>${tipoBadge}</td>
      <td>${cliente}</td>
      <td>${mandante}</td>
      <td>${esitoBadge}</td>
      <td class="crm-desc-cell" title="${desc}">${desc}</td>
      <td class="crm-actions-cell">
        <button class="crm-btn crm-btn-sm" data-edit="${id}">✏️</button>
        <button class="crm-btn crm-btn-sm crm-btn-danger" data-delete="${id}">🗑️</button>
        <button class="crm-btn crm-btn-sm" data-agenda="${id}" title="Aggiungi all'Agenda">📅 Agenda</button>
      </td>
    </tr>`;
  }).join('');
}

function labelEsito(esito) {
  const map = {
    positivo:  'Positivo',
    neutro:    'Neutro',
    negativo:  'Negativo',
    da_seguire:'Da Seguire',
  };
  return map[esito] || esito;
}

// ── Save ───────────────────────────────────────────────────────────────────

async function saveAttivita(formData) {
  const id         = formData.get('id') || '';
  const clienteId  = formData.get('clienteId') || '';
  const mandanteId = formData.get('mandanteId') || '';

  const clienteObj  = clienti.find(c => c.id === clienteId);
  const mandanteObj = mandanti.find(m => m.id === mandanteId);

  const doc = {
    tipo:         formData.get('tipo') || 'visita',
    data:         formData.get('data') || todayISO(),
    ora:          formData.get('ora') || '',
    durata:       Number(formData.get('durata')) || 0,
    clienteId:    clienteId,
    clienteNome:  clienteObj ? (clienteObj.ragioneSociale || clienteObj.nome || '') : '',
    mandanteId:   mandanteId,
    mandanteNome: mandanteObj ? (mandanteObj.ragioneSociale || mandanteObj.nome || '') : '',
    esito:        formData.get('esito') || 'neutro',
    descrizione:  formData.get('descrizione') || '',
    note:         formData.get('note') || '',
    utenteId:     currentUser?.uid || '',
  };

  if (id) {
    await fs.update('crmAttivita', id, doc);
    const idx = attivita.findIndex(a => a.id === id);
    if (idx !== -1) attivita[idx] = { ...attivita[idx], ...doc };
  } else {
    doc.createdAt = fs.serverTimestamp();
    const newId = await fs.add('crmAttivita', doc);
    attivita.unshift({ id: newId, ...doc });
  }

  closeModal();
  applyFilters();
}

// ── Delete ─────────────────────────────────────────────────────────────────

async function deleteAttivita(id) {
  if (!confirm('Eliminare questa attività?')) return;
  await fs.remove('crmAttivita', id);
  attivita = attivita.filter(a => a.id !== id);
  applyFilters();
}

// ── Modal helpers ──────────────────────────────────────────────────────────

function openModal(attivitaItem = null) {
  formAttivita.reset();
  formAttivita.elements['id'].value = '';

  if (attivitaItem) {
    modalAttivitaTitle.textContent = 'Modifica Attività';
    formAttivita.elements['id'].value         = attivitaItem.id;
    formAttivita.elements['tipo'].value       = attivitaItem.tipo || 'visita';
    formAttivita.elements['data'].value       = attivitaItem.data || '';
    formAttivita.elements['ora'].value        = attivitaItem.ora || '';
    formAttivita.elements['durata'].value     = attivitaItem.durata || '';
    formAttivita.elements['clienteId'].value  = attivitaItem.clienteId || '';
    formAttivita.elements['mandanteId'].value = attivitaItem.mandanteId || '';
    formAttivita.elements['esito'].value      = attivitaItem.esito || 'neutro';
    formAttivita.elements['descrizione'].value= attivitaItem.descrizione || '';
    formAttivita.elements['note'].value       = attivitaItem.note || '';
  } else {
    modalAttivitaTitle.textContent = 'Nuova Attività';
    formAttivita.elements['data'].value = todayISO();
  }

  modalAttivita.style.display = 'flex';
}

function closeModal() {
  modalAttivita.style.display = 'none';
}

// ── Event bindings ─────────────────────────────────────────────────────────

function bindEvents() {
  btnNewAttivita.addEventListener('click', () => openModal());
  closeModalAttivita.addEventListener('click', closeModal);

  modalAttivita.addEventListener('click', (e) => {
    if (e.target === modalAttivita) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalAttivita.style.display !== 'none') closeModal();
  });

  formAttivita.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = formAttivita.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await saveAttivita(new FormData(formAttivita));
    } catch (err) {
      console.error('Errore salvataggio CRM:', err);
      alert('Errore durante il salvataggio. Riprova.');
    } finally {
      btn.disabled = false;
    }
  });

  crmBody.addEventListener('click', (e) => {
    const editBtn   = e.target.closest('[data-edit]');
    const deleteBtn = e.target.closest('[data-delete]');
    const agendaBtn = e.target.closest('[data-agenda]');
    if (editBtn) {
      const id = editBtn.dataset.edit;
      const item = attivita.find(a => a.id === id);
      if (item) openModal(item);
    } else if (deleteBtn) {
      deleteAttivita(deleteBtn.dataset.delete);
    } else if (agendaBtn) {
      addToAgenda(agendaBtn.dataset.agenda);
    }
  });

  [filterTipo, filterDataDa, filterDataA].forEach(el =>
    el.addEventListener('change', applyFilters)
  );
  [filterCliente, filterMandante].forEach(el =>
    el.addEventListener('input', applyFilters)
  );

  const quickNav = document.getElementById('quickNav');
  if (quickNav) {
    const ALLOWED = new Set([
      'index.html','clients.html','suppliers.html','listini.html',
      'ordini-clienti.html','incassi.html','spese.html','scadenze.html',
      'agenda.html','statistiche.html','finanze.html','mandanti.html',
      'crm.html','offerte.html','fatture.html','mailing.html',
      'price-requests.html','search.html',
    ]);
    quickNav.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val && ALLOWED.has(val)) window.location.href = val;
      else quickNav.value = '';
    });
  }
}

// ── M2-C: Add to Agenda ────────────────────────────────────────────────────

async function addToAgenda(attivitaId) {
  const a = attivita.find(x => x.id === attivitaId);
  if (!a) return;
  try {
    const data = a.data || todayISO();
    const ora = a.ora || '09:00';
    const durata = Math.max(Number(a.durata) || 60, 15);
    let start = new Date(`${data}T${ora}:00`);
    if (Number.isNaN(start.getTime())) start = new Date(`${data}T09:00:00`);
    const end = new Date(start.getTime() + (durata * 60 * 1000));
    await fs.add('agendaEvents', {
      title: `[CRM] ${a.tipo || 'attività'} - ${a.clienteNome || 'Cliente'}`,
      type: 'crm',
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      color: '#14b8a6',
      date: data,
      crmAttivitaId: attivitaId,
      clienteId: a.clienteId || '',
      clienteNome: a.clienteNome || '',
      createdAt: new Date().toISOString(),
    });
    showCrmToast('Evento aggiunto all\'Agenda');
  } catch (e) {
    console.error('[crm] addToAgenda', e);
    showCrmToast('Errore: ' + (e.message || e), true);
  }
}

// ── M2-B: Trattative ──────────────────────────────────────────────────────

let trattative = [];
let currentTrattativaId = null;

async function loadTrattative() {
  try {
    trattative = await fs.getAll('trattative');
    trattative.sort((a, b) => (b.dataApertura || '').localeCompare(a.dataApertura || ''));
  } catch (e) {
    trattative = [];
  }
  applyTrattativeFilters();
}

function applyTrattativeFilters() {
  const q = (document.getElementById('filterTrattCliente')?.value || '').toLowerCase();
  const s = document.getElementById('filterTrattStato')?.value || '';
  const list = trattative.filter(t => {
    if (s && t.stato !== s) return false;
    if (q && !(t.clienteNome || '').toLowerCase().includes(q) && !(t.titolo || '').toLowerCase().includes(q)) return false;
    return true;
  });
  updateTrattativeKpis(list);
  renderTrattativeTable(list);
}

function updateTrattativeKpis(list) {
  const el = (id) => document.getElementById(id);
  if (el('kpiTrattTot'))    el('kpiTrattTot').textContent   = list.length;
  if (el('kpiTrattAperte')) el('kpiTrattAperte').textContent = list.filter(t => t.stato === 'aperta' || t.stato === 'in_corso').length;
  if (el('kpiTrattVinte'))  el('kpiTrattVinte').textContent  = list.filter(t => t.stato === 'chiusa_vinta').length;
  if (el('kpiTrattPerse'))  el('kpiTrattPerse').textContent  = list.filter(t => t.stato === 'chiusa_persa').length;
}

const TRATT_STATO_LABELS = {
  aperta: 'Aperta', in_corso: 'In Corso',
  chiusa_vinta: 'Chiusa Vinta', chiusa_persa: 'Chiusa Persa',
};

function renderTrattativeTable(list) {
  const tbody = document.getElementById('trattativeBody');
  const empty = document.getElementById('trattativeEmpty');
  if (!tbody) return;
  if (!list.length) {
    tbody.innerHTML = '';
    if (empty) empty.classList.add('visible');
    return;
  }
  if (empty) empty.classList.remove('visible');
  tbody.innerHTML = list.map(t => `<tr>
    <td><strong>${escapeHtml(t.titolo || '—')}</strong></td>
    <td>${escapeHtml(t.clienteNome || '—')}</td>
    <td>${escapeHtml(t.mandanteNome || '—')}</td>
    <td><span class="crm-badge crm-badge-${escapeHtml(t.stato || 'aperta')}">${escapeHtml(TRATT_STATO_LABELS[t.stato] || t.stato || '—')}</span></td>
    <td>${t.valoreStimato ? '€ ' + Number(t.valoreStimato).toLocaleString('it-IT') : '—'}</td>
    <td>${escapeHtml(fmtDate(t.dataApertura) || '—')}</td>
    <td class="crm-actions-cell">
      <button class="crm-btn crm-btn-sm" data-tratt-edit="${escapeHtml(t.id)}">✏️</button>
      <button class="crm-btn crm-btn-sm" data-tratt-timeline="${escapeHtml(t.id)}">📋 Timeline</button>
      <button class="crm-btn crm-btn-sm crm-btn-danger" data-tratt-delete="${escapeHtml(t.id)}">🗑️</button>
    </td>
  </tr>`).join('');
}

function openTrattativaModal(t = null) {
  const modal = document.getElementById('modalTrattativa');
  const form  = document.getElementById('formTrattativa');
  const title = document.getElementById('modalTrattativaTitle');
  if (!modal || !form) return;
  form.reset();
  form.elements['id'].value = '';
  if (t) {
    if (title) title.textContent = 'Modifica Trattativa';
    form.elements['id'].value          = t.id;
    form.elements['titolo'].value      = t.titolo || '';
    form.elements['clienteId'].value   = t.clienteId || '';
    form.elements['mandanteId'].value  = t.mandanteId || '';
    form.elements['stato'].value       = t.stato || 'aperta';
    form.elements['valoreStimato'].value = t.valoreStimato || '';
    form.elements['dataApertura'].value  = t.dataApertura || '';
    form.elements['dataChiusura'].value  = t.dataChiusura || '';
    form.elements['note'].value          = t.note || '';
  } else {
    if (title) title.textContent = 'Nuova Trattativa';
    form.elements['dataApertura'].value = todayISO();
  }
  modal.style.display = 'flex';
}

async function saveTrattativa(fd) {
  const id         = fd.get('id') || '';
  const clienteId  = fd.get('clienteId') || '';
  const mandanteId = fd.get('mandanteId') || '';
  const clienteObj  = clienti.find(c => c.id === clienteId);
  const mandanteObj = mandanti.find(m => m.id === mandanteId);
  const doc = {
    titolo:        fd.get('titolo') || '',
    clienteId, clienteNome: clienteObj ? (clienteObj.ragioneSociale || clienteObj.nome || '') : '',
    mandanteId, mandanteNome: mandanteObj ? (mandanteObj.ragioneSociale || mandanteObj.nome || '') : '',
    stato:         fd.get('stato') || 'aperta',
    valoreStimato: Number(fd.get('valoreStimato')) || 0,
    dataApertura:  fd.get('dataApertura') || todayISO(),
    dataChiusura:  fd.get('dataChiusura') || '',
    note:          fd.get('note') || '',
  };
  if (id) {
    await fs.update('trattative', id, doc);
    const idx = trattative.findIndex(t => t.id === id);
    if (idx !== -1) trattative[idx] = { ...trattative[idx], ...doc };
  } else {
    doc.createdAt = fs.serverTimestamp();
    doc.steps = [];
    const newId = await fs.add('trattative', doc);
    trattative.unshift({ id: newId, ...doc, steps: [] });
  }
  document.getElementById('modalTrattativa').style.display = 'none';
  applyTrattativeFilters();
}

async function deleteTrattativa(id) {
  if (!confirm('Eliminare questa trattativa?')) return;
  await fs.remove('trattative', id);
  trattative = trattative.filter(t => t.id !== id);
  applyTrattativeFilters();
}

function openTimeline(trattativaId) {
  currentTrattativaId = trattativaId;
  const t = trattative.find(x => x.id === trattativaId);
  if (!t) return;
  const panel  = document.getElementById('trattativaTimeline');
  const title  = document.getElementById('timelineTitle');
  if (title) title.textContent = `Timeline: ${t.titolo || ''}`;
  renderTimelineSteps(t.steps || []);
  if (panel) panel.style.display = '';
}

function renderTimelineSteps(steps) {
  const el = document.getElementById('timelineSteps');
  if (!el) return;
  if (!steps.length) {
    el.innerHTML = '<p style="color:#64748b;padding:12px">Nessuna nota ancora.</p>';
    return;
  }
  const sorted = [...steps].sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  el.innerHTML = sorted.map(s => `
    <div class="crm-timeline-step">
      <div class="crm-timeline-dot"></div>
      <div class="crm-timeline-content">
        <div class="crm-timeline-date">${escapeHtml(fmtDate(s.data) || s.data || '—')}</div>
        <div class="crm-timeline-desc">${escapeHtml(s.descrizione || '')}</div>
        ${s.utente ? `<div class="crm-timeline-user">${escapeHtml(s.utente)}</div>` : ''}
      </div>
    </div>`).join('');
}

async function addStep(fd) {
  if (!currentTrattativaId) return;
  const t = trattative.find(x => x.id === currentTrattativaId);
  if (!t) return;
  const step = {
    data:        fd.get('data') || todayISO(),
    descrizione: fd.get('descrizione') || '',
    utente:      currentUser?.email || '',
  };
  const steps = [...(t.steps || []), step];
  await fs.update('trattative', currentTrattativaId, { steps });
  t.steps = steps;
  renderTimelineSteps(steps);
  document.getElementById('modalStep').style.display = 'none';
}

function setupTrattativeEvents() {
  const btnNew = document.getElementById('btnNewTrattativa');
  if (btnNew) btnNew.addEventListener('click', () => openTrattativaModal());

  const closeModal = document.getElementById('closeModalTrattativa');
  if (closeModal) closeModal.addEventListener('click', () => { document.getElementById('modalTrattativa').style.display = 'none'; });

  const formTratt = document.getElementById('formTrattativa');
  if (formTratt) formTratt.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = formTratt.querySelector('[type="submit"]');
    btn.disabled = true;
    try { await saveTrattativa(new FormData(formTratt)); }
    catch (err) { console.error(err); alert('Errore: ' + (err.message || err)); }
    finally { btn.disabled = false; }
  });

  const trattBody = document.getElementById('trattativeBody');
  if (trattBody) trattBody.addEventListener('click', (e) => {
    const editBtn     = e.target.closest('[data-tratt-edit]');
    const deleteBtn   = e.target.closest('[data-tratt-delete]');
    const timelineBtn = e.target.closest('[data-tratt-timeline]');
    if (editBtn) {
      const t = trattative.find(x => x.id === editBtn.dataset.trattEdit);
      if (t) openTrattativaModal(t);
    } else if (deleteBtn) {
      deleteTrattativa(deleteBtn.dataset.trattDelete);
    } else if (timelineBtn) {
      openTimeline(timelineBtn.dataset.trattTimeline);
    }
  });

  const btnClose = document.getElementById('btnCloseTimeline');
  if (btnClose) btnClose.addEventListener('click', () => {
    document.getElementById('trattativaTimeline').style.display = 'none';
    currentTrattativaId = null;
  });

  const btnAddStep = document.getElementById('btnAddStep');
  if (btnAddStep) btnAddStep.addEventListener('click', () => {
    const ms = document.getElementById('modalStep');
    const fs2 = document.getElementById('formStep');
    if (fs2) fs2.reset();
    const dateEl = fs2 && fs2.elements['data'];
    if (dateEl) dateEl.value = todayISO();
    if (ms) ms.style.display = 'flex';
  });

  const closeStep = document.getElementById('closeModalStep');
  if (closeStep) closeStep.addEventListener('click', () => { document.getElementById('modalStep').style.display = 'none'; });

  const formStep = document.getElementById('formStep');
  if (formStep) formStep.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = formStep.querySelector('[type="submit"]');
    btn.disabled = true;
    try { await addStep(new FormData(formStep)); }
    catch (err) { console.error(err); }
    finally { btn.disabled = false; }
  });

  // Trattative filters
  ['filterTrattCliente','filterTrattStato'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', applyTrattativeFilters);
  });

  // Populate trattative selects (clone from attività selects)
  const sc = document.getElementById('selectTrattCliente');
  const sm = document.getElementById('selectTrattMandante');
  const srcC = document.getElementById('selectCliente');
  const srcM = document.getElementById('selectMandante');
  if (sc && srcC) sc.innerHTML = srcC.innerHTML;
  if (sm && srcM) sm.innerHTML = srcM.innerHTML;
}

// ── Tab switching ──────────────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll('.crm-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.crm-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('panelAttivita').style.display   = tab === 'attivita'   ? '' : 'none';
      document.getElementById('panelTrattative').style.display = tab === 'trattative' ? '' : 'none';
      if (tab === 'trattative' && !trattative.length) loadTrattative();
    });
  });
}

// ── Toast helper ───────────────────────────────────────────────────────────

function showCrmToast(msg, error = false) {
  let t = document.getElementById('crm-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'crm-toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 22px;border-radius:8px;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .3s;color:#fff;';
    document.body.appendChild(t);
  }
  t.style.background = error ? '#dc2626' : '#1e293b';
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 3000);
}

// ── Extend init ────────────────────────────────────────────────────────────
// setupTabs and setupTrattativeEvents are called from the main init() above.
