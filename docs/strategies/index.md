# Strategy documentation

FD Cal provides four planning strategies. The technical references below are listed alphabetically.

## Strategy guide

See the [strategy comparison](/STRATEGIES) for purpose, trade-offs, settings and optimality guarantees.

## Technical references

- [Absolute R](/strategies/ABSOLUTE) — exhaustive scoped branch-and-bound search and optimality proof conditions.
- [Absolute R+](/strategies/ABSOLUTE-PLUS) — bounded scoped search based on the Absolute R optimisation approach.
- [Greedy](/strategies/GREEDY) — local SPLIT/CONSOLIDATE/CARRY decisions, option selection and tie-breakers.
- [GSS](/strategies/GSS) — recursive goal planning, forecast contraction and shared-runtime decision replay.

## Simulation objectives

- [Goal-based simulation](/strategies/goal-achievement) — under-development status and the current public availability boundary.
- [Goal-mode rework plan](/strategies/goal-mode-rework-plan) — future Absolute R-only goal optimisation architecture.

## Performance and sensitivity

- [Strategy sensitivity benchmark](/strategies/benchmarks) — measured net-interest response to investment horizon, capital, account/bank diversity, inflows and eFD eligibility.

## Architecture

- [Codebase map](/reference/CODEBASE) — where strategy implementations fit into the application architecture.
