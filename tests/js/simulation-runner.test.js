import test from "node:test";
import assert from "node:assert/strict";
import { FDOption, Account, TransferFeeConfig } from "../../src/core/models.js";
import { SimulationEngine } from "../../src/core/simulation.js";
import { GreedyStrategy } from "../../src/strategies/greedy.js";
import { AbsolutePlusStrategy } from "../../src/strategies/absolute-plus.js";
import { GSSStrategy } from "../../src/strategies/gss.js";
import { runSimulationTask } from "../../src/web/simulation-task.js";
import { isSimulationRequest } from "../../src/web/simulation-worker-protocol.js";
import {
  SimulationWorkerRunner, simulationFingerprint, catalogueFingerprint, createWorkerPayload,
  rehydrateSimulationResult
} from "../../src/web/simulation-runner.js";

class FakeWorker {
  static instances = [];
  constructor() { this.terminated = false; FakeWorker.instances.push(this); }
  postMessage(message) {
    if (this.throwOnPost) throw new Error("postMessage failed");
    this.message = message;
  }
  terminate() { this.terminated = true; }
  emit(type, payload = {}) {
    this.onmessage?.({ data: { id: this.message.id, type, ...payload } });
  }
  fail(message = "worker runtime failed") {
    this.onerror?.({ message, preventDefault() {} });
  }
  messageError() { this.onmessageerror?.({}); }
}
function factory() { FakeWorker.instances = []; return () => new FakeWorker(); }
function makeWorkerResult(overrides = {}) { return { valid: true, bookings: [], end_date: new Date("2026-02-01"), timeline: {}, accounts: {}, ...overrides }; }
function config(overrides = {}) {
  return {
    start: new Date("2026-01-01T00:00:00.000Z"),
    end: new Date("2026-02-01T00:00:00.000Z"),
    simulation: { mode: "scoped" },
    accounts: [new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 50000 })],
    options: [new FDOption({ label: "Test FD", period_str: "30d", annual_rate: 8, bank_id: "BANK_A", bank_key: "a" })],
    inflow_schedule: {}, outflow_schedule: {},
    fee_config: new TransferFeeConfig({ default_inter_bank_fee: 30, same_bank_fee: 0 }),
    consolidation_account_id: "main", strategy: "gaml",
    gaml_settings: { beam_width: 8, max_local_branches: 4, max_decisions: null },
    greedy_settings: {}, gss_settings: { small_period_days: 30 },
    compound: false, actual_leap_year: true, ait_enabled: true, ait_rate: 0.1,
    bank_registry: { BANK_A: { name: "Bank A" } },
    ...overrides
  };
}

test("dedicated worker accepts valid requests without relying on event.origin", () => {
  const request = {
    id: 1,
    type: "simulate",
    payload: { strategy: "gaml", accounts: [], options: [] }
  };
  // The handler validates event.data only. An empty MessageEvent.origin does
  // not cause a valid message from the app-owned Worker channel to be rejected.
  assert.equal(isSimulationRequest(request), true);
  assert.equal(isSimulationRequest({ ...request, id: 0 }), false);
  assert.equal(isSimulationRequest({ ...request, id: "1" }), false);
  assert.equal(isSimulationRequest({ ...request, type: "unknown" }), false);
  assert.equal(isSimulationRequest({ ...request, payload: null }), false);
  assert.equal(isSimulationRequest(null), false);
});

test("fingerprint is stable across object-key order and includes catalogue changes", () => {
  const a = config();
  const b = config({ bank_registry: { BANK_A: { name: "Bank A" } } });
  assert.equal(simulationFingerprint(a), simulationFingerprint(b));
  const reordered = { ...a, gaml_settings: { max_decisions: null, max_local_branches: 4, beam_width: 8 } };
  assert.equal(simulationFingerprint(a), simulationFingerprint(reordered));
  const changedCatalogue = config({ options: [new FDOption({
    label: "Changed FD", period_str: "30d", annual_rate: 8, bank_id: "BANK_A", bank_key: "a"
  })] });
  assert.notEqual(simulationFingerprint(a), simulationFingerprint(changedCatalogue));
  assert.notEqual(
    simulationFingerprint(config({ inflow_summaries: [{ name: "Salary", amount: 1000 }] })),
    simulationFingerprint(config({ inflow_summaries: [{ name: "Savings", amount: 1000 }] }))
  );
});

