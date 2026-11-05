# Codebase map

This page describes the main runtime boundaries and responsibilities of the shared modules. It is a navigation aid, not a substitute for the implementation.

## Repository layout

| Path | Responsibility |
|---|---|
| `src/core/` | Shared financial domain, configuration, dates, events, simulation and result models. |
| `src/strategies/` | Investment decision strategies and shared search algorithms. |
| `src/fd-options/` | FD option discovery, eligibility and manager-owned candidate ordering. |
| `src/io/` | CSV parsing and Node-side data loading. |
| `src/reporting/` | Shared console formatting and standalone HTML report generation. |
| `src/cli/` | Node.js command-line entry point. |
| `src/web/` | Browser application and interactive scenario configuration. |
| `data/` | Bank and FD product datasets shared by both runtimes. |
| `schema/` | Configuration schema and validation contract. |
| `tests/` | Engine, CLI and browser-facing regression tests. |
| `docs/` | User, strategy, architecture and contributor documentation. |
| `archive/` | Preserved legacy Python project snapshot. |

## Runtime boundaries

The Node.js CLI and GitHub Pages web application use the same JavaScript calculation engine. Environment-specific work belongs in adapters: core and strategy modules should not depend on the DOM, Node-only APIs or environment-specific file access.

The web application exposes Greedy, GAML and GSS. Absolute remains CLI-only for internal verification and testing.

## Simulation lifecycle

The simulation engine owns the shared timeline, event processing and final event finalisation. Strategies make investment decisions against simulation state; they do not own simulation-wide event finalisation. Consolidation is performed by the simulation lifecycle after strategy execution, rather than by individual strategies.

## Strategy boundary

Strategies decide what to book and when to make an investment decision. They consume the common account, FD, cash-flow, transfer-fee, AIT and simulation models.

- **Greedy** makes local decisions from currently available options.
- **GAML** explores a bounded set of promising candidate states.
- **GSS** recursively seeks goal options and evaluates SPLIT and CONSOLIDATE plans.
- **Absolute** performs exhaustive branch-and-bound search when run through the CLI.

See [the strategy guide](../STRATEGIES.md) for decision details.

## FD option manager

FDOptionManager is the shared boundary for FD candidate discovery and ordering. It supplies the eligible candidate list for the relevant account and horizon. Strategies should consume that order rather than duplicating eligibility or rate/tenor ranking rules.

GSS uses manager-provided candidates and evaluates their viability. It does not independently reorder them by rate or tenor.

## Shared modules

### Core engine

Owns financial domain models, simulation state, event scheduling and lifecycle finalisation. Keep it runtime-neutral so CLI and browser calculations remain equivalent.

### Reporting

The reporting modules generate the common report model and standalone HTML output. The CLI and browser frontends should use the same reporting implementation.

### I/O

I/O adapters load and parse external data. Keep filesystem-specific operations outside the shared calculation engine.

### Web application

The web frontend configures scenarios, invokes the shared engine and presents the resulting report. It should not contain a second implementation of financial or strategy logic.

## Related references

- [Strategy guide](../STRATEGIES.md)
- [GSS technical reference](../strategies/GSS.md)
- [Migration plan](../MIGRATION_PLAN.md)
- [Contributing guide](../../CONTRIBUTING.md)
- [Repository README](../../README.md)
