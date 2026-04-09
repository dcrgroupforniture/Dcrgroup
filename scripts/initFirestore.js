/**
 * Script di inizializzazione Firestore
 * Eseguire con: node scripts/initFirestore.js
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

initializeApp({
  credential: applicationDefault()
});

const db = getFirestore();

async function init() {
  console.log("🚀 Inizializzazione Firestore...");

  // =========================
  // SETTINGS GLOBALI
  // =========================
  await db.collection("settings").doc("global").set({
    appName: "Gestionale Online",
    theme: "default",
    backupEnabled: true,
    lastBackup: null
  });

  // =========================
  // PRODOTTO DI ESEMPIO
  // =========================
  await db.collection("products").add({
    name: "Prodotto Demo",
    description: "Prodotto iniziale di esempio",
    price: 99.99,
    stock: 100,
    active: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });

  // =========================
  // CLIENTE DI ESEMPIO
  // =========================
  await db.collection("clients").add({
    name: "Cliente Demo",
    email: "cliente@demo.it",
    phone: "+39 000000000",
    address: "Via Demo 1",
    vatNumber: "IT00000000000",
    notes: "",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: "system"
  });

  console.log("✅ Firestore inizializzato correttamente");
}

init().catch(console.error);
