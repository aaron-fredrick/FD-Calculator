# Owner-feedback research and follow-up decisions

**Research date:** 9 November 2026  
**Implementation branch:** `audit/owner-feedback-followups`  
**Target:** `dev`  
**Scope:** owner-approved follow-ups from the 9 November 2026 audit review. This document records researched facts, chosen behaviour, implementation boundaries and items deliberately left unchanged.

## 1. ENG-01 — installment payouts are bounded by the simulation window

### Owner decision

Do not clamp an installment schedule's last payout to contractual maturity and do not extend the simulation horizon to accommodate a later installment. Generate the product's contractual payout sequence, then include only payout events whose dates fall inside the active simulation period.

The product's contractual maturity remains a candidate-eligibility constraint: the FD must mature by the simulation end. The payout event stream is separately bounded by the same simulation window. A payout outside the window is not simulated, and the simulation end date is not moved.

### Source-level observation

`FDOption.generateCashFlows()` currently generates installment dates by repeatedly adding the payout interval until the generated date is on or after maturity. A five-month tenor with a two-month interval therefore yields months 2, 4 and 6. The authoritative runtime's `schedule()` rejects any event outside `context.start`–`context.end`, so the booking path must filter the event stream before scheduling rather than allowing an out-of-window event to abort the run.

The booking's contractual interest calculation must remain based on the full product schedule. Filtering the event ledger must not accidentally recalculate total contractual interest, AIT, or installment allocation using only the in-window subset. The implementation should preserve the full contractual cash-flow calculation internally while exposing/scheduling only in-window events.

### Acceptance tests

- 5-month tenor / 2-month interval with a 5-month simulation window: only month 2 and month 4 events are scheduled; no event is added at month 6 and the simulation end remains month 5.
- The same product with a 6-month simulation window: month 2, 4 and 6 events are within the requested window; product maturity remains month 5.
- 5-month tenor / 6-month interval with a 5-month simulation window: no payout event is scheduled within the window; the engine must handle the contract without extending the run or inventing a maturity-date payout.
- Exact-divisor schedule (e.g. 6-month tenor / 2-month interval): all generated events within the simulation window are retained.
- Confirm contractual interest, AIT, principal allocation and report totals do not change merely because the event window truncates later cash-flow events.
- Confirm Greedy, GSS, Absolute and Absolute+ all use the same runtime event filter and replay semantics.

This is a simulation-window rule, not a claim that every bank contract pays its final installment after maturity. Product-level contract wording still needs to be recorded in source notes where available.

## 2. ENG-02 — elapsed-day interest convention

### Current calculation

The current implementation uses actual elapsed days and one denominator selected from the accrual start date's calendar year:

- 366 when leap-year handling is enabled and the start year is a leap year.
- 365 otherwise.
- The selected denominator is applied to the complete accrual interval, including intervals that cross into another calendar year.
- Simple interest is `principal × annual rate × elapsed days / selected year base`.
- Compound interest uses the same selected base as the daily compounding denominator.

This is a start-year denominator convention. It is not calendar-segmented Actual/Actual. The owner has confirmed that this is intentional for FD Cal and that the formula must remain unchanged.

### Bank-term research result

