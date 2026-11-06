# GitHub Actions workflow map

The workflows are split by responsibility. Keep expensive simulation benchmarks out of ordinary documentation and test builds.

| Workflow | Trigger | Responsibility |
|---|---|---|
| `tests.yml` | Push/PR to `main` | Install the locked Node.js dependencies, run the complete test suite and syntax-check source, scripts and tests. |
| `docs.yml` | Documentation pull requests | Build VitePress and verify the generated documentation layout before merge. |
| `pages.yml` | Relevant pushes to `main`, or manual dispatch | Assemble the web app and documentation once, then deploy the combined GitHub Pages site. |
| `strategy-sensitivity.yml` | Relevant source/data/script pushes to feature or chore branches, or manual dispatch | Run Scoped Range strategy and Absolute R+ parameter benchmarks when their inputs change. |
| `goal-achievement-sensitivity.yml` | Relevant source/data/script pushes to feature or chore branches, or manual dispatch | Run the separate Goal development benchmark suite. |
| `codeql.yml` | Push/PR to `main`, weekly schedule, or manual dispatch | Run extended CodeQL analysis. |
| `dependency-review.yml` | Pull requests to `main` | Reject dependency changes with high-severity vulnerabilities. |

## Benchmark reuse

The Scoped Range and Goal benchmark workflows each calculate a SHA-256 fingerprint over the simulation code, benchmark runner and bank/product data that affect their results.

- If the fingerprint matches the committed manifest and every expected result file exists, the workflow skips all simulation and chart-data generation.
- If any relevant input changes, or a required result is missing, the workflow reruns the benchmark and updates its manifest and result files on the working branch.
- Documentation-only edits and Vue chart presentation changes do not invalidate simulation results.
- Generated benchmark outputs are committed only to the feature/chore branch. They are not silently published to `main`.
- A manual dispatch uses the same cache check. To force a fresh run without changing financial inputs, remove the corresponding `.input-fingerprint.json` manifest from the working branch before dispatching.

The benchmark charts in VitePress are interactive Vue/SVG components. They read the committed JSON results, use the active VitePress light/dark theme tokens, and do not regenerate financial simulations during a documentation build.

## Change routing

When adding or changing a workflow, update this map and keep path filters aligned with actual inputs. A change to the simulation engine, strategies, FD-option manager, bank data, product data or benchmark runner must invalidate the relevant benchmark fingerprint. A change limited to Markdown, CSS or chart interaction must rebuild the docs but must not rerun the financial simulations.
