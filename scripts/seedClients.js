/**
 * Seed clienti Firestore - versione definitiva Windows safe
 * Usa Service Account (NO Firebase CLI)
 */

import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix path per ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path esplicito alla chiave
const keyPath = path.join(__dirname, "serviceAccountKey.json");

// Verifica esistenza file
if (!fs.existsSync(keyPath)) {
  console.error("❌ serviceAccountKey.json NON TROVATO in:", keyPath);
  process.exit(1);
}

// Carica credenziali
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));

// Inizializza Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Lista clienti
const clienti = [
  "MARINO FRANCESCO",
  "DIVI E DIVINE BY ANGELO",
  "DI PASSAFIUME SEFORA",
  "BELLAVIA ELVIRA",
  "TOLEDO MARIA RITA",
  "VODDO GIUSEPPE ALEXANDER",
  "OTTAVIANO VINCENZO",
  "PARRUCCHIERIA GIUSY DI ALLEGRO GIUSEPPA",
  "MAIDA RITA",
  "TERRANOVA MARIA ELENA",
  "CIPOLLA ROSALIA",
  "MULTY DEKOR DI LO CHIANO DANIELE",
  "CARDIZARO GIOVANNA",
  "VITELLO GAETANO",
  "HAIR FASHION DI PALUMBO SALVATORE",
  "PARRUCCHIERIA PIRRELLO MARIA",
  "CATALANO SALVATORE",
  "IMMAGINE DONNA SNC DI TRUISI CARMELA ED ARNONE GIUSEPPA",
  "CONIGLIO NICOLO'",
  "MULE' ROSA MARIA",
  "SPAMPINATO ANTONELLA",
  "MURATORE GIUSEPPE",
  "CILINDRELLO RICCARDO",
  "NICOSIA CARMELA",
  "FALSONE DANIELA",
  "BALISTRERI CALOGERO",
  "SALERNO ANNA TERESA STEFANIA",
  "PECORARO GIACOMINO",
  "HAIR BEAUTY DI RUSSOTTO ELISA",
  "MANTISI ROSA",
  "JONNY S STYLE",
  "YOUNG FASHION DI BONFIGLIO MARIA CARMELA",
  "BARBIERE GIUSEPPE",
  "FALSONE FORMICA MORENA LUCIA",
  "ESTRO' PARRUCCHIERI DI CAMPO DIEGO",
  "ARONGO MARIA GRAZIA",
  "STRAZZERI GIACOMA",
  "SARDONE MATTIA",
  "CASUCCIO ROBERTO",
  "SFERRAZZA CARMELA",
  "PALMERI NUNZIA",
  "DIVINA BEAUTY BIO DI ALESSANDRO FALLITO",
  "PUCCIO PIETRO",
  "IL MIO SOGNO DI MALVE' JESSICA",
  "MILITELLO BRUNELLA",
  "SANFILIPPO VITA",
  "SCOLLO SILVIA",
  "MANGIAPANE GIUSEPPINA",
  "HAIR BEAUTY CENTER DI COLLURA ROSA ANGELA & C. SNC",
  "R & G PARRUCCHIERI SRL",
  "MUNDA MARIA RITA",
  "MARCHICA VINCENZA",
  "DI PIAZZA AGNESE",
  "FARACI CARMELA",
  "LA MARCA LUDOVICO",
  "IACONO SALVATORE",
  "GIARRATANA EUGENIO",
  "DI CARO LUCA",
  "GRECO SALVATORE",
  "CUSUMANO DOMENICA",
  "FRANGIAMORE CONCETTA"
];

async function seed() {
  console.log("🚀 Inserimento clienti in corso...");

  for (const nome of clienti) {
    await db.collection("clients").add({
      name: nome,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      active: true
    });
  }

  console.log("✅ Clienti inseriti correttamente");
  process.exit(0);
}

seed().catch(err => {
  console.error("❌ Errore durante il seed:", err);
  process.exit(1);
});
