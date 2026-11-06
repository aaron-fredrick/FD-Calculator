import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { AbsoluteStrategy } from "../../src/strategies/absolute.js";
import { AbsolutePlusStrategy } from "../../src/strategies/absolute-plus.js";
import { GreedyStrategy } from "../../src/strategies/greedy.js";
import { SimulationEngine } from "../../src/core/simulation.js";

const run = (strategy, input) => new SimulationEngine().run(strategy, input);

function scenario() {
  const account = new Account({
    id: "main", bank_id: "BANK_A", bank_key: "bank_a",
    label: "Main", balance: 30000, supports_efd: false
  });
  const options = [
    new FDOption({
      label: "Standard 30d", bank_id: "BANK_A", bank_key: "bank_a",
      period_str: "30d", annual_rate: 10, min_amount: 25000
    }),
    new FDOption({
      label: "High-minimum 30d", bank_id: "BANK_A", bank_key: "bank_a",
      period_str: "30d", annual_rate: 15, min_amount: 50000
    }),
    new FDOption({
      label: "eFD 30d", bank_id: "BANK_A", bank_key: "bank_a",
      period_str: "30d", annual_rate: 10, min_amount: 25000, is_efd: true
    })
  ];
  return {
    options, start: "2026-01-01", end: "2026-03-10",
    inflow_schedule: { "2026-02-01": { main: 30000 } }, accounts: [account], inflow_account_id: "main",
    fee_config: new TransferFeeConfig(), consolidation_account_id: "main",
    outflow_schedule: {}
  };
}

test("Absolute runs exhaustive portfolio search and returns a replayed SimResult", () => {
  const result = run(new AbsoluteStrategy({ ait_enabled: true }), scenario());
  assert.equal(result.strategy_name, "Absolute R");
  assert.equal(result.valid, true);
  assert.ok(result.bookings.length > 0);
  assert.ok(result.bookings.some(booking => booking.start.toISOString().slice(0, 10) === "2026-02-01"));
  assert.ok(result.search_diagnostics.expanded_states > 0);
  assert.equal(result.optimality_proven, true);
  assert.ok(result.bookings.every(booking => !booking.option.is_efd));
});

test("Absolute+ runs bounded search and honours its three Python-compatible settings", () => {
  const strategy = new AbsolutePlusStrategy({
    ait_enabled: true, beam_width: 8, max_local_branches: 4, max_decisions: 100
  });
  const result = run(strategy, scenario());
  assert.equal(result.strategy_name, "Absolute R+");
  assert.equal(result.valid, true);
  assert.ok(result.bookings.length > 0);
  assert.ok(result.bookings.some(booking => booking.start.toISOString().slice(0, 10) === "2026-02-01"));
  assert.ok(result.search_diagnostics.expanded_states <= 100);
  assert.equal(result.search_settings.beamWidth, 8);
  assert.equal(result.search_settings.maxLocalBranches, 4);
  assert.equal(result.search_settings.maxDecisions, 100);
  assert.ok(result.bookings.every(booking => !booking.option.is_efd));
});

test("Absolute+ never returns a worse objective than Greedy for the same small scenario", () => {
  const input = scenario();
  const greedy = run(new GreedyStrategy({ ait_enabled: true }), input);
  const gaml = run(new AbsolutePlusStrategy({ ait_enabled: true, beam_width: 8, max_local_branches: 8 }), input);
  assert.ok(gaml.final_value >= greedy.final_value - 0.01);
});

test("Absolute+ rejects invalid search settings", () => {
  assert.throws(() => new AbsolutePlusStrategy({ beam_width: 0 }), /beam_width/);
  assert.throws(() => new AbsolutePlusStrategy({ max_local_branches: 0 }), /max_local_branches/);
  assert.throws(() => new AbsolutePlusStrategy({ max_decisions: 0 }), /max_decisions/);
});

test("search strategies never place an eFD in an account without eFD capability", () => {
  const accounts = [
    new Account({ id: "a-main", bank_id: "BANK_A", bank_key: "bank_a", balance: 25000, supports_efd: false }),
    new Account({ id: "a-efd", bank_id: "BANK_A", bank_key: "bank_a", balance: 25000, supports_efd: true }),
    new Account({ id: "b-main", bank_id: "BANK_B", bank_key: "bank_b", balance: 25000, supports_efd: true })
  ];
  const options = [
    new FDOption({ label: "A standard", bank_id: "BANK_A", bank_key: "bank_a", period_str: "30d", annual_rate: 8, min_amount: 25000 }),
    new FDOption({ label: "A eFD", bank_id: "BANK_A", bank_key: "bank_a", period_str: "30d", annual_rate: 9, min_amount: 25000, is_efd: true }),
    new FDOption({ label: "B standard", bank_id: "BANK_B", bank_key: "bank_b", period_str: "30d", annual_rate: 7, min_amount: 25000 })
  ];
  const result = run(new AbsolutePlusStrategy({ beam_width: 16, max_local_branches: 16, ait_enabled: true }), {
    options, start: "2026-01-01", end: "2026-02-01", inflow_schedule: {},
    accounts, inflow_account_id: "a-main", fee_config: new TransferFeeConfig(),
    consolidation_account_id: "a-main", outflow_schedule: {}
  });
  const efdEligible = new Set(accounts.filter(account => account.supports_efd).map(account => account.id));
  assert.ok(result.bookings.some(booking => booking.option.is_efd));
  assert.ok(result.bookings.filter(booking => booking.option.is_efd).every(booking => efdEligible.has(booking.account_id)));
});

test("Absolute+ marks a search that reaches its configured state cap as unproven", () => {
  const result = run(new AbsolutePlusStrategy({ beam_width: 8, max_local_branches: 4, max_decisions: 1 }), scenario());
  assert.equal(result.search_diagnostics.expanded_states, 1);
  assert.equal(result.optimality_proven, false);
});
