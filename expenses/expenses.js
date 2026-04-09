import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

/* FIREBASE CONFIG */
const firebaseConfig = {
  apiKey: "API_KEY",
  authDomain: "PROJECT_ID.firebaseapp.com",
  projectId: "PROJECT_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* STATE */
let currentDate = new Date();
let expenses = [];
let selectedDate = null;

/* DOM */
const calendar = document.getElementById("calendar");
const currentMonthEl = document.getElementById("currentMonth");
const monthTotalEl = document.getElementById("monthTotal");
const yearTotalEl = document.getElementById("yearTotal");

const modal = document.getElementById("modal");
const modalDate = document.getElementById("modalDate");
const expenseName = document.getElementById("expenseName");
const expenseAmount = document.getElementById("expenseAmount");

/* ======================
   CALENDARIO
====================== */
function renderCalendar() {
  calendar.innerHTML = "";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  currentMonthEl.textContent =
    currentDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1).getDay() || 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 1; i < firstDay; i++) {
    calendar.appendChild(document.createElement("div"));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const cell = document.createElement("div");
    cell.className = "day";

    const totalDay = expenses
      .filter(e => e.date.getDate() === day)
      .reduce((s, e) => s + e.amount, 0);

    cell.innerHTML = `
      <div class="day-number">${day}</div>
      ${totalDay ? `<div class="day-total">€ ${totalDay.toFixed(2)}</div>` : ""}
    `;

    cell.onclick = () => openModal(date);
    calendar.appendChild(cell);
  }

  updateTotals();
}

/* ======================
   TOTALI
====================== */
function updateTotals() {
  const monthTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const yearTotal = expenses.reduce((s, e) => s + e.amount, 0);

  monthTotalEl.textContent = monthTotal.toFixed(2);
  yearTotalEl.textContent = yearTotal.toFixed(2);
}

/* ======================
   FIRESTORE
====================== */
async function loadExpenses() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;

  const q = query(
    collection(db, "expenses"),
    where("year", "==", y),
    where("month", "==", m)
  );

  const snap = await getDocs(q);
  expenses = snap.docs.map(d => ({
    ...d.data(),
    date: d.data().date.toDate()
  }));

  renderCalendar();
}

/* ======================
   MODAL
====================== */
function openModal(date) {
  selectedDate = date;
  modalDate.textContent = date.toLocaleDateString("it-IT");
  expenseName.value = "";
  expenseAmount.value = "";
  modal.classList.remove("hidden");
}

document.getElementById("closeModal").onclick = () =>
  modal.classList.add("hidden");

document.getElementById("saveExpense").onclick = async () => {
  const name = expenseName.value.trim();
  const amount = Number(expenseAmount.value);

  if (!name || !amount) {
    alert("Compila tutti i campi");
    return;
  }

  await addDoc(collection(db, "expenses"), {
    name,
    amount,
    date: selectedDate,
    year: selectedDate.getFullYear(),
    month: selectedDate.getMonth() + 1,
    createdAt: serverTimestamp()
  });

  // 🔔 Salva anche in Agenda
  try{
    await addDoc(collection(db, "agendaEvents"), {
      title: `Spesa: ${name}`,
      start: selectedDate,
      end: selectedDate,
      allDay: true
    });
  }catch(e){ console.warn('agendaEvents add fail (expenses)', e); }

  modal.classList.add("hidden");
  loadExpenses();
};

/* ======================
   NAVIGAZIONE
====================== */
document.getElementById("prevMonth").onclick = () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  loadExpenses();
};

document.getElementById("nextMonth").onclick = () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  loadExpenses();
};

/* INIT */
loadExpenses();
