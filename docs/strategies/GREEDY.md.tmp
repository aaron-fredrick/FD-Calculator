# Greedy Strategy

## 1. Overview

Greedy is FD Cal's fast, rule-based baseline strategy. It makes a decision at each event date using the balances, eligible FD products, transfer fees and obligations known at that point.

It is a **heuristic strategy**: it uses explicit selection rules to choose a locally attractive plan instead of searching all possible future decision sequences. It can compare several plans for the current date, but it does not preserve alternative paths and evaluate their complete future outcomes.

Consequently, Greedy is fast and useful as a baseline, but it does not guarantee the globally highest net return over the full simulation period.

**Implementation:** `src/strategies/greedy.js`

## 2. Inputs and setup

The strategy accepts:

- FD options.
- Simulation start and end dates.
- Initial accounts and their balances.
- Inflow and outflow schedules.
- Transfer-fee configuration.
- Inflow and consolidation account IDs.
- Interest compounding, leap-year and AIT settings.

If accounts are not supplied, Greedy creates a default account using the first FD option's bank identity (or `commercial`). The inflow account defaults to the first account, and the consolidation account defaults to the inflow account.

Greedy constructs one `FDOptionManager` for the supplied FD options. Account eligibility is evaluated against the individual account, including whether that account supports eFDs; eFD capability is not assumed to be uniform across all accounts at a bank.

## 3. Session planning

The shared runtime advances the authoritative event timeline and settles inflows, FD cash flows, maturities and outflows before requesting a strategy decision. Greedy receives a deeply immutable account snapshot at each decision boundary.

Greedy evaluates the currently available balances and returns a revision-bound SPLIT, CONSOLIDATE or CARRY decision. It does not process the actual timeline, settle actual outflows, execute transfers/bookings, schedule actual cash flows or construct the result. Those operations belong to `SimulationRuntime`.

Greedy remains locally greedy: it reacts to the current runtime snapshot rather than preserving alternative complete future paths.

## 4. Daily plan generation

For each decision date, Greedy considers two investment plan types: **SPLIT** and **CONSOLIDATE**. If neither produces an admissible candidate, it carries the available balances forward.

### 4.1 SPLIT

Greedy evaluates each account with a balance greater than the internal epsilon threshold.

For each account:

1. Requests eligible options from `FDOptionManager`, using the account, its full available balance, the current date and simulation end date.
2. Selects one option using the option-selection rules below.
3. Calculates the interest for the account's balance.
4. Marks the account as a carry if no eligible option exists.

The resulting SPLIT decision requests that the runtime book each selected account balance independently. Accounts without a suitable option remain as carries.

The plan's comparison rate is the **highest selected annual rate** among its bookings; its comparison tenor is the **shortest selected tenor**. Gross interest is the sum of the selected bookings' interest, and net interest is gross interest after the configured effective AIT deduction. SPLIT has no transfer fees.

### 4.2 CONSOLIDATE

Greedy evaluates every configured account as a possible target account.

For each target:

1. The target's own available balance contributes to the deployable amount without a transfer.
2. Every other positive-balance account is considered as a transfer source.
3. The applicable source-to-target fee is obtained from `TransferFeeConfig`.
4. If a source balance is less than or equal to its transfer fee, that source is left as a carry.
5. Otherwise, the fee is deducted from the source amount and the net transfer contributes to the target's deployable amount.
6. Greedy requests eligible FD options for the target account and the aggregate deployable amount.
7. If an option is available, it calculates gross interest and the estimated net interest used for plan evaluation.

A consolidation plan is discarded if it has no transfers, no eligible target option, or non-positive estimated net interest.

The target account's own balance is not charged a transfer fee. Each actual source-to-target transfer is charged once during execution.

#### Transfer-fee evaluation

The current implementation maintains two different fee totals:

- `fees_today`: the sum of actual fees for the transfers required by the candidate plan.
- `fees_eval`: the estimated fee penalty subtracted when comparing the candidate's net interest.

The current estimated-fee rule is:

| Transfer source | Consolidation target | Evaluation fee |
|---|---|---:|
| Main consolidation account | Another account | 2 × transfer fee |
| Another account | Main consolidation account | 1 × transfer fee |
| Another account | Another account | 2 × transfer fee |

Here, “main” means the configured `consolidation_account_id`.

This multiplier is an evaluation assumption in the current implementation; it is **not** an additional fee charged during transfer execution. Actual execution deducts each transfer fee once and adds that amount once to the simulation's total transfer fees. The rationale for the estimated multiplier should be revisited if the intended model of subsequent fund repositioning changes.

### 4.3 CARRY

If no candidate plan is available, Greedy leaves the active balances in their accounts. It also carries individual accounts when no eligible FD option fits their balance or account capabilities.

Carry is not an FD investment and earns no modelled FD interest while the balance remains idle.

## 5. FD option selection

Greedy uses two selection stages.

### 5.1 Select one option for an account or consolidated amount

The `selectBestOption` function compares eligible options in this order:

1. Higher annual interest rate.
2. Shorter tenor when annual rates are equal.
3. Prefer eFD when the annual rate and tenor are equal and the options have the same `economic_terms_key`, provided the current best option is standard.

This is a rate-first rule. It does not directly select the option with the highest absolute interest amount across different tenors.

