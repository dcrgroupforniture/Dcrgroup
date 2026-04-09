import { fetchProducts } from './firebase-portal.js';

async function loadSeed(){
  const res = await fetch('../data/catalog.seed.json');
  return await res.json();
}

function renderProducts(list){
  const box = document.getElementById('productList');
  const cart = JSON.parse(localStorage.getItem('dcr_cart') || '[]');
  box.innerHTML = '';
  if(!list.length){
    box.innerHTML = '<div class="empty card">Nessun prodotto trovato.</div>';
    return;
  }
  list.forEach(p => {
    const div = document.createElement('div');
    div.className = 'card product';
    div.innerHTML = `
      <div class="avatar">${(p.brand || 'D').slice(0,2).toUpperCase()}</div>
      <div style="flex:1">
        <h3>${p.name}</h3>
        <p>${p.brand || ''} · ${p.category || 'prodotto'}<br><span class="small">Cod. ${p.code || '-'}</span></p>
        <div class="row between" style="margin-top:10px">
          <div class="price">${euro(p.price)}</div>
          <button class="btn" data-add="${p.id}">Aggiungi</button>
        </div>
      </div>`;
    box.appendChild(div);
  });
  box.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => {
    const p = list.find(x => x.id === btn.dataset.add);
    addToCart({id:p.id,name:p.name,price:Number(p.price),brand:p.brand,code:p.code});
  }));
}

async function init(){
  const client = requireClient();
  if(!client) return;
  let seed = await loadSeed();
  try {
    const products = await fetchProducts(600);
    if (products.length) seed = products;
  } catch {}
  const brandSel = document.getElementById('brand');
  const categorySel = document.getElementById('category');
  const brands = [...new Set(seed.map(p => p.brand).filter(Boolean))].sort();
  const cats = [...new Set(seed.map(p => p.category).filter(Boolean))].sort();
  brandSel.innerHTML = '<option value="">Tutti i marchi</option>' + brands.map(v => `<option>${v}</option>`).join('');
  categorySel.innerHTML = '<option value="">Tutte le categorie</option>' + cats.map(v => `<option>${v}</option>`).join('');
  function apply(){
    const q = (document.getElementById('search').value || '').toLowerCase();
    const b = brandSel.value;
    const c = categorySel.value;
    const list = seed.filter(p => (!b || p.brand===b) && (!c || p.category===c) &&
      (!q || [p.name,p.brand,p.code,p.category].filter(Boolean).join(' ').toLowerCase().includes(q)));
    renderProducts(list);
  }
  document.getElementById('search').addEventListener('input', apply);
  brandSel.addEventListener('change', apply);
  categorySel.addEventListener('change', apply);
  document.getElementById('seedCount').textContent = seed.length;
  renderProducts(seed);
  apply();
}
init();
