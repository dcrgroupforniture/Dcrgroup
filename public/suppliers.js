import { db } from "./firebase.js";
import { firestoreService as fs } from "./services/firestoreService.js";
import {
  collection,
  getDocs,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";
import { euro as eurFmt, escapeHtml as escapeHtmlAttribute } from './utils.js';

const suppliersListEl = document.getElementById("suppliersList");
const grandTotalEl = document.getElementById("grandTotal");
const searchInput = document.getElementById("searchInput");
const newSupplierBtn = document.getElementById("newSupplierBtn");

let suppliersCache = [];
let supplierTotalsFromInvoices = new Map();

function eur(n){
  const v = parseEuroLike(n);
  return v.toFixed(2);
}

function parseEuroLike(v){
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  let cleaned = s.replace(/[^0-9,.-]/g, "");
  if (cleaned.includes(",")) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalize(s){
  return (s || "").toString().trim().toLowerCase();
}
function getInvoiceAmount(inv){
  return parseEuroLike(inv?.totalWithVat ?? inv?.total ?? inv?.importo ?? inv?.amount ?? 0);
}

function getSupplierTotalValue(s){
  if(s?.id && supplierTotalsFromInvoices.has(s.id)){
    return supplierTotalsFromInvoices.get(s.id) || 0;
  }
  return parseEuroLike(s?.total);
}

function render(list){
  suppliersListEl.innerHTML = "";

  let grand = 0;

  list.forEach((s) => {
    const total = getSupplierTotalValue(s);
    grand += total;

    const row = document.createElement("div");
    row.className = "supplier-row";
    row.innerHTML = `
      <div class="supplier-name">${(s.name || "Senza nome")}</div>
      <div class="supplier-total">€ ${eur(total)}</div>
    `;

    row.addEventListener("click", () => {
      // Highlight selected row
      document.querySelectorAll('.supplier-row').forEach(r => r.classList.remove('supplier-row--selected'));
      row.classList.add('supplier-row--selected');
      // Open inline detail panel
      openSupplierDetail(s);
    });

    suppliersListEl.appendChild(row);
  });

  grandTotalEl.textContent = eur(grand);

  // KPI (se presenti nel layout nuovo)
  const kpiCount = document.getElementById("kpiSuppliersCount");
  const kpiTotal = document.getElementById("kpiSuppliersTotal");
  if(kpiCount) kpiCount.textContent = String(list.length);
  if(kpiTotal) kpiTotal.textContent = eurFmt(grand);
  renderSuppliersChart(list);
}

async function loadSuppliers(){
  const q = query(collection(db, "suppliers"), orderBy("name"));
  if(suppliersListEl) suppliersListEl.innerHTML = '<div style="padding:16px;color:#6b7280;font-style:italic;text-align:center;">⏳ Caricamento fornitori…</div>';
  try {
    onSnapshot(q, (snap) => {
      suppliersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      applyFilter();
    }, (err) => {
      console.error('Errore caricamento fornitori:', err);
      if(suppliersListEl) suppliersListEl.innerHTML = '<div style="padding:16px;color:#dc2626;font-weight:700;text-align:center;">⚠️ Errore caricamento. Ricarica la pagina.</div>';
    });
  } catch(err) {
    console.error('Errore avvio listener fornitori:', err);
    if(suppliersListEl) suppliersListEl.innerHTML = '<div style="padding:16px;color:#dc2626;font-weight:700;text-align:center;">⚠️ Errore caricamento. Ricarica la pagina.</div>';
  }
}

function applyFilter(){
  const term = normalize(searchInput.value);
  if(!term){
    render(suppliersCache);
    return;
  }
  const filtered = suppliersCache.filter(s => normalize(s.name).includes(term));
  render(filtered);
}

// ── Inline Supplier Detail Panel (CRM style) ──────────────────
async function openSupplierDetail(s) {
  const panel = document.getElementById('supplierDetailPanel');
  if (!panel) return;

  const initials = (s.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  panel.classList.remove('hidden');
  panel.innerHTML = `<div class="sdp-loading">⏳ Caricamento scheda fornitore…</div>`;

  // Fetch invoices (storico ordini fornitore)
  let invoices = [];
  try {
    const invSnap = await fs.getSubCollection('suppliers', s.id, 'invoices');
    invoices = invSnap
      .sort((a, b) => {
        const da = a.date || a.invoiceDate || a.dateISO || '';
        const db_ = b.date || b.invoiceDate || b.dateISO || '';
        return db_.localeCompare(da);
      });
  } catch(e) {
    console.warn('Errore caricamento fatture fornitore:', e);
  }

  // KPIs
  const currentYear = new Date().getFullYear();
  const totalAll = invoices.reduce((s, i) => s + getInvoiceAmount(i), 0);
  const totalYear = invoices.filter(i => {
    const d = i.date || i.invoiceDate || i.dateISO || '';
    return d.startsWith(String(currentYear));
  }).reduce((s, i) => s + getInvoiceAmount(i), 0);
  const unpaidCount = invoices.filter(i => (i.status || 'da-pagare') !== 'pagata').length;
  const overdueCount = invoices.filter(i => {
    if ((i.status || '') === 'pagata') return false;
    const due = i.dueDate || i.invoiceDueDate || '';
    return due && due < new Date().toISOString().slice(0, 10);
  }).length;

  function fmtDate(v) {
    if (!v) return '—';
    const d = v instanceof Date ? v : new Date(v + (v.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d.getTime())) return v;
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

  const catLabel = { prodotti:'Prodotti', attrezzatura:'Attrezzatura', servizi:'Servizi', utenze:'Utenze', altro:'Altro' };

  // Anagrafica fields
  const anagraficaRows = [
    ['🏢 Nome', s.name || '—'],
    ['🪪 P.IVA / C.F.', s.vat || '—'],
    ['📧 Email', s.email ? `<a href="mailto:${s.email}" style="color:#1f4fd8">${s.email}</a>` : '—'],
    ['📞 Telefono', s.phone ? `<a href="tel:${s.phone}" style="color:#1f4fd8">${s.phone}</a>` : '—'],
    ['📍 Comune', s.city || '—'],
    ['🏷️ Categoria', catLabel[s.supplierCategory || s.category] || s.supplierCategory || s.category || '—'],
  ].map(([label, val]) => `
    <div class="sdp-ana-row">
      <span class="sdp-ana-label">${label}</span>
      <span class="sdp-ana-val">${val}</span>
    </div>`).join('');

  // Invoice rows — show ALL invoices, each row is clickable to open detail
  const invoiceRows = invoices.map(i => {
    const amount = getInvoiceAmount(i);
    const desc = i.description || (i.invoiceNumber ? `Fattura #${i.invoiceNumber}` : 'Fattura');
    const dateStr = fmtDate(i.date || i.invoiceDate || i.dateISO || '');
    const dueStr = fmtDate(i.dueDate || i.invoiceDueDate || '');
    const paid = (i.status || '') === 'pagata';
    const overdue = !paid && (i.dueDate || i.invoiceDueDate || '') < new Date().toISOString().slice(0,10) && (i.dueDate || i.invoiceDueDate);
    const statusClass = paid ? 'paid' : (overdue ? 'overdue' : 'unpaid');
    const statusLabel = paid ? '✅ Pagata' : (overdue ? '🚨 Scaduta' : '⏳ Da pagare');
    const safeInvId = encodeURIComponent(i.id || '');
    const safeSupId = encodeURIComponent(s.id || '');
    return `<div class="sdp-hist-row sdp-hist-row--clickable" data-inv-id="${safeInvId}" data-sup-id="${safeSupId}" title="Clicca per aprire la fattura">
      <span class="sdp-hist-date">${dateStr}</span>
      <span class="sdp-hist-desc" title="${desc}">${desc.length > 35 ? desc.slice(0,35)+'…' : desc}</span>
      <span class="sdp-hist-due">${dueStr}</span>
      <span class="sdp-hist-amt">€ ${eur(amount)}</span>
      <span class="sdp-hist-status ${statusClass}">${statusLabel}</span>
    </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="sdp-header">
      <div class="sdp-avatar">${initials}</div>
      <div class="sdp-info">
        <div class="sdp-name">${(s.name || '—').toUpperCase()}</div>
        <div class="sdp-meta">${[s.city, s.email].filter(Boolean).join(' · ') || 'Fornitore'}</div>
      </div>
      <div class="sdp-header-actions">
        <a href="supplier.html?supplierId=${encodeURIComponent(s.id)}" class="sdp-btn sdp-btn-primary">✏️ Gestisci</a>
        <button class="sdp-close" id="sdpClose" title="Chiudi">✕</button>
      </div>
    </div>

    <div class="sdp-stats">
      <div class="sdp-stat">
        <div class="sdp-stat-val">€ ${eur(totalYear)}</div>
        <div class="sdp-stat-label">Totale anno ${currentYear}</div>
      </div>
      <div class="sdp-stat">
        <div class="sdp-stat-val">€ ${eur(totalAll)}</div>
        <div class="sdp-stat-label">Totale storico</div>
      </div>
      <div class="sdp-stat ${unpaidCount > 0 ? 'sdp-stat-warn' : ''}">
        <div class="sdp-stat-val">${unpaidCount}</div>
        <div class="sdp-stat-label">Da pagare</div>
      </div>
      <div class="sdp-stat ${overdueCount > 0 ? 'sdp-stat-danger' : ''}">
        <div class="sdp-stat-val">${overdueCount}</div>
        <div class="sdp-stat-label">Scadute</div>
      </div>
    </div>

    <div class="sdp-tabs">
      <button class="sdp-tab active" data-tab="anagrafica">🏢 Anagrafica</button>
      <button class="sdp-tab" data-tab="storico">📋 Storico Fatture (${invoices.length})</button>
    </div>

    <div class="sdp-tab-body" id="sdpTabAnagrafica">
      <div class="sdp-anagrafica">
        ${anagraficaRows}
      </div>
      <div class="sdp-actions">
        <a href="supplier.html?supplierId=${encodeURIComponent(s.id)}" class="sdp-btn sdp-btn-primary">✏️ Modifica anagrafica</a>
        <a href="supplier.html" class="sdp-btn sdp-btn-secondary">➕ Nuovo fornitore</a>
      </div>
    </div>

    <div class="sdp-tab-body hidden" id="sdpTabStorico">
      <div class="sdp-history">
        <div class="sdp-hist-head sdp-hist-head-5col">
          <span>Data</span><span>Descrizione</span><span>Scadenza</span><span>Importo</span><span>Stato</span>
        </div>
        ${invoiceRows || '<div class="sdp-no-data">Nessuna fattura trovata per questo fornitore</div>'}
      </div>
      <div class="sdp-actions">
        <a href="supplier.html?supplierId=${encodeURIComponent(s.id)}&openInvoice=1" class="sdp-btn sdp-btn-primary">➕ Aggiungi fattura</a>
      </div>
    </div>
  `;

  // Storico fatture rows — click navigates to supplier detail with invoice open
  panel.querySelectorAll('.sdp-hist-row--clickable').forEach(row => {
    row.addEventListener('click', () => {
      const supId = decodeURIComponent(row.dataset.supId || '');
      const invId = decodeURIComponent(row.dataset.invId || '');
      if (!supId) { console.warn('Invoice row click handler: missing supplier ID, cannot navigate'); return; }
      const url = invId
        ? `supplier.html?supplierId=${encodeURIComponent(supId)}&editInvoiceId=${encodeURIComponent(invId)}`
        : `supplier.html?supplierId=${encodeURIComponent(supId)}`;
      window.location.href = url;
    });
  });

  // Tab switching
  panel.querySelectorAll('.sdp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      panel.querySelectorAll('.sdp-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const targetId = tab.dataset.tab === 'anagrafica' ? 'sdpTabAnagrafica' : 'sdpTabStorico';
      panel.querySelectorAll('.sdp-tab-body').forEach(b => b.classList.add('hidden'));
      panel.getElementById ? null : document.getElementById(targetId)?.classList.remove('hidden');
      // Use querySelector since panel is the parent
      panel.querySelector(`#${targetId}`)?.classList.remove('hidden');
    });
  });

  document.getElementById('sdpClose')?.addEventListener('click', () => {
    panel.classList.add('hidden');
    document.querySelectorAll('.supplier-row').forEach(r => r.classList.remove('supplier-row--selected'));
  });
}

newSupplierBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  window.location.href = "supplier.html";
});

searchInput.addEventListener("input", applyFilter);

loadSuppliers();

// ── Mark ALL invoices from ALL suppliers as paid ──────
const markAllSuppliersInvoicesPaidBtn = document.getElementById("markAllSuppliersInvoicesPaidBtn");
markAllSuppliersInvoicesPaidBtn?.addEventListener("click", async () => {
  if(!confirm("Segna TUTTE le fatture di TUTTI i fornitori come pagate?")) return;
  try {
    const suppDocs = await fs.getAllByCompany('suppliers');
    const allInvsBySupp = await Promise.all(
      suppDocs.map(suppDoc => fs.getSubCollection("suppliers", suppDoc.id, "invoices"))
    );

    // Collect all updates (Firestore batch limit: 500 ops per batch)
    const unpaidInvoiceRefs = [];
    allInvsBySupp.forEach((invs, i) => {
      const invSubRef = collection(db, "suppliers", suppDocs[i].id, "invoices");
      invs.forEach(inv => {
        if((inv.status || "da-pagare") !== "pagata"){
          unpaidInvoiceRefs.push(doc(invSubRef, inv.id));
        }
      });
    });

    if(unpaidInvoiceRefs.length === 0){ alert("Tutte le fatture sono già segnate come pagate."); return; }

    // Commit in chunks of 500
    const FIRESTORE_BATCH_LIMIT = 500;
    for(let i = 0; i < unpaidInvoiceRefs.length; i += FIRESTORE_BATCH_LIMIT){
      const batch = writeBatch(db);
      unpaidInvoiceRefs.slice(i, i + FIRESTORE_BATCH_LIMIT).forEach(ref => batch.update(ref, { status: "pagata" }));
      await batch.commit();
    }

    alert(`✅ ${unpaidInvoiceRefs.length} fattura/e segnata/e come pagata.`);
    await loadOrdersHistory();
  } catch(err) {
    console.error("Errore durante il salvataggio:", err);
    alert("❌ Errore durante il salvataggio: " + (err?.message || err));
  }
});

let suppliersChart;
function renderSuppliersChart(list){
  const canvas = document.getElementById('suppliersChart');
  if(!canvas || !window.Chart) return;
  const wrap = canvas.parentElement;
  if(wrap){
    wrap.style.height = (window.innerWidth <= 768 ? 260 : 320) + 'px';
    wrap.style.minHeight = wrap.style.height;
    wrap.style.maxHeight = wrap.style.height;
  }
  const labels = list.map(s=>String(s.name||'Senza nome'));
  const values = list.map(s=>getSupplierTotalValue(s));
  if(suppliersChart) { try{suppliersChart.destroy();}catch(_){} }
  if(window.ChartDataLabels) Chart.register(ChartDataLabels);
  suppliersChart = new Chart(canvas.getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[{ data: values, backgroundColor:'rgba(59,130,246,0.55)', borderColor:'rgba(59,130,246,0.95)', borderWidth:1, borderRadius:8, maxBarThickness:42, clip:false }] },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      animation:false,
      clip: false,
      layout:{ padding:{ top:40 } },
      plugins:{
        legend:{display:false},
        tooltip:{ callbacks:{ label:(ctx)=>`€ ${eur(ctx.parsed.y||0)}` } },
        datalabels:{
          display:(ctx)=>ctx.dataset.data[ctx.dataIndex]>0,
          anchor:'end', align:'top',
          formatter:(v)=>'€ '+eur(v),
          font:{size:10,weight:'700'},
          color:'rgba(59,130,246,0.9)',
          clamp:false, clip:false,
          padding:{top:2}
        }
      },
      scales:{ y:{ beginAtZero:true, ticks:{ callback:(value)=>'€ '+eur(value) } }, x:{ ticks:{ autoSkip:false, maxRotation:40, minRotation:0 } } }
    }
  });
}
window.addEventListener('resize', () => renderSuppliersChart(suppliersCache));

