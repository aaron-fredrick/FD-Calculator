# Contributing

Thank you for considering a contribution to FD Calculator. This guide describes the expected workflow and the project-specific constraints contributors must preserve.

## Before opening a pull request

1. Read the [issue and label workflow](docs/ISSUES.md) and check for an existing issue.
2. For substantial changes, open or discuss an issue first so the intended behaviour can be agreed.
3. For security vulnerabilities, do not open a public issue or pull request. Follow [SECURITY.md](SECURITY.md) and use private vulnerability reporting.
4. Keep changes focused. Explain the problem, the approach, and any relevant trade-offs in the pull request.

## Development environment

- Node.js 22 or newer is required.
- The project uses native JavaScript ES modules and currently has no third-party npm runtime dependencies.
- Copy `config.json.example` to `config.json` for local CLI scenarios. The root `config.json` is intentionally ignored because it may contain private financial data.

Install from the lockfile and run the tests:

```sh
npm ci
npm test
```

Run the CLI with:

```sh
npm run cli -- --help
```

If a command or option differs in the current CLI, consult its help output and the project documentation rather than assuming flags.

## Financial-engine requirements

Changes to financial calculations require particular care:

- Keep `src/core/` and `src/strategies/` runtime-neutral. The CLI in `src/cli/` and browser app in `src/web/` must reuse them rather than implement separate calculation logic.
- Add or update regression tests for changed financial behaviour, including boundary dates, rounding, maturity, payouts, fees, AIT, and account eligibility where relevant.
- Preserve existing event-ledger ordering and accounting invariants.
- Do not silently change financial assumptions. Document the change and its effect.
- Do not present calculations as bank, tax, or investment advice.

## Data and security

- Never commit real bank account numbers, credentials, access tokens, private financial records, or personal data.
- Use synthetic or anonymised configuration examples and test fixtures.
- Treat imported JSON, CSV, and browser-stored configuration as untrusted input. Validate data at the relevant input boundary.
- Do not render user-controlled values as raw HTML. Prefer safe text APIs and context-appropriate output encoding.
- Do not log full user configurations or sensitive values.
- Do not add secrets to source files, workflow YAML, test fixtures, build output, or issue comments.
- Keep GitHub Actions permissions limited to the minimum required by each job. Do not expose write-capable tokens to untrusted pull-request code.
- Add third-party dependencies only when justified. Keep `package.json` and `package-lock.json` synchronised and explain the dependency's purpose.
- Never modify `archive/` unless a maintainer explicitly approves a specific archival change; it is retained as the legacy reference.

## Pull request checklist

Before requesting review:

- [ ] The change has a clear description and references the relevant issue, if one exists.
- [ ] `npm ci` completes successfully.
- [ ] `npm test` passes.
- [ ] Regression tests cover changed financial behaviour.
- [ ] Documentation and example configuration are updated where needed.
- [ ] No private financial data, credentials, or secrets are included.
- [ ] The change does not unintentionally modify `archive/`.
- [ ] Any new dependency is necessary, maintained, and reflected in the lockfile.

GitHub Actions may run tests, CodeQL analysis, and dependency review on pull requests. Resolve relevant failures and security findings before requesting final review.

## Review and merge

- Keep pull requests focused and reasonably small.
- Respond to review feedback and update tests when behaviour changes.
- Do not merge your own pull request unless the repository's maintainer process explicitly permits it.
- A pull request is not considered complete until the relevant checks pass and a maintainer merges it.
