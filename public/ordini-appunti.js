// ordini-appunti.js v2 – Professional Note Manager

import { db } from "./firebase.js";
import {
  collection, addDoc, deleteDoc, doc, getDoc, setDoc, updateDoc,
  serverTimestamp, query, orderBy, limit, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── DOM refs ────────────────────────────────────────────────────
const notesEl        = document.getElementById("workNotes");
const saveBtn        = document.getElementById("saveBtn");
const clearBtn       = document.getElementById("clearBtn");
const statusEl       = document.getElementById("oaStatus");
const historyEl      = document.getElementById("notesHistory");
const searchEl       = document.getElementById("oaSearch");
const selectAllBtn   = document.getElementById("selectAllNotesBtn");
const clearSelectedBtn = document.getElementById("clearSelectedNotesBtn");
const printSelectedBtn = document.getElementById("printSelectedNotesBtn");

const kpiTotal    = document.getElementById("kpiTotalNotes");
const kpiToday    = document.getElementById("kpiTodayNotes");
const kpiWeek     = document.getElementById("kpiWeekNotes");
const kpiSelected = document.getElementById("kpiSelectedNotes");

// ── State ────────────────────────────────────────────────────────
const DRAFT_REF  = doc(db, "workNotes", "draft");
const HISTORY_COL = collection(db, "workNotesHistory");
const HISTORY_Q  = query(HISTORY_COL, orderBy("createdAt", "desc"), limit(100));

let historyCache = [];
const selectedIds = new Set();
let searchTerm = '';
let saveTimer = null;

// ── Helpers ──────────────────────────────────────────────────────
function esc(s) {
  return (s ?? '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(ts) {
  try {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return ''; }
}

function fmtDateShort(ts) {
  try {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('it-IT', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
  } catch { return ''; }
}

function isTodayTs(ts) {
  try {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  } catch { return false; }
}

function isThisWeekTs(ts) {
  try {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= weekAgo;
  } catch { return false; }
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || '';
}

function updateKPIs() {
  if (kpiTotal)    kpiTotal.textContent    = String(historyCache.length);
  if (kpiToday)    kpiToday.textContent    = String(historyCache.filter(x => isTodayTs(x.createdAt)).length);
  if (kpiWeek)     kpiWeek.textContent     = String(historyCache.filter(x => isThisWeekTs(x.createdAt)).length);
  if (kpiSelected) kpiSelected.textContent = String(selectedIds.size);
}

// ── Text editor modal ────────────────────────────────────────────
function getOrCreateModal() {
  let m = document.getElementById('oaEditModal');
  if (m) return m;
  m = document.createElement('div');
  m.id = 'oaEditModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:99999;padding:18px;';
  m.innerHTML = `
    <div style="width:min(720px,100%);background:var(--oa-card,#1e293b);color:var(--oa-text,#e2e8f0);border-radius:18px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.35);border:1px solid var(--oa-border,rgba(255,255,255,.1))">
      <div style="font-size:16px;font-weight:900;margin-bottom:12px;color:var(--oa-text,#e2e8f0)">✏️ Modifica nota</div>
      <textarea id="oaEditArea" rows="8" style="width:100%;min-height:200px;border-radius:12px;border:1px solid var(--oa-border,rgba(255,255,255,.15));padding:14px;font-size:15px;line-height:1.5;resize:vertical;box-sizing:border-box;background:var(--oa-input-bg,#0f172a);color:var(--oa-text,#e2e8f0);font-family:inherit;outline:none;"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">
        <button id="oaEditCancel" style="padding:10px 18px;border-radius:10px;border:1px solid var(--oa-border,rgba(255,255,255,.15));background:var(--oa-card2,#263348);color:var(--oa-text,#e2e8f0);font-weight:700;cursor:pointer;font-size:14px">Annulla</button>
        <button id="oaEditOk" style="padding:10px 18px;border-radius:10px;border:none;background:var(--oa-brand,#8b5cf6);color:#fff;font-weight:800;cursor:pointer;font-size:14px">💾 Salva</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  return m;
}

function openEditModal(value) {
  const m = getOrCreateModal();
  const area = document.getElementById('oaEditArea');
  const ok = document.getElementById('oaEditOk');
  const cancel = document.getElementById('oaEditCancel');
  area.value = String(value || '');
  m.style.display = 'flex';
  setTimeout(() => area.focus(), 30);
  return new Promise(resolve => {
    const cleanup = val => { m.style.display = 'none'; ok.onclick = null; cancel.onclick = null; m.onclick = null; resolve(val); };
    ok.onclick = () => cleanup(area.value);
    cancel.onclick = () => cleanup(null);
    m.onclick = e => { if (e.target === m) cleanup(null); };
  });
}

// ── Draft ────────────────────────────────────────────────────────
async function loadDraft() {
  try {
    const snap = await getDoc(DRAFT_REF);
    if (snap.exists() && notesEl) {
      notesEl.value = String(snap.data()?.text || '');
    }
    setStatus('');
  } catch (e) {
    console.error(e);
    setStatus('Errore caricamento bozza.');
  }
}

async function saveDraft() {
  try {
    await setDoc(DRAFT_REF, { text: String(notesEl?.value || ''), updatedAt: serverTimestamp() }, { merge: true });
    setStatus(`Bozza salvata ${new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })}`);
  } catch (e) {
    console.error(e);
    setStatus('Errore salvataggio bozza.');
  }
}

// ── History ──────────────────────────────────────────────────────
async function saveToHistory() {
  const text = String(notesEl?.value || '').trim();
  if (!text) { setStatus('⚠️ Scrivi una nota prima di salvare.'); return; }
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Salvo…'; }
  try {
    await addDoc(HISTORY_COL, { text, createdAt: serverTimestamp() });
    if (notesEl) notesEl.value = '';
    await saveDraft();
    setStatus(`✅ Nota salvata ${new Date().toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })}`);
  } catch (e) {
    console.error(e);
    setStatus('❌ Errore salvataggio.');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<span>💾</span> Salva nota'; }
  }
}

// ── Render note card ─────────────────────────────────────────────
function renderNote(item) {
  const { id, text, createdAt } = item;
  const visible = !searchTerm || text.toLowerCase().includes(searchTerm);
  if (!visible) return null;

  const card = document.createElement('div');
  card.className = 'oa-note-card' + (selectedIds.has(id) ? ' selected' : '');
  card.dataset.id = id;

  const isToday = isTodayTs(createdAt);
  const badgeHtml = isToday ? '<span class="oa-note-badge">Oggi</span>' : '';

  card.innerHTML = `
    <input type="checkbox" class="oa-note-cb" ${selectedIds.has(id) ? 'checked' : ''} title="Seleziona per stampa" />
    <div class="oa-note-body">
      <div class="oa-note-meta">
        <span class="oa-note-date">${fmtDateShort(createdAt)}</span>
        ${badgeHtml}
      </div>
      <div class="oa-note-text">${esc(text)}</div>
    </div>
    <div class="oa-note-actions">
      <button class="oa-btn oa-btn-sm btn-print oa-btn-outline" title="Stampa questa nota">🖨</button>
      <button class="oa-btn oa-btn-sm btn-edit" style="background:var(--oa-card2);color:var(--oa-text);border:1px solid var(--oa-border);" title="Modifica">✏️</button>
      <button class="oa-btn oa-btn-sm oa-btn-danger btn-del" title="Elimina">🗑</button>
    </div>`;

  // Checkbox
  const cb = card.querySelector('.oa-note-cb');
  cb.addEventListener('change', () => {
    if (cb.checked) { selectedIds.add(id); card.classList.add('selected'); }
    else { selectedIds.delete(id); card.classList.remove('selected'); }
    updateKPIs();
  });

  // Edit
  card.querySelector('.btn-edit')?.addEventListener('click', async () => {
    const newText = await openEditModal(text);
    if (newText === null) return;
    try {
      await updateDoc(doc(db, 'workNotesHistory', id), { text: newText });
    } catch (e) {
      console.error(e);
      alert('Errore modifica nota.');
    }
  });

  // Delete
  card.querySelector('.btn-del')?.addEventListener('click', async () => {
    if (!confirm('Eliminare questa nota?')) return;
    try {
      selectedIds.delete(id);
      updateKPIs();
      await deleteDoc(doc(db, 'workNotesHistory', id));
    } catch (e) {
      console.error(e);
      alert('Errore eliminazione.');
    }
  });

  // Print single
  card.querySelector('.btn-print')?.addEventListener('click', () => {
    printNotes([item]);
  });

  return card;
}

function renderHistory() {
  if (!historyEl) return;
  historyEl.innerHTML = '';
  const filtered = historyCache.filter(x => !searchTerm || x.text.toLowerCase().includes(searchTerm));
  if (!filtered.length) {
    historyEl.innerHTML = `<div class="oa-empty">${searchTerm ? '🔍 Nessuna nota trovata' : '📋 Nessuna nota salvata'}</div>`;
    return;
  }
  filtered.forEach(item => {
    const card = renderNote(item);
    if (card) historyEl.appendChild(card);
  });
}

// ── Print ────────────────────────────────────────────────────────
function printNotes(items) {
  if (!items.length) { alert('Seleziona almeno una nota da stampare.'); return; }
  const rows = items.map(it => `
    <div class="note-card">
      <div class="note-date">${fmtDate(it.createdAt) || '—'}</div>
      <div class="note-text">${esc(it.text || '').replace(/\n/g, '<br>')}</div>
    </div>`).join('');

  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Note – DCR Group</title>
  <style>*{box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif}body{margin:0;padding:20px;color:#0b1220}
  .header{display:flex;align-items:center;gap:12px;border-bottom:2px solid #0b1220;padding-bottom:10px;margin-bottom:14px}
  .brand-t{font-weight:900;font-size:18px;letter-spacing:.5px}.brand-s{font-size:12px;opacity:.8}
  .note-card{border:1px solid rgba(0,0,0,.15);border-radius:10px;padding:12px;margin-bottom:12px;page-break-inside:avoid}
  .note-date{font-weight:800;font-size:11px;opacity:.7;margin-bottom:6px}
  .note-text{font-size:13px;line-height:1.4;white-space:pre-wrap}
  @media print{body{padding:14mm}}</style></head>
  <body><div class="header">
    <div><div class="brand-t">DCR GROUP</div><div class="brand-s">di Di Caro Luca • +39 3337377008</div></div>
  </div>
  <h3 style="margin:0 0 12px">Note ordini</h3>${rows}
  <script>window.addEventListener('load',()=>window.print());<\/script></body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Popup bloccato. Abilita i popup per stampare.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

// ── Snapshot ────────────────────────────────────────────────────
function bindHistory() {
  if (!historyEl) return;
  onSnapshot(HISTORY_Q, snap => {
    historyCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Clean up stale selections
    const ids = new Set(historyCache.map(x => x.id));
    Array.from(selectedIds).forEach(id => { if (!ids.has(id)) selectedIds.delete(id); });
    renderHistory();
    updateKPIs();
  }, err => {
    console.error(err);
    if (historyEl) historyEl.innerHTML = '<div class="oa-empty" style="color:#ef4444">⚠️ Errore caricamento storico.</div>';
  });
}

// ── Events ────────────────────────────────────────────────────────
notesEl?.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 800);
});

saveBtn?.addEventListener('click', saveToHistory);

clearBtn?.addEventListener('click', async () => {
  if (!confirm('Svuotare il blocco note?')) return;
  if (notesEl) notesEl.value = '';
  await saveDraft();
});

selectAllBtn?.addEventListener('click', () => {
  historyCache.forEach(x => selectedIds.add(x.id));
  document.querySelectorAll('.oa-note-cb').forEach(cb => {
    cb.checked = true;
    cb.closest('.oa-note-card')?.classList.add('selected');
  });
  updateKPIs();
});

clearSelectedBtn?.addEventListener('click', () => {
  selectedIds.clear();
  document.querySelectorAll('.oa-note-cb').forEach(cb => {
    cb.checked = false;
    cb.closest('.oa-note-card')?.classList.remove('selected');
  });
  updateKPIs();
});

printSelectedBtn?.addEventListener('click', () => {
  const items = historyCache.filter(x => selectedIds.has(x.id));
  printNotes(items);
});

searchEl?.addEventListener('input', () => {
  searchTerm = searchEl.value.trim().toLowerCase();
  renderHistory();
});

// ── Boot ─────────────────────────────────────────────────────────
loadDraft();
bindHistory();
