# Build, deployment and quality audit

## DEPLOY-01 — The dev preview and production share one GitHub Pages deployment

**Current status: PARTIAL in PR #80.** Dev web/docs publishing is now independent, and the `dev` Pages assembler composes the two dev components under `/dev/`. However, the current `main` `.github/workflows/pages.yml` still assembles only production web/docs artifacts and does not extract the dev preview. A production deployment from `main` can therefore still remove `/dev/` until the preview-aware assembler is ported and tested on `main`.

**Severity: P2**

**Evidence:** GitHub Pages project hosting publishes one site tree at the project root. The new dev workflow publishes a separate branch `dev_pages-preview-artifact`, and the dev version of [pages.yml](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/.github/workflows/pages.yml) assembles that tree under `site/dev/` alongside the production web/docs artifact branches.

**Impact:** the path is isolated in the deployed file tree, but it is not a separate Pages environment or independent deployment target. A dev deployment re-deploys the complete assembled site. More importantly, the current **main** version of `pages.yml` does not include the dev artifact. After the preview-aware workflow deploys, a later production deployment using the old main assembler can remove `/dev/`.

**Recommendation:**
1. Keep the dev artifact/state branches separate and prefixed `dev_`.
2. Preserve the shared Pages deployment concurrency group to avoid production/dev deploy races.
3. Merge the preview-aware assembler to main before relying on the preview path long-term, or move preview hosting to a genuinely separate host/environment.
4. Add a deployment contract test proving that a main deployment includes the current dev preview artifact when one exists and leaves the production root component SHAs unchanged.
5. Verify that the dev artifact contains root-level preview files before extracting it into `site/dev/`.

## Build pipeline assessment

### Strengths

- Web and documentation are produced as separate artifacts, which avoids making a web-only change wait for the documentation benchmark pipeline.
- The docs workflow generates benchmark data, validates expected scenario counts/parameter sweeps and then builds the docs component.
- The Pages assembler composes independently published web/docs artifacts and tracks their SHAs to avoid redundant deployments.
- The dev workflow uses `FD_CAL_PREVIEW=true`, a dedicated `dev_pages-preview-artifact` branch, noindex metadata and a visible preview banner.
- The preview output is path-prefixed so relative web assets and docs base URLs resolve under `/FD-Calculator/dev/`.
- The preview workflow uses short-lived Actions artifacts named `dev-web-site` and `dev-docs-site`; persistent Git branches are prefixed `dev_`.

### Verification still required

The dev-preview build/deploy run for the audited source revision is still in progress ([run 42509949422](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42509949422)). Earlier attempts exposed three pipeline defects that have been corrected on `dev`: preview metadata was not injected because of shell-variable escaping; the workflow expressions were escaped incorrectly; and the artifact upload searched a runner-temp path that was not found, so build outputs now live under the workspace. Do not call the preview live until the current run publishes `dev_pages-preview-artifact` and the Pages deployment succeeds.

After deployment, verify these paths:
- `/FD-Calculator/dev/`
- `/FD-Calculator/dev/web/`
- `/FD-Calculator/dev/docs/`

Check that each page uses noindex metadata, all relative assets/data/worker requests stay under the dev path, the app displays the dev banner, and the production root still serves the main artifacts.

## QA-01 — The automated suite is strong on Node contracts but lacks browser-level coverage

**Current status: DEFERRED — owner decision required.** The latest Node/build/workflow suite passes, but there is still no Playwright/Cypress/WebDriver browser suite or screenshot/visual-regression runner. Decide whether to add a small smoke suite or retain manual browser QA.

**Evidence:** the repository contains tests for configuration, dates/foundations, cash-flow components, account provenance, runtime/ledger, strategy parity, search, worker contracts, report output, motion guidelines and Pages workflow contracts. The workflow runs `npm test`, syntax checks and static build checks.

**Gap:** no Playwright/Cypress/WebDriver browser suite or screenshot/visual-regression runner was identified. Static source assertions do not verify rendered layout, keyboard focus order, screen-reader announcements, chart rendering, file import/export or actual GitHub Pages subpath behaviour.

**Recommendation:** add a small browser smoke suite for:
- Load catalogue and render initial form.
- Import/export valid and malicious JSON.
- Run one deterministic simulation and download/open the standalone report.
- Check no console errors and no failed same-origin requests.
- Exercise 320px/mobile and desktop layouts.
- Verify keyboard-only operation, validation error announcements and reduced motion.
- Open the dev preview at the deployed subpath to catch base-path and worker/data URL regressions.

## CI and release quality

- The Node test workflow was successful at the immediately preceding dev source revision `2781bd3`; the audited revision `358fbef` changed only workflow expression escaping and requires its own run result.
- No manual browser QA, Lighthouse run, WCAG audit, CSP/header scan or external dependency/security scan was completed during this source review.
- `npm ci` reports no installed dependencies beyond the project itself; VitePress is installed separately by the documentation build script without updating the lockfile. This is reproducible only to the extent that the VitePress version is pinned by the script.
- Action references use version tags rather than immutable commit SHAs. Consider SHA pinning for higher supply-chain assurance, with automated update tooling.
- Benchmark validation checks expected observation counts and parameter sweeps; it does not independently validate every bank-rate source or the financial correctness of each observation.

## Operational recommendations

1. Keep the preview and production deployments serialized.
2. Preserve the previous successful production artifact if a component build fails.
3. Keep preview pages out of production sitemaps and set noindex on every preview HTML entry point.
4. Add a smoke test for generated URLs and worker/module loading under the project subpath.
5. Merge the preview-aware Pages assembler to main before treating /dev as durable.
6. Add a concise deployment runbook documenting how to inspect/roll back web, docs and dev artifact refs.