Published Sri Lankan bank product pages and key-facts documents commonly state nominal/annual effective rates, tenors and payout choices, but the reviewed public materials do not establish one universal day-count basis used by all banks. Examples:
- [HNB Finance — Fixed Deposits](https://www.hnbfinance.lk/fixed-deposits/) describes tenure and monthly/maturity interest payout options.
- [National Savings Bank — Fixed Deposit](https://www.nsb.lk/product/ordinary-term/fixed-deposit/) describes monthly or maturity interest payout and available tenors.
- [Commercial Bank — Fixed Deposit Key Facts Document](https://www.combank.lk/downloads/file/206/fixed-deposits) describes maturity/monthly interest options and product conditions.

These product pages do not, by themselves, prove that every bank uses FD Cal's start-year denominator. Do not market this as a universal Sri Lankan bank convention. Describe it as the calculation convention currently used by FD Cal, and tell users to verify a specific bank's day-count and rounding rules.

### Owner-approved treatment

Keep the formula. Add a short, visible explanation in the UI/report and retain tests covering a leap-year start, non-leap-year start and multi-year interval crossing 29 February. Any later change to calendar-segmented Actual/Actual or a bank-specific basis requires a separate financial-model decision and before/after expected-value fixtures.

See [Interest day-count convention](../finance/INTEREST-DAY-COUNT.md).

## 3. ENG-03 — central product-term validation

### Owner-approved direction

Centralize structural and simulation eligibility checks. A product may only be booked when its contractual maturity fits within the active simulation period. Generated cash-flow events are independently filtered to that same period as described in ENG-01.

The first validation layer should cover:
- Positive, parseable tenor.
- Positive, parseable payout interval for non-cumulative products.
- Supported payout type.
- Finite, non-negative annual rate (negative-rate products require an explicit product/model decision rather than accidental acceptance).
- Finite, positive minimum principal where the product requires a minimum.
- Consistent age-segment metadata (age bounds ordered and within the supported range; guardian requirement explicit when known).
- Maturity date within the simulation horizon at booking time.

Do not add special-product maximums, tax exemptions, scheme-wide caps or channel restrictions to the generic model until the relevant product rules are researched and the simulation workflow is designed to enforce them. Invalid individual catalogue rows should be isolated with bank/file/row diagnostics where safe; they should not silently contaminate valid rows or force an entire multi-bank catalogue to be discarded without a clear fatal structural error.

## 4. ENG-04 — AIT assumption, deliberately lightweight

### Verified reference

The current engine assumption is 10% of interest. The primary reference is the Inland Revenue Department's [Circular SEC/2025/E/02](https://www.ird.gov.lk/en/publications/Circulars_Circulars/SEC_2025_E_02_E.pdf), dated 28 March 2025, which states that AIT on Sri Lankan-source interest/discount payments is 10% with effect from 1 April 2025.

The IRD's [Circular SEC/2026/E/04](https://www.ird.gov.lk/en/publications/Circulars_Circulars/SEC_2026_E_04_E.pdf), dated 8 June 2026, is the later withholding-agent guidance. The IRD circular register lists it as the current 2026 circular. The [CBSL Annual Economic Review 2025 policy-measures supplement](https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/publications/aer/2025/en/29_Major_Economic_Policy_Measures.pdf) independently records the increase of the interest/discount AIT rate from 5% to 10%.

### Important qualification

10% is the current baseline assumption used by FD Cal; it is not a complete determination for every depositor or every interest payment. IRD guidance also describes exemptions and resident-individual self-declaration/relief procedures. Non-resident treatment can depend on double-tax agreements and tax-clearance processes. The calculator does not currently collect tax-residency, exemption or declaration evidence and must not imply that every depositor is invariably liable for 10%.

### Owner-approved implementation boundary

Keep the model simple: a single current Sri Lankan interest AIT rate with a stable assumption identifier, effective date, verification date and official source reference. Show a concise source disclosure beside the UI toggle. Do not introduce a user-configurable tax regime, historical tax engine or product-level exemption system in this pass. Keep the current rate at 10% until an authoritative update is verified.

Current metadata identifier: `LK-AIT-INTEREST-2025-04-01`.

## 5. DATA-03 — special FD products: research only, no implementation

The owner explicitly deferred workflow/model changes. Keep special products out of the active simulation catalogue unless all simulation-critical conditions can be represented and enforced.

### Findings

**Government Special Fixed Deposit Scheme for Senior Citizens (2025).** The Cabinet decision dated 16 June 2025 described a scheme for Sri Lankan citizens aged 60 or above, deposits opened between 1 July and 31 December 2025, a 12-month tenor, and a maximum aggregate deposit of LKR 1,000,000. The subsidised rate used a comparison formula based on AWFDR or the relevant bank's FD rate plus 3%, whichever was higher. The programme period has ended; do not present this as an open/current offer without a new official extension. Source: [Cabinet decision](https://www.cabinetoffice.gov.lk/cab/index.php?Itemid=49&dID=13249&id=16&lang=en&option=com_content&view=article).

**Minor FD products.** Conditions are not interchangeable:
- [SDB Minor FD Key Facts Document](https://www.sdb.lk/images/pdf/kfd/sdb-minor-fd-en.pdf) says the account is for a Sri Lankan citizen below 18 with a guardian, with a LKR 10,000 opening/minimum balance and an original certificate requirement for withdrawal.
- [People's Bank Term Deposits](https://www.peoplesbank.lk/term-deposite/) describes a minor FD opened by a parent or guardian for children up to 18 and an advertised 0.5% premium over normal FD rates.
- [People's Leasing Senehasa Minor FD](https://www.plc.lk/products/fixed-deposits-savings/fixed-deposits-senehasa-minor/) describes guardian opening, 12–60 month terms, monthly or maturity interest payout, and closure by the child after reaching 18 subject to the certificate/NIC requirements.

**Other special products.** The existing catalogue research register contains senior/minor product notes and some fields such as `product_max_amount` and `tax_exempt`; those constraints are not yet represented as complete engine-enforced product rules. Special schemes may add aggregate caps across banks, age/residency requirements, guardian controls, restricted premature withdrawal, subsidy funding windows, product-specific tax treatment and special payout/renewal conditions.

### Future data-model requirements (not implemented here)

Before activation, the product model likely needs explicit:
- Customer eligibility and evidence requirements.
- Per-deposit and aggregate scheme caps, including scope across banks.
- Scheme opening/closing windows and effective dates.
- Tax treatment and the legal source for any exemption.
- Early withdrawal/renewal consequences.
- Guardian, joint-holder and maturity-access rules.
- Product-specific payout and interest calculation terms.

The generic age-segment checkbox must continue to mean “include these candidate products”; it is not identity or eligibility verification.

## 6. DATA-05 — transfer channel modelling: research only, keep simplified fees

The current model intentionally uses a simplified bank-level fee approximation. No transfer-channel, customer-tier or privilege selector is being added in this pass.

### Regulatory baseline

CBSL Payment and Settlement Systems Circular No. 02 of 2025, dated 7 February 2025 and effective 15 February 2025, sets CEFTS maximum transaction fees:
- LKR 25 for internet banking, mobile banking and on-us ATM transfers.
- LKR 100 for over-the-counter transfers and off-us ATM transfers.
- LKR 25 for LPOPP transfers.
- The standard CEFTS transaction-value limit is LKR 5 million, with defined LPOPP exceptions.

Source: [CBSL Circular No. 02 of 2025](https://www.cbsl.gov.lk/sites/default/files/cbslweb_documents/laws/cdg/psd_circular_no_02_of_2025_e.pdf). CBSL's [Payments Bulletin, Q3 2025](https://www.cbsl.gov.lk/sites/default/files/Payments_Bulletin_3Q2025_e.pdf) repeats the digital/OTC/off-us fee caps.

These are regulatory maximums for specified CEFTS channels, not proof that every bank charges the maximum or that all payment rails are CEFTS. They do not make an intra-bank transfer, SLIPS transfer, international transfer, OTC payment and mobile CEFTS transaction equivalent.

### Bank examples

- HNB's tariff distinguishes CEFT transfers from SLIPS charges and describes own-bank transfers separately: [HNB tariffs](https://www.hnb.lk/tariffs/other-product-tariffs).
- MCB's 1 July 2026 schedule lists free internet/mobile transfers and a separate OTC CEFT charge: [MCB schedule](https://mcb.com.lk/wp-content/uploads/2026/06/Schedule-of-Bank-Charges-w.e.f-01-07-2026.pdf).
- Pan Asia's 2026 tariff distinguishes standard CEFT and Privilege Club pricing, and separates online from OTC: [Pan Asia 2026 tariff](https://www.pabcbank.com/wp-content/uploads/2025/12/BANK-TARIFF-2026.pdf).

The current `data/banks/banks.csv` captures some of these differences in source notes, but the engine still reduces them to a same-bank and domestic inter-bank fee. The existing DFCC note also records a bank-published LKR 30 value that appears to conflict with the CBSL digital CEFTS cap; this needs channel/scope reconciliation before changing the row.

### Owner-approved treatment

Keep the simplified model. Preserve explicit “estimated transfer fee” wording and source notes. Do not silently substitute the regulatory maximum for a bank's actual tariff, infer privilege eligibility, or treat every transfer as CEFTS. A future channel model should be a separate product/UX change with explicit digital CEFT, OTC CEFT, SLIPS, internal transfer and international transfer choices, effective dates, account tiers and transaction limits.

## 7. DATA-06 — dataset review and staleness

### Existing mechanism

The existing bank-to-dataset index, `data/fd_options/fd_options.csv`, already contains a `dataset_reviewed_at` column. The field is currently blank across the 29 indexed bank rows. The application displays “Review date not recorded” when it is empty. This means the repository has a place to store review dates, but the present data does not yet support a reliable age calculation.

Do not populate the field with the merge date or file modification time: those dates describe repository edits, not when a bank source was checked. Preserve separate concepts:
- **Source effective date:** when the bank's rate/terms take effect, stored at product level where published.
- **Dataset reviewed date:** when the maintainer actually rechecked the bank's source and mapped terms.
- **Dataset updated date:** when the repository's bank dataset file was last changed. This can be derived from Git history or maintained separately, but must not be presented as a source-review date.

### Owner-approved thresholds

- 0–179 days since source review: no age-based stale warning.
- 180–364 days: show “Review due / may be stale”.
- 365 days or more: show a stronger “Stale — verify directly with bank” warning.
- Missing review date: show “Review date not recorded — freshness unverified”, not a fresh/green state.

These are catalogue-maintenance warnings, not claims that the bank's published rate has expired. A bank can change a rate the day after review; the source effective date remains a separate signal.

### Implementation plan

Use the existing `dataset_reviewed_at` field as the authoritative freshness input and add a separate `dataset_updated_at` field only if the repository needs an explicit dataset-edit timestamp in the UI or reports. Populate review dates only when a source has actually been rechecked. Keep a small metadata contract test and a stale-date boundary test at 180 and 365 days.

## 8. WEB-SEC-02 — retain GitHub Pages

GitHub Pages remains the hosting platform. The project cannot configure arbitrary origin response headers through the repository's Pages settings. Do not migrate hosting or introduce a proxy/CDN in this phase. Verify deployed response headers periodically and document any residual header limitation; keep application-level controls and dependency/workflow security checks.

## 9. SEARCH-01 — browser search budget calibration

Keep the current browser defaults (10,000 expanded states / 30 seconds) as the baseline. Do not reduce them simply because a short benchmark completes faster. The benchmark should compare 5k, 10k, 20k and uncapped state limits with 15/30/60-second budgets, across small, medium and hard scenarios.

Record:
- Runtime and peak memory where measurable.
- Expanded states, beam/local pruning and stop reason.
- Booking signatures, payout dates, fees, AIT, paid/outstanding outflows and closing values.
- Whether search found a better candidate as budgets increased.
- Whether the run exhausted the budget or completed normally.

The browser must retain an explicit user-controlled longer/unlimited mode. A timeout is a resource stop, not proof that the best possible result was found. The default should balance responsiveness and useful result quality; no benchmark result should be extrapolated from a single runner or a single scenario.

**Execution status:** benchmark matrix design is specified; a fresh controlled run has not yet been executed on this branch.

## 10. SEARCH-02 — strategy module decomposition plan

Do not perform a broad rewrite. Preserve existing parity/oracle tests and split only at stable responsibility boundaries:

1. **Domain projection:** candidate generation, payout/event projection, account liquidity and outflow obligations.
2. **Search state:** immutable state shape, state key/equivalence, provenance and pending event representation.
3. **Ranking/pruning:** scoped objective, goal objective, admissible bounds, beam priority and tie-breaks.
4. **Exploration orchestration:** exhaustive branch-and-bound, bounded beam search and recursive GSS planning.
5. **Replay/authority:** replay selected plans through the shared `SimulationRuntime`; runtime remains the only authority for actual event ordering, outflow settlement, booking and result construction.
6. **Diagnostics:** expanded/pruned counts, budget termination, proof status and replay failures.

Before moving code, map call graphs and import dependencies, identify duplicated projections and capture deterministic baselines. Avoid introducing a generic policy framework merely to share a few helpers. Extract one seam at a time with unchanged outputs and parity tests.

## 11. SEARCH-03 — cross-strategy and outflow parity

Treat the shared runtime as the authoritative executor. GSS, Absolute and Absolute+ may project future events, but they must not create independent authoritative outflow settlement. Their projections must preserve:
- Same-day ordering: inflows/FD cash flows/maturities, then outflows, then the next strategy decision.
- Strict/defer/best-effort obligation semantics.
- Source-account liquidity reserved for future obligations after consolidation transfers.
- Future inflows and product payouts that legitimately restore liquidity.
- Pending outflow amount, due date, account, and policy in state equivalence where those fields can change future decisions.
- Actual payout dates and AIT-adjusted flows.
- Replay through the runtime before a candidate is accepted as an actual result.

Add parity fixtures whenever a new payout type, fee, eligibility rule, tax assumption or outflow rule is introduced. Preserve the existing legacy-oracle and scoped parity tests; do not relax them to make a new planner pass.

## 12. QA-01 / QA-REP-01 — browser and standalone report test plan

The owner approved browser-driven testing in CI for pushes and pull requests targeting `dev` or `main`. A small Playwright suite should cover:
- App startup and catalogue load at the production root and `/dev/web/` path.
- Privacy preferences open/save/reopen and legal navigation.
- One deterministic simulation, result rendering and report download.
- Opening the downloaded HTML report independently (without the application page) and checking its core sections.
- No uncaught page errors or failed same-origin requests.
- Mobile viewport overflow, keyboard focus and reduced-motion behaviour.
- Report print stylesheet and offline/no-external-runtime dependencies.

Keep the suite deterministic and smoke-oriented. Do not introduce screenshot snapshots or a large browser matrix until basic smoke coverage is stable. Browser tests must run on PRs to `dev` and `main`, not only on a manual workflow dispatch.

## 13. Legal and privacy review — Sri Lanka-first, with mandatory-law caveat

### Owner-provided contact route

- General, non-sensitive support: public [GitHub issues](https://github.com/aaron-fredrick/FD-Calculator/issues).
- Personal-data, privacy and confidential security matters: `a.n.r.fredrick@gmail.com`.
- Never request or invite users to post financial account data, credentials or vulnerability details in public issues.

### Legal framework research

The product is aimed at Sri Lankan fixed-deposit comparisons, so Sri Lankan law is a reasonable proposed governing-law choice for the terms. A governing-law clause cannot prevent proceedings in another jurisdiction where mandatory consumer/privacy law or a court's jurisdiction applies; it does not guarantee immunity from claims.

The legal pages should identify FD Cal as an independently maintained informational project, not a bank, deposit-taking business, financial adviser or transaction intermediary. Keep disclaimers factual: no deposits, account opening, money movement or bank instructions; outputs are estimates; users must verify rates, product eligibility, taxes and fees with banks and qualified professionals.

**Data protection timing is changing and must not be described using stale commencement assumptions.** The Personal Data Protection (Amendment) Act No. 22 of 2025 was certified on 30 October 2025 ([Parliament notice](https://www.parliament.lk/en/home/parliament-news/view/4888)). The DPA's current notice says Gazette Extraordinary No. 2498/16 dated 22 July 2026 brings Sections 2–3 and Parts I and III into operation on 1 January 2027, while Parts II and VII are not yet active as at the notice date ([DPA legal-status notice](https://dpa.gov.lk/notice.php)). The legal pages should avoid claiming that every PDPA right, duty and penalty is already in force in November 2026; they should also be reviewed again when the 2027 commencement date arrives and when further gazettes are issued.

### Limitations

This is engineering/product research, not a legal opinion. It cannot guarantee that an individual operator will not be sued or eliminate legal exposure. Before the site is used commercially, collects user accounts or server-side financial data, introduces analytics, or offers personalised recommendations, obtain a Sri Lankan lawyer's review of operator status, consumer protection, privacy obligations, tax wording, IP/licensing, liability clauses and cross-border exposure. The operator's full legal name and any business/entity details should not be published without a deliberate owner decision.
