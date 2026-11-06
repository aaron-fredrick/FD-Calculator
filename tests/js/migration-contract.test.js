import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('web strategy surface excludes the internal Absolute strategy', async () => {
  const plan = await readFile(new URL('../../docs/MIGRATION_PLAN.md', import.meta.url), 'utf8');
  assert.ok(plan.includes('Absolute R is an exhaustive internal verification strategy'));
  assert.ok(plan.includes('- `src/web/`: GitHub Pages browser application. Exposes Greedy, GSS and Absolute R+ for scoped date-range simulations.'));
});
