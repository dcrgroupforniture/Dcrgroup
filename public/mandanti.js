// mandanti.js — Mandanti module for DCR GROUP
import { firestoreService as fs } from './services/firestoreService.js';
import { euro, escapeHtml } from './utils.js';
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ─── State ──────────────────────────────────────────────────────────────────
let mandanti = [];
let currentMandante = null;
let currentBudget = null;

// ─── Constants ───────────────────────────────────────────────────────────────
const MESI_KEYS  = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const MESI_LABEL = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const COL_MAND   = 'mandanti';
const COL_BUDGET = 'budget';

// ─── Auth guard ───────────────────────────────────────────────────────────────
const unsub = onAuthStateChanged(auth, user => {
  unsub();
  if (user) {
    init();
  } else {
    window.location.href = 'index.html';
  }
});

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
  setupQuickNav();
  setupTabSwitching();
  setupSidebarSearch();
  setupNewMandanteButton();
  setupAnagraficaForm();
  setupContattiHandlers();
  setupLineeHandlers();
  setupBudgetHandlers();
  await loadMandanti();
}

// ─── Quick Nav ────────────────────────────────────────────────────────────────
const ALLOWED_NAV = new Set([
  'index.html','clients.html','suppliers.html','listini.html',
  'ordini-clienti.html','incassi.html','spese.html','scadenze.html',
  'agenda.html','statistiche.html','finanze.html','mandanti.html',
  'crm.html','offerte.html','fatture.html','mailing.html',
]);

function setupQuickNav() {
  const sel = document.getElementById('quickNav');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const dest = sel.value;
    if (dest && ALLOWED_NAV.has(dest)) window.location.href = dest;
  });
}

// ─── Load & Render Sidebar ────────────────────────────────────────────────────
async function loadMandanti() {
  try {
    mandanti = await fs.getAll(COL_MAND);
    mandanti.sort((a, b) =>
      String(a.ragioneSociale || '').localeCompare(String(b.ragioneSociale || ''), 'it')
    );
    renderSidebar(mandanti);
  } catch (e) {
    console.error('[mandanti] loadMandanti', e);
    showError('Errore nel caricamento dei mandanti.');
  }
}

function renderSidebar(list) {
  const container = document.getElementById('mandList');
  const empty = document.getElementById('mandEmptyState');
  container.querySelectorAll('.mand-item').forEach(el => el.remove());

  if (!list.length) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  list.forEach(m => {
    const item = document.createElement('div');
    item.className = 'mand-item' + (currentMandante && currentMandante.id === m.id ? ' active' : '');
    item.dataset.id = m.id;
    const badgeClass = m.stato === 'attivo' ? 'attivo' : 'non_attivo';
    const badgeLabel = m.stato === 'attivo' ? 'Attivo' : 'Non Attivo';
    item.innerHTML = `
      <span class="mand-item-name">${escapeHtml(m.ragioneSociale || '—')}</span>
      <span class="mand-item-badge ${escapeHtml(badgeClass)}">${escapeHtml(badgeLabel)}</span>
    `;
    item.addEventListener('click', () => selectMandante(m.id));
    container.appendChild(item);
  });
}

// ─── Sidebar Search ───────────────────────────────────────────────────────────
function setupSidebarSearch() {
  const input = document.getElementById('mandSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const filtered = q
      ? mandanti.filter(m =>
          (m.ragioneSociale || '').toLowerCase().includes(q) ||
          (m.nomeCommerciale || '').toLowerCase().includes(q)
        )
      : mandanti;
    renderSidebar(filtered);
  });
}

// ─── New Mandante ─────────────────────────────────────────────────────────────
function setupNewMandanteButton() {
  document.getElementById('btnNewMand').addEventListener('click', async () => {
    try {
      const id = await fs.add(COL_MAND, {
        ragioneSociale: 'Nuovo Mandante',
        stato: 'attivo',
        contatti: [],
        linee: [],
        createdAt: new Date().toISOString(),
      });
      await loadMandanti();
      selectMandante(id);
    } catch (e) {
      console.error('[mandanti] add', e);
      showError('Errore nella creazione del mandante.');
    }
  });
}

