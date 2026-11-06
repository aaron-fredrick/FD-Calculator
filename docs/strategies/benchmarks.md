# Strategy benchmarks

<script setup>
import benchmarkResults from './benchmarks/results.json'
</script>

FD Cal keeps its two simulation objectives separate. **Scoped Range** is the supported benchmark area. **Goal** is under development and has no published benchmark data yet.

## Scoped Range

This study runs the repository's `SimulationEngine` with the three web strategies: **Greedy**, **Absolute R+** and **GSS**. Most sweeps vary one factor at a time; a separate capital × horizon matrix tests their interaction. Each strategy receives identical inputs at every scenario point.

The expanded dataset contains **324 strategy observations** across 108 scenario points, evaluated by all three strategies. The default chart metric is **net interest after AIT and transfer fees**, in LKR; interactive selectors also expose the difference vs Greedy, runtime, booking count, simulation validity and unpaid outflows where applicable. Net interest is not gross interest or final portfolio value. This is the scoped date-range study. All strategies receive the same selected start and end dates.

## Benchmark setup

| Parameter | Setting |
|---|---|
| Start date | 5 November 2026 |
| Investment horizon | 0–60 months in 3-month increments |
| Starting capital sweep | LKR 25,000; 100,000; 300,000; 1,000,000 |
| Account sweep | 1, 2 and 3 accounts, all at DFCC |
| Bank sweep | 1, 2 and 3 banks across a fixed 3-account portfolio |
| Cash inflows | 2-year monthly amount sweep (LKR 0–200,000, LKR 10,000 steps) and fixed LKR 100,000 paid monthly for 1–12 months |
| Cash outflows | 2-year strict monthly amount sweep (LKR 0–200,000, LKR 10,000 steps) and fixed LKR 100,000 paid monthly for 1–12 months |
| eFD eligibility | Standard-only vs eFD-eligible accounts |
| AIT | Enabled at 10% |
| Interest calculation | Simple interest; actual leap-year day basis |
| Transfer fees | Bank-specific catalogue fees; applied to transfers and final sweep |

The base portfolio is LKR 300,000 across three accounts and three banks. The horizon sweep runs from 0 to 60 months in 3-month steps. All four cash-flow sweeps use a fixed 24-month simulation horizon. Amount sweeps vary the recurring monthly amount while keeping monthly payments active for the full 24 months. Duration sweeps fix the monthly amount at LKR 100,000 and apply one payment per month for 1–12 consecutive months, beginning one month after the simulation start. Cash flows are applied to the first (DFCC) account. The capital/horizon matrix tests LKR 100,000, 300,000 and 1,000,000 at 6, 12 and 24 months. For the account-count sweep, all accounts use DFCC; for the bank-count sweep, the account count and total capital remain fixed.

## Bank product catalogues

The benchmark used the product rows already stored in the repository. All three catalogues are marked `populated_direct`.

| Bank | Product rows | Rate-data note |
|---|---:|---|
| DFCC Bank PLC | 70 | Bank-published schedule effective 1 October 2026 |
| Commercial Bank of Ceylon PLC | 48 | Bank-published rate page; effective date not displayed in the source |
| National Development Bank PLC | 35 | Bank-published schedule last updated 24 August 2026 |

