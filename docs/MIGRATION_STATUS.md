# Migration status

## Implemented

- Runtime-neutral date, interest, account, FD product, event, booking and result primitives.
- Configuration validation and recurring/scheduled inflow/outflow expansion.
- Initial event-driven Greedy simulation with multiple accounts, transfers, account-level eFD eligibility, booking/maturity/payout events, AIT, fees, outflows and final sweep.
- Node CSV parser and file adapters for the bank registry and bank-specific FD product catalogue.
- Root data catalogue populated from archived bank and FD CSV datasets.
- Initial Node CLI for Greedy: reads JSON configuration, loads catalogues, validates inputs, runs the shared Greedy engine, prints a console timeline/booking summary and writes a standalone HTML report.
- Unit and CLI integration tests.

## Not yet equivalent to the Python application

- GAML and Absolute strategy ports.
- Full Python-vs-JavaScript golden fixture parity and broad financial regression coverage.
- Full legacy console formatter parity, XIRR and decision-log generation.
- Full eight-section HTML report fidelity, interactive charts, account/FD principal chart series and complete execution-plan grouping.
- Python CLI parity for strategy comparison, plotting, diagnostics and all CLI options.
- Browser application, browser parity tests and GitHub Pages deployment.

The JavaScript CLI currently supports --strategy greedy only. GAML and Absolute are explicitly rejected rather than silently substituted. Do not use it for financial decisions until parity testing is complete.
