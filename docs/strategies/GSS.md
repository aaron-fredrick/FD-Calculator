# GSS — Goal-Seeking Strategy

## Purpose

GSS is an independent recursive strategy for the **scoped date-range objective**. It obtains account-compatible and horizon-compatible FD candidates from FDOptionManager, consumes the manager-provided order and recursively plans SPLIT, CONSOLIDATE and liquidity-aware waiting decisions.

GSS does not invoke Greedy, Absolute R or Absolute R+. Candidate exhaustion leaves funds liquid; there is no strategy fallback.

**Implementation:** `src/strategies/gss.js`.

## Planning model

For each candidate account and FD option, GSS evaluates feasible SPLIT and CONSOLIDATE plans. If neither is viable now, it projects scheduled inflows, existing FD cash flows/maturities and outflows to find a future affordability date. It recursively plans the waiting period with GSS itself.

Interim bookings must preserve the liquidity required by the parent plan and all strict outflow obligations within the selected scoped horizon. At each future event boundary, the planner re-evaluates the parent candidate against the updated balances and available products.

## Candidate ordering

GSS consumes the FDOptionManager candidate order. For a candidate, it compares feasible plans using post-AIT interest and actual transfer fees, while preserving deterministic manager order as a tie-breaker. It does not add Goal-specific ranking or search overhead to the scoped planner.

## Liquidity and outflows

The planner accounts for future scheduled inflows, FD cash flows and outflows when determining whether a booking or transfer is viable. A consolidation transfer permanently removes cash from its source account, so source-account liquidity required for obligations later in the requested date range must remain reserved. Split bookings remain in their own accounts and are re-evaluated at maturity.

Strict outflow constraints are not relaxed to improve investment returns. If the strategy cannot satisfy a strict obligation, the authoritative runtime rejects the result.

## Runtime boundary

GSS exposes `createSession(context)`. Its private recursive planner returns a sequence of decisions; it does not return its hypothetical ledger as the actual simulation result. `SimulationRuntime` processes authoritative events, settles outflows, validates transfers and atomically executes selected decisions. Same-date recursive actions are emitted as one atomic batch. `SimulationEngine` performs the single final consolidation sweep after the scoped session completes.

## Goal mode status

Goal-specific GSS planning is not part of the supported strategy contract. Goal mode is disabled while the project reworks it as an Absolute R-only objective. GSS remains scoped-range only.
