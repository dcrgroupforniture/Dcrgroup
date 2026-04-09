// services/expenseService.js
// Single source of truth for Spese.
// SAFE rule: no hard deletes; use softDeleteExpense.

import { firestoreService as fs } from "./firestoreService.js";
import { QUERY } from "./queryRegistry.js";
import { normalizeExpense } from "./schemaService.js";

export async function listExpenses() {
  const raw = await fs.getAllFromQuery(QUERY.EXPENSES_ALL(), { name: "EXPENSES_ALL" });
  return raw.map(normalizeExpense).filter((e) => !e.isDeleted);
}

export async function listExpensesByDate(dateISO) {
  const q = fs.query(fs.col("expenses"), fs.where("date", "==", dateISO));
  const raw = await fs.getAllFromQuery(q, { name: "EXPENSES_BY_DATE", dateISO });
  return raw.map(normalizeExpense).filter((e) => !e.isDeleted);
}

export async function addExpense(data) {
  return await fs.add("expenses", data);
}

export async function upsertExpense(id, data, { merge = true } = {}) {
  if (!id) throw new Error("Expense id required");
  return await fs.set("expenses", id, data, { merge });
}

// SAFE delete: never remove the document, only mark as deleted.
export async function softDeleteExpense(id, meta = {}) {
  if (!id) throw new Error("Expense id required");
  await fs.update("expenses", id, {
    isDeleted: true,
    deletedAt: fs.serverTimestamp(),
    deleteMeta: meta,
  });

  // Optional history collection (does not affect existing data).
  await fs.add("expensesHistory", {
    expenseId: id,
    action: "SOFT_DELETE",
    at: fs.serverTimestamp(),
    meta,
  });
}
