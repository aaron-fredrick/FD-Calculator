# Simulation and strategy boundary refactor

## Objective

Make `SimulationEngine` the owner of the actual simulation lifecycle and execution. Strategies own investment decision-making and planning, not authoritative account mutation, event processing, booking execution, transfer execution, or result construction.

Preserve existing financial semantics and strategy behaviour while moving the ownership boundary. This is an incremental refactor, not an algorithm redesign.

## Verified starting point

The current implementation is only partially separated:

- `SimulationEngine.run()` calls `strategy.simulate(input)`, inserts the `SIMULATION_START` event, and calls the one final consolidation sweep.
- Greedy and GSS each build and process their own actual event timelines, mutate their own account copies, execute bookings/transfers, schedule cash flows, and construct `SimResult`.
- GAML and Absolute share search-state expansion and search drivers, but `SearchStrategyBase` builds a context, runs Greedy as an incumbent, searches hypothetical states, and replays the chosen path with a separate actual event loop that also executes bookings/transfers and constructs `SimResult`.
- GSS additionally owns recursive goal frames, future-goal projection, ancestor reassessment, and forecast contraction. These are strategy planning responsibilities and must remain strategy-owned.
- Search-state projection is necessary for GAML/Absolute. It must remain distinct from actual execution and must not mutate the authoritative simulation state.
- Final consolidation is already centralized in `finalizeSimulation()`. Preserve its exactly-once behaviour.

The existing `docs/SIMULATION-LIFECYCLE.md` describes finalization accurately, but its statement that strategies own event generation is too broad for the intended architecture and should be corrected after the implementation establishes the new contract.

## Target ownership boundary

### Simulation layer — authoritative execution

The simulation layer owns:

- Normalize and validate simulation input; construct shared simulation context and authoritative state.
- Maintain actual account balances, pending obligations, bookings, accumulated fees, and scheduled events.
- Advance the actual simulation chronologically.
- Process actual inflows, periodic FD cash flows, maturities, and outflows.
- Validate strategy decisions against the current state and domain rules.
- Execute actual transfers and bookings, update balances, and schedule resulting actual cash-flow/maturity events.
- Produce the canonical event ledger and result.
- Add the simulation lifecycle marker and perform exactly one final consolidation/finalization after the horizon.

### Strategy layer — decisions and planning

Strategies own:

- Candidate discovery and strategy-specific candidate ordering/consideration.
- Compose SPLIT, CONSOLIDATE, and CARRY decisions.
- Compare alternatives and apply strategy-specific ranking/tie-breakers.
- Choose investment goals and future decision boundaries.
- Maintain strategy-specific planning state.
- GSS recursive goals, interim planning, ancestor reforecasting, forecast contraction, and goal ownership.
- GAML bounded search and Absolute exhaustive search, including their diagnostics and guarantees.
- Hypothetical exploration needed to evaluate future decision sequences.

Strategies must not mutate authoritative account balances, process the actual event timeline, execute actual transfers/bookings, append actual events, or construct the final `SimResult`.

### Shared domain and planning services

Shared services provide reusable rules without becoming another owner of actual simulation:

- Account, FD, event and result domain models.
- `FDOptionManager` candidate eligibility and ordering.
- Interest, AIT, transfer-fee, and cash-flow calculations.
- Outflow policy and liquidity rules.
- Reusable hypothetical state-transition/projection rules where they can safely be shared with actual execution.

The simulation engine remains the only authority for actual state transitions. A hypothetical state is a separate value owned by a planning/search operation.

## Target execution model

The intended lifecycle is:

1. Build and validate a normalized simulation context and authoritative state.
2. Process the next actual event boundary: apply inflows and FD cash flows/maturities, then settle due outflows using the existing policy semantics.
3. Give the strategy a read-only planning view of the current state and relevant projected information.
4. The strategy returns a structured decision, a future decision boundary/wait request, or a completion signal.
5. Validate and execute any decision through the simulation layer. Actual transfers/bookings and their events are created only here.
6. Notify/update the strategy with the resulting state change where its planning model requires it.
7. Continue chronological progression until the overall horizon is complete.
8. Construct the unfinished result and run the one simulation-wide finalization.

The engine owns actual time progression. A strategy may request a future decision date, but cannot process actual events itself during the wait.

## Strategy-specific migration constraints

### Greedy

Extract its current daily SPLIT/CONSOLIDATE/CARRY composition and ranking into decision logic. Preserve option selection, plan tie-breakers, eFD equivalence handling, transfer-fee evaluation, and decision timing. Move actual event processing, outflow settlement, transfer/booking execution, cash-flow scheduling, and result construction to the simulation layer.

