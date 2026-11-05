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

## Optimality guarantee

Absolute can report `optimality_proven: true` when its exhaustive branch-and-bound search completes under the configured model. This is a proof relative to the supplied FD catalogue, account capabilities, cash-flow schedules, fees, tax and interest assumptions—not a guarantee about future bank rates or real-world outcomes outside the model.

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
