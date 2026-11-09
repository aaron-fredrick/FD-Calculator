# Getting started

FD Cal has two entry points: the browser application for interactive scenarios and the Node.js CLI for development, diagnostics and automated workflows.

## Use the web application

Open the [FD Cal web application](https://aaron-fredrick.github.io/FD-Calculator/web/). The browser runs the shared JavaScript calculation engine in a background worker, keeping the page responsive during expensive optimisation. A scenario draft is saved locally in this browser; account data is not uploaded.

## Configure a scenario

The web configurator follows four stages:

1. **Investment window** — set the start and end dates. Deposits that cannot mature within the selected window are excluded.
2. **Bank accounts** — select the banks and enter only the amount allocated to this plan, not the full bank-account balance. Choose the consolidation account that receives the portfolio's remaining cash for final valuation. This is not an executable transfer.
3. **Cash-flow plans** — add recurring or date-specific inflows and outflows. Specific dates use `YYYY-MM-DD`, separated by commas, and must fall within the investment window. Outflow policies mean:
   - **Strict:** the simulation is invalid if the account cannot pay the full amount.
   - **Defer:** carry the unpaid amount forward.
   - **Best effort:** pay what is available and carry any remainder forward.
4. **Strategy and assumptions** — choose a supported strategy, review transfer-fee defaults, age-segmented product inclusion, AIT, compounding and leap-year assumptions.

The senior/minor switches add products with bank-published age conditions to the candidate set. They do not verify a depositor's age or guarantee eligibility. Where a booked product has catalogue age/guardian conditions, the standalone report displays those conditions for manual bank verification.

## Choose a strategy

The web application exposes **Greedy**, **Absolute R+** and **GSS** for scoped date-range simulations. **Absolute R** is CLI-only. Goal mode is under development and disabled; use the feature-request link beside the unavailable mode to suggest or discuss the planned capability.

- **Greedy** — fast local decisions; useful as a baseline, but it does not guarantee the best full-horizon result.
- **Absolute R+** — bounded beam search over multiple promising plans. Search limits trade exploration against runtime; pruning or a decision cap can prevent a global-optimality proof.
- **GSS** — recursive scoped planning with liquidity-aware SPLIT and CONSOLIDATE evaluation. It is a heuristic, not an exhaustive optimality proof.
- **Absolute R** — exhaustive branch-and-bound search; CLI only.

Read the [strategy guide](/STRATEGIES) before comparing results. Outcomes depend on the supplied data, assumptions and simulation horizon.

## Understand the result

The in-app result is deliberately concise: gross interest, AIT withheld, transfer fees, net interest, final value and capital invested. It is not intended to duplicate the full event history.

Use **Download HTML report** or **Open report** for the full inspection record: selected FD bookings, account movements, cash-flow schedules, maturities, performance charts and the event ledger. The generated HTML report is standalone and can be opened offline without fetching external fonts, scripts or chart assets.

The report may contain account labels, opening balances, selected deposits and a full event history. Treat it as a private financial document when saving or sharing it. Its catalogue fingerprint identifies the bank/product and fee snapshot used; the generated timestamp comes from the local device clock.

## Data and assumptions

FD Cal uses its configured bank/product data and financial assumptions. Product annual rates are nominal terms; portfolio-level annualised money-weighted return reflects the timing of deposits and withdrawals. Verify current rates, fees, eligibility and tax treatment with the relevant bank or authority before acting on a result. FD Cal is a planning tool, not financial or tax advice.

## Run locally

### Requirements

- Node.js 22 or newer
- npm

### Install and test

Clone the repository, then run:

```sh
npm ci
npm test
```

Run the CLI help:

```sh
npm run cli -- --help
```

### Configure a CLI scenario

Copy the example configuration before editing it:

```sh
cp config.json.example config.json
```

The local `config.json` is ignored by Git because it may contain private financial information. Do not commit real account details or personal financial records.
