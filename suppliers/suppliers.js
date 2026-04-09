import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* FIREBASE */
const firebaseConfig = {
  apiKey: "API_KEY",
  authDomain: "PROJECT_ID.firebaseapp.com",
  projectId: "PROJECT_ID",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const supplierList = document.getElementById("supplierList");
const addSupplierBtn = document.getElementById("addSupplierBtn");

/* DEFAULT SUPPLIERS */
const defaultSuppliers = ["AZZARA", "POKER", "DENARO"];

async function loadSuppliers() {
  supplierList.innerHTML = "";
  const snap = await getDocs(collection(db, "suppliers"));

  snap.forEach(doc => {
    const s = doc.data();
    const card = document.createElement("div");
    card.className = "supplier-card";

    card.innerHTML = `
      <h2>${s.name}</h2>
      <div class="totals">
        <span>Anno: € ${s.totalYear || 0}</span>
        <span>Mese: € ${s.totalMonth || 0}</span>
      </div>
    `;

    card.onclick = () => {
      window.location.href = `supplier-order.html?supplierId=${doc.id}`;
    };

    supplierList.appendChild(card);
  });
}

addSupplierBtn.onclick = async () => {
  const name = prompt("Nome fornitore");
  if (!name) return;

  await addDoc(collection(db, "suppliers"), {
    name,
    totalMonth: 0,
    totalYear: 0
  });

  loadSuppliers();
};

/* INIT */
(async () => {
  const snap = await getDocs(collection(db, "suppliers"));
  if (snap.empty) {
    for (const name of defaultSuppliers) {
      await addDoc(collection(db, "suppliers"), {
        name,
        totalMonth: 0,
        totalYear: 0
      });
    }
  }
  loadSuppliers();
})();
