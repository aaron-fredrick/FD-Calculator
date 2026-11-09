import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AIT_ASSUMPTION, AIT_RATE } from "../../src/core/models.js";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Sri Lankan AIT assumption has a stable source-backed version", () => {
  assert.equal(AIT_RATE, 0.10);
  assert.equal(AIT_ASSUMPTION.rate, AIT_RATE);
  assert.equal(AIT_ASSUMPTION.id, "LK-AIT-INTEREST-2025-04-01");
  assert.equal(AIT_ASSUMPTION.effective_from, "2025-04-01");
  assert.equal(AIT_ASSUMPTION.reference, "IRD Circular SEC/2025/E/02");
  assert.match(AIT_ASSUMPTION.source_url, /^https:\/\/www\.ird\.gov\.lk\//);
});

test("browser UI cites the AIT source and qualifies the modelling assumption", async () => {
  const html = await read("../../src/web/index.html");
  assert.match(html, /Apply the current 10% AIT modelling assumption/);
  assert.match(html, /SEC_2025_E_02_E\.pdf/);
  assert.match(html, /Individual relief or exemptions may apply/);
});

test("privacy and terms pages provide a private contact route", async () => {
  const privacy = await read("../../src/web/privacy.html");
  const terms = await read("../../src/web/terms.html");
  assert.match(privacy, /mailto:a\.n\.r\.fredrick@gmail\.com/);
  assert.match(privacy, /public issue/);
  assert.match(terms, /mailto:a\.n\.r\.fredrick@gmail\.com/);
  assert.match(terms, /laws of Sri Lanka/);
  assert.match(terms, /mandatory law/);
});

test("security policy directs sensitive reports away from public issues", async () => {
  const policy = await read("../../SECURITY.md");
  assert.match(policy, /Private vulnerability reporting/);
  assert.match(policy, /mailto:a\.n\.r\.fredrick@gmail\.com/);
  assert.match(policy, /do not report security vulnerabilities through public GitHub issues/i);
});

test("owner-approved interest and research decisions are documented", async () => {
  const interest = await read("../../docs/finance/INTEREST-DAY-COUNT.md");
  const research = await read("../../docs/audits/OWNER-FEEDBACK-RESEARCH.md");
  assert.match(interest, /start-year denominator/);
  assert.match(research, /only payout events whose dates fall inside the active simulation period/);
  assert.match(research, /180 days/);
  assert.match(research, /365 days/);
  assert.match(research, /do not activate or implement them yet/i);
});
