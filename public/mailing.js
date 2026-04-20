/**
 * mailing.js — DCR GROUP Mailing Module
 * Manages email campaigns, logs, and recipient segmentation.
 */

import { firestoreService as fs } from './services/firestoreService.js';
import { todayISO, escapeHtml, fmtDate } from './utils.js';
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// ── State ─────────────────────────────────────────────────────
let campagne = [];
let logInvii = [];
let clienti = [];
let mandanti = [];
let currentUser = null;

// ── DOM refs ──────────────────────────────────────────────────
const campagneBody      = document.getElementById('campagneBody');
const campagneEmpty     = document.getElementById('campagneEmpty');
const logBody           = document.getElementById('logBody');
const logEmpty          = document.getElementById('logEmpty');
const kpiCampagne       = document.getElementById('kpiCampagne');
const kpiEmailInviate   = document.getElementById('kpiEmailInviate');
const kpiApertura       = document.getElementById('kpiApertura');
const formCampagna      = document.getElementById('formCampagna');
const segmentoSel       = document.getElementById('segmentoSel');
const filtroMandanteSel = document.getElementById('filtroMandanteSel');
const fieldMandante     = document.getElementById('fieldMandanteFiltro');
const fieldStato        = document.getElementById('fieldStatoFiltro');
const mailDestinatari   = document.getElementById('mailDestinatariCount');

// ── Auth guard ────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  init();
});

// ── Init ──────────────────────────────────────────────────────
async function init() {
  setupTabs();
  setupFormEvents();
  await Promise.all([loadCampagne(), loadLog(), loadClienti(), loadMandanti()]);
  renderCampagne();
  renderLog();
  updateKpis();
}

// ── Data loading ──────────────────────────────────────────────
async function loadCampagne() {
  try {
    const q = fs.query(
      fs.col('mailingCampaigns'),
      fs.orderBy('createdAt', 'desc')
    );
    campagne = await fs.getAllFromQuery(q, { name: 'mailingCampaigns' });
  } catch (e) {
    console.error('loadCampagne:', e);
    campagne = [];
  }
}

async function loadLog() {
  try {
    const q = fs.query(
      fs.col('mailingLogs'),
      fs.orderBy('dataInvio', 'desc')
    );
    logInvii = await fs.getAllFromQuery(q, { name: 'mailingLogs' });
  } catch (e) {
    console.error('loadLog:', e);
    logInvii = [];
  }
}

async function loadClienti() {
  try {
    clienti = await fs.getAll('clienti');
  } catch (e) {
    console.error('loadClienti:', e);
    clienti = [];
  }
}

async function loadMandanti() {
  try {
    mandanti = await fs.getAll('mandanti');
    populateMandantiSelect();
  } catch (e) {
    console.error('loadMandanti:', e);
    mandanti = [];
  }
}

function populateMandantiSelect() {
  const existing = Array.from(filtroMandanteSel.options).map(o => o.value);
  mandanti.forEach(m => {
    if (!existing.includes(m.id)) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = escapeHtml(m.nome || m.ragioneSociale || m.id);
      filtroMandanteSel.appendChild(opt);
    }
  });
}

// ── Render: Campagne ──────────────────────────────────────────
function renderCampagne() {
  const rows = applyFilters(campagne);
  campagneBody.innerHTML = '';

  if (rows.length === 0) {
    campagneEmpty.classList.add('visible');
    return;
  }
  campagneEmpty.classList.remove('visible');

  rows.forEach(c => {
    const stato = c.stato || 'bozza';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.nome || '—')}</td>
      <td>${escapeHtml(c.oggetto || '—')}</td>
      <td>${escapeHtml(segmentoLabel(c.segmento))}</td>
      <td>${c.dataInvio ? fmtDate(c.dataInvio) : '—'}</td>
      <td>${c.destinatariCount != null ? c.destinatariCount : '—'}</td>
      <td><span class="mail-stato-badge ${escapeHtml(stato)}">${escapeHtml(stato)}</span></td>
      <td>
        <button class="mailing-btn mailing-btn-sm" data-action="edit" data-id="${escapeHtml(c.id)}">Modifica</button>
        <button class="mailing-btn mailing-btn-sm mailing-btn-danger" data-action="delete" data-id="${escapeHtml(c.id)}">Elimina</button>
      </td>
    `;
    campagneBody.appendChild(tr);
  });
}

function segmentoLabel(s) {
  const map = { tutti: 'Tutti i Clienti', mandante: 'Per Mandante', stato: 'Per Stato' };
  return map[s] || (s || 'tutti');
}

// ── Render: Log ───────────────────────────────────────────────
function renderLog() {
  logBody.innerHTML = '';

  if (logInvii.length === 0) {
    logEmpty.classList.add('visible');
    return;
  }
  logEmpty.classList.remove('visible');

  logInvii.forEach(l => {
    const stato = l.stato || 'inviata';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(l.campagnaNome || '—')}</td>
      <td>${l.dataInvio ? fmtDate(l.dataInvio) : '—'}</td>
      <td>${escapeHtml(l.email || '—')}</td>
      <td>${escapeHtml(l.clienteNome || '—')}</td>
      <td><span class="mail-log-badge ${escapeHtml(stato)}">${escapeHtml(stato)}</span></td>
      <td>${escapeHtml(l.note || '')}</td>
    `;
    logBody.appendChild(tr);
  });
}

