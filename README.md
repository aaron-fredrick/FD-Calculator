# FD Calculator

A JavaScript-first fixed-deposit optimization tool. The legacy Python implementation is preserved under [archive/](archive/).

## Issues, support and security

See [the issue and label workflow guide](docs/ISSUES.md) for users and contributors. It explains which issue form to use, automatic labels, the maintainer review lifecycle, and how public support tickets work.

For security vulnerabilities, read the [security policy](SECURITY.md) and use [GitHub private vulnerability reporting](https://github.com/aaron-fredrick/FD-Calculator/security/advisories/new). Do not disclose vulnerabilities in public issues or support tickets.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, tests, financial-engine invariants, secure coding requirements, and pull request expectations. Dependabot, CodeQL, and dependency review are configured under `.github/`.

## Source layout

All application code lives under `src/`:

- `src/core/` — shared financial domain, configuration, dates, events and results.
- `src/strategies/` — Absolute, Absolute+, Greedy, GSS and shared search algorithms.
- `src/io/` — CSV parsing and Node-side data loading.
- `src/reporting/` — shared console and standalone HTML reporting.
- `src/cli/` — Node.js command-line entry point.
- `src/web/` — browser application source.

The root-level `data/`, `schema/`, `tests/` and `docs/` directories remain separate from application code. The legacy implementation under `archive/` is preserved unchanged.

## Strategies

See [the strategy guide](docs/STRATEGIES.md) for Absolute, Absolute+, Greedy and GSS, their planning methods, and strategy settings.

## Migration status

Copy `config.json.example` to `config.json` and edit it for your scenario. The root `config.json` is intentionally ignored because it contains local financial data; the example remains tracked.

The repository is being migrated to one shared, environment-neutral JavaScript calculation engine consumed by:

- **Node.js CLI:** development, regression testing, diagnostics, and all strategies including Absolute.
- **GitHub Pages web app:** interactive scenario configuration and execution of Absolute+, Greedy and GSS. Absolute is deliberately CLI-only for internal verification and testing.

Both frontends must call the same strategy, simulation, and report-generation modules. They must emit equivalent result data and the same standalone HTML report format.

## Legacy source

The complete tracked source tree from the migration baseline is retained at [archive/](archive/). This includes Python modules, tests, configuration, bank and FD-rate datasets, documentation, examples, and lockfiles.

## Migration policy

Do not remove or rewrite legacy behaviour until the equivalent JavaScript implementation has regression coverage. See [MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md).
