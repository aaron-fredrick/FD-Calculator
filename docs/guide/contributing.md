# Contributing

This guide summarises the contributor workflow and project-specific constraints. The canonical repository file remains [CONTRIBUTING.md](https://github.com/aaron-fredrick/FD-Calculator/blob/main/CONTRIBUTING.md).

## Before opening a pull request

1. Check the [issue and label workflow](/ISSUES) and look for an existing issue.
2. Discuss substantial behaviour changes before implementation.
3. Report security vulnerabilities privately using the [repository security policy](https://github.com/aaron-fredrick/FD-Calculator/blob/main/SECURITY.md).
4. Keep changes focused and document important trade-offs.

## Development environment

- Node.js 22 or newer.
- Native JavaScript ES modules.
- Install dependencies and run tests with `npm ci` and `npm test`.
- Copy `config.json.example` to `config.json` for local scenarios.

## Financial-engine requirements

- Keep `src/core/` and `src/strategies/` runtime-neutral.
- Reuse the shared calculation engine from both CLI and browser frontends.
- Add regression tests for changed financial behaviour, including boundary dates, rounding, maturity, payouts, fees, AIT and account eligibility where relevant.
- Preserve event-ledger ordering and accounting invariants.
- Document changes to financial assumptions and their effects.

## Data and security

- Never commit account numbers, credentials, access tokens or private financial records.
- Use synthetic or anonymised test fixtures.
- Treat imported JSON, CSV and browser-stored configuration as untrusted input.
- Do not render user-controlled values as raw HTML.
- Do not log full user configurations or sensitive values.
- Keep GitHub Actions permissions minimal and avoid exposing write-capable tokens to untrusted pull-request code.
- Keep dependencies justified and synchronise package manifests and lockfiles.
- Do not modify `archive/` without explicit maintainer approval.

## Pull request checklist

- [ ] The change has a clear description.
- [ ] `npm ci` completes.
- [ ] `npm test` passes.
- [ ] Regression tests cover changed financial behaviour.
- [ ] Documentation and examples are updated.
- [ ] No private financial data, credentials or secrets are included.
- [ ] No unintended changes to `archive/`.
- [ ] New dependencies are justified and locked.

GitHub Actions may run tests, CodeQL and dependency review. Resolve relevant failures and security findings before requesting final review.
