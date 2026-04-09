
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ================= FIREBASE ================= */

const firebaseConfig = {
  apiKey: "AIzaSyDsS2ZP2HqvDTgUjlwxTLttrcQmuqUKyOY",
  authDomain: "definitivo-dcr-group.firebaseapp.com",
  projectId: "definitivo-dcr-group",
  storageBucket: "definitivo-dcr-group.firebasestorage.app",
  messagingSenderId: "363900943966",
  appId: "1:363900943966:web:0b9f82c97cb37e50a3becf"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ================= PARAMETRI ================= */

const params = new URLSearchParams(window.location.search);
const clientId = params.get("id");

if (!clientId) {
  alert("Cliente non valido");
  window.location.href = "clients.html";
}

/* ================= ELEMENTI DOM ================= */

const firstNameEl = document.getElementById("firstName");
const lastNameEl = document.getElementById("lastName");
const birthDateEl = document.getElementById("birthDate");
const cityEl = document.getElementById("city");
const vatNumberEl = document.getElementById("vatNumber");
const emailEl = document.getElementById("email");
const phoneEl = document.getElementById("phone");
const clientNameTitle = document.querySelector("h1");

const ordersContainer = document.createElement("div");
ordersContainer.id = "ordersContainer";
document.querySelectorAll(".card")[1].appendChild(ordersContainer);

let clientRef;
let clientData;
let orders = [];

/* ================= CARICA CLIENTE ================= */

async function loadClient() {
  clientRef = doc(db, "clients", clientId);
  const snap = await getDoc(clientRef);

  if (!snap.exists()) {
    alert("Cliente non trovato");
    window.location.href = "clients.html";
    return;
  }

  clientData = snap.data();
  orders = clientData.orders || [];

  firstNameEl.textContent = clientData.firstName || "-";
  lastNameEl.textContent = clientData.lastName || "-";
  birthDateEl.textContent = clientData.birthDate || "-";
  cityEl.textContent = clientData.city || "-";
  vatNumberEl.textContent = clientData.vatNumber || "-";
  emailEl.textContent = clientData.email || "-";
  phoneEl.textContent = clientData.phone || "-";

  clientNameTitle.textContent =
    (clientData.firstName || "") + " " + (clientData.lastName || "");

  renderOrders();
}

loadClient();

/* ================= ORDINI ================= */

function renderOrders() {
  ordersContainer.innerHTML = "";

  if (orders.length === 0) {
    ordersContainer.innerHTML = "<p>Nessun ordine presente</p>";
    return;
  }

  orders.forEach((order, index) => {
    ordersContainer.innerHTML += `
      <div class="order-row">
        <span>${order.date} – € ${order.total.toFixed(2)}</span>

        <span class="order-actions">
          <button type="button" onclick="editOrder(${index})">✏️</button>
          <button type="button" onclick="deleteOrder(${index})">🗑️</button>
        </span>
      </div>
    `;
  });
}

async function saveClient() {
  await updateDoc(clientRef, { orders });
}

/* ================= ELIMINA ORDINE ================= */

window.deleteOrder = async function (index) {
  if (!confirm("Vuoi eliminare questo ordine?")) return;

  orders.splice(index, 1);
  await saveClient();
  renderOrders();
};

/* ================= MODIFICA ORDINE ================= */

window.editOrder = async function (index) {
  const order = orders[index];

  const newDate = prompt("Modifica data:", order.date);
  const newTotal = prompt("Modifica importo:", order.total);

  if (!newDate || !newTotal || isNaN(newTotal)) return;

  order.date = newDate;
  order.total = parseFloat(newTotal);

  await saveClient();
  renderOrders();
};