Sources: [DFCC rates](https://www.dfcc.lk/personal-banking/dfcc-leasing/rates-and-tariff?tab=fixed_deposits), [Commercial Bank rates](https://www.combank.lk/rates-tariff), [NDB deposit rates](https://www.ndbbank.com/rates/interest-rates-on-deposits).

Transfer fees follow the bank catalogue: DFCC LKR 30 inter-bank, Commercial Bank LKR 25, and NDB LKR 25; intra-bank transfers are configured at LKR 0. The DFCC fee source includes a note that its published amount conflicts with the CBSL digital CEFTS maximum, so verify the current channel tariff before treating the modelled fee as a live quote. Sources: [DFCC local payments](https://www.dfcc.lk/personal/local-payments), [Commercial Bank tariff](https://www.combank.lk/rates-tariff), [NDB general tariff](https://ndbbankweb.ndbbank.com/images/download/pdf/General_Tariff_-_English.pdf).

## Sensitivity graphs

Charts compare the same inputs across all three strategies. Hover points for exact values, switch metrics and toggle strategies. Full observations are available in [benchmark-results.json](./benchmarks/results.json).

### Investment horizon

<BenchmarkChart :rows="benchmarkResults.results" category="horizon_months" x-label="Horizon (months)" />

The sweep covers 0–60 months in 3-month steps.

### Starting capital

<BenchmarkChart :rows="benchmarkResults.results" category="starting_capital_lkr" x-label="Starting capital (LKR)" />

Capital is varied while the base horizon and portfolio remain fixed.

### Number of accounts

<BenchmarkChart :rows="benchmarkResults.results" category="account_count" x-label="Number of accounts" />

The three strategy lines overlap because the measured returns are effectively identical across one, two and three accounts in this single-bank scenario. The near-flat result is meaningful: splitting the same capital across more accounts did not improve the available rate or net return in this catalogue snapshot.

### Number of banks

<BenchmarkChart :rows="benchmarkResults.results" category="bank_count" x-label="Number of banks" />

The Greedy and Absolute R+ lines overlap in this comparison. GSS remains close to its one-bank result and does not capture the same benefit from adding banks.

### Cash inflows

**Monthly amount** — fixed monthly frequency for the full 24-month simulation, varied from LKR 0 to 200,000 in LKR 10,000 steps.

<BenchmarkChart :rows="benchmarkResults.results" category="inflow_monthly_amount_lkr" x-label="Monthly inflow (LKR)" :x-tick-step="20000" />

**Inflow duration** — fixed LKR 100,000 per month, paid monthly for 1–12 consecutive months within the 24-month simulation.

<BenchmarkChart :rows="benchmarkResults.results" category="inflow_duration_months" x-label="Inflow duration (months)" :x-tick-step="2" />

### eFD eligibility

<BenchmarkChart :rows="benchmarkResults.results" category="efd_eligibility" x-label="Eligibility" chart-type="bar" />

### Cash outflows

Strict outflows use the same two sweeps as inflows. They are due from the designated account and are not covered by balances in other accounts.

**Monthly amount** — fixed monthly frequency for the full 24-month simulation, varied from LKR 0 to 200,000 in LKR 10,000 steps.

<BenchmarkChart :rows="benchmarkResults.results" category="outflow_monthly_amount_lkr" x-label="Monthly outflow (LKR)" :x-tick-step="20000" />

**Outflow duration** — fixed LKR 100,000 per month, paid monthly for 1–12 consecutive months within the 24-month simulation.

<BenchmarkChart :rows="benchmarkResults.results" category="outflow_duration_months" x-label="Outflow duration (months)" :x-tick-step="2" />

Outflow charts include validity and unpaid-obligation metrics. If a strategy stops before producing a result, paid and unpaid totals are left unmeasured; the scheduled total is shown separately. Invalid observations are not treated as competitive interest results.

## Capital and horizon interaction

The one-factor sweeps above do not reveal whether a strategy responds differently to larger capital at longer horizons. The additional 3 × 3 interaction matrix runs nine combined capital/horizon scenarios for every strategy. Select a strategy and metric, then inspect individual cells for exact runtime and booking counts.

<BenchmarkHeatmap :rows="benchmarkResults.results" />

## Reading the results

Net interest is measured after AIT and transfer fees; it excludes principal. The cash-flow studies use a 24-month horizon. Amount sweeps vary the monthly amount over the full horizon; duration sweeps hold the amount at LKR 100,000 and vary the number of consecutive monthly payments from 1 to 12.

For strict outflows, use validity and unpaid-obligation metrics alongside interest. If a strategy throws before a result is available, payment totals remain unmeasured and the scheduled amount is reported separately. Absolute R+ is bounded by its search budget; a returned result is not an optimality proof.

## Absolute R+ search-parameter sensitivity

A separate controlled experiment varies Absolute R+'s beam width, local branch limit and expanded-state decision cap independently. Each sweep holds the other two settings and the financial scenario constant. Interactive charts and exact measurements are shown in the [Absolute R+ technical reference](./ABSOLUTE-PLUS#benchmark-and-sensitivity).

## Scoped-mode compatibility check for dual-scope strategy work

The dual-scope implementation was compared against the archived fixed-horizon baseline before changing the benchmark assumptions:

- The current run on 5 November 2026 at 21:54 UTC produced the same **all non-timing fields** as the archived run at 09:00 UTC across all 54 Greedy, Absolute R+ and GSS scenario rows. There were zero differences in financial results, fees, booking counts, or other recorded result fields.
- The 15-point Absolute R+ search-parameter sweep also matched the archived baseline in every non-timing field: net interest, expanded states, beam pruning, local-combination pruning and optimality status were unchanged.
- Median measured runtimes were 3 ms vs 3 ms for Greedy, 2 ms vs 1 ms for GSS, and 3.40 s vs 5.87 s for Absolute R+ across the 18 scenario points per strategy. The Absolute R+ parameter-sweep median was 3.62 s vs 4.73 s. These are runner-specific samples; they are not used as proof of a speedup. The important compatibility evidence is that the financial outputs and search diagnostics are unchanged.
- Absolute R is not part of the web-strategy sensitivity matrix and has no archived pre-change performance matrix. Its scoped compatibility is covered by the legacy search-parity tests; a dedicated pre-change Absolute timing baseline is unavailable.

This is a historical scoped-regression check for the web strategies. The active acceptance requirement is to keep the current scoped outputs and diagnostics unchanged.

## Reproducibility and limitations

- Run `node scripts/strategy-sensitivity.js` from the repository root to repeat the study.
- The workflow archives the raw output as a GitHub Actions artifact.
- Absolute R+ uses a 96-state beam, 48 local branches and a 5,000 expanded-state budget. Its results are bounded and do not prove optimality.
- Absolute R is CLI-only and exhaustive; it is not included in this web-strategy comparison.
- Strict outflows test whether the designated account can meet recurring obligations over the 24-month horizon. Duration cases schedule one strict payment per month for the selected 1–12-month period. They are a liquidity-feasibility study, not a full liquidity-preference model.
- Published bank rates are a dated data snapshot, not guaranteed live offers. Confirm minimum balances, account eligibility, payout conditions and current tariffs with each bank before investing.

## Goal

**Status: Under development — no benchmark data available yet.**

Goal mode is currently disabled in the public UI and configuration schema. Its objective is to reach the configured consolidation net-interest target at the earliest valid credit date. The planner and accounting verification are still being worked on, so no Goal strategy comparison, sensitivity measurements or graphs are published here.

The planned first Goal optimiser is Absolute R. Greedy, GSS and Absolute R+ remain scoped-range strategies. Goal benchmark data will be added only after the planner, authoritative runtime replay, provenance accounting and adversarial verification are complete.
