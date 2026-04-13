// scadenze-new.js — Professional deadline management module
import { listDeadlines, upsertDeadline, softDeleteDeadline } from "./services/deadlineService.js";
import { auth } from "./firebase.js";
import { db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firestoreService } from "./services/firestoreService.js";

// ── Utils ────────────────────────────────────────────────────────────────────
const eur = (n) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n)||0);
const pad2 = (n) => String(n).padStart(2, "0");
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; };
const isoKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const ymKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;

function toNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim().replace(/€/g, "").trim();
  if (!s) return 0;
  let c = s.replace(/[^0-9,.-]/g, "");
  if (c.includes(",")) c = c.replace(/\./g, "").replace(",", ".");
  const n = Number(c);
  return Number.isFinite(n) ? n : 0;
}

function getStatus(item) {
  if (item.status === "pagata" || item.isPaid) return "pagata";
  const today = todayISO();
  if (item.dateKey < today) return "scaduta";
  const d7 = new Date(); d7.setDate(d7.getDate() + 7);
  const d7iso = isoKey(d7);
  if (item.dateKey <= d7iso) return "urgente";
  return "da_pagare";
}

const CAT_LABELS = {
  affitto: "🏠 Affitto", mutuo: "🏦 Mutuo", utenze: "💡 Utenze",
  tasse: "🧾 Tasse", fornitore: "📦 Fornitore", assicurazione: "🛡️ Assicurazione",
  leasing: "🚗 Leasing", abbonamento: "📱 Abbonamento", altro: "📌 Altro",
};

const RECURRING_LABELS = { no: "—", monthly: "Mensile", bimonthly: "Bimestrale", quarterly: "Trimestrale", annual: "Annuale" };

// ── Spese sync ────────────────────────────────────────────────────────────────
async function syncScadenzaToSpese(dayKey, amount, note) {
  if (!dayKey) return;
  try {
    if (amount > 0 || note) {
      await setDoc(doc(db, "spese", `scad_${dayKey}`), {
        date: dayKey, amount: amount || 0, note: note || "",
        category: "scadenze", source: "scadenza", syncedAt: new Date().toISOString()
      }, { merge: true });
    }
  } catch (e) { console.warn("Sync scadenza→spese:", e); }
}
async function removeScadenzaFromSpese(dayKey) {
  if (!dayKey) return;
  try { await deleteDoc(doc(db, "spese", `scad_${dayKey}`)); } catch (_) {}
}