let monthlyOrdersChart;
function renderMonthlyOrdersChart(){
  const canvas = document.getElementById('monthlyOrdersChart');
  if(!canvas || !window.Chart) return;
  const wrap = canvas.parentElement;
  if(wrap){
    wrap.style.height = (window.innerWidth <= 768 ? 260 : 320) + 'px';
    wrap.style.minHeight = wrap.style.height;
    wrap.style.maxHeight = wrap.style.height;
  }
  // Collect totals per month per supplier
  const monthTotals = {}; // { 'YYYY-MM': { supplierId: amount } }
  const supplierIds = Object.keys(ordersHistory);
  supplierIds.forEach(supplierId => {
    const { orders } = ordersHistory[supplierId];
    orders.forEach(o => {
      const dateStr = o.dateISO || o.invoiceDate || o.date || null;
      if(!dateStr) return;
      const monthKey = String(dateStr).slice(0, 7); // YYYY-MM
      if(!monthTotals[monthKey]) monthTotals[monthKey] = {};
      monthTotals[monthKey][supplierId] = (monthTotals[monthKey][supplierId] || 0) + Number(o.totalWithVat || o.total || o.importo || o.amount || 0);
    });
  });
  const months = Object.keys(monthTotals).sort();
  if(!months.length){ canvas.style.display='none'; return; }
  canvas.style.display='';
  const monthLabels = months.map(m => {
    const [y, mo] = m.split('-');
    const d = new Date(parseInt(y), parseInt(mo)-1, 1);
    return d.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
  });
  const chartColors = [
    'rgba(59,130,246,0.80)','rgba(16,185,129,0.80)','rgba(245,158,11,0.85)',
    'rgba(239,68,68,0.80)','rgba(139,92,246,0.80)','rgba(236,72,153,0.80)',
    'rgba(20,184,166,0.80)','rgba(249,115,22,0.85)','rgba(99,102,241,0.80)',
    'rgba(6,182,212,0.80)','rgba(132,204,22,0.85)','rgba(234,179,8,0.85)',
    'rgba(14,165,233,0.80)','rgba(168,85,247,0.80)','rgba(239,68,68,0.65)',
    'rgba(34,197,94,0.80)','rgba(251,146,60,0.85)','rgba(244,63,94,0.80)'
  ];
  const datasets = supplierIds
    .filter(id => ordersHistory[id].orders.length > 0)
    .map((id, i) => ({
      label: ordersHistory[id].name,
      data: months.map(m => monthTotals[m]?.[id] || 0),
      backgroundColor: chartColors[i % chartColors.length],
      borderRadius: 4,
      maxBarThickness: 42
    }));
  // Custom plugin: draw column totals above stacked bars
  const stackTotalsPlugin = {
    id: 'stackTotals',
    afterDatasetsDraw(chart) {
      const { ctx, data, scales } = chart;
      const yScale = scales.y;
      if(!yScale) return;
      const n = data.labels.length;
      for(let i=0; i<n; i++){
        const total = data.datasets.reduce((s,ds)=>s+(Number(ds.data[i])||0),0);
        if(!total) continue;
        const meta0 = chart.getDatasetMeta(0);
        if(!meta0||!meta0.data[i]) continue;
        const x = meta0.data[i].x;
        const y = yScale.getPixelForValue(total);
        ctx.save();
        ctx.font = 'bold 10px "Segoe UI",system-ui,sans-serif';
        ctx.fillStyle = '#334155';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('€'+eur(total), x, y-4);
        ctx.restore();
      }
    }
  };
  if(monthlyOrdersChart){ try{monthlyOrdersChart.destroy();}catch(_){} }
  if(window.ChartDataLabels) Chart.register(ChartDataLabels);
  monthlyOrdersChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels: monthLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      clip: false,
      layout: { padding: { top: 40 } },
      plugins: {
        legend: { display: true, position: 'bottom' },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: € ${eur(ctx.parsed.y||0)}` } },
        datalabels: {
          display:(ctx)=>ctx.dataset.data[ctx.dataIndex]>0,
          anchor:'center', align:'center',
          formatter:(v)=>v>=100?'€'+eur(v):'',
          font:{size:9,weight:'700'},
          color:'#fff',
          clamp:false, clip:false
        }
      },
      scales: {
        x: { stacked: true, ticks: { autoSkip: false, maxRotation: 40, minRotation: 0 } },
        y: { stacked: true, beginAtZero: true, ticks: { callback: (value) => '€ '+eur(value) } }
      }
    },
    plugins: [stackTotalsPlugin]
  });
}

// ── STORICO ORDINI FORNITORI ─────────────────────────────────────────
const storage = getStorage();
let ordersHistory = {}; // { supplierId: { name, orders: [] } }
let hasSyncedInvoicesToSpese = false;
let syncAllInvoicesPromise = null;

// ── Sync tutte le fatture di tutti i fornitori → spese ──────────────────
async function syncAllInvoicesToSpese(){
  // Usa i dati già caricati in ordersHistory
  const entries = Object.entries(ordersHistory);
  const promises = [];
  for(const [supplierId, { name, orders }] of entries){
    for(const inv of orders){
      if(!inv.id) continue;
      const date = inv.dateISO || inv.invoiceDate || inv.date || "";
      if(!date) continue;
      const amount = Number(inv.totalWithVat || inv.total || inv.importo || inv.amount || 0);
      const note = [name, inv.description || inv.invoiceNumber].filter(Boolean).join(" – ");
      const speseId = `supplier_${supplierId}_${inv.id}`;
      promises.push(
        fs.set("expenses", speseId, {
          date,
          amount,
          note,
          category: inv.category || "fornitori",
          source: "supplier_invoice",
          supplierId,
          invoiceId: inv.id,
          syncedAt: new Date().toISOString()
        }).catch(e => console.warn(`Sync inv ${inv.id}:`, e))
      );
    }
  }
  await Promise.all(promises);
}

function scheduleGlobalInvoicesSyncOnce(){
  if(hasSyncedInvoicesToSpese || syncAllInvoicesPromise) return;
  const startSync = () => {
    syncAllInvoicesPromise = syncAllInvoicesToSpese()
      .catch(e => console.warn("Sync globale fatture→spese:", e))
      .finally(() => {
        hasSyncedInvoicesToSpese = true;
      });
  };
  if(typeof window.requestIdleCallback === "function"){
    window.requestIdleCallback(startSync, { timeout: 2000 });
  } else {
    setTimeout(startSync, 0);
  }
}

function updateInvoiceKpisFromHistory(){
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  let grandMonthTotal = 0;
  let grandDaPagare = 0;
  Object.values(ordersHistory).forEach(({ orders }) => {
    orders.forEach(inv => {
      const amount = getInvoiceAmount(inv);
      const dateKey = String(inv.dateISO || inv.invoiceDate || inv.date || "").slice(0, 7);
      if(dateKey === currentMonthKey) grandMonthTotal += amount;
      if((inv.status || "da-pagare") !== "pagata") grandDaPagare += amount;
    });
  });
  const kpiMonthTotalEl = document.getElementById("kpiMonthTotal");
  const kpiDaPagareEl = document.getElementById("kpiDaPagare");
  if(kpiMonthTotalEl) kpiMonthTotalEl.textContent = eurFmt(grandMonthTotal);
  if(kpiDaPagareEl) kpiDaPagareEl.textContent = eurFmt(grandDaPagare);
}

async function loadOrdersHistory(){
  const list = document.getElementById('ordersHistoryList');
  if(!list) return;
  try{
    let supplierEntries;
    if(suppliersCache.length){
      supplierEntries = suppliersCache.map(s => ({ id: s.id, data: s }));
    } else {
      const suppDocs = await fs.getAllByCompany('suppliers');
      supplierEntries = suppDocs.map(d => ({ id: d.id, data: d }));
    }
    suppliersCache = supplierEntries.map(({ id, data }) => ({ id, ...data }));
    ordersHistory = {};
    supplierTotalsFromInvoices = new Map();
    await Promise.all(supplierEntries.map(async (supplierEntry) => {
      const supplierData = supplierEntry.data || {};
      const name = String(supplierData.name || 'Senza nome');
      const ordersSnap = await fs.getSubCollection('suppliers', supplierEntry.id, 'invoices');
      const orders = ordersSnap
        .sort((a,b)=>{
          const da = a.dateISO || a.invoiceDate || a.date || '';
          const db_ = b.dateISO || b.invoiceDate || b.date || '';
          return db_.localeCompare(da);
        });
      const totalFromInvoices = orders.reduce((sum, inv) => sum + getInvoiceAmount(inv), 0);
      supplierTotalsFromInvoices.set(supplierEntry.id, totalFromInvoices);
      ordersHistory[supplierEntry.id] = { name, orders };
    }));
    suppliersCache = supplierEntries.map(({ id, data }) => ({
      id,
      ...data,
      total: supplierTotalsFromInvoices.get(id) || 0
    }));
    applyFilter();
    updateInvoiceKpisFromHistory();
    renderOrdersHistory();
    populateSupplierSelect();
    scheduleGlobalInvoicesSyncOnce();
  }catch(e){
    console.warn('loadOrdersHistory',e);
    if(list) list.innerHTML='<div style="color:#dc2626;padding:8px">Errore caricamento storico fatture.</div>';
  }
}

function sanitizeExternalUrl(rawUrl){
  if(!rawUrl) return "";
  try{
    const u = new URL(String(rawUrl), window.location.origin);
    const allowedProtocols = new Set(["https:", "http:"]);
    if(!allowedProtocols.has(u.protocol)) return "";
    return u.href;
  }catch(_){
    return "";
  }
}

function renderOrdersHistory(){
  const list = document.getElementById('ordersHistoryList');
  if(!list) return;
  renderMonthlyOrdersChart();
  const entries = Object.entries(ordersHistory).filter(([,v])=>v.orders.length>0);
  if(!entries.length){
    list.innerHTML='<div style="color:#9ca3af;font-style:italic;padding:12px 0;">Nessuna fattura registrata. Usa il pulsante <strong>＋ Aggiungi fattura</strong> per iniziare.</div>';
    return;
  }
  list.innerHTML = entries.map(([supplierId,{name,orders}])=>{
    const total = orders.reduce((s,o)=>s+getInvoiceAmount(o),0);
    const rows = orders.slice(0,5).map(o=>{
      const date = o.dateISO||o.invoiceDate||o.date||'—';
      const amount = getInvoiceAmount(o);
      const desc = String(o.description||o.desc||o.note||'—').slice(0,40);
      const statusVal = o.status || 'da-pagare';
      const statusLabel = statusVal === 'pagata' ? '✅ Pagata' : statusVal === 'pagata-parz' ? '⚡ Parz.' : '🔵 Da pagare';
      const statusCls = statusVal === 'pagata' ? 'inv-hist-status--paid' : statusVal === 'pagata-parz' ? 'inv-hist-status--partial' : 'inv-hist-status--due';
      const safePhotoUrl = sanitizeExternalUrl(o.photoUrl);
      const hasInvoiceId = typeof o.id === "string" && o.id.length > 0;
      const viewBtn = safePhotoUrl
        ? `<button class="inv-act-btn" data-photo="${escapeHtmlAttribute(safePhotoUrl)}">👁️ Visualizza</button>`
        : `<a href="supplier.html?supplierId=${encodeURIComponent(supplierId)}" class="inv-act-btn">👁️ Visualizza</a>`;
      const editLink = hasInvoiceId
        ? `<a href="supplier.html?supplierId=${encodeURIComponent(supplierId)}&editInvoiceId=${encodeURIComponent(o.id)}" class="inv-act-btn">✏️ Modifica</a>`
        : `<a href="supplier.html?supplierId=${encodeURIComponent(supplierId)}" class="inv-act-btn">✏️ Modifica</a>`;
      const delBtn = hasInvoiceId
        ? `<button class="inv-act-btn inv-act-del" data-del-inv="${escapeHtmlAttribute(o.id)}" data-del-sup="${escapeHtmlAttribute(supplierId)}">🗑️ Elimina</button>`
        : '';
      return `<div class="inv-hist-row">
        <div class="inv-hist-row-main">
          <span class="inv-hist-date">${date}</span>
          <span class="inv-hist-desc">${desc}</span>
          <span class="inv-hist-amount">${eurFmt(amount)}</span>
          <span class="inv-hist-status ${statusCls}">${statusLabel}</span>
        </div>
        <div class="inv-hist-actions">${viewBtn}${editLink}${delBtn}</div>
      </div>`;
    }).join('');
    const moreCount = orders.length > 5 ? `<div class="inv-hist-more">+ altre ${orders.length-5} fatture → <a href="supplier.html?supplierId=${encodeURIComponent(supplierId)}" class="inv-hist-more-link">Apri scheda fornitore</a></div>` : '';
    return `<div class="inv-hist-card">
      <div class="inv-hist-header">
        <div>
          <div class="inv-hist-name">${name}</div>
          <div class="inv-hist-count">${orders.length} fatture registrate</div>
        </div>
        <div class="inv-hist-header-right">
          <span class="inv-hist-total">${eurFmt(total)}</span>
          <a href="supplier.html?supplierId=${encodeURIComponent(supplierId)}" class="inv-hist-open-link">Apri scheda →</a>
        </div>
      </div>
      ${rows}
      ${moreCount}
    </div>`;
  }).join('');

  list.querySelectorAll('[data-photo]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const safePhotoUrl = sanitizeExternalUrl(btn.dataset.photo);
      if(!safePhotoUrl) return;
      window.open(safePhotoUrl, '_blank', 'noopener,noreferrer');
    });
  });
  list.querySelectorAll('[data-del-inv]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if(!confirm('Eliminare questa fattura?')) return;
      const invId = btn.dataset.delInv;
      const suppId = btn.dataset.delSup;
      btn.disabled = true;
      btn.textContent = '…';
      try{
        const invoicesRef = collection(db,'suppliers',suppId,'invoices');
        await deleteDoc(doc(invoicesRef, invId));
        await loadOrdersHistory();
      }catch(err){
        console.error('Errore eliminazione fattura:', err);
        alert('❌ Errore eliminazione: ' + (err.message || err));
        btn.disabled = false;
        btn.textContent = '🗑️ Elimina';
      }
    });
  });
}

function populateSupplierSelect(){
  const sel = document.getElementById('qoSupplier');
  if(!sel) return;
  sel.innerHTML = '<option value="">— Seleziona fornitore —</option>' +
    Object.entries(ordersHistory).map(([id,{name}])=>`<option value="${id}">${name}</option>`).join('');
}

// Quick order form
const addOrderGlobalBtn = document.getElementById('addOrderGlobalBtn');
const quickOrderForm = document.getElementById('quickOrderForm');
const qoCancelBtn = document.getElementById('qoCancelBtn');
const qoSaveBtn = document.getElementById('qoSaveBtn');
const qoPhotoInput = document.getElementById('qoPhotoInput');

if(addOrderGlobalBtn){
  addOrderGlobalBtn.addEventListener('click',(e)=>{
    e.stopPropagation();
    if(storicoBody) storicoBody.style.display='block';
    if(btnToggleStorico) btnToggleStorico.textContent='▲ Nascondi storico';
    quickOrderForm.style.display = quickOrderForm.style.display==='none' ? 'block' : 'none';
    // set today as default date
    const dateEl = document.getElementById('qoDate');
    if(dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0,10);
  });
}
if(qoCancelBtn){
  qoCancelBtn.addEventListener('click',()=>{
    quickOrderForm.style.display='none';
    document.getElementById('qoSupplier').value='';
    document.getElementById('qoDate').value='';
    document.getElementById('qoAmount').value='';
    document.getElementById('qoDesc').value='';
    document.getElementById('qoPhotoInput').value='';
    document.getElementById('qoPhotoPreview').style.display='none';
    document.getElementById('qoPhotoPlaceholder').style.display='block';
  });
}

if(qoPhotoInput){
  qoPhotoInput.addEventListener('change',()=>{
    const file = qoPhotoInput.files[0];
    if(!file) return;
    const preview = document.getElementById('qoPhotoPreview');
    const placeholder = document.getElementById('qoPhotoPlaceholder');
    const img = document.getElementById('qoPhotoImg');
    const name = document.getElementById('qoPhotoName');
    name.textContent = file.name;
    if(file.type.startsWith('image/')){
      const reader = new FileReader();
      reader.onload = e => { img.src=e.target.result; img.style.display='block'; };
      reader.readAsDataURL(file);
    } else {
      img.style.display='none';
    }
    preview.style.display='block';
    placeholder.style.display='none';
  });
}

if(qoSaveBtn){
  qoSaveBtn.addEventListener('click', async ()=>{
    const supplierId = document.getElementById('qoSupplier').value;
    const dateVal = document.getElementById('qoDate').value;
    const amount = parseFloat(document.getElementById('qoAmount').value||'0');
    const desc = document.getElementById('qoDesc').value.trim();
    if(!supplierId){ alert('Seleziona un fornitore'); return; }
    if(!dateVal){ alert('Inserisci la data'); return; }
    if(!amount || amount<=0){ alert('Inserisci un importo valido'); return; }

    qoSaveBtn.disabled = true;
    qoSaveBtn.textContent = 'Salvataggio…';
    try{
      let photoUrl = null;
      const file = qoPhotoInput ? qoPhotoInput.files[0] : null;
      if(file){
        const ext = file.name.split('.').pop();
        const path = `suppliers/${supplierId}/orders/${Date.now()}.${ext}`;
        const sRef = storageRef(storage, path);
        const snap = await uploadBytes(sRef, file);
        photoUrl = await getDownloadURL(snap.ref);
      }
      await fs.addSubDoc('suppliers', supplierId, 'invoices', {
        dateISO: dateVal,
        description: desc||'Fattura fornitore',
        total: amount,
        totalWithVat: amount,
        invoiceDate: dateVal,
        status: 'da-pagare',
        photoUrl: photoUrl||null,
        createdAt: serverTimestamp()
      });
      alert('✅ Fattura salvata');
      quickOrderForm.style.display='none';
      document.getElementById('qoSupplier').value='';
      document.getElementById('qoDate').value='';
      document.getElementById('qoAmount').value='';
      document.getElementById('qoDesc').value='';
      if(qoPhotoInput) qoPhotoInput.value='';
      document.getElementById('qoPhotoPreview').style.display='none';
      document.getElementById('qoPhotoPlaceholder').style.display='block';
      await loadOrdersHistory();
    }catch(err){
      console.error('qoSave error',err);
      alert('❌ Errore: '+(err.message||err));
    }finally{
      qoSaveBtn.disabled=false;
      qoSaveBtn.textContent='💾 Salva fattura';
    }
  });
}

// ── Toggle Storico Ordini ──────────────────────────────────────────────────
const btnToggleStorico = document.getElementById('btnToggleStorico');
const storicoBody = document.getElementById('storicoBody');
// storicoBody is visible by default; toggle collapses/expands
if(btnToggleStorico && storicoBody){
  btnToggleStorico.addEventListener('click',()=>{
    const isVisible = storicoBody.style.display !== 'none';
    storicoBody.style.display = isVisible ? 'none' : 'block';
    btnToggleStorico.textContent = isVisible ? '▼ Mostra storico' : '▲ Nascondi storico';
  });
}
loadOrdersHistory();
