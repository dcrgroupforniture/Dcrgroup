window.addEventListener('DOMContentLoaded', async () => {
  const client = requireClient();
  if(!client) return;
  const helloName = document.getElementById('helloName');
  const discountPill = document.getElementById('discountPill');
  if(helloName) helloName.textContent = client.companyName || client.name || 'Cliente';
  if(discountPill) discountPill.textContent = `${client.discountPercent || 0}%`;

  const seed = await fetch('./data/catalog.seed.json').then(r => r.json()).catch(() => []);
  const lastOrder = JSON.parse(localStorage.getItem('dcr_last_order') || '[]');
  const favorites = lastOrder.length ? lastOrder : seed.slice(6,10).map(p => ({ id:p.id, name:p.name, price:p.price, brand:p.brand, qty:1 }));

  const weekly = seed.slice(0,2);
  const daily = seed.slice(2,5);
  const catalogBuckets = [];
  const byBrand = new Map();
  seed.forEach(p => {
    const k = String(p.brand || 'Catalogo').trim();
    byBrand.set(k, (byBrand.get(k)||0)+1);
  });
  [...byBrand.entries()].slice(0,4).forEach(([brand,count]) => catalogBuckets.push({ brand, count }));

  const renderOfferCards = (id, arr) => {
    const box = document.getElementById(id);
    if(!box) return;
    box.innerHTML = '';
    if(!arr.length){ box.innerHTML = '<div class="empty">Nessuna offerta disponibile.</div>'; return; }
    arr.forEach((p,idx) => {
      const old = Number(p.price || 0) * 1.18;
      const card = document.createElement('div');
      card.className = 'offer-card';
      card.innerHTML = `
        <div class="offer-thumb">${p.brand || 'DCR'}<br>${p.name}</div>
        <div class="offer-brand">${p.brand || 'Catalogo'}</div>
        <div class="offer-name">${p.name}</div>
        <div class="offer-row"><span class="offer-old">${euro(old)}</span><span class="offer-price">${euro(p.price || 0)}</span></div>`;
      card.onclick = () => { addToCart({id:p.id || `${id}-${idx}`, name:p.name, brand:p.brand || '', code:p.code || '', price:Number(p.price||0)}); };
      box.appendChild(card);
    });
  };

  const renderProducts = (id, arr, buttonLabel='Aggiungi') => {
    const box = document.getElementById(id);
    if(!box) return;
    box.innerHTML = '';
    if(!arr.length){ box.innerHTML = '<div class="empty">Nessun prodotto disponibile.</div>'; return; }
    arr.forEach((p,idx) => {
      const row = document.createElement('div');
      row.className = 'card product';
      row.innerHTML = `
        <div class="avatar">${(p.brand || 'D').slice(0,2).toUpperCase()}</div>
        <div style="flex:1">
          <h3>${p.name}</h3>
          <p>${p.brand || 'Catalogo DCR GROUP'}</p>
          <div class="row between" style="margin-top:10px">
            <div class="price">${euro(p.price || 0)}</div>
            <button class="btn" data-add="${idx}">${buttonLabel}</button>
          </div>
        </div>`;
      row.querySelector('[data-add]').onclick = () => addToCart({id:p.id || `${id}-${idx}`, name:p.name, brand:p.brand || '', code:p.code || '', price:Number(p.price || 0)});
      box.appendChild(row);
    });
  };

  const catalogGrid = document.getElementById('catalogGrid');
  if(catalogGrid){
    catalogGrid.innerHTML = '';
    catalogBuckets.forEach((b) => {
      const el = document.createElement('a');
      el.href = './pages/catalog.html';
      el.className = 'catalog-card';
      el.innerHTML = `<div class="catalog-thumb">${b.brand}</div><div class="catalog-body"><div class="catalog-title">${b.brand}</div><div class="catalog-sub">Catalogo professionale</div><div class="catalog-footer"><span class="chip-count">${b.count} prodotti</span></div></div>`;
      catalogGrid.appendChild(el);
    });
  }

  const reorderList = document.getElementById('reorderList');
  const reorderBtn = document.getElementById('reorderBtn');
  const reorderSource = lastOrder.length ? lastOrder : favorites.slice(0,3);
  if(reorderList){
    reorderList.innerHTML = reorderSource.map(x => `<li>${x.name} x ${x.qty || 1}</li>`).join('') || '<li>Nessun ordine recente.</li>';
  }
  if(reorderBtn){
    reorderBtn.onclick = () => {
      reorderSource.forEach((x,idx) => addToCart({id:x.id || `reorder-${idx}`, name:x.name, brand:x.brand || '', code:x.code || '', price:Number(x.price || 0)}));
      window.location.href = './pages/cart.html';
    };
  }

  renderOfferCards('weeklyList', weekly);
  renderProducts('dailyList', daily, 'Aggiungi');
  renderProducts('favList', favorites.map((x,i)=>({...x,id:x.id||`fav-${i}`})), 'Aggiungi');
});