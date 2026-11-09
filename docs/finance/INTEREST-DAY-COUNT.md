# FD Cal interest day-count convention

**Reviewed:** 9 November 2026  
**Status:** Current implementation retained by owner decision.  
**Scope:** This note explains the annual-rate denominator used by FD Cal. It is not a statement that every bank uses the same convention.

## Calculation

FD Cal measures the actual number of elapsed calendar days between the accrual start and end dates. When the “Actual leap-year day count” option is enabled, it selects one annual denominator from the **calendar year in which accrual starts**:

- 366 days if the start year is a leap year.
- 365 days if the start year is not a leap year.

That selected denominator is applied to the entire accrual interval. An interval crossing into another calendar year is not split into separate yearly segments.

For simple interest:

`interest = principal × (annual_rate / 100) × elapsed_days / year_base_days`

For compound interest, the same selected denominator is used as the daily compounding base.

If leap-year handling is disabled, the denominator is 365.

## Example

An FD opened in a non-leap year uses 365 as its denominator even if its tenor crosses into a leap year. An FD opened in a leap year uses 366 for the complete interval, even if it matures in the following non-leap year.

This is a start-year denominator convention. It is not calendar-segmented Actual/Actual.

## Why it remains unchanged

The owner confirmed that FD Cal should use the year associated with the accrual start/rate assumption, and that the current relative elapsed-day approach is intentional. No reviewed public bank product page established a universal Sri Lankan bank day-count basis that would justify replacing it.

Public product references reviewed:
- [HNB Finance — Fixed Deposits](https://www.hnbfinance.lk/fixed-deposits/) — publishes tenor and monthly/maturity payout choices.
- [National Savings Bank — Fixed Deposit](https://www.nsb.lk/product/ordinary-term/fixed-deposit/) — publishes available tenors and monthly/maturity interest payout.
- [Commercial Bank — Fixed Deposit Key Facts Document](https://www.combank.lk/downloads/file/206/fixed-deposits) — publishes product terms and payout choices.

These references do not specify enough detail to assert that their underlying calculations match FD Cal's start-year denominator. Users should verify the applicable day-count, compounding, rounding and early-withdrawal terms with the relevant bank.

## Change control

Do not silently switch to Actual/Actual calendar-year segmentation, Actual/365, Actual/366, or a bank-specific convention. Any change requires:
1. An authoritative bank/product source identifying the convention.
2. Expected-value fixtures for leap-year and cross-year periods.
3. Before/after results for simple and compound interest.
4. A separate owner-approved financial-model change.
