# DATA SCHEMA SNAPSHOT

Snapshot “SAFE” dello schema logico usato dall’app (normalizzato).

Principio:
- **retrocompatibilità**: campi mancanti o formati legacy vengono normalizzati lato app.
- **no data-loss**: nessuna migrazione automatica, nessuna cancellazione hard.

Implementazione:
- `public/services/schemaService.js`

---

## Tipi comuni

### Date
Normalizzazione → `dateISO` (`YYYY-MM-DD`)
Input supportati:
- Firestore Timestamp
- ISO string
- stringhe localizzate
- id documento nel formato `YYYY-MM-DD` (legacy)

### Numeri
Normalizzazione → number finito (`0` se invalido)
Input supportati:
- number
- stringhe con virgola/punto (es. "12,50")

---

## Client (normalizzato)
```js
{
  id: string,
  name: string,
  createdAtISO: string|null
}
```
Fonti campi: `name|nome`, `createdAt|data`.

---

## Order (normalizzato)
```js
{
  id: string,
  clientId: string,
  createdAtISO: string|null,
  total: number,
  deposit: number,
}
```
Fonti campi:
- `clientId`
- `createdAt|data|date`
- `total|totale|importo`
- `deposit|acconto`

---

## Income / Incasso (normalizzato)
```js
{
  id: string,
  dateISO: string|null,
  amount: number,
  note: string,
  source: string,        // "ordine" | "manuale" | legacy
  orderId: string,
  clientId: string,
  clientName: string,
  isDeleted?: boolean
}
```
Compatibilità legacy:
- documenti day-based `incassi/{YYYY-MM-DD}` con `note` multi-riga.
- parsing delle righe per estrarre importo e nome.

---

## Expense / Spesa (normalizzato)
```js
{
  id: string,
  dateISO: string|null,
  amount: number,
  category: string,
  note: string,
  isDeleted: boolean
}
```

---

## Deadline / Scadenza (normalizzato)
```js
{
  id: string,
  dateISO: string|null,
  amount: number,
  note: string,
  isDeleted: boolean
}
```

---

## Soft delete (SAFE)

Politica:
- **mai** `deleteDoc` sui dati di business.
- usare `isDeleted: true` + `deletedAt` + `deleteMeta`.
- opzionale: append-only `*History`.

