# FD Cal — implementation plan from the engineering audit

**Plan date:** 9 November 2026  
**Re-audited source:** `dev` at squash merge `85f2043c4d06ac4f7bcd65ec5aa18452c98ff38a`  
**Working branch:** `audit/owner-feedback-followups`  
**Ruleset:** [aaron-fredrick/RULESETS](https://github.com/aaron-fredrick/RULESETS) `main` at `79d7dd4f0c0d544ba85abeb19286ef2cae34bf89`  
**Status:** PR #81 was squash-merged to `dev` on 9 November 2026. This follow-up branch records the owner's latest decisions, verified external research, and the remaining implementation/QA work. The owner-feedback research register supersedes older open/deferred labels where it records a later decision.

## 1. Purpose and constraints

This plan turns the source audit and owner feedback into a staged remediation programme. It is deliberately conservative: fix confirmed trust-boundary and presentation defects without casually changing the financial model, strategy objective, search quality, or the visual improvements already shipped.

The work must follow the project's [Coding](https://github.com/aaron-fredrick/RULESETS/tree/main/Coding), [Web](https://github.com/aaron-fredrick/RULESETS/tree/main/Web), and [UI](https://github.com/aaron-fredrick/RULESETS/tree/main/UI) rulesets. In particular:

- Keep domain calculations, strategy planning, authoritative execution, presentation, and deployment concerns separated.
- Preserve existing public configuration and result contracts where practical; add explicit fields or aliases before retiring old names.
- Validate untrusted input at its boundary and encode output for its destination context.
- Test financial invariants and observable behaviour, not implementation details alone.
- Measure performance and output quality against a reproducible baseline before accepting search-budget changes.
- Treat browser rendering, responsive behaviour, keyboard operation, and reduced motion as implementation acceptance criteria, not assumptions.

### Non-regression guardrails

No phase may:

1. Change interest formulas, rounding, day-count treatment, FD eligibility, fee calculation, AIT, payout mechanics, or strategy scoring as a side effect of a UI/report change.
2. weaken or delete existing tests, strategy parity checks, diagnostics, or financial tolerances to make a change pass.
3. silently reinterpret an existing configuration field or result property.
4. replace the existing visual system with new colours, gradients, pill-heavy controls, decorative badges, excessive cards, or a broad redesign.
5. trade away a proven output or material performance improvement without a measured reason and explicit review.

Before implementation, capture deterministic baseline outputs for representative scenarios and record the audited source SHA. For engine/search changes, compare booking decisions, cash-flow dates and amounts, ending account balances, paid and outstanding outflows, fees, AIT, result metrics, validity, and optimality diagnostics. Run repeated same-runner timing measurements as well as output comparisons.

## 2. Owner feedback and current finding disposition

| Finding | Current status | Evidence / remaining work |
|---|---|---|
| **SEC-01** | **Completed — PR #75** | Imported account IDs are encoded at all three account-card attribute sinks; adversarial regression coverage is present. |
| **FIN-01** | **Completed — PR #75** | Explicit pre-withdrawal and closing-position metrics are exposed in the result model, UI and report; paid/deferred outflow reconciliation is tested. |
| **FIN-02** | **Completed — PR #75** | The metric is labelled “Capital contributed”, not “Capital invested”. |
| **FIN-03 / DATA-01** | **Completed — PR #81 squash-merged to dev** | Product source URL, effective date, source type and notes flow through web/CLI, worker and reports. |
| **ENG-01** | **Partial** | Runtime event ordering is regression-tested. Installment payment dates can still extend beyond nominal maturity; verify contractual terms before changing the schedule model. |
| **ENG-02** | **Partial** | The start-year 365/366 denominator is documented here. Formula remains unchanged; representative bank-term verification and user-facing explanation remain. |
| **ENG-03 / ENG-04** | **Open** | Central product-term invariants and versioned AIT assumptions are not implemented. |
| **SEARCH-01** | **Implemented — PR #75** | Browser defaults are 10,000 expanded states / 30 seconds, with explicit unlimited controls, cooperative time-budget stopping, watchdog, cancellation and diagnostics. Benchmark calibration remains. |
| **SEARCH-02 / SEARCH-03** | **Open / ongoing control** | Large modules remain; existing parity/replay tests are positive controls, but new financial rules need cross-strategy parity fixtures. |
| **DATA-02** | **Closed as owner-confirmed scope** | Senior/minor options are candidate-product filters; FD Cal does not verify depositor age or guardian eligibility. Keep the disclosure. |
| **DATA-03** | **Deferred** | Keep special products with unenforced caps/tax/eligibility constraints out of the active catalogue until the owner defines the supported scope. |
| **DEPLOY-01** | **Completed on `dev` — PR #80** | Independent dev web/docs publishers and dev-side assembly publish a working preview under `/dev/`. Porting the assembler to `main` is deferred until main-branch work begins. |
| **DATA-04** | **Completed — PR #81 squash-merged to dev** | All 33 catalogue CSVs are inventoried; 93 malformed rows were repaired across three files; strict parser and source/line diagnostics are in dev. |
| **UI-01** | **Completed — PR #81 squash-merged to dev** | Shared scroll helper respects the current reduced-motion preference; unit tests cover both branches. |
| **UI-02 / UI-03** | **Completed — PR #81 squash-merged to dev** | Native help disclosure buttons and field-associated validation errors are in dev; rendered assistive-technology QA remains. |
| **PRIV-01** | **Completed — PR #81 squash-merged to dev** | Browser-local retention and confirmation-protected saved-draft deletion are in dev. |
| **WEB-SEC-02** | **Open — GitHub Pages retained by owner decision** | Keep Pages; verify actual production/dev headers and document the response-header limitations. No proxy/CDN migration planned. |
| **QA-01** | **Approved — implementation pending** | Add Playwright browser tests to CI for pushes and PRs targeting dev/main. |
| **QA-REP-01** | **Open** | The downloaded standalone report has not been independently verified in a real browser. |
| **DATA-05 / DATA-06** | **Research/implementation follow-up** | Keep simplified transfer fees; implement 180/365-day freshness warnings using actual source-review dates. Existing review-date fields are blank. |

## 2A. Owner feedback received on 9 November 2026

The following decisions supersede earlier open/deferred owner-decision language in this plan. Full evidence and source links are in [Owner feedback research](OWNER-FEEDBACK-RESEARCH.md).

| Workstream | Owner decision | Implementation status after this update |
|---|---|---|
| ENG-01 | Keep the product payout sequence; filter generated payout events to the simulation window. Never extend the simulation end date or clamp a late installment to maturity. Product maturity must still fit within the simulation window. | Approved; runtime/report regression implementation remains. |
| ENG-02 | Keep the start-year 365/366 elapsed-day denominator. Explain it briefly and retain cross-year/leap-year tests. | Formula unchanged; [short convention note](../finance/INTEREST-DAY-COUNT.md) added. UI/report explanation remains to be wired. |
| ENG-03 | Add central product-term validation; maturity must fit within the simulation period. Keep special product constraints separate until model workflow is designed. | Scope approved; implementation remains. |
| ENG-04 | Keep the current 10% Sri Lankan interest AIT assumption, with a lightweight version identifier, effective date and official source disclosure. Do not build a broad tax-regime engine now. | Version metadata and UI source disclosure added on this branch; tests/CI pending. |
| DATA-03 | Research special FDs, but do not activate or implement them yet. | Research register added; implementation explicitly deferred. |
| DATA-05 | Keep simplified transfer-fee modelling; research and document limitations only. | Research register added; model unchanged. |
| DATA-06 | Use actual source-review date; warn at 180 days and strongly at 365 days. Missing dates remain explicitly unverified. Keep source-effective, source-review and repository-update dates distinct. | Existing `dataset_reviewed_at` field is present but blank in all 29 bank index rows. Freshness UI/data population remains. |
| WEB-SEC-02 | Retain GitHub Pages. | No hosting migration planned; verify deployed headers and document residual limits. |
| SEARCH-01 | Keep 10,000 expanded states / 30 seconds as baseline; compare 5k/10k/20k/uncapped with longer time budgets and measure quality, not runtime alone. | Benchmark matrix documented; controlled execution remains. |
| SEARCH-02 | Prepare a staged module decomposition plan; no broad rewrite. | Decomposition boundaries documented; code refactor deferred until parity baselines. |
| SEARCH-03 | Preserve cross-strategy parity, especially authoritative outflow execution and liquidity reservations. | Ongoing regression requirement; add fixtures with each relevant financial-rule change. |
| QA-01 / QA-REP-01 | Add browser-driven tests to CI for pushes and PRs to `dev` and `main`; cover app, simulation, report, mobile and accessibility. | Approved; Playwright suite/workflow implementation remains. |
| Legal/privacy | General non-sensitive support may use public issues; personal/privacy/security matters use `a.n.r.fredrick@gmail.com`. Use Sri Lanka as proposed governing law, subject to mandatory laws elsewhere. | Contact text and terms updated on this branch; legal status research recorded. Lawyer review still recommended before commercial operation. |

### Current source and scope notes

- The bank-to-dataset index is `data/fd_options/fd_options.csv`; its existing `dataset_reviewed_at` column is currently empty for all 29 indexed banks. Do not backfill it with Git merge timestamps.
- The current root `robots.txt` permits crawlers to fetch pages so they can read the dev preview's `noindex,nofollow` metadata. Preview URLs remain excluded from the production sitemap. Do not add a robots disallow for the preview subtree while relying on crawlers to observe noindex.
- The AIT 10% rate is supported by IRD Circular SEC/2025/E/02 (effective 1 April 2025) and later IRD guidance; it is a calculator assumption, not a universal tax determination for every depositor.

## 3. Detailed workstreams

### Phase 1 — SEC-01: imported account-ID rendering

**Status:** **Completed** Implemented and merged to `dev` in PR #75; adversarial regression coverage is included.  
**Priority:** P1  
**Primary boundary:** JSON import → configuration validation → account model → DOM rendering.

#### Analysis

The import path accepts account IDs as keys in the imported `accounts` object. The shape validator requires a non-empty string but does not constrain it to a narrow identifier alphabet. `applyConfig()` preserves those keys as account IDs. `renderAccounts()` then interpolates the ID directly into several quoted HTML attributes: the account card's `data-id`, the consolidation radio's `value`, and the remove button's `data-remove-account`.

The existing `esc()` helper is used for labels and other values, but not for these account-ID attributes. A malicious scenario file can therefore break out of an attribute when imported and rendered. This is a real untrusted-file-to-DOM boundary; it does not require a remote attacker to control the application origin.

There are also adjacent uses where IDs are inserted into CSS selector strings during error targeting. Fixing only the visible template interpolation would leave fragile selector construction behind.

#### Implementation plan

1. Trace every use of imported account IDs after `applyConfig()`, including HTML templates, attributes, selectors, event delegation, and error targeting.
2. Prefer DOM construction and `setAttribute()`/dataset assignment for the account-card fields that carry IDs. If retaining a template in a narrowly scoped area, apply the existing HTML escaping helper consistently to every attribute value.
3. Remove dynamic selector concatenation where practical. Resolve cards by comparing `dataset.id` to the exact ID, or use a correctly escaped selector only where necessary.
4. Do **not** impose a new restrictive ID regex as the primary fix. Existing exported/imported scenarios may contain IDs that are valid under the current contract. Output encoding must protect rendering without changing identity or breaking references.
5. Inspect the account card's delegated interactions after the rendering change: select consolidation account, remove account, sync balances, and retain schedule references.

#### Regression tests and acceptance

- Import a valid legacy scenario with ordinary IDs and verify round-trip export/import.
- Import adversarial IDs containing quotes, angle brackets, ampersands, apostrophes, whitespace, and Unicode.
- Use a payload such as `"><img src=x onerror=...>` and assert no element or executable handler is created from the ID.
- Assert the ID remains exact in the DOM attribute/property and account lookup; primary selection and removal still work.
- Run all existing configuration, import/export, web, and report tests.
- Review other `innerHTML` templates for account-ID interpolation; do not broaden this into an unrelated UI rewrite.

**Acceptance:** imported IDs remain data, never markup or executable attributes; existing scenario compatibility and account operations remain intact.

### Phase 2 — FIN-01: separate portfolio value from closing position

**Status:** **Completed** Explicit result semantics, UI/report labels and reconciliation tests are merged to `dev` in PR #75.  
**Priority:** P1  
**Primary boundary:** result model → strategy objective contract → UI/report presentation.

#### What the code currently does

The audit's finding is valid, but it is important to distinguish a result-presentation defect from missing outflow execution:

- `SimulationRuntime.processDate()` credits same-date inflows, FD cash flows, and maturities before settling due outflows.
- It then applies due outflows according to `strict`, `defer`, or `best_effort`, commits the resulting balances, and only afterwards does the strategy receive its next planning view and choose an action.
- The shared runtime is the authoritative executor. Greedy, GSS, and Absolute R+ should not each implement a second outflow settlement mechanism.
- The scoped search state already carries balances, future flows, outstanding obligations, and paid outflows. Its terminal evaluation includes paid amounts and subtracts outstanding liabilities. This is part of the current strategy objective and must not be casually changed.
- `SimResult.final_value` is calculated from contributed capital plus gross interest less transfer fees and AIT. It does not subtract paid outflows. The UI and HTML report currently describe it as an ending/final portfolio value.
- `cash_retained` is the sum of ending account balances. `cash_flow_net_worth` subtracts outstanding outflows from those balances. These are much closer to the closing-position concepts the UI needs.

The important design boundary is therefore: **outflow scheduling and settlement remain in the runtime; search strategies reason about the runtime's projected state; result metrics describe the resulting position.** Do not move settlement into strategy implementations or alter the search objective merely to correct a label.

#### Proposed result vocabulary

Introduce explicit names while retaining old properties until every consumer has been audited:

| Proposed name | Meaning | Existing source/compatibility |
|---|---|---|
| `contributed_capital` | Opening account capital plus scheduled inflows | Alias of `total_principal` |
| `pre_withdrawal_value` | Contributed capital plus gross interest, less fees and AIT; does not deduct paid outflows | Alias of existing `final_value` |
| `total_outflows_paid` | Amount actually paid by the simulation | Existing property |
| `closing_assets` | Sum of account balances at the simulation boundary after finalization | Alias/explicit name for `cash_retained`; verify all scoped bookings have settled cash flows by the horizon |
| `outstanding_liabilities` | Remaining unpaid outflow obligations | Sum of `outstanding_outflows[].remaining` |
| `closing_net_worth` | Closing assets less outstanding liabilities | Alias of existing `cash_flow_net_worth` |

Do not redefine `final_value` in place. It is used outside the display layer, including strategy comparison paths; changing it could silently alter optimisation results or downstream consumers. First inventory all uses, including CLI output, reports, XIRR/cash-flow calculations, strategy scoring, tests, and any exported result contracts.

#### Implementation plan

1. Map all consumers of `final_value`, `final_value_after_ait`, `total_principal`, `cash_retained`, `cash_flow_net_worth`, `total_outflows_paid`, and `outstanding_outflows`.
2. Confirm and document the current strategy objective: the optimiser evaluates the pre-withdrawal aggregate position and outstanding obligations; it does not simply maximise the amount of cash left after users have spent money. Preserve this objective unless a separate owner decision changes the optimisation goal.
3. Add explicit semantic getters/serialized fields in the result layer. Keep existing names as compatibility aliases; avoid duplicated mutable state.
4. Update the web results and standalone HTML report to distinguish pre-withdrawal value from closing assets and closing net worth. Show paid and outstanding outflows as reconciliation details, without turning the results area into a dense set of competing cards.
5. Update CLI/report labels and documentation consistently. Ensure the report does not call the pre-withdrawal metric the closing portfolio value.
6. Verify finalization effects: final consolidation fees are included in the closing balance and fee totals; metric getters must reflect the finalized result, not a stale pre-finalization snapshot.

#### Financial regression matrix

- **Simple withdrawal:** LKR 100,000 opening capital, no interest/fees, LKR 40,000 paid outflow → pre-withdrawal value LKR 100,000; closing assets/net worth LKR 60,000.
- **Deferred obligation:** LKR 100,000 opening capital, LKR 120,000 deferred outflow → closing assets LKR 100,000; outstanding liability LKR 120,000; closing net worth LKR -20,000.
- **Best effort:** LKR 100,000 available, LKR 120,000 best-effort outflow → LKR 100,000 paid, LKR 20,000 outstanding, closing assets LKR 0, closing net worth LKR -20,000.
- **Same-day ordering:** same-day inflow is credited before outflow settlement; outflow is settled before the strategy decision. Verify all three steps in the event ledger.
- **Interest/fees/AIT:** include a matured FD, transfer fee, AIT, and a paid outflow; reconcile every displayed metric to the ledger and ending accounts.
- **Strategy parity:** run equivalent deterministic scenarios through Greedy, GSS, and Absolute R+; ensure the result vocabulary is consistent and the existing strategy objective/booking decisions do not change merely because labels were corrected.
- **Compatibility:** verify old result properties, CLI consumers, report generation, worker rehydration, and XIRR inputs remain stable.

**Acceptance:** users can distinguish what the plan generated before withdrawals from what remains at the end; the strategy engine's outflow behaviour and objective are unchanged unless separately approved.

### Phase 3 — ENG-01 and ENG-02: clarify financial timing conventions

**Status:** **Partial** Event-order regression coverage and the start-year denominator explanation are present; installment contract validation and bank-term verification remain. No financial formula or payout date was changed.  
**Priority:** P2  
**Primary boundary:** FD product terms → cash-flow model → date/interest calculation.

#### ENG-01 — payout dates and event ordering

Owner-confirmed event ordering is:

1. Credit all same-date inflows, FD cash flows, and maturities.
2. Add and settle all due outflows according to their payment policies.
3. Present the post-settlement balances and obligations to the strategy.
4. Execute the strategy decision for that date.

This is already the order in the authoritative runtime. Preserve it and add an explicit regression test; do not move outflow handling into strategies.

This ordering does **not**, by itself, settle the separate product-term question in the audit: an `INSTALLMENT` product with a five-month tenor and two-month payout interval currently generates dates at months 2, 4, and 6. Do not blindly clamp the last payment to month 5. First establish what the catalogue's tenor and payout interval mean for the actual bank product:
- If the contractual final installment is due at maturity, the generated final cash flow should be aligned to maturity.
- If the contract genuinely pays the final installment after the stated tenor, model the final settlement date explicitly and ensure eligibility/horizon checks use the last contractual cash-flow date rather than assuming maturity and final receipt are identical.

Audit representative source terms and catalogue rows before choosing either model. Add 5m/2m, 5m/6m, exact-divisor, and payout-after-horizon fixtures. Assert that all cash-flow dates are within the contractually modelled availability horizon. Do not change cumulative or periodic-interest schedules as part of this fix.

#### ENG-02 — elapsed-day interest basis

The current implementation calculates interest using the actual elapsed day count, divided by a 365/366 base selected from the accrual start date's calendar year when the leap-year option is enabled. It does not split a multi-year interval into separate calendar-year segments.

Owner feedback indicates that the intended approach is a relative elapsed-day delta, consistent with the convention the project intends to model. Keep the formula unchanged during this plan. Document it precisely in the UI/report and verify it against representative published bank product terms. Do not silently switch to calendar-segment Actual/Actual or another basis. If source evidence later requires a different convention, treat that as a separately reviewed financial-model change with before/after expected-value fixtures.

### Phase 4 — SEARCH-01: bounded browser search with explicit unlimited mode

**Status:** **Implemented** Browser defaults, cooperative stopping, watchdog, cancellation and regression tests are merged to `dev` in PR #75. Benchmark calibration remains a follow-up gate.  
**Priority:** P2  
**Primary boundary:** configuration → search loop → worker lifecycle → UI diagnostics.

#### Current state

Absolute R+ currently defaults `max_decisions` to `null`; the browser leaves the decision-cap input blank. The worker runner has a 10-second start-handshake timeout, but clears it after the worker acknowledges `started`. There is no post-start deadline. The runner already has a `cancel()` method, but the UI does not expose a cancellation control.

#### Proposed behaviour

- Add a finite default expanded-state budget and a finite default elapsed-time budget for browser Absolute R+ runs.
- Initial candidate defaults for benchmarking: **10,000 expanded states** and **30 seconds**. These are starting values, not final constants; calibrate them against representative small, typical, and worst-case scenarios before locking them.
- Let users choose an explicit unlimited decision budget. Preserve `null` as the configuration representation for unlimited expanded states.
- Let users set the time limit to **0 for unlimited**. A missing time-limit field in an older configuration should receive the safe default; explicit zero should remain unlimited.
- Make the distinction visible in the UI. Label the count accurately as expanded states/decisions, not a generic number of alternatives.
- When the decision or cooperative time budget is reached, return the best feasible incumbent available, mark `optimality_proven: false`, and report the exact stopping reason, configured budget, expanded-state count, and elapsed time.
- Add a hard worker watchdog as a last-resort safety net, slightly beyond the cooperative search deadline. It should terminate a worker that becomes unresponsive, not be the normal way the search budget is enforced.
- Expose the existing cancellation capability while a run is active. Cancellation, timeout, and budget-completed-with-incumbent must have distinct status/error handling.
- If both the decision budget is unlimited and timeout is zero, allow the user to request an unbounded run explicitly. The UI should make the resource implication clear.

#### Architecture and performance safeguards

1. Extend the validated strategy-settings contract deliberately; reject negative, fractional, NaN, and unsupported values.
2. Keep the search deadline in the search loop, checking at bounded checkpoints and around expensive expansions. Use a monotonic clock and an injectable clock in tests.
3. Reuse the existing budget-stop/optimality diagnostics where possible; add a reason field rather than creating a parallel result contract.
4. Keep worker termination and timer cleanup in `SimulationWorkerRunner`; do not put browser timer APIs into core financial logic.
5. Ensure a timed-out or cancelled worker cannot publish a stale result, and that the next submission works normally.
6. Benchmark 5k/10k/20k/uncapped expansion limits and 15s/30s/60s time budgets on the same runner. Compare actual financial outputs and feasibility, not only elapsed time. Record whether the incumbent matches the uncapped result on scenarios that can complete uncapped in a reasonable time.
7. Retain cache limits, beam width, pruning rules, and current strategy parity tests unless measurements justify a separate change.

**Acceptance:** ordinary browser runs terminate within a predictable budget; budget-limited results are never presented as proven optimal; users can explicitly opt into unlimited execution; cancellation and subsequent reuse remain reliable.

### Phase 5 — DATA-01: catalogue freshness and source disclosure

**Status:** **Implemented on this branch; CI passed.** Bank-level review dates/status remain visible; product URL, effective date, source type and notes are propagated through web and CLI loaders, worker booking snapshots, and both report formats. Pending shipment to `dev`.  
**Priority:** P2  
**Primary boundary:** bank/product index → bank selector → result/report disclosure.

#### Data contract

Add a per-bank ISO date field to the bank/product index, for example `dataset_updated_at`. It must represent the last date that bank's dataset was reviewed or materially updated in this repository. Maintain it per bank; do not derive it from the latest repository-wide commit, which may have changed an unrelated bank.

Keep this separate from product-level `source_effective_date`:
- **Dataset last reviewed:** when FD Cal last checked/updated the bank's catalogue data.
- **Source effective date:** when the bank says the rate schedule itself takes effect.
- **Source type/status:** official/direct, secondary, or no sufficiently verified public rate data.

Do not invent dates for old rows. Backfill only when Git history or research notes establish a defensible date; otherwise show “Review date not recorded” until the bank is rechecked.

#### UI/report plan

1. Add a concise catalogue disclaimer near bank selection: rates and terms are research data, may be stale or secondary, and must be confirmed with the bank before acting.
2. For each account's selected bank, show its research/source status and “Dataset last reviewed” date. Keep the detail close to the bank selector; avoid turning every dropdown option into a long paragraph.
3. Where available, show source effective date separately. Do not imply that the dataset review date is the bank's effective date.
4. Distinguish populated-direct from populated-secondary entries. Keep banks with no verified rate data disabled as they are now; do not make unverified rows investable just to improve selection coverage.
5. Include the catalogue disclaimer and relevant source metadata in the standalone report so a saved report retains the data-quality context used for the simulation.
6. Keep metadata out of financial calculation inputs unless a specific calculation requires it.

#### Acceptance and tests

- Validate date format and missing-date handling in the catalogue loader.
- Verify every bank selection displays the correct bank-specific metadata, including a secondary-source bank and a no-rate bank.
- Verify long bank names and small screens do not overflow or create excessive visual density.
- Confirm the report contains the same source status/date as the catalogue snapshot used by the simulation.
- Ensure catalogue metadata changes do not alter booking decisions, interest, fees, or strategy fingerprints unless the calculation-relevant product terms changed.

### Phase 6 — DEPLOY-01: publish and preserve the dev preview on the active dev delivery path

**Status:** **Completed on `dev` in PR #80.** Separate dev web and documentation publishers produce `dev_pages-web-artifact` and `dev_pages-docs-artifact`; the dev Pages assembler composes them beneath `site/dev/` and validates the expected preview entry points. The user has confirmed that the merged dev preview works.  
**Priority:** P2  
**Primary boundary:** dev component artifacts → Pages assembly → `/FD-Calculator/dev/`.

The current delivery target is `dev`. Do not block this work on changes to `main`. The dev branch's assembler includes the preview components and shares the Pages deployment concurrency group. Persistent preview artifact/state branches use the `dev_` prefix. The root `robots.txt` allows crawlers to fetch preview pages so search engines can observe the generated `noindex,nofollow` directives; preview URLs are excluded from sitemap output.

**Completed acceptance evidence:**
1. Dev web and docs publishing are independent, so a web-only change does not wait for benchmark/documentation generation.
2. The dev assembler extracts the independently published dev components into `site/dev/` and checks for `index.html`, `web/index.html` and `docs/index.html`.
3. Dev output is built with `FD_CAL_PREVIEW=true`, path-prefixed URLs and a visible preview banner.
4. Dev HTML receives `noindex,nofollow`; the root `robots.txt` does not block crawling, allowing search engines to process the noindex directive. Preview URLs are omitted from sitemap output.
5. The user confirmed the merged dev preview is functioning.

**Deferred, not a current blocker:** when work moves to `main`, port the preview-aware assembler and verify that a normal production deployment preserves the latest dev subtree. Do not make or audit that main-branch change in this phase.

**Acceptance for current scope:** the active `dev` pipeline can independently publish web/docs components and compose a working preview under `/dev/` without modifying production component artifacts.

### Phase 7 — DATA-04: strict CSV structural validation

**Status:** **Implemented on this branch; CI passed.** Pending shipment to `dev`.  
**Priority:** P3  
**Primary boundary:** CSV text → parsed row objects → catalogue loaders.

The previous parser silently filled missing columns and ignored surplus fields. The strict parser now uses explicit field/quoted/after-quote states, rejects malformed quote placement and mismatched row widths, and reports the source and physical line number. The inventory identified 93 rows with unquoted comma-containing metadata in three files; those values were repaired and correctly quoted before strict validation was enabled.

#### Implementation plan

1. Inventory all 33 checked-in CSV files, including headers, row counts, empty files and row-width anomalies.
2. Repair the 93 affected rows in `banks.csv`, Commercial Bank's product file and DFCC's product file by quoting comma-containing metadata without changing its meaning.
3. Implement strict field/quoted/after-quote parser states; reject malformed quote placement, unterminated fields, unexpected post-quote characters and row-width mismatches.
4. Preserve UTF-8 BOM, LF/CRLF, quoted commas, escaped quotes, multiline fields, trailing empty cells and the existing blank-line policy.
5. Pass source path from the web catalogue loader so errors identify the file and physical line.
6. Add parser fixtures and an inventory regression test that parses every CSV under `data/`, plus assertions that fee-source URLs and product notes remain in their intended fields.
7. Run the complete Node suite, syntax checks, web build and documentation-preservation build.

**Acceptance:** met on this branch. Malformed rows fail with actionable source/line errors; all 33 current production CSVs parse under the strict grammar without field shifts or data loss. CI passed; pending dev shipment.

### Phase 8 — UI-01: reduced-motion-aware programmatic scrolling

**Status:** **Implemented on this branch; CI passed.** Pending shipment to `dev`.  
**Priority:** P3  
**Primary boundary:** validation/result feedback → browser scrolling behaviour.

Validation errors, general error feedback and result navigation now use `scrollElementIntoView()` from `src/web/motion.js`. The helper evaluates `prefers-reduced-motion` when each scroll is requested, rather than caching the preference at page load.

W3C documents a JavaScript technique for evaluating `prefers-reduced-motion` (SCR40), and MDN documents the media feature and `scrollIntoView()` behaviour. The helper selects `behavior: "auto"` for reduced-motion users; the existing global reduced-motion CSS rule also forces computed `scroll-behavior: auto`, preventing CSS from reintroducing smooth animation. Normal-motion users retain the original smooth scrolling. [W3C SCR40](https://www.w3.org/WAI/WCAG22/Techniques/client-side-script/SCR40) · [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion) · [MDN scrollIntoView](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView).

#### Implementation plan

1. Added `scrollElementIntoView()` as the shared programmatic scroll helper.
2. The helper evaluates `matchMedia("(prefers-reduced-motion: reduce)")` at request time so preference changes during the session are respected.
3. Normal mode preserves smooth scrolling and the original alignment (`center` for errors, `start` for results).
4. Reduced mode selects `behavior: "auto"`; the existing reduced-motion CSS rule forces the document scroll behaviour to be non-animated.
5. Existing focus behaviour remains independent: invalid controls still receive focus with `preventScroll` before the explicit scroll.
6. Unit tests verify both preference branches and assert that the app no longer calls smooth `scrollIntoView` directly.

This is a targeted accessibility correction, not a motion redesign. Keep existing entrance/exit transitions and motion timing rules intact; only remove the non-essential scroll animation when requested.

### Deferred owner decisions

#### DATA-03 — special-product constraints

The audit notes that the research register includes product maximum amounts and tax-exempt flags that the active FD model does not currently enforce. This matters only if such products are to be activated in the simulation catalogue. No implementation is planned until the owner specifies which constraints are required and which products should be supported. Until then, keep products with unenforced simulation-critical constraints out of the active catalogue.

#### QA-01 — browser automation

The audit did not find Playwright, Cypress, or WebDriver-based browser E2E coverage. Existing Node tests exercise engine, worker contracts, report output, and workflow contracts, but they do not launch a real browser to test the rendered application. This is a test-infrastructure decision, not evidence that existing unit tests are inadequate. Ask the owner whether to add a small Playwright smoke suite or continue with manual browser verification for now.

## 4. Visual and interaction guardrails

All UI work in this plan must preserve the visual-restraint improvements already merged through the recent UI work:

- Reuse existing brand and semantic colour tokens. Do not introduce a new palette or use colour alone to communicate source confidence, errors, or budget status.
- Use existing success, warning, error, and neutral treatments only where their meaning is appropriate.
- Keep typography, spacing, and hierarchy restrained. Avoid decorative eyebrow labels, redundant numbering, gradients, excessive dividers, heavy card nesting, and pill-shaped metadata.
- Use badges only for meaningful status, not as decoration. Prefer concise text for bank provenance and search-budget explanations.
- Keep explanations short but preserve financial caveats and eligibility disclosures.
- Preserve current mobile control sizing, focus-visible styling, keyboard operation, and responsive breakpoints.
- Keep motion purposeful and interruptible. Preserve existing transitions for users who have not requested reduced motion; do not animate the reduced-motion path.
- Do not add a new visual component if a small inline status/detail beside the existing control communicates the same information.

Relevant guidance: [Visual Design and Restraint](https://github.com/aaron-fredrick/RULESETS/blob/main/UI/visual-design.md), [Motion and Interaction](https://github.com/aaron-fredrick/RULESETS/blob/main/UI/motion.md), and [UI Quality Assurance](https://github.com/aaron-fredrick/RULESETS/blob/main/UI/quality-assurance.md).

## 5. Delivery order and branch strategy

The earlier audit implementation was delivered on this same branch and merged to `dev` through PR #75; the dev preview workflow changes were then merged through PR #80. The owner has directed that follow-up work remain on this working branch until it is ready to ship to `dev`. Keep changes focused, preserve the current `dev` baseline and its tests, and defer `main` integration until explicitly in scope.

Recommended implementation sequence:

1. **DATA-01 / FIN-03** — implemented on this branch; pending dev shipment.
3. **ENG-01 / ENG-02** — verify payout and elapsed-day conventions against representative bank terms; change financial behaviour only with explicit evidence and fixtures.
4. **DATA-04** — implemented on this branch; all 33 CSVs pass strict parsing and regression tests, pending dev shipment.
5. **UI-01 / UI-02 / UI-03** — implemented on this branch with regression coverage; pending dev shipment and browser/assistive-technology verification.
6. **WEB-SEC-02** — verify actual HTTP response headers on production and dev; choose a CDN/proxy or hosting migration only if required policy cannot be met on GitHub Pages.
7. **QA-01 / QA-REP-01** — decide on browser automation and verify app/report behaviour in a real browser.
8. **Main integration (later)** — port the preview-aware assembler to `main` only when main-branch work begins; it is outside the current dev delivery scope.
9. **Secondary follow-ups** — product-term validation, versioned AIT, transfer-channel/freshness policy, and search-module cohesion/parity.

Implement each remediation as a focused, independently testable change on this working branch. Do not merge or deploy until the owner requests it. Keep `main` integration out of scope for this pass.

## 6. Cross-phase acceptance gates

Before any implementation PR is considered complete:

- [ ] Existing Node test suite passes without weakening assertions.
- [ ] New regression tests cover the reported defect and adjacent edge cases.
- [ ] Deterministic financial outputs are compared against the pre-change baseline.
- [ ] Greedy/GSS/Absolute R+ parity and validity diagnostics remain explainable.
- [ ] Search runtime is measured on the same runner with repeated runs; output quality is checked alongside elapsed time.
- [ ] No new console errors, failed requests, or worker lifecycle leaks are introduced.
- [ ] UI is inspected at narrow mobile, tablet, and desktop viewports.
- [ ] Keyboard focus, error announcements, and reduced-motion behaviour are verified for affected flows.
- [ ] Standalone HTML reports are opened and checked independently of the app.
- [ ] The active `dev` Pages tree is verified under `/dev/`; keep `main` integration as a later, separately verified task.
- [ ] The production docs build merges canonical root and `/web/` URLs into the docs sitemap; preview builds omit sitemap output and all dev HTML carries `noindex,nofollow`.
- [ ] Any unverified browser, screen-reader, financial-source, or bank-contract assumption is explicitly recorded.

## 7. References

### Project rulesets
- [Coding Practices](https://github.com/aaron-fredrick/RULESETS/tree/main/Coding)
- [Web Engineering Practices](https://github.com/aaron-fredrick/RULESETS/tree/main/Web)
- [UI Guidelines](https://github.com/aaron-fredrick/RULESETS/tree/main/UI)

### External accessibility references
- [W3C — SCR40: using `prefers-reduced-motion` in JavaScript](https://www.w3.org/WAI/WCAG22/Techniques/client-side-script/SCR40)
- [W3C — Understanding Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions)
- [MDN — `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)
- [MDN — `Element.scrollIntoView()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView)
