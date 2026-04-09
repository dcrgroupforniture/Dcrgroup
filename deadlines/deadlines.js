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

/* FIREBASE */
const firebaseConfig = {
  apiKey: "API_KEY",
  authDomain: "PROJECT_ID.firebaseapp.com",
  projectId: "PROJECT_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* STATE */
let currentDate = new Date();
let deadlines = [];
let selectedDate = null;

/* DOM */
const calendar = document.getElementById("calendar");
const currentMonthEl = document.getElementById("currentMonth");
const monthTotalEl = document.getElementById("monthTotal");
const yearTotalEl = document.getElementById("yearTotal");

const modal = document.getElementById("modal");
const modalDate = document.getElementById("modalDate");
const deadlineName = document.getElementById("deadlineName");
const deadlineAmount = document.getElementById("deadlineAmount");

/* ======================
   CALENDAR
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

    const totalDay = deadlines
      .filter(d => d.date.getDate() === day)
      .reduce((s, d) => s + d.amount, 0);

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
   TOTALS
====================== */
function updateTotals() {
  const monthTotal = deadlines.reduce((s, d) => s + d.amount, 0);
  const yearTotal = deadlines.reduce((s, d) => s + d.amount, 0);

  monthTotalEl.textContent = monthTotal.toFixed(2);
  yearTotalEl.textContent = yearTotal.toFixed(2);
}

/* ======================
   FIRESTORE
====================== */
async function loadDeadlines() {
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth() + 1;

  const q = query(
    collection(db, "deadlines"),
    where("year", "==", y),
    where("month", "==", m)
  );

  const snap = await getDocs(q);
  deadlines = snap.docs.map(d => ({
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
  deadlineName.value = "";
  deadlineAmount.value = "";
  modal.classList.remove("hidden");
}

document.getElementById("closeModal").onclick = () =>
  modal.classList.add("hidden");

document.getElementById("saveDeadline").onclick = async () => {
  const name = deadlineName.value;
  const amount = Number(deadlineAmount.value);

  if (!name || !amount) return alert("Compila tutti i campi");

  await addDoc(collection(db, "deadlines"), {
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
      title: `Scadenza: ${name}`,
      start: selectedDate,
      end: selectedDate,
      allDay: true
    });
  }catch(e){ console.warn('agendaEvents add fail (deadlines)', e); }

  modal.classList.add("hidden");
  loadDeadlines();
};

/* ======================
   NAV
====================== */
document.getElementById("prevMonth").onclick = () => {
  currentDate.setMonth(currentDate.getMonth() - 1);
  loadDeadlines();
};

document.getElementById("nextMonth").onclick = () => {
  currentDate.setMonth(currentDate.getMonth() + 1);
  loadDeadlines();
};

/* INIT */
loadDeadlines();
