/**
 * scripts/migrate-to-multitenant.js
 *
 * Migration script: adds `companyId` to all existing Firestore documents.
 * All existing data is assigned to the "default_company" tenant.
 *
 * Usage (requires firebase-admin credentials):
 *   node scripts/migrate-to-multitenant.js --dry-run
 *   node scripts/migrate-to-multitenant.js --apply
 *
 * Env vars:
 *   GOOGLE_APPLICATION_CREDENTIALS  — path to service-account JSON
 *   FIREBASE_PROJECT_ID             — Firebase project ID (optional, read from credentials)
 *   TARGET_COMPANY_ID               — defaults to "default_company"
 */

import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Configuration ──────────────────────────────────────────────────────────

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes("--dry-run") || !ARGS.includes("--apply");
const TARGET_COMPANY_ID = process.env.TARGET_COMPANY_ID || "default_company";
const LOG_FILE = resolve(__dirname, "../tmp/migration-log.json");

// Collections to migrate (top-level).
const TOP_LEVEL_COLLECTIONS = [
  "clients",
  "clienti",
  "orders",
  "incassi",
  "expenses",
  "spese",
  "scadenze",
  "suppliers",
  "payments",
  "fatture",
  "pagamenti",
  "priceRequests",
  "agendaEvents",
  "products",
  "listini",
  "listiniItems",
  "sconti",
  "trattative",
  "offerte",
  "mandanti",
  "budget",
  "crmAttivita",
  "mailingCampaigns",
  "mailingLogs",
  "solleciti",
  "scadenzeFinance",
  "preventivi",
  "users",
];

// Subcollections to migrate (format: "parentCollection/subcollection").
const SUBCOLLECTIONS = [
  "suppliers/invoices",
  "suppliers/orders",
];

const BATCH_SIZE = 400; // Firestore batch limit is 500; use 400 for safety.

// ─── Logging ────────────────────────────────────────────────────────────────

const migrationLog = {
  startedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  targetCompanyId: TARGET_COMPANY_ID,
  collections: {},
  errors: [],
  summary: null,
};

