// NOTA: firebase.js esporta solo `db`. Le funzioni Firestore vanno importate dal
// modulo ufficiale firebase-firestore (SDK modular).
import { db } from './firebase.js';
import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  writeBatch,
  where,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

function normName(s) {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function toDateSafe(v) {
  if (v && typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  if (typeof v === 'number') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function fmtDate(d) {
  if (!d) return '';
  return d.toLocaleDateString('it-IT');
}

function fmtEUR(n) {
  const num = Number(n || 0);
  return num.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

const el = {
  status: document.getElementById('status'),
  summary: document.getElementById('summary'),
  btnScan: document.getElementById('btnScan'),
  btnAuto: document.getElementById('btnAuto'),
  btnShowOrphans: document.getElementById('btnShowOrphans'),
  btnSaveManual: document.getElementById('btnSaveManual'),
  orphansCard: document.getElementById('orphansCard'),
  orphansTbody: document.getElementById('orphansTbody'),
};

let clients = []; // {id, name, nameNorm}
let clientsByNorm = new Map(); // norm -> [client]
let orders = []; // {id, ...data}
let orphanOrders = []; // missing clientId

function log(msg) {
  el.status.textContent = `[${new Date().toLocaleTimeString('it-IT')}] ${msg}`;
}

function setSummary() {
  const totalOrders = orders.length;
  const withClientId = orders.filter(o => !!o.clientId).length;
  const withClientName = orders.filter(o => !!o.clientName).length;
  const orphan = orders.filter(o => !o.clientId).length;

  el.summary.textContent = `clients: ${clients.length} | orders: ${totalOrders} | con clientId: ${withClientId} | con clientName: ${withClientName} | NON collegati: ${orphan}`;
}

async function scanDB() {
  log('Leggo clients…');
  const cSnaps = await getDocs(query(collection(db, 'clients')));
  clients = cSnaps.docs.map(d => ({ id: d.id, ...d.data(), nameNorm: normName(d.data().name) }));

  clientsByNorm = new Map();
  for (const c of clients) {
    const k = c.nameNorm;
    if (!clientsByNorm.has(k)) clientsByNorm.set(k, []);
    clientsByNorm.get(k).push(c);
  }

  log('Leggo orders…');
  const oSnaps = await getDocs(query(collection(db, 'orders')));
  orders = oSnaps.docs.map(d => ({ id: d.id, ...d.data() }));

  orphanOrders = orders.filter(o => !o.clientId);

  setSummary();
  log('Scansione completata.');
}

async function autoLink() {
  if (!orders.length) await scanDB();

  // Auto-link only if an order has clientName and the match is unique.
  const candidates = orders.filter(o => !o.clientId && o.clientName);

  if (!candidates.length) {
    log('Nessun ordine senza clientId ma con clientName.');
    setSummary();
    return;
  }

  log(`Collegamento automatico: ${candidates.length} ordini candidati…`);

  const batch = writeBatch(db);
  let linked = 0;
  let skippedAmbiguous = 0;

  for (const o of candidates) {
    const key = normName(o.clientName);
    const matches = clientsByNorm.get(key) || [];
    if (matches.length === 1) {
      const c = matches[0];
      batch.update(doc(db, 'orders', o.id), {
        clientId: c.id,
        clientName: c.name || o.clientName,
        migratedAt: new Date().toISOString(),
        migratedBy: 'auto-clientName',
      });
      linked++;
    } else {
      skippedAmbiguous++;
    }
  }

  await batch.commit();

  log(`Auto-link completato: collegati ${linked}, saltati (ambigui/non trovati) ${skippedAmbiguous}.`);
  await scanDB();
}

function buildOrphansTable() {
  orphanOrders = orders.filter(o => !o.clientId);

  el.orphansTbody.innerHTML = '';

  if (!orphanOrders.length) {
    el.orphansCard.style.display = 'none';
    el.btnSaveManual.disabled = true;
    log('Nessun ordine non collegato.');
    return;
  }

  el.orphansCard.style.display = 'block';
  el.btnSaveManual.disabled = false;

  for (const o of orphanOrders) {
    const tr = document.createElement('tr');

    const d = toDateSafe(o.createdAt);
    const dateStr = d ? fmtDate(d) : (o.createdAt || '');

    const tdDate = document.createElement('td');
    tdDate.textContent = dateStr;

    const tdTot = document.createElement('td');
    tdTot.textContent = fmtEUR(o.total || 0);

    const tdId = document.createElement('td');
    tdId.innerHTML = `<div class="mono">${o.id}</div>`;

    const tdDet = document.createElement('td');
    const rows = Array.isArray(o.rows) ? o.rows : [];
    if (rows.length) {
      const txt = rows.slice(0, 3).map(r => `${r.product || 'Prodotto'} x${r.qty ?? 1}`).join(' • ');
      tdDet.textContent = txt + (rows.length > 3 ? ' • …' : '');
    } else {
      tdDet.textContent = '—';
    }

    const tdSel = document.createElement('td');
    const sel = document.createElement('select');
    sel.dataset.orderId = o.id;

    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'Seleziona cliente…';
    sel.appendChild(opt0);

    // If order has clientName, preselect best match if unique.
    let pre = '';
    if (o.clientName) {
      const m = clientsByNorm.get(normName(o.clientName)) || [];
      if (m.length === 1) pre = m[0].id;
    }

    for (const c of clients) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name || c.id;
      if (c.id === pre) opt.selected = true;
      sel.appendChild(opt);
    }

    tdSel.appendChild(sel);

    tr.appendChild(tdDate);
    tr.appendChild(tdTot);
    tr.appendChild(tdId);
    tr.appendChild(tdDet);
    tr.appendChild(tdSel);

    el.orphansTbody.appendChild(tr);
  }

  log(`Trovati ${orphanOrders.length} ordini non collegati. Seleziona i clienti e salva.`);
}

async function saveManualLinks() {
  const selects = Array.from(el.orphansTbody.querySelectorAll('select[data-order-id]'));
  const updates = [];

  for (const sel of selects) {
    const orderId = sel.dataset.orderId;
    const clientId = sel.value;
    if (!clientId) continue;

    const client = clients.find(c => c.id === clientId);
    updates.push({ orderId, clientId, clientName: client?.name || '' });
  }

  if (!updates.length) {
    alert('Nessun collegamento selezionato.');
    return;
  }

  log(`Salvo collegamenti manuali: ${updates.length}…`);

  // Firestore batch limit is 500 ops.
  let done = 0;
  while (done < updates.length) {
    const chunk = updates.slice(done, done + 450);
    const batch = writeBatch(db);

    for (const u of chunk) {
      batch.update(doc(db, 'orders', u.orderId), {
        clientId: u.clientId,
        clientName: u.clientName,
        migratedAt: new Date().toISOString(),
        migratedBy: 'manual',
      });
    }

    await batch.commit();
    done += chunk.length;
  }

  log('Collegamenti manuali salvati. Riscansiono…');
  await scanDB();
  buildOrphansTable();
}

el.btnScan.addEventListener('click', scanDB);
el.btnAuto.addEventListener('click', autoLink);
el.btnShowOrphans.addEventListener('click', () => {
  if (!orders.length) {
    scanDB().then(buildOrphansTable);
  } else {
    buildOrphansTable();
  }
});
el.btnSaveManual.addEventListener('click', saveManualLinks);

// Auto start (non invasivo): mostra subito summary se possibile
scanDB().catch((e) => {
  console.error(e);
  log('Errore durante la scansione. Controlla la console.');
});