### GAML and Absolute

Keep search algorithms, branch generation, state scoring, pruning, and hypothetical projections strategy-owned. Remove the independent actual replay executor from the strategy layer. The selected path must be validated and executed through the shared simulation layer.

During Phase 1, explicitly decide whether these strategies return a complete decision plan or expose a search session. Do not force the batch-search strategies into a reactive algorithm merely for interface uniformity. Whatever contract is chosen must preserve chronological decisions, state-dependent validity, GAML budget/optimality diagnostics, Absolute's exhaustive guarantee, and the Greedy incumbent behaviour.

### GSS

Keep recursive goal planning and all forecast/ancestor ownership rules strategy-owned. Replace actual timeline processing and actual `executePlan()` with engine-owned progression and execution. GSS must receive the actual state changes and sufficient projected event information to reforecast goals when interim bookings add periodic cash flows or maturities.

Preserve the rule that only the frame owning a goal may execute that goal. Preserve ancestor reforecasting from innermost to outermost, forecast contraction, interruption of stale descendant waits, and the single engine-owned finalization.

## Implementation phases and gates

Work phase by phase. Do not start the next phase merely because code has been written. Complete the current phase, investigate failures, record findings and decisions in this document, and only proceed when its exit criteria are met.

### Phase 0 — baseline and contract discovery

Work:

- Run the complete Node test suite and record the exact command/result.
- Inspect all strategy, simulation, event, cash-flow, result, CLI, web and test call paths.
- Capture deterministic baseline outputs for Greedy, GAML, Absolute and GSS: validity, net interest/final value, fees, outflows, account balances, booking ledger, event ledger, and strategy diagnostics.
- Cover periodic payouts, maturities, inflows, all outflow policies, transfers, eFD eligibility, no-investment cases, and GSS recursive contraction.
- Identify all direct calls to `strategy.simulate()` and all production entry points.
- Finalize the strategy contract options and decision DTO shape before implementation.

Exit gate:

- Baseline tests pass, or pre-existing failures are clearly identified and documented.
- Baseline fixtures/results are reproducible.
- All actual execution and hypothetical projection call paths are mapped.
- Phase 1 has a concrete interface design with no unresolved ownership ambiguity.

### Phase 1 — simulation foundation

Work:

- Add normalized simulation context and authoritative state abstractions.
- Define immutable/read-only strategy planning views and structured decision/wait/completion contracts.
- Implement the shared actual event progression, outflow settlement, decision validation, and execution path.
- Preserve a temporary adapter for unmigrated strategies so existing callers continue to work during migration.
- Keep finalization centralized and exactly once.

Exit gate:

- Foundation unit/integration tests pass.
- Invalid or stale decisions cannot mutate state.
- Actual execution is performed by one path.
- Existing strategy integrations still work through the adapter.
- No strategy-specific algorithm has been changed as part of this phase.

### Phase 2 — Greedy migration

Move Greedy decision composition behind the new contract. Remove Greedy-owned actual execution and result construction.

Exit gate:

- Existing Greedy tests pass.
- Baseline booking/event/fee/outflow/financial outputs match within existing numeric tolerances.
- Greedy works through the public SimulationEngine path.
- No actual state mutation or execution remains in Greedy.

### Phase 3 — GAML and Absolute migration

Keep hypothetical search and decision-path construction in the strategy layer. Route selected decisions through the simulation execution path. Remove the search replay executor.

Exit gate:

- Search engine tests and strategy tests pass.
- Deterministic baseline objective values and selected decision paths are preserved.
- Absolute's optimality status remains correct.
- GAML's budget, pruning, and optimality diagnostics remain correct.
- Replayed actual results match the selected hypothetical path.

### Phase 4 — GSS migration

Move actual event progression, settlement, booking/transfer execution, event scheduling and result construction out of GSS. Retain recursive planning and forecast ownership.

Exit gate:

- All existing GSS tests pass.
- Multi-level ancestor contraction and early goal execution are preserved.
- Periodic cash-flow and maturity additions trigger correct ancestor reforecasting.
- No duplicate or skipped actual event processing occurs.
- GSS never performs finalization.

### Phase 5 — enforce and remove compatibility paths

Remove temporary adapters and obsolete strategy execution paths. Add architectural tests for ownership boundaries and verify CLI/browser callers use the engine.

Exit gate:

- No production path bypasses SimulationEngine.
- Strategies cannot access authoritative mutation/execution APIs.
- Only the simulation layer creates actual booking/transfer events and final results.
- Exactly-once finalization is enforced by tests.

