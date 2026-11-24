# FD Cal — engineering audit

**Current source:** `dev` at [`cbdc6b25b9119f6db564281a97adfcc8958d43a0`](https://github.com/aaron-fredrick/FD-Calculator/commit/cbdc6b25b9119f6db564281a97adfcc8958d43a0)  
**Status reviewed:** 25 November 2026  
**Latest verified CI:** [45472055379](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/45472055379) — successful on current `dev` HEAD.  
**Ruleset:** [aaron-fredrick/RULESETS](https://github.com/aaron-fredrick/RULESETS)

This index describes the current development branch. Earlier audit reports and implementation notes contain dated observations; where they conflict with this index, use current code, tests and CI evidence, not old branch/status statements. PR #91 merged the owner-feedback follow-up work into `dev`. The former `audit/owner-feedback-followups` branch is not active.

## Reports

| Report | Coverage |
|---|---|
| [Executive summary](EXECUTIVE-SUMMARY.md) | Current finding dispositions, residual risks and verification boundaries |
| [Implementation plan](IMPLEMENTATION-PLAN.md) | Historical remediation plan and current status note |
| [Owner-feedback research](OWNER-FEEDBACK-RESEARCH.md) | Bank product, AIT, transfer-fee, data freshness, search architecture, QA and legal research |
| [Search budget calibration](SEARCH-BUDGET-CALIBRATION.md) | Controlled search-budget comparisons |
| [Interest day-count note](../finance/INTEREST-DAY-COUNT.md) | Retained start-year 365/366 elapsed-day convention |
| [Engine and financial core](ENGINE-CORE.md) | Dates, interest, FD cash flows, simulation lifecycle, balances and results |
| [Strategies and search](STRATEGIES-AND-SEARCH.md) | Greedy, GSS, Absolute R, Absolute R+, search budgets, parity and architecture |
| [Web UI, UX and accessibility](WEB-UI-UX-ACCESSIBILITY.md) | Form flows, responsive layout, motion, keyboard and screen-reader semantics |
| [Reporting and outputs](REPORTING-OUTPUTS.md) | In-app metrics, standalone HTML, ledger, charts and financial presentation |
| [Data and financial assumptions](DATA-AND-FINANCIAL-ASSUMPTIONS.md) | Catalogue quality, provenance, eligibility, fees, AIT and product constraints |
| [Security and privacy](SECURITY-PRIVACY.md) | Untrusted configuration, DOM rendering, local storage and client-side exposure |
| [Build, deployment and quality](BUILD-DEPLOYMENT-AND-QUALITY.md) | GitHub Actions, Pages composition, dev preview, tests and operational gaps |

## Current finding status

| Area / finding | Current disposition |
|---|---|
| SEC-01 — imported account ID output encoding | **Completed on dev.** Attribute values are escaped and security regression coverage exists. |
| FIN-01 / FIN-02 — result and capital labels | **Completed on dev.** Pre-withdrawal value, closing assets/liabilities and contributed capital are distinguished. |
| FIN-03 / DATA-01 — product provenance | **Implemented on dev via PR #91.** Metadata flows through loaders, worker reconstruction and reports; manual rendered review remains. |
| ENG-01 — installment payout window | **Implemented on dev via PR #91.** Generated payout events are bounded by the selected simulation window. |
| ENG-02 — interest day-count disclosure | **Implemented on dev via PR #91.** Existing start-year 365/366 elapsed-day convention is retained and documented. |
| ENG-03 — central FD term validation | **Implemented on dev via PR #91.** Central validation and row-level diagnostics are tested. |
| ENG-04 — AIT baseline metadata | **Implemented on dev via PR #91.** Lightweight 10% baseline and source/effective-date disclosure; not a general tax engine. |
| DATA-04 — strict CSV structure | **Implemented on dev via PR #91.** Malformed quoting and row-width errors are rejected; catalogue inventory tests cover checked-in CSVs. |
| UI-01/02/03, PRIV-01/02 | **Implemented on dev.** Interaction/accessibility controls, draft retention controls and legal/preference pages are present. Manual assistive-technology/legal review remains. |
| DEPLOY-01 / QA-01 | **Implemented on dev.** Dev preview pipeline and Playwright Chromium smoke tests are present; current CI run is green. |
| SEARCH-01 — bounded browser search | **Implemented and calibrated.** Browser baseline is 10,000 expanded states / 30 seconds, with deliberate longer/unlimited modes. No optimality guarantee follows from the budget. |
| SEARCH-03 — cross-strategy planner parity | **Partial.** Greedy strict-outflow reservation is fixed; broader parity across booking, maturity/installment payouts, transfers, fees and multiple obligations remains. |
| QA-REP-01 — standalone report QA | **Partial.** Automated semantic-header, narrow-screen and print-width smoke assertions pass. Offline behaviour, chart initialization, large ledgers, actual print/PDF pagination and manual accessibility QA remain. |
| DATA-06 — bank source freshness | **Metadata contract implemented; source review open.** Do not populate review/update dates without an actual source check. |
| WEB-SEC-02 — deployed response headers | **Open.** Production and `/dev/` HTTP response headers have not been verified from live origins. Repository files do not prove host response headers. |
| DATA-03 — special-product constraints | **Deferred.** Keep products with unenforced caps, eligibility or tax conditions out of the active catalogue. |
| DATA-05 — transfer-channel modelling | **Documented limitation.** Current fee approximation is not a full channel/tier/privilege model. |
| SEARCH-02 — strategy decomposition | **Deferred.** Do not perform broad refactoring before parity baselines. |
| DATA-02 — age-segment selection | **Closed scope boundary.** Candidate filtering is not depositor eligibility verification. |

## Verification and scope boundary

Workflow [45472055379](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/45472055379) is successful against the current `dev` HEAD recorded above. Consult the run for exact jobs and results. CI success does not establish full WCAG conformance, screen-reader output, real-device behaviour, actual printed/PDF pagination, live bank rates, legal compliance, financial-product certification, penetration-test coverage or deployed HTTP response headers. This is a risk-based engineering audit, not formal verification or professional financial/legal advice.

## Remaining work

1. Extend cross-strategy parity fixtures for eligible FD bookings, maturity/installment payouts, transfer fees and reserved liquidity across Greedy, GSS, Absolute R and Absolute R+.
2. Complete standalone-report offline/chart/large-ledger checks and manual print, keyboard, screen-reader, contrast and 200–400% zoom review.
3. Review bank product/rate/fee sources institution by institution. Record review dates only after genuine checks.
4. Capture and assess actual production and `/dev/` response headers.
5. Keep SEARCH-02 refactoring, DATA-03 activation and richer DATA-05 transfer modelling deferred until separately scoped.

## Crawler and release-path policy

The `/dev/` subtree is a public preview, not an indexable production destination. The root `robots.txt` permits crawlers to fetch preview pages so they can observe `noindex,nofollow`; every generated dev HTML entry point must carry that directive; and the production sitemap must contain only canonical production URLs, never preview URLs. `robots.txt` is crawler guidance, not access control. Production docs output merges canonical root and `/web/` URLs into the sitemap. Preview builds omit sitemap output and mark dev HTML noindex. Treat these as repository build controls; check deployed behaviour after publication.