test("catalogue SHA-256 is stable, catalogue-sensitive and excludes scenario balances", async () => {
  const first = config();
  const hash = await catalogueFingerprint(first);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(await catalogueFingerprint(config()), hash);
  assert.notEqual(await catalogueFingerprint(config({
    options: [new FDOption({ label: "Different product", period_str: "30d", annual_rate: 8, bank_id: "BANK_A", bank_key: "a" })]
  })), hash);
  assert.equal(await catalogueFingerprint(config({
    accounts: [new Account({ id: "main", bank_id: "BANK_A", bank_key: "a", balance: 90000 })]
  })), hash);
});

test("worker payload contains clone-safe data and preserves dates", () => {
  const payload = createWorkerPayload(config());
  assert.ok(payload.start instanceof Date);
  assert.ok(payload.end instanceof Date);
  assert.equal(typeof payload.options[0].canInvest, "undefined");
  assert.equal(payload.options[0].label, "Test FD");
  assert.equal(payload.accounts[0].id, "main");
  assert.doesNotThrow(() => structuredClone(payload));
});

test("result rehydration restores FDOption methods for report generation", () => {
  const result = rehydrateSimulationResult({
    strategy_name: "Test", valid: true, end_date: new Date("2026-01-31"),
    total_principal: 50000, total_transfer_fees: 0,
    ait_enabled: true, ait_rate: 0.1, timeline: {}, accounts: {},
    bookings: [{
      principal: 50000, start: new Date("2026-01-01"),
      cash_flows: [{ date: new Date("2026-01-31"), amount: 50100 }],
      account_id: "main", bank_id: "BANK_A", bank_key: "a",
      option: { label: "Test FD", period_str: "30d", annual_rate: 8, bank_id: "BANK_A", bank_key: "a" }
    }]
  }, FDOption);
  assert.equal(typeof result.bookings[0].option.applyAITToCashFlows, "function");
  assert.equal(result.bookings[0].principal, 50000);
  assert.equal(result.bookings[0].total_interest, 100);
  assert.equal(result.bookings[0].end.toISOString().slice(0, 10), "2026-01-31");
  assert.equal(result.bookings[0].payout_type, "cumulative");
  assert.equal(result.total_interest, 100);
  assert.equal(result.ait_withheld, 10);
  assert.equal(result.net_interest_after_ait, 90);
  assert.equal(result.final_value_after_ait, 50090);
  assert.equal(typeof result.sorted_dates, "function");
});

test("runner resolves successful work and terminates the worker", async () => {
  const runner = new SimulationWorkerRunner({ workerFactory: factory() });
  const run = runner.run({ value: 1 }, "one");
  const worker = FakeWorker.instances[0];
  worker.emit("started", { startedAt: 123 });
  assert.equal(runner.active !== null, true, "start acknowledgement must not settle the run");
  worker.emit("result", { result: makeWorkerResult({ total_interest: 12 }) });
  assert.equal((await run.promise).total_interest, 12);
  assert.equal(worker.terminated, true);
  assert.equal(runner.active, null);
});

test("same active fingerprint shares one worker Promise", async () => {
  const runner = new SimulationWorkerRunner({ workerFactory: factory() });
  const first = runner.run({}, "same");
  const second = runner.run({}, "same");
  assert.equal(first.promise, second.promise);
  assert.equal(second.deduplicated, true);
  assert.equal(FakeWorker.instances.length, 1);
  FakeWorker.instances[0].emit("result", { result: makeWorkerResult({ total_interest: 42 }) });
  assert.equal((await second.promise).total_interest, 42);
});

