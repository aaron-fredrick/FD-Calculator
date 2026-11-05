# Goal-Based Simulation — Implementation Plan

## Status

This document is the implementation contract for the goal-based simulation work on
`feature/goal-based-simulation`. It is intentionally explicit about accounting,
runtime ownership, migration, testing, and release gates. Work is not complete until
all acceptance criteria below are implemented and verified.

## Objective

Add a third simulation mode alongside the existing time-based and scoped modes.
Goal mode terminates at the first event boundary where the configured amount of
net interest credited to the consolidation account reaches its target, or at a
configured maximum end date when the target is not reached.

The goal is not portfolio value, gross interest, unrealised FD interest, or total
interest earned across all accounts. It is cumulative net interest actually
credited to the configured consolidation account.

## Configuration contract

Canonical shape:

```json
{
  "simulation": {
    "mode": "goal",
    "goal": {
      "metric": "consolidation_net_interest",
      "target": 50000,
      "maximum_end_date": "2028-11-05"
    }
  }
}
```

Modes:

- `time_based`: start date plus configured duration.
- `scoped`: explicit start and end dates.
- `goal`: start date, positive target, and maximum end date safety boundary.

Legacy configurations remain valid through a single normalization layer. The CLI,
browser configuration loader, and runtime must consume the same normalized contract.
Existing investment date fields and strategy settings must remain backward compatible.

Validation must reject unsupported modes/metrics, non-positive or non-finite targets,
invalid dates, maximum end dates before the start date, missing mode-specific fields,
and contradictory mode fields. Do not silently reinterpret malformed configurations.

## Accounting contract

### Canonical metric

Track a cumulative, first-credit-only amount of net interest credited to the
consolidation account. Recognition occurs at the event boundary when the interest
component is received by that account. AIT is deducted before recognition.

- Opening balances and external inflows are principal.
- Principal returned at maturity is never interest.
- Interest paid to a non-consolidation account is not counted until it reaches
  consolidation.
- Interest moved between accounts is not counted more than once.
- Reinvestment, withdrawals, and subsequent movement of already-counted interest
  do not reverse or duplicate the historical achievement metric.
- Fees attributable to transferred interest reduce the net interest contribution.
- Goal achievement is evaluated after all same-day credits, fees, transfers, and
  outflow settlement for the event boundary have been applied, with a deterministic
  event ordering documented and tested.

### Provenance model

Use explicit balance provenance (at minimum principal, uncredited net interest,
and already-counted consolidation interest) in the shared runtime. Provenance must
follow funds through transfers, bookings, maturity proceeds, and outflows.

**Mixed transfer policy:** allocate a transfer and its fee proportionally across
the source balance's principal and interest provenance. This is the deterministic
default selected for implementation. Document the formula and cover rounding and
residual-cent behaviour with tests. Principal remains principal; only net-interest
provenance may contribute to the goal metric.

For each transfer, preserve source composition before mutation. Allocate gross
transferred amount pro rata to each provenance bucket; allocate the transfer fee
using the same proportions; subtract gross amount from source buckets and credit
net amounts to target buckets. Apply a deterministic final-bucket residual so
the component totals reconcile exactly to the monetary transfer and fee totals.
Already-counted interest remains marked counted after transfer.

### FD cash flows

Cash-flow generation must expose principal and interest components, not just a
single net amount. For cumulative payout, maturity returns principal plus net
interest. Periodic payout emits net interest on interim dates and principal plus
final-period net interest at maturity. Installment payout separates each
installment's principal and net-interest portions. AIT is deducted from interest,
not principal.

## Runtime lifecycle

- `SimulationRuntime` remains the sole authoritative event and money executor.
- `SimulationEngine` continues to own strategy-session orchestration and exactly-once
  finalization.
- Goal termination is shared runtime/engine behaviour, never a strategy-specific
  stop implementation.
- The runtime evaluates the canonical metric after each fully processed event
  boundary and records the first crossing.
