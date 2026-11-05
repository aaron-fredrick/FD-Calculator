# Absolute+ — technical reference

## Purpose

Absolute+ shares the search transition model with Absolute but uses bounded, layered frontier exploration and local-branch limits. It supports both scoped terminal-value optimisation and goal achievement timing. The search mechanics remain bounded in both scopes; goal mode selects a different objective-specific ranking and state model rather than reusing the scoped terminal-value heuristic.

**Implementation:** `src/strategies/absolute-plus.js (legacy module path; retained for configuration compatibility)` and `src/strategies/search-strategy-base.js`.

## Search model

1. Build a simulation context containing accounts, eligible FD products, cash-flow schedules, transfer fees and the investment horizon.
2. Run Greedy to obtain a feasible incumbent and lower-bound candidate.
3. Expand each retained search state into feasible local booking, consolidation and carry decisions.
4. Advance each candidate to the next relevant event date, including FD cash flows/maturities, inflows and outflows.
5. Score resulting states and retain a bounded frontier for the next layer.
6. Emit the best retained path as revision-bound session decisions. `SimulationRuntime` processes actual events and executes those decisions.

The scoped search state includes the date, account balances, pending FD cash flows, outflow obligations and paid outflows. Scoped memoisation and terminal-value ranking remain unchanged.

Goal-mode states additionally carry principal, uncredited-interest and counted-interest provenance plus component-level pending payout flows. Goal-mode state identity retains the decision-path signature so states with equal scalar balances but different interest provenance or payout history are not merged before authoritative replay.

## Search controls

| Setting | Default | Meaning |
|---|---:|---|
| `beam_width` | 256 | Maximum number of candidate states retained at each search layer. |
| `max_local_branches` | 128 | Maximum partial local-booking combinations retained while expanding a state. `null` disables this local limit. |
| `max_decisions` | Unlimited in scoped mode; 5,000 in goal mode | Optional cap on expanded search states. Goal mode applies a finite 5,000-state default when the setting is omitted or null; reaching it stops further search. |

These controls limit different parts of the search:

- **Beam width** controls breadth across the retained frontier.
- **Local branch limit** controls the combinations considered inside one state expansion.
- **Decision cap** controls the total number of states expanded.

Increasing one limit does not remove the other limits. Higher values can improve the best result found, but may increase runtime and memory. A larger setting is not guaranteed to improve the result monotonically because the search is heuristic and pruning/order effects remain.

## Goal-mode search

Goal mode ranks replayed candidate paths lexicographically: an achieved goal beats an unachieved path; among achieved paths, the earliest achievement date wins; same-date ties prefer more credited net interest, lower transfer fees and fewer operations. Candidate replay uses the authoritative SimulationEngine, so final scoring uses actual AIT, cash-flow, transfer and provenance behaviour.

The goal-mode beam priority uses the search state's exact provenance and component-level payout schedule to estimate the earliest potential consolidation credit. Local branch ordering uses payout timing and whether the booking credits consolidation directly, rather than total tenor interest alone. The `waitFirst` decision compares the earliest estimated goal date with and without a near-term inflow; it does not wait merely because a future product has a higher annual rate. Goal mode retains all compatible products and does not discard a consolidation path solely because transfer fees exceed the new FD's projected interest.

Unlike the fixed-horizon search, goal mode evaluates candidate paths as soon as they can credit interest to the consolidation account. The goal-specific priority is an ordering heuristic only; the authoritative replay determines whether and when the target was actually reached. Once an achieved incumbent exists, states strictly later than its achievement date cannot improve the primary objective and are pruned. States on the same date remain eligible for tie-breaking. If no candidate reaches the goal, the search continues until its finite decision budget or the safety horizon.

Goal mode defaults to 5,000 expanded states when max_decisions is omitted or null. The UI exposes this as the effective default. Reaching the cap means the best feasible path found is returned, but global optimality is not proven. The result reports the effective budget, evaluated goal candidates, states pruned after the current best achievement date, and optimality status.