// ── KPIs ──────────────────────────────────────────────────────
function updateKpis() {
  kpiCampagne.textContent = campagne.length;
  const totalInviati = campagne
    .filter(c => c.stato === 'inviata')
    .reduce((sum, c) => sum + (c.destinatariCount || 0), 0);
  kpiEmailInviate.textContent = totalInviati;
  // Static industry average for cold mailing — no tracking implemented
  kpiApertura.textContent = totalInviati > 0 ? '~22%' : '—';
}

// ── Filter (placeholder for future search bar) ────────────────
function applyFilters(list) {
  return list;
}

// ── Recipient calculation ─────────────────────────────────────
function getDestinatari() {
  const fd = new FormData(formCampagna);
  const segmento = fd.get('segmento') || 'tutti';
  const filtroMandanteId = fd.get('filtroMandanteId') || '';
  const filtroStato = (fd.get('filtroStato') || '').trim().toLowerCase();

  let lista = clienti.filter(c => c.email && String(c.email).trim());

  if (segmento === 'mandante' && filtroMandanteId) {
    lista = lista.filter(c => c.mandanteId === filtroMandanteId);
  } else if (segmento === 'stato' && filtroStato) {
    lista = lista.filter(c =>
      String(c.stato || '').toLowerCase() === filtroStato ||
      String(c.status || '').toLowerCase() === filtroStato
    );
  }

  return lista;
}

function calcDestinatari() {
  const lista = getDestinatari();
  mailDestinatari.textContent = lista.length;
  return lista;
}

// ── Save draft ────────────────────────────────────────────────
async function salvaBozzaCampagna() {
  const fd = new FormData(formCampagna);
  const nome    = (fd.get('nome') || '').trim();
  const oggetto = (fd.get('oggetto') || '').trim();
  const corpo   = (fd.get('corpo') || '').trim();

  if (!nome || !oggetto) {
    alert('Compila almeno Nome Campagna e Oggetto Email.');
    return;
  }

  const data = {
    nome,
    oggetto,
    corpo,
    segmento: fd.get('segmento') || 'tutti',
    filtri: {
      mandanteId: fd.get('filtroMandanteId') || '',
      statoCliente: fd.get('filtroStato') || '',
    },
    stato: 'bozza',
    destinatariCount: null,
    dataInvio: null,
    createdAt: new Date().toISOString(),
  };

  try {
    const docId = fd.get('docId');
    if (docId) {
      await fs.update('mailingCampaigns', docId, { ...data, createdAt: undefined });
    } else {
      const newId = await fs.add('mailingCampaigns', data);
      formCampagna.querySelector('[name="docId"]').value = newId;
    }
    alert('Bozza salvata.');
    await loadCampagne();
    renderCampagne();
    updateKpis();
  } catch (e) {
    console.error('salvaBozza:', e);
    alert('Errore nel salvataggio: ' + e.message);
  }
}

// ── Send to all ───────────────────────────────────────────────
async function inviaTutti() {
  const fd = new FormData(formCampagna);
  const nome    = (fd.get('nome') || '').trim();
  const oggetto = (fd.get('oggetto') || '').trim();
  const corpo   = (fd.get('corpo') || '').trim();

  if (!nome || !oggetto || !corpo) {
    alert('Compila Nome Campagna, Oggetto e Corpo Email prima di inviare.');
    return;
  }

  const lista = getDestinatari();
  if (lista.length === 0) {
    alert('Nessun destinatario trovato con email valida per il segmento selezionato.');
    return;
  }

  if (!confirm(`Confermi l'invio a ${lista.length} destinatari?\n\nNota: le email non saranno inviate fisicamente senza Cloud Functions configurate.`)) {
    return;
  }

  const today = todayISO();
  let campagnaId = fd.get('docId');

  const campagnaData = {
    nome,
    oggetto,
    corpo,
    segmento: fd.get('segmento') || 'tutti',
    filtri: {
      mandanteId: fd.get('filtroMandanteId') || '',
      statoCliente: fd.get('filtroStato') || '',
    },
    stato: 'inviata',
    destinatariCount: lista.length,
    dataInvio: today,
    createdAt: campagnaId ? undefined : new Date().toISOString(),
  };

  try {
    if (campagnaId) {
      const update = { ...campagnaData };
      delete update.createdAt;
      await fs.update('mailingCampaigns', campagnaId, update);
    } else {
      campagnaId = await fs.add('mailingCampaigns', {
        ...campagnaData,
        createdAt: new Date().toISOString(),
      });
      formCampagna.querySelector('[name="docId"]').value = campagnaId;
    }

    // Write a log entry for each recipient
    await Promise.all(lista.map(cliente =>
      fs.add('mailingLogs', {
        campagnaId,
        campagnaNome: nome,
        email: cliente.email,
        clienteId: cliente.id,
        clienteNome: cliente.nome || cliente.ragioneSociale || cliente.id,
        stato: 'inviata',
        note: 'Invio simulato — Cloud Functions non configurate',
        dataInvio: today,
      })
    ));

    alert(
      `Campagna salvata come inviata (${lista.length} destinatari).\n` +
      `L'invio email richiede configurazione Cloud Functions.`
    );

    resetForm();
    await Promise.all([loadCampagne(), loadLog()]);
    renderCampagne();
    renderLog();
    updateKpis();
    switchTab('campagne');
  } catch (e) {
    console.error('inviaTutti:', e);
    alert('Errore durante il salvataggio: ' + e.message);
  }
}

