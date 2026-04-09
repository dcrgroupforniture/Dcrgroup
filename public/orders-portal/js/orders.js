import { fetchClientOrders } from './firebase-portal.js';

function normalizeDate(value){
  if (!value) return '-';
  if (value.seconds) return new Date(value.seconds * 1000).toLocaleDateString('it-IT');
  const d = new Date(value);
  if (!isNaN(d)) return d.toLocaleDateString('it-IT');
  return '-';
}

window.addEventListener('DOMContentLoaded', async () => {
  const client = requireClient();
  if(!client) return;
  const box = document.getElementById('ordersList');
  let orders = [];
  try {
    orders = await fetchClientOrders(client.id);
  } catch {}
  const localLast = JSON.parse(localStorage.getItem('dcr_last_order') || '[]');
  orders.sort((a,b) => {
    const ad = a.createdAt?.seconds || 0, bd = b.createdAt?.seconds || 0;
    return bd - ad;
  });
  if (!orders.length && !localLast.length) {
    box.innerHTML = '<div class="empty card">Ancora nessun ordine.</div>';
    return;
  }
  box.innerHTML = '';
  if(localLast.length){
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="row between"><div><strong>Riordino veloce</strong><div class="small muted">Ultimo ordine salvato sul dispositivo</div></div><button class="btn" id="reorderLast">Riordina</button></div>`;
    box.appendChild(card);
    card.querySelector('#reorderLast').onclick = () => {
      localStorage.setItem('dcr_cart', JSON.stringify(localLast));
      window.location.href = './cart.html';
    };
  }
  orders.forEach(o => {
    const items = Array.isArray(o.items) ? o.items : [];
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="row between">
        <div>
          <strong>Ordine ${o.id.slice(0,8)}</strong>
          <div class="small muted">${normalizeDate(o.createdAt)} · ${o.status || 'new'}</div>
        </div>
        <div class="price">${euro(o.total)}</div>
      </div>
      <div class="small" style="margin:10px 0">${items.slice(0,4).map(i => `${i.name} x${i.quantity}`).join('<br>') || 'Nessun dettaglio righe disponibile'}</div>
      <button class="btn-ghost" data-reorder="${o.id}">Riordina questo ordine</button>`;
    box.appendChild(card);
    card.querySelector('[data-reorder]').onclick = () => {
      localStorage.setItem('dcr_cart', JSON.stringify(items.map(i => ({
        id: i.productId || i.code || i.name,
        code: i.code || '',
        name: i.name,
        brand: i.brand || '',
        price: Number(i.unitPrice || i.price || 0),
        qty: Number(i.quantity || i.qty || 1)
      }))));
      window.location.href = './cart.html';
    };
  });
});
