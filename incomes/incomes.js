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
let incomes = [];
let selectedDate = null;

/* DOM */
const calendar = document.getElementById("calendar");
const currentMonthEl = document.getElementById("currentMonth");
const monthTotalEl = document.getElementById("monthTotal");
const yearTotalEl = document.getElementById("yearTotal");

const modal = document.getElementById("modal");
const modalDate = document.getElementById("modalDate");
const incomeName = document.getElementById("incomeName");
const incomeAmount = document.getElementById("incomeAmount");

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

    const totalDay = incomes
      .filter(i => i.date.getDate() === day)
      .reduce((s, i) => s + i.amount, 0);

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
  const monthTotal = incomes.reduce((s, i) => s + i.amount, 0);
  const yearTotal = incomes.reduce((s, i) => s + i.amount, 0);

  monthTotalEl.textContent = monthTotal.toFixed(2);
  yearTotalEl.textContent = yearTotal.toFixed(2);
}

/* ======================
   FIRESTORE
====================== */
async function loadIncomes() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;

  const q = query(
    collection(db, "incomes"),
    where("year", "==", y),
    where("month", "==", m)
  );

  const snap = await getDocs(q);
  incomes = snap.docs.map(d => ({
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
  incomeName.value = "";
  incomeAmount.value = "";
  modal.classList.remove("hidden");
}

document.getElementById("closeModal").onclick = () =>
  modal.classList.add("hidden");

document.getElementById("saveIncome").onclick = async () => {
  const name = incomeName.value.trim();
  const amount = Number(incomeAmount.value);

  if (!name || !amount) {
    alert("Compila tutti i campi");
    return;
  }

  await addDoc(collection(db, "incomes"), {
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
      title: `Incasso: ${name}`,
      start: selectedDate,
      end: selectedDate,
      allDay: true
    });
  }catch(e){ console.warn('agendaEvents add fail (incomes)', e); }

  modal.classList.add("hidden");
  loadIncomes();
};

/* ======================
   NAVIGAZIONE
====================== */
document.getElementById("prevMonth").onclick = () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  loadIncomes();
};

document.getElementById("nextMonth").onclick = () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  loadIncomes();
};

/* INIT */
loadIncomes();
