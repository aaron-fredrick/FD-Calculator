import test from "node:test";
import assert from "node:assert/strict";
import { Account, FDOption } from "../../src/core/models.js";
import { FDOptionManager, BankFDOptionManager, compareFDOptions, fdOptionKey } from "../../src/fd-options/index.js";

const option = (overrides = {}) => new FDOption({
  label: "12M cumulative", period_str: "1y", annual_rate: 10, min_amount: 25000,
  bank_id: "BANK_A", bank_key: "bank_a", ...overrides,
});

test("bank catalogues are grouped by canonical identity", () => {
  const a = option(), b = option({ bank_id: "BANK_B", bank_key: "bank_b", label: "Other bank" });
  const manager = new FDOptionManager([a, b]);
  assert.deepEqual(manager.getBankManager("bank_a").options, [a]);
  assert.deepEqual(manager.getBankManager("BANK_B").options, [b]);
});

test("same-bank accounts share products but apply eFD eligibility independently", () => {
  const standard = option(), efd = option({ label: "12M eFD", is_efd: true });
  const manager = new FDOptionManager([standard, efd]);
  const supported = new Account({ id: "one", bank_id: "BANK_A", supports_efd: true });
  const unsupported = new Account({ id: "two", bank_id: "BANK_A", supports_efd: false });
  assert.deepEqual(manager.getAccountOptions(supported), [efd, standard].sort(compareFDOptions));
  assert.deepEqual(manager.getAccountOptions(unsupported), [standard]);
});

test("unassigned products remain available to every bank", () => {
  const global = option({ bank_id: "", bank_key: "" }), bank = option();
  const manager = new FDOptionManager([global, bank]);
  const account = new Account({ id: "one", bank_id: "BANK_A" });
  assert.deepEqual(manager.getAccountOptions(account), [global, bank].sort(compareFDOptions));
});

test("eligibility uses amount and the actual investment date", () => {
  const manager = new FDOptionManager([option({ period_str: "90d", min_amount: 50000 })]);
  const account = new Account({ id: "one", bank_id: "BANK_A" });
  const eligible = args => manager.getEligibleOptions({ account, ...args });
  assert.equal(eligible({ amount: 49999, investmentDate: "2026-01-01", simulationEndDate: "2026-12-31" }).length, 0);
  assert.equal(eligible({ amount: 50000, investmentDate: "2026-01-01", simulationEndDate: "2026-04-01" }).length, 1);
  assert.equal(eligible({ amount: 50000, investmentDate: "2026-01-01", simulationEndDate: "2026-03-31" }).length, 0);
});

test("lookup keys preserve duplicate identical products", () => {
  const first = option(), duplicate = option(), bank = new BankFDOptionManager("BANK_A", [first, duplicate]);
  assert.equal(bank.getOption(fdOptionKey(first)), first);
  assert.equal(bank.getOptionsByKey(fdOptionKey(first)).length, 2);
});

test("comparator applies rate, tenor, payout and payout-interval ordering", () => {
  const products = [
    option({ label: "Cumulative", payout_type: "cumulative" }),
    option({ label: "Periodic 3m", payout_type: "periodic_interest", payout_period_str: "3m" }),
    option({ label: "Periodic 1m", payout_type: "periodic_interest", payout_period_str: "1m" }),
    option({ label: "Higher rate", annual_rate: 11 }),
    option({ label: "Short tenor", period_str: "6m" }),
  ].sort(compareFDOptions);
  assert.deepEqual(products.map(item => item.label), ["Higher rate", "Short tenor", "Periodic 1m", "Periodic 3m", "Cumulative"]);
});

test("rate and tenor indexes expose ordered buckets without replacing canonical options", () => {
  const short = option({ label: "6 months", period_str: "6m" });
  const long = option({ label: "12 months", period_str: "1y" });
  const otherRate = option({ label: "Other rate", annual_rate: 9 });
  const bank = new BankFDOptionManager("BANK_A", [long, otherRate, short]);
  assert.deepEqual(bank.getRates(), [10, 9]);
  assert.deepEqual(bank.getRates("ascending"), [9, 10]);
  assert.deepEqual(bank.getTenorsForRate(10), [short.days, 365]);
  assert.deepEqual(bank.getTenorsForRate(10, "descending"), [365, short.days]);
  assert.deepEqual(bank.getOptionsByRateAndTenor(10, short.days), [short]);
  assert.deepEqual(bank.getOptionsByRate(10), [short, long]);
  assert.equal(bank.options.length, 3);
});

test("invalid manager input and amounts are rejected", () => {
  const manager = new FDOptionManager([option()]);
  const account = new Account({ id: "one", bank_id: "BANK_A" });
  assert.throws(() => new FDOptionManager({}), TypeError);
  assert.throws(() => manager.getEligibleOptions({ account, amount: NaN, investmentDate: "2026-01-01", simulationEndDate: "2026-12-31" }), RangeError);
});


test("candidate retrieval preserves manager order while filtering account and horizon eligibility", () => {
  const short = option({ label: "short", period_str: "30d", annual_rate: 10 });
  const long = option({ label: "long", period_str: "1y", annual_rate: 12 });
  const efd = option({ label: "eFD", period_str: "30d", annual_rate: 11, is_efd: true });
  const manager = new FDOptionManager([short, long, efd]);
  const account = new Account({ id: "plain", bank_id: "BANK_A", supports_efd: false });
  assert.deepEqual(
    manager.getCandidateOptions({ account, investmentDate: "2026-01-01", simulationEndDate: "2026-06-01" }),
    [efd, short].filter(item => !item.is_efd).sort(compareFDOptions)
  );
});
