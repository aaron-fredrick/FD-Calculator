# FD Cal — engineering audit

**Re-audit date:** 9 November 2026  
**Audited source:** `dev` at squash merge `85f2043c4d06ac4f7bcd65ec5aa18452c98ff38a`  
**Ruleset:** [aaron-fredrick/RULESETS](https://github.com/aaron-fredrick/RULESETS) `main` at `79d7dd4f0c0d544ba85abeb19286ef2cae34bf89`  
**Status:** Updated after PR [#81](https://github.com/aaron-fredrick/FD-Calculator/pull/81) was squash-merged to `dev`. Owner feedback and current research are recorded in the [owner-feedback research register](OWNER-FEEDBACK-RESEARCH.md); remaining implementation and QA work is tracked in the [implementation plan](IMPLEMENTATION-PLAN.md).

## Reports

| Report | Coverage |
|---|---|
| [Executive summary](EXECUTIVE-SUMMARY.md) | Priority-ranked findings, owner dispositions and remediation order |
| [Implementation plan](IMPLEMENTATION-PLAN.md) | Detailed analysis, owner decisions, implementation phases, acceptance criteria and non-regression guardrails |
| [Owner-feedback research](OWNER-FEEDBACK-RESEARCH.md) | Bank product, AIT, transfer-fee, data freshness, search architecture, QA and legal research with owner-approved scope |
| [Interest day-count note](../finance/INTEREST-DAY-COUNT.md) | Concise explanation of the retained start-year 365/366 elapsed-day convention |
| [Engine and financial core](ENGINE-CORE.md) | Dates, interest, FD cash flows, simulation lifecycle, balances and results |
| [Strategies and search](STRATEGIES-AND-SEARCH.md) | Greedy, GSS, Absolute R, Absolute R+, search budgets, parity and architecture |
| [Web UI, UX and accessibility](WEB-UI-UX-ACCESSIBILITY.md) | Form flows, responsive layout, motion, keyboard and screen-reader semantics |
| [Reporting and outputs](REPORTING-OUTPUTS.md) | In-app metrics, standalone HTML, ledger, charts and financial presentation |
| [Data and financial assumptions](DATA-AND-FINANCIAL-ASSUMPTIONS.md) | Catalogue quality, provenance, eligibility, fees, AIT and product constraints |
| [Security and privacy](SECURITY-PRIVACY.md) | Untrusted configuration, DOM rendering, local storage and client-side exposure |
| [Build, deployment and quality](BUILD-DEPLOYMENT-AND-QUALITY.md) | GitHub Actions, Pages composition, dev preview, tests and operational gaps |

## Method

The review applies the principles in the RULESETS repository, principally:

- [Coding practices](https://github.com/aaron-fredrick/RULESETS/tree/main/Coding): maintainability, modularity, API contracts, error handling, security boundaries, documentation and meaningful tests.
- [UI guidelines](https://github.com/aaron-fredrick/RULESETS/tree/main/UI): product-aware design, hierarchy, restraint, interaction, motion, responsive behaviour and rendered-state QA.
- [Web engineering practices](https://github.com/aaron-fredrick/RULESETS/tree/main/Web): production standards, privacy, analytics, SEO, accessibility, performance and release readiness.

This is a risk-based source audit against all applicable Coding, UI and Web ruleset documents, covering the active JavaScript engine, strategy/search paths, browser UI, reporting, catalogue/configuration paths, CLI, build scripts, Pages workflows, crawler metadata and test inventory. It is not a line-by-line proof of every statement. It is not a formal verification, financial-product certification, penetration test, legal opinion, or complete external revalidation of every bank rate and fee. Browser screenshots, assistive-technology checks and live production/dev visual inspection remain separate verification tasks.

## Current finding status

| Status | Findings | Meaning |
|---|---|---|
| **Completed on dev** | SEC-01, FIN-01, FIN-02, ENG-05, DEPLOY-01, UI-01/02/03, DATA-01/04, FIN-03, PRIV-01/02 | Implemented and included in PR #81 squash merge; rendered browser QA remains for UI/report/legal presentation. |
| **Implemented on follow-up branch** | ENG-01, ENG-02, ENG-03, ENG-04, QA-01 (initial smoke suite; wider accessibility QA remains) |
| **Owner-approved implementation pending** | DATA-06, QA-REP-01 | Simulation-window payout filtering, central product validation, source-review freshness and browser-driven tests remain. |
| **Owner-approved scope / research only** | DATA-03, DATA-05, SEARCH-01, SEARCH-02/03, WEB-SEC-02 | Keep the interest formula; lightweight AIT source metadata; special FD and transfer research only; preserve search defaults pending benchmark; plan staged decomposition/parity; retain GitHub Pages. |
| **Scope closed** | DATA-02 | Age-segment toggles remain candidate filters, not eligibility verification. |

## Severity

- **P1 — High:** credible security exposure or materially misleading financial output. Address before broad use.
- **P2 — Medium:** correctness, runtime, data-trust or deployment risk with meaningful user impact.
- **P3 — Low:** accessibility, maintainability, observability or test-quality improvement; schedule after higher-risk work.

Each finding includes evidence, impact, and a concrete recommendation. A finding marked *assumption to confirm* should be resolved against bank/product terms before changing the model.

## Verification boundary

The original static re-audit was against `caccaf26b4415ae783959e888ff45e33becdadf6`; PR #81 was subsequently squash-merged to `dev` at `85f2043c4d06ac4f7bcd65ec5aa18452c98ff38a`. The current owner-feedback follow-up branch is based on that merged state. On the exact reviewed `dev` commit, the Node.js test/syntax workflow passed ([42553842534](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42553842534)) and the independent dev web build/publish passed ([42553842533](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42553842533)). The dev documentation/benchmark publishing workflow was still in progress when checked ([42553842591](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42553842591)). No browser automation was executed as part of this static re-audit. Static inspection does not verify screen-reader output, real-device layout, bank-product terms, or HTTP response behaviour.

## Planning status

See the [implementation plan](IMPLEMENTATION-PLAN.md) and [owner-feedback research register](OWNER-FEEDBACK-RESEARCH.md) for current phase-level status. PR #81's legal pages, privacy controls, provenance, strict CSV checks, UI fixes and earlier audit remediations are now merged to `dev`. The remaining work is focused on simulation-window payout filtering, product invariants, freshness warnings, browser automation, report QA, search benchmarks and the approved architecture plan.

PR #75 delivered the core security, result-semantics, bounded-search and catalogue-disclosure work. PR #80 split dev web/docs publishing and added dev-side assembly. The remaining code work should proceed in focused branches from the current `dev` baseline; this branch is being retained for the audit and plan.


## Crawler and release-path policy

The `/dev/` subtree is a public preview for review, not an indexable production destination. The root `robots.txt` must allow crawlers to fetch preview pages so they can observe `noindex,nofollow`; every generated dev HTML entry point must carry that directive; and the production sitemap must contain only canonical production URLs, never preview URLs. `robots.txt` is crawler guidance, not access control. The production docs build merges the canonical site root and `/web/` application URL into the documentation sitemap and publishes the assembled sitemap at the site root. Preview builds omit sitemap output, while dev HTML is marked `noindex,nofollow`; this is a verified positive control, not an open finding.