// ─── Select Mandante ──────────────────────────────────────────────────────────
async function selectMandante(id) {
  try {
    const m = await fs.getDoc(COL_MAND, id);
    currentMandante = m;

    // update sidebar active state
    document.querySelectorAll('.mand-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === id);
    });

    // show detail
    document.getElementById('mandNoSelection').style.display = 'none';
    document.getElementById('mandDetail').style.display = '';

    // update header
    document.getElementById('mandDetailTitle').textContent = m.ragioneSociale || '—';
    const badge = document.getElementById('mandDetailBadge');
    badge.textContent = m.stato === 'attivo' ? 'Attivo' : 'Non Attivo';
    badge.className = 'mand-item-badge ' + (m.stato === 'attivo' ? 'attivo' : 'non_attivo');

    // render active tab content
    renderAnagrafica(m);
    renderContatti(m);
    renderLinee(m);

    // switch to anagrafica by default (keep current tab if already visible)
    const activeTab = document.querySelector('.mand-tab.active');
    if (activeTab) {
      showTab(activeTab.dataset.tab, m);
    } else {
      showTab('anagrafica', m);
    }

    // setup delete button
    const btnDel = document.getElementById('btnDeleteMand');
    btnDel.onclick = () => deleteMandante(id);
  } catch (e) {
    console.error('[mandanti] selectMandante', e);
    showError('Errore nel caricamento del mandante.');
  }
}

// ─── Tab Switching ────────────────────────────────────────────────────────────
function setupTabSwitching() {
  document.querySelectorAll('.mand-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!currentMandante) return;
      showTab(btn.dataset.tab, currentMandante);
    });
  });
}

function showTab(tabName, m) {
  document.querySelectorAll('.mand-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.mand-panel').forEach(p => p.style.display = 'none');
  const panel = document.getElementById('tab' + capitalize(tabName));
  if (panel) panel.style.display = '';
  if (tabName === 'budget' && m) renderBudget(m.id);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Anagrafica ───────────────────────────────────────────────────────────────
function renderAnagrafica(m) {
  const form = document.getElementById('formAnagrafica');
  const fields = ['ragioneSociale','nomeCommerciale','partitaIVA','codiceFiscale',
                  'telefono','email','sitoWeb','stato',
                  'via','numero','citta','cap','provincia','nazione','note'];
  fields.forEach(name => {
    const el = form.elements[name];
    if (!el) return;
    el.value = m[name] ?? (name === 'nazione' ? 'Italia' : '');
  });
  document.getElementById('anagraficaStatus').textContent = '';
}

function setupAnagraficaForm() {
  const form = document.getElementById('formAnagrafica');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentMandante) return;
    const fd = new FormData(form);
    const data = {};
    fd.forEach((v, k) => { data[k] = v.trim(); });
    data.updatedAt = new Date().toISOString();
    try {
      await fs.update(COL_MAND, currentMandante.id, data);
      currentMandante = { ...currentMandante, ...data };
      const statusEl = document.getElementById('anagraficaStatus');
      statusEl.textContent = '✓ Salvato';
      setTimeout(() => { statusEl.textContent = ''; }, 2500);
      // Refresh header and sidebar
      document.getElementById('mandDetailTitle').textContent = data.ragioneSociale || '—';
      const badge = document.getElementById('mandDetailBadge');
      badge.textContent = data.stato === 'attivo' ? 'Attivo' : 'Non Attivo';
      badge.className = 'mand-item-badge ' + (data.stato === 'attivo' ? 'attivo' : 'non_attivo');
      // update local list
      const idx = mandanti.findIndex(x => x.id === currentMandante.id);
      if (idx >= 0) mandanti[idx] = { ...mandanti[idx], ...data };
      mandanti.sort((a, b) => String(a.ragioneSociale || '').localeCompare(String(b.ragioneSociale || ''), 'it'));
      renderSidebar(mandanti);
      // restore active item
      document.querySelectorAll('.mand-item').forEach(el => {
        el.classList.toggle('active', el.dataset.id === currentMandante.id);
      });
    } catch (err) {
      console.error('[mandanti] saveAnagrafica', err);
      showError('Errore nel salvataggio: ' + (err.message || err));
    }
  });
}

// ─── Delete Mandante ──────────────────────────────────────────────────────────
async function deleteMandante(id) {
  const m = mandanti.find(x => x.id === id);
  const name = m ? m.ragioneSociale : id;
  if (!confirm(`Eliminare "${name}"? L'azione è irreversibile.`)) return;
  try {
    await fs.remove(COL_MAND, id);
    currentMandante = null;
    document.getElementById('mandDetail').style.display = 'none';
    document.getElementById('mandNoSelection').style.display = '';
    await loadMandanti();
  } catch (e) {
    console.error('[mandanti] delete', e);
    showError('Errore nell\'eliminazione.');
  }
}

