# FIRESTORE AUDIT REPORT

Progetto: **FabFix Gestionale**
Base: **FabFix_GESTIONALE_v60_V55_SAFE_GHOST_KPI_FIXED**

Obiettivo audit:
- fotografare **struttura dati** e **relazioni**
- individuare query duplicate/incoerenti
- definire regole SAFE (retrocompatibilità, zero data-loss)

> Nota: questo audit è basato su analisi del codice (frontend) e degli adapter di normalizzazione introdotti nei services. Non viene eseguita alcuna migrazione o modifica automatica ai dati.

---

## Collections identificate

### 1) `clients`
Documento (osservato / atteso):
- `name` / `nome` (string)
- `createdAt` / `data` (Timestamp | ISO string)
- campi vari legacy (non bloccanti)

Uso:
- anagrafica clienti
- relazione ordini via `orders.clientId`

---

### 2) `orders`
Documento (osservato / atteso):
- `clientId` (string) **OBBLIGATORIO per nuova logica**
- `total` / `totale` (number)
- `deposit` / `acconto` (number)
- `createdAt` / `data` / `date` (Timestamp | ISO string)
- campi righe/descrizioni (legacy)

Relazione:
- `orders.clientId` → `clients.id`

---

### 3) `incassi`
Documento (osservato / atteso):
- `date` / `data` / `createdAt` (Timestamp | ISO string) **oppure** legacy day-doc
- `amount` / `importo` (number)
- `orderId` (string, opzionale)
- `clientId` (string, opzionale)
- `clientName` / `cliente` (string, opzionale)
- `note` (string, opzionale)
- `source` ("ordine" | "manuale" | legacy)
- `isDeleted` (boolean, nuovo: soft delete)

**Formato legacy rilevato (compatibilità):**
- documenti con id `YYYY-MM-DD` che contengono note multi-riga (incassi manuali storici)

---

### 4) `expenses`
Documento (osservato / atteso):
- `date` (YYYY-MM-DD)
- `amount` (number)
- `note` (string)
- `category` (string, opzionale)
- `isDeleted` (boolean, nuovo: soft delete)

---

### 5) `scadenze`
Documento (osservato / atteso):
- `date` (YYYY-MM-DD)
- `amount` (number)
- `note` (string)
- `isDeleted` (boolean, nuovo: soft delete)

---

### 6) `suppliers` (+ subcollection `suppliers/{id}/invoices`)
- gestione fornitori e fatture

### 7) `payments`
- pagamenti (usati in alcune pagine)

### 8) `agendaEvents`
- eventi agenda (compresi promemoria/incassi)

### Collections storiche (append-only)
- `incassiHistory`
- `expensesHistory` (nuova, safe)
- `scadenzeHistory` (nuova, safe)

---

## Relazione clienti ↔ ordini

Regola applicata:
- `orders.clientId` deve puntare a un `clients.id` valido.
- in caso di `clientId` mancante/rotto (legacy) la UI **non cancella nulla** e tratta l’ordine come “non collegato” (safe).

Test automatico (node test):
- rilevazione orfani senza modifiche ai dati (vedi `tests/integration_clients_orders.test.js`).

---

## Query audit (duplicate/incoerenti)

### Situazione pre-refactor (rilevata nel codice di partenza)
- molte pagine importavano direttamente `firebase-firestore` e costruivano query localmente.
- KPI simili (incassi mese/anno) venivano calcolati con logiche diverse (es. parse note legacy in una pagina sì, in un’altra no).

### Azione SAFE applicata
Introdotto registro unico query:
- `public/services/queryRegistry.js`

Regola:
- **nessuna pagina dovrebbe importare `firebase-firestore` direttamente**.
- i KPI derivano da un’unica fonte (`incomeService` + `kpiService`).

---

## Rischi dati & mitigazioni (SAFE)

### Rischio: incassi “fantasma” / duplicati
Mitigazione:
- filtro applicativo in `incomeService` (mai delete Firestore)
- esclusione di incassi non collegati a ordini inesistenti
- esclusione del caso noto (MAIDA 350€ 2026-03-06) solo a livello logico

### Rischio: cancellazioni accidentali
Mitigazione:
- introdotti soft delete per:
  - `expenses` (`isDeleted: true`)
  - `scadenze` (`isDeleted: true`)
  - (già previsto per incassi)
- aggiunte collections History append-only per tracciamento

---

## Output correlati
- `DATA_SCHEMA_SNAPSHOT.md`
- `KPI_VALIDATION_REPORT.md`
