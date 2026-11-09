# Executive summary

**Re-audit date:** 9 November 2026  
**Base:** `dev` at PR #81 squash merge `85f2043c4d06ac4f7bcd65ec5aa18452c98ff38a`  
**Working branch:** `audit/owner-feedback-followups`  
**Ruleset:** [RULESETS](https://github.com/aaron-fredrick/RULESETS) `main` at `79d7dd4f0c0d544ba85abeb19286ef2cae34bf89`

## Overall assessment

The previously identified high-risk security and result-semantics defects have been remediated and merged to `dev`. The current follow-up branch implements the owner-approved financial timing rules, central product validation, lightweight AIT metadata, freshness classification, search-budget calibration and an initial Playwright smoke suite.

**The current branch is CI-green.** Workflow [42574353592](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42574353592) passed the Node suite, syntax checks, production/dev builds, all six Playwright browser tests, documentation-preservation build and workflow YAML parsing. The report fixes include scoped event-ledger headers, mobile navigation overflow containment and print table width constraints. Manual print/PDF and assistive-technology checks are still outstanding.

The remaining material work is cross-strategy parity for booking/maturity/payout/reserved-liquidity scenarios, full report/accessibility verification, genuine bank-source reviews, and deployed response-header verification. The project is not financially certified, legally reviewed or fully accessibility-verified.

## Finding disposition

| ID | Finding | Current status |
|---|---|---|
| SEC-01 | Imported account IDs require HTML attribute encoding | **Completed — PR #75** |
| FIN-01 / ENG-05 | Pre-withdrawal value must be distinct from closing assets/liabilities | **Completed — PR #75** |
| FIN-02 | Capital contributed must not be labelled capital invested | **Completed — PR #75** |
| FIN-03 / DATA-01 | Product-level source provenance in UI, CLI and reports | **Completed — PR #81; browser/manual review remains** |
| ENG-01 | Installment payout events bounded by simulation window | **Implemented on follow-up branch; regression tests added** |
| ENG-02 | Retain and disclose start-year 365/366 denominator convention | **Implemented on follow-up branch; formula unchanged** |
| ENG-03 | Central FD term validation and maturity horizon | **Implemented on follow-up branch; row-level diagnostics added** |
| ENG-04 | Lightweight versioned 10% AIT baseline and IRD source disclosure | **Implemented on follow-up branch; no tax-regime engine** |
| SEARCH-01 | Bounded browser search and explicit unlimited mode | **Implemented and calibrated; no optimality proof** |
| SEARCH-02 | Strategy modules concentrate multiple responsibilities | **Deferred; staged decomposition plan only** |
| SEARCH-03 | Independent planners require authoritative runtime/parity protection | **Partial; strict/deferred outflow parity across four strategies; broader cases remain** |
| DATA-02 | Senior/minor selection is not eligibility verification | **Closed as owner-confirmed scope boundary** |
| DATA-03 | Special-product caps/eligibility/tax constraints | **Deferred; special products remain research-only** |
| DATA-04 | Strict CSV structural validation | **Completed — PR #81 merged to dev** |
| DATA-05 | Simplified transfer-fee model is not a full channel model | **Documented limitation; owner approved retaining it** |
| DATA-06 | Bank dataset freshness and metadata | **Metadata contract implemented; bank-by-bank source review pending** |
| DEPLOY-01 | Dev preview assembly under `/dev/` | **Completed on dev — PR #80** |
| UI-01/02/03 | Reduced-motion scrolling, operable help disclosures, field-associated errors | **Completed — PR #81; manual assistive-tech QA remains** |
| PRIV-01/02 | Draft retention controls and public privacy/legal disclosures | **Completed on dev — PR #81** |
| WEB-SEC-02 | Static hosting response-header strategy | **Open verification; GitHub Pages retained by owner decision** |
| QA-01 | Playwright browser smoke coverage in CI | **Implemented; full workflow 42574353592 passed** |
| QA-REP-01 | Independent standalone report, mobile and print QA | **Automated smoke assertions passed; offline/chart and manual print/accessibility QA remain** |

## Owner-approved constraints

- **ENG-01:** preserve the contractual payout sequence; schedule only generated events within the selected simulation window. Do not extend the run or clamp a late installment to maturity. Product maturity must fit within the simulation horizon.
- **ENG-02:** retain the existing start-year 365/366 elapsed-day denominator across the full interval. Do not silently switch to calendar-segmented Actual/Actual.
- **ENG-03:** validate product-term invariants centrally; keep special-product constraints out of the generic model until separately designed.
- **ENG-04:** retain a lightweight 10% Sri Lankan interest AIT baseline with effective date and official source disclosure. Do not build a broad tax-regime engine.
- **DATA-03:** special-product modelling remains deferred.
- **DATA-05:** retain the simplified same-bank/inter-bank fee approximation and label it as an estimate.
- **DATA-06:** track source review, actual economic-data changes and schema migrations independently. Schema-only migrations must preserve review/update dates.
- **SEARCH-01:** retain 10,000 expanded states / 30 seconds as browser baseline; users can deliberately request longer/unlimited searches.
- **SEARCH-02:** no broad strategy refactor before parity baselines.
- **WEB-SEC-02:** keep GitHub Pages; no proxy/CDN or hosting migration in this phase.

Full evidence and source links are in [Owner-feedback research](OWNER-FEEDBACK-RESEARCH.md).

## Immediate remaining work

1. Extend report QA beyond the passing smoke suite: verify offline network behaviour, chart initialization, large ledgers and actual print/PDF pagination; complete manual keyboard, screen-reader, contrast and 200–400% zoom review.
2. Expand SEARCH-03 parity to eligible FD bookings, maturity/installment payouts, transfer fees and future-outflow reserved liquidity. Compare ledger, obligations, balances and validity across Greedy, GSS, Absolute R and Absolute R+.
3. Complete report QA: offline network behaviour, chart initialization, realistic large ledgers, print/PDF, keyboard, screen-reader, contrast and 200–400% zoom.
4. Recheck all 29 bank entries against official source material where possible. Populate review/update dates only when evidence supports them; otherwise leave blank.
5. Verify actual production and dev response headers and document the Pages limitations.
6. Keep SEARCH-02 refactoring, DATA-03 activation, richer DATA-05 modelling, main-branch preview integration and external legal counsel review deferred.

## Release and verification caveats

The latest workflow result is not green. The branch should not be merged to `dev` until the browser regression is cleared and the agreed acceptance gates are reviewed. No PR, merge or deployment is part of the current follow-up work.

The audit is a risk-based source review, not formal verification, financial-product certification, penetration testing, a legal opinion or a full WCAG audit. External bank rates, product eligibility, tax relief, fee schedules and contractual payout terms still require direct verification with the relevant institution or qualified professional.
