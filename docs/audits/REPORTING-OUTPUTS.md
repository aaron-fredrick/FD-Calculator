# Reporting and output audit

## FIN-01 — “Final value” is not the closing portfolio value after withdrawals

**Severity: P1**

**Evidence:**
- [SimulationRuntime.buildResult L517-L523](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/simulation-runtime.js#L517-L523) sets `total_principal` to original capital plus all inflows.
- [SimResult L66-L72](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/core/results.js#L66-L72) defines `cash_retained`, `cash_flow_net_worth` and `final_value`. The `final_value` formula is contributed capital plus gross interest minus fees and AIT; it does not subtract paid outflows.
- [Web result metrics L110-L114](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js#L110-L114) displays `final_value_after_ait` as “Final value”.
- [HTML report L297-L300](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/reporting/html.js#L297-L300) labels `result.final_value` as “Final simulated portfolio value”.

**Impact:** when scheduled outflows have been paid, the displayed “Final value” can exceed the assets remaining at the end of the simulation by the amount already withdrawn. The current formula is a pre-withdrawal contribution-plus-return measure, not the closing portfolio balance. The distinction matters when users compare a plan with different withdrawal schedules.

**Recommendation:** define separate, unambiguous measures:
- `contributed_capital`: opening capital plus inflows.
- `pre_withdrawal_value`: contributed capital plus return after AIT/fees, before paid outflows.
- `closing_assets`: actual cash and any still-active investments at the simulation boundary.
- `outstanding_liabilities`: unpaid outflows.
- `closing_net_worth`: closing assets less outstanding liabilities.

For the scoped mode, reconcile the closing value against ending account balances and outstanding obligations. Update UI, console and HTML labels together. Do not change the existing `final_value` contract until all consumers and XIRR calculations are reviewed.

**Regression case:** start with LKR 100,000, no interest, pay a LKR 40,000 outflow, finish with LKR 60,000. The report must not label LKR 100,000 as the closing portfolio value. Add a second case with interest, fees and an unpaid deferred outflow.

## Reporting strengths

- Dynamic text in tables, ledger rows, decision cards and product labels is generally passed through the HTML escaping helper in [html.js](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/reporting/html.js).
- Embedded chart JSON escapes closing-script sequences before insertion.
- The standalone report template embeds its CSS and JavaScript; no external script fetch is required by the reviewed template.
- The report includes chart-data tables as a non-canvas fallback, an event ledger, transfer/booking instructions, AIT breakdowns and product eligibility caveats.
- The report uses explicit LKR units and separates gross interest, AIT and transfer fees in its reconciliation panel.
- The report preserves the financial warnings and outstanding-outflow status.

## Additional observations

### FIN-02 — “Capital invested” is broader than the actual FD principal booked

The web metric reads `total_principal`, which the runtime sets to opening capital plus all inflows. That is capital contributed/available over the horizon, not necessarily the sum of principal actually placed into fixed deposits. Rename the metric to “Capital contributed” or add a separate actual-FD-principal total.

### FIN-03 — The report needs source provenance beside each simulated product

The product report includes name, rate, tenor, payout and catalogue eligibility, but not the source URL, source effective date, research status or source type. See [DATA-01](DATA-AND-FINANCIAL-ASSUMPTIONS.md#data-01--source-provenance-is-not-visible-in-the-simulation).

### QA-REP-01 — Test the actual downloaded HTML, not only string fragments

The tests assert report markup, chart JSON and token contracts, but a browser test should open the downloaded report offline and verify chart initialization, collapsible tables, long content, print layout, keyboard access and no external network dependency.

## Recommended changes

1. Fix FIN-01 semantics before changing visual styling.
2. Rename the capital metric.
3. Add a product-source panel and report metadata.
4. Add report download/open tests with representative large and adversarial labels.
5. Verify print/PDF layout and standalone offline behaviour in a browser.