// ─── Contatti ─────────────────────────────────────────────────────────────────
function renderContatti(m) {
  const tbody = document.getElementById('contattiBody');
  const empty = document.getElementById('contattiEmpty');
  const contatti = Array.isArray(m.contatti) ? m.contatti : [];
  tbody.innerHTML = '';
  if (!contatti.length) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  contatti.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.nome || '')}</td>
      <td>${escapeHtml(c.cognome || '')}</td>
      <td>${escapeHtml(c.ruolo || '—')}</td>
      <td>${escapeHtml(c.telefono || '—')}</td>
      <td>${escapeHtml(c.email || '—')}</td>
      <td style="text-align:center">${c.principale ? '✓' : ''}</td>
      <td>
        <button class="mand-btn mand-btn-sm" data-edit-contatto="${escapeHtml(c.id)}">Modifica</button>
        <button class="mand-btn mand-btn-danger mand-btn-sm" data-del-contatto="${escapeHtml(c.id)}">Elimina</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit-contatto]').forEach(btn => {
    btn.addEventListener('click', () => openContattoModal(btn.dataset.editContatto));
  });
  tbody.querySelectorAll('[data-del-contatto]').forEach(btn => {
    btn.addEventListener('click', () => deleteContatto(btn.dataset.delContatto));
  });
}

function setupContattiHandlers() {
  document.getElementById('btnAddContatto').addEventListener('click', () => openContattoModal(null));
  document.getElementById('closeModalContatto').addEventListener('click', closeContattoModal);
  document.getElementById('modalContatto').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeContattoModal();
  });
  document.getElementById('formContatto').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentMandante) return;
    const fd = new FormData(e.target);
    const data = {
      id:        fd.get('id') || crypto.randomUUID(),
      nome:      fd.get('nome').trim(),
      cognome:   fd.get('cognome').trim(),
      ruolo:     fd.get('ruolo').trim(),
      telefono:  fd.get('telefono').trim(),
      email:     fd.get('email').trim(),
      note:      fd.get('note').trim(),
      principale: fd.get('principale') === 'on',
    };
    await saveContatto(data);
  });
}

function openContattoModal(contattoId) {
  const form = document.getElementById('formContatto');
  form.reset();
  if (contattoId) {
    const c = (currentMandante.contatti || []).find(x => x.id === contattoId);
    if (c) {
      form.elements['id'].value       = c.id;
      form.elements['nome'].value     = c.nome || '';
      form.elements['cognome'].value  = c.cognome || '';
      form.elements['ruolo'].value    = c.ruolo || '';
      form.elements['telefono'].value = c.telefono || '';
      form.elements['email'].value    = c.email || '';
      form.elements['note'].value     = c.note || '';
      form.elements['principale'].checked = !!c.principale;
    }
    document.getElementById('modalContattoTitle').textContent = 'Modifica Contatto';
  } else {
    document.getElementById('modalContattoTitle').textContent = 'Nuovo Contatto';
  }
  document.getElementById('modalContatto').style.display = 'flex';
}

function closeContattoModal() {
  document.getElementById('modalContatto').style.display = 'none';
}

async function saveContatto(data) {
  if (!currentMandante) return;
  const contatti = Array.isArray(currentMandante.contatti) ? [...currentMandante.contatti] : [];
  const idx = contatti.findIndex(c => c.id === data.id);
  if (idx >= 0) {
    contatti[idx] = data;
  } else {
    contatti.push(data);
  }
  try {
    await fs.update(COL_MAND, currentMandante.id, { contatti });
    currentMandante = { ...currentMandante, contatti };
    renderContatti(currentMandante);
    closeContattoModal();
  } catch (e) {
    console.error('[mandanti] saveContatto', e);
    showError('Errore nel salvataggio del contatto.');
  }
}

async function deleteContatto(contattoId) {
  if (!confirm('Eliminare questo contatto?')) return;
  if (!currentMandante) return;
  const contatti = (currentMandante.contatti || []).filter(c => c.id !== contattoId);
  try {
    await fs.update(COL_MAND, currentMandante.id, { contatti });
    currentMandante = { ...currentMandante, contatti };
    renderContatti(currentMandante);
  } catch (e) {
    console.error('[mandanti] deleteContatto', e);
    showError('Errore nell\'eliminazione del contatto.');
  }
}

