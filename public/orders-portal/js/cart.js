import { saveOrder } from './firebase-portal.js';

function render(){
  const client = requireClient();
  if(!client) return;
  const list = document.getElementById('cartList');
  const cart = getCart();
  if(!cart.length){
    list.innerHTML = '<div class="empty card">Il carrello è vuoto.</div>';
    document.getElementById('cartTotal').textContent = euro(0);
    return;
  }
  list.innerHTML = '';
  cart.forEach(item => {
    const row = document.createElement('div');
    row.className = 'card';
    row.innerHTML = `
      <div class="row between">
        <div>
          <strong>${item.name}</strong>
          <div class="small muted">${item.brand || ''} · Cod. ${item.code || '-'}</div>
          <div class="price" style="margin-top:6px">${euro(item.price * item.qty)}</div>
        </div>
        <div style="text-align:right">
          <div class="qty">
            <button class="qty-btn" data-minus="${item.id}">-</button>
            <span>${item.qty}</span>
            <button class="qty-btn" data-plus="${item.id}">+</button>
          </div>
          <button class="btn-ghost small" style="margin-top:8px" data-remove="${item.id}">Rimuovi</button>
        </div>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-minus]').forEach(b => b.onclick = ()=>{ changeQty(b.dataset.minus,-1); render(); });
  list.querySelectorAll('[data-plus]').forEach(b => b.onclick = ()=>{ changeQty(b.dataset.plus,1); render(); });
  list.querySelectorAll('[data-remove]').forEach(b => b.onclick = ()=>{ removeFromCart(b.dataset.remove); render(); });
  document.getElementById('cartTotal').textContent = euro(cartTotal());
}

async function submitOrder(openWhatsApp = false){
  const client = getClient();
  const cart = getCart();
  if(!client || !cart.length) return;
  const notes = document.getElementById('notes').value || '';
  const orderId = await saveOrder({
    clientId: client.id,
    clientName: client.companyName || client.name || client.email,
    customerEmail: client.email || '',
    status: 'new',
    total: cartTotal(),
    notes,
    items: cart.map(i => ({ productId:i.id, code:i.code || '', name:i.name, brand:i.brand || '', quantity:i.qty, unitPrice:i.price, lineTotal:Number((i.price*i.qty).toFixed(2)) }))
  });
  localStorage.setItem('dcr_last_order', JSON.stringify(cart));
  localStorage.setItem('dcr_cart', '[]');
  if(openWhatsApp){
    const lines = cart.map(i => `- ${i.name} x${i.qty} (${euro(i.price * i.qty)})`).join('%0A');
    const text = `Nuovo ordine DCR GROUP%0ACliente: ${encodeURIComponent(client.companyName || client.name || client.email)}%0AOrdine: ${orderId}%0A${lines}%0ATotale: ${encodeURIComponent(euro(cartTotal()))}%0ANote: ${encodeURIComponent(notes)}`;
    window.location.href = `https://wa.me/${PORTAL.phone}?text=${text}`;
  } else {
    alert('Ordine salvato correttamente.');
    window.location.href = './orders.html';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  requireClient();
  render();
  document.getElementById('btnOrder').onclick = ()=> submitOrder(false);
  document.getElementById('btnWhats').onclick = ()=> submitOrder(true);
});
