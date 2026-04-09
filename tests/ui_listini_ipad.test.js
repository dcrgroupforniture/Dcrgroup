import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Listini iPad: uses safe-area inset and topbar offset', () => {
  const css = fs.readFileSync(new URL('../public/listini.css', import.meta.url), 'utf8');
  assert.ok(css.includes('env(safe-area-inset-top)'), 'missing safe-area-inset-top');
  assert.ok(css.includes('padding-bottom: calc(96px + env(safe-area-inset-bottom))'), 'missing bottom safe area padding');
});
