# Goal-Seeking Strategy (GSS)

## Purpose and independence

GSS is an independent recursive planning strategy. It never invokes Greedy, GAML or Absolute. Its decisions are based on goal candidates supplied by FDOptionManager and the actual simulation state.

## Candidate discovery and ordering

GSS calls FDOptionManager for the complete account-compatible and horizon-compatible candidate list. The manager owns eligibility and ordering, including the established rate/tenor ordering. GSS does not independently rank candidates.

Candidates are considered as account/option pairs in account order, with each account's products retained in manager-provided order. A nonviable candidate does not stop consideration; GSS proceeds to the next candidate.

## SPLIT and CONSOLIDATE

For each candidate:

- **SPLIT:** the candidate option is booked in its account. Other accounts may be invested independently using their first viable manager-ordered option. Funds that cannot be invested remain liquid.
- **CONSOLIDATE:** balances are transferred to the candidate account. Each source-to-target transfer fee is deducted before checking the candidate option's minimum amount and projected return.

Both viable plans are evaluated using post-AIT interest and actual transfer fees. The higher net-interest plan is selected for that candidate. Candidate order remains the manager's order; GSS does not reorder candidates by expected return.

## Future affordability and recursive waiting

If a candidate cannot be booked immediately, GSS projects future inflows, known FD cash flows/maturities and outflows to find the earliest event date at which that candidate can form a viable plan.

GSS recursively advances the waiting period. The child planning window processes actual events and evaluates immediately achievable goals. It can invest interim balances, but only in products that mature no later than the parent target date. This prevents interim bookings from locking away liquidity needed by the parent goal.

The projected target date is not a fixed appointment. While the recursive window advances, GSS re-evaluates its ancestor goal candidates after every processed event date. If a newly realized cash flow, maturity or other event makes an ancestor plan viable earlier, the recursive wait stops and control propagates back to the frame that owns that goal. That frame rebuilds the plan from actual balances and executes it immediately; nested frames do not execute another candidate or continue advancing time.

Planned outflows are also protected: split bookings retain the liquidity needed in each account until the selected FD matures, while consolidation leaves source-account reserves for their remaining scheduled obligations. If the parent candidate is no longer viable when its projected date is reached, it continues considering candidates from the updated date/state. If all candidates are exhausted, remaining funds stay liquid and carry forward. There is no strategy fallback.

## Recursion threshold

The setting gss_settings.small_period_days defaults to 30 and must be a positive integer. Waiting periods at or below the threshold are advanced without further future-goal subdivision, while immediately viable goals are still evaluated. A hard recursion-depth guard prevents unbounded nested calls.

## Shared simulation finalization

GSS returns an unfinished SimResult. The shared SimulationEngine performs the one final consolidation sweep after the overall horizon. Recursive planning windows never trigger finalization.

## Diagnostics

The result exposes gss_diagnostics with candidate count, SPLIT/CONSOLIDATE plan evaluations, future goals, recursive waits, maximum recursion depth, early parent-goal rechecks/executions and the configured threshold. The decision log records waits, selected plans and candidate exhaustion.