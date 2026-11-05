# Goal-Based Simulation

Goal-based simulation is one of two horizon modes alongside scoped simulation. It terminates at the first event boundary where the configured amount of **net interest first credited to the consolidation account** reaches the target, or when no future events can advance it, with the internal safety horizon as a final guard.

## Objective and accounting

The metric is cumulative, first-credit-only net interest received by the configured consolidation account. It is not portfolio value, gross interest, or unrealised interest earned by FDs in other accounts.

- Opening balances and external inflows are principal.
- FD cash flows separate returned principal from interest after AIT.
- Interest paid to a non-consolidation account is not counted until it is transferred to consolidation.
- Transfer provenance follows principal, uncredited interest, and previously counted interest.
- Mixed transfers and their fees are allocated proportionally across the components.
- AIT reduces interest before it can be recognised.
- Outflows consume balance provenance proportionally. Previously credited interest remains part of the historical goal metric after later withdrawals or transfers.
- Reinvesting or moving counted interest cannot count it again.

The runtime reconciles provenance to cash balances. Unattributed balance changes in non-goal runs are conservatively classified as principal and reported in `provenance_adjustments`. Goal runs reject provenance mismatches rather than silently treating unknown money as interest.

## Simulation modes

The shared configuration contract uses `simulation.mode`:

| Mode | Required horizon inputs | Stop condition |
|---|---|---|
| `scoped` | `investment.start_date`, `investment.end_date` | Explicit end date |
| `goal` | `investment.start_date`, goal target | First goal crossing; otherwise stops when no future events remain or at the 30-year internal safety horizon |

Goal configuration:

```json
{
  "simulation": {
    "mode": "goal",
    "goal": {
      "metric": "consolidation_net_interest",
      "target": 50000
    }
  },
  "investment": {
    "start_date": "2026-11-05"
  }
}
```

Goal outcomes are explicit:

- `achieved`: includes target, actual credited interest, achievement date, elapsed days, and overshoot.
- `goal_not_reached`: includes actual credited interest, stopping reason, safety-horizon date, and remaining shortfall.
- Invalid simulations remain invalid; they are not converted into ordinary unachieved outcomes.

Legacy configurations without a `simulation` object continue to normalize as scoped simulations.

## Runtime and strategy behaviour

The shared `SimulationRuntime` owns cash-flow execution, AIT, transfers, provenance, outflows, and goal threshold detection. `SimulationEngine` owns strategy-session progression and exactly-once finalization. Strategies do not implement independent goal termination.

- **Greedy** switches to a goal-specific local policy: it keeps non-consolidation balances liquid, prefers bookings into the consolidation account, and selects the eligible product with the earliest positive post-AIT interest payout. It re-evaluates at each event boundary. This is a fastest-first heuristic, not a global proof.
- **GSS** keeps its recursive planner and adds goal-specific candidate-plan ranking. It tracks principal, uncredited interest and counted interest through bookings, payouts, outflows and transfers; estimates which viable SPLIT/CONSOLIDATE plan reaches consolidation credit earliest; can defer a non-consolidation rebooking when a near-term event enables an earlier consolidation plan; and stops hypothetical planning once its provenance ledger reaches the target. The runtime remains authoritative for actual execution and stopping. Scoped candidate ordering and recursive behaviour remain unchanged. Consolidation transfers also preserve source-account obligations through the remaining horizon, net of scheduled inflows/cash flows; a target FD maturity cannot release that reserve because the transferred funds mature in the target account. Split bookings retain liquidity in their own account and are re-evaluated at maturity.
- **Absolute+** retains bounded beam search but uses goal-specific provenance-aware state priority, local payout-timing ranking and a goal-date-aware wait decision. It preserves distinct decision histories during goal-state deduplication and retains all compatible products. Candidate paths are replayed through the authoritative runtime as soon as they can credit the consolidation account. It compares outcomes lexicographically: achievement before non-achievement, earliest achievement, higher credited interest on the same date, lower transfer fees, fewer operations, then deterministic tie-breakers. Once an achieved incumbent exists, states strictly later than its achievement date are pruned. Goal mode defaults to 5,000 expanded states when no decision cap is configured. Candidate paths that fail authoritative replay are rejected and counted with failure reasons. Beam/local pruning or reaching the decision cap means global optimality is not proven.
- **Absolute** uses exhaustive goal search with the same authoritative replay and goal comparator, but no beam or decision-budget truncation. Goal mode disables scoped terminal-value/memo pruning, retains the complete compatible product set, and preserves fee-heavy consolidation branches when proportional provenance allocation can still credit the goal. It reports optimality only when no unsafe pruning occurred.

When a goal is achieved before the maximum horizon, later events are not processed and the final consolidation sweep is skipped so it cannot alter the recorded achievement amount. When the maximum horizon is reached without achievement, the final consolidation sweep is processed with provenance; interest first credited by that sweep is recognised at the maximum-date boundary.