### 5.2 eFD preference between equivalent products

When ranking complete daily plans, Greedy counts selected eFD bookings for which the same account also has a standard option with matching economic terms. This count is only a late tie-breaker; it does not override a higher rate, shorter tenor or higher net interest in the preceding ranking fields.

## 6. Candidate admission and plan ranking

Greedy first builds the SPLIT plan, if at least one account can be booked, and then generates feasible CONSOLIDATE plans.

Consolidation admission depends on whether SPLIT exists:

- **When SPLIT exists:** a consolidation plan is admitted only if its rate is higher and its estimated net interest is higher; or if its rate is equal and its estimated net interest exceeds SPLIT's by more than 0.01.
- **When SPLIT does not exist:** a consolidation plan is admitted if its estimated net interest is positive.

If no candidate survives, Greedy selects CARRY.

The surviving candidates are sorted lexicographically by:

1. Higher comparison annual rate.
2. Shorter comparison tenor.
3. Higher estimated net interest.
4. Lower actual transfer fees for the current date.
5. Higher count of equivalent eFD selections.

The first candidate is executed.

**Important consequence:** net interest is not the primary ranking field. The admission rules first constrain which consolidation plans can compete; among admitted candidates, a higher-rate plan can rank ahead of a plan with higher net interest.

## 7. Decision contract (planning only)

Greedy returns a revision-bound decision describing the plan selected for the current planning snapshot. It does not execute any part of that plan.

- **SPLIT:** identifies the account/FD-option/principal tuples the runtime should book independently, plus accounts that remain liquid.
- **CONSOLIDATE:** identifies the target account, source-to-target transfers, selected FD option and deployable principal. It is a proposed atomic transfer-and-booking plan, not an executed transaction.
- **CARRY:** asks the runtime to leave the current positive balances unchanged for this decision boundary.

The strategy does not debit or credit authoritative balances, charge fees, create actual events, schedule cash flows, settle obligations or construct a simulation result. `SimulationRuntime` validates and executes the selected decision against the authoritative state. Invalid or stale decisions are rejected by the runtime before commit.

## 8. Runtime-owned execution and finalization

After Greedy returns a decision, `SimulationRuntime` owns all actual effects:

- Validates account references, option eligibility, balances, transfer fees and staged events.
- Executes transfers and bookings atomically, including actual fee deductions.
- Schedules actual FD cash-flow and maturity events.
- Records the actual event ledger and updates authoritative balances.
- Processes later inflows, maturities, cash flows and outflow obligations.

Greedy does not perform a final sweep. After the complete simulation horizon and strategy session finish, `SimulationEngine` invokes the single simulation-wide consolidation sweep. It transfers eligible residual balances to the configured consolidation account, charges each applicable fee once, and records any remaining idle cash. This finalization is strategy-independent.

## 9. Financial result and diagnostics

`SimulationRuntime` constructs the unfinished result from actual bookings, timeline events, transfer fees, paid/outstanding outflows, account balances and validity status. `SimulationEngine` then finalizes it. AIT is applied through the configured effective AIT rate when calculating net interest and generating net cash flows.

Booking and carry events include a `decision_context` with the action and balances before the action. Greedy retains its existing empty `decision_log`; it does not expose a full trace of every candidate considered, rejected or ranked.

## 10. Strengths and limitations

### Strengths

- Fast, deterministic baseline for a given input.
- Considers both separate account-level bookings and account consolidation.
- Uses bank-aware FD option eligibility through `FDOptionManager`.
- Respects account-specific eFD capability and transfer fees.
- Reacts to inflows, FD cash flows, maturities and outflow obligations as they occur.

### Limitations

- **Locally greedy:** it commits to the selected plan at each date rather than comparing complete future paths.
- **No global optimality guarantee:** a locally attractive booking can prevent a better later combination.
- **Rate-first selection:** annual rate and tenor precede absolute net return in the option and plan ranking rules.
- **Restrictive consolidation admission:** a consolidation plan generally needs to beat SPLIT on both comparison rate and estimated net interest.
- **Fee-model assumption:** estimated consolidation fees can differ from actual fees charged; the multiplier is an evaluation penalty, not an execution charge.
- **Limited decision diagnostics:** the structured decision log is currently empty.

## 11. When to use Greedy

Use Greedy when you need:

- A quick result for an input scenario.
- A baseline against which to compare Absolute+ or Absolute.
- A simple, deterministic strategy without the cost of exploring a large search space.

Use a search-based strategy when future combinations matter and you need broader exploration. Use Absolute when a completed exhaustive search and an optimality proof are required and the scenario is tractable.

## 12. Source map

| Concern | Implementation |
|---|---|
| Daily SPLIT / CONSOLIDATE / CARRY planning | `pickDailyGreedyPlan` and `GreedyStrategy.createSession` in `src/strategies/greedy.js` |
| Actual event progression and execution | `src/core/simulation-runtime.js` |
| Session driving and finalization | `src/core/simulation.js` |
| FD option eligibility and bank grouping | `src/fd-options/index.js` |
| Account and transfer-fee models | `src/core/models.js` |
| Event and inflow models | `src/core/events.js` |
| Booking and simulation result models | `src/core/results.js` |
