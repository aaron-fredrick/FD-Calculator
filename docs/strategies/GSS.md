# GSS — Goal-Seeking Strategy

## Overview

GSS is a recursive strategy for the **Scoped Range objective**. It plans within the user's selected start and end dates, maximising the scoped portfolio outcome while accounting for cash-flow events, FD eligibility, transfer fees and liquidity obligations.

GSS is independent of Greedy, Absolute R and Absolute R+. It consumes the candidate order supplied by FDOptionManager and does not fall back to another strategy when candidates are exhausted; remaining funds stay liquid.

**Implementation:** `src/strategies/gss.js`.

## Planning model

For each candidate account and FD option, GSS evaluates feasible SPLIT and CONSOLIDATE plans. If neither is viable immediately, it projects scheduled inflows, existing FD cash flows/maturities and outflows to find a future affordability date. It recursively plans the waiting period with GSS itself.

Interim bookings must preserve liquidity required by the parent plan and strict outflow obligations within the selected date range. At each future event boundary, GSS re-evaluates the parent candidate against updated balances and available products.

## Candidate ordering and selection

GSS obtains account-compatible and horizon-compatible FD candidates from FDOptionManager and consumes the manager-provided order. For each candidate, it compares feasible plans using post-AIT interest and actual transfer fees, preserving deterministic manager order as a tie-breaker.

GSS does not add Goal-specific ranking or search overhead to the scoped planner.

## Constraints and liquidity

The planner accounts for future scheduled inflows, FD cash flows and outflows when determining whether a booking or transfer is viable.

A consolidation transfer permanently removes cash from its source account. Source-account liquidity required for obligations later in the requested date range must therefore remain reserved. Split bookings remain in their own accounts and are re-evaluated at maturity.

Strict outflow constraints are not relaxed to improve investment returns. If the strategy cannot satisfy a strict obligation, the authoritative runtime rejects the result.

## Runtime boundary

GSS exposes `createSession(context)`. Its private recursive planner returns a sequence of decisions; it does not return its hypothetical ledger as the actual simulation result.

`SimulationRuntime` processes authoritative events, settles outflows, validates transfers and atomically executes selected decisions. Same-date recursive actions are emitted as one atomic batch. `SimulationEngine` performs the single final consolidation sweep after the scoped session completes.

## Optimality and limitations

GSS is a recursive heuristic, not an exhaustive search. It follows FDOptionManager's candidate ordering and evaluates the plans available at each recursive boundary; it does not prove that no better complete sequence exists.

Candidate exhaustion leaves the remaining funds liquid. GSS does not switch to Greedy, Absolute R or Absolute R+.

## Goal mode status

GSS is **Scoped Range only**. It is not dual-optimised for earliest Goal achievement. Goal mode remains disabled while a dedicated Absolute R Goal planner is under development.

## Diagnostics and source map

| Concern | Implementation |
|---|---|
| Recursive planning and decision generation | `src/strategies/gss.js` |
| FD option eligibility and candidate ordering | `src/fd-options/` |
| Authoritative event processing and decision execution | `src/core/simulation-runtime.js` |
| Session driving and final consolidation | `src/core/simulation.js` |
