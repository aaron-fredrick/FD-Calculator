# Strategy guide

FD Cal provides four strategies. They share the same account, FD, cash-flow, transfer-fee, AIT and simulation-finalization models, but make investment decisions differently.

## At a glance

| Strategy | How it decides | Typical use | Optimality |
|---|---|---|---|
| **Absolute** | Exhaustively explores the decision space using branch-and-bound. | Optimality proof for tractable scenarios. | Yes, when search completes |
| **Absolute+** | Builds on the Absolute optimisation approach with bounded search and pruning controls. | Improved practical search when exhaustive exploration is expensive. | Only when search completes without truncation |
| **Greedy** | Makes the best-looking decision available at each step. | Fast baseline and quick comparisons. | No proof |
| **GSS** | Selects manager-ordered FD goals, compares SPLIT and CONSOLIDATE, and recursively plans waiting periods. | Goal-oriented plans with liquidity-aware interim investments. | No proof |

## Technical references

- [Absolute](strategies/ABSOLUTE.md)
- [Absolute+](strategies/ABSOLUTE-PLUS.md)
- [Greedy](strategies/GREEDY.md)
- [GSS](strategies/GSS.md)

## Absolute

Absolute uses exhaustive branch-and-bound search, with Greedy as a feasible incumbent. When the search completes, it can prove optimality under the configured model. It is CLI-only because exhaustive search can be expensive.

## Absolute+

Absolute+ builds on the Absolute optimisation approach and applies bounded, layered search to explore more candidate paths under explicit computational limits. It retains the best feasible path found within those limits. If beam, local-branch or state-budget pruning truncates exploration, the result is not an optimality proof.

Its controls are `beam_width` (default 256), `max_local_branches` (default 128; null disables the local limit), and `max_decisions` (default unlimited). These control frontier breadth, local combinations and total expanded states respectively.

The public strategy name is Absolute+. The historical configuration identifier `gaml` and `gaml_settings` are retained for compatibility with existing scenario files and imports.

## Greedy

Greedy evaluates currently available balances and eligible FD options, then selects an immediate SPLIT or CONSOLIDATE plan. It is a fast baseline, not a guarantee of a globally best portfolio.

Its two independent tenor settings both default to shortest:

- `tenor_tiebreaker`: after annual rate, choose the shortest or longest option tenor.
- `plan_tenor_tiebreaker`: after plan rate, choose the shortest or longest plan tenor.

## GSS — Goal-Seeking Strategy

GSS is independent of the search strategies. It obtains the complete account-compatible, horizon-compatible FD candidate list from FDOptionManager and consumes that manager-provided order; GSS does not duplicate rate/tenor ranking. Its recursive planner explores a private hypothetical projection and emits decisions for the shared runtime to execute.

For each candidate account and FD option, GSS evaluates SPLIT and CONSOLIDATE plans. If neither is viable now, it projects scheduled inflows, existing FD cash flows/maturities and outflows to find a future affordability date. It recursively plans the waiting period with GSS itself. Interim bookings are restricted to FDs that mature by the parent goal date, preserving the parent goal's liquidity. The parent candidate is then re-evaluated; if it fails, GSS continues through the remaining candidates. Candidate exhaustion leaves funds liquid; there is no Greedy fallback.

See [GSS implementation details](strategies/GSS.md).

## Simulation lifecycle

All production strategies expose a planning session. `SimulationEngine` and `SimulationRuntime` own actual chronological event processing, outflow settlement, booking/transfer execution, result construction and exactly-once finalization. Strategies return immutable decisions and may perform separate hypothetical future exploration. The runtime processes the complete horizon, then the engine performs one final consolidation sweep and records remaining idle balances.

## Performance and sensitivity

See the [strategy sensitivity benchmark](/strategies/benchmarks) for reproducible net-interest comparisons across investment horizon, capital, account and bank diversity, inflows and eFD eligibility.

## Choosing a strategy

- Use **Absolute** when a proof is important and the scenario is tractable.
- Use **Absolute+** for bounded exploration based on the Absolute optimisation approach.
- Use **Greedy** for a quick baseline.
- Use **GSS** when the plan should pursue future FD goals while using interim funds without compromising parent-goal liquidity.
