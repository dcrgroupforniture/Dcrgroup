const PORTAL = {
  businessName: 'DCR GROUP di Luca Di Caro',
  phone: '393337377008',
  displayPhone: '3337377008',
  email: 'luca.dicaro@yahoo.it'
};

function euro(v){
  const n = Number(v || 0);
  return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n);
}
function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return [...root.querySelectorAll(sel)]; }

function getCart(){
  try { return JSON.parse(localStorage.getItem('dcr_cart') || '[]'); } catch { return []; }
}
function setCart(cart){
  localStorage.setItem('dcr_cart', JSON.stringify(cart));
  updateCartBadge();
}
function addToCart(item){
  const cart = getCart();
  const found = cart.find(x => x.id === item.id);
  if (found) found.qty += 1;
  else cart.push({...item, qty:1});
  setCart(cart);
}
function changeQty(id, delta){
  let cart = getCart().map(i => i.id===id ? ({...i, qty: Math.max(1, i.qty + delta)}) : i);
  setCart(cart);
}
function removeFromCart(id){
  setCart(getCart().filter(i => i.id !== id));
}
function cartCount(){ return getCart().reduce((a,b)=>a + Number(b.qty||0),0); }
function cartTotal(){ return getCart().reduce((a,b)=>a + Number(b.price||0) * Number(b.qty||0),0); }
function updateCartBadge(){
  const count = cartCount();
  qsa('[data-cart-count]').forEach(el => el.textContent = count);
}

function logout(){
  localStorage.removeItem('dcr_client');
  window.location.href = './login.html';
}
function getClient(){
  try { return JSON.parse(localStorage.getItem('dcr_client') || 'null'); } catch { return null; }
}
function requireClient(){
  const c = getClient();
  if (!c) {
    window.location.href = './login.html';
    return null;
  }
  return c;
}
updateCartBadge();
