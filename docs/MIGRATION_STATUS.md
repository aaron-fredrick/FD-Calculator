# Migration status

## Implemented

- Runtime-neutral date, interest, account, FD product, event, booking and result primitives.
- Configuration validation and recurring/scheduled inflow/outflow expansion.
- Event-driven Greedy simulation with multiple accounts, transfers, account-level eFD eligibility, booking/maturity/payout events, AIT, fees, outflows and final sweep.
- **Absolute strategy port:** exhaustive branch-and-bound search, Greedy incumbent, admissible optimistic bound, transposition pruning, local booking combinations, consolidation and carry-forward decisions, and replay into the canonical event ledger.
- **GAML strategy port:** layered beam search, root-strategy diversity, bounded local booking combinations, optional state cap, inflow-aware waiting priority, payout-aware dominance pruning, diagnostics and canonical replay.
- GAML configuration through `gaml_settings` (`beam_width`, `max_local_branches`, `max_decisions`), with CLI overrides.
- Shared strategy entry points in `src/core/strategies/`; each strategy has its own module and uses the same Node/browser-compatible financial search and replay core.
- Node CSV parser and file adapters for the bank registry and bank-specific FD product catalogue.
- Root data catalogue populated from archived bank and FD CSV datasets.
- Node CLI supports Greedy, Absolute and GAML, prints search diagnostics for optimizer strategies, and writes a standalone HTML report.
- Unit tests for search primitives, search drivers, strategy execution, future-inflow decisions, GAML settings, CLI integration and account-level eFD eligibility.

## Not yet equivalent to the Python application

- Full Python-vs-JavaScript golden fixture parity across the archived scenarios, payout types, AIT, transfer fees, multi-account cases and strict/deferred/best-effort outflows.
- Performance benchmarking of Absolute on the largest archived scenarios and GAML default settings against the Python baseline.
- Full legacy console formatter parity, XIRR and complete decision-log generation.
- Python report-template port is implemented in JavaScript, including the eight-section dark layout, embedded styling and chart interactions; detailed content parity and visual regression against Python-generated reports still require validation.
- Browser application, browser strategy configuration UI, browser parity tests and GitHub Pages deployment.
- Python CLI parity for strategy comparison, plotting and all ancillary CLI options.

The strategy ports are implemented and the automated Node test suite is passing on the migration branch, but they are not yet financially certified against Python golden outputs. Do not merge to `main` or deploy until that parity and performance validation is complete.
