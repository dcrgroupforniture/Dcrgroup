// ==========================
// 🔥 Firebase v9 – Nuovo Ordine
// ==========================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ==========================
// Firebase config
// ==========================
const firebaseConfig = {
  apiKey: "AIzaSyDSS2ZPHqVDTgUjwXTLttrcQmuQkUyOY",
  authDomain: "definitivo-dcr-group.firebaseapp.com",
  projectId: "definitivo-dcr-group",
  storageBucket: "definitivo-dcr-group.appspot.com",
  messagingSenderId: "363909493966",
  appId: "1:363909493966:web:0b9f82c97cb37e50a3becf"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================
// Recupera cliente
// ==========================
const params = new URLSearchParams(window.location.search);
const clientId = params.get("clientId");
const clientName = params.get("clientName");

if (!clientId) {
  alert("Cliente non valido");
  history.back();
}

// ==========================
// DOM
// ==========================
const orderBody = document.getElementById("orderBody");
const addRowBtn = document.getElementById("addRowBtn");
const saveOrderBtn = document.getElementById("saveOrderBtn");
const orderTotalEl = document.getElementById("orderTotal");

// ==========================
// Aggiungi riga
// ==========================
function addRow() {
  const tr = document.createElement("tr");

  tr.innerHTML = `
    <td><input type="text" class="product"></td>
    <td><input type="number" class="qty" value="1" min="1"></td>
    <td><input type="number" class="price" value="0" step="0.01"></td>
    <td class="subtotal">0.00</td>
    <td><button class="danger-btn">✕</button></td>
  `;

  tr.querySelector(".danger-btn").onclick = () => {
    tr.remove();
    updateTotal();
  };

  tr.querySelectorAll("input").forEach(i =>
    i.addEventListener("input", updateTotal)
  );

  orderBody.appendChild(tr);
}

// ==========================
// Totali
// ==========================
function updateTotal() {
  let total = 0;

  orderBody.querySelectorAll("tr").forEach(row => {
    const qty = +row.querySelector(".qty").value || 0;
    const price = +row.querySelector(".price").value || 0;
    const subtotal = qty * price;
    row.querySelector(".subtotal").textContent = subtotal.toFixed(2);
    total += subtotal;
  });

  orderTotalEl.textContent = `Totale: € ${total.toFixed(2)}`;
}

// ==========================
// Salva ordine
// ==========================
saveOrderBtn.onclick = async () => {
  const items = [];

  orderBody.querySelectorAll("tr").forEach(row => {
    items.push({
      product: row.querySelector(".product").value,
      quantity: +row.querySelector(".qty").value,
      price: +row.querySelector(".price").value,
      subtotal: +row.querySelector(".subtotal").textContent
    });
  });

  if (items.length === 0) {
    alert("Aggiungi almeno una riga");
    return;
  }

  const now = new Date();

  await addDoc(collection(db, "orders"), {
    clientId,
    clientName: clientName || "",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    items,
    total: items.reduce((s, i) => s + i.subtotal, 0),
    createdAt: serverTimestamp()
  });

  alert("Ordine salvato");
  history.back();
};

// ==========================
// Avvio
// ==========================
addRowBtn.onclick = addRow;
addRow();
