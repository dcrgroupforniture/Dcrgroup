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
  apiKey: "AIzaSyDsS2ZP2HqvDTgUjlwxTLttrcQmuqUKyOY",
  authDomain: "definitivo-dcr-group.firebaseapp.com",
  projectId: "definitivo-dcr-group",
  storageBucket: "definitivo-dcr-group.firebasestorage.app",
  messagingSenderId: "363900943966",
  appId: "1:363900943966:web:0b9f82c97cb37e50a3becf"
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
