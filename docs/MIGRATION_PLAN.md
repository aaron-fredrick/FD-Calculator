# JavaScript migration plan

## Runtime contract

One shared JavaScript engine must run unchanged in Node.js and modern browsers. Keep calculation modules free of Node-only APIs, DOM access, and environment-dependent I/O. Adapters handle file loading, terminal output, browser interaction, and report delivery.

## Target layout

- `src/core/`: domain models, validation, configuration, interest, cash-flow accounting, simulation, optimization primitives.
- `src/strategies/`: shared strategy implementations: Greedy, GAML, Absolute.
- `src/reporting/`: canonical report model, decision log, console formatter, standalone HTML report generator.
- `src/io/`: environment-specific adapters; Node filesystem and browser file/download adapters remain outside the engine.
- `cli/`: Node CLI. Supports Greedy, GAML, and Absolute.
- `web/`: GitHub Pages application. Exposes Greedy and GAML only. Never expose Absolute in web controls, query parameters, or browser strategy registry.
- `data/`: portable bank and FD product datasets shared by both runtimes.
- `tests/`: engine unit tests, legacy parity fixtures, CLI tests, browser-facing contract tests.
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

Work on `migration/javascript-platform`. Do not overwrite `main` or delete feature branches during the port. The current migration branch starts from the latest `feature/cash-flows` commit so the archived baseline includes the latest account-chart and report changes.
