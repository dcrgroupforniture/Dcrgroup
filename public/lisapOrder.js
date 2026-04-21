import { db, doc, setDoc } from "./firebase.js";
import { firestoreService as fs } from './services/firestoreService.js';
import { euro, escapeHtml } from './utils.js';

const KEY = "fabfix:lisap:qty:v3";
const HISTORY_KEY = "fabfix:lisap:history:v1";
const PRICE_KEY = "fabfix:lisap:prices:v1";
const MANUAL_KEY = "fabfix:lisap:manualRows:v1";
const $ = (id) => document.getElementById(id);
const els = { q: $("q"), rows: $("rows"), manualRows: $("manualRows"), countPill: $("countPill"), grandTotal: $("grandTotal"), btnPdf: $("btnPdf"), btnPdfFixed: $("btnPdfFixed"), btnReset: $("btnReset"), btnSaveOrder: $("btnSaveOrder"), btnSaveOrderFixed: $("btnSaveOrderFixed"), btnEmailOrder: $("btnEmailOrder"), btnEmailOrderFixed: $("btnEmailOrderFixed"), btnWhatsappOrder: $("btnWhatsappOrder"), btnWhatsappOrderFixed: $("btnWhatsappOrderFixed"), btnAddManualRow: $("btnAddManualRow") };

