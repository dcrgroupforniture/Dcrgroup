// services/deadlineService.js
// Single source of truth for Scadenze.
// SAFE rule: no hard deletes.

import { firestoreService as fs } from "./firestoreService.js";
import { QUERY } from "./queryRegistry.js";
import { normalizeDeadline } from "./schemaService.js";

export async function listDeadlines() {
  const raw = await fs.getAllFromQuery(QUERY.DEADLINES_ALL(), { name: "DEADLINES_ALL" });
  return raw.map(normalizeDeadline).filter((d) => !d.isDeleted);
}

export async function upsertDeadline(dateISO, data) {
  const id = String(dateISO).slice(0, 10);
  return await fs.set("scadenze", id, { ...data, date: id, isDeleted: false }, { merge: true });
}

export async function softDeleteDeadline(dateISO, meta = {}) {
  const id = String(dateISO).slice(0, 10);
  await fs.update("scadenze", id, {
    isDeleted: true,
    deletedAt: fs.serverTimestamp(),
    deleteMeta: meta,
  });
  await fs.add("scadenzeHistory", {
    deadlineId: id,
    action: "SOFT_DELETE",
    at: fs.serverTimestamp(),
    meta,
  });
}
