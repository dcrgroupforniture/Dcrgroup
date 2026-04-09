window.addEventListener('DOMContentLoaded', () => {
  requireClient();
  const list = document.getElementById('notificationList');
  const sample = [
    {title:'Promo settimanale attiva', text:'Le offerte della settimana sono online.'},
    {title:'Riordino suggerito', text:'Puoi riordinare l’ultimo ordine con 1 click.'},
    {title:'Novità catalogo', text:'Nuovi prodotti in arrivo: aggiorneremo il catalogo presto.'},
  ];
  list.innerHTML = sample.map(n => `<div class="card"><strong>${n.title}</strong><div class="small muted" style="margin-top:6px">${n.text}</div></div>`).join('');
});
