# Strategy documentation

FD Cal documents strategy behaviour separately for each simulation objective.

## Scoped Range

The supported strategies optimise the selected start and end dates. Their current objective, trade-offs and optimality limits are summarised in the [strategy guide](/STRATEGIES#scoped-range).

### Technical references

- [Greedy](/strategies/GREEDY) — local SPLIT/CONSOLIDATE/CARRY decisions and option-selection rules.
- [GSS](/strategies/GSS) — recursive scoped planning, liquidity-aware waiting and candidate ordering.
- [Absolute R](/strategies/ABSOLUTE) — exhaustive scoped branch-and-bound search and optimality proof conditions.
- [Absolute R+](/strategies/ABSOLUTE-PLUS) — bounded scoped search, controls and search diagnostics.

### Benchmark

- [Scoped Range benchmark](/strategies/benchmarks#scoped-range) — measured net-interest response to horizon, capital, account/bank diversity, inflows and eFD eligibility.

## Goal

**Status: Under development — no benchmark data available yet.**

Goal mode is disabled and is not currently user-selectable. The intended first Goal optimiser is Absolute R; the other three strategies remain Scoped Range only.

- [Goal-mode rework plan](/strategies/goal-mode-rework-plan) — architecture, implementation phases and release gates.

## Architecture

- [Codebase map](/reference/CODEBASE) — where strategy implementations fit into the application architecture.
