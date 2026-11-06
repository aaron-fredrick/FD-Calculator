# Independent Pages Artifact Pipeline Plan

## Objective

Decouple the calculator web application from documentation benchmark generation and publication. A failure in one producer must not prevent the other component from updating. Avoid duplicate benchmark runs and duplicate Pages deployments when benchmark data is merged.

## Current failure mode

- `pages.yml` builds the web app and VitePress documentation as one site.
- Its push gate suppresses the entire combined deployment when benchmark-sensitive inputs change, so the web app waits for benchmark completion.
- Its `workflow_run` trigger accepts an overall successful benchmark workflow even when the `sensitivity` job was skipped. This allowed Pages to deploy stale benchmark JSON.
- A data-only benchmark PR merge can trigger a second Pages run through the broad `docs/**` push filter, while the original workflow_run path may also deploy.
- GitHub Pages publishes one complete site artifact; independent deployments cannot safely replace only one directory without preserving the other directory.

## Target architecture

Use a durable, dedicated `pages-artifacts` branch as the component artifact store, with one serialized publisher and one Pages deployer.

1. **Web producer**: on relevant application-source changes, build only the web application and publish its output under `web/` on `pages-artifacts`.
2. **Documentation producer**: on documentation changes, build docs using the currently committed benchmark data and publish only `docs/`. On benchmark-input changes, run the benchmark first, validate the full dataset and fingerprint, then build and publish docs. A data-only merge must rebuild docs but must not rerun simulations.
3. **Artifact publisher**: serialize writes to `pages-artifacts`, update only the producer's directory, and preserve the other directory. This branch is not a source branch and must not trigger either producer.
4. **Pages deployer**: trigger only from successful updates to `pages-artifacts`; assemble the complete site from both stored directories and deploy once. Remove the old benchmark `workflow_run` deployment trigger and broad source push deployment path.
5. **Failure isolation**: if docs benchmark/build fails, no docs artifact is published and the prior docs remain. Web producer can still update `web/` and deployment assembles it with the last valid docs. The reverse applies to web build failures.
6. **No bypass required**: source `main` remains protected. The artifact branch is a narrowly scoped machine-output branch; grant only the workflow token the contents permission needed to update it. Do not weaken main protection or bypass benchmark validation.

## Trigger and duplicate-run rules

- Benchmark simulations run only from benchmark-input changes or explicit benchmark dispatch.
- A benchmark data-only merge changes generated result paths, not benchmark inputs, so it triggers documentation build but not benchmark simulation.
- A benchmark-input push suppresses the ordinary docs-only producer path and invokes the benchmark-aware documentation path once.
- Web producer watches only web/runtime dependencies; benchmark-result JSON changes do not rebuild the web artifact.
- Pages deployer watches only `pages-artifacts`; it has no `workflow_run` trigger and no direct `main` push trigger.
- Artifact publication uses a shared concurrency group with `cancel-in-progress: false` to prevent lost updates when web and docs finish together.
- Deployments use a separate non-cancelling concurrency group so a newer artifact update does not cancel a deployment halfway through. The deployer always assembles the latest artifact-branch head.

## Implementation phases

1. Add this plan and map all existing producer/deployer triggers and required source dependencies.
2. Add a reusable artifact-publication script/workflow step that updates one artifact subtree while preserving the other, with bounded retry/rebase handling.
3. Split the current combined Pages build into web and documentation producers. Keep benchmark generation and strict data validation in the documentation path only.
4. Add the artifact-branch Pages assembler/deployer and remove the current `workflow_run` and combined-main deployment path.
5. Update workflow documentation and add static workflow/contract tests for path routing, data-only merges, skipped benchmark jobs, serialization, and failure isolation.
6. Review every trigger and permissions boundary; verify CI and deployment workflow runs. Do not claim live Pages deployment until the PR is merged and the artifact branch has both component artifacts.

## Acceptance criteria

- Web source changes can publish/deploy the web app without running or waiting for benchmarks.
- Documentation benchmark-input changes cannot publish docs unless the benchmark completes and its dataset/fingerprint validation passes.
- Existing docs remain in the artifact store when a documentation build or benchmark fails.
- A data-only benchmark PR merge rebuilds docs from committed data without rerunning the benchmark.
- A data-only merge cannot trigger a duplicate benchmark or a direct Pages deployment.
- Concurrent web/docs artifact updates do not overwrite each other's directories.
- Pages deployment occurs only after artifact publication and always assembles both latest stored components.
- No source-main protection bypass is introduced.