- The achieved run stops at that boundary; it must not process later events or run
  the final consolidation sweep at the configured maximum date.
- An unachieved run continues to the maximum end date and returns a valid
  `goal_not_reached` outcome, distinct from invalid simulation or execution failure.
- Finalization runs exactly once at the actual stopping boundary. Final sweep
  transfers must preserve provenance and must not retroactively change whether the
  goal was achieved.
- Result metadata includes target, actual credited interest, achievement status,
  achievement date, elapsed days, overshoot or shortfall, maximum boundary, and
  stopping reason.

## Strategy compatibility

- Greedy retains its existing local decision policy initially. It receives the
  shared runtime goal stop and serves as a baseline.
- GSS retains its current planning policy initially. Measure it under the goal
  objective before changing its search behaviour.
- Absolute+ uses a goal-aware evaluator. Rank candidates lexicographically:
  1. A goal-achieving candidate beats a non-achieving candidate.
  2. Among achievers, earliest achievement date wins.
  3. On the same date, higher net interest at achievement wins.
  4. Then lower transfer fees and fewer unnecessary operations.
  5. Then existing deterministic tie-breakers.
- Non-achieving candidates are ranked by net interest at the maximum boundary,
  followed by existing tie-breakers.
- Do not stop search at the first hypothetical crossing; compare candidates within
  the existing bounded search budget.
- Keep beam width, local branch limit, decision cap, and existing strategy settings
  unchanged initially.
- Expose search expansion/pruning diagnostics and state that bounded search does
  not prove global optimality unless a proof is actually available.

## Cash-outflow handling

Outflow settlement is a shared accounting concern, not a strategy-specific patch.
When an outflow is paid, consume provenance deterministically and proportionally
across the balance components. Preserve strict/defer/best-effort semantics and
ensure unpaid obligations cannot silently disappear. Add regression coverage for
outflows funded by principal, uncredited interest, and counted interest.

Until these tests pass, exclude outflow-heavy scenarios from primary strategy
performance conclusions and document the limitation explicitly.

## Reporting

Goal-mode report sections, in this order:

1. **Goal outcome** — target, actual, achieved/not achieved, first achievement date,
   elapsed days, overshoot/shortfall, stopping reason.
2. **Achievement timeline** — net-interest progression, target line, first crossing,
   relevant maturity and cash-flow events.
3. **Portfolio at achievement/stop** — consolidation balance, cash, FD principal,
   realised net interest, AIT, transfer fees.
4. **Decision and performance analysis** — decisions, transfers, bookings, strategy
   diagnostics, and Absolute+ search/pruning details.
5. **Scope status** — achieved or maximum boundary reached, with remaining shortfall.

Do not present a fabricated achievement duration for an unachieved goal.

## Goal achievement sensitivity study

Add a separate study; preserve the existing fixed-horizon sensitivity benchmark.
Use identical financial inputs and maximum scope for Greedy, Absolute+, and GSS at
each test point. Keep AIT, compounding, transfer fees, payout assumptions, and FD
catalogues identical.

One-factor-at-a-time dimensions:

| Dimension | Values |
|---|---|
| Goal target | LKR 10k, 25k, 50k, 75k, 100k |
| Starting capital | LKR 25k, 100k, 300k, 1m |
| Account count | 1, 2, 3 |
| Bank count | 1, 2, 3 |
| Inflows | none; monthly LKR 10k; quarterly LKR 30k; lump LKR 100k |
| eFD | standard-only; eligible |
| Maximum scope | 6, 12, 24 months |

Use DFCC, Commercial Bank, and NDB as the bank suite. Include achievable and
deliberately difficult targets. Record achievement date, days to achievement,
actual interest at achievement, target attainment, final net interest at the
maximum boundary, fees, bookings, runtime, Absolute+ expanded states, and proof
status. For unachieved runs, report final net interest and shortfall, not an
achievement duration. Exclude outflow scenarios from primary conclusions until
outflow accounting is verified.

