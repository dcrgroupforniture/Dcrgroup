
function autoAmountFromNote(note){
  const s = String(note || "").trim();
  if(!s) return null;

  // Try: take a math expression at the end of the note (e.g. "Mario 10+5*2")
  const m = s.match(/([0-9][0-9\s.,+\-*/()]*?)\s*$/);
  if(m){
    let expr = m[1].replace(/\s+/g,"").replace(/,/g,".");
    // keep only safe chars
    if(/^[0-9.+\-*/()]+$/.test(expr)){
      try{
        // eslint-disable-next-line no-new-func
        const val = Function(`"use strict"; return (${expr});`)();
        if(Number.isFinite(val)) return Math.round(val*100)/100;
      }catch(e){}
    }
  }

  // Fallback: sum all numbers found in the text
  const nums = s.match(/\d+(?:[.,]\d+)?/g);
  if(!nums) return null;
  const sum = nums.reduce((acc, x) => {
    const n = Number(String(x).replace(",","."));
    return Number.isFinite(n) ? acc + n : acc;
  }, 0);
  if(!Number.isFinite(sum)) return null;
  return Math.round(sum*100)/100;
}

import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { firestoreService as fs } from "./services/firestoreService.js";

const params = new URLSearchParams(window.location.search);
const date = params.get("date");

const dayTitle = document.getElementById("dayTitle");
const noteInput = document.getElementById("note");
const amountInput = document.getElementById("amount");
const saveBtn = document.getElementById("savePayment");
const paymentsList = document.getElementById("paymentsList");
const dayTotalEl = document.getElementById("dayTotal");

const d = new Date(date);
dayTitle.textContent = d.toLocaleDateString("it-IT", {
  day: "2-digit",
  month: "long",
  year: "numeric"
});

let editId = null;

/* =========================
   CARICA PAGAMENTI
========================= */

async function loadPayments() {
  paymentsList.innerHTML = "";
  let total = 0;

  const all = await fs.getAllByCompany("payments");
  const items = all.filter(p => p.date === date);

  items.forEach(p => {
    const id = p.id;

    total += Number(p.amount) || 0;

    const row = document.createElement("div");
    row.className = "supplier-row";

    row.innerHTML = `
      <span class="supplier-name">${p.note}</span>
      <span class="supplier-total">€ ${Number(p.amount).toFixed(2)}</span>
      <div>
        <button class="small-btn edit-btn">✏️</button>
        <button class="small-btn delete-btn">🗑️</button>
      </div>
    `;

    // MODIFICA
    row.querySelector(".edit-btn").onclick = () => {
      noteInput.value = p.note;
      amountInput.value = p.amount;
      editId = id;
      saveBtn.textContent = "Salva modifica";
    };

    // ELIMINA
    row.querySelector(".delete-btn").onclick = async () => {
      if (!confirm("Eliminare questo pagamento?")) return;
      await fs.remove("payments", id);
      loadPayments();
    };

    paymentsList.appendChild(row);
  });

  dayTotalEl.textContent = total.toFixed(2);
}

/* =========================
   SALVA / MODIFICA
========================= */

saveBtn.onclick = async () => {
  const note = noteInput.value.trim();
  const amount = parseFloat(amountInput.value);

  if (!note || !amount) {
    alert("Compila nota e importo");
    return;
  }

  // MODIFICA
  if (editId) {
    await fs.update("payments", editId, { note, amount });

    editId = null;
    saveBtn.textContent = "Salva pagamento";
  }

  // NUOVO
  else {
    await fs.add("payments", { date, note, amount });
  }

  noteInput.value = "";
  amountInput.value = "";

  loadPayments();
};

loadPayments();
