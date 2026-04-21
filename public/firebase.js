// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyD6Kj8vZU9sd2Om9F-yPxU27hE4Qwf46nY",
  authDomain: "dcrgroup-crm-test.firebaseapp.com",
  projectId: "dcrgroup-crm-test",
  storageBucket: "dcrgroup-crm-test.firebasestorage.app",
  messagingSenderId: "978078385169",
  appId: "1:978078385169:web:bfba731d8b50020a0c1db0"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

// Re-export Firestore helpers used across the app.
// (Some pages import them from ./firebase.js for convenience.)
export {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
};