test("completed fingerprint reuses its result without starting another worker", async () => {
  const runner = new SimulationWorkerRunner({ workerFactory: factory() });
  const first = runner.run({}, "cached");
  FakeWorker.instances[0].emit("result", { result: makeWorkerResult({ value: 7 }) });
  const result = await first.promise;
  const reused = runner.run({}, "cached");
  assert.equal(reused.reused, true);
  assert.equal(reused.started, false);
  assert.equal(await reused.promise, result);
  assert.equal(FakeWorker.instances.length, 1);
});

test("changed fingerprint supersedes old work and ignores its late result", async () => {
  const runner = new SimulationWorkerRunner({ workerFactory: factory() });
  const first = runner.run({}, "old");
  const oldWorker = FakeWorker.instances[0];
  const oldHandler = oldWorker.onmessage;
  const firstRejected = assert.rejects(first.promise, { name: "AbortError" });
  const second = runner.run({}, "new");
  assert.equal(oldWorker.terminated, true);
  oldHandler({ data: { id: oldWorker.message.id, type: "result", result: "stale" } });
  assert.equal(runner.active.fingerprint, "new");
  FakeWorker.instances[1].emit("result", { result: makeWorkerResult({ tag: "latest" }) });
  await firstRejected;
  assert.equal((await second.promise).tag, "latest");
  assert.equal(runner.completed.fingerprint, "new");
});

test("requesting a cached scenario cancels a different active computation", async () => {
  const runner = new SimulationWorkerRunner({ workerFactory: factory() });
  const cached = runner.run({}, "cached");
  FakeWorker.instances[0].emit("result", { result: makeWorkerResult({ tag: "cached result" }) });
  await cached.promise;
  const active = runner.run({}, "other");
  const worker = FakeWorker.instances[1];
  const rejected = assert.rejects(active.promise, { name: "AbortError" });
  const reused = runner.run({}, "cached");
  assert.equal(reused.reused, true);
  assert.equal(worker.terminated, true);
  await rejected;
  assert.equal((await reused.promise).tag, "cached result");
});

test("unexpected worker response settles the Promise and terminates the worker", async () => {
  const runner = new SimulationWorkerRunner({ workerFactory: factory() });
  const run = runner.run({}, "malformed");
  const worker = FakeWorker.instances[0];
  worker.emit("unexpected", { result: 1 });
  await assert.rejects(run.promise, /unsupported response type/);
  assert.equal(worker.terminated, true);
});

test("worker-reported errors, runtime errors and message errors reject and clean up", async t => {
  await t.test("reported error", async () => {
    const runner = new SimulationWorkerRunner({ workerFactory: factory() });
    const run = runner.run({}, "reported");
    const worker = FakeWorker.instances[0];
    worker.emit("error", { error: { name: "RangeError", message: "invalid simulation" } });
    await assert.rejects(run.promise, { name: "RangeError", message: "invalid simulation" });
    assert.equal(worker.terminated, true);
  });
  await t.test("runtime error", async () => {
    const runner = new SimulationWorkerRunner({ workerFactory: factory() });
    const run = runner.run({}, "runtime");
    const worker = FakeWorker.instances[0];
    worker.fail("worker crashed");
    await assert.rejects(run.promise, /worker crashed/);
    assert.equal(worker.terminated, true);
  });
  await t.test("message deserialisation error", async () => {
    const runner = new SimulationWorkerRunner({ workerFactory: factory() });
    const run = runner.run({}, "message");
    const worker = FakeWorker.instances[0];
    worker.messageError();
    await assert.rejects(run.promise, /could not be deserialised/);
    assert.equal(worker.terminated, true);
  });
});

