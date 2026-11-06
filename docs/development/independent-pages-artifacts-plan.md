# Independent Pages Artifact and Run-Local Benchmark Plan

## Objective

Keep the calculator web application and documentation build/deployment independent. On every push to `main`, each benchmark-backed documentation page runs its own benchmark, and the docs build consumes the generated data from that exact workflow run. Benchmark result JSON is not committed back to the repository or published through data branches/PRs.

## Target architecture

1. **Web producer** (`web-pages.yml`): watches web UI, shared runtime, strategy, schema and bank-data dependencies. It builds only the web component and publishes it to `pages-web-artifact`. It does not wait for documentation benchmarks.
2. **Scoped Range page benchmark**: a dedicated job in `docs-pages.yml` runs `scripts/strategy-sensitivity.js`, validates 324 observations across 108 scenario points, and uploads the generated `results.json` as a short-lived workflow artifact.
3. **Absolute R+ page benchmark**: a separate job runs `scripts/gaml-sensitivity.js`, validates the 15 parameter observations, and uploads `gaml-search-results.json` as a short-lived workflow artifact.
4. **Docs build**: waits for both benchmark jobs, downloads both outputs into `docs/strategies/benchmarks/`, runs the combined dataset validator, and builds VitePress. The JSON exists in the build workspace and is included in the static docs output, but is never committed or pushed to a data branch.
5. **Docs producer**: publishes only the completed docs component to `pages-docs-artifact`. If either benchmark, validation or the docs build fails, it does not update the docs artifact; the previously deployed docs remain live.
6. **Component artifact branches**: web and docs publishers update only their own branch. Each has a separate non-cancelling publication concurrency group.
7. **Reusable Pages assembler** (`pages.yml`): fetches the latest web and docs component branches or safe preserved baselines, assembles one complete site, validates its entry points and performs one atomic GitHub Pages deployment. It records the deployed component SHA pair and skips duplicate deployments.
8. **Preserved baselines**: when an actual component artifact is missing during migration, the assembler can seed either baseline from the source SHA of the last successful Pages deployment. These baselines preserve currently live content; they are not benchmark outputs.
9. **No bypass or data PR**: source `main` remains protected. The docs pipeline needs no pull-request write permission and does not create, merge or dispatch a timestamped data PR.

## Trigger and execution rules

- `docs-pages.yml` runs on every push to `main` and on manual dispatch.
- The Scoped Range and Absolute R+ page benchmark jobs are independent. The docs build requires both to succeed.
- Each benchmark artifact is scoped to its workflow run and retained for one day. The build downloads artifacts from that same run; it cannot reuse results from another branch, run or commit.
- The generated JSON is not committed to `main`, published to a timestamped data branch, or used to create a PR.
- The web producer remains path-filtered to web/runtime dependencies and is not triggered by docs benchmark outputs.
- The standalone strategy workflow remains available for feature/chore branch and PR validation; it must not duplicate the main docs-owned benchmark.
- Each main push has its own concurrency key. Component publication and Pages deployment retain separate non-cancelling concurrency controls.
- Before publishing docs, compare the source revision with current `main` for docs and benchmark dependencies. If those dependencies advanced, do not publish a stale build.
- A failed benchmark or docs build leaves the prior docs artifact and live site untouched.

## Why the docs build is a single downstream job

The two pages have different benchmark workloads and produce separate data files. VitePress still builds one coherent documentation component, so the benchmark jobs remain independent while the final docs build waits for both outputs. This prevents either page from publishing a partial docs tree over the other page.

GitHub Pages itself publishes a complete site atomically. The independent component artifacts allow the web app to update without waiting for docs, and docs to update without rebuilding the web app.

## Implementation phases

1. Map web/docs build dependencies and record the current combined deployment behavior.
2. Add isolated web and docs build scripts.
3. Split Scoped Range and Absolute R+ into independent page-specific benchmark jobs.
4. Pass generated JSON between jobs as short-lived run artifacts; remove fingerprint-based main reuse and timestamped data-PR publication from the docs path.
5. Build VitePress only after both benchmark outputs pass validation; publish docs independently.
6. Assemble latest web/docs components in the reusable Pages workflow.
7. Add workflow-contract tests and verify CI.

## Acceptance criteria

- Every push to main runs the Scoped Range benchmark and the Absolute R+ benchmark independently.
- The docs build consumes outputs from those exact two jobs in that exact run.
- The complete dataset validator runs before VitePress build.
- No benchmark result JSON is committed, pushed to a data branch, or submitted in a PR.
- No workflow attempts to create/approve a PR using GITHUB_TOKEN.
- A failed benchmark/build cannot replace previously deployed docs.
- The web producer does not wait for benchmark execution.
- Every Pages deployment assembles both latest components and validates the complete site.
- No main-branch protection bypass is introduced.

## Delivery status

- [x] Independent web and docs producers.
- [x] Separate Scoped Range and Absolute R+ benchmark jobs.
- [x] Run-local benchmark artifacts with one-day retention.
- [x] Docs build restores and validates both datasets before building.
- [x] Removed main docs workflow's timestamped data-PR creation/merge/dispatch path.
- [x] Reusable Pages assembler and independent component artifacts.
- [x] Workflow contract tests updated for the run-local benchmark architecture.
- [x] CI verification on the final PR head (Node.js 22 tests, syntax checks, web/docs build smoke tests, workflow YAML parsing, docs PR build, Dependency Review and CodeQL).
- [ ] Post-merge production verification of both benchmark jobs, docs artifact publication and Pages deployment.
