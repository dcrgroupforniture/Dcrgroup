DCR GROUP - Build V4 portale ordini integrato a FabFix

Cosa contiene
- public/orders-portal/ con login, home, catalogo, carrello, ordini, profilo, notifiche e statistiche
- catalogo seed importato da 5 file Excel
- integrazione frontend Firebase con public/firebase.js esistente
- regole Firestore aggiornate per accesso clienti al portale
- service worker e manifest per PWA

Catalogo seed importato
- prodotti: 310
- marchi: Alfaparf Yellow, DCM Diapason, Gabri, Hair Potion, SEI.0

Note
- I prodotti seed sono salvati in public/orders-portal/data/catalog.seed.json
- Il portale tenta prima di leggere Firestore collection products; se vuota, usa il seed JSON
- Per il login reale devi creare gli utenti in Firebase Authentication
- Per associare il cliente al portale usa clients/{clientId} con campi consigliati:
  email, companyName, discountPercent, authUid, portalEnabled

Ordini
- Gli ordini vengono salvati nella collection orders
- Ogni ordine contiene items[] con prodotto, quantità, prezzo unitario e totale riga

Notifiche
- Frontend pronto con schermata notifiche
- Back-end notifiche push non completato in questa build: serve configurare Firebase Cloud Messaging e VAPID key

Contatti progetto
- DCR GROUP di Luca Di Caro
- Tel 3337377008
- Email luca.dicaro@yahoo.it