### Phase 6 — documentation alignment

Update the lifecycle, architecture, strategy guides, codebase map, and VitePress navigation to describe the implemented architecture. Keep algorithm-specific material in each strategy guide.

Exit gate:

- Every architectural statement is supported by current code.
- Internal links and docs build pass.
- Strategy guides explain decision composition and planning, not actual simulation execution.

## Iteration and issue-handling protocol

For every phase:

1. Read this plan and the relevant prior phase notes before starting.
2. State the phase objective, scope, dependencies, and exit criteria.
3. Implement only the work needed for that phase.
4. Run focused tests first, then the complete relevant test/build checks.
5. If an issue appears, stop progression. Reproduce it and inspect the failing path and surrounding ownership/context.
6. Record a concise issue note here: symptom, reproduction, root cause, relevant design constraint, chosen correction, and regression test.
7. Re-check the design against this plan. Prefer the smallest correction that preserves the intended boundary; do not add abstractions or expand scope without evidence.
8. Fix the issue, rerun focused and full checks, and update the phase status.
9. Proceed only after the exit gate is satisfied. If it is not satisfied, remain in the phase.

Do not hide, bypass, or weaken failing tests to advance a phase. Distinguish pre-existing failures from regressions. If the correct design needs to change, update this plan with the reason before implementing the change.

## Phase status and decision log

| Phase | Status | Notes |
|---|---|---|
| Plan | Complete | Documented and linked in VitePress Architecture navigation. PR #45. |
| 0 — Baseline | Complete with a fixture gap carried into Phase 1 | Existing CI suite passes; call paths and regression coverage mapped. Add explicit canonical cross-strategy event-ledger snapshots before the first strategy migration. |
| 1 — Foundation | Complete | Added normalized context, revision-bound planning contracts, shared chronological runtime, transactional decision execution, session runner, and legacy strategy adapter. Greedy now consumes the session contract. |
| 2 — Greedy | Complete | Greedy planning is session-based; actual execution moved to SimulationRuntime. A frozen pre-refactor oracle verifies the normalized financial/event ledger, and CI passes. |
| 3 — Search | Complete | GAML/Absolute retain their search algorithms and diagnostics while selected paths execute through SimulationRuntime. Frozen legacy replay parity tests pass. |
| 4 — GSS | Complete | Recursive planning remains hypothetical and emits decision paths; SimulationRuntime owns actual replay. Legacy GSS ledger/diagnostic parity and atomic batch tests pass. |
| 5 — Enforcement | Complete | Removed production strategy adapters and legacy engine fallback; immutable contexts/signals and architecture tests enforce the session boundary. CLI/browser remain engine-driven. |
| 6 — Documentation | In progress | Align lifecycle, architecture, strategy guides, and codebase map with the implemented session/runtime boundary; run the final docs build and full validation. |

### Phase 0 findings (2026-11-05)

**Validation evidence**

- PR #45 JavaScript tests workflow: Node.js 22, `npm test` — passed (run [42010842976](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42010842976)).
- PR #45 full Tests workflow: `npm ci` and `npm test` — passed (run [42010842899](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42010842899)).
- PR #45 documentation build: VitePress build and generated-site layout checks — passed (run [42010842954](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42010842954)).
- CodeQL analysis step completed successfully (run [42010842889](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42010842889)); workflow cleanup was still completing when checked.
- A local clone/test attempt was blocked because the execution container could not resolve github.com. CI is therefore the execution evidence; no local test run is claimed.

**Production entry points and direct calls**

- CLI `src/cli/fd-cal.js` constructs Greedy, GAML, Absolute or GSS and calls `new SimulationEngine().run(strategy, input)`.
- Browser `src/web/app.js` constructs Greedy, GAML or GSS and also calls `SimulationEngine.run()`.
- `src/strategies/index.js` exports strategy classes and search utilities; it does not itself execute simulations.
- Strategy `.simulate()` remains directly callable. Tests intentionally call it to verify unfinished-result/finalization boundaries. SearchStrategyBase also calls Greedy.simulate() to obtain its incumbent. These are migration-sensitive internal paths; do not remove the method until all consumers have been replaced and tests prove compatibility.

**Execution ownership inventory**

