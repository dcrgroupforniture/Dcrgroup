// companies.js — Admin company management for DCR GROUP
// Only accessible to admin role users.

import { firestoreService as fs } from './services/firestoreService.js';
import { escapeHtml } from './utils.js';
import { auth, db, doc, getDoc, getDocs, collection, query, where, setDoc } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ── State ──────────────────────────────────────────────────────────────────

let companies = [];
let selectedCompanyId = null;
let isEditing = false;

// ── DOM Refs ───────────────────────────────────────────────────────────────

const compList       = document.getElementById('compList');
const compEmptyState = document.getElementById('compEmptyState');
const compSearch     = document.getElementById('compSearch');
const btnNewCompany  = document.getElementById('btnNewCompany');
const compNoSelection = document.getElementById('compNoSelection');
const compDetail     = document.getElementById('compDetail');
const compForm       = document.getElementById('compForm');
const compFormEl     = document.getElementById('compFormEl');
const compFormTitle  = document.getElementById('compFormTitle');
const compFormError  = document.getElementById('compFormError');
const btnSaveCompany = document.getElementById('btnSaveCompany');
const btnCancelForm  = document.getElementById('btnCancelForm');
const btnEditCompany = document.getElementById('btnEditCompany');
const btnDeleteCompany = document.getElementById('btnDeleteCompany');
const compDetailName = document.getElementById('compDetailName');
const compDetailId   = document.getElementById('compDetailId');
const compInfoGrid   = document.getElementById('compInfoGrid');
const compUsersList  = document.getElementById('compUsersList');
const btnAddUser     = document.getElementById('btnAddUser');
const compAddUserForm = document.getElementById('compAddUserForm');
const compAddUserFormEl = document.getElementById('compAddUserFormEl');
const addUserError   = document.getElementById('addUserError');
const btnCancelAddUser = document.getElementById('btnCancelAddUser');
const companyBadge   = document.getElementById('companyBadge');
const compToast      = document.getElementById('compToast');

// ── Toast ──────────────────────────────────────────────────────────────────

let _toastTimer = null;
function showToast(msg, ok = true) {
  if (!compToast) return;
  compToast.textContent = msg;
  compToast.style.display = 'block';
  compToast.style.background = ok ? '#1e3a8a' : '#7f1d1d';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { compToast.style.display = 'none'; }, 3000);
}

// ── Data loading ───────────────────────────────────────────────────────────

async function loadCompanies() {
  try {
    const snap = await getDocs(collection(db, 'companies'));
    companies = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    companies.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'it'));
    renderList();
  } catch (e) {
    console.error('[companies] loadCompanies error', e);
    companies = [];
    renderList();
  }
}

