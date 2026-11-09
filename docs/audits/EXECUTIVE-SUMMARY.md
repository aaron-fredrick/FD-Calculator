# Executive summary

**Source:** `dev` at `a455462a959f37db757970d0a3078a4d9a3ef028`  
**Review type:** Static engineering audit against the project [RULESETS](https://github.com/aaron-fredrick/RULESETS).  
**Owner feedback:** Incorporated into the [implementation plan](IMPLEMENTATION-PLAN.md).

## Overall assessment

FD Cal has a solid foundation: the browser and CLI share the JavaScript engine; the browser calculation runs in a dedicated worker; the configuration shape is explicitly validated; reporting escapes most dynamic text; the standalone report is self-contained; search diagnostics expose pruning and optimality status; and the test suite includes financial, strategy-parity, worker-contract, reporting and workflow-contract coverage.

The main risks are not a lack of architecture. They are a small number of important trust-boundary, financial-presentation, runtime, and catalogue-transparency gaps:

1. Imported account IDs can reach HTML attributes without escaping, creating a DOM-XSS path.
2. The displayed “Final value” is a pre-withdrawal capital-plus-return measure, not the actual closing portfolio value after paid outflows.
3. Installment products can generate a final payment date after nominal FD maturity; contractual payout semantics need confirmation before changing this.
4. Product-source quality and dataset freshness are not sufficiently visible in the user-facing product selection/report.
5. The browser's default Absolute R+ run has no default decision cap or post-start execution timeout.

The project should not be described as financially validated until output semantics, payout timing, day-count conventions, and product-source transparency have been explicitly documented and tested.

## Priority findings

| ID | Severity | Finding | Main location |
|---|---|---|---|
| SEC-01 | **P1** | Unescaped imported account IDs are interpolated into account-card HTML attributes | [app.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js), [config-schema.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/config-schema.js) |
| FIN-01 | **P1** | “Final value” is a pre-withdrawal aggregate but is presented as closing portfolio value | [results.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/results.js), [app.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js) |
| ENG-01 | **P2** | Installment cash-flow generation can place the final payment after nominal maturity; product contract needs clarification | [models.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/models.js) |
| ENG-02 | **P2** | Actual elapsed days use one 365/366 base selected from the accrual start year | [interest.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/interest.js) |
| SEARCH-01 | **P2** | Scoped Absolute R+ has no finite default decision cap or post-start time limit | [search-strategy-base.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/strategies/search-strategy-base.js), [simulation-runner.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/simulation-runner.js) |
| DATA-01 | **P2** | Per-bank source status and dataset freshness are not adequately exposed to users | [app.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js), [fd_options.csv](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/data/fd_options/fd_options.csv) |
| DATA-02 | **Scope boundary** | Senior/minor toggles include product categories; they do not verify depositor eligibility | [configuration.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/configuration.js) |
| DATA-03 | **Deferred** | Active FD model does not represent all special-product caps/tax treatment in the research register | [models.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/models.js) |
| DEPLOY-01 | **P2** | Production Pages assembly must preserve the public `/dev/` subtree on every deployment | [pages.yml](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/.github/workflows/pages.yml) |
| DATA-04 | **P3** | CSV parser silently ignores surplus fields and fills missing fields with empty strings | [csv.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/io/csv.js) |
| UI-01 | **P3** | Programmatic smooth scrolling does not check reduced-motion preference | [app.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js) |
| QA-01 | **Deferred** | No automated real-browser end-to-end suite was identified in the test inventory | [tests/](https://github.com/aaron-fredrick/FD-Calculator/tree/a455462a959f37db757970d0a3078a4d9a3ef028/tests) |

## Owner feedback and decisions

| Finding | Decision / interpretation | Planned treatment |
|---|---|---|
| **SEC-01** | Confirmed valid finding | P1 security fix. Encode account IDs at the DOM boundary; preserve imported ID compatibility and test malicious files. |
| **FIN-01** | Confirmed overlooked result-presentation issue | P1 financial-result correction. The runtime already credits inflows/cash flows, settles outflows, then requests a strategy decision. Search state and terminal evaluation already account for paid and outstanding outflows. Keep settlement in the runtime and strategy objective unchanged; expose separate pre-withdrawal and closing-position metrics. |
| **ENG-01** | Event order is intentional: cash inflows/FD cash flows first, outflows second, decision third | Preserve and test this order. It does not alone determine whether a final installment after nominal maturity matches a bank contract. Do not clamp dates until representative product terms establish the correct model. |
| **ENG-02** | Project intends an actual elapsed-day/relative-delta basis | Keep the current formula for now; document the exact start-year 365/366 denominator and verify against representative bank terms before changing financial calculations. |
| **SEARCH-01** | Finite defaults are required, but users may opt into unlimited work | Benchmark candidate defaults (initial candidates: 10,000 expanded states and 30 seconds); represent unlimited decisions explicitly and use timeout `0` for unlimited time. Preserve best-feasible-result and optimality diagnostics. |
| **DATA-01** | Show when each bank's dataset was last updated/reviewed and add a disclaimer | Add a bank-specific review date and source status beside the selected bank. Keep this distinct from the bank's product effective date. |
| **DATA-02** | Eligibility verification is the user's responsibility; FD Cal is not a bank onboarding/security gate | Treat senior/minor toggles as inclusion filters. Retain a clear disclaimer; do not add age/guardian verification as part of this work. |
| **DATA-03** | Scope not yet clear | Defer until the owner specifies which special-product constraints should be modelled. Keep products with unenforced critical terms out of the active catalogue. |
| **DEPLOY-01** | Dev preview is intentionally public for users and contributors | Make `main` Pages assembly preserve the latest `/dev/` subtree; a normal production deploy must not remove it. |
| **DATA-04** | Needs investigation and a safe implementation plan | Inventory all CSV files first, then enforce exact row widths and valid quoting with actionable errors. |
| **UI-01** | Include in the implementation plan | Centralize programmatic scrolling and honor `prefers-reduced-motion` without changing normal-motion transitions. |
| **QA-01** | Needs owner decision | Finding means no automated real-browser E2E suite was found. Defer the choice between Playwright smoke coverage and manual browser verification. |

## Positive controls worth preserving

- **Shared engine:** the browser worker and CLI call the same core strategy/simulation implementation.
- **Runtime boundary:** `SimulationRuntime` is the authoritative event processor and executor; strategies consume planning views and submit decisions.
- **Outflow sequencing:** same-date inflows, FD cash flows, and maturities are credited before outflows are settled; strategy decisions follow settlement.
- **Input validation:** configuration keys, data types, ranges and schedule relationships are checked before simulation.
- **Worker protocol:** the implementation correctly avoids using `event.origin` as authentication for a dedicated Worker and validates the message contract.
- **Report output:** dynamic report text is generally escaped; embedded JSON protects closing-script sequences; the report is self-contained.
- **Strategy transparency:** Absolute R+ exposes expanded states, beam pruning, budgets and optimality status.
- **Regression base:** tests include engine, cash-flow, configuration, provenance, strategy parity, worker, report and Pages workflow contracts.
- **Privacy posture:** no third-party analytics or session-replay instrumentation was identified in the reviewed application code; the UI says drafts remain in the browser.

## Recommended implementation order

1. **SEC-01:** close the imported account-ID DOM injection path and add adversarial import regression tests.
2. **FIN-01:** separate pre-withdrawal aggregate value from closing assets/liabilities/net worth without changing strategy scoring or outflow settlement.
3. **ENG-01/ENG-02:** document and verify payout/date conventions before any financial formula or cash-flow change.
4. **SEARCH-01:** introduce bounded defaults, explicit unlimited controls, cooperative timeout, worker safety timeout, cancellation, and benchmark validation.
5. **DATA-01:** add per-bank dataset review dates and clear source-quality disclosure.
6. **DEPLOY-01:** make main deployment preserve the public dev preview.
7. **DATA-04:** harden CSV parsing after the full data inventory.
8. **UI-01:** add reduced-motion-aware scrolling.

DATA-02 is an accepted product-scope boundary. DATA-03 and QA-01 remain deferred for owner decisions. Detailed phases, regression cases, and non-regression gates are in [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).

## Release and verification caveats

- The source audit is not formal financial verification, a penetration test, or bank-product certification.
- The Node test workflow passed on the audited source revision, but that does not prove rendered browser behaviour or financial-product correctness.
- No manual browser, screen-reader, or full WCAG assessment was completed as part of the static audit.
- The dev preview is a subtree of the same GitHub Pages site. Production and dev deployments must be serialized and both must preserve the other's published files.
- No application implementation has been applied on this audit branch; it remains a report and planning branch.