function log(level, msg, meta = {}) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] ${msg}`;
  const extra = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
  console.log(line + extra);
}

function logInfo(msg, meta = {}) { log("INFO", msg, meta); }
function logWarn(msg, meta = {}) { log("WARN", msg, meta); }
function logError(msg, meta = {}) {
  log("ERROR", msg, meta);
  migrationLog.errors.push({ ts: new Date().toISOString(), msg, ...meta });
}

// ─── Firebase init ──────────────────────────────────────────────────────────

function initFirebase() {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath && existsSync(credPath)) {
    const raw = JSON.parse(readFileSync(credPath, "utf8"));
    initializeApp({ credential: cert(raw) });
    logInfo("Firebase initialized with service account credentials.", { credPath });
  } else {
    initializeApp({ credential: applicationDefault() });
    logInfo("Firebase initialized with Application Default Credentials.");
  }
  return getFirestore();
}

// ─── Core migration logic ───────────────────────────────────────────────────

/**
 * Migrate a single top-level collection.
 * Adds `companyId` to all documents that don't already have it.
 */
async function migrateCollection(db, colName) {
  logInfo(`Scanning collection: ${colName}`);
  const colRef = db.collection(colName);
  const snap = await colRef.get();

  if (snap.empty) {
    logInfo(`  → Empty collection, skipping.`, { col: colName });
    migrationLog.collections[colName] = { total: 0, migrated: 0, skipped: 0, errors: 0 };
    return;
  }

  const toMigrate = snap.docs.filter((d) => !d.data().companyId);
  const alreadyMigrated = snap.docs.length - toMigrate.length;

  logInfo(`  → ${snap.docs.length} docs total, ${toMigrate.length} need migration, ${alreadyMigrated} already have companyId.`, { col: colName });

  if (DRY_RUN) {
    migrationLog.collections[colName] = {
      total: snap.docs.length,
      migrated: toMigrate.length,
      skipped: alreadyMigrated,
      errors: 0,
      dryRun: true,
    };
    return;
  }

  let migrated = 0;
  let errors = 0;

  // Process in batches.
  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const chunk = toMigrate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const docSnap of chunk) {
      batch.update(docSnap.ref, {
        companyId: TARGET_COMPANY_ID,
        _migratedAt: Timestamp.now(),
        _migrationVersion: "1.0",
      });
    }

    try {
      await batch.commit();
      migrated += chunk.length;
      logInfo(`  → Committed batch ${i / BATCH_SIZE + 1}: ${chunk.length} docs.`, { col: colName });
    } catch (err) {
      errors += chunk.length;
      logError(`  → Batch failed.`, { col: colName, batchStart: i, error: String(err.message || err) });
    }
  }

  migrationLog.collections[colName] = {
    total: snap.docs.length,
    migrated,
    skipped: alreadyMigrated,
    errors,
  };

  logInfo(`  ✓ Done: ${migrated} migrated, ${alreadyMigrated} skipped, ${errors} errors.`, { col: colName });
}

/**
 * Migrate a subcollection across all parent documents.
 * Format: "parentCollection/subcollection"
 */
async function migrateSubcollection(db, path) {
  const [parentCol, subCol] = path.split("/");
  logInfo(`Scanning subcollection: ${parentCol}/{id}/${subCol}`);

  const parentSnap = await db.collection(parentCol).get();
  if (parentSnap.empty) {
    logInfo(`  → No parent documents found.`, { path });
    return;
  }

  let totalDocs = 0;
  let totalMigrated = 0;
  let totalErrors = 0;

  for (const parentDoc of parentSnap.docs) {
    const subRef = parentDoc.ref.collection(subCol);
    const subSnap = await subRef.get();
    if (subSnap.empty) continue;

    const toMigrate = subSnap.docs.filter((d) => !d.data().companyId);
    totalDocs += subSnap.docs.length;

    if (DRY_RUN) {
      totalMigrated += toMigrate.length;
      continue;
    }

    for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
      const chunk = toMigrate.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const docSnap of chunk) {
        batch.update(docSnap.ref, {
          companyId: TARGET_COMPANY_ID,
          _migratedAt: Timestamp.now(),
          _migrationVersion: "1.0",
        });
      }
      try {
        await batch.commit();
        totalMigrated += chunk.length;
      } catch (err) {
        totalErrors += chunk.length;
        logError(`Subcollection batch failed.`, { path, parentId: parentDoc.id, error: String(err.message || err) });
      }
    }
  }

  migrationLog.collections[`${parentCol}/${subCol}`] = {
    total: totalDocs,
    migrated: totalMigrated,
    errors: totalErrors,
    dryRun: DRY_RUN,
  };

  logInfo(`  ✓ ${parentCol}/${subCol}: ${totalMigrated} migrated, ${totalErrors} errors.`);
}

/**
 * Create the default_company document if it doesn't exist.
 */
async function ensureDefaultCompany(db) {
  const companyRef = db.collection("companies").doc(TARGET_COMPANY_ID);
  const snap = await companyRef.get();

  if (snap.exists) {
    logInfo(`Company document already exists.`, { companyId: TARGET_COMPANY_ID });
    return;
  }

  const companyData = {
    id: TARGET_COMPANY_ID,
    name: "DCR Group",
    createdAt: Timestamp.now(),
    plan: "default",
    active: true,
    _createdByMigration: true,
  };

  if (!DRY_RUN) {
    await companyRef.set(companyData);
    logInfo(`✓ Created company document.`, { companyId: TARGET_COMPANY_ID });
  } else {
    logInfo(`[DRY-RUN] Would create company document.`, { companyId: TARGET_COMPANY_ID });
  }
}

/**
 * Write the migration audit log to tmp/migration-log.json.
 */
function saveMigrationLog() {
  try {
    import("fs").then(({ mkdirSync }) => {
      try {
        mkdirSync(resolve(__dirname, "../tmp"), { recursive: true });
      } catch {}
    });
    writeFileSync(LOG_FILE, JSON.stringify(migrationLog, null, 2), "utf8");
    logInfo(`Migration log saved to: ${LOG_FILE}`);
  } catch (err) {
    logWarn(`Could not save log file: ${err.message}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  logInfo("═══════════════════════════════════════════════════════════");
  logInfo(`FabFix → Multi-Tenant Migration`);
  logInfo(`Mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "APPLY (writes to Firestore)"}`);
  logInfo(`Target company: ${TARGET_COMPANY_ID}`);
  logInfo("═══════════════════════════════════════════════════════════");

  if (DRY_RUN) {
    logWarn("DRY-RUN mode: no data will be modified. Run with --apply to write changes.");
  }

  const db = initFirebase();

  // Step 1: Ensure the default company document exists.
  await ensureDefaultCompany(db);

  // Step 2: Migrate all top-level collections.
  for (const colName of TOP_LEVEL_COLLECTIONS) {
    try {
      await migrateCollection(db, colName);
    } catch (err) {
      logError(`Failed to migrate collection.`, { col: colName, error: String(err.message || err) });
    }
  }

  // Step 3: Migrate subcollections.
  for (const path of SUBCOLLECTIONS) {
    try {
      await migrateSubcollection(db, path);
    } catch (err) {
      logError(`Failed to migrate subcollection.`, { path, error: String(err.message || err) });
    }
  }

  // Step 4: Summary.
  const totalDocs = Object.values(migrationLog.collections).reduce((s, c) => s + (c.total || 0), 0);
  const totalMigrated = Object.values(migrationLog.collections).reduce((s, c) => s + (c.migrated || 0), 0);
  const totalErrors = Object.values(migrationLog.collections).reduce((s, c) => s + (c.errors || 0), 0);

  migrationLog.summary = {
    completedAt: new Date().toISOString(),
    totalDocuments: totalDocs,
    totalMigrated,
    totalErrors,
    errorCount: migrationLog.errors.length,
    dryRun: DRY_RUN,
  };

  logInfo("═══════════════════════════════════════════════════════════");
  logInfo(`MIGRATION COMPLETE`);
  logInfo(`  Total documents scanned: ${totalDocs}`);
  logInfo(`  Documents ${DRY_RUN ? "to migrate" : "migrated"}: ${totalMigrated}`);
  logInfo(`  Errors: ${totalErrors}`);
  logInfo("═══════════════════════════════════════════════════════════");

  if (!DRY_RUN && totalErrors > 0) {
    logWarn("⚠️  Some documents failed to migrate. Check the log file for details.");
    logWarn("    Re-run the script to retry failed batches (already-migrated docs will be skipped).");
  }

  saveMigrationLog();
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  logError("Fatal error during migration.", { error: String(err.message || err) });
  saveMigrationLog();
  process.exit(1);
});
