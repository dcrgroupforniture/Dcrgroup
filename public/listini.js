import { db, collection, getDocs, doc, setDoc, deleteDoc, writeBatch, serverTimestamp } from "./firebase.js";

// listini.js (module)
// Global search across listini + cards rendering.

const LISTINI_SOURCES = [
  { name: "LISAP", file: "lisap.html", subtitle: "Prezzo unitario • ordine", indexJson: "assets/lisap_index.json" },
  { name: "DCM DIAPASON", file: "dcm-diapason.html", subtitle: "Prezzo unitario • listino DCM" },
  { name: "ALFAPARF YELLOW", file: "alfaparf-yellow.html", subtitle: "Prezzo unitario • listino Alfaparf" },
  { name: "EUROCOSMETICS DENARO", file: "eurocosmetics-denaro.html", subtitle: "Prezzo • listino Eurocosmetics" },
  { name: "SEI.0", file: "SEI.0.html", subtitle: "Prezzo • 82 articoli" },
  { name: "LE VIE DELLA TERRA", file: "viedellaterra.html", subtitle: "Prezzi (IVA inclusa) • 190 articoli" },
];

const listsGrid = document.getElementById("listsGrid");
const globalSearch = document.getElementById("globalSearch");
const indexBadge = document.getElementById("indexBadge");
const searchResults = document.getElementById("searchResults");
const resultsList = document.getElementById("resultsList");

let GLOBAL_INDEX = []; // { name, priceText, priceValue, listino, file }
let indexReady = false;

function euro(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  if (typeof v === "string") return v;
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(v);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function extractItemsFromHtml(htmlText) {
  const m = htmlText.match(/const\s+ITEMS\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!m) return [];
  const jsonText = m[1];
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    try {
      return JSON.parse(jsonText.replace(/\u00A0/g, " "));
    } catch {
      return [];
    }
  }
}

function pickName(it) {
  const candidates = [it.descrizione, it.prodotto, it.nome, it.articolo, it.titolo, it.description, it.name];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  for (const k in it) {
    if (typeof it[k] === "string" && it[k].trim()) return it[k].trim();
  }
  return "";
}

function pickPrice(it) {
  const candidates = [it.prezzo_unita, it.prezzo, it.price, it.prezzo_unitario, it.importo];
  for (const c of candidates) {
    if (typeof c === "number") return { value: c, text: euro(c) };
    if (typeof c === "string" && c.trim()) {
      const s = c.trim().replace("€", "").replace(/\s/g, "").replace(",", ".");
      const n = Number(s);
      if (!Number.isNaN(n)) return { value: n, text: euro(n) };
      return { value: null, text: c.trim() };
    }
  }
  return { value: null, text: "" };
}

function renderCards() {
  listsGrid.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const l of LISTINI_SOURCES) {
    const a = document.createElement("a");
    a.className = "price-card";
    a.href = l.file;
    a.innerHTML = `
      <div>
        <div class="price-card-title">${escapeHtml(l.name)}</div>
        <div class="price-card-sub">${escapeHtml(l.subtitle || "")}</div>
      </div>
      <div class="price-card-cta" aria-hidden="true"></div>
    `;
    frag.appendChild(a);
  }

  listsGrid.appendChild(frag);
}

async function fetchItemsForSource(src) {
  if (src.indexJson) {
    const res = await fetch(src.indexJson, { cache: "no-cache" });
    const items = await res.json();
    return items || [];
  }

  const res = await fetch(src.file, { cache: "no-cache" });
  const htmlText = await res.text();
  return extractItemsFromHtml(htmlText);
}

async function buildGlobalIndex() {
  GLOBAL_INDEX = [];
  indexReady = false;
  indexBadge.textContent = "Indice: …";

  for (const src of LISTINI_SOURCES) {
    try {
      const items = await fetchItemsForSource(src);
      for (const it of items) {
        const name = pickName(it);
        if (!name) continue;
        const p = pickPrice(it);
        GLOBAL_INDEX.push({
          name,
          priceText: p.text || "",
          priceValue: typeof p.value === "number" ? p.value : null,
          listino: src.name,
          file: src.file,
        });
      }
    } catch {
      // skip silently
    }
  }

  indexReady = true;
  indexBadge.textContent = `Indice: ${GLOBAL_INDEX.length}`;
}

