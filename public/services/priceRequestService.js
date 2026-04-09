import { firestoreService as fs } from './firestoreService.js';
import { QUERY } from './queryRegistry.js';

function normalizeRequest(doc){
  const createdAtRaw = doc?.createdAtISO || doc?.createdAt || doc?.createdAtDate || null;
  let createdAtISO = '';
  try{
    if (createdAtRaw?.toDate) createdAtISO = createdAtRaw.toDate().toISOString();
    else if (typeof createdAtRaw?.seconds === 'number') createdAtISO = new Date(createdAtRaw.seconds * 1000).toISOString();
    else if (createdAtRaw) createdAtISO = new Date(createdAtRaw).toISOString();
  }catch{}
  return {
    id: doc?.id || '',
    clientId: String(doc?.clientId || '').trim(),
    clientName: String(doc?.clientName || '').trim(),
    clientEmail: String(doc?.clientEmail || '').trim(),
    name: String(doc?.name || '').trim(),
    brand: String(doc?.brand || '').trim(),
    line: String(doc?.line || '').trim(),
    category: String(doc?.category || '').trim(),
    format: String(doc?.format || '').trim(),
    listPrice: Number(doc?.listPrice || 0),
    status: String(doc?.status || 'pending').trim().toLowerCase(),
    note: String(doc?.note || '').trim(),
    source: String(doc?.source || '').trim(),
    createdAtISO,
  };
}

export async function listPriceRequests(){
  const raw = await fs.getAllFromQuery(QUERY.PRICE_REQUESTS_ALL(), { name: 'PRICE_REQUESTS_ALL' });
  return raw.map(normalizeRequest).sort((a,b)=> String(b.createdAtISO).localeCompare(String(a.createdAtISO)));
}

export async function updatePriceRequest(id, patch){
  if(!id) throw new Error('priceRequest id required');
  return await fs.update('priceRequests', id, patch);
}
