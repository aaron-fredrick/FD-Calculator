# Strategy guide

FD Cal exposes four strategies. All four currently optimise the same **scoped date-range objective**: maximise the portfolio outcome within the user-selected investment window, subject to cash-flow, liquidity, FD eligibility and transfer constraints.

Goal-based net-interest planning is under development and is not selectable through the browser or public configuration schema. The existing goal-runtime tests and implementation are retained as development scaffolding; they are not a supported user-facing mode.

## At a glance

| Strategy | Search method | Typical use | Optimality |
|---|---|---|---|
| **Absolute R** | Exhaustive branch-and-bound over the scoped decision space. | CLI-only exhaustive benchmark and optimality proof on tractable scenarios. | Yes, when search completes with valid bounds |
| **Absolute R+** | Bounded layered beam search with local-branch and state controls. | Practical search when exhaustive exploration is too expensive. | Only when search completes without truncation |
| **Greedy** | Immediate SPLIT / CONSOLIDATE / CARRY decisions. | Fast baseline and quick comparisons. | No proof |
| **GSS** | Recursive SPLIT / CONSOLIDATE planning with liquidity-aware waits. | Recursive scoped plans with interim investments. | No proof |

## Technical references

- [Absolute R](strategies/ABSOLUTE.md)
- [Absolute R+](strategies/ABSOLUTE-PLUS.md)
- [Greedy](strategies/GREEDY.md)
- [GSS](strategies/GSS.md)

## Absolute R

Absolute R performs exhaustive branch-and-bound search. It uses a feasible Greedy incumbent and admissible scoped terminal-value bounds. Local booking combinations are exhaustive; no beam-width limit is applied. It is CLI-only because the decision space can grow combinatorially.

When the search completes and all pruning rules remain valid, it can prove the optimum under the supplied FD catalogue, account capabilities, cash flows, fees, tax and interest assumptions.

## Absolute R+

Absolute R+ performs bounded layered beam search. It shares the search transition model with Absolute R but applies explicit limits to frontier width, local booking combinations and optionally expanded states.

Its controls are `beam_width` (default 256), `max_local_branches` (default 128; null disables the local limit), and `max_decisions` (unlimited by default). If any configured limit truncates relevant search, the result is the best feasible incumbent found, not a proof of global optimality.

The public name is Absolute R+. The historical configuration identifier `gaml`, `gaml_settings`, and source module path are retained for compatibility with existing scenario files and imports.

## Greedy

Greedy evaluates currently available balances and eligible FD options, then selects an immediate SPLIT or CONSOLIDATE plan. It is a fast baseline, not a guarantee of a globally best portfolio.

Its independent tenor settings are:

- `tenor_tiebreaker`: after annual rate, choose the shortest or longest option tenor.
- `plan_tenor_tiebreaker`: after plan rate, choose the shortest or longest plan tenor.

## GSS — Goal-Seeking Strategy

GSS is a recursive scoped planner. It obtains account-compatible and horizon-compatible FD candidates from FDOptionManager, consumes the manager-provided order, and evaluates SPLIT, CONSOLIDATE and liquidity-aware waiting plans. It does not fall back to Greedy, Absolute R or Absolute R+ when candidates are exhausted.

## Simulation lifecycle

The simulation runtime owns chronological event processing, actual account balances, FD cash flows and maturities, outflow settlement, transfer execution, result construction and finalisation. Strategies own hypothetical planning and decision selection. The runtime validates and executes their decisions.

All public runs use the selected scoped start and end dates. The final consolidation sweep occurs once after the scoped horizon completes.

## Goal mode status

Goal-based net-interest optimisation is **under development**. It is disabled in the browser and rejected by the public configuration validator. When reintroduced, the intended first supported strategy is Absolute R; Greedy, GSS and Absolute R+ remain scoped-range strategies unless separately redesigned and explicitly approved.

See [Goal-mode rework plan](strategies/goal-mode-rework-plan.md).