// ── State ─────────────────────────────────────────────────────────────────────
let allDeadlines = []; // normalized list
let cursor = new Date(); cursor.setDate(1);
let activeFilter = "all";
let activeCat = "";
let activeSearch = "";
let editingId = null;
let trendChart = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const backBtn = document.getElementById("backBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const monthLabel = document.getElementById("monthLabel");
const btnNew = document.getElementById("btnNew");
const searchInput = document.getElementById("searchInput");
const filterTabs = document.getElementById("filterTabs");
const catFilter = document.getElementById("catFilter");
const deadlineList = document.getElementById("deadlineList");
// KPI
const kpiMese = document.getElementById("kpiMese");
const kpiAnno = document.getElementById("kpiAnno");
const kpiUrgenti = document.getElementById("kpiUrgenti");
const kpiScadute = document.getElementById("kpiScadute");
// Sidebar
const sideTotale = document.getElementById("sideTotale");
const sideDaPagare = document.getElementById("sideDaPagare");
const sidePagate = document.getElementById("sidePagate");
const sideCount = document.getElementById("sideCount");
const upcomingList = document.getElementById("upcomingList");
// Modal
const modalOverlay = document.getElementById("modalOverlay");
const modalTitle = document.getElementById("modalTitle");
const modalDate = document.getElementById("modalDate");
const modalAmount = document.getElementById("modalAmount");
const modalNote = document.getElementById("modalNote");
const modalCategory = document.getElementById("modalCategory");
const modalStatus = document.getElementById("modalStatus");
const modalRecurring = document.getElementById("modalRecurring");
const btnSave = document.getElementById("btnSave");
const btnDelete = document.getElementById("btnDelete");
const btnClose2 = document.getElementById("btnClose2");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const btnMarkPaid = document.getElementById("btnMarkPaid");

// ── Load data ─────────────────────────────────────────────────────────────────
async function loadData() {
  const raw = await listDeadlines();
  allDeadlines = raw
    .map(x => ({
      id: x.id,
      dateKey: String(x.dateISO || x.date || x.id || "").slice(0, 10),
      amount: toNum(x.amount ?? x.importo ?? 0),
      note: String(x.note || x.descrizione || x.title || ""),
      category: String(x.category || x.categoria || "altro"),
      status: String(x.status || (x.isPaid ? "pagata" : "da_pagare")),
      recurring: String(x.recurringType || x.recurring || "no"),
      raw: x,
    }))
    .filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.dateKey));
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const ymk = ymKey(cursor);
  const yearStr = String(year);
  const today = todayISO();

  monthLabel.textContent = cursor.toLocaleDateString("it-IT", { month: "long", year: "numeric" }).toUpperCase();

  // KPIs
  const monthItems = allDeadlines.filter(x => x.dateKey.startsWith(ymk));
  const yearItems = allDeadlines.filter(x => x.dateKey.startsWith(yearStr));
  const urgenti = allDeadlines.filter(x => {
    if (x.status === "pagata" || getStatus(x) === "pagata") return false;
    const d7 = new Date(); d7.setDate(d7.getDate() + 7);
    return x.dateKey >= today && x.dateKey <= isoKey(d7);
  });
  const scadute = allDeadlines.filter(x => getStatus(x) === "scaduta");

  kpiMese.textContent = eur(monthItems.reduce((s, x) => s + x.amount, 0));
  kpiAnno.textContent = eur(yearItems.reduce((s, x) => s + x.amount, 0));
  kpiUrgenti.textContent = urgenti.length;
  kpiScadute.textContent = scadute.length;

  // Sidebar stats for current month
  const monthDaPagare = monthItems.filter(x => getStatus(x) !== "pagata");
  const monthPagate = monthItems.filter(x => getStatus(x) === "pagata");
  sideTotale.textContent = eur(monthItems.reduce((s, x) => s + x.amount, 0));
  sideDaPagare.textContent = eur(monthDaPagare.reduce((s, x) => s + x.amount, 0));
  sidePagate.textContent = eur(monthPagate.reduce((s, x) => s + x.amount, 0));
  sideCount.textContent = monthItems.length;

  // Upcoming (next 7 days from today)
  const d7 = new Date(); d7.setDate(d7.getDate() + 7);
  const d7iso = isoKey(d7);
  const upcoming = allDeadlines
    .filter(x => x.dateKey >= today && x.dateKey <= d7iso && getStatus(x) !== "pagata")
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .slice(0, 8);
  if (upcoming.length) {
    upcomingList.innerHTML = upcoming.map(x => {
      const daysLeft = Math.round((new Date(x.dateKey + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
      const isToday = daysLeft === 0;
      const color = isToday ? "#dc2626" : daysLeft <= 3 ? "#d97706" : "#16a34a";
      return `<div class="upcoming-item">
        <div class="upcoming-dot" style="background:${color}"></div>
        <div class="upcoming-info">
          <div class="upcoming-note">${esc(x.note || "—")}</div>
          <div class="upcoming-date">${isToday ? "Oggi!" : `Tra ${daysLeft} giorn${daysLeft===1?"o":"i"}`} · ${fmtDate(x.dateKey)}</div>
        </div>
        <div class="upcoming-amount" style="color:${color}">${x.amount ? eur(x.amount) : ""}</div>
      </div>`;
    }).join("");
  } else {
    upcomingList.innerHTML = `<span style="color:var(--muted);font-size:13px;font-style:italic">✅ Nessuna scadenza urgente</span>`;
  }

  // Filter deadlines for the current month
  let items = monthItems.slice();
  if (activeFilter === "da_pagare") items = items.filter(x => getStatus(x) === "da_pagare" || getStatus(x) === "urgente");
  if (activeFilter === "pagata") items = items.filter(x => getStatus(x) === "pagata");
  if (activeFilter === "scaduta") items = items.filter(x => getStatus(x) === "scaduta");
  if (activeCat) items = items.filter(x => x.category === activeCat);
  if (activeSearch) items = items.filter(x => (x.note + " " + x.category).toLowerCase().includes(activeSearch.toLowerCase()));
  items.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  if (!items.length) {
    deadlineList.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📭</div>
      <div class="empty-text">Nessuna scadenza trovata</div>
      <div class="empty-sub">Clicca "＋ Nuova" per aggiungere una scadenza</div>
    </div>`;
    renderChart(yearItems);
    return;
  }

  deadlineList.innerHTML = items.map(x => {
    const st = getStatus(x);
    const [yy, mm, dd] = x.dateKey.split("-");
    const monthShort = new Date(x.dateKey + "T00:00:00").toLocaleDateString("it-IT", { month: "short" }).toUpperCase();
    const stClass = st === "pagata" ? "status-pagata" : st === "scaduta" ? "status-scaduta" : st === "urgente" ? "status-urgente" : "";
    const stBadge = st === "pagata"
      ? `<span class="badge badge-pagata">✅ Pagata</span>`
      : st === "scaduta"
      ? `<span class="badge badge-scaduta">🔴 Scaduta</span>`
      : st === "urgente"
      ? `<span class="badge badge-da-pagare">⚡ Urgente</span>`
      : `<span class="badge badge-da-pagare">⏳ Da pagare</span>`;
    const catBadge = x.category && x.category !== "altro"
      ? `<span class="badge badge-cat">${CAT_LABELS[x.category] || x.category}</span>` : "";
    const recBadge = x.recurring && x.recurring !== "no"
      ? `<span class="recurring-badge">🔄 ${RECURRING_LABELS[x.recurring] || x.recurring}</span>` : "";
    return `<div class="deadline-item ${stClass}" data-id="${esc(x.id)}" role="button" tabindex="0">
      <div class="deadline-date-col">
        <div class="deadline-day">${dd}</div>
        <div class="deadline-mon">${monthShort}</div>
      </div>
      <div class="deadline-body">
        <div class="deadline-note">${esc(x.note || "—")}</div>
        <div class="deadline-meta">${stBadge}${catBadge}${recBadge}</div>
      </div>
      <div class="deadline-amount">${x.amount ? eur(x.amount) : ""}</div>
      <div class="deadline-actions">
        ${st !== "pagata" ? `<button class="action-btn" data-action="pay" data-id="${esc(x.id)}" title="Segna pagata">✅</button>` : `<button class="action-btn" data-action="unpay" data-id="${esc(x.id)}" title="Riapri">↩</button>`}
        <button class="action-btn" data-action="edit" data-id="${esc(x.id)}" title="Modifica">✏️</button>
        <button class="action-btn danger" data-action="delete" data-id="${esc(x.id)}" title="Elimina">��</button>
      </div>
    </div>`;
  }).join("");

  // Event delegation
  deadlineList.querySelectorAll(".deadline-item").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-action]")) return;
      const id = el.dataset.id;
      openModal(id);
    });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") { const id = el.dataset.id; openModal(id); } });
  });
  deadlineList.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === "edit") { openModal(id); return; }
      if (action === "pay") { await quickMarkPaid(id, true); return; }
      if (action === "unpay") { await quickMarkPaid(id, false); return; }
      if (action === "delete") { await deleteDeadline(id); return; }
    });
  });

  renderChart(yearItems);
}

function esc(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ── Trend/category chart ──────────────────────────────────────────────────────
function renderChart(yearItems) {
  const canvas = document.getElementById("chartCategorie");
  if (!canvas || !window.Chart) return;
  const catTotals = {};
  yearItems.forEach(x => { catTotals[x.category||"altro"] = (catTotals[x.category||"altro"] || 0) + x.amount; });
  const cats = Object.keys(catTotals).filter(k => catTotals[k] > 0);
  if (!cats.length) { canvas.style.display = "none"; return; }
  canvas.style.display = "";
  const colors = ["#1f4fd8","#16a34a","#d97706","#dc2626","#7c3aed","#0891b2","#db2777","#ea580c","#64748b"];
  const data = cats.map(k => catTotals[k]);
  const labels = cats.map(k => CAT_LABELS[k] || k);
  if (trendChart) { try { trendChart.destroy(); } catch (_) {} }
  trendChart = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, cats.length), borderWidth: 2, borderColor: "rgba(255,255,255,.5)" }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { position: "bottom", labels: { font: { size: 10, weight: "700" }, boxWidth: 12 } },
        tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${eur(ctx.parsed)}` } } }
    }
  });
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(id) {
  clearErrors();
  editingId = id || null;
  const item = id ? allDeadlines.find(x => x.id === id) : null;

  modalTitle.textContent = item ? "Modifica scadenza" : "Nuova scadenza";
  modalDate.value = item ? item.dateKey : todayISO();
  modalAmount.value = item && item.amount ? String(item.amount) : "";
  modalNote.value = item ? item.note : "";
  modalCategory.value = item ? (item.category || "") : "";
  modalStatus.value = item ? (item.status || "da_pagare") : "da_pagare";
  modalRecurring.value = item ? (item.recurring || "no") : "no";

  btnDelete.style.display = item ? "inline-flex" : "none";
  btnMarkPaid.style.display = (item && item.status !== "pagata") ? "inline-flex" : "none";

  modalOverlay.classList.remove("hidden");
  document.documentElement.style.overflow = "hidden";
  setTimeout(() => modalNote.focus(), 50);
}