- Greedy owns an actual event loop, inline outflow settlement, transfer and booking execution, cash-flow scheduling, and SimResult construction.
- GSS owns its own actual event processing and outflow settlement as well as recursive goal planning, forecast projection/reassessment, plan execution, and result construction.
- SearchStrategyBase owns hypothetical search-state transitions, but also owns a separate actual replay loop with outflow settlement, booking/transfer execution, cash-flow scheduling, and result construction.
- `core/cashflows.js` already exposes reusable `processOutflows()`; search transitions use it, while Greedy and GSS currently implement related settlement logic inline. This is a concrete shared-rule candidate, but parity must be tested before consolidation.
- `SimulationEngine` currently only wraps strategy simulation, adds the start marker, and finalizes. `finalizeSimulation()` already enforces a finalized-result guard and is the one shared final-sweep implementation.

**Existing regression coverage**

- Core tests cover date arithmetic, interest/leap-year behaviour, eFD eligibility, transfer fees, periodic and installment cash flows, AIT, and immutable outflow settlement including strict/defer/best-effort policies.
- Greedy tests cover booking/maturity, eFD eligibility, and both option/plan tenor tie-break directions.
- Search tests cover Absolute replay/optimality, GAML settings/budget/quality, and account-level eFD eligibility.
- GSS tests cover manager-ordered candidate fallback, future inflows, parent forecast contraction, consolidation, interim booking maturity limits, no viable goal, start event, strict outflows, and three-level ancestor forecast contraction.
- The repository already contains the 54-run, three-strategy sensitivity benchmark in `docs/strategies/benchmarks/results.json`, including horizon, capital, account/bank diversity, inflow and eFD sweeps. Treat it as a scenario-specific performance reference, not a universal financial golden file.

**Gap carried forward**

The current tests provide meaningful behavioural assertions, and the benchmark provides a numeric scenario reference, but there is no single canonical fixture that compares full booking and event ledgers for Greedy, GAML, Absolute and GSS. Add focused deterministic ledger snapshots/normalization tests at the start of Phase 1, before changing any strategy execution path. Keep snapshots readable and limited to stable fields; do not snapshot incidental object internals or runtime timings.

**Phase 0 conclusion**

The current test suite and docs build are green, and the execution paths are sufficiently mapped to begin the foundation phase. The remaining ledger-fixture gap is an explicit first task in Phase 1, not a reason to redesign the plan or alter strategy logic prematurely.

### Issue notes

- Environment limitation: local Git clone could not resolve github.com. Resolved for validation by using the repository's Node.js 22 GitHub Actions workflows; local execution remains unverified.

### Design decisions

- The engine owns actual simulation progression and execution; strategies own decisions and hypothetical planning.
- GSS recursive goal frames and ancestor forecast logic remain strategy-owned.
- GAML/Absolute hypothetical search remains strategy-owned; actual replay moves to the simulation layer.
- Final consolidation remains a single engine-owned operation after the overall horizon.
- The exact strategy contract and batch-search integration are deliberately finalized in Phase 0/1 using call-path and baseline evidence, rather than assumed in advance.


### Phase 1 progress (2026-11-05)

**Contract decision**

- Added `src/core/strategy-contracts.js` with immutable planning-view snapshots, revision-bound decision/wait/completion signals, signal validation, and an authoritative account-state primitive.
- Decisions are explicit `SPLIT`, `CONSOLIDATE`, or `CARRY` plans. Waits request a future boundary; completion is explicit. Every signal carries the state revision so stale planner output can be rejected before execution.
- `SimulationState` validates balance updates as a batch before applying any mutation and increments its revision only after a non-empty successful update.
- The initial planning view deliberately exposes account values, not mutable `Account` instances or the authoritative state object.
- Added focused tests for frozen snapshots, stale revisions, atomic updates, decision-date validation, wait-boundary validation, and completion signals.

**Baseline ledger coverage**

- Added `tests/js/simulation-ledger.test.js`, which normalizes stable financial, booking, account, and event-ledger fields for Greedy, GAML, Absolute, and GSS and verifies repeat-run determinism.
- This is an initial deterministic regression baseline, not yet a checked-in golden-output fixture. It must not be treated as proof of cross-version financial equivalence; fixed expected snapshots and broader policy coverage remain open work before strategy migration.

**Current boundary**

- No strategy execution path has been migrated.
- `SimulationEngine` still uses the legacy `strategy.simulate(input)` adapter. The shared chronological executor, outflow settlement integration, decision execution, and compatibility adapter remain to be implemented and tested.
- Phase 1 remains in progress; do not begin Phase 2.

**Issue note — baseline fixture compatibility**

