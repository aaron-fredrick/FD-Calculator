# Strategy documentation

FD Cal provides several planning strategies. They share the same simulation and financial models, but use different decision processes and search boundaries.

## Strategy guide

The [strategy comparison](/STRATEGIES) explains the purpose, trade-offs, settings and optimality guarantees of each strategy.

## Performance and sensitivity

- [Strategy sensitivity benchmark](/strategies/benchmarks) — measured net-interest response to investment horizon, capital, account/bank diversity, inflows and eFD eligibility.

## Technical references

- [Greedy technical reference](/strategies/GREEDY) — session planning, SPLIT/CONSOLIDATE/CARRY decisions, option selection and tie-breakers.
- [Absolute technical reference](/strategies/ABSOLUTE) — exhaustive branch-and-bound search and optimality proof conditions.
- [Absolute+ technical reference](/strategies/ABSOLUTE-PLUS) — bounded search based on the Absolute optimisation approach, with search budgets and optimality status.
- [Greedy technical reference](/strategies/GREEDY) — session planning, SPLIT/CONSOLIDATE/CARRY decisions, option selection and tie-breakers.
- [GSS technical reference](/strategies/GSS) — recursive hypothetical goal planning, decision-path replay, SPLIT/CONSOLIDATE evaluation, forecast contraction and shared runtime finalisation.
- [Codebase map](/reference/CODEBASE) — where strategy implementations fit into the application architecture.
