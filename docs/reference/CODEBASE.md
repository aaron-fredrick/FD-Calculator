# Codebase map

This page describes the main runtime boundaries and responsibilities of the shared modules. It is a navigation aid, not a substitute for the implementation.

## Repository layout

| Path | Responsibility |
|---|---|
| `src/core/` | Financial domain, normalized simulation context, authoritative runtime/state, event processing, lifecycle and result models. |
| `src/strategies/` | Strategy sessions, investment decision logic, hypothetical planning and shared search algorithms. |
| `src/fd-options/` | FD option discovery, eligibility and manager-owned candidate ordering. |
| `src/io/` | CSV parsing and Node-side data loading. |
| `src/reporting/` | Shared console formatting and standalone HTML report generation. |
| `src/cli/` | Node.js command-line entry point. |
| `src/web/` | Browser application and interactive scenario configuration. |
| `data/` | Bank and FD product datasets shared by both runtimes. |
| `schema/` | Configuration schema and validation contract. |
| `tests/` | Engine, strategy, CLI and browser-facing regression tests. |
| `docs/` | User, strategy, architecture and contributor documentation. |
| `archive/` | Preserved legacy Python project snapshot. |

## Runtime boundaries

The Node.js CLI and GitHub Pages web application use the same JavaScript calculation engine. Environment-specific work belongs in adapters: core and strategy modules should not depend on the DOM, Node-only APIs or environment-specific file access.

The web application exposes Greedy, GSS and Absolute R+ for scoped date-range simulations. Absolute R remains CLI-only for internal verification and testing. Goal mode is disabled in public configuration.

## Simulation lifecycle

All production execution enters through `SimulationEngine.run(strategy, input)`.

- `simulation-context.js` normalizes and validates input, cloning and freezing the values supplied to strategy planning.
- `simulation-runtime.js` owns authoritative balances, actual event progression, outflow settlement, transfer and booking execution, cash-flow scheduling, the event ledger and unfinished result construction.
- `simulation.js` drives revision-bound strategy sessions, adds the simulation-start marker and performs exactly-once finalization.
- `strategy-contracts.js` defines immutable planning views and decision, wait, completion and batch signals.
- `SimulationState` provides revisioned authoritative account values. Strategies receive immutable snapshots, not the state object.

The runtime processes actual events chronologically. A strategy may request a future wait boundary or return a decision. The runtime validates the decision against the current revision and date, validates the complete plan, and commits staged changes atomically. The final consolidation sweep is simulation-wide and occurs once after the horizon.

See [the simulation lifecycle reference](../SIMULATION-LIFECYCLE.md).

## Strategy boundary

Production strategies expose `createSession(context)`; they do not expose a `simulate(input)` execution method. A session consumes read-only planning views and returns immutable decision signals. It does not own actual event processing, settlement, booking/transfer execution or result construction.

- **Greedy** uses `pickDailyGreedyPlan()` to make local SPLIT/CONSOLIDATE/CARRY decisions from the current view.
- **Absolute R+** retains bounded beam search and diagnostics, then emits its selected path as session decisions.
- **Absolute R** retains exhaustive branch-and-bound search, then emits its selected path as session decisions.
- **GSS** retains recursive scoped planning, forecast contraction and interim-plan exploration in a private hypothetical planner, then emits its selected decision path.

Hypothetical strategy projections may use local financial/event state to explore possible futures. The authoritative simulation and actual ledger remain in SimulationRuntime.

See [the strategy guide](../STRATEGIES.md) for decision details.

## FD option manager

FDOptionManager is the shared boundary for FD candidate discovery and ordering. It supplies the eligible candidate list for the relevant account and horizon. Strategies should consume that order rather than duplicating eligibility or rate/tenor ranking rules.

GSS uses manager-provided candidates and evaluates their viability. It does not independently reorder them by rate or tenor.

## Shared modules

### Core engine

- `simulation-context.js`: normalized immutable inputs.
- `strategy-contracts.js`: revision-bound immutable planning views and signals.
- `simulation-runtime.js`: actual chronological execution and result construction.
- `simulation.js`: session driving and finalization.
- `events.js`, `cashflows.js`, `models.js`, `results.js`: shared domain primitives.

Keep the core runtime-neutral so CLI and browser calculations remain equivalent.

### Reporting

The reporting modules generate the common report model and standalone HTML output. The CLI and browser frontends should use the same reporting implementation.

### I/O

I/O adapters load and parse external data. Keep filesystem-specific operations outside the shared calculation engine.

### Web application

The web frontend configures scenarios, invokes `SimulationEngine.run()` and presents the resulting report. It should not contain a second implementation of financial or strategy logic.

## Related references

- [Strategy guide](../STRATEGIES.md)
- [Simulation lifecycle](../SIMULATION-LIFECYCLE.md)
- [GSS technical reference](../strategies/GSS.md)
- [Migration plan](../MIGRATION_PLAN.md)
- [Contributing guide](/guide/contributing)
- [Repository README](https://github.com/aaron-fredrick/FD-Calculator/blob/main/README.md)