async function loadUsersForCompany(companyId) {
  try {
    const q = query(collection(db, 'users'), where('companyId', '==', companyId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  } catch (e) {
    console.error('[companies] loadUsers error', e);
    return [];
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────

function renderList() {
  const term = (compSearch?.value || '').toLowerCase().trim();
  const filtered = companies.filter(c =>
    !term ||
    (c.name || '').toLowerCase().includes(term) ||
    c.id.toLowerCase().includes(term)
  );

  if (!filtered.length) {
    compList.innerHTML = '';
    compEmptyState.style.display = 'block';
    return;
  }
  compEmptyState.style.display = 'none';
  compList.innerHTML = filtered.map(c => {
    const letter = (c.name || c.id || '?').charAt(0).toUpperCase();
    const active = c.id === selectedCompanyId ? ' active' : '';
    return `
      <div class="comp-item${active}" data-id="${escapeHtml(c.id)}" role="button" tabindex="0">
        <div class="comp-item-avatar">${escapeHtml(letter)}</div>
        <div class="comp-item-info">
          <div class="comp-item-name">${escapeHtml(c.name || c.id)}</div>
          <div class="comp-item-badge">${escapeHtml(c.id)}</div>
        </div>
      </div>
    `;
  }).join('');

  compList.querySelectorAll('.comp-item').forEach(el => {
    el.addEventListener('click', () => selectCompany(el.dataset.id));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') selectCompany(el.dataset.id); });
  });
}

function renderDetail(company) {
  if (!company) return;
  compDetailName.textContent = company.name || company.id;
  compDetailId.textContent   = company.id;

  const infoFields = [
    { label: 'ID Azienda',   value: company.id },
    { label: 'Nome',         value: company.name || '—' },
    { label: 'Partita IVA',  value: company.vatNumber || '—' },
    { label: 'Email',        value: company.email || '—' },
    { label: 'Telefono',     value: company.phone || '—' },
    { label: 'Indirizzo',    value: company.address || '—' },
    { label: 'Piano',        value: (company.plan || '—').charAt(0).toUpperCase() + (company.plan || '').slice(1) },
    { label: 'Creata il',    value: company.createdAt ? new Date(company.createdAt).toLocaleDateString('it-IT') : '—' },
  ];
  compInfoGrid.innerHTML = infoFields.map(f => `
    <div class="comp-info-card">
      <div class="comp-info-label">${escapeHtml(f.label)}</div>
      <div class="comp-info-value">${escapeHtml(f.value)}</div>
    </div>
  `).join('');
}

async function renderUsers(companyId) {
  compUsersList.innerHTML = '<p class="comp-empty-state">Caricamento utenti…</p>';
  const users = await loadUsersForCompany(companyId);
  if (!users.length) {
    compUsersList.innerHTML = '<p class="comp-empty-state">Nessun utente trovato per questa azienda.</p>';
    return;
  }
  const ROLE_COLORS = { admin: 'admin', manager: 'manager', agente: 'agente', contabile: 'contabile', magazzino: 'magazzino' };
  compUsersList.innerHTML = users.map(u => {
    const letter = (u.email || u.uid || '?').charAt(0).toUpperCase();
    const role = u.role || 'agente';
    const badgeCls = ROLE_COLORS[role] || 'agente';
    return `
      <div class="comp-user-card">
        <div class="comp-user-avatar">${escapeHtml(letter)}</div>
        <div class="comp-user-info">
          <div class="comp-user-email">${escapeHtml(u.email || '—')}</div>
          <div class="comp-user-uid">UID: ${escapeHtml(u.uid || '—')}</div>
        </div>
        <span class="comp-role-badge ${badgeCls}">${escapeHtml(role)}</span>
        <select class="comp-role-select" data-uid="${escapeHtml(u.uid)}" title="Cambia ruolo">
          ${['admin','manager','agente','contabile','magazzino'].map(r =>
            `<option value="${r}"${r === role ? ' selected' : ''}>${r}</option>`
          ).join('')}
        </select>
      </div>
    `;
  }).join('');

  // Role change handlers
  compUsersList.querySelectorAll('.comp-role-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const uid = sel.dataset.uid;
      const newRole = sel.value;
      try {
        await setDoc(doc(db, 'users', uid), { role: newRole }, { merge: true });
        showToast(`Ruolo aggiornato: ${newRole}`);
      } catch (e) {
        showToast(`Errore aggiornamento ruolo: ${e.message}`, false);
        sel.value = sel.dataset.prev || sel.value;
      }
    });
    sel.dataset.prev = sel.value;
  });
}

// ── Navigation ─────────────────────────────────────────────────────────────

function showView(view) {
  compNoSelection.style.display  = view === 'none'   ? 'flex' : 'none';
  compDetail.style.display       = view === 'detail' ? 'block' : 'none';
  compForm.style.display         = view === 'form'   ? 'block' : 'none';
  compAddUserForm.style.display  = view === 'addUser'? 'block' : 'none';
}

async function selectCompany(id) {
  selectedCompanyId = id;
  const company = companies.find(c => c.id === id);
  if (!company) return;
  renderList();
  renderDetail(company);

  // Activate first tab by default
  document.querySelectorAll('.comp-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.comp-tab-panel').forEach(p => p.style.display = 'none');
  const firstTab = document.querySelector('.comp-tab[data-tab="info"]');
  const firstPanel = document.getElementById('tab-info');
  if (firstTab) firstTab.classList.add('active');
  if (firstPanel) firstPanel.style.display = 'block';

  showView('detail');
}

// ── Company CRUD ───────────────────────────────────────────────────────────

function openCreateForm() {
  isEditing = false;
  compFormTitle.textContent = 'Nuova Azienda';
  compFormEl.reset();
  document.getElementById('fCompId').disabled = false;
  hideFormError();
  showView('form');
  selectedCompanyId = null;
  renderList();
}

function openEditForm(company) {
  isEditing = true;
  compFormTitle.textContent = 'Modifica Azienda';
  document.getElementById('fCompId').value = company.id;
  document.getElementById('fCompId').disabled = true;
  document.getElementById('fCompName').value = company.name || '';
  document.getElementById('fCompVat').value = company.vatNumber || '';
  document.getElementById('fCompEmail').value = company.email || '';
  document.getElementById('fCompPhone').value = company.phone || '';
  document.getElementById('fCompAddress').value = company.address || '';
  document.getElementById('fCompPlan').value = company.plan || 'pro';
  hideFormError();
  showView('form');
}

function hideFormError() {
  compFormError.style.display = 'none';
  compFormError.textContent = '';
}

async function saveCompany(e) {
  e.preventDefault();
  hideFormError();
  const id   = document.getElementById('fCompId').value.trim();
  const name = document.getElementById('fCompName').value.trim();
  if (!id || !name) { showFormError('ID e Nome sono obbligatori.'); return; }
  if (!isEditing && !/^[a-z0-9_]+$/.test(id)) {
    showFormError('ID: solo minuscolo, numeri e underscore (es. mycompany_srl).');
    return;
  }

  btnSaveCompany.disabled = true;
  try {
    const data = {
      name,
      vatNumber: document.getElementById('fCompVat').value.trim() || null,
      email:     document.getElementById('fCompEmail').value.trim() || null,
      phone:     document.getElementById('fCompPhone').value.trim() || null,
      address:   document.getElementById('fCompAddress').value.trim() || null,
      plan:      document.getElementById('fCompPlan').value,
      updatedAt: new Date().toISOString(),
    };
    if (!isEditing) data.createdAt = new Date().toISOString();

    await setDoc(doc(db, 'companies', id), data, { merge: isEditing });
    showToast(isEditing ? 'Azienda aggiornata.' : 'Azienda creata.');
    await loadCompanies();
    await selectCompany(id);
  } catch (err) {
    showFormError(`Errore: ${err.message}`);
  } finally {
    btnSaveCompany.disabled = false;
  }
}

function showFormError(msg) {
  compFormError.textContent = msg;
  compFormError.style.display = 'block';
}

async function deleteCompany(id) {
  if (!confirm(`Eliminare l'azienda "${id}"? Questa operazione non può essere annullata.`)) return;
  try {
    // Soft delete: set deletedAt flag instead of actually deleting
    await setDoc(doc(db, 'companies', id), { deletedAt: new Date().toISOString(), isDeleted: true }, { merge: true });
    showToast('Azienda eliminata.');
    await loadCompanies();
    selectedCompanyId = null;
    showView('none');
  } catch (e) {
    showToast(`Errore: ${e.message}`, false);
  }
}

// ── Add user form ──────────────────────────────────────────────────────────

async function addUserToCompany(e) {
  e.preventDefault();
  addUserError.style.display = 'none';
  const uid   = document.getElementById('fUserUid').value.trim();
  const email = document.getElementById('fUserEmail').value.trim();
  const role  = document.getElementById('fUserRole').value;
  if (!uid) { showAddUserError('UID obbligatorio.'); return; }
  if (!selectedCompanyId) { showAddUserError('Nessuna azienda selezionata.'); return; }

  try {
    await setDoc(doc(db, 'users', uid), {
      companyId: selectedCompanyId,
      role,
      email: email || null,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    showToast('Utente aggiunto all\'azienda.');
    compAddUserFormEl.reset();
    showView('detail');
    // Refresh users tab
    await renderUsers(selectedCompanyId);
  } catch (err) {
    showAddUserError(`Errore: ${err.message}`);
  }
}

function showAddUserError(msg) {
  addUserError.textContent = msg;
  addUserError.style.display = 'block';
}

// ── Tab switching ─────────────────────────────────────────────────────────

document.querySelectorAll('.comp-tab').forEach(tab => {
  tab.addEventListener('click', async () => {
    document.querySelectorAll('.comp-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.comp-tab-panel').forEach(p => p.style.display = 'none');
    tab.classList.add('active');
    const panel = document.getElementById(`tab-${tab.dataset.tab}`);
    if (panel) panel.style.display = 'block';
    if (tab.dataset.tab === 'users' && selectedCompanyId) {
      await renderUsers(selectedCompanyId);
    }
  });
});

// ── Event listeners ────────────────────────────────────────────────────────

btnNewCompany.addEventListener('click', openCreateForm);
btnCancelForm.addEventListener('click', () => {
  if (selectedCompanyId) { selectCompany(selectedCompanyId); } else { showView('none'); }
});
compFormEl.addEventListener('submit', saveCompany);
btnEditCompany.addEventListener('click', () => {
  const c = companies.find(x => x.id === selectedCompanyId);
  if (c) openEditForm(c);
});
btnDeleteCompany.addEventListener('click', () => {
  if (selectedCompanyId) deleteCompany(selectedCompanyId);
});
btnAddUser.addEventListener('click', () => {
  compAddUserFormEl.reset();
  addUserError.style.display = 'none';
  showView('addUser');
});
btnCancelAddUser.addEventListener('click', () => showView('detail'));
compAddUserFormEl.addEventListener('submit', addUserToCompany);

compSearch.addEventListener('input', renderList);

// ── Auth + role guard ──────────────────────────────────────────────────────

async function init() {
  await new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user); });
  });

  // Show current tenant badge
  const tenant = window.__tenant;
  if (tenant && companyBadge) {
    companyBadge.textContent = tenant.companyId || '';
  }

  // Restrict to admin role
  const role = tenant?.role || 'agente';
  if (role !== 'admin') {
    document.querySelector('.comp-wrap').innerHTML =
      `<div style="padding:40px;color:var(--comp-text-muted,#94a3b8);text-align:center">
        <h2>Accesso negato</h2>
        <p>Questa pagina è accessibile solo agli amministratori.</p>
        <a href="index.html" style="color:#6366f1">← Torna alla home</a>
      </div>`;
    return;
  }

  await loadCompanies();
}

// Wait for auth-guard to set window.__tenant, then init
function waitForTenant(cb, retries = 10) {
  if (window.__tenant || retries <= 0) { cb(); return; }
  setTimeout(() => waitForTenant(cb, retries - 1), 300);
}
waitForTenant(init);
