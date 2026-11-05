# Goal-Based Simulation

Goal-based simulation is a third horizon mode alongside time-based and scoped simulation. It terminates at the first event boundary where the configured amount of **net interest first credited to the consolidation account** reaches the target, or at the maximum end date if the target is not reached.

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
| `time_based` | `investment.start_date`, `simulation.duration` | Start date plus duration |
| `goal` | `investment.start_date`, goal target, maximum end date | First goal crossing or maximum end date |

Goal configuration:

```json
{
  "simulation": {
    "mode": "goal",
    "goal": {
      "metric": "consolidation_net_interest",
      "target": 50000,
      "maximum_end_date": "2028-11-05"
    }
  },
  "investment": {
    "start_date": "2026-11-05"
  }
}
```

Goal outcomes are explicit:

- `achieved`: includes target, actual credited interest, achievement date, elapsed days, and overshoot.
- `goal_not_reached`: includes actual credited interest, maximum date, and remaining shortfall.
- Invalid simulations remain invalid; they are not converted into ordinary unachieved outcomes.

Legacy configurations without a `simulation` object continue to normalize as scoped simulations.

## Runtime and strategy behaviour

The shared `SimulationRuntime` owns cash-flow execution, AIT, transfers, provenance, outflows, and goal threshold detection. `SimulationEngine` owns strategy-session progression and exactly-once finalization. Strategies do not implement independent goal termination.

- **Greedy** retains its existing decision policy and uses the shared goal stop.
- **GSS** retains its existing planner initially; its goal-mode behaviour is measured before policy redesign.
- **Absolute+** replays terminal candidates through the authoritative runtime and compares goal outcomes lexicographically: achievement before non-achievement, earliest achievement, higher credited interest on the same date, lower transfer fees, fewer operations, then deterministic terminal-value/signature tie-breakers. Its beam and decision budgets remain bounded. Candidate comparison is only as complete as the explored search frontier; bounded runs do not prove global optimality.
- **Absolute** uses the exhaustive search path and the same goal-aware terminal comparison, without beam pruning.

When a goal is achieved before the maximum horizon, later events are not processed and the final consolidation sweep is skipped so it cannot alter the recorded achievement amount. When the maximum horizon is reached without achievement, the final consolidation sweep is processed with provenance; interest first credited by that sweep is recognised at the maximum-date boundary.

## Reports

Goal reports lead with the target, credited amount, status, achievement date, elapsed days, and overshoot or shortfall. The event timeline includes cumulative credited net interest at each processed boundary. Existing fixed-horizon report sections remain available.

## Sensitivity study

Run the reproducible one-factor-at-a-time matrix with:

```sh
node scripts/goal-achievement-sensitivity.js
```

The study compares Greedy, Absolute+, and GSS with the same financial inputs per test point. It varies:

- Goal target: LKR 10k, 25k, 50k, 75k, 100k.
- Starting capital: LKR 25k, 100k, 300k, 1m.
- Account count: 1, 2, 3.
- Bank count: 1, 2, 3.
- Inflows: none, monthly LKR 10k, quarterly LKR 30k, lump LKR 100k.
- eFD eligibility: standard-only or eligible.
- Maximum scope: 6, 12, 24 months.

The bank suite is DFCC, Commercial Bank, and NDB. AIT is enabled, compounding is disabled, and the same catalogue and transfer-fee configuration are used across strategies. The Absolute+ benchmark uses a recorded bounded budget (beam width 16, local branches 8, 48 expanded decisions). The output records achievement date/days, credited interest at stop, shortfall, fees, bookings, runtime, search expansions, and proof status.

Outflows are excluded from the primary sensitivity matrix until the provenance/outflow interaction has independent regression coverage. The benchmark output is uploaded as a GitHub Actions artifact by the strategy sensitivity workflow. Results must be interpreted as measurements under the stated budget, not as proof that Absolute+ globally optimises every case.

## Implementation plan and acceptance

See [Goal-Based Simulation Implementation Plan](goal-achievement-implementation-plan.md) for the migration sequence, accounting contract, test matrix, and acceptance gates.
