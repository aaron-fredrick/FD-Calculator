# Engine and financial core audit

## Scope

Reviewed the configuration boundary, account/FD models, interest calculation, cash-flow generation, event normalization, outflow handling, provenance, simulation result construction and runtime result assembly.

## Findings

### ENG-01 — Installment payout events are bounded by the simulation period

**Current status: IMPLEMENTED ON FOLLOW-UP BRANCH — CI PASSED.** The product's generated contractual payout sequence is retained, but the authoritative runtime schedules only events within the active simulation window. The product's maturity must still fit inside the simulation horizon. The run is never extended to accommodate a later installment, and no late installment is clamped to maturity.

**Severity:** P2

**Evidence:** [src/core/models.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/models.js) generates the contractual payout sequence. [src/core/simulation-runtime.js](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/owner-feedback-followups/src/core/simulation-runtime.js) filters net payout events against the context start/end before scheduling them. Regression tests cover a five-month tenor / two-month payout interval with five- and six-month simulation windows.

The complete contractual cash-flow schedule remains on the booking for expected-contract disclosure and total-interest calculations; only the event ledger is bounded. A five-month tenor / two-month interval therefore generates months 2, 4 and 6 contractually, but a five-month simulation schedules only months 2 and 4. With a six-month simulation, all three events are within the requested window. The simulation end date remains exactly the user-selected end date.

**Acceptance:** all scheduled payout events satisfy start-date ≤ event date ≤ end-date; the FD maturity eligibility check remains separate; Greedy/GSS/Absolute R+ replay through the same runtime.

### ENG-02 — Leap-year calculation is a start-year denominator, not a clearly specified day-count convention

**Current status: FORMULA RETAINED BY OWNER DECISION.** The start-year 365/366 denominator remains unchanged. A concise convention note is available at [Interest day-count convention](../finance/INTEREST-DAY-COUNT.md). Reviewed bank product pages publish rates/tenors/payouts but do not establish a universal day-count basis; UI/report disclosure and regression verification remain.

**Severity: P2**

**Evidence:** [src/core/interest.js L3-L18](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/interest.js#L3-L18); [src/core/models.js L79-L83](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/models.js#L79-L83).

When `actual_leap_year` is enabled, `getYearBaseDays` selects 365 or 366 from the calendar year of `onDate`. `calcInterest` then applies that one denominator to every day in the interval. A cumulative FD spanning multiple calendar years is not split into yearly accrual segments. A tenor starting in a non-leap year and crossing a leap year therefore uses 365 throughout; a tenor starting in a leap year and crossing a non-leap year uses 366 throughout.

**Impact:** results can differ from a bank's actual/actual, actual/365, actual/366 or other contract-specific basis. The label “Actual leap-year basis” does not make the precise convention clear.

**Recommendation:** define the supported day-count convention explicitly and align the UI/report wording with it. If the intended convention is actual/actual, accrue each calendar-year segment using that year's denominator. If it is start-year basis, document that and verify it against representative bank terms. Add tests for 1m, 12m and multi-year FDs crossing 29 February in both directions.

### ENG-03 — Financial invariants are mostly distributed across constructors and runtime code

**Current status: OWNER SCOPE APPROVED — implementation pending.** Add central validation for tenor, payout interval/type, rate/minimum amount and segment metadata. Product maturity must fit the active simulation period; special product caps/tax exemptions remain outside the generic layer until separately modelled.

**Evidence:** [config-schema.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/config-schema.js), [configuration.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/configuration.js), [models.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/models.js), [simulation-runtime.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/simulation-runtime.js).

The boundary validation is reasonably strict, but some model invariants still rely on catalogue quality or calling conventions. Examples include positive FD tenor/rate assumptions, the exact meaning of an installment payout schedule, and the selected leap-year/day-count basis. The CSV loader accepts a zero minimum amount and finite but negative rates; the FD model's period parser accepts zero-length periods.

**Impact:** a malformed or future catalogue row can reach the calculation model with a structurally valid but financially implausible term.

**Recommendation:** centralize product-term validation in the FDOption construction/load boundary: positive tenor, explicit allowed rate range, positive minimum amount where required, payout interval validity, payout schedule bounds, and consistent age/segment metadata. Keep exceptions for legitimate bank products explicit rather than silently accepting invalid values.

### ENG-04 — AIT is supplied as a fixed 10% engine assumption

**Current status: LIGHTWEIGHT ASSUMPTION VERSION ADDED ON FOLLOW-UP BRANCH.** The 10% rate is retained with an assumption ID, effective date and IRD source metadata. UI source disclosure is added. This is not a complete tax-regime model; individual exemptions/relief and non-resident treatment remain outside the calculator's current input model.

**Evidence:** [src/core/configuration.js L207-L213](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/configuration.js#L207-L213).

The validated configuration returns `ait_rate: 0.10`; the input schema exposes only an enable/disable switch, not a rate or effective date.

**Impact:** tax rules can change, differ by product or customer, and may include exemptions. A fixed rate can become stale without any obvious indication in a saved scenario or report.

**Recommendation:** make tax assumptions explicit and versioned: rate, effective date, source/reference, applicability and product-level exemptions if supported. At minimum, print the applied AIT rate and an “assumption—verify current tax treatment” note in the report. Do not add tax-exempt catalogue products until the model can enforce their treatment.

### ENG-05 — The end-value contract is not explicit about outflows

**Current status: COMPLETED in PR #75.** `SimResult` now exposes explicit pre-withdrawal and closing-position getters; see [results.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/results.js) and the reconciliation tests in `tests/js/results.test.js`.

See [Reporting and outputs](REPORTING-OUTPUTS.md#fin-01--final-value-is-not-the-closing-portfolio-value).

The engine has both contributed-capital/return arithmetic and ending cash/liability measures. They should have distinct names and contracts. Do not collapse them into one ambiguous “final value” field.

## Positive observations

- Dates are parsed as strict ISO calendar dates and normalized to UTC-midnight values in [dates.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/dates.js).
- The configuration schema rejects unknown top-level, account, schedule and strategy-setting properties.
- Outflow policies are explicit (`strict`, `defer`, `best_effort`) and schedule validation checks account references and date bounds.
- Balance provenance is separated into principal, uncredited interest and counted interest, which supports the goal-credit accounting model.
- The runtime validates account/provenance reconciliation before committing goal-mode state transitions.
- Transfer-fee configuration can use bank-specific same-bank and domestic inter-bank fees plus directed custom overrides.

## Tests to add

- Irregular installment payout periods and the final-payment/maturity invariant.
- Actual/actual versus actual/365 cross-year fixtures with expected bank-contract values.
- Zero/negative tenor, rate, minimum amount and payout interval validation.
- Outflow scenarios proving the distinction between contributed capital, paid withdrawals, outstanding liabilities and closing assets.
- AIT rate/effective-date and tax-exempt product fixtures.