## Strategy diagnostics and proof status

- **GSS** reports its goal target, hypothetical credited net interest, whether its planner stopped at the goal, and the number of goal-plan evaluations in `gss_diagnostics`. These values describe the private planning projection; the runtime's goal outcome remains authoritative.
- **Absolute** reports `optimality_proven` only when its exhaustive goal search completes without local, bound or memo pruning that could invalidate the objective.
- **Absolute+** reports the goal decision budget, expanded states, candidate replay count, invalid replay count/reasons, beam pruning, local-combination pruning and `optimality_proven`. Invalid candidate paths are rejected rather than allowed to affect the selected result. Any bounded-search truncation prevents a global optimality claim.

## Reports

Goal reports lead with the target, actual credited net interest, achievement date, elapsed days, and overshoot or shortfall. Portfolio-wide gross interest, AIT, transfer fees and net interest are shown as supporting totals and explicitly distinguished from the consolidation-credit goal metric. The event timeline includes cumulative credited net interest at each processed boundary. The web summary presents goal timing and credited interest before supporting portfolio figures.

## Goal-mode strategy sensitivity study

The goal-mode benchmark is separate from the fixed-horizon study. It compares the three web strategies—**Greedy, Absolute+ and GSS**—using the same goal contract and financial inputs at every test point. The exhaustive **Absolute** strategy is deliberately excluded from this web-strategy performance comparison.

Run the reproducible one-factor-at-a-time matrix with:

```sh
node scripts/goal-achievement-sensitivity.js
```

The 21 scenario inputs (63 strategy runs) vary one factor at a time:

- Goal target: LKR 10k, 25k, 50k, 75k, 100k.
- Starting capital: LKR 25k, 100k, 300k, 1m.
- Account count: 1, 2, 3.
- Bank count: 1, 2, 3.
- Inflows: none, monthly LKR 10k, quarterly LKR 30k, lump LKR 100k.
- eFD eligibility: standard-only or eligible.

The bank suite is DFCC, Commercial Bank and NDB. AIT is enabled, compounding is disabled, and the same catalogue and transfer-fee configuration are used across strategies. The internal safety horizon is fixed at 30 years; it is a final guard, not a user-selected investment range. Outflows are excluded pending a separate performance study.

### Performance indexes

Each scenario records the following comparable metrics:

| Index | Definition |
|---|---|
| Goal outcome | Achieved / not achieved, plus stopping reason |
| Actual duration | Elapsed simulation days until achievement or valid stopping boundary |
| Time to goal | Elapsed days for achieved cases; null for unachieved cases |
| Credited net interest | First-time interest credited to consolidation at the stopping boundary, after AIT and attributable fees |
| Target attainment | Credited net interest ÷ target × 100; below 100% means the goal was not reached |
| Computation time | Wall-clock strategy execution time measured with `performance.now()` |
| Fees | Actual transfer fees, plus fees as a percentage of credited net interest |
| Interest per day | Credited net interest ÷ actual elapsed simulation days; descriptive throughput, not an investment yield |
| Search/operation diagnostics | Booking count, search expansions, pruning, invalid candidates and optimality status where applicable |

Computation time is a single measured execution per point on the CI runner. It is useful for broad relative comparisons, not as a hardware-independent latency guarantee. The raw JSON retains all scenario inputs and metrics; unavailable values remain null rather than being coerced to zero.

### Goal-mode sensitivity dashboards

Each dashboard contains six aligned panels: actual elapsed days, credited net interest, computation time, transfer fees, credited interest per day and target attainment. All three strategies are overlaid on identical scenario points. A missing duration or achievement-only metric is not plotted as zero.

![Goal target sensitivity](./assets/goal-achievement/goal-target.svg)

![Starting capital sensitivity](./assets/goal-achievement/starting-capital.svg)

![Account count sensitivity](./assets/goal-achievement/account-count.svg)

![Bank count sensitivity](./assets/goal-achievement/bank-count.svg)

![Inflow pattern sensitivity](./assets/goal-achievement/inflow-pattern.svg)

![eFD eligibility sensitivity](./assets/goal-achievement/efd-eligibility.svg)

Machine-readable measurements: [goal-mode benchmark results](./assets/goal-achievement/results.json). The workflow regenerates the JSON and SVG dashboards from the same simulation run and publishes them to the feature branch; its Actions artifact also retains the raw run output.

Absolute+ uses a recorded bounded budget (beam width 96, local branches 48, 5,000 expanded decisions). Its results are approximate unless the result explicitly proves otherwise. These are scenario measurements, not universal strategy rankings. Outflows and their interaction with goal provenance are excluded from this matrix.

## Implementation plan and acceptance

See [Goal-Based Simulation Implementation Plan](goal-achievement-implementation-plan.md) for the migration sequence, accounting contract, test matrix, and acceptance gates.
