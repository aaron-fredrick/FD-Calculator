# FD Cal — engineering audit

**Re-audit date:** 9 November 2026  
**Base audited:** `dev` at PR #81 squash merge `85f2043c4d06ac4f7bcd65ec5aa18452c98ff38a`  
**Active follow-up branch:** `audit/owner-feedback-followups`  
**Ruleset:** [aaron-fredrick/RULESETS](https://github.com/aaron-fredrick/RULESETS)  
**Status:** The original source audit, owner decisions and follow-up implementation are tracked separately. This index reflects the current branch status; it is not a claim that all QA gates are green.

## Reports

| Report | Coverage |
|---|---|
| [Executive summary](EXECUTIVE-SUMMARY.md) | Current finding dispositions, blockers and release readiness |
| [Implementation plan](IMPLEMENTATION-PLAN.md) | Detailed owner decisions, implementation evidence, acceptance criteria and remaining tasks |
| [Owner-feedback research](OWNER-FEEDBACK-RESEARCH.md) | Bank product, AIT, transfer-fee, data freshness, search architecture, QA and legal research |
| [Search budget calibration](SEARCH-BUDGET-CALIBRATION.md) | Controlled 5k/10k/20k/unlimited × 15/30/60s comparison |
| [Interest day-count note](../finance/INTEREST-DAY-COUNT.md) | Retained start-year 365/366 elapsed-day convention |
| [Engine and financial core](ENGINE-CORE.md) | Dates, interest, FD cash flows, simulation lifecycle, balances and results |
| [Strategies and search](STRATEGIES-AND-SEARCH.md) | Greedy, GSS, Absolute R, Absolute R+, search budgets, parity and architecture |
| [Web UI, UX and accessibility](WEB-UI-UX-ACCESSIBILITY.md) | Form flows, responsive layout, motion, keyboard and screen-reader semantics |
| [Reporting and outputs](REPORTING-OUTPUTS.md) | In-app metrics, standalone HTML, ledger, charts and financial presentation |
| [Data and financial assumptions](DATA-AND-FINANCIAL-ASSUMPTIONS.md) | Catalogue quality, provenance, eligibility, fees, AIT and product constraints |
| [Security and privacy](SECURITY-PRIVACY.md) | Untrusted configuration, DOM rendering, local storage and client-side exposure |
| [Build, deployment and quality](BUILD-DEPLOYMENT-AND-QUALITY.md) | GitHub Actions, Pages composition, dev preview, tests and operational gaps |

## Current disposition

- **Completed on dev:** SEC-01, FIN-01/02, ENG-05, DEPLOY-01, UI-01/02/03, DATA-01/04, FIN-03 and PRIV-01/02.
- **Implemented on the follow-up branch:** ENG-01/02/03/04, SEARCH-01 calibration and initial QA-01 Playwright suite.
- **Partially complete:** SEARCH-03 has strict/deferred outflow parity across Greedy, GSS, Absolute R and Absolute R+, but booking/maturity/payout/fee/reserved-liquidity parity remains. QA-REP-01 has standalone report browser coverage, but the latest print-width assertion failed and needs a green rerun.
- **Metadata contract complete; source review pending:** DATA-06 tracks source review, material economic updates and schema version independently. All 29 indexed banks still have blank review/update dates until real source checks are performed.
- **Open:** WEB-SEC-02 response-header verification on actual production and dev Pages URLs.
- **Deferred:** SEARCH-02 broad decomposition, DATA-03 special-product modelling, richer DATA-05 transfer-channel fees, main-branch preview assembler port and external legal counsel review.
- **Scope closed:** DATA-02 age-segment controls are filters, not depositor identity or eligibility checks.

## Verification boundary

The latest checked workflow before the print CSS correction was [42571366220](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42571366220): Node tests, syntax checks and production/dev builds passed; five of six browser tests passed; the standalone report print-width check failed at 433px against a 321px viewport. A print CSS correction is committed and awaits CI rerun. Earlier passing workflows predate this failure and do not establish current green status.

This is a risk-based source audit and targeted implementation verification. It is not a line-by-line proof, financial-product certification, penetration test, legal opinion, full WCAG assessment or external revalidation of every bank rate and fee. Manual screen-reader, contrast, zoom, print/PDF, live deployment/header and bank-source checks remain outstanding.

## Severity

- **P1 — High:** credible security exposure or materially misleading financial output.
- **P2 — Medium:** correctness, runtime, data-trust or deployment risk with meaningful user impact.
- **P3 — Low:** accessibility, maintainability, observability or test-quality improvement.

See the [implementation plan](IMPLEMENTATION-PLAN.md) for ordered remaining work and acceptance gates.
