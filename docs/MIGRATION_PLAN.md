# JavaScript migration plan

## Runtime contract

One shared JavaScript engine must run unchanged in Node.js and modern browsers. Keep calculation modules free of Node-only APIs, DOM access, and environment-dependent I/O. Adapters handle file loading, terminal output, browser interaction, and report delivery.

## Target layout

`src/` contains all application code:
- `src/core/`: financial domain models, validation, dates, interest, cash-flow accounting, events and results.
- `src/strategies/`: shared Greedy, GAML and Absolute strategies plus search algorithms.
- `src/reporting/`: console formatter and standalone HTML report generator.
- `src/io/`: CSV parsing and Node-side data loading.
- `src/cli/`: Node CLI. Supports Greedy, GAML and Absolute.
- `src/web/`: GitHub Pages browser application. Exposes Greedy and GAML only. Never expose Absolute in web controls, query parameters or browser strategy registry.
- `data/`: portable bank and FD product datasets shared by both runtimes.
- `schema/`: configuration JSON Schema.
- `tests/`: engine unit tests, CLI tests and browser-facing contract tests.
- `archive/`: immutable snapshot of the complete tracked Python project at migration baseline.

## Non-negotiable parity requirements

1. CLI and web invoke the same strategy and simulation modules; no duplicate strategy implementations.
2. Both generate the same canonical report model and use the same HTML report template/generator.
3. Preserve account-specific eFD eligibility, transfer channels/fees, AIT treatment, payout schedules, maturity accounting, event ordering, and all existing strategy semantics.
4. Preserve the eight-section report, chart interactions, per-event chart stages, bank FD-principal aggregation, and existing colour/line-style rules.
5. Preserve CLI diagnostic/printing patterns. Browser presentation may differ, but calculated values and event ordering must not.
6. Absolute is an internal verification strategy: CLI and automated tests only. It is not a user-selectable web strategy.
7. Use deterministic calculations and explicit numeric tolerances in parity tests. Do not silently round intermediate financial values.

## Migration sequence

- [x] Preserve complete tracked legacy tree under `archive/`.
- [ ] Port domain models and configuration validation.
- [ ] Port interest, AIT, transfer fees, and cash-flow accounting.
- [ ] Port simulator and deterministic event ledger.
- [ ] Port Greedy and establish Python-vs-JavaScript golden fixtures.
- [ ] Port GAML and validate diagnostics and objective parity.
- [ ] Port Absolute for CLI/internal testing only.
- [ ] Port canonical report model, console output, and standalone HTML report.
- [ ] Build interactive web configuration and results UI (Greedy/GAML only).
- [ ] Build CLI (Greedy/GAML/Absolute).
- [ ] Add Node CI, browser tests, and GitHub Pages deployment from `main`.
- [ ] Merge migration into `main` after regression and CLI/web report parity pass.
- [ ] Retire feature branches only after their changes are verified in the archived baseline and migration history.

## Branch and release safety

Perform structural refactors on a dedicated branch and merge through a reviewed pull request. Do not rewrite `main` history or modify `archive/`; keep the shared engine runtime-neutral and verify both CLI and Pages packaging after path changes.
