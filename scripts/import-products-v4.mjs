import fs from 'fs';
import path from 'path';

const file = path.resolve('public/orders-portal/data/catalog.seed.json');
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(`Prodotti seed disponibili: ${rows.length}`);
console.log('Questo script è un promemoria: per l’import reale usa Admin SDK / Firestore batch.');
