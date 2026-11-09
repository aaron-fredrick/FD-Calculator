import test from "node:test";
import assert from "node:assert/strict";
import { buildAccountChart } from "../../src/reporting/html.js";

test("account chart reproduces archived Python HSV hue progression and bank grouping", () => {
  const accounts = {
    secondary: { id: "secondary", bank_id: "BANK_A", label: "Savings Z", balance: 100 },
    other: { id: "other", bank_id: "BANK_B", label: "Savings P", balance: 200 },
    main: { id: "main", bank_id: "BANK_A", label: "Main Account", balance: 300 }
  };
  const bookings = [
    { bank_id: "BANK_A", start: new Date("2026-01-01"), end: new Date("2026-02-01"), principal: 1000 },
    { bank_id: "BANK_B", start: new Date("2026-01-01"), end: new Date("2026-02-01"), principal: 2000 }
  ];
  const result = { accounts, bookings, timeline: {} };
  const config = {
    consolidation_account_id: "main",
    bank_registry: {
      BANK_A: { name: "Alpha Bank" },
      BANK_B: { name: "Beta Bank" }
    }
  };

  const chart = buildAccountChart(result, config, "2026-01-01", "2026-02-01", {
    main: 300, secondary: 100, other: 200
  });

  assert.deepEqual(chart.accounts.map(series => series.accountId), ["main", "secondary", "other"]);
  assert.deepEqual(chart.accounts.map(series => series.color), ["#0055ff", "#00cc1a", "#cc7700"]);
  assert.deepEqual(chart.accounts.map(series => series.lineStyle), ["solid", "dashed", "dotted"]);
  assert.deepEqual(chart.fd_principal.map(series => series.bankId), ["BANK_A", "BANK_B"]);
  assert.equal(chart.fd_principal[0].color, "#0055ff");
  assert.equal(chart.fd_principal[0].lineStyle, "solid");
  assert.equal(chart.fd_principal[1].lineStyle, "dotted");
});

test("account chart uses a normalized blue-to-orange hue for a single account", () => {
  const result = {
    accounts: { main: { id: "main", bank_id: "BANK_A", label: "Main", balance: 100 } },
    bookings: [],
    timeline: {}
  };
  const chart = buildAccountChart(result, { consolidation_account_id: "main" }, "2026-01-01", "2026-01-31", { main: 100 });
  assert.equal(chart.accounts[0].color, "#0055ff");
});
