# FD Calculator

A JavaScript-first fixed-deposit optimization tool. The legacy Python implementation is preserved under [archive/](archive/).

## Issues and support

See [the issue and label workflow guide](docs/ISSUES.md) for users and contributors. It explains which issue form to use, automatic labels, the maintainer review lifecycle, and how public support tickets work.

## Strategies

See [the strategy guide](docs/STRATEGIES.md) for an explanation of Greedy, GAML and Absolute, how their search methods differ, and how to configure GAML.

## Migration status

Copy `config.json.example` to `config.json` and edit it for your scenario. The root `config.json` is intentionally ignored because it contains local financial data; the example remains tracked.

The repository is being migrated to one shared, environment-neutral JavaScript calculation engine consumed by:

- **Node.js CLI:** development, regression testing, diagnostics, and all strategies including Absolute.
- **GitHub Pages web app:** interactive scenario configuration and execution of supported public strategies (Greedy and GAML). Absolute is deliberately CLI-only for internal verification and testing.

Both frontends must call the same strategy, simulation, and report-generation modules. They must emit equivalent result data and the same standalone HTML report format.

## Legacy source

The complete tracked source tree from the migration baseline is retained at [archive/](archive/). This includes Python modules, tests, configuration, bank and FD-rate datasets, documentation, examples, and lockfiles.

## Migration policy

Do not remove or rewrite legacy behaviour until the equivalent JavaScript implementation has regression coverage. See [MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md).
