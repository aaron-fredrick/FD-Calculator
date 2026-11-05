# Simulation lifecycle

The simulation layer owns actual execution and finalization. Strategies own investment decisions and strategy-specific hypothetical planning; they do not process the authoritative event timeline or mutate actual account balances.

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
5. The engine advances the runtime to the next actual event date or requested wait boundary. The runtime applies inflows, FD cash flows and maturities, then settles due outflows.
6. The strategy returns an immutable, revision-bound `SPLIT`, `CONSOLIDATE`, `CARRY`, `BATCH`, `WAIT`, or `COMPLETE` signal. The runtime validates the revision/date and validates the complete decision before committing any balance or ledger mutation.
7. The runtime builds the unfinished result. The engine adds the one simulation-start marker and invokes the finalizer once.
8. Finalization performs the single simulation-wide consolidation sweep, records remaining idle balances, and marks the result finalized.

A stale signal, malformed plan, invalid account reference, invalid transfer, or ineligible booking is rejected before the decision's staged mutations are committed. A session cannot signal completion before the overall horizon has been processed. Same-date GSS decisions use an atomic batch so a later invalid sub-action cannot leave earlier sub-actions partially executed.

## Strategy planning boundaries

- **Greedy** evaluates the current immutable account snapshot with its existing SPLIT/CONSOLIDATE/CARRY planner.
- **GAML and Absolute** retain their hypothetical search state, branch expansion, pruning and diagnostics. Their selected path is emitted as session decisions; actual replay is performed by the runtime.
- **GSS** retains its recursive goal frames, forecast contraction, ancestor reforecasting and interim-plan exploration in a private hypothetical planner. It emits a decision path; the runtime processes the actual events and executes that path.

Hypothetical strategy projections may use local copies of financial/event models to evaluate future choices. Those projections are not the authoritative simulation ledger and are never returned as the actual result.

## Finalization invariants

- Exactly one final consolidation sweep per completed `SimulationEngine.run()`.
- The sweep occurs after the runtime has processed the complete simulation horizon and the strategy session has completed.
- Recursive planning frames, search branches, waits and hypothetical projections are not finalization boundaries.
- Strategies do not create the actual final result or final sweep events.
- Final sweep fees are included in total transfer fees.
- A finalized result cannot be finalized a second time.
- Strategy choice does not change who owns actual execution or finalization.

## Internal projection path

`SimulationEngine.runUnfinalized()` is an engine-owned projection entry used by SearchStrategyBase to score its Greedy incumbent and by focused lifecycle tests. It uses the same session runtime but intentionally omits the simulation-start marker and final sweep. Production CLI and browser simulations use `SimulationEngine.run()`.

## Production entry points

The CLI and browser application must execute through `SimulationEngine.run()`. Production strategy classes expose `createSession(context)`; they do not expose a `simulate(input)` execution adapter.
