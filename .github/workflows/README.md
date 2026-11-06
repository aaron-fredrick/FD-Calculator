# GitHub Actions workflow map

The browser application and documentation have independent build and publication pipelines. The documentation workflow owns the benchmark data required by its pages. Benchmark results are generated inside each workflow run, passed to the docs build as short-lived workflow artifacts, and are not committed to the repository or published through data branches/PRs.

| Workflow | Trigger | Responsibility |
|---|---|---|
| `tests.yml` | Push/PR to `main` | Install locked Node.js dependencies, run the complete test suite and syntax-check source, scripts and tests. |
| `docs.yml` | Documentation pull requests | Build VitePress and verify generated documentation layout before merge. |
| `web-pages.yml` | Relevant web/runtime/data pushes to `main`, or manual dispatch | Build only the browser application and publish its independent Pages artifact. It does not wait for benchmark generation. |
| `docs-pages.yml` | Every push to `main`, or manual dispatch | Run the Scoped Range and Absolute R+ page benchmarks independently, validate both datasets, build the docs with those run-local results, and publish the docs component. |
| `pages.yml` | Called by the web or docs producer | Assemble the latest web and docs component artifacts and deploy the complete GitHub Pages site. It has no push or workflow_run trigger. |
| `strategy-sensitivity.yml` | Relevant source/data/script pushes to feature or chore branches, relevant PRs to `main`, or manual dispatch | Run Scoped Range strategy and Absolute R+ parameter benchmarks for development and PR validation on non-main refs. Main-branch benchmark ownership belongs to `docs-pages.yml`. |
| `goal-achievement-sensitivity.yml` | Relevant source/data/script pushes to feature or chore branches, or manual dispatch | Run the separate Goal development benchmark suite. |
| `codeql.yml` | Push/PR to `main`, weekly schedule, or manual dispatch | Run extended CodeQL analysis. |
| `dependency-review.yml` | Pull requests to `main` | Reject dependency changes with high-severity vulnerabilities. |

## Page-specific benchmark execution

Every push to `main` starts two independent benchmark jobs:

1. **Scoped Range page** — runs `scripts/strategy-sensitivity.js`, validates 324 observations across 108 scenarios, and uploads `results.json` as a one-day workflow artifact.
2. **Absolute R+ page** — runs `scripts/gaml-sensitivity.js`, validates all 15 parameter observations, and uploads `gaml-search-results.json` as a one-day workflow artifact.

The docs build waits for both jobs, downloads those exact run artifacts into `docs/strategies/benchmarks/`, runs the combined dataset validator, and builds VitePress. The generated JSON is present in the build workspace and in the resulting static documentation output, but it is not committed back to `main`, pushed to a timestamped data branch, or used to create a data PR. Each push gets its own workflow run and its own generated datasets; the build cannot accidentally consume data from a different run.

A failed benchmark, validation or docs build does not publish a new docs component. The existing deployed docs artifact remains available.

## Component publication

- The web producer writes only to `pages-web-artifact`; the docs producer writes only to `pages-docs-artifact`.
- Each component has its own non-cancelling publication concurrency group. One component cannot overwrite the other.
- For initial migration or a missing component artifact, the assembler can seed a fallback branch for either component from the source SHA of the last successful Pages deployment. Both baselines preserve the currently published site; the docs baseline is not treated as fresh benchmark output. Validated `pages-web-artifact` and `pages-docs-artifact` branches always take precedence over their respective baselines.
- The reusable Pages workflow fetches the latest actual artifacts or their preserved baselines and assembles one complete site. It records the deployed web/docs commit pair on `pages-deploy-state`, so a second producer run with no newer component revisions skips a duplicate deployment. GitHub Pages deployment remains atomic at the whole-site level, but component builds and publication are independent.
- If neither an actual artifact nor a safe baseline exists for a component, the assembler skips deployment and leaves the current live site untouched.
- Artifact branch pushes use the workflow token and are followed by an explicit reusable-workflow call. The design does not depend on a GITHUB_TOKEN push triggering another workflow.

## Trigger and concurrency rules

- The docs benchmark workflow runs on every main push. The Scoped Range and Absolute R+ jobs are separate and can execute independently; the docs build requires both to succeed.
- The web producer watches only web/runtime dependencies. It does not run for docs-only benchmark output changes.
- Docs benchmark JSON is transient run output. There is no automated data PR, data branch, main-branch JSON commit, or second docs dispatch after a data merge.
- Feature/chore branches and PRs retain the standalone `strategy-sensitivity.yml` workflow for development validation. Goal development benchmarks remain separate.
- Component publishers have separate concurrency groups. Pages deployments share a non-cancelling concurrency group and always assemble the latest heads of both component branches.
- A stale docs build is prevented from replacing a newer docs component when documentation or benchmark inputs change before publication.

## Change routing

Keep path filters aligned with actual runtime dependencies:

- Web UI, shared simulation code, strategies, schemas and bank/product data rebuild the web component.
- Every push to main runs the docs benchmark workflow, so a relevant source or data change is measured by both page-specific benchmark jobs before docs publication.
- Benchmark result JSON is generated in the workflow workspace and is not a source dependency for the web producer.
- Documentation-only edits also receive fresh page benchmark data on the next main push, as requested.
