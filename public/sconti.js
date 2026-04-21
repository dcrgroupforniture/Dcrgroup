// sconti.js — Motore sconti multi-livello (M2-D)
import { firestoreService as fs } from './services/firestoreService.js';
import { escapeHtml, todayISO, fmtDate, euro } from './utils.js';
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const COL = 'sconti';

const ALLOWED_NAV = new Set([
  'index.html','clients.html','suppliers.html','listini.html',
  'ordini-clienti.html','incassi.html','spese.html','scadenze.html',
  'agenda.html','statistiche.html','finanze.html','mandanti.html',
  'crm.html','offerte.html','fatture.html','mailing.html',
  'sconti.html','solleciti.html','analytics.html',
]);

let sconti   = [];
let clienti  = [];
let mandanti = [];

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  init();
});

async function init() {
  setupQuickNav();
  await Promise.all([loadClienti(), loadMandanti()]);
  await loadSconti();
  bindEvents();
}

function setupQuickNav() {
  const sel = document.getElementById('quickNav');
  if (!sel) return;
  sel.addEventListener('change', () => {
    if (sel.value && ALLOWED_NAV.has(sel.value)) window.location.href = sel.value;
  });
}

async function loadSconti() {
  try { sconti = await fs.getAllByCompany(COL); }
  catch (e) { sconti = []; }
  sconti.sort((a, b) => (Number(a.priorita) || 99) - (Number(b.priorita) || 99));
  applyFilters();
}

async function loadClienti() {
  try { clienti = await fs.getAllByCompany('clienti'); } catch { clienti = []; }
  populateSelect('selectScontoCliente', clienti, c => c.ragioneSociale || c.nome || c.id, true);
}

async function loadMandanti() {
  try { mandanti = await fs.getAllByCompany('mandanti'); } catch { mandanti = []; }
  populateSelect('selectScontoMandante', mandanti, m => m.ragioneSociale || m.nome || m.id, true);
}

function populateSelect(id, items, labelFn, all = false) {
  const el = document.getElementById(id);
  if (!el) return;
  const cur = el.value;
  while (el.options.length > (all ? 1 : 0)) el.remove(all ? 1 : 0);
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = labelFn(item);
    el.appendChild(opt);
  });
  if (cur) el.value = cur;
}

function applyFilters() {
  const qc = (document.getElementById('filterCliente')?.value || '').toLowerCase();
  const qm = (document.getElementById('filterMandante')?.value || '').toLowerCase();
  const today = todayISO();
  const list = sconti.filter(s => {
    if (qc && !(s.clienteNome || '').toLowerCase().includes(qc)) return false;
    if (qm && !(s.mandanteNome || '').toLowerCase().includes(qm)) return false;
    return true;
  });
  updateKpis(list, today);
  renderTable(list);
}

function updateKpis(list, today) {
  document.getElementById('kpiTot').textContent    = list.length;
  const attive = list.filter(s => (!s.dataInizio || s.dataInizio <= today) && (!s.dataFine || s.dataFine >= today));
  document.getElementById('kpiAttive').textContent = attive.length;
  const percs = attive.filter(s => s.tipoSconto === 'percentuale' || !s.tipoSconto);
  const avg = percs.length ? (percs.reduce((a, s) => a + Number(s.valore || 0), 0) / percs.length).toFixed(1) : 0;
  document.getElementById('kpiMedia').textContent  = avg + '%';
}

