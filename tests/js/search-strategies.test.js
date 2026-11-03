import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption, TransferFeeConfig } from "../../src/core/models.js";
import { AbsoluteStrategy } from "../../src/core/strategies/absolute.js";
import { GAMLStrategy } from "../../src/core/strategies/gaml.js";
import { GreedyStrategy } from "../../src/core/strategies/greedy.js";

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
  const result = new AbsoluteStrategy({ ait_enabled: true }).simulate(scenario());
  assert.equal(result.strategy_name, "Absolute");
  assert.equal(result.valid, true);
  assert.ok(result.bookings.length > 0);
  assert.ok(result.search_diagnostics.expanded_states > 0);
  assert.equal(result.optimality_proven, true);
  assert.ok(result.bookings.every(booking => !booking.option.is_efd));
});

test("GAML runs bounded search and honours its three Python-compatible settings", () => {
  const strategy = new GAMLStrategy({
    ait_enabled: true, beam_width: 8, max_local_branches: 4, max_decisions: 100
  });
  const result = strategy.simulate(scenario());
  assert.equal(result.strategy_name, "GAML");
  assert.equal(result.valid, true);
  assert.ok(result.bookings.length > 0);
  assert.ok(result.search_diagnostics.expanded_states <= 100);
  assert.equal(result.search_settings.beamWidth, 8);
  assert.equal(result.search_settings.maxLocalBranches, 4);
  assert.equal(result.search_settings.maxDecisions, 100);
  assert.ok(result.bookings.every(booking => !booking.option.is_efd));
});

test("GAML never returns a worse objective than Greedy for the same small scenario", () => {
  const input = scenario();
  const greedy = new GreedyStrategy({ ait_enabled: true }).simulate(input);
  const gaml = new GAMLStrategy({ ait_enabled: true, beam_width: 8, max_local_branches: 8 }).simulate(input);
  assert.ok(gaml.final_value >= greedy.final_value - 0.01);
});

test("GAML rejects invalid search settings", () => {
  assert.throws(() => new GAMLStrategy({ beam_width: 0 }), /beam_width/);
  assert.throws(() => new GAMLStrategy({ max_local_branches: 0 }), /max_local_branches/);
  assert.throws(() => new GAMLStrategy({ max_decisions: 0 }), /max_decisions/);
});
