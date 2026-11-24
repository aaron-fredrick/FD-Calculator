# Executive summary

**Current source:** `dev` at [`cbdc6b25b9119f6db564281a97adfcc8958d43a0`](https://github.com/aaron-fredrick/FD-Calculator/commit/cbdc6b25b9119f6db564281a97adfcc8958d43a0)  
**Status reviewed:** 25 November 2026  
**Latest verified CI:** [45472055379](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/45472055379) — successful on current `dev` HEAD.  
**Ruleset:** [RULESETS](https://github.com/aaron-fredrick/RULESETS)

## Overall assessment

The owner-feedback implementation work was merged into `dev` through PR #91. The former `audit/owner-feedback-followups` branch is not active. The current development branch contains the JavaScript application, shared financial engine, CLI, browser worker, strict CSV parser, product provenance, privacy controls, dev preview pipeline and Playwright smoke coverage.

The latest recorded CI run on the current `dev` HEAD is successful. That is evidence for the automated checks in that run only; it is not financial certification, complete manual QA or verification of live hosting headers.

## Finding disposition

| ID | Finding | Current status |
|---|---|---|
| SEC-01 | Imported account IDs require HTML attribute encoding | **Completed on dev.** Escaping and regression coverage are present. |
| FIN-01 / ENG-05 | Pre-withdrawal value differs from closing assets/liabilities | **Completed on dev.** Result metrics distinguish these concepts. |
| FIN-02 | Capital contributed must not be labelled capital invested | **Completed on dev.** User-facing metric uses contributed-capital semantics. |
| FIN-03 / DATA-01 | Product-level source provenance | **Implemented on dev via PR #91.** Manual rendered review remains. |
| ENG-01 | Installment payout events bounded by simulation window | **Implemented on dev via PR #91.** |
| ENG-02 | Retain and disclose start-year 365/366 denominator convention | **Implemented on dev via PR #91.** |
| ENG-03 | Central FD term validation and maturity horizon | **Implemented on dev via PR #91.** |
| ENG-04 | Lightweight 10% AIT baseline and source disclosure | **Implemented on dev via PR #91.** Not a comprehensive tax engine. |
| SEARCH-01 | Bounded browser search and explicit unlimited mode | **Implemented and calibrated.** No optimality proof is implied. |
| SEARCH-02 | Strategy modules concentrate multiple responsibilities | **Deferred.** Staged decomposition only. |
| SEARCH-03 | Independent planners require parity protection | **Partial.** Greedy strict-outflow reservation is fixed; broader cross-strategy planner parity remains. |
| DATA-02 | Senior/minor selection is not eligibility verification | **Closed scope boundary.** |
| DATA-03 | Special-product caps/eligibility/tax constraints | **Deferred.** |
| DATA-04 | Strict CSV structural validation | **Completed on dev via PR #91.** |
| DATA-05 | Simplified transfer-fee model is not a full channel model | **Documented limitation; simplified model retained.** |
| DATA-06 | Bank dataset freshness and metadata | **Metadata contract implemented; bank-by-bank source review pending.** |
| DEPLOY-01 | Dev preview assembly under `/dev/` | **Implemented on dev.** |
| UI-01/02/03 | Reduced-motion scrolling, operable help disclosures, field-associated errors | **Implemented on dev; manual assistive-technology QA remains.** |
| PRIV-01/02 | Draft retention controls and public privacy/legal disclosures | **Implemented on dev.** |
| WEB-SEC-02 | Static hosting response-header strategy | **Open.** Actual production/dev origin headers remain unverified. |
| QA-01 | Playwright browser smoke coverage in CI | **Implemented on dev; latest workflow is green.** |
| QA-REP-01 | Independent standalone report, mobile and print QA | **Partial.** Automated smoke assertions pass; extended/manual QA remains. |

## Owner-approved constraints

- Preserve the existing start-year 365/366 elapsed-day denominator; do not silently switch to calendar-segmented Actual/Actual.
- Keep special-product constraints outside the generic active model until they can be enforced.
- Retain the lightweight 10% Sri Lankan AIT baseline with source/effective-date disclosure; do not imply it resolves individual tax eligibility.
- Retain the simplified same-bank/inter-bank fee approximation and label it as an estimate.
- Track source review, material economic-data changes and schema migrations independently. Never infer source review dates from Git history or file timestamps.
- Retain the 10,000 expanded states / 30 seconds browser search baseline while allowing deliberate longer/unlimited searches.
- Avoid broad strategy refactoring until parity baselines exist.
- Keep GitHub Pages for this phase; response-header verification remains a separate open item.

## Remaining work

1. **SEARCH-03 parity:** Add eligible FD booking, maturity/installment payout, transfer-fee and future-outflow reserved-liquidity fixtures. Compare decisions, event ledgers, obligations, balances, fees, AIT and validity across Greedy, GSS, Absolute R and Absolute R+.
2. **QA-REP-01:** Verify offline behaviour, chart initialization and realistic large ledgers. Complete manual print/PDF pagination, keyboard, screen-reader, contrast and 200–400% zoom review.
3. **DATA-06 source review:** Recheck bank entries against authoritative sources. Populate review/update dates only after the corresponding real review/change.
4. **WEB-SEC-02:** Inspect actual production and `/dev/` response headers and document which controls GitHub Pages does not expose.
5. **Release hygiene:** Keep deferred architecture/data-model changes separately scoped; do not represent this audit as a release certification.

## Verification boundary

Workflow [45472055379](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/45472055379) is recorded as successful on the current `dev` HEAD. Its exact job list is authoritative for what automation ran. It does not establish screen-reader output, full WCAG conformance, real-device behaviour, actual printed/PDF pagination, live bank rates, legal compliance or deployed HTTP response headers.

This is a risk-based source review, not formal verification, financial-product certification, penetration testing, a legal opinion or a full WCAG audit. External bank rates, product eligibility, tax treatment, fee schedules and contractual payout terms still require direct verification with the relevant institution or qualified professional.
