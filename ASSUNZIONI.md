# ASSUNZIONI (SAFE)

Queste assunzioni sono state applicate scegliendo sempre l’opzione più sicura per stabilità e integrità dati.

---

## Firestore

1) Collection principali (coerenti col codice esistente):
- `clients`, `orders`, `incassi`, `expenses`, `scadenze`, `suppliers`, `payments`, `agendaEvents`.

2) Formati legacy supportati:
- `incassi/{YYYY-MM-DD}` con `note` multi-riga (incassi manuali storici).
- campi importo/total/acconto come number o string con virgola.

3) Relazione clienti↔ordini:
- `orders.clientId` è considerato il link canonico.
- se un ordine legacy non ha `clientId`, l’app lo gestisce come non collegato (senza modifiche automatiche).

---

## Data safety

1) Nessuna cancellazione hard su Firestore per dati business.
- Spese: soft delete con `isDeleted: true`.
- Scadenze: soft delete con `isDeleted: true`.
- Incassi: già previsto/compatibile.

2) History collections append-only (non impattano i dati esistenti):
- `expensesHistory`, `scadenzeHistory`.

---

## KPI

1) KPI incassi derivano da un’unica funzione:
- `getYearlyIncomesTotal(year)`

2) Restante da incassare:
- considerare solo ordini con `deposit > 0`.
- `max(0, total - deposit)`.

---

## LISAP

1) Il file XLSX fornito è la fonte ufficiale:
- `public/assets/Lisap_listino_ordine.xlsx`

2) Per supportare la ricerca globale listini senza duplicare logiche UI:
- è stato generato un indice JSON statico:
  - `public/assets/lisap_index.json`
  - contiene 537 righe estratte dai fogli Pag1–Pag5.

