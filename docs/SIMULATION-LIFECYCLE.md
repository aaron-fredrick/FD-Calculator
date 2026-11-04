# Simulation lifecycle

The simulation engine owns lifecycle finalization. Strategies own investment decisions and event generation; they do not perform the final consolidation sweep or create final idle-balance events.

## Execution boundary

1. The caller selects and configures a strategy.
2. `SimulationEngine.run(strategy, input)` executes that strategy over the complete investment horizon.
3. The strategy returns an unfinished `SimResult`. It must respect the supplied overall start and end dates.
4. The simulation engine performs the final consolidation sweep into the configured consolidation account.
5. The engine records any remaining liquid balances as final idle events and returns the finalized result.

The CLI and browser tool must execute strategies through `SimulationEngine`. Calling a strategy's `simulate(input)` method directly returns its unfinished strategy result and is intended for internal strategy execution and tests.

## Invariants

- Exactly one final consolidation sweep per completed simulation.
- The sweep occurs after the selected strategy has processed the overall simulation horizon.
- Recursive planning or search boundaries are not finalization boundaries.
- Strategies must not add final sweep transfers or final idle-balance events.
- Final sweep fees are included in the result's total transfer fees.
- A result cannot be finalized twice.
- Strategy selection does not change who owns finalization.

This lifecycle applies to Greedy, GAML, and Absolute. GSS will use the same simulation engine when implemented.
