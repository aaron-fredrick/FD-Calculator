# Strategy guide

FD Cal provides four implemented strategies. They share the same account, FD, cash-flow, transfer-fee, AIT and simulation-finalization models, but make investment decisions differently.

## At a glance

| Strategy | How it decides | Typical use | Optimality |
|---|---|---|---|
| **Greedy** | Makes the best-looking decision available at each step. | Fast baseline and quick comparisons. | No proof |
| **GAML** | Explores several promising plans in parallel with a bounded beam. | Broader exploration with controllable search cost. | Only when search completes without truncation |
| **Absolute** | Exhaustively explores the decision space using branch-and-bound. | Optimality proof for tractable scenarios. | Yes, when search completes |
| **GSS** | Selects manager-ordered FD goals, compares SPLIT and CONSOLIDATE, and recursively plans waiting periods. | Goal-oriented plans with liquidity-aware interim investments. | No proof |

## Greedy

Greedy evaluates currently available balances and eligible FD options, then selects an immediate SPLIT or CONSOLIDATE plan. It is a fast baseline, not a guarantee of a globally best portfolio.

Its two independent tenor settings both default to shortest:

- tenor_tiebreaker: after annual rate, choose the shortest or longest option tenor.
- plan_tenor_tiebreaker: after plan rate, choose the shortest or longest plan tenor.

## GAML

GAML is a heuristic beam-search strategy. It expands multiple candidate plans and retains a limited number of promising states.

- beam_width: maximum candidate states retained per layer (default 256).
- max_local_branches: local booking combinations per expanded state (default 128; null means unlimited).
- max_decisions: optional expanded-state cap (default null).

A truncated search returns its best found solution but does not prove optimality.

## Absolute

Absolute uses exhaustive branch-and-bound search, with Greedy as a feasible lower-bound incumbent. If the search completes, it can prove global optimality under the configured model. It can be expensive for large decision spaces. It is CLI-only.

## Goal-Seeking Strategy (GSS)

GSS is independent of Greedy, GAML and Absolute. It obtains the complete account-compatible, horizon-compatible FD candidate list from FDOptionManager and consumes that manager-provided order; GSS does not duplicate rate/tenor ranking.

For each candidate account and FD option, GSS evaluates:

- **SPLIT:** book the goal option in its account and use manager-ordered viable options in other accounts.
- **CONSOLIDATE:** transfer available balances into the candidate account, deduct actual source-to-target fees, and book the candidate option.

If neither plan is viable now, GSS projects scheduled inflows, existing FD cash flows/maturities and outflows to find a future affordability date. It recursively plans the waiting period with GSS itself. Interim bookings are restricted to FDs that mature by the parent goal date, preserving the parent goal's liquidity. The parent candidate is then re-evaluated against actual balances and events. If it fails, GSS continues through the remaining candidates. Candidate exhaustion leaves funds liquid; there is no Greedy fallback.

### GSS settings

```json
{
  "strategy": "gss",
  "gss_settings": {
    "small_period_days": 30
  }
}
```

small_period_days is a positive integer (default 30). Waiting periods at or below this threshold are processed without deeper future-goal subdivision, but immediately achievable goals are still evaluated. A recursion-depth guard also bounds nested planning.

See [GSS implementation details](strategies/GSS.md).

## Simulation lifecycle

All strategies return an unfinished simulation result. The shared SimulationEngine processes the selected strategy's complete overall horizon, performs exactly one final consolidation sweep, records remaining idle balances, and returns the finalized result. Recursive strategy windows never finalize or sweep independently.

## Choosing a strategy

- Use **Greedy** for a quick baseline.
- Use **GAML** for broader but bounded search.
- Use **Absolute** when a proof is important and the scenario is tractable.
- Use **GSS** when the plan should pursue future FD goals while using interim funds without compromising parent-goal liquidity.

Compare strategies under identical inputs. Passing tests do not replace regression comparison against archived Python scenarios.