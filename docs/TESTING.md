# Testing the JavaScript migration

Run from the repository root with Node.js 22 or newer:

```sh
npm test
```

This runs every test under `tests/js` using Node's built-in test runner. The same suite runs in GitHub Actions on pushes and pull requests to the migration branch and main.

To run the CLI entrypoint:

```sh
npm run cli
```

**Current limitation:** the CLI entrypoint is still a migration placeholder and exits with status 2. It is not a working calculator yet. Do not use it for financial calculations.

The browser page is also a placeholder. The implemented core modules can be imported directly from Node or a browser module environment, but no end-to-end calculation flow is wired up yet.

## What the current tests cover

- Date parsing, calendar month arithmetic and leap-year interest.
- FD account/product model basics and eFD eligibility.
- Transfer fee rules.
- Gross FD payout schedules and AIT calculations.
- Cash schedule expansion and configuration validation.
- Event/booking/result accounting primitives.
- Outflow policy helper behavior.
- The contract that Absolute remains unavailable in the web strategy surface.

## What passing tests do not prove

A green unit-test suite does not establish parity with the archived Python calculator. No full simulator, optimization strategy, HTML report, CLI, or browser workflow has been ported yet. Those require dedicated Python-vs-JavaScript golden fixtures and end-to-end parity tests before the migration is safe to use.