function closeModal() {
  modalOverlay.classList.add("hidden");
  document.documentElement.style.overflow = "";
  editingId = null;
}

function clearErrors() {
  ["modalDate","modalAmount","modalNote"].forEach(id => {
    document.getElementById(id)?.classList.remove("error");
  });
  ["errDate","errAmount","errNote"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

function showError(inputId, errId) {
  document.getElementById(inputId)?.classList.add("error");
  const err = document.getElementById(errId);
  if (err) err.style.display = "block";
}

async function saveModal() {
  clearErrors();
  let hasErr = false;

  const dateVal = modalDate.value;
  if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) { showError("modalDate","errDate"); hasErr = true; }

  const note = modalNote.value.trim();
  if (!note) { showError("modalNote","errNote"); hasErr = true; }

  const amount = toNum(modalAmount.value);
  if (modalAmount.value.trim() && amount < 0) { showError("modalAmount","errAmount"); hasErr = true; }

  if (hasErr) return;

  const payload = {
    date: dateVal,
    note,
    amount,
    category: modalCategory.value || "altro",
    status: modalStatus.value || "da_pagare",
    recurringType: modalRecurring.value || "no",
    updatedAt: firestoreService.serverTimestamp(),
  };

  btnSave.disabled = true; btnSave.textContent = "Salvataggio…";
  try {
    const id = editingId || dateVal;
    await upsertDeadline(id, payload);
    if (payload.status !== "pagata") {
      await syncScadenzaToSpese(dateVal, amount, note);
    } else {
      await removeScadenzaFromSpese(dateVal);
    }
    // Schedule recurring
    if (payload.recurringType && payload.recurringType !== "no" && !editingId) {
      await scheduleRecurring(dateVal, payload);
    }
    closeModal();
    await loadData();
    render();
  } catch (e) {
    alert("Errore durante il salvataggio: " + (e.message || e));
  } finally {
    btnSave.disabled = false; btnSave.textContent = "💾 Salva";
  }
}

async function deleteDeadline(id) {
  if (!id) return;
  if (!confirm("Eliminare questa scadenza?")) return;
  try {
    const item = allDeadlines.find(x => x.id === id);
    await softDeleteDeadline(id);
    if (item) await removeScadenzaFromSpese(item.dateKey);
    closeModal();
    await loadData();
    render();
  } catch (e) {
    alert("Errore eliminazione: " + (e.message || e));
  }
}

async function quickMarkPaid(id, paid) {
  const item = allDeadlines.find(x => x.id === id);
  if (!item) return;
  const el = deadlineList.querySelector(`[data-id="${id}"]`);
  if (el) el.classList.add("marking");
  try {
    await upsertDeadline(id, {
      ...item.raw,
      status: paid ? "pagata" : "da_pagare",
      updatedAt: firestoreService.serverTimestamp(),
    });
    if (paid) await removeScadenzaFromSpese(item.dateKey);
    else await syncScadenzaToSpese(item.dateKey, item.amount, item.note);
    await loadData();
    render();
  } catch (e) {
    if (el) el.classList.remove("marking");
    alert("Errore: " + (e.message || e));
  }
}

// Schedule recurring deadlines (create future entries)
async function scheduleRecurring(startDate, basePayload) {
  const offsets = { monthly: [1,2,3,4,5,6,7,8,9,10,11], bimonthly: [2,4,6,8,10], quarterly: [3,6,9,12], annual: [12] };
  const months = offsets[basePayload.recurringType];
  if (!months) return;
  const d = new Date(startDate + "T00:00:00");
  const promises = months.map(async offset => {
    const nd = new Date(d);
    nd.setMonth(nd.getMonth() + offset);
    const ndKey = isoKey(nd);
    const existing = allDeadlines.find(x => x.dateKey === ndKey);
    if (existing) return; // don't overwrite existing
    await upsertDeadline(ndKey, {
      ...basePayload,
      date: ndKey,
      updatedAt: firestoreService.serverTimestamp(),
    }).catch(() => {});
  });
  await Promise.all(promises);
}

// ── Event listeners ───────────────────────────────────────────────────────────
backBtn?.addEventListener("click", () => { window.location.href = "index.html"; });
prevBtn?.addEventListener("click", () => { cursor.setMonth(cursor.getMonth() - 1); render(); });
nextBtn?.addEventListener("click", () => { cursor.setMonth(cursor.getMonth() + 1); render(); });

btnNew?.addEventListener("click", () => openModal(null));
modalCloseBtn?.addEventListener("click", closeModal);
btnClose2?.addEventListener("click", closeModal);
modalOverlay?.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

btnSave?.addEventListener("click", saveModal);
btnDelete?.addEventListener("click", () => { if (editingId) deleteDeadline(editingId); });
btnMarkPaid?.addEventListener("click", async () => { if (editingId) { await quickMarkPaid(editingId, true); closeModal(); } });

filterTabs?.querySelectorAll(".filter-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    filterTabs.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    activeFilter = tab.dataset.filter;
    render();
  });
});

catFilter?.addEventListener("change", () => { activeCat = catFilter.value; render(); });
searchInput?.addEventListener("input", () => { activeSearch = searchInput.value; render(); });

// ── Boot ──────────────────────────────────────────────────────────────────────
function waitForAuth() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user); });
  });
}

waitForAuth().then(async () => {
  try {
    await loadData();
    render();
  } catch (e) {
    console.error("Scadenze boot error:", e);
    deadlineList.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-text">Errore caricamento dati</div><div class="empty-sub">${e.message||e}</div></div>`;
  }
});
