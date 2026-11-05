# Absolute — technical reference

## Purpose

Absolute is the exhaustive branch-and-bound portfolio optimiser. It explores the feasible decision space and uses an incumbent solution plus admissible upper bounds to prune branches that cannot improve the incumbent.

**Implementation:** `src/strategies/absolute.js` and the shared search implementation in `src/strategies/search-strategy-base.js`.

## Search model

1. Build the same financial and event context used by the search strategies.
2. Run Greedy to obtain a feasible incumbent and lower bound.
3. Recursively expand feasible SPLIT, CONSOLIDATE and carry decisions across relevant event dates.
4. Update the incumbent when a better complete feasible path is found.
5. Prune a branch only when its upper bound cannot beat the incumbent, or when its state is dominated/equivalent to an already explored state.
6. Emit the best complete path as revision-bound session decisions for the shared runtime to execute.

Unlike GAML, Absolute does not retain only a fixed-width beam. Its local booking combinations are exhaustive, and its search is not stopped by a GAML beam-width limit.

## Scope-specific objective

Absolute supports both simulation scopes without changing its search identity.

- **Scoped mode** retains the finite-range terminal-portfolio objective, its admissible upper bound, memoisation/dominance behaviour and existing local combination ordering.
- **Goal mode** optimises the earliest event boundary at which the configured net-interest target is actually credited to the consolidation account. Candidate paths are replayed through the authoritative `SimulationEngine`; projected tenor interest is never treated as achieved credit.

Goal mode deliberately does not reuse scoped terminal-value pruning or memoisation. It keeps the full account-compatible product set rather than applying the scoped product-dominance reduction, and it retains executable consolidation paths even when projected FD interest less transfer fees is negative. This is necessary because transfer fees are allocated proportionally across principal and interest provenance: a transfer can still credit enough previously uncredited interest to reach the target.

The exhaustive goal search compares achieved paths by earliest achievement date, then the established same-date higher-credited-interest, lower-fee and lower-operation tie-breaks. Once an achieved incumbent exists, states strictly later than its achievement date are pruned; same-date states remain eligible for tie-breaking. This date pruning cannot remove a path that could achieve at the incumbent's earlier boundary.

## Optimality guarantee

Absolute can report `optimality_proven: true` when its scoped branch-and-bound search completes under the configured model, or when its goal-mode exhaustive search completes without any local, bound or memo pruning that could invalidate the active objective. This is a proof relative to the supplied FD catalogue, account capabilities, cash-flow schedules, fees, tax and interest assumptions—not a guarantee about future bank rates or real-world outcomes outside the model.

If execution is interrupted externally or the implementation reports an incomplete search, the best feasible result must not be described as proven optimal.

## Complexity and practical limits

The decision space grows rapidly with:

- Number of accounts and eligible FD products.
- Number of relevant event dates and investment horizon.
- Available split and consolidation combinations.
- Cash-flow schedules and the number of distinct future states.

Dominance, memoisation and bound pruning reduce work, but do not remove worst-case combinatorial growth. Absolute is therefore exposed through the CLI rather than the browser UI.

## Diagnostics

Inspect the search diagnostics and `optimality_proven` flag with every result. Net interest alone does not tell whether the result is an exhaustive optimum or merely the best path found before an incomplete run.

## Shared simulation lifecycle

Absolute exposes `createSession(context)`. Its exhaustive search remains hypothetical and returns the selected decision path; it does not execute the authoritative event timeline or construct the actual result. `SimulationRuntime` executes the path, and `SimulationEngine` performs exactly one final consolidation sweep. Search branches do not finalise or sweep independently.