- Symptom: the first CI run failed only the new GAML and Absolute ledger tests; Greedy, GSS, and the contract tests passed.
- Reproduction: the shared baseline fixture supplied an FD product for BANK_A but configured a second account at BANK_B.
- Root cause: SearchStrategyBase validates that every configured account has at least one compatible FD product before search. This is an existing input contract, not an executor or strategy regression.
- Constraint: keep one common scenario valid for all four strategies; do not weaken search input validation to accommodate a test fixture.
- Correction: add an equivalent BANK_B product to the fixture, preserving the two-bank consolidation/fee scenario.
- Regression coverage: the normalized ledger test continues to execute and compare deterministic outputs for all four strategies. CI rerun is pending.

**Issue note — ISO date validator escaping**

- Symptom: code review of the added planning-view validation found the regular expression contained a doubled backslash and would match a literal backslash rather than date digits.
- Reproduction: inspect `requireISODate()`; the pattern was `/^\\\\d{4}-\\\\d{2}-\\\\d{2}$/` in source.
- Root cause: escaping was applied twice while generating the source text through the repository API.
- Constraint: the contract must reject malformed dates without accepting a non-date string.
- Correction: reduce the regex escaping to the JavaScript regex digit token (`\d`).
- Regression coverage: malformed date inputs are covered by `strategy-contracts.test.js`; CI rerun is pending.

**Phase 1 progress — normalized context**

- Added `src/core/simulation-context.js` to normalize simulation dates, account copies/IDs, FDOption-compatible options, inflows, outflows, fee configuration, and original capital at the engine boundary.
- `SimulationEngine.run()` now constructs this context and passes normalized dates, cloned accounts, normalized inflows, validated outflows, and resolved account IDs to the existing strategy adapter. Strategy execution remains legacy at this point; this change centralizes input normalization without changing strategy algorithms.
- Added context tests for schedule normalization, invalid date ranges, unknown inflow/outflow destinations, default-account behavior, and default fee configuration.

**Issue note — initial context test fixture errors**

- Symptom: the first CI run failed two new context tests; existing strategy tests and all contract/ledger tests passed.
- Reproduction: the invalid-period test changed the start date to the same day as the end date, while its old March inflow then failed the inflow-range validation first. The default-account test removed accounts but retained an outflow referencing the removed `main` account.
- Root cause: test fixture setup did not create the intended invalid period and did not isolate default-account behavior from an unrelated invalid outflow reference.
- Constraint: tests must assert the intended contract condition and not suppress production validation.
- Correction: set start after end for the invalid-period case and clear the outflow schedule in the default-account case.
- Regression coverage: corrected tests are in `tests/js/simulation-context.test.js`; CI rerun is pending.


### Phase 1 completion (2026-11-05)

**Implemented foundation**

- Added `src/core/simulation-context.js` for engine-boundary normalization of dates, accounts, FDOption-compatible products, inflows, outflows, fee configuration, and original capital.
- Added `src/core/simulation-runtime.js` as the shared actual executor. It owns chronological event progression, actual inflow/cash-flow/maturity processing, pending outflow settlement, transactional transfer/booking execution, actual event creation, and unfinished `SimResult` construction.
- Extended `SimulationState` with immutable snapshots; runtime decisions are validated against the current state revision and date before any staged transfer/booking events or balance changes are committed.
- Added `runStrategySession()` as the common strategy-session driver. `SimulationEngine` adds the simulation-start event and invokes the existing exactly-once finalizer after session completion.
- Kept the legacy `strategy.simulate(input)` adapter for unmigrated strategies. Direct strategy result callers remain supported while the migration proceeds.
- Added runtime tests for chronological cash-flow processing, successful consolidation execution, and transaction rollback when a compound decision contains an invalid FD option reference.
- Added engine-session integration tests, including stale-signal rejection.

**Exit-gate assessment**

- Foundation and runtime tests pass.
- Stale/invalid signals are rejected before state mutation; a compound transfer-plus-invalid-booking test verifies balances, ledger, booking list, and fees remain unchanged.
- Session-based actual execution has one shared runtime path. Unmigrated strategies continue through the explicitly temporary legacy adapter.
- Finalization remains in `SimulationEngine` and is invoked once for session-based runs.
- Node.js 22 full test suite, JavaScript test workflow, documentation build, and dependency review passed on commit `40aee827605c2677741653722fcbc5a6d7cd5fca`. Strategy sensitivity and CodeQL were still running when this phase note was prepared.
- Phase 1 is complete; Phase 2 begins without removing the adapter required by GAML/Absolute and GSS.

**Runtime issue notes**

