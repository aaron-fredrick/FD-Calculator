# Strategy documentation

FD Cal provides several planning strategies. They share the same simulation and financial models, but use different decision processes and search boundaries.

## Strategy guide

The [strategy comparison](/STRATEGIES) explains the purpose, trade-offs, settings and optimality guarantees of each strategy.

## Performance and sensitivity

- [Strategy sensitivity benchmark](/strategies/benchmarks) — measured net-interest response to investment horizon, capital, account/bank diversity, inflows and eFD eligibility.

## Technical references

- [Greedy technical reference](/strategies/GREEDY) — event-driven decisions, SPLIT/CONSOLIDATE/CARRY plans, option selection and tie-breakers.
- [Absolute technical reference](/strategies/ABSOLUTE) — exhaustive branch-and-bound search and optimality proof conditions.
- [GAML technical reference](/strategies/GAML) — bounded beam search, local branch pruning, decision budgets and optimality status.
- [GSS technical reference](/strategies/GSS) — recursive goal planning, SPLIT/CONSOLIDATE evaluation, forecast contraction and shared simulation finalisation.
- [Codebase map](/reference/CODEBASE) — where strategy implementations fit into the application architecture.
