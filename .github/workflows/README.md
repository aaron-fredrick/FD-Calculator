# GitHub Actions workflow map

The workflows are separated by responsibility. The browser application and documentation have independent build and publication pipelines. Documentation owns its benchmark readiness check and, when necessary, benchmark generation.

| Workflow | Trigger | Responsibility |
|---|---|---|
| `tests.yml` | Push/PR to `main` | Install locked Node.js dependencies, run the complete test suite and syntax-check source, scripts and tests. |
| `docs.yml` | Documentation pull requests | Build VitePress and verify generated documentation layout before merge. |
| `web-pages.yml` | Relevant web/runtime/data pushes to `main`, or manual dispatch | Build only the browser application and publish its independent Pages artifact. It does not wait for benchmark generation. |
| `docs-pages.yml` | Documentation, benchmark-input or benchmark-result changes on `main`, or manual dispatch | Check the benchmark fingerprint and dataset completeness; run Scoped Range and Absolute R+ benchmarks only when required; build and publish docs only after data validation. |
| `pages.yml` | Called by the web or docs producer | Assemble the latest web and docs component artifacts and deploy the complete GitHub Pages site. It has no push or workflow_run trigger. |
| `strategy-sensitivity.yml` | Relevant source/data/script pushes to feature or chore branches, relevant PRs to `main`, or manual dispatch | Run Scoped Range strategy and Absolute R+ parameter benchmarks for development and PR validation. Main-branch benchmark ownership belongs to `docs-pages.yml`. |
| `goal-achievement-sensitivity.yml` | Relevant source/data/script pushes to feature or chore branches, or manual dispatch | Run the separate Goal development benchmark suite. |
| `codeql.yml` | Push/PR to `main`, weekly schedule, or manual dispatch | Run extended CodeQL analysis. |
| `dependency-review.yml` | Pull requests to `main` | Reject dependency changes with high-severity vulnerabilities. |

## Component publication

- The web producer writes only to `pages-web-artifact`.
- The documentation producer writes only to `pages-docs-artifact`.
- Each component has its own non-cancelling publication concurrency group. One component cannot overwrite the other.
- The reusable Pages workflow fetches both latest artifact branches and assembles one complete site. GitHub Pages deployment remains atomic at the whole-site level, but component builds and publication are independent.
- If either artifact branch is not yet available, the assembler skips deployment and leaves the current live site untouched.
- Artifact branch pushes use the workflow token and are followed by an explicit reusable-workflow call. The design does not depend on a GITHUB_TOKEN push triggering another workflow.

## Benchmark ownership and reuse

The documentation producer owns main-branch Scoped Range benchmark readiness:

1. It calculates the input fingerprint and validates the published dataset structure and scenario coverage.
2. If both are current, it skips simulations and builds docs from the committed JSON.
3. If inputs differ or the dataset is incomplete, it runs the Scoped Range matrix and Absolute R+ parameter sensitivity, validates the results, and updates the fingerprint.
4. Generated data is published through a timestamped `data-YYYY-MM-DD-HH-MM-SS-LKT` branch and PR. The workflow waits for PR checks and confirms the merge before building documentation.
5. If benchmark execution, validation, PR checks, or publication fails, the docs artifact branch is not updated and the previously deployed docs remain live.

A data-only benchmark PR merge triggers the docs producer because the result JSON and fingerprint paths are watched. The fingerprint and completeness checks pass, so it rebuilds docs without rerunning simulations. It does not trigger the web producer or a second main-branch benchmark workflow.

Feature/chore branches and PRs retain the standalone `strategy-sensitivity.yml` workflow for development validation. Goal development benchmarks remain separate.

## Change routing

Keep path filters aligned with actual runtime dependencies:

- Web UI, shared simulation code, strategies, schemas and bank/product data rebuild the web component.
- Documentation sources and benchmark result files rebuild the docs component.
- Simulation engine, strategy, FD-option, bank/product data and benchmark runner changes also invalidate the Scoped Range fingerprint; the docs producer runs the benchmark before publishing updated docs.
- Benchmark result JSON is not a web dependency.
- Documentation-only edits and chart presentation changes do not invalidate financial simulations when the committed benchmark fingerprint and dataset remain valid.
