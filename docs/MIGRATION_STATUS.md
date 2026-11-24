# Migration status

## Current application status

The active application is the JavaScript implementation under `src/`. It is used by the current browser app and Node.js CLI on `dev`. The legacy Python implementation is preserved under `archive/` for historical reference and migration comparison; it is not the active runtime.

The browser application, browser strategy configuration, Web Worker execution, browser smoke tests and GitHub Pages deployment are implemented. The earlier statement that these were not yet implemented described an older migration checkpoint and is no longer current.

## Implemented in the JavaScript application

- Runtime-neutral date, interest, account, FD product, event, booking and result primitives.
- Configuration validation and recurring/scheduled inflow/outflow expansion.
- Event-driven Greedy simulation with multiple accounts, transfers, account-level eFD eligibility, booking/maturity/payout events, AIT, fees, outflows and final sweep.
- **Absolute R:** branch-and-bound search, Greedy incumbent, admissible optimistic bound, transposition pruning, local booking combinations, consolidation/carry-forward decisions and replay into the canonical event ledger.
- **Absolute R+:** layered beam search, root-strategy diversity, bounded local booking combinations, optional state cap, inflow-aware waiting priority, payout-aware dominance pruning, diagnostics and canonical replay.
- Shared strategy entry points in `src/strategies/`; browser and Node.js adapters use the same JavaScript financial and strategy implementation.
- Strict Node-side CSV parsing and data adapters for the bank registry and bank-specific FD product catalogue.
- Product-source provenance and dataset-freshness metadata contracts.
- Node CLI for Greedy, Absolute R and Absolute R+, diagnostics and standalone HTML reports.
- Browser UI with strategy configuration, local scenario draft handling, a module Web Worker and standalone report generation.
- Automated Node regression/contract tests and Playwright Chromium smoke tests in CI.
- Production and development-preview web/docs build and GitHub Pages workflows.

## Remaining parity and validation work

Implementation availability is not the same as parity or certification. The following remain distinct validation tasks:

- Full Python-vs-JavaScript golden fixture parity across archived scenarios, payout types, AIT, transfer fees, multi-account cases and strict/deferred/best-effort outflows.
- Performance benchmarking of Absolute R on the largest archived scenarios and Absolute R+ defaults against the Python baseline.
- Full legacy console formatter parity, XIRR and complete decision-log generation, where still required by the product.
- Detailed content parity and visual regression between legacy Python-generated reports and the JavaScript report.
- Python CLI parity for strategy comparison, plotting and all ancillary CLI options.
- Broader cross-strategy planner parity for eligible bookings, maturity/installment payouts, transfer fees and reserved liquidity.
- Manual browser/report accessibility, print/PDF, offline and chart QA.

See [the engineering audit](audits/README.md) for current finding dispositions and verification boundaries.

## Financial and release boundary

The JavaScript application is already deployed through the repository's Pages workflows; this document does not impose a blanket “do not deploy” gate. Automated tests and deployment do not certify financial correctness or current bank terms. Treat outputs as planning estimates, verify bank rates/fees/eligibility directly, and do not describe the application as financially certified. Complete or explicitly accept remaining parity and manual-QA work before claiming comprehensive validation.