// ─── Linee Prodotto ───────────────────────────────────────────────────────────
function renderLinee(m) {
  const tbody = document.getElementById('lineeBody');
  const empty = document.getElementById('lineeEmpty');
  const linee = Array.isArray(m.linee) ? m.linee : [];
  tbody.innerHTML = '';
  if (!linee.length) {
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  const sorted = [...linee].sort((a, b) => (Number(a.ordine) || 0) - (Number(b.ordine) || 0));
  sorted.forEach(l => {
    const tr = document.createElement('tr');
    const statoLabel = l.stato === 'attiva' ? 'Attiva' : 'Non Attiva';
    const statoClass = l.stato === 'attiva' ? 'attivo' : 'non_attivo';
    tr.innerHTML = `
      <td>${escapeHtml(l.nome || '')}</td>
      <td>${escapeHtml(l.descrizione || '—')}</td>
      <td><span class="mand-item-badge ${escapeHtml(statoClass)}">${escapeHtml(statoLabel)}</span></td>
      <td>${escapeHtml(String(l.ordine ?? 0))}</td>
      <td>
        <button class="mand-btn mand-btn-sm" data-edit-linea="${escapeHtml(l.id)}">Modifica</button>
        <button class="mand-btn mand-btn-danger mand-btn-sm" data-del-linea="${escapeHtml(l.id)}">Elimina</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit-linea]').forEach(btn => {
    btn.addEventListener('click', () => openLineaModal(btn.dataset.editLinea));
  });
  tbody.querySelectorAll('[data-del-linea]').forEach(btn => {
    btn.addEventListener('click', () => deleteLinea(btn.dataset.delLinea));
  });
}

function setupLineeHandlers() {
  document.getElementById('btnAddLinea').addEventListener('click', () => openLineaModal(null));
  document.getElementById('closeModalLinea').addEventListener('click', closeLineaModal);
  document.getElementById('modalLinea').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeLineaModal();
  });
  document.getElementById('formLinea').addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentMandante) return;
    const fd = new FormData(e.target);
    const data = {
      id:          fd.get('id') || crypto.randomUUID(),
      nome:        fd.get('nome').trim(),
      descrizione: fd.get('descrizione').trim(),
      stato:       fd.get('stato'),
      ordine:      parseInt(fd.get('ordine') || '0', 10),
    };
    await saveLinea(data);
  });
}

function openLineaModal(lineaId) {
  const form = document.getElementById('formLinea');
  form.reset();
  if (lineaId) {
    const l = (currentMandante.linee || []).find(x => x.id === lineaId);
    if (l) {
      form.elements['id'].value          = l.id;
      form.elements['nome'].value        = l.nome || '';
      form.elements['descrizione'].value = l.descrizione || '';
      form.elements['stato'].value       = l.stato || 'attiva';
      form.elements['ordine'].value      = l.ordine ?? 0;
    }
    document.getElementById('modalLineaTitle').textContent = 'Modifica Linea';
  } else {
    document.getElementById('modalLineaTitle').textContent = 'Nuova Linea Prodotto';
  }
  document.getElementById('modalLinea').style.display = 'flex';
}

function closeLineaModal() {
  document.getElementById('modalLinea').style.display = 'none';
}

async function saveLinea(data) {
  if (!currentMandante) return;
  const linee = Array.isArray(currentMandante.linee) ? [...currentMandante.linee] : [];
  const idx = linee.findIndex(l => l.id === data.id);
  if (idx >= 0) {
    linee[idx] = data;
  } else {
    linee.push(data);
  }
  try {
    await fs.update(COL_MAND, currentMandante.id, { linee });
    currentMandante = { ...currentMandante, linee };
    renderLinee(currentMandante);
    closeLineaModal();
  } catch (e) {
    console.error('[mandanti] saveLinea', e);
    showError('Errore nel salvataggio della linea.');
  }
}

async function deleteLinea(lineaId) {
  if (!confirm('Eliminare questa linea prodotto?')) return;
  if (!currentMandante) return;
  const linee = (currentMandante.linee || []).filter(l => l.id !== lineaId);
  try {
    await fs.update(COL_MAND, currentMandante.id, { linee });
    currentMandante = { ...currentMandante, linee };
    renderLinee(currentMandante);
  } catch (e) {
    console.error('[mandanti] deleteLinea', e);
    showError('Errore nell\'eliminazione della linea.');
  }
}

// ─── Budget ───────────────────────────────────────────────────────────────────
function setupBudgetHandlers() {
  const annoSel = document.getElementById('budgetAnno');
  const nowYear = new Date().getFullYear();
  for (let y = nowYear - 2; y <= nowYear + 2; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === nowYear) opt.selected = true;
    annoSel.appendChild(opt);
  }
  annoSel.addEventListener('change', () => {
    if (currentMandante) renderBudget(currentMandante.id);
  });
  document.getElementById('btnSaveBudget').addEventListener('click', () => {
    if (currentMandante) saveBudgetFromUI(currentMandante.id);
  });
}

function buildBudgetGrid(mesiValues) {
  const grid = document.getElementById('budgetGrid');
  grid.innerHTML = '';
  MESI_KEYS.forEach((key, i) => {
    const cell = document.createElement('div');
    cell.className = 'mand-budget-cell';
    const val = mesiValues ? (mesiValues[key] ?? 0) : 0;
    cell.innerHTML = `
      <label>${escapeHtml(MESI_LABEL[i])}</label>
      <input type="number" id="budget_${escapeHtml(key)}" min="0" step="0.01" value="${Number(val).toFixed(2)}" placeholder="0.00"/>
    `;
    grid.appendChild(cell);
  });
  MESI_KEYS.forEach(key => {
    document.getElementById('budget_' + key).addEventListener('input', updateBudgetKpi);
  });
  updateBudgetKpi();
}

function updateBudgetKpi() {
  let total = 0;
  MESI_KEYS.forEach(key => {
    const el = document.getElementById('budget_' + key);
    if (el) total += parseFloat(el.value) || 0;
  });
  document.getElementById('kpiBudgetTot').textContent   = euro(total);
  document.getElementById('kpiBudgetMedia').textContent = euro(total / 12);
}

async function renderBudget(mandanteId) {
  const anno = parseInt(document.getElementById('budgetAnno').value, 10);
  currentBudget = null;
  try {
    const results = await fs.getAllFromQuery(
      fs.query(fs.col(COL_BUDGET), fs.where('mandanteId', '==', mandanteId), fs.where('anno', '==', anno)),
      { name: 'budget-by-mandante-anno' }
    );
    if (results.length) currentBudget = results[0];
    buildBudgetGrid(currentBudget ? currentBudget.mesi : null);
    document.getElementById('budgetNote').value = currentBudget ? (currentBudget.note || '') : '';
  } catch (e) {
    console.error('[mandanti] renderBudget', e);
    buildBudgetGrid(null);
  }
}

async function saveBudgetFromUI(mandanteId) {
  const anno = parseInt(document.getElementById('budgetAnno').value, 10);
  const mesi = {};
  let totale = 0;
  MESI_KEYS.forEach(key => {
    const v = parseFloat(document.getElementById('budget_' + key).value) || 0;
    mesi[key] = v;
    totale += v;
  });
  const note = document.getElementById('budgetNote').value.trim();
  await saveBudget(mandanteId, anno, mesi, note, totale);
}

async function saveBudget(mandanteId, anno, mesi, note, totaleAnnuale) {
  const data = {
    mandanteId,
    anno,
    mesi,
    note: note || '',
    totaleAnnuale: totaleAnnuale || 0,
    updatedAt: new Date().toISOString(),
  };
  try {
    if (currentBudget && currentBudget.id) {
      await fs.update(COL_BUDGET, currentBudget.id, data);
      currentBudget = { ...currentBudget, ...data };
    } else {
      data.createdAt = new Date().toISOString();
      const id = await fs.add(COL_BUDGET, data);
      currentBudget = { id, ...data };
    }
    updateBudgetKpi();
    showToast('Budget salvato ✓');
  } catch (e) {
    console.error('[mandanti] saveBudget', e);
    showError('Errore nel salvataggio del budget: ' + (e.message || e));
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function showError(msg) {
  alert(msg);
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', bottom: '24px', right: '24px',
    background: '#a855f7', color: '#fff',
    padding: '10px 20px', borderRadius: '10px',
    fontSize: '14px', fontWeight: '600',
    zIndex: '9999', boxShadow: '0 4px 20px rgba(0,0,0,.4)',
    transition: 'opacity .3s',
  });
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, 2000);
}
