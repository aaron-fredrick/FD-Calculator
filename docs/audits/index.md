# FD Cal — engineering audit

**Audit date:** 8 November 2026  
**Audited source:** `dev` at `a455462a959f37db757970d0a3078a4d9a3ef028`  
**Ruleset:** [aaron-fredrick/RULESETS](https://github.com/aaron-fredrick/RULESETS)  
**Status:** Static engineering review with owner feedback incorporated. The implementation plan is documentation only; no application changes have been applied.

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

## Severity

- **P1 — High:** credible security exposure or materially misleading financial output. Address before broad use.
- **P2 — Medium:** correctness, runtime, data-trust or deployment risk with meaningful user impact.
- **P3 — Low:** accessibility, maintainability, observability or test-quality improvement; schedule after higher-risk work.

Each finding includes evidence, impact, and a concrete recommendation. A finding marked *assumption to confirm* should be resolved against bank/product terms before changing the model.

## Verification boundary

The Node.js test workflow passed on the audited dev revision `a455462a959f37db757970d0a3078a4d9a3ef028` (run [42509949387](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42509949387)). The audit did not include a manual browser or screen-reader session. Deployment status is tracked separately from source-level findings.

## Planning status

Owner feedback has been recorded in the [implementation plan](IMPLEMENTATION-PLAN.md). SEC-01 and FIN-01 are accepted P1 work; SEARCH-01, DATA-01 and DEPLOY-01 are accepted workstreams. ENG-01 requires product-term clarification before changing payout dates; ENG-02 retains the current elapsed-day convention pending source verification. DATA-02 is an intentional scope boundary. DATA-03 and QA-01 are deferred for owner decisions.

The audit branch remains report/plan-only. Implementation should proceed in focused branches from `dev`, with the plan's regression and non-regression gates.
