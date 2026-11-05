# Project overview

FD Cal is a fixed-deposit planning and simulation tool. It models bank FD products, account constraints, interest, AIT, transfer fees, cash flows and maturity events to compare investment plans over a configured horizon.

## Applications

| Application | Purpose | Available strategies |
|---|---|---|
| Web application | Configure scenarios and inspect interactive results | Greedy, GAML, GSS |
| Node.js CLI | Run scenarios, diagnostics and regression workflows | Greedy, GAML, GSS, Absolute |

Both applications use the same JavaScript calculation engine. The browser and CLI are runtime adapters; they must not implement separate financial or strategy logic.

## Main areas of the repository

- `src/core/` — financial domain, configuration, dates, events, simulation and result models.
- `src/strategies/` — investment decision strategies and shared search algorithms.
- `src/fd-options/` — FD candidate discovery, eligibility and ordering.
- `src/reporting/` — shared result formatting and standalone HTML reports.
- `src/io/` — CSV parsing and Node-side data loading.
- `src/web/` — browser application.
- `src/cli/` — command-line application.
- `data/` and `schema/` — bank/product data and configuration contract.
- `tests/` — automated regression and contract tests.

## Important boundaries

- Strategies make investment decisions; the simulation engine owns the overall event lifecycle and finalisation.
- FDOptionManager owns FD candidate eligibility and ordering. Strategies consume its ordered candidates.
- The final consolidation sweep belongs to the shared simulation lifecycle, not an individual strategy.
- The `archive/` directory preserves the legacy Python project and should not be changed during normal JavaScript development.

## Further reading

- [Getting started](/guide/getting-started)
- [Strategy comparison](/STRATEGIES)
- [Codebase map](/reference/CODEBASE)
- [Migration plan](/MIGRATION_PLAN)
- [Contributor guide](/guide/contributing)