- Symptom: paid-outflow events were appended to the same event array that the runtime was iterating to discover due outflows. Reproduction: process any date containing an outflow. Root cause: a live array iterator would also visit the newly appended payment event and re-enqueue it as a new obligation. Correction: snapshot due outflow events before settlement. Regression coverage: shared runtime outflow test.
- Symptom: the initial-balance trigger could be added even when another event already existed on the start date. Root cause: the first runtime draft did not retain Greedy's existing start-key guard. Correction: add the trigger only when no start-date event exists. Regression coverage: session/ledger tests and Greedy suite.
- Symptom: an invalid compound decision could increment fee/booking counters before a later operation failed. Root cause: staged event creation did not initially stage all associated counters and booking objects. Correction: stage fees, booking sequence, and booking objects alongside events, then commit only after the full decision validates. Regression coverage: invalid compound-decision atomicity test.

### Phase 2 progress — Greedy migration (2026-11-05)

- Extracted the existing `pickDailyGreedyPlan()` decision logic without changing its ranking, option tenor tie-breakers, plan tenor tie-breakers, eFD equivalence preference, or transfer-fee evaluation.
- Added `GreedyStrategy.createSession(context)`. It converts read-only planning views into temporary account values, runs the existing planner, and returns revision-bound SPLIT/CONSOLIDATE/CARRY DTOs using option indices and account IDs rather than mutable domain objects.
- Replaced Greedy's independent actual event loop, outflow settlement, transfer/booking execution, cash-flow scheduling, and result construction with a compatibility `simulate()` adapter that delegates to `runStrategySession()`.
- `SimulationEngine.run()` now selects the session executor for Greedy. SearchStrategyBase can still call Greedy's unfinished-result adapter to obtain its incumbent.
- Initial CI validation passed the complete existing test suite, JavaScript suite, documentation build, and dependency review after the Greedy migration. The strategy sensitivity study remains in progress and must be checked before declaring the Greedy phase complete.

**Phase 2 issue note — legacy parity fixture path**

- Symptom: the first CI run of the differential test failed during module resolution before executing the parity assertion.
- Reproduction: `tests/js/greedy-parity.test.js` imported `./fixtures/legacy-greedy-oracle.js`, resolving to the nonexistent `tests/js/fixtures` directory.
- Root cause: the fixture is stored under the sibling `tests/fixtures` directory.
- Constraint: keep the frozen pre-migration implementation outside the production strategy tree and use it only as a test oracle.
- Correction: change the test import to `../fixtures/legacy-greedy-oracle.js`.
- Regression coverage: the parity test now resolves the oracle; CI rerun is pending.

**Phase 2 issue note — consolidation decision snapshot parity**

- Symptom: the differential ledger test found a mismatch in `BOOKING.decision_context.balances_before` for a consolidation booking; balances, booking principal, fees, and the rest of the ledger matched.
- Reproduction: a two-account case where Greedy consolidates 9,000 and 19,500 into one account. The migrated executor recorded the post-transfer balance (28,470 and 0), while the legacy executor recorded the decision-time pre-transfer balances (9,000 and 19,500).
- Root cause: the shared runtime captured the booking snapshot inside the booking helper, after executing consolidation transfers. Legacy Greedy captures the snapshot before transfers and attaches it to the subsequent booking event.
- Constraint: decision context is part of the observable event ledger and must preserve the strategy's original snapshot semantics.
- Correction: capture the decision-start balances before executing the staged transfers and pass that snapshot to the consolidation booking; split bookings continue to snapshot immediately before each booking.
- Regression coverage: the frozen legacy Greedy oracle compares the normalized full event ledger, including decision context.

**Phase 3 issue note — search projection cent rounding during replay**

- Symptom: GAML and Absolute session replay rejected a local booking although the selected search path considered it eligible.
- Reproduction: the search projection requested a principal of 40,314.91 while the actual runtime balance was 40,314.9095890411; the 0.0004109589 difference came from search-state cent rounding.
- Root cause: hypothetical search states use rounded balances, while the legacy replay executor books the authoritative actual account balance. The first shared runtime required near-exact principal equality and therefore rejected a valid whole-account booking.
- Constraint: preserve search's rounded projection model while replaying against actual balances; do not round or alter authoritative balances merely to satisfy the hypothetical plan.
- Correction: when requested principal and actual available balance differ by no more than the existing 0.001 financial epsilon, execute the full authoritative balance. Larger mismatches remain invalid.
- Regression coverage: cross-strategy ledger tests and the frozen GAML/Absolute replay oracle verify financial and event-ledger parity.


### Phase 2 completion — Greedy

