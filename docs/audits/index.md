# FD Cal — engineering audit

**Re-audit date:** 9 November 2026  
**Base audited:** `dev` at PR #81 squash merge `85f2043c4d06ac4f7bcd65ec5aa18452c98ff38a`  
**Active follow-up branch:** `audit/owner-feedback-followups`  
**Ruleset:** [aaron-fredrick/RULESETS](https://github.com/aaron-fredrick/RULESETS)

This index tracks the audit, owner decisions and follow-up implementation separately. The [owner-feedback research register](OWNER-FEEDBACK-RESEARCH.md) contains external research; the [implementation plan](IMPLEMENTATION-PLAN.md) contains implementation evidence, acceptance criteria and remaining work.

## Reports

| Report | Coverage |
|---|---|
| [Executive summary](EXECUTIVE-SUMMARY.md) | Current finding dispositions, verification status and release readiness |
| [Implementation plan](IMPLEMENTATION-PLAN.md) | Owner decisions, implementation evidence, acceptance criteria and remaining tasks |
| [Owner-feedback research](OWNER-FEEDBACK-RESEARCH.md) | Bank product, AIT, transfer-fee, data freshness, search architecture, QA and legal research |
| [Search budget calibration](SEARCH-BUDGET-CALIBRATION.md) | Controlled 5k/10k/20k/unlimited × 15/30/60s comparison |
| [Interest day-count note](../finance/INTEREST-DAY-COUNT.md) | Retained start-year 365/366 elapsed-day convention |
| [Bank dataset metadata](../data/BANK-DATA-METADATA.md) | Independent review, economic-update and schema-version dates |
| [Engine and financial core](ENGINE-CORE.md) | Dates, interest, FD cash flows, simulation lifecycle, balances and results |
| [Strategies and search](STRATEGIES-AND-SEARCH.md) | Greedy, GSS, Absolute R, Absolute R+, search budgets, parity and architecture |
| [Web UI, UX and accessibility](WEB-UI-UX-ACCESSIBILITY.md) | Form flows, responsive layout, motion, keyboard and screen-reader semantics |
| [Reporting and outputs](REPORTING-OUTPUTS.md) | In-app metrics, standalone HTML, ledger, charts and financial presentation |
| [Data and financial assumptions](DATA-AND-FINANCIAL-ASSUMPTIONS.md) | Catalogue quality, provenance, eligibility, fees, AIT and product constraints |
| [Security and privacy](SECURITY-PRIVACY.md) | Untrusted configuration, DOM rendering, local storage and client-side exposure |
| [Build, deployment and quality](BUILD-DEPLOYMENT-AND-QUALITY.md) | GitHub Actions, Pages composition, dev preview, tests and operational gaps |

## Current disposition

- **Completed on dev:** SEC-01, FIN-01/02, ENG-05, DEPLOY-01, UI-01/02/03, DATA-01/04, FIN-03 and PRIV-01/02.
- **Implemented on follow-up branch:** ENG-01/02/03/04, SEARCH-01 calibration and QA-01 Playwright suite.
- **Partially complete:** SEARCH-03 has strict/deferred outflow parity across Greedy, GSS, Absolute R and Absolute R+, but booking/maturity/payout/fee/reserved-liquidity parity remains. QA-REP-01 automated report assertions pass; offline/chart checks and manual print/accessibility review remain.
- **Metadata contract complete; source review pending:** DATA-06 separates source review, material economic updates and schema version. All 29 indexed bank rows still have blank review/update dates pending genuine source checks.
- **Open verification:** WEB-SEC-02 production and dev Pages response headers.
- **Deferred:** SEARCH-02 broad decomposition, DATA-03 special-product modelling, richer DATA-05 transfer-channel fees, main-branch preview assembler port and external legal counsel review.
- **Scope closed:** DATA-02 age-segment controls are filters, not depositor identity or eligibility checks.

## Verification

The latest verified workflow is [42574353592](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42574353592). Its Node.js test job completed successfully, including Node tests, syntax checks, production/dev browser builds, all six Chromium browser tests, documentation-preservation build and workflow YAML parsing. This run supersedes the earlier failed print-width run [42571366220](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42571366220).

Automated report checks now cover semantic event-ledger headers, 320px document overflow and print table width. Static inspection and automated smoke tests do not establish screen-reader output, full WCAG conformance, real-device behaviour, actual printed/PDF pagination, live bank rates or deployed HTTP response headers.

This is a risk-based source audit and targeted implementation verification. It is not a line-by-line proof, financial-product certification, penetration test, legal opinion, full WCAG assessment or external revalidation of every bank rate and fee.

## Crawler and release-path policy

The `/dev/` subtree is a public preview, not an indexable production destination. Root `robots.txt` permits crawlers to fetch preview pages so they can observe `noindex,nofollow`; every generated dev HTML entry point must carry that directive; and the production sitemap must contain only canonical production URLs, never preview URLs. `robots.txt` is crawler guidance, not access control. Production docs output merges canonical root and `/web/` URLs into the sitemap. Preview builds omit sitemap output and mark dev HTML noindex. This is a verified positive control, not an open finding.


## Latest verification checkpoint

Workflow [42585867964](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42585867964) passed the expanded cross-strategy booking/installment/maturity/fee fixture and the complete automated pipeline. Future strict/deferred obligation liquidity reservation remains an open SEARCH-03 item; this checkpoint does not close financial parity.