## Optimality status

Absolute+ reports `optimality_proven` only when the search completes without a decision-budget stop, beam pruning or local-combination pruning. Goal-mode path-sensitive deduplication is not counted as unsafe pruning because only identical scalar states with the same decision history are merged. Otherwise, the result is the best feasible path found within the configured bounds, not a proof of global optimality.

The diagnostics include expanded states, leaves, bound and memo pruning, beam pruning, local-combination pruning, peak root strategy frontier, alternative leaf returns and the effective settings. Review these alongside net interest and runtime; a higher return obtained with more work should be judged against its additional computational cost.

## Parameter sensitivity study

The following controlled experiment varies one Absolute+ search limit at a time. All runs use the actual `SimulationEngine`, the repository's DFCC, Commercial Bank and NDB FD catalogues, and an identical financial scenario:

- Start: 5 November 2026; horizon: 24 months.
- LKR 300,000 starting capital across three accounts at DFCC, Commercial Bank and NDB.
- No inflows or outflows; eFD eligible; AIT enabled at 10%; simple interest.
- Baseline controls: beam width 96, local branch limit 48, decision cap 5,000.

Each graph has separate panels for net interest after AIT and transfer fees, expanded search states, and measured runtime. Runtime is specific to the CI runner; it is useful for relative cost within this run, not as a hardware-independent benchmark. Full raw results: [gaml-search-results.json](./benchmarks/gaml-search-results.json).

### Beam width

![Absolute+ beam-width sensitivity](./assets/gaml-beam-width.svg)

### Local branch limit

![Absolute+ local-branch sensitivity](./assets/gaml-local-branch-limit.svg)

### Expanded-state decision cap

![Absolute+ decision-cap sensitivity](./assets/gaml-decision-cap.svg)

### Observations

- **Net interest did not change** across any of the 15 parameter settings: every run returned LKR 61,886.03. In this scenario, increasing search limits did not improve the selected financial outcome.
- **Beam width had the clearest computational cost.** Increasing it from 32 to 256 raised runtime from about 0.80 s to 10.53 s; the 192- and 256-wide runs both reached the 5,000-state cap.
- **Local branch limit had modest, non-monotonic runtime impact.** Runtime ranged from about 4.29 s to 5.07 s. Expanded-state counts stayed near 2,800, while local-combination pruning fell as the branch limit increased.
- **The decision cap controls work directly until the search naturally exhausts its frontier.** Caps of 500, 1,000 and 2,500 were reached; caps of 5,000 and 10,000 both stopped naturally after 2,791 expanded states and produced effectively the same runtime.
- **No run proved optimality.** Pruning occurred in every run, so identical net interest is evidence of a stable result for this scenario, not a global-optimality guarantee.

This parameter study remains a historical sensitivity baseline for the bounded-search implementation. The experiment is deliberately a one-factor sensitivity check, not a universal tuning prescription. Re-run it with different horizons, inflows and bank/account mixes before choosing production defaults. Raw measurements were produced by the [Absolute+ sensitivity runner](../../scripts/gaml-sensitivity.js).

## Interpretation and use

Use Absolute+ when the Absolute optimisation approach needs broader practical exploration under explicit search-cost limits. Start with defaults, then increase one control at a time. Compare identical financial inputs and record:

- Net interest after AIT and transfer fees.
- Whether optimality was proven.
- Expanded states and each pruning count.
- Runtime and peak memory where available.

Do not interpret beam width or branch count as a percentage of optimality. They are search limits, not confidence scores.

## Shared simulation lifecycle

Absolute+ exposes `createSession(context)`. Search branches remain hypothetical and produce a selected decision path; they do not process the authoritative event timeline or construct the actual result. `SimulationRuntime` executes the selected path and processes actual events. `SimulationEngine` adds the start marker and performs the single final consolidation sweep after the session completes. Search branches do not independently finalise the simulation.
