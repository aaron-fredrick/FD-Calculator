# Strategy guide

FD Cal provides four strategies. They share the same account, FD, cash-flow, transfer-fee, AIT and simulation-finalization models, but make investment decisions differently.

## At a glance

| Strategy | How it decides | Typical use | Optimality |
|---|---|---|---|
| **Absolute** | Scoped: exhaustive terminal-value branch-and-bound. Goal: exhaustive earliest-credit search. | Proof for tractable date-range or goal scenarios. | Yes, when the active search completes without unsafe pruning |
| **Absolute+** | Bounded beam search with scope-specific priority, local ranking and waiting logic. | Practical exploration when exhaustive search is expensive. | Only when search completes without truncation |
| **Greedy** | Makes the best-looking immediate decision available at each step. | Fast baseline and quick comparisons. | No proof |
| **GSS** | Recursive SPLIT/CONSOLIDATE planner. Scoped mode preserves manager order; goal mode ranks projected consolidation-credit timing. | Recursive plans with liquidity-aware interim investments. | No proof |

## Technical references

- [Absolute](strategies/ABSOLUTE.md)
- [Absolute+](strategies/ABSOLUTE-PLUS.md)
- [Greedy](strategies/GREEDY.md)
- [GSS](strategies/GSS.md)

## Absolute

Absolute uses exhaustive branch-and-bound search, with Greedy as a feasible incumbent. Scoped mode optimises terminal portfolio value. Goal mode keeps the complete compatible product set, avoids scoped terminal-value/memo pruning, and optimises the earliest authoritative consolidation-credit boundary. It retains fee-heavy transfers when proportional provenance allocation can still reach the target. When the active search completes without unsafe pruning, it can prove optimality under the configured model. It is CLI-only because exhaustive search can be expensive.

## Absolute+

Absolute+ applies bounded, layered search to explore candidate paths under explicit computational limits. Scoped mode retains its terminal-value ranking. Goal mode uses exact search-state interest provenance, pending payout timing, goal-aware local branch ranking and a wait decision based on estimated goal dates with and without a near-term inflow. The authoritative runtime replay still determines actual achievement. If beam, local-branch or state-budget pruning truncates exploration, the result is not an optimality proof.

Its controls are `beam_width` (default 256), `max_local_branches` (default 128; null disables the local limit), and `max_decisions` (unlimited by default in scoped mode; goal mode defaults to 5,000 expanded states when no positive cap is configured).

The public strategy name is Absolute+. The historical configuration identifier `gaml` and `gaml_settings` are retained for compatibility with existing scenario files and imports.

## Greedy

Greedy evaluates currently available balances and eligible FD options, then selects an immediate SPLIT or CONSOLIDATE plan. It is a fast baseline, not a guarantee of a globally best portfolio.

Its two independent tenor settings both default to shortest:

- `tenor_tiebreaker`: after annual rate, choose the shortest or longest option tenor.
- `plan_tenor_tiebreaker`: after plan rate, choose the shortest or longest plan tenor.

## GSS — Goal-Seeking Strategy

GSS is independent of the search strategies. It obtains the complete account-compatible, horizon-compatible FD candidate list from FDOptionManager. Scoped mode consumes the manager-provided order. Goal mode evaluates viable plans across candidates and ranks them by projected consolidation-credit timing, including scheduled payouts, interest provenance, transfer fees and known future affordability opportunities.

For each candidate account and FD option, GSS evaluates SPLIT and CONSOLIDATE plans. If neither is viable now, it projects scheduled inflows, existing FD cash flows/maturities and outflows to find a future affordability date. It recursively plans the waiting period with GSS itself. Goal mode can defer an immediate non-consolidation rebooking when a near-term event enables an earlier consolidation plan; its hypothetical provenance ledger stops planning when the target is credited. Scoped liquidity reservations continue to protect the requested date range, while goal reservations protect obligations through the next maturity boundary and then re-evaluate. The shared runtime remains authoritative. Candidate exhaustion leaves funds liquid; there is no Greedy fallback.

See [GSS implementation details](strategies/GSS.md).

## Simulation lifecycle

All production strategies expose a planning session. `SimulationEngine` and `SimulationRuntime` own actual chronological event processing, outflow settlement, booking/transfer execution, result construction and exactly-once finalization. Strategies return immutable decisions and may perform separate hypothetical future exploration. Scoped mode processes the requested date range. Goal mode stops at the first event boundary where the consolidation net-interest target is actually credited, or at the internal safety horizon if unreachable. The engine then performs one final consolidation sweep and records remaining idle balances.

## Performance and sensitivity

See the [strategy sensitivity benchmark](/strategies/benchmarks) for reproducible net-interest comparisons across investment horizon, capital, account and bank diversity, inflows and eFD eligibility. See the [goal-achievement study](/strategies/goal-achievement) for goal-scope outcomes and the [dual-scope implementation plan](/strategies/dual-scope-search-implementation-plan) for scoped-regression acceptance.

## Choosing a strategy

- Use **Absolute** when a proof is important and the scenario is tractable.
- Use **Absolute+** for bounded exploration based on the Absolute optimisation approach.
- Use **Greedy** for a quick baseline.
- Use **GSS** when the plan should pursue future FD goals while using interim funds without compromising parent-goal liquidity.
