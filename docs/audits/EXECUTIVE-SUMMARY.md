# Executive summary

**Source:** `dev` at `a455462a959f37db757970d0a3078a4d9a3ef028`  
**Review type:** Static engineering audit against the project [RULESETS](https://github.com/aaron-fredrick/RULESETS).

## Overall assessment

FD Cal has a solid foundation: the browser and CLI share the JavaScript engine; the browser calculation runs in a dedicated worker; the configuration shape is explicitly validated; reporting escapes most dynamic text; the standalone report is self-contained; search diagnostics expose pruning and optimality status; and the test suite includes financial, strategy-parity, worker-contract, reporting and workflow-contract coverage.

The main risks are not a lack of architecture. They are a few important trust-boundary and financial-semantics gaps:

1. Imported account IDs can reach HTML attributes without escaping, creating a DOM-XSS path.
2. The displayed “Final value” is a pre-withdrawal capital-plus-return measure, not the actual closing portfolio value after paid outflows.
3. Installment products can produce a final payment date after FD maturity when the payout interval does not divide the tenor.
4. Product-source quality and effective dates are not exposed in the user-facing product selection/report.
5. The browser's default Absolute R+ run has no default decision cap or post-start execution timeout/cancel control.

The project should not be described as financially validated until the output semantics, irregular payout schedules, day-count convention and product-source transparency are resolved and tested.

## Priority findings

| ID | Severity | Finding | Main location |
|---|---|---|---|
| SEC-01 | **P1** | Unescaped imported account IDs are interpolated into account-card HTML attributes | [app.js L63](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js#L63), [config-schema.js L25-L26](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/config-schema.js#L25-L26) |
| FIN-01 | **P1** | “Final value” ignores paid outflows while the UI/report present it as the ending portfolio value | [results.js L66-L72](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/results.js#L66-L72), [app.js L110-L114](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js#L110-L114) |
| ENG-01 | **P2** | Installment cash-flow generation can place the last payment after maturity | [models.js L101-L109](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/models.js#L101-L109) |
| ENG-02 | **P2** | “Actual leap-year” uses the accrual start year's denominator for the full interval; convention needs definition | [interest.js L3-L18](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/interest.js#L3-L18) |
| SEARCH-01 | **P2** | Scoped Absolute R+ defaults to no decision cap and has no post-handshake worker timeout or user cancel control | [search-strategy-base.js L1342-L1357](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/strategies/search-strategy-base.js#L1342-L1357), [simulation-runner.js L184-L193](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/simulation-runner.js#L184-L193) |
| DATA-01 | **P2** | Catalogue source/effective-date/research metadata is mostly discarded or hidden from users | [app.js L57-L61](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js#L57-L61), [app.js L78](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js#L78) |
| DATA-02 | **P2** | Senior/minor inclusion is a category toggle, not an age/guardian eligibility check | [configuration.js L140-L148](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/configuration.js#L140-L148) |
| DATA-03 | **P2** | AIT is fixed at 10%; product-specific tax treatment/caps are not represented by the active FD model | [configuration.js L207-L213](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/configuration.js#L207-L213), [models.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/models.js) |
| DEPLOY-01 | **P2** | The dev preview shares one GitHub Pages deployment; main must adopt the preview-aware assembler or a later main deploy removes /dev | [pages.yml](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/.github/workflows/pages.yml) |
| DATA-04 | **P3** | CSV parser silently ignores surplus fields and fills missing fields with empty strings | [csv.js L6](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/io/csv.js#L6) |
| UI-01 | **P3** | Validation/result scrolling requests smooth motion without checking reduced-motion preference | [app.js L35](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js#L35), [app.js L51](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js#L51), [app.js L124](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js#L124) |
| QA-01 | **P3** | No automated browser-level or screen-reader regression suite was found in the test inventory | [tests/](https://github.com/aaron-fredrick/FD-Calculator/tree/dev/tests) |

## Positive controls worth preserving

- **Shared engine:** the browser worker and CLI call the same core strategy/simulation implementation.
- **Input validation:** configuration keys, data types, ranges and schedule relationships are checked before simulation.
- **Worker protocol:** the implementation correctly avoids using `event.origin` as an authentication signal for a dedicated Worker and validates the message contract.
- **Report output:** the HTML report escapes user-facing text in tables/ledger/instructions and escapes closing-script sequences in embedded JSON; the template is self-contained rather than loading remote scripts.
- **Strategy transparency:** Absolute R+ exposes expanded states, beam pruning, budgets and whether optimality was proven.
- **Regression base:** the tests include engine, cash-flow, configuration, provenance, strategy parity, worker, report and Pages pipeline contracts.
- **Privacy posture:** no third-party analytics or session-replay instrumentation was identified in the reviewed application code; the UI says drafts remain in the browser.

## Recommended remediation order

### Before wider use
1. Fix SEC-01 by escaping every account ID in HTML contexts and adding a malicious-import regression test.
2. Separate pre-withdrawal value, closing assets and outstanding liabilities; update all labels and reports under FIN-01.
3. Fix ENG-01 and add irregular payout-period tests (for example, 5-month tenor with 2-month installments and payout interval longer than tenor).

### Before trusting special products or long simulations
4. Define the day-count convention and test cross-year/leap-year tenors.
5. Surface catalogue provenance and make stale/secondary/unverified status visible.
6. Decide whether customer age/guardian details are inputs or whether senior/minor toggles are strictly an inclusion filter.
7. Version AIT and any product-specific caps/exemptions rather than embedding a single rate.

### Reliability and quality
8. Add a bounded default search budget, explicit cancellation, and a compute timeout.
9. Add browser E2E, keyboard, reduced-motion and report-download tests.
10. Split the large search/GSS modules only after parity tests protect the existing financial behaviour.

## Release caveat

The dev preview is composed into the same GitHub Pages site as production. It can preserve production files during a dev deployment, but a later deployment using the current **main** version of `pages.yml` will not include the dev subtree until the preview-aware assembler is merged to main. Do not treat the preview as a permanent path until that production workflow change is released.
