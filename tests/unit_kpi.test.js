import test from 'node:test';
import assert from 'node:assert/strict';
import { calcOutstanding } from './utils.js';

test('calcOutstanding: only orders with deposit count, never negative', () => {
  assert.equal(calcOutstanding(100, 0), 0);
  assert.equal(calcOutstanding(100, -10), 0);
  assert.equal(calcOutstanding(100, 30), 70);
  assert.equal(calcOutstanding(100, 130), 0);
  assert.equal(calcOutstanding('200.5', '50.25'), 150.25);
});
