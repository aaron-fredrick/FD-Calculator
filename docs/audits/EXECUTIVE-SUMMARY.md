# Executive summary

**Re-audited source:** `dev` at `caccaf26b4415ae783959e888ff45e33becdadf6`  
**Ruleset:** [RULESETS](https://github.com/aaron-fredrick/RULESETS) `main` at `79d7dd4f0c0d544ba85abeb19286ef2cae34bf89`  
**Review type:** Static engineering re-audit after PRs [#75](https://github.com/aaron-fredrick/FD-Calculator/pull/75) and [#80](https://github.com/aaron-fredrick/FD-Calculator/pull/80). Status and remaining work are recorded in the [implementation plan](IMPLEMENTATION-PLAN.md).

## Overall assessment

FD Cal has a solid foundation: the browser and CLI share the JavaScript engine; the browser calculation runs in a dedicated worker; the configuration shape is explicitly validated; reporting escapes most dynamic text; the standalone report is self-contained; search diagnostics expose pruning and optimality status; and the test suite includes financial, strategy-parity, worker-contract, reporting and workflow-contract coverage.

The remediation pass has closed the two highest-risk defects: imported account IDs are now encoded at the DOM boundary, and result output distinguishes pre-withdrawal value from closing assets/liabilities/net worth. Absolute R+ now has finite browser defaults, cooperative time limits, cancellation and a worker watchdog. Bank source status/review dates are visible. The dev web/docs publishers are now independent.

The remaining material gaps are installment-product contract semantics, static-hosting security-header policy, and browser-level QA. Crawler controls are in place: the production sitemap includes the canonical root and `/web/` URLs, while preview output is excluded and marked noindex. The `dev` deployment pipeline now composes the preview under `/dev/`; porting that preservation behaviour to `main` is deliberately outside this pass and will be revisited when work moves to `main`. The project is still not financially certified or fully accessibility-verified.

## Priority findings

| ID | Severity | Finding | Current status | Main location |
|---|---|---|---|---|
| SEC-01 | **P1** | Imported account IDs reached HTML attributes without encoding | **Completed** — PR #75 | [app.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js) |
| FIN-01 | **P1** | Pre-withdrawal value was presented as closing portfolio value | **Completed** — PR #75 | [results.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/results.js) |
| FIN-02 | **P2** | Capital contributed was described as capital invested | **Completed** — PR #75 | [app.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js) |
| FIN-03 | **P2** | Product-level source provenance in reports | **Implemented on this branch; CI passed, pending dev shipment** | [html.js](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/rulesets-codebase-review/src/reporting/html.js) |
| ENG-01 | **P2** | Installment payments may extend beyond nominal maturity | **Partial** — event order tested; product contract open | [models.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/models.js) |
| ENG-02 | **P2** | Elapsed-day interest uses the start-year 365/366 denominator | **Partial** — convention documented; source verification open | [interest.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/interest.js) |
| ENG-03 | **P2** | Financial product invariants are distributed across model/load boundaries | **Open** | [models.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/models.js) |
| ENG-04 | **P2** | AIT is a fixed 10% engine assumption | **Open** | [configuration.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/configuration.js) |
| ENG-05 | **P1/P2** | Result value semantics were ambiguous around outflows | **Completed** — covered by FIN-01 | [results.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/results.js) |
| SEARCH-01 | **P2** | Browser Absolute R+ lacked finite default budgets and a post-start timeout | **Implemented** — benchmark calibration pending | [search-strategy-base.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/strategies/search-strategy-base.js) |
| SEARCH-02 | **P3** | Large strategy modules concentrate independent responsibilities | **Open** | [search-strategy-base.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/strategies/search-strategy-base.js) |
| SEARCH-03 | **P2/P3** | Independent planner logic needs continued runtime/parity protection | **Open / ongoing control** | [gss.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/strategies/gss.js) |
| DATA-01 | **P2** | Product-level source URL, effective date and caveat disclosure | **Implemented on this branch; CI passed, pending dev shipment** | [app.js](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/rulesets-codebase-review/src/web/app.js) |
| DATA-02 | **Scope boundary** | Senior/minor toggles do not verify depositor eligibility | **Closed as owner-confirmed scope** | [configuration.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/configuration.js) |
| DATA-03 | **Deferred** | Active FD model does not represent all special-product constraints | **Deferred** | [models.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/models.js) |
| DATA-04 | **P3** | CSV parser did not enforce exact row field counts or strict quote placement | **Implemented on this branch; CI passed, pending dev shipment** | [csv.js](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/rulesets-codebase-review/src/io/csv.js) |
| DATA-05 | **P2/P3** | Transfer fees are not a full transfer-channel model | **Open / documented limitation** | [banks.csv](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/data/banks/banks.csv) |
| DATA-06 | **P2** | Rate freshness and secondary-source warning policy is incomplete | **Partial** | [fd_options.csv](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/data/fd_options/fd_options.csv) |
| DEPLOY-01 | **P2** | Dev Pages assembly must retain the `/dev/` preview subtree | **Completed on `dev`** — independent dev publishers and assembler are present; `main` port deferred | [pages.yml](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/.github/workflows/pages.yml) |

| UI-01 | **P3** | Programmatic scrolling must respect reduced-motion preference | **Implemented on this branch; CI passed, pending dev shipment** | [motion.js](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/rulesets-codebase-review/src/web/motion.js) |
| UI-02 | **P3** | Help tooltip needs programmatic content and touch operation | **Implemented on this branch; CI passed, pending dev shipment** | [app.js](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/rulesets-codebase-review/src/web/app.js) |
| UI-03 | **P3** | Inline validation errors need programmatic field association | **Implemented on this branch; CI passed, pending dev shipment** | [app.js](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/rulesets-codebase-review/src/web/app.js) |
| PRIV-01 | **P2/P3** | Local drafts need a user-facing deletion/retention control | **Implemented on this branch; CI passed, pending dev shipment** | [app.js](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/rulesets-codebase-review/src/web/app.js) |
| WEB-SEC-02 | **P2/P3** | Static hosting has no verified response-header strategy | **Open / hosting constraint** | [SECURITY.md](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/SECURITY.md) |
| QA-01 | **Deferred** | No automated real-browser end-to-end suite | **Deferred** | [tests/](https://github.com/aaron-fredrick/FD-Calculator/tree/dev/tests) |
| QA-REP-01 | **P3** | Downloaded standalone HTML has not been independently browser-tested | **Open** | [html.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/reporting/html.js) |

## Owner feedback and decisions

| Finding | Decision / interpretation | Planned treatment |
|---|---|---|
| **SEC-01** | Confirmed valid finding | **Completed in PR #75.** IDs are HTML-attribute encoded without restricting their accepted identity; adversarial regression coverage added. |
| **FIN-01** | Confirmed overlooked result-presentation issue | **Completed in PR #75.** Explicit pre-withdrawal, closing-assets, outstanding-liability and closing-net-worth metrics are exposed; runtime settlement and strategy objective remain unchanged. |
| **ENG-01** | Event order is intentional: cash inflows/FD cash flows first, outflows second, decision third | Preserve and test this order. It does not alone determine whether a final installment after nominal maturity matches a bank contract. Do not clamp dates until representative product terms establish the correct model. |
| **ENG-02** | Project intends an actual elapsed-day/relative-delta basis | Keep the current formula for now; document the exact start-year 365/366 denominator and verify against representative bank terms before changing financial calculations. |
| **SEARCH-01** | Finite defaults are required, but users may opt into unlimited work | **Implemented in PR #75.** Browser defaults are 10,000 expanded states and 30 seconds; explicit unlimited controls, cooperative stopping, cancellation, watchdog and diagnostics are present. Benchmark calibration remains. |
| **DATA-01** | Implemented on this branch | Bank-level review/status disclosure remains; product source URL, effective date, source type and caveat now flow through web/CLI loaders and worker results into HTML and console reports. Missing effective dates are explicitly shown as not recorded. |
| **DATA-02** | Eligibility verification is the user's responsibility; FD Cal is not a bank onboarding/security gate | Treat senior/minor toggles as inclusion filters. Retain a clear disclaimer; do not add age/guardian verification as part of this work. |
| **DATA-03** | Scope not yet clear | Defer until the owner specifies which special-product constraints should be modelled. Keep products with unenforced critical terms out of the active catalogue. |
| **DEPLOY-01** | Dev preview is intentionally public for users and contributors | **Completed for the current `dev` delivery path in PR #80.** Separate dev web/docs artifacts are assembled under `/dev/`; preview HTML is noindex and the root crawler policy disallows the subtree. Porting the assembler to `main` is deferred until main-branch work begins. |

| **DATA-04** | Implemented on this branch | Inventoried all 33 catalogue CSVs, repaired 93 rows with unquoted comma-containing metadata across three files, and added strict row-width/quote validation with source and line diagnostics. CI verifies the full inventory. |
| **UI-01** | Implemented on this branch | A shared scroll helper checks `prefers-reduced-motion` at each request; reduced-motion users receive `behavior: auto`, while normal users retain smooth scrolling. Unit coverage verifies both branches. |
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

1. **DATA-01 / FIN-03:** implemented on this branch with worker, HTML report and CLI report coverage; pending dev shipment.
2. **ENG-01/ENG-02:** validate installment and elapsed-day conventions against representative bank terms before changing financial calculations.
3. **DATA-04:** inventory current CSVs, then enforce exact row widths and strict quote handling.
4. Preserve crawler controls: keep `/dev/` excluded by the root robots policy, keep preview HTML noindex, and ensure the production sitemap contains canonical production routes only.
5. **UI-01/02/03:** implemented on the working branch with contract/unit coverage; pending dev shipment and browser/assistive-technology verification.
6. **WEB-SEC-02:** document the static-hosting security-header boundary and any required hosting change. PRIV-01 is implemented on this branch.
7. **QA-01 / QA-REP-01:** decide on browser automation and verify the app/report in a real browser.
8. **Main integration (later):** when work moves to `main`, port and verify the preview-aware assembler there; this is not a current `dev` blocker.

DATA-02 is an accepted product-scope boundary. DATA-03 and QA-01 remain deferred for owner decisions. Detailed phases, regression cases, and non-regression gates are in [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).

## Release and verification caveats

- The source audit is not formal financial verification, a penetration test, or bank-product certification.
- The Node.js test/syntax workflow and independent dev web build passed on the exact audited `dev` commit; the dev docs/benchmark workflow was still running when checked. These checks do not prove rendered browser behaviour, screen-reader output, or financial-product correctness.
- No manual browser, screen-reader, or full WCAG assessment was completed as part of the static audit.
- The dev preview is a subtree of the same GitHub Pages site. Production and dev deployments must be serialized and both must preserve the other's published files.
- PR #75 contains the security, result, search-budget and catalogue-disclosure implementation now merged to `dev`; PR #80 contains the dev publishing split now merged to `dev`.
- This re-audit commit updates documentation only. No new application behaviour is changed here.