function loadMap(){ try{return JSON.parse(localStorage.getItem(KEY)||"{}");}catch{return{};} }
function saveMap(m){ localStorage.setItem(KEY, JSON.stringify(m||{})); }
function loadPriceMap(){ try{return JSON.parse(localStorage.getItem(PRICE_KEY)||"{}");}catch{return{};} }
function savePriceMap(m){ localStorage.setItem(PRICE_KEY, JSON.stringify(m||{})); }
function loadHistory(){ try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");}catch{return [];} }
function loadManualRows(){ try{ const v = JSON.parse(localStorage.getItem(MANUAL_KEY)||"[]"); return Array.isArray(v) ? v : []; }catch{return [];} }
function saveManualRows(v){ localStorage.setItem(MANUAL_KEY, JSON.stringify(Array.isArray(v)?v:[])); }
function makeManualRow(){ return { id:`manual:${Date.now()}_${Math.random().toString(36).slice(2,8)}`, name:"", qty:0, price:0 }; }
function sanitizeManualRows(rows){ return (Array.isArray(rows)?rows:[]).map((r)=>({ id:String(r.id||makeManualRow().id), name:String(r.name||''), qty:Math.max(0, Math.floor(Number(r.qty||0))), price:Math.max(0, Number(r.price||0)) })).filter((r)=> r.name.trim() || r.qty>0 || r.price>0); }

function saveHistory(v){ localStorage.setItem(HISTORY_KEY, JSON.stringify(v||[])); }
function toNum(v){ const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function norm(s){ return String(s||'').toLowerCase().trim(); }

function getEffectivePrice(row, priceMap){
  if (row.id === 'special:shipping') return Number(priceMap[row.id] ?? row.price ?? 0);
  return Number(row.price || 0);
}

async function loadItems(){
  const res = await fetch('./assets/lisap_index.json', { cache:'no-store' });
  const rows = await res.json();
  const normalized = rows.map((r, i)=>{
    const line = String(r.line || '').trim();
    let price = Number(r.price || 0);
    if (line.toLowerCase() === 'absolute' && !(price > 0)) price = 2.99;
    return { id: `${r.sheet}:${r.code || i}`, ...r, price, qty:0 };
  });
  const shippingRow = {
    id: 'special:shipping',
    sheet: '',
    code: '',
    line: '',
    name: 'Spedizione',
    volume: '',
    package: '',
    piecesPerPallet: '',
    barcode: '',
    price: 0,
    qty: 0,
    searchText: 'spedizione extra',
  };
  return [shippingRow, ...normalized];
}

function calcTotal(items, map, priceMap, manualRows=[]){
  const itemTotal = items.reduce((s, r)=>s + (Number(map[r.id]||0) * getEffectivePrice(r, priceMap)), 0);
  const manualTotal = (manualRows||[]).reduce((s, r)=> s + (Math.max(0, Number(r.qty||0)) * Math.max(0, Number(r.price||0))), 0);
  return Number((itemTotal + manualTotal).toFixed(2));
}

function buildOrderRows(items, map, priceMap, manualRows=[]){
  const baseRows = items.filter((r)=>Number(map[r.id]||0) > 0).map((r)=>{
    const qty = Number(map[r.id]||0);
    const price = getEffectivePrice(r, priceMap);
    const total = Number((qty * price).toFixed(2));
    return {
      sheet:r.sheet, code:r.code, line:r.line, name:r.name, volume:r.volume,
      package:r.package, piecesPerPallet:r.piecesPerPallet, barcode:r.barcode,
      price, qty, total,
    };
  });
  const extraRows = (manualRows||[]).filter((r)=> String(r.name||"").trim() && Number(r.qty||0) > 0).map((r)=>({
    sheet:"Manuale", code:"", line:"Extra", name:String(r.name||""), volume:"",
    package:"", piecesPerPallet:"", barcode:"",
    price:Math.max(0, Number(r.price||0)), qty:Math.max(0, Number(r.qty||0)), total:Number((Math.max(0, Number(r.qty||0))*Math.max(0, Number(r.price||0))).toFixed(2)),
  }));
  return [...baseRows, ...extraRows];
}

function render(items, map, priceMap, manualRows){
  const q = norm(els.q.value);
  const filtered = q ? items.filter((r)=>norm(r.searchText || [r.name,r.code,r.line,r.volume].join(' ')).includes(q)) : items;
  els.countPill.textContent = `Articoli: ${items.length}`;
  els.rows.innerHTML = filtered.map((r)=>{
    const qty = Number(map[r.id]||0);
    const price = getEffectivePrice(r, priceMap);
    const total = Number((qty * price).toFixed(2));
    const shippingPriceField = r.id === 'special:shipping'
      ? `<input class="price-edit" type="number" min="0" step="0.01" value="${price ? String(price).replace('.', ',') : ''}" placeholder="0,00">`
      : euro(price);
    return `<tr data-id="${escapeHtml(r.id)}">
      <td><div><b>${escapeHtml(r.name || r.code || 'Articolo')}</b></div><div class="lisap-meta">${escapeHtml([r.sheet, r.code, r.line, r.volume].filter(Boolean).join(' • ') || (r.name === 'Spedizione' ? 'Extra' : ''))}</div></td>
      <td>${escapeHtml(r.code || '')}</td>
      <td>${escapeHtml(r.line || '')}</td>
      <td>${escapeHtml(r.volume || '')}</td>
      <td class="right">${shippingPriceField}</td>
      <td class="right">${escapeHtml(String(r.package || ''))}</td>
      <td class="right">${escapeHtml(String(r.piecesPerPallet || ''))}</td>
      <td>${escapeHtml(r.barcode || '')}</td>
      <td class="right"><input class="qty" type="number" min="0" step="1" value="${qty || ''}" placeholder="0"></td>
      <td class="right"><b>${euro(total)}</b></td>
    </tr>`;
  }).join('');

  els.manualRows.innerHTML = (manualRows||[]).map((r, idx)=>{
    const qty = Number(r.qty||0);
    const price = Number(r.price||0);
    const total = Number((qty*price).toFixed(2));
    return `<tr data-manual-id="${escapeHtml(r.id)}" class="manual-row">
      <td><input class="manual-name search-input" type="text" placeholder="Descrizione libera" value="${escapeHtml(r.name||'')}" style="width:100%; min-width:220px;"></td>
      <td colspan="3" style="opacity:.6; font-size:12px;">Riga libera ${idx+1}</td>
      <td class="right"><input class="manual-price qty" type="number" min="0" step="0.01" value="${price || ''}" placeholder="0,00"></td>
      <td class="right" colspan="3"><button type="button" class="btn manual-remove">Elimina</button></td>
      <td class="right"><input class="manual-qty qty" type="number" min="0" step="1" value="${qty || ''}" placeholder="0"></td>
      <td class="right"><b>${euro(total)}</b></td>
    </tr>`;
  }).join('');

  const updateGrandTotal = ()=>{ els.grandTotal.textContent = euro(calcTotal(items, map, priceMap, manualRows)); };

  els.rows.querySelectorAll('tr').forEach((tr)=>{
    const id = tr.dataset.id;
    const input = tr.querySelector('input.qty');
    const priceInput = tr.querySelector('input.price-edit');
    const updateRow = ()=>{
      const qty = Math.max(0, Math.floor(Number(input?.value||0)));
      if(qty > 0) map[id] = qty; else delete map[id];
      if(priceInput){
        const p = Math.max(0, toNum(priceInput.value));
        if (p > 0 || id === 'special:shipping') priceMap[id] = p;
      }
      saveMap(map);
      savePriceMap(priceMap);
      const row = items.find((x)=>x.id === id);
      const total = qty * getEffectivePrice(row || {}, priceMap);
      tr.querySelector('td:last-child b').textContent = euro(total);
      updateGrandTotal();
    };
    input?.addEventListener('input', updateRow);
    priceInput?.addEventListener('input', updateRow);
  });

  els.manualRows.querySelectorAll('tr').forEach((tr)=>{
    const id = tr.dataset.manualId;
    const nameInput = tr.querySelector('.manual-name');
    const qtyInput = tr.querySelector('.manual-qty');
    const priceInput = tr.querySelector('.manual-price');
    const removeBtn = tr.querySelector('.manual-remove');
    const updateRow = ()=>{
      const row = manualRows.find((x)=>x.id===id);
      if(!row) return;
      row.name = String(nameInput?.value||'');
      row.qty = Math.max(0, Math.floor(Number(qtyInput?.value||0)));
      row.price = Math.max(0, toNum(priceInput?.value||0));
      tr.querySelector('td:last-child b').textContent = euro(row.qty * row.price);
      saveManualRows(manualRows);
      updateGrandTotal();
    };
    nameInput?.addEventListener('input', updateRow);
    qtyInput?.addEventListener('input', updateRow);
    priceInput?.addEventListener('input', updateRow);
    removeBtn?.addEventListener('click', ()=>{
      const idx = manualRows.findIndex((x)=>x.id===id);
      if(idx>=0) manualRows.splice(idx,1);
      saveManualRows(manualRows);
      render(items, map, priceMap, manualRows);
    });
  });

  updateGrandTotal();
}
async function recordHistory(rows, total){
  const entry = {
    id: `lisap_${Date.now()}`,
    createdAtISO: new Date().toISOString(),
    total,
    totalFmt: euro(total),
    items: rows.map((r)=>({ ...r, priceFmt:euro(r.price), totalFmt:euro(r.total) })),
  };
  const history = loadHistory();
  history.unshift(entry);
  saveHistory(history.slice(0, 100));
  try{ await fs.set('lisapOrders', entry.id, entry); }catch(e){ console.warn('save lisapOrders', e); }
  return entry;
}

function downloadPdf(items, map, priceMap, manualRows){
  const rows = buildOrderRows(items, map, priceMap, manualRows);
  if(!rows.length) return alert('Nessun prodotto selezionato.');
  const total = calcTotal(items, map, priceMap, manualRows);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  doc.setFontSize(10);
  doc.autoTable({
    startY: 30,
    head: [["Codice","Linea","Prodotto","Vol.","Prezzo","Qta","Totale"]],
    body: rows.map((r)=>[r.code, r.line, r.name, r.volume, euro(r.price), String(r.qty), euro(r.total)]),
    styles:{ fontSize:8, cellPadding:4 },
    columnStyles:{ 4:{halign:'right'},5:{halign:'right'},6:{halign:'right'} },
    margin:{ left:24, right:24 },
  });
  doc.setFontSize(11);
  doc.text(`Totale ordine ${euro(total)}`, 24, doc.lastAutoTable.finalY + 20);
  const name = `lisap_ordine_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(name);
  return recordHistory(rows, total);
}

function makeOrderSummary(rows, total){
  const lines = rows.map((r)=>`${r.name} x${r.qty} - ${euro(r.total)}`);
  return `Ordine LISAP\n\n${lines.join('\n')}\n\nTotale ordine: ${euro(total)}`;
}

async function saveCurrentOrder(items, map, priceMap, manualRows){
  const rows = buildOrderRows(items, map, priceMap, manualRows);
  if(!rows.length) return alert('Nessun prodotto selezionato.');
  const total = calcTotal(items, map, priceMap, manualRows);
  await recordHistory(rows, total);
  alert('Ordine salvato.');
  return { rows, total };
}

function openEmail(rows, total){
  const subject = encodeURIComponent('Ordine LISAP');
  const body = encodeURIComponent(makeOrderSummary(rows, total));
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

function openWhatsapp(rows, total){
  const text = encodeURIComponent(makeOrderSummary(rows, total));
  window.open(`https://wa.me/?text=${text}`, '_blank');
}

async function boot(){
  const items = await loadItems();
  const map = loadMap();
  const priceMap = loadPriceMap();
  const manualRows = loadManualRows();
  if(!manualRows.length) manualRows.push(makeManualRow());

  try{
    const editId = new URLSearchParams(location.search).get('edit') || localStorage.getItem('fabfix:lisap:history:lastEditId');
    const raw = localStorage.getItem('fabfix:lisap:history:lastEditOrder');
    if(editId && raw){
      const h = JSON.parse(raw);
      if(h && h.id === editId && Array.isArray(h.items)){
        Object.keys(map).forEach((k)=>delete map[k]);
        Object.keys(priceMap).forEach((k)=>delete priceMap[k]);
        h.items.forEach((r)=>{
          const match = items.find((it)=> String(it.name||'').trim().toLowerCase() === String(r.name||'').trim().toLowerCase() || String(it.code||'') === String(r.code||''));
          if(match){ map[match.id] = Number(r.qty || 0); if(match.id === 'special:shipping') priceMap[match.id] = Number(r.price || 0); }
          else if(String(r.name||'').trim()){ manualRows.push({ id: makeManualRow().id, name:String(r.name||''), qty:Number(r.qty||0), price:Number(r.price||0) }); }
        });
        saveMap(map); savePriceMap(priceMap); saveManualRows(manualRows); localStorage.removeItem('fabfix:lisap:history:lastEditId'); localStorage.removeItem('fabfix:lisap:history:lastEditOrder');
      }
    }
  }catch(e){ console.warn('edit lisap history load fail', e); }

  render(items, map, priceMap, manualRows);
  els.q?.addEventListener('input', ()=>render(items, map, priceMap, manualRows));
  els.btnAddManualRow?.addEventListener('click', ()=>{ manualRows.push(makeManualRow()); saveManualRows(manualRows); render(items, map, priceMap, manualRows); });
  els.btnReset?.addEventListener('click', ()=>{ if(confirm('Azzerare tutte le quantità?')){ Object.keys(map).forEach((k)=>delete map[k]); manualRows.splice(0, manualRows.length, makeManualRow()); saveMap(map); saveManualRows(manualRows); render(items, map, priceMap, manualRows); } });
  const onPdf = ()=>downloadPdf(items, map, priceMap, manualRows);
  const onSave = ()=>saveCurrentOrder(items, map, priceMap, manualRows);
  const onEmail = ()=>{ const rows = buildOrderRows(items, map, priceMap, manualRows); if(!rows.length) return alert('Nessun prodotto selezionato.'); openEmail(rows, calcTotal(items, map, priceMap, manualRows)); };
  const onWa = ()=>{ const rows = buildOrderRows(items, map, priceMap, manualRows); if(!rows.length) return alert('Nessun prodotto selezionato.'); openWhatsapp(rows, calcTotal(items, map, priceMap, manualRows)); };
  [els.btnPdf, els.btnPdfFixed].forEach(b=>b?.addEventListener('click', onPdf));
  [els.btnSaveOrder, els.btnSaveOrderFixed].forEach(b=>b?.addEventListener('click', onSave));
  [els.btnEmailOrder, els.btnEmailOrderFixed].forEach(b=>b?.addEventListener('click', onEmail));
  [els.btnWhatsappOrder, els.btnWhatsappOrderFixed].forEach(b=>b?.addEventListener('click', onWa));
}

boot().catch((e)=>{ console.error(e); alert('Errore caricamento listino LISAP.'); });
export { buildOrderRows, calcTotal };