// ── Send test ─────────────────────────────────────────────────
function inviaTest() {
  const fd = new FormData(formCampagna);
  const oggetto = (fd.get('oggetto') || '').trim();
  const email = currentUser ? currentUser.email : '(utente non identificato)';
  alert(
    `Test email:\nDestinatario: ${email}\nOggetto: ${oggetto || '(nessun oggetto)'}\n\n` +
    `Nota: l'invio reale richiede Firebase Cloud Functions configurate.`
  );
}

// ── Edit campaign ─────────────────────────────────────────────
async function editCampagna(id) {
  const c = campagne.find(x => x.id === id);
  if (!c) return;

  formCampagna.querySelector('[name="docId"]').value = c.id;
  formCampagna.querySelector('[name="nome"]').value = c.nome || '';
  formCampagna.querySelector('[name="oggetto"]').value = c.oggetto || '';
  formCampagna.querySelector('#mailCorpo').value = c.corpo || '';
  segmentoSel.value = c.segmento || 'tutti';
  formCampagna.querySelector('[name="filtroMandanteId"]').value = c.filtri?.mandanteId || '';
  formCampagna.querySelector('[name="filtroStato"]').value = c.filtri?.statoCliente || '';

  updateSegmentoVisibility(c.segmento || 'tutti');
  switchTab('nuova');
}

// ── Delete campaign ───────────────────────────────────────────
async function deleteCampagna(id) {
  const c = campagne.find(x => x.id === id);
  const nome = c ? c.nome : id;
  if (!confirm(`Eliminare la campagna "${nome}"? L'operazione non è reversibile.`)) return;

  try {
    await fs.remove('mailingCampaigns', id);
    await loadCampagne();
    renderCampagne();
    updateKpis();
  } catch (e) {
    console.error('deleteCampagna:', e);
    alert('Errore nell\'eliminazione: ' + e.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────
function resetForm() {
  formCampagna.reset();
  formCampagna.querySelector('[name="docId"]').value = '';
  mailDestinatari.textContent = '—';
  updateSegmentoVisibility('tutti');
}

function updateSegmentoVisibility(val) {
  fieldMandante.style.display = val === 'mandante' ? '' : 'none';
  fieldStato.style.display    = val === 'stato'    ? '' : 'none';
}

// ── Tab switching ─────────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.mailing-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.getElementById('panelCampagne').style.display = tabName === 'campagne' ? '' : 'none';
  document.getElementById('panelNuova').style.display    = tabName === 'nuova'    ? '' : 'none';
  document.getElementById('panelLog').style.display      = tabName === 'log'      ? '' : 'none';
}

function setupTabs() {
  document.querySelectorAll('.mailing-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'nuova') resetForm();
      switchTab(btn.dataset.tab);
    });
  });
}

// ── Form events ───────────────────────────────────────────────
function setupFormEvents() {
  segmentoSel.addEventListener('change', () => {
    updateSegmentoVisibility(segmentoSel.value);
    mailDestinatari.textContent = '—';
  });

  document.getElementById('btnCalcDestinatari').addEventListener('click', calcDestinatari);
  document.getElementById('btnSalvaBozzaMail').addEventListener('click', salvaBozzaCampagna);
  document.getElementById('btnInviaTest').addEventListener('click', inviaTest);
  document.getElementById('btnInviaTutti').addEventListener('click', inviaTutti);

  // Table action buttons (event delegation)
  campagneBody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'edit')   editCampagna(id);
    if (action === 'delete') deleteCampagna(id);
  });
}