## Migration and implementation sequence

1. **Inventory and baseline**
   - Confirm branch base and enumerate all config entry points, event types, report
     adapters, CLI paths, web UI paths, strategy context construction, and tests.
   - Run the existing test suite before changes and record the baseline.
   - Identify all assumptions that currently require `investment.start_date` and
     `investment.end_date`.

2. **Accounting primitives**
   - Add principal/interest cash-flow component generation after AIT.
   - Add provenance balances and transfer/fee allocation.
   - Preserve provenance across FD booking and maturity.
   - Define outflow consumption and counted-interest permanence.
   - Add unit tests before integrating goal termination.

3. **Simulation-mode normalization**
   - Introduce the canonical mode object and one normalization function.
   - Preserve legacy time/scoped configuration behaviour.
   - Update schema and semantic validation.
   - Add migration tests for legacy configs and all three new modes.

4. **Shared runtime goal stop**
   - Add canonical metric, threshold detection, first-crossing metadata, and stop
     reason to the shared runtime.
   - Integrate with engine orchestration and exactly-once finalization.
   - Test same-day ordering, overshoot, max-boundary failure-to-achieve, and no
     post-achievement event processing.

5. **Strategy integration**
   - Verify Greedy and GSS stop correctly without changing their decision policy.
   - Add goal-aware Absolute+ candidate evaluation and lexicographic ranking.
   - Test earliest achievement, tie-breaking, non-achievers, and search-budget
     exhaustion.

6. **CLI and browser migration**
   - Update CLI parsing/configuration and browser config form/schema together.
   - Add mode selector and mode-specific fields.
   - Keep financial settings and strategy settings intact.
   - Ensure exported/downloaded configs round-trip through the same normalizer.

7. **Reports**
   - Add goal-specific outcome, timeline, portfolio, and diagnostics.
   - Preserve existing fixed-horizon report output.
   - Verify achieved and unachieved report states.

8. **Sensitivity runner and documentation**
   - Add reproducible matrix runner and raw result JSON.
   - Generate charts from measured results only.
   - Document methodology, assumptions, limitations, and results.

9. **Hardening and migration verification**
   - Run all existing tests plus new accounting, mode, runtime, strategy, CLI, web,
     reporting, and benchmark tests.
   - Exercise target crossing, overshoot, unreachable goals, maturity boundaries,
     same-day events, inflows, multiple accounts/banks, final consolidation, and
     search-budget exhaustion.
   - Verify existing time-based/scoped output and settings remain unchanged.
   - Run browser build/deployment checks and inspect CI.
   - Fix every regression found and repeat the full suite before marking complete.

## Acceptance gates

- [ ] Legacy time-based and scoped configurations behave identically.
- [ ] All three modes use one normalized configuration contract and one runtime.
- [ ] Canonical metric counts only first-time net interest credited to consolidation.
- [ ] AIT, principal, mixed transfers, fees, bookings, maturity, and outflows reconcile.
- [ ] Goal stops at the first valid event boundary and finalizes exactly once there.
- [ ] Unachieved goal is a valid explicit outcome with a shortfall.
- [ ] Greedy and GSS use shared stop semantics.
- [ ] Absolute+ ranks achievers by earliest achievement within its bounded search.
- [ ] CLI, browser UI, schema, validation, and report agree on the mode contract.
- [ ] Goal sensitivity results are reproducible and do not replace fixed-horizon tests.
- [ ] Outflow limitations are either resolved by tests or explicitly excluded.
- [ ] Documentation and examples match shipped behaviour.
- [ ] Full regression suite and CI pass.

## Current implementation state

At the time this plan was added, the branch contained no implementation commits for
goal-based simulation. The runtime and strategy architecture had been inspected,
but no baseline test run or code changes had been completed. Do not mark any gate
complete without a corresponding code change and test evidence.
