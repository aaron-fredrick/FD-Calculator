import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("documentation analytics is consent-gated and shared across every VitePress route", () => {
  const theme = read("docs/.vitepress/theme/index.ts");
  const component = read("docs/.vitepress/theme/components/DocsAnalyticsConsent.vue");
  const privacy = read("src/web/privacy.html");

  assert.match(theme, /DocsAnalyticsConsent/);
  assert.match(theme, /layout-bottom/);
  assert.match(component, /fd-cal:privacy-preferences:v1/);
  assert.match(component, /analytics_storage: 'denied'/);
  assert.match(component, /if \(!allow\) return/);
  assert.match(component, /googletagmanager\.com\/gtm\.js/);
  assert.match(component, /clarity\.ms\/tag/);
  assert.match(component, /page_path: window\.location\.pathname/);
  assert.doesNotMatch(component, /searchTerm|queryText|location\.search/);
  assert.match(component, /clarity-mask/);
  assert.match(privacy, /Documentation pages also use the same optional analytics preference/);
  assert.match(privacy, /Standalone generated reports do not load analytics/);
});

test("small web notices and metric blocks do not render as nested cards", () => {
  const css = read("src/web/styles.css");
  assert.match(css, /Inline notices and KPI values are flat content/);
  assert.match(css, /\.hint,[\s\S]*?\.metric\s*\{\s*border: 0/);
});
