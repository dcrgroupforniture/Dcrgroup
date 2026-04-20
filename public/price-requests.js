import { listPriceRequests, updatePriceRequest } from './services/priceRequestService.js';
import { euro } from './utils.js';
const state = { rows: [], filter: 'all', q: '' };

function statusClass(status){
  return status === 'completed' ? 'status-completed' : status === 'quoted' ? 'status-quoted' : 'status-pending';
}
function statusLabel(status){
  return status === 'completed' ? 'Chiusa' : status === 'quoted' ? 'Quotata' : 'In attesa';
}
function filteredRows(){
  return state.rows.filter((r) => {
    if (state.filter !== 'all' && r.status !== state.filter) return false;
    const q = state.q.trim().toLowerCase();
    if (!q) return true;
    return [r.clientName, r.clientEmail, r.name, r.brand, r.line, r.category].some((v) => String(v || '').toLowerCase().includes(q));
  });
}
function render(){
  const rows = filteredRows();
  document.getElementById('kpiTotal').textContent = String(state.rows.length);
  document.getElementById('kpiPending').textContent = String(state.rows.filter((r)=>r.status === 'pending').length);
  document.getElementById('kpiDone').textContent = String(state.rows.filter((r)=>r.status !== 'pending').length);
  const el = document.getElementById('requestList');
  if (!rows.length){ el.innerHTML = '<div class="request-card empty">Nessuna richiesta prezzo trovata.</div>'; return; }
  el.innerHTML = rows.map((r) => `
    <article class="request-card">
      <div class="request-head">
        <div>
          <div class="request-title">${r.name || 'Prodotto senza nome'}</div>
          <div class="request-meta">
            <strong>${r.clientName || 'Cliente'}</strong>${r.clientEmail ? ' · ' + r.clientEmail : ''}<br>
            ${[r.brand, r.line, r.category, r.format].filter(Boolean).join(' · ')}<br>
            Listino: ${euro(r.listPrice)} · ${r.createdAtISO ? new Date(r.createdAtISO).toLocaleString('it-IT') : 'data non disponibile'}
          </div>
        </div>
        <span class="status-pill ${statusClass(r.status)}">${statusLabel(r.status)}</span>
      </div>
      <div class="request-actions">
        <button class="btn-pending" data-status="pending" data-id="${r.id}">Segna in attesa</button>
        <button class="btn-quoted" data-status="quoted" data-id="${r.id}">Segna quotata</button>
        <button class="btn-completed" data-status="completed" data-id="${r.id}">Segna chiusa</button>
      </div>
    </article>`).join('');
  document.querySelectorAll('[data-status]').forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      try{
        await updatePriceRequest(btn.dataset.id, { status: btn.dataset.status, updatedAtISO: new Date().toISOString() });
        const row = state.rows.find((r) => r.id === btn.dataset.id);
        if (row) row.status = btn.dataset.status;
        render();
      }catch(err){
        console.error(err);
        alert('Errore aggiornamento richiesta prezzo');
      }finally{ btn.disabled = false; }
    };
  });
}
async function boot(){
  state.rows = await listPriceRequests();
  document.getElementById('searchInput').addEventListener('input', (e) => { state.q = e.target.value; render(); });
  document.getElementById('statusFilter').addEventListener('change', (e) => { state.filter = e.target.value; render(); });
  document.getElementById('quickNav')?.addEventListener('change', (e) => { if (e.target.value) location.href = e.target.value; });
  render();
}
boot().catch((err)=>{ console.error(err); document.getElementById('requestList').innerHTML = '<div class="request-card empty">Errore caricamento richieste prezzo.</div>'; });
