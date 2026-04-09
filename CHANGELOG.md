# CHANGELOG

## vNEXT (build SAFE)

### Data integrity / Firestore
- Introdotti services centralizzati in `public/services/`:
  - `firestoreService`, `schemaService`, `queryRegistry`, `incomeService`, `kpiService`, `orderService`, `expenseService`, `deadlineService`, `clientAnalyticsService`.
- Aggiunta normalizzazione retrocompatibile (date/numeri/campi legacy).
- Implementati **soft delete** per:
  - Spese (`expenses.isDeleted`)
  - Scadenze (`scadenze.isDeleted`)
- Aggiunte collections history append-only:
  - `expensesHistory`, `scadenzeHistory`.

### KPI / Analytics
- KPI incassi centralizzati (funzione unica `getYearlyIncomesTotal(year)`).
- Fix logico incassi fantasma (mai delete DB).
- Calcolo “restante da incassare” normalizzato: `max(0, total - deposit)` solo ordini con acconto.

### Listini / LISAP
- Integrazione Excel LISAP in `public/assets/Lisap_listino_ordine.xlsx`.
- Generato indice ricerca `public/assets/lisap_index.json`.
- Pagina ordine LISAP con quantità persistite e stampa PDF (solo righe qty>0).

### UI / iPad
- Uniformato layout pagina Listini con safe-area inset top/bottom.

### Tests
- Aggiunta cartella `tests/` con:
  - unit: KPI restante
  - unit: rows/totale stampa LISAP
  - integration: clienti↔ordini orfani
  - UI: safe-area listini
  - stress: dataset 1000/1000