test("worker construction and postMessage failures reject without leaking a worker", async t => {
  await t.test("construction", async () => {
    const runner = new SimulationWorkerRunner({ workerFactory: () => { throw new Error("worker unavailable"); } });
    const run = runner.run({}, "construct");
    assert.equal(run.started, false);
    await assert.rejects(run.promise, /worker unavailable/);
    assert.equal(runner.active, null);
  });
  await t.test("postMessage", async () => {
    const runner = new SimulationWorkerRunner({ workerFactory: () => {
      const worker = new FakeWorker(); worker.throwOnPost = true; return worker;
    } });
    const run = runner.run({}, "post");
    await assert.rejects(run.promise, /postMessage failed/);
    assert.equal(FakeWorker.instances.at(-1).terminated, true);
    assert.equal(runner.active, null);
  });
});

test("explicit cancellation rejects once and releases the worker", async () => {
  const runner = new SimulationWorkerRunner({ workerFactory: factory() });
  const run = runner.run({}, "cancel");
  const rejected = assert.rejects(run.promise, { name: "AbortError" });
  assert.equal(runner.cancel("User cancelled."), true);
  assert.equal(runner.cancel(), false);
  await rejected;
  assert.equal(FakeWorker.instances[0].terminated, true);
  assert.equal(runner.active, null);
});

for (const [strategy, makeStrategy] of [
  ["greedy", config => new GreedyStrategy({ compound: config.compound, actual_leap_year: config.actual_leap_year, ait_enabled: config.ait_enabled, ait_rate: config.ait_rate, ...config.greedy_settings })],
  ["gaml", config => new AbsolutePlusStrategy({ compound: config.compound, actual_leap_year: config.actual_leap_year, ait_enabled: config.ait_enabled, ait_rate: config.ait_rate, ...config.gaml_settings })],
  ["gss", config => new GSSStrategy({ compound: config.compound, actual_leap_year: config.actual_leap_year, ait_enabled: config.ait_enabled, ait_rate: config.ait_rate, ...config.gss_settings })]
]) {
  test(strategy + " worker task preserves shared-engine result parity", () => {
    const source = config({ strategy });
    const payload = createWorkerPayload(source);
    const workerResult = rehydrateSimulationResult(structuredClone(runSimulationTask(payload)), FDOption);
    const directResult = new SimulationEngine().run(makeStrategy(source), {
      options: source.options,
      start: source.start,
      end: source.end,
      simulation: source.simulation,
      inflow_schedule: source.inflow_schedule,
      accounts: source.accounts,
      inflow_account_id: source.accounts[0].id,
      fee_config: source.fee_config,
      consolidation_account_id: source.consolidation_account_id,
      outflow_schedule: source.outflow_schedule
    });
    const plain = value => JSON.parse(JSON.stringify(value));
    assert.deepEqual(plain(workerResult), plain(directResult));
    for (const metric of ["total_interest", "ait_withheld", "net_interest_after_ait", "total_principal", "total_transfer_fees", "final_value_after_ait"]) {
      assert.equal(workerResult[metric], directResult[metric], strategy + " " + metric + " parity");
    }
    assert.doesNotThrow(() => structuredClone(workerResult));
  });
}

test("worker task carries catalogue eligibility into report bookings without changing engine context", () => {
  const source = config({
    options: [new FDOption({
      label: "Senior 30d", period_str: "30d", annual_rate: 8,
      min_amount: 25000, bank_id: "BANK_A", bank_key: "a",
      customer_segment: "senior", min_age: 60, max_age: 100,
      min_age_inclusive: false, max_age_inclusive: true, guardian_required: true
    })]
  });
  const result = rehydrateSimulationResult(structuredClone(runSimulationTask(createWorkerPayload(source))), FDOption);
  assert.ok(result.bookings.length > 0);
  assert.equal(result.bookings[0].option.customer_segment, "senior");
  assert.equal(result.bookings[0].option.min_age, 60);
  assert.equal(result.bookings[0].option.min_age_inclusive, false);
  assert.equal(result.bookings[0].option.guardian_required, true);
  assert.equal(result.bookings[0].total_interest, result.bookings[0].cash_flows.reduce((sum, flow) => sum + flow.amount, 0) - result.bookings[0].principal);
});
