import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../../src/web/app.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../../src/web/index.html", import.meta.url), "utf8");

test("web Absolute R+ defaults match the bounded benchmark configuration", () => {
  assert.match(page, /id="beam-width"[^>]*value="96"/);
  assert.match(page, /id="local-branches"[^>]*value="48"/);
  assert.match(page, /id="decision-cap"[^>]*value="5000"/);
  assert.ok(app.includes("x.gaml_settings?.beam_width??96"));
  assert.ok(app.includes('max_local_branches")?(x.gaml_settings.max_local_branches??""):48'));
  assert.ok(app.includes('max_decisions")?(x.gaml_settings.max_decisions??""):5000'));
});

test("explicit null local-branch and decision caps remain uncapped when importing a config", () => {
  assert.ok(app.includes('Object.prototype.hasOwnProperty.call(x.gaml_settings||{},"max_local_branches")'));
  assert.ok(app.includes('Object.prototype.hasOwnProperty.call(x.gaml_settings||{},"max_decisions")'));
});
