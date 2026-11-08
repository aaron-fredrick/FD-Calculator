# Engine and financial core audit

## Scope

Reviewed the configuration boundary, account/FD models, interest calculation, cash-flow generation, event normalization, outflow handling, provenance, simulation result construction and runtime result assembly.

## Findings

### ENG-01 — Installment cash flows can occur after contractual maturity

**Severity: P2**

**Evidence:** [src/core/models.js L101-L109](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/models.js#L101-L109).

The installment branch appends each date generated from the payout interval and stops only when the date is greater than or equal to maturity. It then returns those dates unchanged. If the interval does not divide the tenor, the last date is later than maturity. For example, a five-month FD with a two-month payout interval generates months 2, 4 and 6. A payout interval longer than the tenor also produces a single cash flow after maturity.

**Impact:** the simulation can leave principal/interest unavailable beyond the product's stated maturity, and a product can pass the maturity-within-horizon filter while its final installment falls outside the simulation horizon.

**Recommendation:** clamp the final installment date to maturity, or reject unsupported payout/tenor combinations at catalogue load time. Add regression cases for 5m/2m, 5m/6m and exact-divisor schedules. Verify that all generated cash flows satisfy `date <= maturityDate(start)`.

### ENG-02 — Leap-year calculation is a start-year denominator, not a clearly specified day-count convention

**Severity: P2**

**Evidence:** [src/core/interest.js L3-L18](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/interest.js#L3-L18); [src/core/models.js L79-L83](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/models.js#L79-L83).

When `actual_leap_year` is enabled, `getYearBaseDays` selects 365 or 366 from the calendar year of `onDate`. `calcInterest` then applies that one denominator to every day in the interval. A cumulative FD spanning multiple calendar years is not split into yearly accrual segments. A tenor starting in a non-leap year and crossing a leap year therefore uses 365 throughout; a tenor starting in a leap year and crossing a non-leap year uses 366 throughout.

**Impact:** results can differ from a bank's actual/actual, actual/365, actual/366 or other contract-specific basis. The label “Actual leap-year basis” does not make the precise convention clear.

**Recommendation:** define the supported day-count convention explicitly and align the UI/report wording with it. If the intended convention is actual/actual, accrue each calendar-year segment using that year's denominator. If it is start-year basis, document that and verify it against representative bank terms. Add tests for 1m, 12m and multi-year FDs crossing 29 February in both directions.

### ENG-03 — Financial invariants are mostly distributed across constructors and runtime code

**Evidence:** [config-schema.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/config-schema.js), [configuration.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/configuration.js), [models.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/models.js), [simulation-runtime.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/simulation-runtime.js).

The boundary validation is reasonably strict, but some model invariants still rely on catalogue quality or calling conventions. Examples include positive FD tenor/rate assumptions, the exact meaning of an installment payout schedule, and the selected leap-year/day-count basis. The CSV loader accepts a zero minimum amount and finite but negative rates; the FD model's period parser accepts zero-length periods.

**Impact:** a malformed or future catalogue row can reach the calculation model with a structurally valid but financially implausible term.

**Recommendation:** centralize product-term validation in the FDOption construction/load boundary: positive tenor, explicit allowed rate range, positive minimum amount where required, payout interval validity, payout schedule bounds, and consistent age/segment metadata. Keep exceptions for legitimate bank products explicit rather than silently accepting invalid values.

### ENG-04 — AIT is supplied as a fixed 10% engine assumption

**Evidence:** [src/core/configuration.js L207-L213](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/configuration.js#L207-L213).

The validated configuration returns `ait_rate: 0.10`; the input schema exposes only an enable/disable switch, not a rate or effective date.

**Impact:** tax rules can change, differ by product or customer, and may include exemptions. A fixed rate can become stale without any obvious indication in a saved scenario or report.

**Recommendation:** make tax assumptions explicit and versioned: rate, effective date, source/reference, applicability and product-level exemptions if supported. At minimum, print the applied AIT rate and an “assumption—verify current tax treatment” note in the report. Do not add tax-exempt catalogue products until the model can enforce their treatment.

### ENG-05 — The end-value contract is not explicit about outflows

See [Reporting and outputs](REPORTING-OUTPUTS.md#fin-01--final-value-is-not-the-closing-portfolio-value).

The engine has both contributed-capital/return arithmetic and ending cash/liability measures. They should have distinct names and contracts. Do not collapse them into one ambiguous “final value” field.

## Positive observations

- Dates are parsed as strict ISO calendar dates and normalized to UTC-midnight values in [dates.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/dates.js).
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
