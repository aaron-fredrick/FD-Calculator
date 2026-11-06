# Absolute R — technical reference

## Purpose

Absolute R is the exhaustive branch-and-bound portfolio optimiser for the **scoped date-range objective**. It explores feasible decisions within the requested start and end dates and uses a feasible incumbent plus admissible upper bounds to prune branches that cannot improve the terminal portfolio outcome.

**Implementation:** `src/strategies/absolute.js` and `src/strategies/search-strategy-base.js`.

## Search model

1. Build a simulation context containing accounts, eligible FD products, cash-flow schedules, transfer fees and the scoped investment horizon.
2. Run Greedy to obtain a feasible incumbent.
3. Expand each search state into feasible local booking, consolidation and carry decisions.
4. Advance candidates to the next relevant event date, including FD cash flows/maturities, inflows and outflows.
5. Apply scoped dominance, memoisation and admissible terminal-value bounds.
6. Continue until the feasible search space is exhausted, then emit the best decision path for authoritative runtime execution.

Unlike Absolute R+, Absolute R does not retain a fixed-width beam or truncate local booking combinations.

## Objective and constraints

Absolute R maximises the scoped terminal portfolio outcome under the supplied model. The search respects:

- Account and FD-product compatibility.
- Minimum booking amounts and account eFD eligibility.
- Scheduled and recurring inflows.
- Strict, deferred and best-effort outflow policies.
- Transfer fees and consolidation constraints.
- AIT, interest payout and maturity rules.
- The selected investment start and end dates.

The simulation runtime remains authoritative for actual event processing, balance mutation, outflow settlement and finalisation.

## Optimality guarantee

Absolute R can report `optimality_proven: true` when its scoped branch-and-bound search completes and all applied bounds and dominance rules remain valid. This is a proof relative to the supplied FD catalogue, account capabilities, cash-flow schedules, fees, tax and interest assumptions—not a guarantee about future bank rates or real-world outcomes outside the model.

## Complexity and practical limits

The decision space grows rapidly with the number of accounts, eligible FD products, relevant event dates, split/consolidation combinations and cash-flow schedules. Dominance, memoisation and bound pruning reduce work but do not remove worst-case combinatorial growth. Absolute R is therefore CLI-only.

## Diagnostics

Inspect search diagnostics and `optimality_proven` with every result. Net interest alone does not establish whether the exhaustive search proved an optimum.

## Naming and compatibility

The public display name is **Absolute R**, where R denotes the scoped date range. The JSON strategy identifier remains `absolute`; the CLI accepts both `absolute-r` and the legacy `absolute` alias.
