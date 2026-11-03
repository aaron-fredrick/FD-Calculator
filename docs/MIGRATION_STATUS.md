# Migration status

## Implemented and tested

- Calendar date arithmetic, interest calculations, account/product primitives and AIT payout generation.
- Runtime-neutral configuration validation and recurring/scheduled cash schedule expansion.
- Event-driven Greedy simulation port: multi-account balances, inflows, outflows, same-day payout ordering, transfer fees/channels, consolidation, split booking, maturity and periodic payout events, carry-forward, final cash sweep, and result accounting.
- Greedy tests for booking lifecycle and account-specific eFD eligibility.

## In progress / not yet complete

- Python-vs-JavaScript golden fixture parity across representative real configurations.
- GAML beam search and Absolute strategy JavaScript ports.
- Decision-log generation and console timeline.
- CSV bank/product loading adapters and configuration-file loading.
- Standalone HTML report, interactive charts, CLI, browser configuration UI, and Pages deployment.

The CLI and web entrypoints remain placeholders. Do not use this migration branch for financial decisions until parity and application integration are complete.
