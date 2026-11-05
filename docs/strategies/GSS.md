# Goal-Seeking Strategy (GSS)

## Purpose and independence

GSS is an independent recursive planning strategy. It never invokes Greedy, GAML or Absolute. It consumes immutable runtime planning snapshots and goal candidates supplied by FDOptionManager. Its private hypothetical planner explores recursive goal windows and records a selected decision path; the shared runtime alone owns actual event processing and execution.

## Candidate discovery and ordering

GSS calls FDOptionManager for the complete account-compatible and horizon-compatible candidate list. The manager owns product eligibility and its underlying catalogue order.

- **Scoped mode** preserves the established manager-provided candidate order and does not add goal-specific ranking overhead.
- **Goal mode** evaluates viable plans across the candidate set and ranks them by projected first-credit timing at the consolidation account. It can defer an immediately viable non-consolidation booking when a known near-term event enables an earlier consolidation plan. Manager order remains a deterministic tie-breaker, not the goal objective.

A nonviable candidate does not stop consideration; GSS continues evaluating the remaining account/option pairs.

## SPLIT and CONSOLIDATE

For each candidate:

- **SPLIT:** the candidate option is booked in its account. Other accounts may be invested independently using their first viable manager-ordered option. Funds that cannot be invested remain liquid.
- **CONSOLIDATE:** balances are transferred to the candidate account. Each source-to-target transfer fee is deducted before checking the candidate option's minimum amount and projected return.

In scoped mode, both viable plans are evaluated using post-AIT interest and actual transfer fees; the higher net-interest plan is selected for that candidate.

In goal mode, plan ranking uses a provenance-aware projection of interest actually eligible to be credited to the consolidation account. The estimate accounts for existing scheduled payouts, principal provenance carried through a booking, newly generated post-AIT interest, transfers and proportional fee allocation. Earliest target achievement wins; same-date comparisons preserve the established higher-credited-interest, lower-fee and lower-operation tie-breaks. A consolidation plan is not discarded solely because transfer fees exceed the new FD's total projected interest: the transfer may still move enough previously uncredited interest to cross the goal.

## Future affordability and recursive waiting

If a candidate cannot be booked immediately, GSS projects future inflows, known FD cash flows/maturities and outflows to find the earliest event date at which that candidate can form a viable plan.

GSS recursively advances the waiting period. The child hypothetical planning window advances a private projection of known events and evaluates immediately achievable goals. It can invest interim balances, but only in products that mature no later than the parent target date. This prevents interim bookings from locking away liquidity needed by the parent goal.

The projected target date is a forecast, not a fixed appointment. Every active recursive goal frame owns its candidate, projected target date, horizon and execution responsibility.

While a recursive window advances, GSS re-evaluates ancestor goals after each processed event date **and after each interim investment decision**. This second checkpoint matters because booking an interim FD adds future cash-flow and maturity events to the timeline. Descendants can therefore change when an ancestor is expected to become viable, even if the ancestor is not yet affordable at the current date.

For each ancestor, from the innermost parent outwards, GSS:

1. Rebuilds SPLIT and CONSOLIDATE plans against projected balances and pending obligations.
2. If a plan is viable now, signals early execution to the owning frame.
3. Otherwise, reruns the future-date projection against the updated timeline.
4. Contracts the frame's forecast when the newly projected viable date is earlier than its previous forecast.
5. Records infeasibility separately when no future viable date remains within that frame's horizon.

A contraction is propagated through recursive returns. If a revised ancestor boundary falls inside a descendant's current waiting window, that boundary pre-empts the descendant's original target. The hypothetical projection advances only to the revised date, then unwinds to the owning frame. The owner rebuilds its plan from the updated planning state and records its own decision only if it is still viable. A projected date is never treated as an execution guarantee.

Forecasts are monotonic during a wait: they may move earlier, but are not extended later. A later or absent forecast does not silently extend an existing wait; the frame resumes normal candidate evaluation if its projected opportunity is no longer viable. Multiple ancestor changes are handled in innermost-to-outermost order, and a child never executes an ancestor's goal.

Reforecasting uses the same planning rules as ordinary decisions, including AIT-adjusted cash flows, FD maturity and payout dates, scheduled inflows/outflows, pending obligations, SPLIT/CONSOLIDATE affordability, transfer fees, account liquidity reserves, parent-goal restrictions and the overall simulation horizon. Interim bookings remain constrained by the active parent target, so contraction cannot retroactively assume locked principal is liquid.

Planned outflows are also protected. Scoped mode retains the liquidity required across the requested date range. Goal mode reserves source-account obligations through the candidate plan's next maturity boundary; the recursive planner then re-evaluates before later obligations rather than reserving against the full 30-year safety horizon. Split bookings retain the liquidity needed through their own maturity boundary.

If a parent candidate is no longer viable when its projected date is reached, GSS continues considering candidates from the updated date/state. In goal mode, its hypothetical provenance ledger stops further planning once the target has been credited; the shared runtime remains authoritative for actual accounting and termination. If all candidates are exhausted, remaining funds stay liquid and carry forward. There is no strategy fallback.

## Recursion threshold

The setting gss_settings.small_period_days defaults to 30 and must be a positive integer. Waiting periods at or below the threshold are advanced without further future-goal subdivision, while immediately viable goals are still evaluated. A hard recursion-depth guard prevents unbounded nested calls.

## Shared simulation lifecycle

GSS exposes `createSession(context)`. Its private recursive planner returns a sequence of decisions; it does not return its hypothetical ledger as the actual simulation result. In goal mode, the planner uses the same principal/uncredited-interest/counted-interest provenance model to rank and stop its hypothetical plan, but this remains a planning estimate. `SimulationRuntime` processes the authoritative events, settles outflows, validates provenance and atomically executes the selected decisions. Same-date recursive actions are emitted as one atomic batch. `SimulationEngine` performs the one final consolidation sweep only when the goal was not already achieved. Recursive planning windows never trigger finalization.

## Observed performance

The [strategy sensitivity benchmark](/strategies/benchmarks) compares GSS against Greedy and GAML across horizon, capital, bank/account diversity, inflows and eFD eligibility. The measured results are scenario-specific and should be read alongside the benchmark assumptions.

## Diagnostics

The runtime result carries the planner's decision log and `gss_diagnostics`, including candidate count, SPLIT/CONSOLIDATE plan evaluations, future goals, recursive waits, early parent-goal rechecks/executions, forecast rechecks/contractions, maximum recursion depth and the configured threshold. Goal-mode diagnostics additionally report the target, hypothetical credited net interest, whether planning stopped at the goal, and the number of goal-plan evaluations. The decision log records contractions, waits, selected plans and candidate exhaustion.