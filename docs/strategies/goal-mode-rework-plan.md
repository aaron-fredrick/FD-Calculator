# Goal-mode rework plan

## Status

**Status: Under development — not user selectable.**

Goal mode is disabled in the browser and rejected by the public configuration validator and JSON schema. This is intentional. Do not re-enable it until every acceptance gate below is complete.

## Architecture decision

The current four strategies were built around a finite scoped date range. Preserve that design rather than forcing every strategy to optimise a second objective.

| Component | Scoped date-range mode | Future Goal mode |
|---|---|---|
| Simulation runtime | Authoritative financial execution and validation | Same strategy-independent accounting and validation |
| Greedy | Existing scoped heuristic, unchanged | Not planned |
| GSS | Existing scoped recursive planner, unchanged | Not planned |
| Absolute R+ | Existing scoped bounded search, unchanged | Not planned |
| Absolute R | Existing scoped exhaustive search | First and only planned Goal optimiser |

The runtime determines whether a decision sequence is financially valid. The strategy determines which valid sequence is best. Goal-vs-Scoped objective selection belongs at the strategy/search boundary, not in the authoritative simulation engine.

The internal goal runtime and provenance code may remain available to direct unit tests while the public mode is disabled. Internal tests do not make Goal mode a supported product feature.

## Goal objective

The future Goal objective is the earliest event boundary at which the configured cumulative net interest is actually credited to the consolidation account. The target must be achieved using authoritative runtime accounting after AIT and the applicable transfer-fee allocation. Principal, projected interest and uncredited interest are not achievement.

The user should supply a start date and target, not an arbitrary end date. Any internal safety horizon is only a guard against unbounded execution and must not become a terminal-value optimisation horizon.

## Non-negotiable constraints

1. Preserve scoped results, decision paths, diagnostics and practical performance for Greedy, GSS, Absolute R and Absolute R+.
2. Do not add Goal-specific policy branches to Greedy, GSS or Absolute R+.
3. Keep the simulation runtime strategy-independent. It owns actual balances, cash flows, maturity events, outflow settlement, provenance and finalisation.
4. Keep Goal objective ranking and search pruning inside Absolute R's strategy implementation.
5. Never weaken strict outflow, liquidity or provenance debit validation to make a Goal candidate appear feasible.
6. Replay selected Goal candidates through the authoritative runtime. Search projections are estimates, not accounting authority.
7. Report an optimality proof only if Absolute R exhausts the relevant decision space and every pruning rule is admissible for earliest achievement.
8. Do not expose the Goal selector, schema contract or CLI mode until the full release gate passes.

## Execution phases

### Phase 0 — Re-establish the current baseline

- Inspect the merged goal-aware implementation and identify code paths that currently branch on Goal mode.
- Record current Scoped parity fixtures and diagnostics for all four strategies.
- Identify the exact provenance debit failure path reported in the browser, including no-outflow scenarios and Absolute+.
- Separate verified causes from hypotheses; do not widen debit tolerances without proving the accounting reconciliation rule.

**Acceptance:** source map, reproducible failing test for any confirmed accounting defect, and a recorded scoped baseline.

### Phase 1 — Isolate objective ownership

- Keep runtime event processing and financial validation common.
- Move any objective-specific stopping, candidate ordering, ranking, state equivalence and pruning decisions to Absolute R's search boundary.
- Ensure the public configuration contract remains scoped-only.
- Remove Goal-specific search work from Greedy, GSS and Absolute R+ only where it is safe and covered by scoped parity tests. Do not make broad refactors merely for symmetry.

**Acceptance:** all four strategies remain scoped-only in public execution; scoped parity tests remain exact.

### Phase 2 — Implement Goal search in Absolute R only

- Define earliest authoritative consolidation-credit date as the primary objective.
- Define deterministic same-date tie-breaks and unachieved-candidate ordering.
- Preserve all candidate paths that may achieve earlier, even if they have lower terminal interest.
- Use only proven-safe Goal pruning; disable scoped terminal-value bounds or memo rules that are not admissible for earliest achievement.
- Do not let the internal safety horizon act as a user scope or terminal-value objective.

**Acceptance:** small adversarial Goal cases match a deterministic exhaustive oracle; Absolute R's proof flag is honest.

### Phase 3 — Harden financial accounting and provenance

- Reconcile scalar balances and provenance components at every relevant transition.
- Audit pending cash-flow aggregation, rounding, same-day maturities, periodic payouts, transfers, consolidation and reinvestment.
- Improve debit failure diagnostics with account, requested amount, available provenance, scalar balance, discrepancy and operation context.
- Keep real overdraws and strict outflow failures rejected.

**Acceptance:** no false provenance debit failures in supported no-outflow cases; genuine overdraw and invalid transfer tests still fail.

### Phase 4 — Adversarial and sensitivity verification

Cover at minimum:

- Multiple same-day FD maturities and periodic interest payouts.
- Mixed principal, uncredited interest and counted interest.
- AIT and transfer-fee allocation.
- Repeated transfer, consolidation and reinvestment cycles.
- Future inflows and strict outflows.
- Different accounts, banks and eFD eligibility.
- Faster low-interest paths versus slower high-interest paths.
- Targets just below, at and above a credited payout.
- Unreachable targets and safety-horizon exhaustion.

Measure actual achievement date, credited interest, fees, operations, expanded/pruned states, runtime and proof status. Keep the existing Scoped sensitivity matrix separate.

**Acceptance:** all adversarial tests pass; Scoped benchmarks show no regression; Goal results match the exhaustive oracle for tractable cases.

### Phase 5 — Re-enable Goal mode only after review

Only after Phases 0–4 pass:

- Re-enable the Goal mode selector.
- Restore Goal mode to the public schema and semantic validator.
- Expose Absolute R as the only selectable Goal strategy.
- Keep Greedy, GSS and Absolute R+ unavailable in Goal mode.
- Update browser, CLI, reports, documentation, sensitivity graphs and CI.
- Run full tests, docs build, CodeQL and final diff review.

**Acceptance:** public UI, CLI, schema and docs agree; all CI gates pass; no Goal feature is exposed prematurely.

## Current implementation boundary

The current public product remains scoped date-range only. The existing internal Goal code is retained for investigation, but is not accepted as complete. In particular, the reported error `Provenance debit exceeds the available balance` remains a separate accounting investigation until reproduced and fixed with focused tests.
