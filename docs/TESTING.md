# Testing the JavaScript calculator

Use Node.js 22 or newer from the repository root.

```sh
npm ci
npm test
```

The test command runs the JavaScript suite with Node's built-in test runner. The same suite is executed by GitHub Actions. The repository also exposes `npm run test:unit` for the test files under `tests/js`.

## Coverage

The suite includes:

- Financial models, dates, leap-year calculations, FD eligibility, AIT and transfer fees.
- Inflow/outflow schedules, periodic payouts, maturities and all supported outflow policies.
- Immutable normalized simulation contexts and revision-bound strategy contracts.
- Transactional booking, transfer and same-date batch execution, including rollback when a later operation is invalid.
- Greedy, GAML, Absolute and GSS strategy behaviour.
- Frozen pre-refactor execution oracles that compare normalized booking and event ledgers for Greedy, GAML, Absolute and GSS.
- Search diagnostics, GSS recursive goal contraction, ancestor reforecasting and finalization lifecycle.
- Architecture checks that strategies expose planning sessions rather than `simulate()` execution adapters, and that CLI/browser entry points use `SimulationEngine`.

## Production execution path

The CLI and browser application both use the shared JavaScript engine. Production calculations enter through `SimulationEngine.run()`; the engine drives strategy sessions, `SimulationRuntime` owns actual chronological execution, and the engine performs finalization exactly once.

## What passing tests do not prove

A green test suite proves the covered contracts and regression scenarios, not every possible financial input or parity with every historical Python result. The frozen JavaScript oracles protect the pre-refactor strategy ledgers; they are not a guarantee that live bank products, rates or external assumptions are current. Add focused deterministic fixtures when changing financial semantics or strategy decision rules.
