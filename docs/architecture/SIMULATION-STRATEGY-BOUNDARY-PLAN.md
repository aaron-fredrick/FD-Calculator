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
| 1 — Foundation | Ready to start | Finalize the contract and build the shared execution foundation without changing strategy algorithms. |
| 2 — Greedy | Not started | Preserve decision semantics. |
| 3 — Search | Not started | Preserve hypothetical search and actual replay parity. |
| 4 — GSS | Not started | Preserve recursive forecast semantics. |
| 5 — Enforcement | Not started | Remove adapters and enforce ownership. |
| 6 — Documentation | Not started | Align docs after implementation. |

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
