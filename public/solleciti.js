// solleciti.js — Solleciti automatici (M3-B)
import { firestoreService as fs } from './services/firestoreService.js';
import { euro, todayISO, escapeHtml, fmtDate } from './utils.js';
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const ALLOWED_NAV = new Set([
  'index.html','clients.html','suppliers.html','listini.html',
  'ordini-clienti.html','incassi.html','spese.html','scadenze.html',
  'agenda.html','statistiche.html','finanze.html','mandanti.html',
  'crm.html','offerte.html','fatture.html','mailing.html',
  'sconti.html','solleciti.html','analytics.html',
]);

let fatture  = [];
let clienti  = [];

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = 'index.html'; return; }
  init();
});

async function init() {
  setupQuickNav();
  await Promise.all([loadFatture(), loadClienti()]);
  bindEvents();
  renderAll();
}

function setupQuickNav() {
  const sel = document.getElementById('quickNav');
  if (!sel) return;
  sel.addEventListener('change', () => {
    if (sel.value && ALLOWED_NAV.has(sel.value)) window.location.href = sel.value;
  });
}

async function loadFatture() {
  try { fatture = await fs.getAll('fatture'); }
  catch (e) { fatture = []; }
}

async function loadClienti() {
  try { clienti = await fs.getAll('clienti'); }
  catch (e) { clienti = []; }
}

function renderAll() {
  const today   = todayISO();
  const giorni  = parseInt(document.getElementById('filterGiorni')?.value || '7', 10);
  const qc      = (document.getElementById('filterCliente')?.value || '').toLowerCase();
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + giorni);
  const maxISO  = maxDate.toISOString().slice(0, 10);

  document.getElementById('labelGiorni').textContent = giorni;

  const unpaid = fatture.filter(f =>
    f.dataScadenza &&
    !['pagata','annullata','bozza'].includes(f.stato) &&
    (Number(f.totale || 0) - Number(f.totalePagato || 0)) > 0
  );

  let filtered = unpaid;
  if (qc) {
    filtered = filtered.filter(f => {
      const cl = clienti.find(c => c.id === f.clienteId);
      const name = (f.snapRagioneSociale || (cl ? cl.ragioneSociale || cl.nome || '' : '')).toLowerCase();
      return name.includes(qc);
    });
  }

  const preSc  = filtered.filter(f => f.dataScadenza >= today && f.dataScadenza <= maxISO);
  const postSc = filtered.filter(f => f.dataScadenza < today);

  // KPIs
  document.getElementById('kpiPreScad').textContent  = preSc.length;
  document.getElementById('kpiScadute').textContent  = postSc.length;
  const totEsposto = [...preSc, ...postSc].reduce((a, f) => a + Math.max(0, Number(f.totale || 0) - Number(f.totalePagato || 0)), 0);
  document.getElementById('kpiEsposto').textContent  = euro(totEsposto);

  renderTable('bodyPreScad',  'emptyPreScad',  preSc,  today, false);
  renderTable('bodyPostScad', 'emptyPostScad', postSc, today, true);
}

function daysDiff(from, to) {
  return Math.round((new Date(to) - new Date(from)) / 86400000);
}

function clienteLabel(f) {
  const cl = clienti.find(c => c.id === f.clienteId);
  return f.snapRagioneSociale || (cl ? (cl.ragioneSociale || cl.nome || '—') : '—');
}

function renderTable(bodyId, emptyId, list, today, isPost) {
  const tbody = document.getElementById(bodyId);
  const empty = document.getElementById(emptyId);
  if (!list.length) {
    tbody.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = list.map(f => {
    const residuo = Math.max(0, Number(f.totale || 0) - Number(f.totalePagato || 0));
    const giorni  = isPost
      ? daysDiff(f.dataScadenza, today)
      : daysDiff(today, f.dataScadenza);
    const gg      = isPost
      ? `<span class="sol-overdue">+${giorni} gg</span>`
      : `<span class="sol-soon">${giorni} gg</span>`;
    return `<tr>
      <td><strong>${escapeHtml(f.numero || '—')}</strong></td>
      <td>${escapeHtml(clienteLabel(f))}</td>
      <td><strong>${euro(residuo)}</strong></td>
      <td>${escapeHtml(fmtDate(f.dataScadenza))}</td>
      <td>${gg}</td>
      <td>
        <button class="sol-btn sol-btn-sm sol-btn-primary" data-sollecita="${escapeHtml(f.id)}" data-tipo="${isPost ? 'post' : 'pre'}">
          📧 Invia Sollecito
        </button>
      </td>
    </tr>`;
  }).join('');
}

async function registraSollecito(fatturaId, tipo) {
  const f = fatture.find(x => x.id === fatturaId);
  try {
    await fs.add('solleciti', {
      fatturaId,
      tipo,
      dataInvio: todayISO(),
      note: `Sollecito ${tipo === 'post' ? 'post-scadenza' : 'pre-scadenza'} - ${f ? f.numero || '' : ''}`,
      inviato: false,
      createdAt: new Date().toISOString(),
    });
    showToast('Sollecito registrato (invio reale richiede Cloud Functions)');
  } catch (e) {
    console.error('registraSollecito', e);
    showToast('Errore: ' + (e.message || e), true);
  }
}

function showToast(msg, error = false) {
  let t = document.getElementById('sol-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'sol-toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:10px 22px;border-radius:8px;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .3s;';
    document.body.appendChild(t);
  }
  t.style.background = error ? '#dc2626' : '#1e293b';
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.style.opacity = '0'; }, 3500);
}

function bindEvents() {
  document.getElementById('filterGiorni')?.addEventListener('input', renderAll);
  document.getElementById('filterCliente')?.addEventListener('input', renderAll);

  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sollecita]');
    if (btn) registraSollecito(btn.dataset.sollecita, btn.dataset.tipo);
  });
}
