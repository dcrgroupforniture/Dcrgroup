import test from 'node:test';
import assert from 'node:assert/strict';
import { calcOutstanding, sumBy } from './utils.js';

test('Stress: 1000 orders + 1000 incomes compute without crash', () => {
  const orders = Array.from({ length: 1000 }, (_, i) => {
    const total = 50 + (i % 200);
    const deposit = i % 3 === 0 ? total * 0.3 : 0;
    return { id: `o${i}`, total, deposit };
  });

  const incomes = Array.from({ length: 1000 }, (_, i) => ({ id: `i${i}`, amount: (i % 100) + 1 }));

  const outstanding = sumBy(orders, (o) => calcOutstanding(o.total, o.deposit));
  const incTotal = sumBy(incomes, (x) => x.amount);

  assert.ok(outstanding >= 0);
  assert.ok(incTotal > 0);
});
