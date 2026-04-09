import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLisapPdfRows } from './utils.js';

test('buildLisapPdfRows: prints only qty>0 and totals correctly', () => {
  const { rows, total } = buildLisapPdfRows([
    { prodotto: 'A', qty: 0, prezzo: 2 },
    { prodotto: 'B', qty: 2, prezzo: 3 },
    { prodotto: 'C', qty: 1, prezzo: 10.5 },
  ]);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.prodotto), ['B', 'C']);
  assert.equal(total, 16.5);
});
