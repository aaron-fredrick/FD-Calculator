# Strategy documentation

FD Cal provides four planning strategies. The technical references below are listed alphabetically.

## Strategy guide

See the [strategy comparison](/STRATEGIES) for purpose, trade-offs, settings and optimality guarantees.

## Technical references

- [Absolute](/strategies/ABSOLUTE) — exhaustive branch-and-bound search and optimality proof conditions.
- [Absolute+](/strategies/ABSOLUTE-PLUS) — bounded search based on the Absolute optimisation approach.
- [Greedy](/strategies/GREEDY) — local SPLIT/CONSOLIDATE/CARRY decisions, option selection and tie-breakers.
- [GSS](/strategies/GSS) — recursive goal planning, forecast contraction and shared-runtime decision replay.

## Simulation objectives

- [Goal-based simulation](/strategies/goal-achievement) — first-credit consolidation net-interest objective, horizon semantics, strategy evaluation and goal sensitivity methodology.
- [Dual-scope search strategy implementation plan](/strategies/dual-scope-search-implementation-plan) — phase-by-phase integration and scoped-regression acceptance gates.

## Performance and sensitivity

- [Strategy sensitivity benchmark](/strategies/benchmarks) — measured net-interest response to investment horizon, capital, account/bank diversity, inflows and eFD eligibility.

## Architecture

- [Codebase map](/reference/CODEBASE) — where strategy implementations fit into the application architecture.
