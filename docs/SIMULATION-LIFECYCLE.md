# Simulation lifecycle

The simulation layer owns actual execution and finalization. Strategies own investment decisions and strategy-specific hypothetical planning; they do not process the authoritative event timeline or mutate actual account balances. The selected scope changes the optimisation objective and stopping boundary, not ownership of execution.

## Ownership

| Component | Responsibility |
|---|---|
| `SimulationEngine` | Public execution entry point, input normalization, session driving, simulation-start event, and exactly-once finalization. |
| `SimulationRuntime` | Authoritative balances, chronological actual event processing, outflow settlement, transfer/booking execution, actual cash-flow scheduling, event ledger, and unfinished `SimResult` construction. |
| Strategy session | Read-only planning, hypothetical search/forecasting, and revision-bound decision/wait/completion signals. |
| `SimulationState` | Revisioned authoritative account values used by the runtime; strategies receive immutable snapshots instead. |

## Execution flow

1. The CLI or browser selects a strategy and calls `SimulationEngine.run(strategy, input)`.
2. The engine creates a normalized `SimulationContext`, including cloned account/FD values and validated cash-flow schedules.
3. The runtime is created with authoritative account state and the initial actual event timeline.
4. The strategy receives an isolated context view and creates a session. The session's `nextSignal(view)` method receives a deeply immutable planning snapshot.
5. The engine advances the runtime to the next actual event date or requested wait boundary. The runtime applies inflows, FD cash flows and maturities, recognises eligible consolidation interest, then settles due outflows. In goal scope, it checks the credited net-interest target at the resulting event boundary.
6. The strategy returns an immutable, revision-bound `SPLIT`, `CONSOLIDATE`, `CARRY`, `BATCH`, `WAIT`, or `COMPLETE` signal. The runtime validates the revision/date and validates the complete decision before committing any balance or ledger mutation.
7. The runtime builds the unfinished result when the scoped date range completes, the goal is achieved, or the goal safety horizon is exhausted. The engine adds the one simulation-start marker and invokes the finalizer once.
8. Finalization performs the single simulation-wide consolidation sweep, records remaining idle balances, and marks the result finalized. In goal scope, this occurs at the achievement boundary or safety boundary; it does not extend the simulation to a user-selected end date.

A stale signal, malformed plan, invalid account reference, invalid transfer, or ineligible booking is rejected before the decision's staged mutations are committed. A session cannot signal completion before the overall horizon has been processed. Same-date GSS decisions use an atomic batch so a later invalid sub-action cannot leave earlier sub-actions partially executed.

## Strategy planning boundaries

- **Greedy** evaluates the current immutable account snapshot with its existing SPLIT/CONSOLIDATE/CARRY planner.
- **Absolute** retains exhaustive scoped branch-and-bound. In goal scope it uses the earliest actual consolidation-credit objective, preserves all compatible products and executable fee-heavy transfer paths, and relies on authoritative candidate replay.
- **Absolute+** retains bounded scoped beam search. In goal scope it uses provenance-aware beam/local ranking and a goal-date-aware wait decision; candidate replay remains authoritative and bounded-search pruning prevents an optimality claim.
- **GSS** retains its recursive planner, forecast contraction, ancestor reforecasting and interim-plan exploration. In goal scope its private planner carries a provenance ledger, ranks plans by projected consolidation-credit timing and stops planning when its ledger reaches the target. It emits a decision path; the runtime processes the actual events and executes that path.

Hypothetical strategy projections may use local copies of financial/event models to evaluate future choices. Goal-aware provenance and payout estimates improve search ordering, but they are not the authoritative simulation ledger and are never returned as the actual result. Only the runtime's credited-interest ledger can terminate goal scope or determine the reported achievement date.

## Finalization invariants

- Exactly one final consolidation sweep per completed `SimulationEngine.run()`.
- In scoped mode, the sweep occurs after the requested date range and strategy session complete. In goal mode, it occurs after the first achieved goal boundary or after the internal safety horizon if the target is unreachable.
- Recursive planning frames, search branches, waits and hypothetical projections are not finalization boundaries.
- Strategies do not create the actual final result or final sweep events.
- Final sweep fees are included in total transfer fees.
- A finalized result cannot be finalized a second time.
- Strategy choice does not change who owns actual execution or finalization.

## Internal projection path

`SimulationEngine.runUnfinalized()` is an engine-owned projection entry used by SearchStrategyBase to score its Greedy incumbent and by focused lifecycle tests. It uses the same session runtime but intentionally omits the simulation-start marker and final sweep. SearchStrategyBase uses it for authoritative goal-path replay; prefix projections may stop at a search boundary without finalization. Production CLI and browser simulations use `SimulationEngine.run()`.

## Production entry points

The CLI and browser application must execute through `SimulationEngine.run()`. Production strategy classes expose `createSession(context)`; they do not expose a `simulate(input)` execution adapter.