- Greedy no longer owns actual event progression, settlement, booking/transfer execution, cash-flow scheduling, or result construction.
- The existing planner and its ranking/tie-break policies remain intact. It emits account-ID/option-index decision DTOs through `createSession()`.
- The unfinished-result `simulate()` compatibility method delegates to the shared session runner for SearchStrategyBase and direct callers.
- A frozen pre-refactor Greedy oracle verifies financial totals, account balances, obligations, bookings, and normalized event-ledger parity. CI passed this test and the existing Greedy suite.
- Phase 2 is complete.

### Phase 3 progress — GAML and Absolute

- Search planning and diagnostics remain in SearchStrategyBase. The existing Absolute exhaustive search and GAML beam search generate a selected path, which is converted to revision-bound decisions.
- The session emits WAIT signals between selected decision dates. Actual chronological event processing and path execution now run through SimulationRuntime.
- Removed the separate search replay loop and result-construction path. The unfinished-result `simulate()` method is now a compatibility adapter over the shared session runner.
- Search diagnostics, optimality status, alternative leaf values, and search settings are carried into the runtime-built result.
- Added frozen pre-refactor search replay tests for GAML and Absolute. The JavaScript test workflow passed on commit `f239d2db8bbb555f80c0295c348dd7c463f4590d`; full CI and sensitivity validation remain in progress.
- Phase 3 is not complete until the full test workflow and differential replay tests pass.


### Phase 3 completion — GAML and Absolute

- SearchStrategyBase now computes the same search path and diagnostics as before, then emits revision-bound decisions for the shared runtime.
- The separate actual replay loop and result construction have been removed from SearchStrategyBase. Its direct `simulate()` method is a compatibility adapter over the session runner.
- Frozen pre-refactor replay oracles compare GAML and Absolute financial totals, bookings, account balances, obligations, event ledgers, and search diagnostics.
- JavaScript and full Node test workflows passed on the search migration validation. The strategy sensitivity workflow also completed successfully during this phase.
- Phase 3 is complete.

### Phase 4 progress — GSS

- GSS recursive goal planning and forecast reassessment remain in GSS as hypothetical planning. The planner now records a structured decision path rather than returning its internally simulated ledger as the actual result.
- GSS sessions translate SPLIT, CONSOLIDATE, and CARRY actions into revision-bound signals. The shared runtime performs actual event progression, outflow settlement, transfers, bookings, cash-flow scheduling, and result construction.
- Added same-date BATCH decisions so multiple GSS actions at one boundary can be validated and committed as one atomic execution transaction.
- Runtime options preserve GSS-specific legacy semantics: cent rounding, opening-balance trigger behaviour, and outflow ordering.
- Added a frozen legacy GSS oracle covering future inflows, recursive parent contraction, consolidation, and strict outflows. Full-ledger parity and existing GSS tests passed on the initial migration validation.
- The latest changes encapsulating the hypothetical planner and adding explicit atomic-batch tests still require CI validation. Phase 4 remains in progress.


### Phase 4 completion — GSS

- GSS's recursive goal frames, ancestor reforecasting, contraction, early-goal execution, candidate ordering, and interim-plan selection remain in its private hypothetical planner.
- The planner records the selected sequence as structured decisions. GSS no longer returns its hypothetical ledger as the actual result; its session replays that path through SimulationRuntime.
- Same-date GSS decisions are represented as one atomic BATCH signal, preserving order while ensuring all staged balance/event/booking/fee changes commit together or not at all.
- Runtime configuration preserves GSS's cent rounding, opening-trigger insertion, and outflow ordering. Booking and carry decision contexts and the strategy's decision log/diagnostics are retained.
- Frozen legacy parity tests cover future inflows, recursive parent contraction, cross-bank consolidation, and strict outflows. Existing GSS tests, full ledger parity tests, atomic batch tests, JavaScript tests, and full Node tests passed on the latest GSS migration validation.
- Phase 4 is complete.

**Phase 4 issue notes**

- Symptom: the first batch-executor test run raised a ReferenceError while validating the new BATCH action. Root cause: the runtime used `StrategyDecisionType.BATCH` without importing `StrategyDecisionType`. Correction: add the explicit import. Regression coverage: atomic batch tests and GSS parity tests.
- Symptom: the first GSS parity test reported empty legacy account balances while migrated balances were populated. Root cause: the legacy GSS result stores accounts in a `Map`, while the runtime result stores them in an object; the test normalizer used `Object.entries(Map)`. Correction: normalize both supported account containers. Regression coverage: all four frozen GSS parity scenarios now pass.


### Phase 5 progress — enforce engine ownership

