import { fetchClientOrders } from './firebase-portal.js';
window.addEventListener('DOMContentLoaded', async () => {
  const client = requireClient();
  if(!client) return;
  let orders = [];
  try { orders = await fetchClientOrders(client.id); } catch {}
  const total = orders.reduce((a,o)=>a+Number(o.total||0),0);
  const avg = orders.length ? total / orders.length : 0;
  document.getElementById('statOrders').textContent = orders.length;
  document.getElementById('statTotal').textContent = euro(total);
  document.getElementById('statAvg').textContent = euro(avg);
  document.getElementById('statLast').textContent = orders[0]?.createdAt?.seconds ? new Date(orders[0].createdAt.seconds*1000).toLocaleDateString('it-IT') : '-';
});
