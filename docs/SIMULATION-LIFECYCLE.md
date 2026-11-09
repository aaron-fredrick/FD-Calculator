# Simulation lifecycle

The simulation layer owns actual execution and finalisation. Strategies own investment decisions and strategy-specific hypothetical planning; they do not process the authoritative event timeline or mutate actual account balances.

## Ownership

1. The engine normalises and validates the input configuration and creates a `SimulationContext`.
2. The engine creates `SimulationRuntime` with authoritative account state and the actual event timeline.
3. The selected strategy receives an isolated context view and creates a planning session.
4. The engine advances the runtime to the next actual event date or requested wait boundary. The runtime applies inflows, FD cash flows and maturities, then settles due outflows.
5. The strategy returns an immutable, revision-bound `SPLIT`, `CONSOLIDATE`, `CARRY`, `BATCH`, `WAIT` or `COMPLETE` signal. The runtime validates the complete decision before committing balance or ledger mutations.
6. The runtime builds the unfinished result when the scoped date range completes or the strategy session completes.
7. The engine adds the simulation-start marker and invokes finalisation exactly once.
8. Finalisation performs the single simulation-wide consolidation sweep, records remaining idle balances and marks the result finalised.

A stale signal, malformed plan, invalid account reference, invalid transfer or ineligible booking is rejected before the decision's staged mutations are committed. Same-date GSS decisions use an atomic batch so a later invalid sub-action cannot leave earlier sub-actions partially executed.

## Strategy planning boundaries

- **Absolute R** retains exhaustive scoped branch-and-bound, terminal-value scoring, admissible bounds and exhaustive local combinations.
- **Absolute R+** retains bounded scoped beam search, local-branch ordering, root diversity and configured search limits.
- **Greedy** evaluates the current immutable account snapshot with its existing SPLIT / CONSOLIDATE / CARRY planner.
- **GSS** retains its recursive planner, forecast contraction, ancestor reforecasting and interim-plan exploration within the requested scoped horizon.

Hypothetical strategy projections may use local copies of financial and event models to evaluate future choices. Those projections are not the authoritative simulation ledger and are never returned as the actual result.

## Finalisation invariants

- Exactly one finalisation pass per completed `SimulationEngine.run()`.
- The scoped run performs one final consolidation sweep after the requested date range and strategy session complete.
- Recursive planning frames, search branches, waits and hypothetical projections are not finalisation boundaries.
- Strategies do not create the actual final result or final sweep events.
- Final sweep fees are included in total transfer fees.

## Goal-mode development boundary

Goal-runtime support remains in the internal engine and its direct unit tests while the user-facing mode is disabled. Public configuration validation and the browser do not expose goal mode. The planned future optimiser is Absolute R only; no Goal-specific optimisation branches should be added to Greedy, GSS or Absolute R+.
