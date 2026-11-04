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

The projected target date is a forecast, not a fixed appointment. Every active recursive goal frame owns its candidate, projected target date, horizon and execution responsibility.

While a recursive window advances, GSS re-evaluates ancestor goals after each processed event date **and after each interim investment decision**. This second checkpoint matters because booking an interim FD adds future cash-flow and maturity events to the timeline. Descendants can therefore change when an ancestor is expected to become viable, even if the ancestor is not yet affordable at the current date.

For each ancestor, from the innermost parent outwards, GSS:

1. Rebuilds SPLIT and CONSOLIDATE plans against actual balances and pending obligations.
2. If a plan is viable now, signals early execution to the owning frame.
3. Otherwise, reruns the future-date projection against the updated timeline.
4. Contracts the frame's forecast when the newly projected viable date is earlier than its previous forecast.
5. Records infeasibility separately when no future viable date remains within that frame's horizon.

A contraction is propagated through recursive returns. If a revised ancestor boundary falls inside a descendant's current waiting window, that boundary pre-empts the descendant's original target. The simulation advances only to the revised date, then unwinds to the owning frame. The owner rebuilds its plan from actual state and executes only if it is still viable. A projected date is never treated as an execution guarantee.

Forecasts are monotonic during a wait: they may move earlier, but are not extended later. A later or absent forecast does not silently extend an existing wait; the frame resumes normal candidate evaluation if its projected opportunity is no longer viable. Multiple ancestor changes are handled in innermost-to-outermost order, and a child never executes an ancestor's goal.

Reforecasting uses the same planning rules as ordinary decisions, including AIT-adjusted cash flows, FD maturity and payout dates, scheduled inflows/outflows, pending obligations, SPLIT/CONSOLIDATE affordability, transfer fees, account liquidity reserves, parent-goal restrictions and the overall simulation horizon. Interim bookings remain constrained by the active parent target, so contraction cannot retroactively assume locked principal is liquid.

Planned outflows are also protected: split bookings retain the liquidity needed in each account until the selected FD matures, while consolidation leaves source-account reserves for their remaining scheduled obligations. If a parent candidate is no longer viable when its projected date is reached, it continues considering candidates from the updated date/state. If all candidates are exhausted, remaining funds stay liquid and carry forward. There is no strategy fallback.

Planned outflows are also protected: split bookings retain the liquidity needed in each account until the selected FD matures, while consolidation leaves source-account reserves for their remaining scheduled obligations. If the parent candidate is no longer viable when its projected date is reached, it continues considering candidates from the updated date/state. If all candidates are exhausted, remaining funds stay liquid and carry forward. There is no strategy fallback.

## Recursion threshold

The setting gss_settings.small_period_days defaults to 30 and must be a positive integer. Waiting periods at or below the threshold are advanced without further future-goal subdivision, while immediately viable goals are still evaluated. A hard recursion-depth guard prevents unbounded nested calls.

## Shared simulation finalization

GSS returns an unfinished SimResult. The shared SimulationEngine performs the one final consolidation sweep after the overall horizon. Recursive planning windows never trigger finalization.

## Diagnostics

The result exposes gss_diagnostics with candidate count, SPLIT/CONSOLIDATE plan evaluations, future goals, recursive waits, early parent-goal rechecks/executions, forecast rechecks/contractions, maximum recursion depth and the configured threshold. The decision log records each contraction with its previous and revised target dates, reduction in days and owning recursion depth. The decision log records waits, selected plans and candidate exhaustion.