import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
let supplierId = params.get("supplierId") || null;

const supplierNameTitle = document.getElementById("supplierNameTitle");
const nameInput  = document.getElementById("name");
const emailInput = document.getElementById("email");
const phoneInput = document.getElementById("phone");
const cityInput  = document.getElementById("city");
const vatInput  = document.getElementById("vat");

const saveSupplierBtn = document.getElementById("saveSupplier");

const totalYearEl  = document.getElementById("totalYear");
const invoiceList  = document.getElementById("invoiceList");

const addInvoiceBtn    = document.getElementById("addInvoiceBtn");
const invoiceForm      = document.getElementById("invoiceForm");
const saveInvoiceBtn    = document.getElementById("saveInvoiceBtn");
const cancelInvoiceBtn  = document.getElementById("cancelInvoiceBtn");

const invoiceDateInput  = document.getElementById("invoiceDate");
const invoiceAmountInput = document.getElementById("invoiceAmount");

let editingInvoiceId = null;

function eur(n){
  const v = Number(n || 0);
  return v.toFixed(2);
}

function todayISO(){
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

function setInvoiceFormVisible(visible){
  invoiceForm.classList.toggle("hidden", !visible);
}

function requireSupplierSaved(){
  if(!supplierId){
    alert("Prima salva il fornitore, poi puoi aggiungere le fatture.");
    return false;
  }
  return true;
}

async function loadSupplier(){
  if(!supplierId){
    supplierNameTitle.textContent = "Nuovo fornitore";
    return;
  }

  const snap = await getDoc(doc(db, "suppliers", supplierId));
  if(!snap.exists()){
    supplierNameTitle.textContent = "Fornitore";
    return;
  }

  const s = snap.data();
  const name = (s.name || "Fornitore").toString();

  supplierNameTitle.textContent = name.toUpperCase();
  nameInput.value  = s.name  || "";
  emailInput.value = s.email || "";
  phoneInput.value = s.phone || "";
  cityInput.value  = s.city  || "";
  vatInput.value  = s.vat  || "";
}

saveSupplierBtn.addEventListener("click", async () => {
  const data = {
    name:  nameInput.value.trim(),
    email: emailInput.value.trim(),
    phone: phoneInput.value.trim(),
    city:  cityInput.value.trim(),
    vat:  vatInput.value.trim()
  };

  if(!data.name){
    alert("Inserisci nome fornitore");
    return;
  }

  if(supplierId){
    await updateDoc(doc(db, "suppliers", supplierId), data);
    supplierNameTitle.textContent = data.name.toUpperCase();
    alert("Fornitore aggiornato");
  }else{
    // crea nuovo doc e rimanda sulla pagina con id
    const ref = await addDoc(collection(db, "suppliers"), {
      ...data,
      total: 0
    });
    supplierId = ref.id;
    window.location.href = `supplier.html?supplierId=${encodeURIComponent(supplierId)}`;
  }
});

/* ---------- FATTURE ---------- */

addInvoiceBtn.addEventListener("click", () => {
  if(!requireSupplierSaved()) return;

  editingInvoiceId = null;
  invoiceDateInput.value = todayISO();
  invoiceAmountInput.value = "";
  setInvoiceFormVisible(true);
});

cancelInvoiceBtn.addEventListener("click", () => {
  setInvoiceFormVisible(false);
});

saveInvoiceBtn.addEventListener("click", async () => {
  if(!requireSupplierSaved()) return;

  const date = invoiceDateInput.value;
  const amount = Number(invoiceAmountInput.value);

  if(!date || Number.isNaN(amount)){
    alert("Compila data e importo");
    return;
  }

  const ref = collection(db, "suppliers", supplierId, "invoices");

  if(editingInvoiceId){
    await updateDoc(doc(ref, editingInvoiceId), { date, amount });
  }else{
    await addDoc(ref, { date, amount });
  }

  setInvoiceFormVisible(false);
  editingInvoiceId = null;

  await loadInvoices(); // ricarica e aggiorna totale
});

async function loadInvoices(){
  invoiceList.innerHTML = "";

  if(!supplierId){
    totalYearEl.textContent = "0.00";
    return;
  }

  const ref = collection(db, "suppliers", supplierId, "invoices");
  const q = query(ref, orderBy("date", "desc"));
  const snap = await getDocs(q);

  let total = 0;

  snap.forEach((docSnap) => {
    const inv = docSnap.data();
    const id = docSnap.id;

    const amount = Number(inv.amount || 0);
    total += amount;

    const row = document.createElement("div");
    row.className = "invoice-row";
    row.innerHTML = `
      <div class="inv-left">
        <span class="inv-date">${inv.date || ""}</span>
        <span class="inv-amount">€ ${eur(amount)}</span>
      </div>
      <div class="inv-actions">
        <button class="icon-btn edit-btn" title="Modifica">✏️</button>
        <button class="icon-btn delete-btn" title="Elimina">🗑️</button>
      </div>
    `;

    row.querySelector(".edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      editingInvoiceId = id;
      invoiceDateInput.value = inv.date || todayISO();
      invoiceAmountInput.value = Number(inv.amount || 0);
      setInvoiceFormVisible(true);
    });

    row.querySelector(".delete-btn").addEventListener("click", async (e) => {
      e.stopPropagation();
      if(!confirm("Eliminare fattura?")) return;
      await deleteDoc(doc(ref, id));
      await loadInvoices();
    });

    invoiceList.appendChild(row);
  });

  totalYearEl.textContent = eur(total);

  // aggiorna anche il totale sul fornitore (serve per la lista fornitori)
  await updateDoc(doc(db, "suppliers", supplierId), { total });
}

/* Init */
await loadSupplier();
await loadInvoices();