import { listExpenses } from "./services/expenseService.js";

const daysList = document.getElementById("daysList");
const monthTotalEl = document.getElementById("monthTotal");
const yearTotalEl = document.getElementById("yearTotal");

const today = new Date();
const year = today.getFullYear();
const month = today.getMonth();

function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

function isoKey(d) {
  const x = new Date(d);
  return x.toISOString().split("T")[0];
}

async function loadDays() {
  const expenses = await listExpenses();

  const totalsByDay = {};
  let monthTotal = 0;
  let yearTotal = 0;

  for (const e of expenses) {
    const dISO = e.dateISO;
    if (!dISO) continue;
    totalsByDay[dISO] = (totalsByDay[dISO] || 0) + (e.amount || 0);

    const d = new Date(dISO + "T00:00:00");
    if (d.getFullYear() === year) {
      yearTotal += e.amount || 0;
      if (d.getMonth() === month) monthTotal += e.amount || 0;
    }
  }

  daysList.innerHTML = "";

  const totalDays = daysInMonth(year, month);

  for (let i = 1; i <= totalDays; i++) {
    const date = new Date(year, month, i);
    const key = isoKey(date);

    const total = totalsByDay[key] || 0;

    const row = document.createElement("div");
    row.className = "supplier-row";

    row.innerHTML = `
      <span>${date.toLocaleDateString("it-IT")}</span>
      <strong>€ ${total.toFixed(2)}</strong>
    `;

    row.onclick = () => {
      window.location.href = `spesa.html?date=${key}`;
    };

    daysList.appendChild(row);
  }

  monthTotalEl.textContent = monthTotal.toFixed(2);
  yearTotalEl.textContent = yearTotal.toFixed(2);
}

loadDays();