function renderTable(list) {
  const tbody = document.getElementById('scontiBody');
  const empty = document.getElementById('scontiEmpty');
  if (!list.length) {
    tbody.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = list.map(s => `<tr>
    <td><strong>${escapeHtml(String(s.priorita || '—'))}</strong></td>
    <td>${escapeHtml(s.clienteNome || '— Tutti —')}</td>
    <td>${escapeHtml(s.mandanteNome || '— Tutti —')}</td>
    <td>${escapeHtml(s.tipoSconto === 'valore_fisso' ? 'Valore fisso' : 'Percentuale')}</td>
    <td><strong>${escapeHtml(String(s.valore || 0))}${s.tipoSconto === 'valore_fisso' ? ' €' : ' %'}</strong></td>
    <td>${s.soglia ? euro(s.soglia) : '—'}</td>
    <td>${escapeHtml(fmtDate(s.dataInizio) || '—')}</td>
    <td>${escapeHtml(fmtDate(s.dataFine) || '—')}</td>
    <td>
      <button class="sc-btn sc-btn-sm sc-btn-primary" data-edit="${escapeHtml(s.id)}">✏️</button>
      <button class="sc-btn sc-btn-sm sc-btn-danger" data-delete="${escapeHtml(s.id)}">🗑️</button>
    </td>
  </tr>`).join('');
}

function openModal(sconto = null) {
  const modal = document.getElementById('modalSconto');
  const form  = document.getElementById('formSconto');
  const title = document.getElementById('modalScontoTitle');
  form.reset();
  form.elements['id'].value = '';
  if (sconto) {
    title.textContent = 'Modifica Sconto';
    form.elements['id'].value         = sconto.id;
    form.elements['clienteId'].value  = sconto.clienteId  || '';
    form.elements['mandanteId'].value = sconto.mandanteId || '';
    form.elements['tipoSconto'].value = sconto.tipoSconto || 'percentuale';
    form.elements['valore'].value     = sconto.valore     || '';
    form.elements['soglia'].value     = sconto.soglia     || '';
    form.elements['priorita'].value   = sconto.priorita   || 1;
    form.elements['dataInizio'].value = sconto.dataInizio || '';
    form.elements['dataFine'].value   = sconto.dataFine   || '';
    form.elements['note'].value       = sconto.note       || '';
  } else {
    title.textContent = 'Nuovo Sconto';
    form.elements['priorita'].value = (sconti.length ? Math.max(...sconti.map(s => Number(s.priorita) || 0)) + 1 : 1);
    form.elements['dataInizio'].value = todayISO();
  }
  modal.style.display = 'flex';
}

async function saveSconto(fd) {
  const id         = fd.get('id') || '';
  const clienteId  = fd.get('clienteId') || '';
  const mandanteId = fd.get('mandanteId') || '';
  const clienteObj  = clienti.find(c => c.id === clienteId);
  const mandanteObj = mandanti.find(m => m.id === mandanteId);
  const doc = {
    clienteId,  clienteNome:  clienteObj  ? (clienteObj.ragioneSociale  || clienteObj.nome  || '') : '',
    mandanteId, mandanteNome: mandanteObj ? (mandanteObj.ragioneSociale || mandanteObj.nome || '') : '',
    tipoSconto: fd.get('tipoSconto') || 'percentuale',
    valore:     Number(fd.get('valore')) || 0,
    soglia:     Number(fd.get('soglia')) || 0,
    priorita:   Number(fd.get('priorita')) || 1,
    dataInizio: fd.get('dataInizio') || '',
    dataFine:   fd.get('dataFine')   || '',
    note:       fd.get('note')       || '',
  };
  if (id) {
    await fs.update(COL, id, doc);
    const idx = sconti.findIndex(s => s.id === id);
    if (idx !== -1) sconti[idx] = { ...sconti[idx], ...doc };
  } else {
    doc.createdAt = new Date().toISOString();
    const newId = await fs.add(COL, doc);
    sconti.push({ id: newId, ...doc });
  }
  document.getElementById('modalSconto').style.display = 'none';
  sconti.sort((a, b) => (Number(a.priorita) || 99) - (Number(b.priorita) || 99));
  applyFilters();
}

async function deleteSconto(id) {
  if (!confirm('Eliminare questa regola di sconto?')) return;
  await fs.remove(COL, id);
  sconti = sconti.filter(s => s.id !== id);
  applyFilters();
}

function bindEvents() {
  document.getElementById('btnNewSconto')?.addEventListener('click', () => openModal());
  document.getElementById('closeModalSconto')?.addEventListener('click', () => {
    document.getElementById('modalSconto').style.display = 'none';
  });

  const form = document.getElementById('formSconto');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try { await saveSconto(new FormData(form)); }
    catch (err) { console.error(err); alert('Errore: ' + (err.message || err)); }
    finally { btn.disabled = false; }
  });

  document.getElementById('scontiBody')?.addEventListener('click', (e) => {
    const editBtn   = e.target.closest('[data-edit]');
    const deleteBtn = e.target.closest('[data-delete]');
    if (editBtn) {
      const s = sconti.find(x => x.id === editBtn.dataset.edit);
      if (s) openModal(s);
    } else if (deleteBtn) {
      deleteSconto(deleteBtn.dataset.delete);
    }
  });

  ['filterCliente','filterMandante'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', applyFilters);
  });
}

// ── applyBestSconto — exported for use by offerte.js ──────────────────────

/**
 * Find the best (highest priority = lowest number) applicable discount rule
 * for the given clienteId + mandanteId with totaleImponibile >= soglia.
 * Returns the sconto object or null.
 */
export async function applyBestSconto(clienteId, mandanteId, totaleImponibile) {
  const today = todayISO();
  let rules = [];
  try { rules = await fs.getAllByCompany(COL); } catch { return null; }
  rules.sort((a, b) => (Number(a.priorita) || 99) - (Number(b.priorita) || 99));
  return rules.find(s => {
    if (s.clienteId  && s.clienteId  !== clienteId)  return false;
    if (s.mandanteId && s.mandanteId !== mandanteId)  return false;
    if (s.soglia && Number(totaleImponibile) < Number(s.soglia)) return false;
    if (s.dataInizio && s.dataInizio > today) return false;
    if (s.dataFine   && s.dataFine   < today) return false;
    return true;
  }) || null;
}
