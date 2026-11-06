# Independent Pages Artifact Pipeline Plan

## Objective

Decouple the calculator web application from documentation benchmark generation and publication. A failure or long-running benchmark in one component must not block the other component from publishing. Existing live content must remain available until a complete replacement component is ready.

## Current failure mode

- `pages.yml` builds the web app and VitePress documentation as one site.
- Its push gate suppresses the entire deployment when benchmark-sensitive inputs change, so the web app waits for documentation benchmarks.
- Its `workflow_run` trigger accepts an overall successful benchmark workflow even when the `sensitivity` job was skipped. This can deploy stale benchmark JSON.
- A data-only benchmark PR merge can cause another broad Pages build, while the original workflow_run path may also deploy.
- GitHub Pages publishes one complete site artifact; it cannot safely replace only one directory without assembling the other current component too.

## Target architecture

Use two independent, durable component artifact branches and one reusable Pages assembler.

1. **Web producer** (`web-pages.yml`): watches web UI, shared runtime, strategy, schema and bank-data dependencies. It builds only the web component and publishes it to `pages-web-artifact`. Benchmark result JSON is not a web dependency and does not trigger this producer.
2. **Documentation producer** (`docs-pages.yml`): watches documentation sources, benchmark inputs and generated benchmark result files. It first checks the current input fingerprint and strict dataset completeness. If either is stale/incomplete, it runs the Scoped Range and Absolute R+ benchmark suites itself, validates the outputs, and publishes them through a timestamped `data-YYYY-MM-DD-HH-MM-SS-LKT` branch and PR. It requests a normal PR merge and verifies that the PR actually merged before building docs; it never bypasses repository rules. If repository policy requires approval or checks that a token-created PR cannot start automatically, the run stops and leaves the PR for normal review. After a manual merge, the data-only docs path rebuilds without rerunning simulations. If the fingerprint and dataset are already valid, it skips simulation and builds docs directly from committed data.
3. **Component artifact branches**: web and docs publishers update only their own branch (`pages-web-artifact` or `pages-docs-artifact`). Each has its own non-cancelling publication concurrency group. A web update cannot overwrite docs and a docs update cannot overwrite web.
4. **Reusable Pages assembler** (`pages.yml`): called after either component is published. It fetches the latest heads of both artifact branches, assembles one complete site, validates required entry points, then performs one atomic GitHub Pages deployment. It has no push or workflow_run trigger of its own.
5. **Failure isolation**: a failed web build never updates the web artifact branch; a failed benchmark or docs build never updates the docs artifact branch. The currently deployed site remains untouched. If only one artifact branch exists during initial setup, deployment is skipped until both components are available.
6. **No bypass required**: source `main` remains protected. Workflow tokens write only the generated component branches and timestamped benchmark-data branches; no branch-protection bypass is introduced.

## Trigger and duplicate-run rules

- Main-branch Scoped Range benchmark ownership moves to the documentation pipeline. The standalone strategy workflow remains available for feature/chore branches and PR validation, but no longer starts a second benchmark run on main.
- Benchmark execution is conditional on either a fingerprint mismatch or failed dataset-completeness validation. A data-only benchmark PR merge has a matching fingerprint and complete dataset, so it rebuilds docs without rerunning simulations.
- Benchmark input changes trigger both relevant producers: the web producer builds the calculator independently, while the docs producer owns the benchmark and documentation lifecycle.
- A benchmark data-only merge triggers the docs producer only. It does not trigger the web producer or the main strategy benchmark workflow.
- Component artifact branches are not producer triggers. Artifact pushes are followed by an explicit reusable workflow call, avoiding reliance on GITHUB_TOKEN push events to trigger another workflow.
- Component publishers have separate concurrency groups. Pages deployments share a non-cancelling concurrency group and always assemble the latest heads of both component branches. If an older pending deploy is superseded, the newer deploy still includes both already-published components.

## Implementation phases

1. Record the existing combined workflow and map the real web/docs dependencies.
2. Add isolated, repeatable web and docs build scripts plus strict benchmark-data validation.
3. Move main benchmark ownership into the docs producer; preserve feature/chore and PR benchmark validation.
4. Add separate web/docs artifact publishers and a reusable full-site Pages assembler.
5. Remove the old combined push/workflow_run deployment path; update workflow documentation and add static workflow-contract tests.
6. Verify workflow triggers, permissions, artifact isolation, benchmark gating, CI and deployment behavior. A live deployment is not claimed until the PR is merged and both component artifact branches are populated.

## Acceptance criteria

- Web source changes build and publish the web component without waiting for documentation benchmarks.
- Docs benchmark-input changes cannot publish docs unless the benchmark completes, passes strict completeness validation and its input fingerprint matches the latest main branch.
- Existing docs remain deployed if a docs benchmark or build fails; existing web remains deployed if a web build fails.
- A data-only benchmark PR merge rebuilds docs from committed data without rerunning simulations.
- A data-only merge cannot trigger a duplicate main benchmark or web build.
- Component artifact branches are independently updated and cannot overwrite each other.
- Every Pages deployment assembles both latest components and validates the site before atomic publication.
- No source-main protection bypass is introduced.
