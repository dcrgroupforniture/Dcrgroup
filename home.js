import { listOrders } from './services/orderService.js';
import { getYearlyIncomesTotal } from './services/incomeService.js';
import { getIncassiKpis } from './services/kpiService.js';
import { listDeadlines } from './services/deadlineService.js';
import { firestoreService as fs } from './services/firestoreService.js';

const elFatt = document.getElementById('homeFatturato');
const elFattSub = document.getElementById('homeFatturatoSub');
const elInc = document.getElementById('homeIncassi');
const elIncSub = document.getElementById('homeIncassiSub');
const elForn = document.getElementById('homeFornitori');
const elScad = document.getElementById('homeScadenze');

function itMoney(n){
  return new Intl.NumberFormat('it-IT', { style:'currency', currency:'EUR' }).format(Number(n||0));
}

async function loadHomeSummary(){
  const now = new Date();
  const year = now.getFullYear();
  const ym = `${year}-${String(now.getMonth()+1).padStart(2,'0')}`;

  try{
    const orders = await listOrders();
    const total = orders.reduce((s,o)=>s+Number(o.total||0),0);
    if(elFatt) elFatt.textContent = itMoney(total);
    if(elFattSub) elFattSub.textContent = `${orders.length} ordini (totale)`;
  }catch(err){
    console.warn('Home fatturato error', err);
  }

  try{
    const suppliers = await fs.getAll('suppliers');
    const total = suppliers.reduce((s,x)=>s+Number(x.total||0),0);
    if(elForn) elForn.textContent = itMoney(total);
  }catch(err){
    console.warn('Home fornitori error', err);
  }

  try{
    const [incAnno, incassiKpi] = await Promise.all([
      getYearlyIncomesTotal(year),
      getIncassiKpis(),
    ]);
    if(elInc) elInc.textContent = itMoney(incAnno);
    if(elIncSub) elIncSub.textContent = '';
    if(elIncSub) elIncSub.style.display = 'none';
  }catch(err){
    console.warn('Home incassi error', err);
  }

  try{
    const deadlines = await listDeadlines();
    const monthTotal = deadlines.filter((d)=>String(d.dateISO||'').startsWith(ym)).reduce((s,d)=>s+Number(d.amount||0),0);
    if(elScad) elScad.textContent = itMoney(monthTotal);
  }catch(err){
    console.warn('Home scadenze error', err);
  }
}

loadHomeSummary();
