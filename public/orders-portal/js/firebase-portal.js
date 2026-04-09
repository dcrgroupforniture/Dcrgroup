import { auth, db, collection, query, where, getDocs, addDoc, doc, getDoc, getDocs, orderBy, limit, serverTimestamp } from '../../firebase.js';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

export async function loginClient(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const user = cred.user;
  const q = query(collection(db, 'clients'), where('email', '==', email), limit(1));
  const snap = await getDocs(q);
  let client = null;
  if (!snap.empty) {
    client = { id: snap.docs[0].id, ...snap.docs[0].data() };
  } else {
    client = { id: user.uid, email, name: email, companyName: email, portalEnabled: true };
  }
  localStorage.setItem('dcr_client', JSON.stringify({
    id: client.id,
    email: client.email || email,
    name: client.name || client.companyName || email,
    companyName: client.companyName || client.name || email,
    discountPercent: client.discountPercent || 0,
    authUid: user.uid
  }));
  return client;
}

export function watchAuth(onReady) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return onReady(null);
    const local = JSON.parse(localStorage.getItem('dcr_client') || 'null');
    if (local) return onReady(local);
    const q = query(collection(db, 'clients'), where('email', '==', user.email), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const client = { id: snap.docs[0].id, ...snap.docs[0].data(), authUid: user.uid };
      localStorage.setItem('dcr_client', JSON.stringify(client));
      onReady(client);
    } else {
      onReady(null);
    }
  });
}

export async function saveOrder(payload) {
  const ref = await addDoc(collection(db, 'orders'), {
    ...payload,
    source: 'orders-portal',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function fetchClientOrders(clientId) {
  const q = query(collection(db, 'orders'), where('clientId', '==', clientId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchProducts(limitRows = 500) {
  const snap = await getDocs(query(collection(db, 'products'), limit(limitRows)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function signoutClient() {
  localStorage.removeItem('dcr_client');
  await signOut(auth);
}
