# Migration status

The JavaScript migration is incremental. A green unit-test run confirms only the modules exercised by that run; it does not mean the calculator is feature-complete.

## Implemented and tested

- Calendar period parsing and month-end date arithmetic.
- Simple and daily-compound interest with leap-year basis.
- Account, FD-option and transfer-fee primitives.
- Gross payout generation and AIT cash-flow adjustment.
- Immutable outflow helper and outflow schedule validation.
- Runtime-neutral configuration validation when the caller supplies bank catalogue rows, bank-key index and loaded FD options.
- Recurring and explicitly scheduled inflow/outflow expansion, including deterministic resolution of relative date tokens.

## Not yet ported / not working as a complete application

- CSV catalogue and FD product-file loading adapters.
- Full event-driven simulation, event ledger, booking lifecycle and account cash accounting.
- Greedy, GAML and Absolute strategy implementations in JavaScript.
- Python-vs-JavaScript golden fixture parity.
- Decision log, console timeline, standalone HTML report and interactive charts.
- Node CLI configuration/data loading and report generation.
- Browser configuration UI and report rendering.
- GitHub Pages deployment.

The existing CLI and web entrypoints remain migration placeholders. Do not use them for financial decisions yet.
