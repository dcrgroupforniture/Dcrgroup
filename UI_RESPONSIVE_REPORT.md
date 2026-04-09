# UI RESPONSIVE REPORT

Target viewport:
- iPad 10.9"
- iPad Pro 12.9"

Vincoli:
- la topbar non deve coprire contenuti
- nessun overflow orizzontale
- padding safe-area sempre considerato

---

## Interventi effettuati

### 1) Topbar SAFE
File: `public/styles.css`
- topbar fixed con altezza: `calc(64px + env(safe-area-inset-top))`
- `padding-top: env(safe-area-inset-top)`

Effetto:
- su iOS/iPadOS la barra browser/notch non taglia header e contenuti.

### 2) Page content offset
Per evitare overlap tra header fisso e contenuto:
- pagina Listini: `public/listini.css`
  - `margin-top: calc(76px + env(safe-area-inset-top))`
  - `padding-bottom: calc(96px + env(safe-area-inset-bottom))`

### 3) Layout uniforme Listini
- adottato stile card coerente con le altre sezioni (bordo/ombra soft, CTA chiara).

---

## Verifica (automatica)
- `tests/ui_listini_ipad.test.js` verifica presenza safe-area inset in CSS.

---

## Note
- Alcune pagine legacy possono avere CSS inline; la topbar comune in `styles.css` è progettata per “forzare” lo stile e ridurre regressioni.

