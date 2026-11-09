# FD Cal — engineering audit

**Re-audit date:** 9 November 2026  
**Audited source:** `dev` at `caccaf26b4415ae783959e888ff45e33becdadf6` (tree `8044397ede661a22c0014bb646b09df0abcc2e77`)  
**Ruleset:** [aaron-fredrick/RULESETS](https://github.com/aaron-fredrick/RULESETS) `main` at `79d7dd4f0c0d544ba85abeb19286ef2cae34bf89`  
**Status:** Static RULESETS re-audit of the active `dev` codebase after PRs [#75](https://github.com/aaron-fredrick/FD-Calculator/pull/75) and [#80](https://github.com/aaron-fredrick/FD-Calculator/pull/80). The deployment scope for this pass is `dev`; `main` integration is explicitly deferred. Findings and remaining work are tracked below.

## Reports

| Report | Coverage |
|---|---|
| [Executive summary](EXECUTIVE-SUMMARY.md) | Priority-ranked findings, owner dispositions and remediation order |
| [Implementation plan](IMPLEMENTATION-PLAN.md) | Detailed analysis, implementation phases, acceptance criteria and non-regression guardrails |
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
| **Completed** | SEC-01, FIN-01, FIN-02, ENG-05, DEPLOY-01 | Implemented on `dev`; applicable regression/contract coverage is present. |
| **Implemented; follow-up gate** | SEARCH-01 | Core behaviour and tests are in place; benchmark calibration remains. |
| **Partial** | ENG-01, ENG-02, DATA-01, DATA-06 | Part of the requirement is delivered; a specific contract or source gap remains. |
| **Open** | ENG-03/04, DATA-04/05, FIN-03, SEARCH-02/03, UI-01/02/03, PRIV-01, WEB-SEC-02, QA-REP-01 | Not yet resolved. |
| **Scope closed** | DATA-02 | Owner-confirmed product scope; no eligibility-verification feature planned. |
| **Deferred** | DATA-03, QA-01 | Requires a separate owner decision. |

## Severity

- **P1 — High:** credible security exposure or materially misleading financial output. Address before broad use.
- **P2 — Medium:** correctness, runtime, data-trust or deployment risk with meaningful user impact.
- **P3 — Low:** accessibility, maintainability, observability or test-quality improvement; schedule after higher-risk work.

Each finding includes evidence, impact, and a concrete recommendation. A finding marked *assumption to confirm* should be resolved against bank/product terms before changing the model.

## Verification boundary

The source reviewed is `dev` commit `caccaf26b4415ae783959e888ff45e33becdadf6`. On the exact reviewed `dev` commit, the Node.js test/syntax workflow passed ([42553842534](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42553842534)) and the independent dev web build/publish passed ([42553842533](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42553842533)). The dev documentation/benchmark publishing workflow was still in progress when checked ([42553842591](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42553842591)). No browser automation was executed as part of this static re-audit. Static inspection does not verify screen-reader output, real-device layout, bank-product terms, or HTTP response behaviour.

## Planning status

See the [implementation plan](IMPLEMENTATION-PLAN.md) for phase-level status. **Completed on `dev`:** SEC-01, FIN-01, FIN-02, ENG-05 and DEPLOY-01. **Implemented with follow-up gate:** SEARCH-01. **Partial:** ENG-01, ENG-02, DATA-01 and DATA-06. **Open:** DATA-04/05, FIN-03, UI-01 through UI-03 and the remaining subsystem findings. **Closed as scope decision:** DATA-02. **Deferred:** DATA-03, QA-01 and any `main`-branch deployment integration.

PR #75 delivered the core security, result-semantics, bounded-search and catalogue-disclosure work. PR #80 split dev web/docs publishing and added dev-side assembly. The remaining code work should proceed in focused branches from the current `dev` baseline; this branch is being retained for the audit and plan.


## Crawler and release-path policy

The `/dev/` subtree is a public preview for review, not an indexable production destination. The production root `robots.txt` must disallow `/FD-Calculator/dev/`; every generated dev HTML entry point must carry `noindex,nofollow`; and the production sitemap must contain only canonical production URLs, never preview URLs. `robots.txt` is crawler guidance, not access control. The production docs build merges the canonical site root and `/web/` application URL into the documentation sitemap and publishes the assembled sitemap at the site root. Preview builds omit sitemap output, while dev HTML is marked `noindex,nofollow`; this is a verified positive control, not an open finding.
