import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [styles, app, html, tokens, packageJson] = await Promise.all([
  readFile(new URL("../../src/web/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../../src/web/app.js", import.meta.url), "utf8"),
  readFile(new URL("../../src/web/index.html", import.meta.url), "utf8"),
  readFile(new URL("../../src/brand/tokens.css", import.meta.url), "utf8"),
  readFile(new URL("../../package.json", import.meta.url), "utf8")
]);

test("motion timing keeps exits 20 percent shorter than entrances", () => {
  const enter = Number(styles.match(/--fd-motion-enter-duration:\s*(\d+)ms/)?.[1]);
  const exit = Number(styles.match(/--fd-motion-exit-duration:\s*(\d+)ms/)?.[1]);
  assert.equal(enter, 350);
  assert.equal(exit, 280);
  assert.equal(exit / enter, 0.8);
  assert.match(app, /MOTION_STAGGER_MS=30/);
});

test("buttons use the specified pressed scale and reduced motion is respected", () => {
  assert.match(styles, /button:active:not\(:disabled\)\s*\{transform:scale\(\.97\)\}/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /\.account\.is-entering,\.schedule\.is-entering,\.simulation-status\.is-success\{animation:none!important\}/);
});

test("tooltips remain anchored to their trigger and strategy panels crossfade in one stack", () => {
  assert.match(styles, /transform-origin:50% 100%/);
  assert.match(styles, /scale\(\.95\)/);
  assert.match(html, /class="strategy-settings-stack"/);
  assert.match(html, /id="gaml-settings-panel"/);
  assert.match(app, /panel\.inert=true;panel\.setAttribute\("aria-hidden","true"\)/);
  assert.match(app, /duration:MOTION_EXIT_MS/);
  assert.match(app, /duration:MOTION_ENTER_MS/);
  assert.doesNotMatch(app, /\$\("gaml-settings"\)\.hidden=/);
  assert.doesNotMatch(app, /\$\("greedy-settings"\)\.hidden=/);
});

test("success pulse is only applied to successful simulation completion", () => {
  assert.match(app, /status\.classList\.add\("is-complete","is-success"\)/);
  assert.match(app, /status\.classList\.remove\("is-complete","is-success"\)/);
  assert.match(styles, /\.simulation-status\.is-success\{animation:fd-state-confirm/);
});

test("motion changes preserve brand tokens and add no runtime dependency", () => {
  for (const colour of ["#0b0e13", "#10151d", "#131923", "#e8edf5", "#56b4e9", "#55c99a", "#ef7777", "#e9ad58", "#bd93f9"]) {
    assert.ok(tokens.includes(colour), "canonical brand token missing: " + colour);
  }
  const pkg = JSON.parse(packageJson);
  assert.equal(pkg.dependencies?.["framer-motion"], undefined);
  assert.equal(pkg.dependencies?.["motion"], undefined);
});
