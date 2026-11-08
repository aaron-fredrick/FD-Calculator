import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REPORT_BRAND_TOKENS } from "../../src/brand/report-tokens.js";
import { REPORT_CSS } from "../../src/reporting/template.js";
import { generateHtmlReport } from "../../src/reporting/html.js";
import { SimResult } from "../../src/core/results.js";

test("embedded report brand tokens exactly match canonical tokens.css", () => {
  const source = readFileSync(new URL("../../src/brand/tokens.css", import.meta.url), "utf8");
  const canonicalRoot = source.match(/:root\s*\{[\s\S]*?\}/)?.[0];
  assert.ok(canonicalRoot);
  assert.equal(REPORT_BRAND_TOKENS, canonicalRoot);
  assert.ok(REPORT_CSS.startsWith(REPORT_BRAND_TOKENS));
  assert.match(REPORT_CSS, /--fd-font-sans/);
  assert.match(REPORT_CSS, /--fd-radius-card/);
});

test("generated HTML report has no external runtime resource dependencies", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  const end = new Date("2026-01-31T00:00:00.000Z");
  const result = new SimResult({
    strategy_name: "Test", timeline: {}, bookings: [], total_principal: 0,
    end_date: end, accounts: {}, total_transfer_fees: 0, valid: true,
    ait_enabled: false, ait_rate: 0.1
  });
  result.start_date = start;
  const config = {
    start, end, accounts: [], consolidation_account_id: null,
    compound: false, actual_leap_year: true, ait_enabled: false, ait_rate: 0.1,
    fee_config: { default_inter_bank_fee: 30, same_bank_fee: 0 },
    inflow_summaries: [], outflow_summaries: [], bank_registry: {},
    report_generated_at: "2026-11-08T12:00:00.000Z", catalogue_fingerprint: "a".repeat(64)
  };
  const html = generateHtmlReport(result, config);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=\s*["']https?:|@import\s+url\s*\(\s*["']?https?:|url\s*\(\s*["']?https?:/i);
  assert.match(html, /--fd-color-bg:\s*#0b0e13/);
  assert.match(html, /<script id="fd-report-data" type="application\/json">/);
  assert.match(html, /Report generated/);
  assert.ok(html.includes("2026-11-08 12:00:00.000 UTC"));
  assert.ok(html.includes("a".repeat(64)));
  assert.ok(html.includes("this file may contain account labels, balances"));
  for (const title of ["Account and FD principal chart data", "Cash movement chart data", "Maturity chart data", "Return composition chart data"]) assert.ok(html.includes(title), title + " should be available without chart hover");
});