function renderResults(list, q) {
  resultsList.innerHTML = "";

  if (!q || q.length < 2) {
    searchResults.style.display = "none";
    return;
  }

  searchResults.style.display = "block";

  if (list.length === 0) {
    resultsList.innerHTML = `<div style="color:#6b7280;font-size:13px">Nessun prodotto trovato.</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  for (const r of list) {
    const div = document.createElement("div");
    div.className = "search-result";
    div.onclick = () => (location.href = r.file);
    div.innerHTML = `
      <div>
        <div class="search-product">${escapeHtml(r.name)}</div>
        <div class="search-meta">${escapeHtml(r.listino)}</div>
      </div>
      <div class="search-price">${escapeHtml(r.priceText || "")}</div>
    `;
    frag.appendChild(div);
  }
  resultsList.appendChild(frag);
}

function doSearch() {
  const q = globalSearch.value.trim();
  const qLower = q.toLowerCase();

  if (qLower.length < 2) {
    renderResults([], "");
    return;
  }

  if (!indexReady) {
    renderResults([], q);
    return;
  }

  const found = GLOBAL_INDEX.filter((x) => x.name.toLowerCase().includes(qLower)).slice(0, 80);
  renderResults(found, q);
}

renderCards();
globalSearch?.addEventListener("input", doSearch);
buildGlobalIndex();


const storicoOrdiniListini = document.getElementById("storicoOrdiniListini");
let LISAP_HISTORY_CACHE = [];
function isLisapHistoryCandidate(v){
  return !!(v && typeof v === 'object' && v.id && Array.isArray(v.items));
}
function normalizeHistoryArray(arr){
  return (Array.isArray(arr) ? arr : []).filter(isLisapHistoryCandidate);
}
function loadLisapHistoryLocal(){
  const found = [];
  const seen = new Set();
  const keys = ["fabfix:lisap:history:v1", "fabfix:listini:history:v1", "fabfix:lisap:orders:v1", "fabfix:lisap:history:lastEditOrder"];
  for (const key of keys){
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      const arr = normalizeHistoryArray(parsed).length ? normalizeHistoryArray(parsed) : (isLisapHistoryCandidate(parsed) ? [parsed] : []);
      arr.forEach((item)=>{ if(!seen.has(item.id)){ seen.add(item.id); found.push(item); } });
    } catch {}
  }
  try {
    for(let i=0;i<localStorage.length;i++){
      const key = localStorage.key(i) || '';
      if(!/lisap|listini|order/i.test(key) || seen.size > 200) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        const arr = normalizeHistoryArray(parsed).length ? normalizeHistoryArray(parsed) : (isLisapHistoryCandidate(parsed) ? [parsed] : []);
        arr.forEach((item)=>{ if(!seen.has(item.id)){ seen.add(item.id); found.push(item); } });
      } catch {}
    }
  } catch {}
  return found.sort((a,b)=> new Date(b.createdAtISO||0) - new Date(a.createdAtISO||0));
}
async function loadLisapHistory(){
  const found = loadLisapHistoryLocal();
  const seen = new Set(found.map(x=>x.id));
  try {
    const snap = await getDocs(collection(db, 'lisapOrders'));
    snap.forEach((d)=>{
      const item = d.data() || {};
      if(isLisapHistoryCandidate(item) && !seen.has(item.id || d.id)){
        if(!item.id) item.id = d.id;
        found.push(item);
        seen.add(item.id || d.id);
      }
    });
  } catch (e) { console.warn('load lisapOrders', e); }
  const sorted = found.sort((a,b)=> new Date(b.createdAtISO||0) - new Date(a.createdAtISO||0));
  LISAP_HISTORY_CACHE = sorted;
  try { localStorage.setItem("fabfix:lisap:history:v1", JSON.stringify(sorted.slice(0,100))); } catch {}
  return sorted;
}
function saveLisapHistory(v){ localStorage.setItem("fabfix:lisap:history:v1", JSON.stringify(v||[])); LISAP_HISTORY_CACHE = Array.isArray(v)?v:[]; }
function openHistorySummary(orderId){
  const history = LISAP_HISTORY_CACHE;
  const h = history.find(x => x.id === orderId);
  if(!h) return;
  const rows = (h.items || []).map((r, idx)=>`<tr><td>${idx+1}</td><td>${escapeHtml(r.name || "")}</td><td>${Number(r.qty || 0)}</td><td>${escapeHtml(r.priceFmt || euro(r.price))}</td><td>${escapeHtml(r.totalFmt || euro(r.total))}</td></tr>`).join("");
  const html = `<div class="listini-order-summary">
    <div><strong>Data</strong><br>${new Date(h.createdAtISO).toLocaleString('it-IT')}</div>
    <div><strong>Righe</strong><br>${Number((h.items||[]).length)}</div>
    <div><strong>Totale</strong><br>${escapeHtml(h.totalFmt || "")}</div>
  </div>
  <div class="table-wrap"><table class="mini-table"><thead><tr><th>#</th><th>Prodotto</th><th>Qta</th><th>Prezzo</th><th>Totale</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Nessuna riga</td></tr>'}</tbody></table></div>`;
  const old = document.getElementById('listiniHistoryModal'); if(old) old.remove();
  const wrap = document.createElement('div'); wrap.id = 'listiniHistoryModal'; wrap.className = 'clients-modal';
  wrap.innerHTML = `<div class="clients-modal-card"><div class="clients-modal-head"><div class="clients-modal-title">Riepilogo ordine listino</div><button class="clients-modal-close" type="button">✕</button></div><div class="clients-modal-body">${html}</div></div>`;
  document.body.appendChild(wrap); wrap.querySelector('.clients-modal-close')?.addEventListener('click', ()=>wrap.remove()); wrap.addEventListener('click', (e)=>{ if(e.target === wrap) wrap.remove(); });
}
function editHistoryOrder(orderId){
  const history = LISAP_HISTORY_CACHE; const h = history.find(x => x.id === orderId); if(!h) return;
  localStorage.setItem('fabfix:lisap:history:lastEditId', orderId); localStorage.setItem('fabfix:lisap:history:lastEditOrder', JSON.stringify(h)); location.href = 'lisap.html?edit=' + encodeURIComponent(orderId);
}
async function deleteHistoryOrder(orderId){ if(!confirm('Eliminare questo ordine dallo storico listini?')) return; const history = LISAP_HISTORY_CACHE.filter(x => x.id !== orderId); saveLisapHistory(history); try{ await deleteDoc(doc(db,'lisapOrders', orderId)); }catch(e){ console.warn('delete lisap order', e); } await renderHistory();
await renderLisapProductsBank(); }

function aggregateLisapProducts(history){
  const map = new Map();
  (history||[]).forEach((h)=>{
    (h.items||[]).forEach((r)=>{
      const name = String(r.name||'').trim();
      if(!name) return;
      const key = name.toUpperCase().replace(/\s+/g,' ');
      const prev = map.get(key) || { name, qty:0, orders:0, lastPrice:0 };
      prev.qty += Number(r.qty||0);
      prev.orders += 1;
      prev.lastPrice = Number(r.price||prev.lastPrice||0);
      map.set(key, prev);
    });
  });
  return Array.from(map.values()).sort((a,b)=> (b.qty-a.qty) || (b.orders-a.orders) || a.name.localeCompare(b.name));
}
function renderLisapProductsBank(){
  const host = document.getElementById('lisapProductsBank');
  if(!host) return;
  const list = aggregateLisapProducts(LISAP_HISTORY_CACHE);
  if(!list.length){ host.innerHTML = `<div style="color:#6b7280;font-size:13px">Nessun prodotto LISAP registrato.</div>`; return; }
  host.innerHTML = `<div class="table-wrap"><table class="mini-table"><thead><tr><th>#</th><th>Prodotto</th><th>Pezzi</th><th>Ordini</th><th>Ultimo prezzo</th></tr></thead><tbody>${list.slice(0,12).map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(r.name)}</td><td>${r.qty}</td><td>${r.orders}</td><td>${escapeHtml(euro(r.lastPrice||0))}</td></tr>`).join('')}</tbody></table></div>`;
}

async function renderHistory(){
  if(!storicoOrdiniListini) return; const history = await loadLisapHistory();
  if(!history.length){ storicoOrdiniListini.innerHTML = `<div style="color:#6b7280;font-size:13px">Nessun ordine LISAP salvato.</div>`; return; }
  storicoOrdiniListini.innerHTML = history.map((h)=>`<div class="search-result history-row" data-order-id="${h.id}"><div style="flex:1 1 auto;min-width:0;cursor:pointer;" class="history-open"><div class="search-product">Ordine LISAP ${new Date(h.createdAtISO).toLocaleString('it-IT')}</div><div class="search-meta">${h.items.length} righe selezionate</div></div><div class="history-row-actions"><div class="search-price">${h.totalFmt || ''}</div><button type="button" class="history-mini-btn primary js-open-order">Apri</button><button type="button" class="history-mini-btn js-edit-order">Modifica</button><button type="button" class="history-mini-btn danger js-delete-order">Elimina</button></div></div>`).join('');
  storicoOrdiniListini.querySelectorAll('.history-open,.js-open-order').forEach(el=>el.addEventListener('click', (e)=>{ const row = e.target.closest('.history-row'); if(row) openHistorySummary(row.dataset.orderId); }));
  storicoOrdiniListini.querySelectorAll('.js-edit-order').forEach(el=>el.addEventListener('click', (e)=>{ e.stopPropagation(); const row = e.target.closest('.history-row'); if(row) editHistoryOrder(row.dataset.orderId); }));
  storicoOrdiniListini.querySelectorAll('.js-delete-order').forEach(el=>el.addEventListener('click', (e)=>{ e.stopPropagation(); const row = e.target.closest('.history-row'); if(row) deleteHistoryOrder(row.dataset.orderId); }));
}
await renderHistory();
await renderLisapProductsBank();

(async function initLisapStorico(){
  await renderHistory();
  await renderLisapProductsBank();
})();


const CATALOG_IMPORT_SEED_URL = "assets/import-seeds/lisap-import-seed.json";
const catalogFilesInput = document.getElementById("catalogFiles");
const analyzeCatalogBtn = document.getElementById("analyzeCatalogBtn");
const loadLisapDemoBtn = document.getElementById("loadLisapDemoBtn");
const importCatalogBtn = document.getElementById("importCatalogBtn");
const catalogFilesList = document.getElementById("catalogFilesList");
const catalogPreviewSummary = document.getElementById("catalogPreviewSummary");
const catalogPreviewRows = document.getElementById("catalogPreviewRows");
const catalogImportStatus = document.getElementById("catalogImportStatus");
const catalogImportBadge = document.getElementById("catalogImportBadge");
let catalogSeedCache = null;
let catalogImportState = { products: [], files: [] };

function productDocId(product){
  return [product.brand, product.line, product.name, product.format].filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g,'');
}
async function getCatalogSeed(){
  if (catalogSeedCache) return catalogSeedCache;
  const res = await fetch(CATALOG_IMPORT_SEED_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error('Seed LISAP non disponibile');
  catalogSeedCache = await res.json();
  return catalogSeedCache;
}
function parseCsvText(text){
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const row = {};
    headers.forEach((h, idx) => row[h] = (cols[idx] || '').trim());
    return hydrateImportedProduct({
      brand: row.brand || 'LISAP',
      line: row.line || '',
      category: row.category || '',
      name: row.name || '',
      format: row.format || '',
      price: Number(String(row.price || '0').replace(',', '.')) || 0,
      active: String(row.active || 'true').toLowerCase() !== 'false'
    });
  }).filter(r => r.name);
}
function renderCatalogImportState(){
  if (!catalogFilesList || !catalogPreviewRows || !catalogPreviewSummary || !catalogImportBadge) return;
  const files = catalogImportState.files || [];
  const products = catalogImportState.products || [];
  catalogImportBadge.textContent = products.length ? `${products.length} prodotti pronti` : 'Nessun file analizzato';
  catalogFilesList.innerHTML = files.length ? files.map(f => `<div class="catalog-file-item"><div><div class="catalog-file-name">${escapeHtml(f.name)}</div><div class="catalog-file-meta">${escapeHtml(f.note || '')}</div></div><div class="search-price">${f.count || 0}</div></div>`).join('') : '<div style="color:#6b7280;font-size:13px">Nessun file ancora analizzato.</div>';
  const byCategory = {}; const byLine = {};
  products.forEach(p => { byCategory[p.category] = (byCategory[p.category] || 0) + 1; byLine[p.line] = (byLine[p.line] || 0) + 1; });
  const chips = [
    `<span class="catalog-chip">Prodotti: ${products.length}</span>`,
    ...Object.entries(byCategory).slice(0,4).map(([k,v]) => `<span class="catalog-chip">${escapeHtml(k)}: ${v}</span>`),
    ...Object.entries(byLine).slice(0,3).map(([k,v]) => `<span class="catalog-chip">${escapeHtml(k)}: ${v}</span>`)
  ];
  catalogPreviewSummary.innerHTML = chips.join('');
  catalogPreviewRows.innerHTML = products.length ? products.slice(0,12).map((p, idx) => `<tr><td>${idx+1}</td><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.line)}</td><td>${escapeHtml(p.category)}</td><td>${escapeHtml(p.format || '')}</td><td>${escapeHtml(euro(p.price))}</td></tr>`).join('') : '<tr><td colspan="6">Nessuna anteprima.</td></tr>';
  importCatalogBtn.disabled = !products.length;
}
async function analyzeCatalogFiles(){
  const files = Array.from(catalogFilesInput?.files || []);
  if (!files.length){ catalogImportStatus.textContent = 'Seleziona almeno un file.'; return; }
  const seed = await getCatalogSeed();
  let products = [];
  const mappedFiles = [];
  for (const file of files){
    const lower = file.name.toLowerCase();
    if (seed.sources[file.name]){
      const rows = seed.sources[file.name] || [];
      products.push(...rows.map(hydrateImportedProduct));
      mappedFiles.push({ name: file.name, count: rows.length, note: 'Parser dedicato PDF LISAP/Keraplant' });
      continue;
    }
    if (lower.endsWith('.csv')){
      const text = await file.text();
      const rows = parseCsvText(text);
      products.push(...rows.map(hydrateImportedProduct));
      mappedFiles.push({ name: file.name, count: rows.length, note: 'Import CSV generico' });
      continue;
    }
    mappedFiles.push({ name: file.name, count: 0, note: 'Formato non supportato automaticamente in questa build' });
  }
  const uniq = new Map();
  products.forEach(p => { const key = productDocId(p); if (!uniq.has(key)) uniq.set(key, { ...hydrateImportedProduct(p), importKey: key }); });
  catalogImportState = { products: Array.from(uniq.values()), files: mappedFiles };
  catalogImportStatus.textContent = catalogImportState.products.length ? 'Anteprima pronta. Premi “Aggiorna prodotti” per scrivere in Firestore.' : 'Nessun prodotto importabile trovato nei file selezionati.';
  try { localStorage.setItem('fabfix:catalog-import:last-preview', JSON.stringify(catalogImportState).slice(0, 1500000)); } catch {}
  renderCatalogImportState();
}
async function loadLisapDemoCatalog(){
  const seed = await getCatalogSeed();
  catalogImportState = {
    products: (seed.combined || []).map(p => ({ ...hydrateImportedProduct(p), importKey: productDocId(p) })),
    files: Object.entries(seed.sources || {}).map(([name, rows]) => ({ name, count: (rows || []).length, note: 'Demo LISAP 2026 pronta all’import' }))
  };
  catalogImportStatus.textContent = 'Demo LISAP caricata dalla banca dati locale della build. Ora puoi importare i prodotti in Firestore.';
  renderCatalogImportState();
}
async function importCatalogProducts(){
  const products = catalogImportState.products || [];
  if (!products.length) return;
  importCatalogBtn.disabled = true;
  catalogImportStatus.textContent = `Import in corso: ${products.length} prodotti...`;
  let written = 0;
  for (let i = 0; i < products.length; i += 400){
    const chunk = products.slice(i, i + 400);
    const batch = writeBatch(db);
    chunk.forEach((product) => {
      const ref = doc(db, 'products', product.importKey || productDocId(product));
      batch.set(ref, {
        brand: product.brand || 'LISAP',
        line: product.line || '',
        category: product.category || '',
        name: product.name || '',
        format: product.format || '',
        price: Number(product.price || 0),
        imageUrl: product.imageUrl || resolveProductImage(product),
        commercialCategory: product.commercialCategory || resolveCommercialCategory(product),
        bestSeller: product.bestSeller === true,
        active: product.active !== false,
        source: 'catalog-import',
        updatedAt: serverTimestamp()
      }, { merge: true });
    });
    await batch.commit();
    written += chunk.length;
    catalogImportStatus.textContent = `Import in corso: ${written}/${products.length} prodotti aggiornati...`;
  }
  catalogImportStatus.textContent = `Import completato: ${written} prodotti aggiornati in Firestore.`;
  importCatalogBtn.disabled = false;
}
try {
  const rawPreview = localStorage.getItem('fabfix:catalog-import:last-preview');
  if (rawPreview){
    const parsed = JSON.parse(rawPreview);
    if (parsed && Array.isArray(parsed.products)){ catalogImportState = parsed; renderCatalogImportState(); }
  }
} catch {}
loadLisapDemoBtn?.addEventListener('click', loadLisapDemoCatalog);
analyzeCatalogBtn?.addEventListener('click', () => analyzeCatalogFiles().catch((e)=>{ console.error(e); catalogImportStatus.textContent = 'Errore analisi file: ' + (e?.message || e); }));
importCatalogBtn?.addEventListener('click', () => importCatalogProducts().catch((e)=>{ console.error(e); catalogImportStatus.textContent = 'Errore import prodotti: ' + (e?.message || e); importCatalogBtn.disabled = false; }));
