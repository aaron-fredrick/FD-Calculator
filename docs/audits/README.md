# FD Cal — engineering audit

**Re-audit date:** 9 November 2026  
**Base:** `dev` at PR #81 squash merge `85f2043c4d06ac4f7bcd65ec5aa18452c98ff38a`  
**Active follow-up branch:** `audit/owner-feedback-followups`  
**Ruleset:** [aaron-fredrick/RULESETS](https://github.com/aaron-fredrick/RULESETS)

This audit index has been reconciled against the working branch. Owner decisions and source research are in the [owner-feedback research register](OWNER-FEEDBACK-RESEARCH.md); implementation evidence and remaining acceptance work are in the [implementation plan](IMPLEMENTATION-PLAN.md).

## Reports

| Report | Coverage |
|---|---|
| [Executive summary](EXECUTIVE-SUMMARY.md) | Current finding dispositions, blockers and release readiness |
| [Implementation plan](IMPLEMENTATION-PLAN.md) | Owner decisions, implementation evidence, acceptance criteria and remaining tasks |
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

## Current finding status

| Status | Findings | Disposition |
|---|---|---|
| **Completed on dev** | SEC-01, FIN-01/02, ENG-05, DEPLOY-01, UI-01/02/03, DATA-01/04, FIN-03, PRIV-01/02 | Merged through PRs #75, #80 and #81. Rendered accessibility QA remains separate. |
| **Implemented on follow-up branch** | ENG-01/02/03/04, SEARCH-01 calibration, QA-01 browser suite | Code and tests are present. Latest verification is [run 42573879316](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42573879316), which checks a fix for missing semantic column-header scopes in the generated event ledger. |
| **Partial / ongoing control** | SEARCH-03, QA-REP-01 | Strict/deferred outflow parity exists across four strategies, but booking/maturity/payout/fee/reserved-liquidity parity remains. Report semantic-header and print-width browser assertions are being verified; offline/chart checks and manual accessibility/print QA remain. |
| **Metadata contract implemented; data review pending** | DATA-06 | Source review, economic update and schema version are separate. All 29 bank review/update dates remain blank pending real source checks. |
| **Research / documented limitation** | DATA-03, DATA-05 | Special-product constraints remain inactive; transfer fees remain deliberately simplified. |
| **Open hosting verification** | WEB-SEC-02 | GitHub Pages retained by owner decision; actual production/dev response headers remain to be checked. |
| **Deferred architecture** | SEARCH-02 | Staged decomposition plan only; no broad refactor before parity baselines. |
| **Scope closed** | DATA-02 | Age-segment controls are candidate filters, not eligibility verification. |

## Method and verification boundary

The review applies the [Coding](https://github.com/aaron-fredrick/RULESETS/tree/main/Coding), [UI](https://github.com/aaron-fredrick/RULESETS/tree/main/UI) and [Web](https://github.com/aaron-fredrick/RULESETS/tree/main/Web) rulesets. It is a risk-based source audit of the active engine, strategy/search paths, browser UI, reporting, catalogue/configuration paths, CLI, build scripts, Pages workflows and tests. It is not a line-by-line proof, formal verification, financial-product certification, penetration test, legal opinion or complete external revalidation of every bank rate and fee.

The latest completed workflow before the current verification is [42573696604](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42573696604). It passed the first five browser tests but failed the standalone-report semantic-header assertion because the event-ledger table headers lacked `scope=col`; that markup is fixed in commit `6a15b8b`. An earlier run, [42571366220](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42571366220), exposed a 433px print table against a 321px viewport; a print CSS constraint is present, but its assertion still needs to pass after the semantic-header fix. Current verification: [42573879316](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42573879316) (in progress at the time of this update). Earlier passing workflows predate these report assertions and do not establish current green status.

Static inspection and automated smoke tests do not establish screen-reader output, full WCAG conformance, real-device behaviour, actual printed/PDF pagination, live bank rates or deployed HTTP response headers.

## Remaining work

1. Complete the current report-browser run: semantic column headers, 320px overflow and print-width assertions must all pass.
2. Expand cross-strategy parity to eligible bookings, maturity/installment payouts, fees and reserved liquidity.
3. Complete offline/chart report checks and manual print, keyboard, screen-reader, contrast and 200–400% zoom review.
4. Recheck bank sources and populate only defensible review/update dates.
5. Verify actual production and dev response headers.
6. Keep SEARCH-02 refactoring, special-product activation, transfer-channel modelling and main-branch preview integration deferred.

See the [implementation plan](IMPLEMENTATION-PLAN.md) for detailed acceptance gates.

## Crawler and release-path policy

The `/dev/` subtree is a public preview, not an indexable production destination. The root `robots.txt` permits crawlers to fetch preview pages so they can observe `noindex,nofollow`; every generated dev HTML entry point must carry that directive; and the production sitemap must contain only canonical production URLs, never preview URLs. `robots.txt` is crawler guidance, not access control. Production docs output merges canonical root and `/web/` URLs into the sitemap. Preview builds omit sitemap output and mark dev HTML noindex. This is a verified positive control, not an open finding.
