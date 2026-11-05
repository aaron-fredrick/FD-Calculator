# Getting started

FD Cal has two entry points: the browser application for interactive scenarios and the Node.js CLI for development, diagnostics and automated workflows.

## Use the web application

Open the [FD Cal web application](https://aaron-fredrick.github.io/FD-Calculator/web/). Configure the scenario inputs, choose a supported strategy and run the simulation. The report presents the resulting portfolio and event history.

The web application currently exposes **Greedy**, **GAML** and **GSS**. Absolute is intentionally CLI-only.

## Run locally

### Requirements

- Node.js 22 or newer
- npm

### Install and test

Clone the repository, then run:

```sh
npm ci
npm test
```

Run the CLI help:

```sh
npm run cli -- --help
```

### Configure a scenario

Copy the example configuration before editing it:

```sh
cp config.json.example config.json
```

The local `config.json` is ignored by Git because it may contain private financial information. Do not commit real account details or personal financial records.

## Choose a strategy

- **Greedy** — fast local decisions; useful as a baseline.
- **GAML** — bounded beam search over multiple promising plans.
- **GSS** — recursive goal-seeking with SPLIT and CONSOLIDATE evaluation.
- **Absolute** — exhaustive branch-and-bound search; CLI only.

Read the [strategy guide](/STRATEGIES) before comparing results. Strategy performance and outcomes depend on the supplied data, assumptions and simulation horizon.

## Data and assumptions

FD Cal uses its configured bank/product data and financial assumptions. Verify current rates, fees, eligibility and tax treatment with the relevant bank or authority before acting on a result. FD Cal is a planning tool, not financial or tax advice.
