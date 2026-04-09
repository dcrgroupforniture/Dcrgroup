import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const listContainer = document.getElementById("priceListContainer");
const searchInput = document.getElementById("searchInput");

let products = [];

// CARICAMENTO LISTINO
async function loadPriceList() {
  const snap = await getDocs(collection(db, "priceList"));
  products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderList(products);
}

function renderList(data) {
  listContainer.innerHTML = "";

  const grouped = {};

  data.forEach(p => {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  });

  Object.keys(grouped).forEach(category => {
    const title = document.createElement("div");
    title.className = "category-title";
    title.textContent = category;
    listContainer.appendChild(title);

    grouped[category].forEach(p => {
      const row = document.createElement("div");
      row.className = "product-row";

      row.innerHTML = `
        <div class="product-name">${p.name}</div>
        <div class="product-format">${p.format}</div>
        <div class="product-price">€ ${p.price.toFixed(2)}</div>
      `;

      listContainer.appendChild(row);
    });
  });
}

// RICERCA LIVE
searchInput.addEventListener("input", () => {
  const q = searchInput.value.toLowerCase();

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q)
  );

  renderList(filtered);
});

// AVVIO
loadPriceList();