- Removed the public `simulate(input)` adapters from Greedy, SearchStrategyBase (therefore GAML/Absolute), and GSS.
- `SimulationEngine.run()` now accepts only strategies implementing `createSession(context)`; the legacy simulate-only fallback has been removed.
- SearchStrategyBase's Greedy incumbent now runs through `SimulationEngine.runUnfinalized()`, an engine-owned projection path that deliberately omits the start marker/final sweep for search scoring. It does not call a strategy execution method.
- The session runner is now private to `src/core/simulation.js`. Public strategy classes expose planning sessions, not actual simulation entry points.
- Simulation input context now clones and deeply freezes FD options, account values, fee configuration, and cash-flow schedules. Strategies receive isolated date copies, so mutating their context cannot alter runtime-owned dates or state.
- Updated parity and unfinished-result tests to use the engine's explicit unfinalized projection path. Added architecture tests proving all production strategies expose `createSession` and no `simulate`, and that simulate-only strategies are rejected.
- JavaScript tests passed on commit `4792a157481c644af526d226378a6a2a1ce7d093`; the full Node test workflow is still running.

**Phase 5 issue note — frozen search oracle incumbent**

- Symptom: after removing Greedy's production `simulate()` adapter, the frozen legacy SearchStrategyBase oracle failed before replay because its incumbent calculation still called `GreedyStrategy.simulate()`.
- Reproduction: run the GAML/Absolute differential replay tests against the legacy search oracle.
- Root cause: the oracle intentionally retains the old search replay implementation but imports the current production Greedy class for its incumbent, creating a dependency on the removed adapter.
- Constraint: keep the old search replay as the test oracle without reintroducing production strategy execution adapters.
- Correction: route the oracle's incumbent through `SimulationEngine.runUnfinalized()`, matching the new engine-owned incumbent path.
- Regression coverage: GAML and Absolute legacy replay parity tests passed in the subsequent JavaScript test workflow.


**Phase 5 issue note — immutable signal enforcement test**

- Symptom: the new context-isolation test failed when the fake session returned a hand-written mutable completion object.
- Reproduction: run the strategy-context immutability test after enabling strict signal immutability validation.
- Root cause: the test strategy did not use the signal factory contract; production strategies already return factory-created frozen signals.
- Constraint: do not weaken immutable signal validation to accommodate a test-only implementation.
- Correction: update the fake session to return `createStrategyComplete()`.
- Regression coverage: engine-session tests and the immutable-signal contract test.

**Phase 5 ownership boundary**

- The production strategy classes no longer define `simulate()`. Greedy, GAML, Absolute, and GSS expose `createSession()` only.
- `SimulationEngine.run()` rejects simulate-only strategy objects. `runUnfinalized()` remains an engine-owned internal projection path used by SearchStrategyBase to score its Greedy incumbent and by focused unfinished-result tests.
- Strategy contexts contain cloned, deeply frozen account, FD option, fee, and cash-flow values. Strategies receive isolated Date copies, not the runtime's authoritative Date objects.
- Decision, wait, completion, and batch signals are factory-created and deeply immutable; runtime validates the signal revision/date before execution.
- Added architecture tests for strategy entry points, legacy adapter rejection, runtime/finalization ownership, and CLI/browser engine usage.


### Phase 5 completion — enforce ownership

- All production strategies now expose `createSession(context)`; no production strategy class exposes `simulate(input)`.
- `SimulationEngine.run()` rejects simulate-only strategies and always executes a session through the shared runtime before adding the start marker and finalizing exactly once.
- The search incumbent projection uses `SimulationEngine.runUnfinalized()`, so even hypothetical incumbent execution is owned by the simulation layer rather than a strategy adapter.
- The shared session runner is private to the simulation module. Strategies receive deeply immutable input values and read-only revisioned planning views; they cannot mutate runtime account state, options, fee configuration, or cash-flow schedules through the supplied context.
- Strategy signals and nested plans must be deeply immutable and revision-bound. Stale, malformed, or mutable signals are rejected before execution.
- Added architecture tests for the absence of strategy `simulate()` methods, rejection of legacy simulate-only strategies, runtime/finalization ownership, and CLI/browser use of SimulationEngine.
- JavaScript tests passed on commit `c67f024da95f007017bb8124450b22c96d5ee0f3`. The Node 22 full test step also completed successfully on that commit before the workflow was cancelled during cleanup; the immediately preceding full Tests workflow passed on commit `6ba6c8e6ddc48235efb2ba8855a68a6c72c58fcc`.
- Phase 5 is complete. Phase 6 documentation alignment is now in progress.
