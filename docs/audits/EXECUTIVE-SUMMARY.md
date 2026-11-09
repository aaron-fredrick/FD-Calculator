# Executive summary

**Re-audit date:** 9 November 2026  
**Base:** `dev` at PR #81 squash merge `85f2043c4d06ac4f7bcd65ec5aa18452c98ff38a`  
**Working branch:** `audit/owner-feedback-followups`  
**Ruleset:** [RULESETS](https://github.com/aaron-fredrick/RULESETS) `main` at `79d7dd4f0c0d544ba85abeb19286ef2cae34bf89`

## Overall assessment

The previously identified high-risk security and result-semantics defects have been merged to `dev`. This follow-up branch adds the owner-approved financial timing rules, central product validation, lightweight AIT metadata, dataset freshness metadata, search-budget calibration, and an initial Playwright browser suite.

**Latest verified CI result: green.** Workflow [42574353592](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42574353592) completed successfully. Its Node.js test job passed the test suite, syntax checks, production and dev browser builds, all six Chromium browser smoke tests, documentation-preservation build, and workflow YAML parsing. The run also includes the report fixes for semantic ledger headers, narrow-screen overflow, and print table width. This supersedes the earlier failed print-width run [42571366220](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42571366220).

The branch is not ready for final release sign-off. Remaining work is broader cross-strategy financial parity, manual and extended report/accessibility QA, real bank-source reviews, and deployed response-header verification. CI success does not establish those manual or external checks.

## Finding disposition

| ID | Finding | Current status |
|---|---|---|
| SEC-01 | Imported account IDs require HTML attribute encoding | **Completed — PR #75** |
| FIN-01 / ENG-05 | Pre-withdrawal value must be distinct from closing assets/liabilities | **Completed — PR #75** |
| FIN-02 | Capital contributed must not be labelled capital invested | **Completed — PR #75** |
| FIN-03 / DATA-01 | Product-level source provenance in UI, CLI and reports | **Completed — PR #81; manual rendered review remains** |
| ENG-01 | Installment payout events bounded by simulation window | **Implemented on this branch; regression tests pass** |
| ENG-02 | Retain and disclose start-year 365/366 denominator convention | **Implemented on this branch; formula unchanged** |
| ENG-03 | Central FD term validation and maturity horizon | **Implemented on this branch; row-level diagnostics tested** |
| ENG-04 | Lightweight versioned 10% AIT baseline and IRD source disclosure | **Implemented on this branch; contract tests pass** |
| SEARCH-01 | Bounded browser search and explicit unlimited mode | **Implemented and calibrated; no optimality proof** |
| SEARCH-02 | Strategy modules concentrate multiple responsibilities | **Deferred; staged decomposition plan only** |
| SEARCH-03 | Independent planners require authoritative runtime/parity protection | **Partial; strict/deferred outflow parity across four strategies; broader cases remain** |
| DATA-02 | Senior/minor selection is not eligibility verification | **Closed as owner-confirmed scope boundary** |
| DATA-03 | Special-product caps/eligibility/tax constraints | **Deferred; special products remain research-only** |
| DATA-04 | Strict CSV structural validation | **Completed — PR #81 merged to dev** |
| DATA-05 | Simplified transfer-fee model is not a full channel model | **Documented limitation; simplified model retained by owner decision** |
| DATA-06 | Bank dataset freshness and metadata | **Metadata contract implemented; bank-by-bank source review pending** |
| DEPLOY-01 | Dev preview assembly under `/dev/` | **Completed on dev — PR #80** |
| UI-01/02/03 | Reduced-motion scrolling, operable help disclosures, field-associated errors | **Completed — PR #81; manual assistive-technology QA remains** |
| PRIV-01/02 | Draft retention controls and public privacy/legal disclosures | **Completed on dev — PR #81** |
| WEB-SEC-02 | Static hosting response-header strategy | **Open verification; GitHub Pages retained by owner decision** |
| QA-01 | Playwright browser smoke coverage in CI | **Implemented; workflow 42574353592 passed** |
| QA-REP-01 | Independent standalone report, mobile and print QA | **Automated smoke assertions pass; extended and manual QA remain** |

## Owner-approved constraints

- **ENG-01:** Preserve the contractual payout sequence; schedule only generated events within the selected simulation window. Do not extend the run or clamp a late installment to maturity. Product maturity must fit within the simulation horizon.
- **ENG-02:** Retain the existing start-year 365/366 elapsed-day denominator across the full interval. Do not silently switch to calendar-segmented Actual/Actual.
- **ENG-03:** Validate product-term invariants centrally; keep special-product constraints out of the generic model until separately designed.
- **ENG-04:** Retain a lightweight 10% Sri Lankan interest AIT baseline with effective date and official source disclosure. Do not build a broad tax-regime engine.
- **DATA-03:** Special-product modelling remains deferred.
- **DATA-05:** Retain the simplified same-bank/inter-bank fee approximation and label it as an estimate.
- **DATA-06:** Track source review, actual economic-data changes and schema migrations independently. Schema-only migrations must preserve review/update dates.
- **SEARCH-01:** Retain 10,000 expanded states / 30 seconds as browser baseline; users can deliberately request longer/unlimited searches.
- **SEARCH-02:** No broad strategy refactor before parity baselines.
- **WEB-SEC-02:** Keep GitHub Pages; no proxy/CDN or hosting migration in this phase.

Full evidence and source links are in [Owner-feedback research](OWNER-FEEDBACK-RESEARCH.md).

## Remaining work, ordered

1. **SEARCH-03 parity:** Add eligible FD booking, maturity/installment payout, transfer-fee, and future-outflow reserved-liquidity fixtures. Compare booking decisions, event ledgers, obligations, balances, fees, AIT and validity across Greedy, GSS, Absolute R and Absolute R+. Keep the shared runtime authoritative.
2. **QA-REP-01:** Test offline behaviour, chart initialization and realistic large ledgers. Complete manual print/PDF pagination, keyboard, screen-reader, contrast and 200–400% zoom review on representative browsers/devices.
3. **DATA-06 source review:** Recheck all 29 bank entries against official sources where possible. Populate `dataset_reviewed_at` only after an actual source review and `dataset_updated_at` only when an economic product input materially changed. Leave unknown dates blank.
4. **WEB-SEC-02:** Inspect actual production and `/dev/` response headers; document which headers GitHub Pages cannot configure.
5. **Release hygiene:** Keep the follow-up branch isolated from `dev` until the above acceptance gates are addressed or explicitly accepted as residual risks. The branch currently has no open PR.

Keep SEARCH-02 refactoring, DATA-03 activation, richer DATA-05 channel modelling, main-branch preview integration and external legal counsel review deferred unless separately authorised.

## Verification boundary

Workflow success is evidence for the automated checks in that run only. It does not establish screen-reader output, full WCAG conformance, real-device behaviour, actual printed/PDF pagination, live bank rates, legal compliance or deployed HTTP response headers.

The audit is a risk-based source review, not formal verification, financial-product certification, penetration testing, a legal opinion or a full WCAG audit. External bank rates, product eligibility, tax relief, fee schedules and contractual payout terms still require direct verification with the relevant institution or qualified professional.


## Latest follow-up checkpoint — 9 November 2026

Cross-strategy test coverage was extended to exercise FD booking, installment cash flows, terminal maturity and transfer-fee accounting across all four strategies. Workflow [42585867964](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42585867964) passed all automated steps.

SEARCH-03 remains **partial**: scheduled future-outflow liquidity reservation is not closed. An exploratory strict-outflow scenario exposed a Greedy planning gap; no strategy code change for that gap is retained. The next implementation gate is an agreed, tested reservation contract across Greedy, GSS, Absolute R and Absolute R+, preserving existing strategy migration tests. This checkpoint is therefore not a full financial-parity sign-off.
