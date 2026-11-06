# Strategy guide

FD Cal separates strategy documentation by simulation objective. Strategies are not assumed to be interchangeable across objectives.

## Scoped Range

All four currently supported strategies optimise the selected date range: maximise the portfolio outcome within the user's start and end dates, subject to cash-flow, liquidity, FD eligibility and transfer constraints.

| Strategy | Search method | Typical use | Optimality |
|---|---|---|---|
| **Greedy** | Immediate SPLIT / CONSOLIDATE / CARRY decisions. | Fast, deterministic baseline. | Heuristic; no proof |
| **GSS** | Recursive SPLIT / CONSOLIDATE planning with liquidity-aware waits. | Recursive scoped plans with interim investments. | Heuristic; no proof |
| **Absolute R** | Exhaustive branch-and-bound over the scoped decision space. | CLI-only exhaustive search and optimality proof on tractable scenarios. | Proven when search completes with valid bounds |
| **Absolute R+** | Bounded layered beam search with local-branch and state controls. | Practical search when exhaustive exploration is too expensive. | Proven only when search completes without truncation |

### Technical references

- [Greedy](strategies/GREEDY.md)
- [GSS](strategies/GSS.md)
- [Absolute R](strategies/ABSOLUTE.md)
- [Absolute R+](strategies/ABSOLUTE-PLUS.md)

### Scoped Range benchmark

See the [Scoped Range sensitivity benchmark](strategies/benchmarks.md#scoped-range) for the shared scenario, bank catalogues, graphs, findings and reproducibility details.

## Goal

**Status: Under development — no benchmark data available yet.**

Goal-based net-interest optimisation is disabled in the browser and rejected by the public configuration validator and JSON schema. No Goal strategy is currently selectable and no Goal performance data is published.

The intended first Goal optimiser is **Absolute R**, using an earliest-authoritative-credit objective. Greedy, GSS and Absolute R+ remain scoped-range strategies; they are not dual-optimised.


## Simulation boundary

The simulation runtime owns chronological event processing, actual account balances, FD cash flows and maturities, outflow settlement, transfer execution, result construction and finalisation. Strategies own hypothetical planning and decision selection. The runtime validates and executes their decisions.

All currently supported public runs use the selected scoped start and end dates. The final consolidation sweep occurs once after the scoped horizon completes.
