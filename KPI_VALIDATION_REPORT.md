# KPI VALIDATION REPORT

Obiettivo:
- evitare KPI incoerenti tra Home / Incassi / Dashboard
- garantire **un’unica fonte dati** e **formule uniche**

Implementazione:
- `public/services/incomeService.js`
- `public/services/kpiService.js`

---

## Single Source of Truth

### Incassi
Tutti i KPI incassi derivano da:
- `getNormalizedIncomesAndOrders()`
- `getYearlyIncomesTotal(year)` **(funzione centrale obbligatoria)**

Pagine che devono usare la stessa logica:
- Home
- Pagina Incassi
- Dashboard / calendari

---

## Formule validate

### Incassato oggi
Somma `income.amount` per `income.dateISO == todayISO`.

### Incassato mese
Somma `income.amount` per `YYYY-MM` corrente.

### Incassato anno
Somma `income.amount` per `YYYY` corrente.

### Fatturato mese
Somma `order.total` per ordini nel mese corrente (da `orders` normalizzati).

### Restante da incassare (grafico + KPI)
Formula per singolo ordine:
- `restante = max(0, total - deposit)`
Regole:
- considerare **solo** ordini con `deposit > 0`
- mai valori negativi

### Media incasso (ultimi 30 giorni)
- media = (somma incassi ultimi 30 giorni) / (numero giorni considerati)

---

## Gestione “incassi fantasma” (SAFE)

Vincoli:
- non cancellare mai dati su Firestore

Strategia:
- filtro logico applicativo:
  1) scarta incassi con importo invalido/0
  2) scarta incassi con `orderId` non più esistente
  3) scarta caso noto (MAIDA 350€ 2026-03-06) solo lato UI

Effetto:
- KPI coerenti
- storico preservato

---

## Test automatici

- `tests/unit_kpi.test.js`: valida restante mai negativo e solo ordini con acconto
- `tests/stress_1000_dataset.test.js`: calcoli su 1000 ordini/incassi senza crash

