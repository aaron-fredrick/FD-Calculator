import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('web strategy surface excludes the internal Absolute strategy', async () => {
  const plan = await readFile(new URL('../../docs/MIGRATION_PLAN.md', import.meta.url), 'utf8');
  assert.ok(plan.includes('Absolute is an internal verification strategy'));
  assert.ok(plan.includes('- `web/`: GitHub Pages application. Exposes Greedy and GAML only.'));
});
