import { auth, db, collection, query, where, addDoc, limit, serverTimestamp } from '../../firebase.js';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { firestoreService as fs } from '../../services/firestoreService.js';

function _serializeClient(client, authUid) {
  return {
    id: client.id,
    email: client.email || null,
    name: client.name || client.companyName || null,
    companyName: client.companyName || client.name || null,
    discountPercent: client.discountPercent || 0,
    companyId: client.companyId || null,
    authUid,
  };
}

export async function loginClient(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const user = cred.user;
  const q = query(collection(db, 'clients'), where('email', '==', email), limit(1));
  const docs = await fs.getAllFromQuery(q);
  let client = null;
  if (docs.length) {
    client = docs[0];
  } else {
    client = { id: user.uid, email, name: email, companyName: email, portalEnabled: true, companyId: null };
  }
  localStorage.setItem('dcr_client', JSON.stringify(_serializeClient(client, user.uid)));
  return client;
}

export function watchAuth(onReady) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return onReady(null);
    const local = JSON.parse(localStorage.getItem('dcr_client') || 'null');
    if (local) return onReady(local);
    const q = query(collection(db, 'clients'), where('email', '==', user.email), limit(1));
    const docs = await fs.getAllFromQuery(q);
    if (docs.length) {
      const client = _serializeClient(docs[0], user.uid);
      localStorage.setItem('dcr_client', JSON.stringify(client));
      onReady(client);
    } else {
      onReady(null);
    }
  });
}

export async function saveOrder(payload) {
  const profile = JSON.parse(localStorage.getItem('dcr_client') || 'null');
  const companyId = profile?.companyId || null;
  const ref = await addDoc(collection(db, 'orders'), {
    ...payload,
    ...(companyId ? { companyId } : {}),
    source: 'orders-portal',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function fetchClientOrders(clientId) {
  const profile = JSON.parse(localStorage.getItem('dcr_client') || 'null');
  const companyId = profile?.companyId || null;
  const filters = [where('clientId', '==', clientId)];
  if (companyId) filters.push(where('companyId', '==', companyId));
  const q = query(collection(db, 'orders'), ...filters);
  return fs.getAllFromQuery(q);
}

export async function fetchProducts(limitRows = 500) {
  const profile = JSON.parse(localStorage.getItem('dcr_client') || 'null');
  const companyId = profile?.companyId || null;
  const filters = companyId ? [where('companyId', '==', companyId), limit(limitRows)] : [limit(limitRows)];
  const q = query(collection(db, 'products'), ...filters);
  return fs.getAllFromQuery(q);
}

export async function signoutClient() {
  localStorage.removeItem('dcr_client');
  await signOut(auth);
}
