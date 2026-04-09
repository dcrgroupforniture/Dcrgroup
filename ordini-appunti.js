
function ensureTextEditorModal(){
  let modal = document.getElementById('textEditorModal');
  if(modal) return modal;
  modal = document.createElement('div');
  modal.id = 'textEditorModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.58);display:none;align-items:center;justify-content:center;z-index:99999;padding:18px;';
  modal.innerHTML = `
    <div style="width:min(720px,100%);background:#0f172a;color:#fff;border-radius:18px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
      <div style="font-size:18px;font-weight:800;margin-bottom:10px">Modifica nota</div>
      <textarea id="textEditorModalArea" rows="8" style="width:100%;min-height:220px;border-radius:14px;border:1px solid rgba(255,255,255,.15);padding:14px;font-size:16px;line-height:1.45;resize:vertical;box-sizing:border-box"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px">
        <button type="button" id="textEditorModalCancel" style="padding:12px 16px;border-radius:12px;border:none;background:#334155;color:#fff;font-weight:700">Annulla</button>
        <button type="button" id="textEditorModalOk" style="padding:12px 16px;border-radius:12px;border:none;background:#2563eb;color:#fff;font-weight:800">Salva</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  return modal;
}

function openTextEditorModal(initialValue){
  const modal = ensureTextEditorModal();
  const area = document.getElementById('textEditorModalArea');
  const btnOk = document.getElementById('textEditorModalOk');
  const btnCancel = document.getElementById('textEditorModalCancel');
  area.value = String(initialValue || '');
  modal.style.display = 'flex';
  setTimeout(()=>{ try{ area.focus(); area.setSelectionRange(area.value.length, area.value.length); }catch(e){} }, 30);
  return new Promise((resolve)=>{
    const cleanup = (val)=>{
      modal.style.display = 'none';
      btnOk.onclick = null; btnCancel.onclick = null; modal.onclick = null;
      resolve(val);
    };
    btnOk.onclick = ()=> cleanup(area.value);
    btnCancel.onclick = ()=> cleanup(null);
    modal.onclick = (e)=>{ if(e.target === modal) cleanup(null); };
  });
}

// Appunti lavoro (Ordini)
// - Draft (autosave): workNotes/draft
// - Storico note (salva): collection workNotesHistory
//
// Novità v27:
// - Note selezionabili (checkbox)
// - Stampa multipla: stampa le note selezionate nello stesso foglio
// - Intestazione stampa con logo + dicitura DCR GROUP

import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const notesEl = document.getElementById("workNotes");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");
const historyEl = document.getElementById("notesHistory");

// Stampa / selezione
const selectAllBtn = document.getElementById("selectAllNotesBtn");
const clearSelectedBtn = document.getElementById("clearSelectedNotesBtn");
const printSelectedBtn = document.getElementById("printSelectedNotesBtn");
const selectedCountEl = document.getElementById("selectedNotesCount");

// Draft unico (autosave)
const DRAFT_REF = doc(db, "workNotes", "draft");

// Storico (una nota = un documento)
const HISTORY_COL = collection(db, "workNotesHistory");
const HISTORY_Q = query(HISTORY_COL, orderBy("createdAt", "desc"), limit(50));

let saveTimer = null;

// cache storico corrente (per stampa)
let historyCache = []; // [{id,text,createdAt}]
const selectedIds = new Set();

function setStatus(msg) {
  if (!statusEl) return;
  statusEl.textContent = msg || "";
}

function esc(s) {
  return (s ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtDate(ts) {
  try {
    if (!ts) return "";
    // Firestore Timestamp -> Date
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString("it-IT");
  } catch {
    return "";
  }
}

function updateSelectedCount(){
  if(!selectedCountEl) return;
  const n = selectedIds.size;
  selectedCountEl.textContent = n ? `${n} selezionate` : "";
}

async function loadDraft() {
  try {
    const snap = await getDoc(DRAFT_REF);
    if (snap.exists() && notesEl) {
      const d = snap.data() || {};
      notesEl.value = (d.text || "").toString();
    }
    setStatus("Pronto.");
  } catch (e) {
    console.error(e);
    setStatus("Errore caricamento.");
  }
}

async function saveDraft() {
  try {
    await setDoc(
      DRAFT_REF,
      {
        text: (notesEl?.value || "").toString(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    setStatus(`Salvato: ${new Date().toLocaleString("it-IT")}`);
  } catch (e) {
    console.error(e);
    setStatus("Errore salvataggio.");
  }
}

async function saveToHistory() {
  const text = (notesEl?.value || "").toString().trim();
  if (!text) {
    setStatus("Scrivi una nota prima di salvare.");
    return;
  }
  try {
    setStatus("Salvataggio...");
    await addDoc(HISTORY_COL, {
      text,
      createdAt: serverTimestamp(),
    });

    // Pulisci il blocco note (pronto per nuova nota) e aggiorna la bozza
    if (notesEl) notesEl.value = "";
    await saveDraft();
    setStatus(`Salvato: ${new Date().toLocaleString("it-IT")}`);
  } catch (e) {
    console.error(e);
    setStatus("Errore salvataggio.");
  }
}

function buildPrintHtml(items){
  const rows = items.map((it) => {
    const date = esc(fmtDate(it.createdAt) || "—");
    const text = esc(it.text || "");
    return `
      <div class="note">
        <div class="meta">${date}</div>
        <div class="body">${text.replace(/\n/g, "<br>")}</div>
      </div>
    `;
  }).join("\n");

  return `
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Stampa note</title>
  <style>
    *{ box-sizing:border-box; font-family: system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; }
    body{ margin:0; padding:24px; color:#0b1220; }

    .header{ display:flex; align-items:center; gap:14px; border-bottom:2px solid #0b1220; padding-bottom:12px; margin-bottom:16px; }
    .logo{ width:64px; height:auto; }
    .brand{ display:flex; flex-direction:column; gap:2px; }
    .brand .t{ font-weight:1000; font-size:18px; letter-spacing:.6px; }
    .brand .s{ font-weight:700; font-size:12px; opacity:.85; }

    .title{ font-weight:1000; font-size:16px; margin:0 0 10px 0; }

    .note{ border:1px solid rgba(0,0,0,.18); border-radius:12px; padding:12px; margin:0 0 12px 0; }
    .meta{ font-weight:900; font-size:12px; opacity:.75; margin-bottom:8px; }
    .body{ white-space:normal; font-size:13px; line-height:1.35; }

    @media print{
      body{ padding:14mm; }
      .note{ page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <img class="logo" src="/img/logo.png" alt="Logo">
    <div class="brand">
      <div class="t">DCR GROUP</div>
      <div class="s">di Di Caro Luca • +39 3337377008</div>
    </div>
  </div>

  <div class="title">Note selezionate</div>
  ${rows || "<div style='opacity:.7'>Nessuna nota.</div>"}

  <script>
    window.addEventListener('load', () => { window.print(); });
  <\/script>
</body>
</html>`;
}

function printSelected(){
  const items = historyCache.filter(x => selectedIds.has(x.id));
  if(items.length === 0){
    alert("Seleziona almeno una nota da stampare.");
    return;
  }
  const w = window.open("", "_blank");
  if(!w){
    alert("Popup bloccato dal browser. Abilita i popup per stampare.");
    return;
  }
  w.document.open();
  w.document.write(buildPrintHtml(items));
  w.document.close();
}

function renderHistoryItem({ id, text, createdAt }) {
  const wrap = document.createElement("div");
  wrap.className = "note-item";

  // Checkbox selezione
  const selWrap = document.createElement("div");
  selWrap.className = "note-sel";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = selectedIds.has(id);
  cb.title = "Seleziona per stampa";
  cb.addEventListener("change", () => {
    if(cb.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateSelectedCount();
  });
  selWrap.appendChild(cb);

  const meta = document.createElement("div");
  meta.className = "note-meta";
  meta.textContent = fmtDate(createdAt) || "—";

  const body = document.createElement("div");
  body.className = "note-body";
  body.style.userSelect = "text";
  body.style.webkitUserSelect = "text";
  body.innerHTML = esc(text);

  const actions = document.createElement("div");
  actions.className = "note-actions";

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "btn";
  edit.textContent = "Modifica";
  edit.style.background = "#0b1220";
  edit.style.color = "#fff";
  edit.style.borderRadius = "12px";
  edit.style.padding = "10px 12px";
  edit.addEventListener("click", async () => {
    const newText = await openTextEditorModal(text);
    if (newText === null) return;
    try {
      await updateDoc(doc(db, "workNotesHistory", id), { text: newText });
    } catch (e) {
      console.error(e);
      alert("Errore modifica nota.");
    }
  });

  const del = document.createElement("button");
  del.type = "button";
  del.className = "btn";
  del.textContent = "Elimina";
  del.style.background = "#ef4444";
  del.style.color = "#fff";
  del.style.borderRadius = "12px";
  del.style.padding = "10px 12px";
  del.addEventListener("click", async () => {
    if (!confirm("Eliminare questa nota dallo storico?")) return;
    try {
      // pulisci selezione
      selectedIds.delete(id);
      updateSelectedCount();
      await deleteDoc(doc(db, "workNotesHistory", id));
    } catch (e) {
      console.error(e);
      alert("Errore eliminazione.");
    }
  });

  const printOne = document.createElement("button");
  printOne.type = "button";
  printOne.className = "btn";
  printOne.textContent = "Stampa";
  printOne.style.background = "rgba(31,79,216,.14)";
  printOne.style.color = "#0f172a";
  printOne.style.borderRadius = "12px";
  printOne.style.padding = "10px 12px";
  printOne.addEventListener("click", ()=>{
    selectedIds.clear();
    selectedIds.add(id);
    updateSelectedCount();
    printSelected();
  });

  actions.appendChild(printOne);
  actions.appendChild(edit);
  actions.appendChild(del);

  wrap.appendChild(selWrap);
  wrap.appendChild(meta);
  wrap.appendChild(body);
  wrap.appendChild(actions);
  return wrap;
}

function bindHistory() {
  if (!historyEl) return;
  onSnapshot(
    HISTORY_Q,
    (snap) => {
      historyEl.innerHTML = "";
      historyCache = [];

      if (snap.empty) {
        const empty = document.createElement("div");
        empty.style.opacity = ".7";
        empty.textContent = "Nessuna nota salvata nello storico.";
        historyEl.appendChild(empty);
        updateSelectedCount();
        return;
      }

      snap.forEach((d) => {
        const data = d.data() || {};
        const item = {
          id: d.id,
          text: data.text || "",
          createdAt: data.createdAt,
        };
        historyCache.push(item);
        historyEl.appendChild(renderHistoryItem(item));
      });

      // rimuovi selezioni che non esistono più
      const ids = new Set(historyCache.map(x=>x.id));
      Array.from(selectedIds).forEach(id => { if(!ids.has(id)) selectedIds.delete(id); });
      updateSelectedCount();
    },
    (err) => {
      console.error(err);
      historyEl.innerHTML = "<div style=\'opacity:.7\'>Errore caricamento storico.</div>";
    }
  );
}

// ===============================
// Events
// ===============================
if (notesEl) {
  notesEl.addEventListener("input", () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 700);
  });
}

if (saveBtn) saveBtn.addEventListener("click", saveToHistory);

if (clearBtn)
  clearBtn.addEventListener("click", async () => {
    if (!confirm("Vuoi svuotare il blocco note?")) return;
    if (notesEl) notesEl.value = "";
    await saveDraft();
  });

selectAllBtn?.addEventListener("click", ()=>{
  historyCache.forEach(x => selectedIds.add(x.id));
  // aggiorna checkbox già renderizzati
  document.querySelectorAll('#notesHistory input[type="checkbox"]').forEach(cb => cb.checked = true);
  updateSelectedCount();
});

clearSelectedBtn?.addEventListener("click", ()=>{
  selectedIds.clear();
  document.querySelectorAll('#notesHistory input[type="checkbox"]').forEach(cb => cb.checked = false);
  updateSelectedCount();
});

printSelectedBtn?.addEventListener("click", printSelected);

// Boot
loadDraft();
bindHistory();
