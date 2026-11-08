import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MOTION_TIMING } from "../../src/web/motion.js";

const [styles, app, html, tokens, packageJson, motionModule] = await Promise.all([
  readFile(new URL("../../src/web/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../../src/web/app.js", import.meta.url), "utf8"),
  readFile(new URL("../../src/web/index.html", import.meta.url), "utf8"),
  readFile(new URL("../../src/brand/tokens.css", import.meta.url), "utf8"),
  readFile(new URL("../../package.json", import.meta.url), "utf8"),
  readFile(new URL("../../src/web/motion.js", import.meta.url), "utf8")
]);

test("motion timing keeps exits 20 percent shorter than entrances", () => {
  const enter = Number(styles.match(/--fd-motion-enter-duration:\s*(\d+)ms/)?.[1]);
  const exit = Number(styles.match(/--fd-motion-exit-duration:\s*(\d+)ms/)?.[1]);
  assert.equal(enter, MOTION_TIMING.enter);
  assert.equal(exit, MOTION_TIMING.exit);
  assert.equal(MOTION_TIMING.exit / MOTION_TIMING.enter, 0.8);
  assert.equal(MOTION_TIMING.stagger, 30);
  assert.match(app, /animateNewRows/);
});

test("buttons use the specified pressed scale and reduced motion is respected", () => {
  assert.match(styles, /button:active:not\(:disabled\)\s*\{transform:scale\(\.97\)\}/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /\.account\.is-entering,\.schedule\.is-entering,\.simulation-status\.is-success\{animation:none!important\}/);
});

test("tooltips remain anchored to their trigger and strategy panels crossfade in one stack", () => {
  assert.match(styles, /transform-origin:50% 100%/);
  assert.match(styles, /scale\(\.95\)/);
  assert.match(styles, /opacity 200ms ease-out/);
  assert.match(styles, /opacity 160ms ease-in/);
  assert.match(html, /class="strategy-settings-stack"/);
  assert.match(html, /id="gaml-settings-panel"/);
  assert.match(motionModule, /panel\.inert = true/);
  assert.match(motionModule, /duration: MOTION_TIMING\.exit/);
  assert.match(motionModule, /duration: MOTION_TIMING\.enter/);
  assert.match(app, /transitionStrategySettings/);
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
