# FD Cal

FD Cal is a fixed-deposit portfolio simulator for Sri Lankan bank products. It models deposit eligibility, interest, AIT withholding, transfer fees, cash flows and maturity events to compare investment strategies over a selected planning horizon.

**Live application:** [FD Cal web app](https://aaron-fredrick.github.io/FD-Calculator/web/)  
**Documentation:** [Project and strategy documentation](https://aaron-fredrick.github.io/FD-Calculator/docs/)  
**Development preview:** [Dev preview](https://aaron-fredrick.github.io/FD-Calculator/dev/) — built from the **dev** branch; not production.

> FD Cal is a planning and comparison tool, not a bank, financial adviser or tax adviser. It does not open deposits or execute transfers. Confirm current product terms, rates, fees and eligibility with the relevant bank before acting.

## What it does

- Models fixed-deposit products and bank/account constraints from the repository catalogue.
- Plans investments across account balances, new inflows and scheduled outflows.
- Accounts for deposit tenor, interest calculation, AIT assumptions and transfer fees.
- Compares Greedy, Absolute R+, and GSS in the browser; the Node.js CLI also supports Absolute R.
- Runs browser calculations in a Web Worker to keep the interface responsive.
- Produces a standalone HTML report with portfolio results, charts, cash movements and the event ledger.

The browser and CLI use the same JavaScript financial engine and strategy implementations. Runtime-specific code belongs in the web and CLI adapters, not in duplicate calculation paths.

## Applications and availability

| Surface | Purpose | Strategies |
|---|---|---|
| Web app | Configure a scenario and inspect a result | Greedy, Absolute R+, GSS |
| Node.js CLI | Run scenarios, diagnostics and regression workflows | Greedy, Absolute R+, GSS, Absolute R |
| Documentation | Explain the domain, strategies, architecture and benchmark methodology | — |

## Repository map

~~~text
src/
  core/          Financial domain, dates, events, simulation lifecycle and results
  fd-options/    FD candidate eligibility, filtering and ordering
  strategies/    Strategy sessions and shared search algorithms
  reporting/     Console and standalone HTML reporting
  io/            CSV parsing and Node-side data loading
  cli/           Node.js command-line adapter
  web/           Browser UI, worker protocol and worker runner
data/            Bank, account and FD product catalogue
schema/          Configuration schema
tests/           Automated regression and contract tests
scripts/         Builds, benchmarks, validation and token generation
docs/            VitePress documentation and reference material
archive/         Preserved legacy Python implementation
~~~

The **archive/** tree is retained for historical reference and migration comparison. It is not part of the active JavaScript runtime.

## Getting started

### Requirements

- Node.js 22 or newer.
- npm.
- A modern browser with ES modules and Web Worker support for the web app.

### Install and test

~~~bash
npm ci
npm test
npm run check:report-tokens
~~~

### Run the CLI

Copy **config.json.example** to **config.json**, then edit the local scenario configuration:

~~~bash
cp config.json.example config.json
npm run cli
~~~

The local **config.json** is ignored by Git because it may contain personal financial scenario data.

### Run the web app locally

Serve the repository root with a local static HTTP server, then open **/src/web/**. Do not open the HTML file directly: the application loads ES modules, catalogue files and a module worker, which require an HTTP origin.

For example:

~~~bash
npx http-server . -p 8080
~~~

Open **http://localhost:8080/src/web/**.

## Documentation

Start with the [documentation home](https://aaron-fredrick.github.io/FD-Calculator/docs/). Key topics include:

- [Project overview](docs/overview.md)
- [Strategy comparison](docs/STRATEGIES.md)
- [Simulation lifecycle](docs/SIMULATION-LIFECYCLE.md)
- [Codebase map](docs/reference/CODEBASE.md)
- [Migration plan](docs/MIGRATION_PLAN.md)
- [Contributor guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Development and deployment

- **main** is the production source branch.
- **dev** is the integration and preview branch.
- Feature and audit work should branch from **dev** when explicitly intended for the next development cycle.
- Pull requests are used to review changes; do not deploy directly from a feature branch.
- Production web and documentation components are built and published independently, then assembled into one GitHub Pages deployment.
- The dev preview is published under **/dev/** using separate **dev_*** artifact refs and noindex metadata. The production site remains at the root paths.
- The preview and production site share GitHub Pages' single site deployment. The Pages assembler therefore includes the dev subtree alongside the unchanged production components; it does not create a second Pages environment.

See [workflow documentation](.github/workflows/README.md) for build triggers, benchmarks, component publication and deployment behaviour.

## Financial and data assumptions

Rates and product conditions are catalogue inputs, not guarantees. Bank terms may change and may differ by branch, customer category, deposit amount, tenure, or channel. FD Cal surfaces configured assumptions; users remain responsible for checking the bank's current terms.

The application may use simplified assumptions for tax, fees, eligibility and timing. Read the relevant strategy and financial-model documentation before relying on a result. Never treat a simulated portfolio as an instruction to transact.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Changes to the financial engine should include regression tests for the affected invariants and representative edge cases. UI changes should be checked at desktop and mobile sizes and across meaningful loading, validation, error and result states.

For defects, use the [bug report form](https://github.com/aaron-fredrick/FD-Calculator/issues/new?template=bug_report.yml). For security issues, follow [SECURITY.md](SECURITY.md) and use private vulnerability reporting rather than a public issue.
