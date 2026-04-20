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
}

// ── Data loading ───────────────────────────────────────────────────────────

async function loadAttivita() {
  try {
    const q = fs.col('crmAttivita');
    const { query, orderBy } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const sorted = query(q, orderBy('data', 'desc'));
    attivita = await fs.getAllFromQuery(sorted, { name: 'crmAttivita' });
  } catch {
    attivita = await fs.getAll('crmAttivita');
    attivita.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  }
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
    if (editBtn) {
      const id = editBtn.dataset.edit;
      const item = attivita.find(a => a.id === id);
      if (item) openModal(item);
    } else if (deleteBtn) {
      deleteAttivita(deleteBtn.dataset.delete);
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
