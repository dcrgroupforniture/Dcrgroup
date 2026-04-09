import test from 'node:test';
import assert from 'node:assert/strict';
import { joinClientsOrders } from './utils.js';

test('clients↔orders: detects orphans safely', () => {
  const clients = [{ id: 'c1' }, { id: 'c2' }];
  const orders = [
    { id: 'o1', clientId: 'c1' },
    { id: 'o2', clientId: 'missing' },
    { id: 'o3', clientId: '' },
  ];

  const res = joinClientsOrders(clients, orders);
  assert.equal(res.ok, false);
  assert.deepEqual(res.orphans, ['o2']);
});
