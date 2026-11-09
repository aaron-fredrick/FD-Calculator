# FD Cal — engineering audit

**Re-audit date:** 9 November 2026  
**Audited source:** `dev` at `caccaf26b4415ae783959e888ff45e33becdadf6` (tree `8044397ede661a22c0014bb646b09df0abcc2e77`)  
**Ruleset:** [aaron-fredrick/RULESETS](https://github.com/aaron-fredrick/RULESETS) `main` at `79d7dd4f0c0d544ba85abeb19286ef2cae34bf89`  
**Status:** Static re-audit after remediation PRs [#75](https://github.com/aaron-fredrick/FD-Calculator/pull/75) and [#80](https://github.com/aaron-fredrick/FD-Calculator/pull/80). Several findings are implemented and merged to `dev`; remaining and partial findings are tracked below. This update changes audit/planning documentation only.

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

This is a risk-based, subsystem-level source audit of the active JavaScript engine, strategy/search paths, browser UI, reporting, catalogue/configuration paths, CLI, build scripts, workflows and test inventory; it is not a line-by-line proof of every statement. It is not a formal verification, financial-product certification, penetration test, legal opinion, or complete external revalidation of every bank rate and fee. Browser screenshots, assistive-technology checks and live production/dev visual inspection remain separate verification tasks.

## Current finding status

| Status | Findings | Meaning |
|---|---|---|
| **Completed** | SEC-01, FIN-01 | Implemented on `dev`, with regression coverage. |
| **Implemented; follow-up gate** | SEARCH-01 | Core behaviour and tests are in place; benchmark calibration remains. |
| **Partial** | ENG-01, ENG-02, DATA-01, DEPLOY-01 | Part of the requirement is delivered; a specific contract, source, or deployment gap remains. |
| **Open** | ENG-03/04, DATA-04/05/06, FIN-03, SEARCH-02/03, UI-01/02/03, PRIV-01, WEB-SEC-02, QA-REP-01 | Not yet resolved. |
| **Scope closed** | DATA-02 | Owner-confirmed product scope; no eligibility-verification feature planned. |
| **Deferred** | DATA-03, QA-01 | Requires a separate owner decision. |

## Severity

- **P1 — High:** credible security exposure or materially misleading financial output. Address before broad use.
- **P2 — Medium:** correctness, runtime, data-trust or deployment risk with meaningful user impact.
- **P3 — Low:** accessibility, maintainability, observability or test-quality improvement; schedule after higher-risk work.

Each finding includes evidence, impact, and a concrete recommendation. A finding marked *assumption to confirm* should be resolved against bank/product terms before changing the model.

## Verification boundary

The Node.js test workflow passed on the current audit branch code at `a9d789da2dcf5c7f73ab7d7141f2c5af52c64400` (run [42548666535](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42548666535)). The branch tree matches the merged `dev` source tree recorded above. This verifies the Node/build/workflow checks, not rendered browser behaviour, screen-reader output, real-device layout, bank-product terms, or live production deployment.

## Planning status

See the [implementation plan](IMPLEMENTATION-PLAN.md) for phase-level status. **Completed:** SEC-01 and FIN-01. **Implemented with validation/follow-up gates:** SEARCH-01. **Partial:** ENG-01, ENG-02, DATA-01 and DEPLOY-01. **Open:** DATA-04 and UI-01 through UI-03, plus the secondary findings in the subsystem reports. **Closed as scope decision:** DATA-02. **Deferred:** DATA-03 and QA-01.

PR #75 delivered the core security, result-semantics, bounded-search and catalogue-disclosure work. PR #80 split dev web/docs publishing and added dev-side assembly. The remaining code work should proceed in focused branches from the current `dev` baseline; this branch is being retained for the audit and plan.
