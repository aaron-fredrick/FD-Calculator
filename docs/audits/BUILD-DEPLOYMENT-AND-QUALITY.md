# Build, deployment and quality audit

## DEPLOY-01 — Dev web/docs publishing and `/dev/` assembly

**Current status: COMPLETED for the active `dev` delivery path in PR #80.** Dev web and documentation are published independently to `dev_pages-web-artifact` and `dev_pages-docs-artifact`; the dev Pages assembler composes them beneath `site/dev/`. The user confirmed that the merged preview works. Main-branch integration is intentionally deferred until work moves to `main`; it is not a blocker for the current dev workflow.

**Severity:** P2 (historical deployment-isolation concern; current dev acceptance is met).

**Evidence:** [dev pages assembler](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/.github/workflows/pages.yml), [dev web publisher](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/.github/workflows/dev-web-pages.yml), [dev docs publisher](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/.github/workflows/dev-docs-pages.yml).

**Current controls:**
- Independent dev web/docs publishing avoids making web changes wait for benchmark generation.
- The assembler extracts dev components beneath `site/dev/` and asserts the root, web and docs entry points exist.
- Dev output uses the `/FD-Calculator/dev/` base, noindex metadata and a visible preview banner.
- Persistent dev artifact/state refs use the `dev_` prefix.
- The Pages deployment concurrency group serializes site deployments.
- The root `robots.txt` permits crawling so search engines can read the preview pages' `noindex,nofollow` directives; preview URLs remain excluded from the production sitemap.

**Deferred follow-up:** when work moves to `main`, port and verify the preview-aware assembler there so a main deployment also retains the latest dev subtree. Do not change or block the current dev pipeline for that future task.

## Crawler and sitemap controls — verified positive control

**Current status: IMPLEMENTED on `dev`; no open SEO-01 finding.** The production docs build starts with the VitePress documentation sitemap, merges the canonical site root and `/web/` application URL into it, and publishes the assembled file at the site root. The preview build skips sitemap assembly and removes any docs sitemap from its output. The root `robots.txt` permits crawling and declares the production sitemap; dev preview HTML carries `noindex,nofollow` and preview URLs are excluded from the sitemap. The dev web build rewrites canonical URLs and sets `noindex,nofollow`; VitePress preview metadata also sets noindex.

**Evidence:** [docs build script](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/scripts/build-docs-site.sh), [VitePress config](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/docs/.vitepress/config.mts), [robots.txt](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/robots.txt), [dev web build](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/scripts/build-web-site.sh).

**Regression protection:** the Pages pipeline contract test now asserts that production sitemap assembly includes the canonical root and `/web/` URLs, that preview output removes its docs sitemap, and that the root robots policy excludes the dev subtree.

Robots directives are crawler guidance, not access control. Preserve the existing production sitemap merge and preview noindex behaviour when changing build paths.

## Build pipeline assessment

### Strengths

- Web and documentation are produced as separate artifacts, which avoids making a web-only change wait for the documentation benchmark pipeline.
- The docs workflow generates benchmark data, validates expected scenario counts/parameter sweeps and then builds the docs component.
- The Pages assembler composes independently published web/docs artifacts and tracks their SHAs to avoid redundant deployments.
- The dev workflow uses `FD_CAL_PREVIEW=true`, a dedicated `dev_pages-preview-artifact` branch, noindex metadata and a visible preview banner.
- The preview output is path-prefixed so relative web assets and docs base URLs resolve under `/FD-Calculator/dev/`.
- The preview workflow uses short-lived Actions artifacts named `dev-web-site` and `dev-docs-site`; persistent Git branches are prefixed `dev_`.

### Verification still required

The current `dev` source revision contains the split publisher and assembler. The user confirmed the merged preview is working. The earlier in-progress deployment note has been superseded and is not current status.

After deployment, verify these paths:
- `/FD-Calculator/dev/`
- `/FD-Calculator/dev/web/`
- `/FD-Calculator/dev/docs/`

Check that each page uses noindex metadata, all relative assets/data/worker requests stay under the dev path, the app displays the dev banner, and the production root still serves the main artifacts.

## QA-01 — The automated suite is strong on Node contracts but lacks browser-level coverage

**Current status: IMPLEMENTED ON FOLLOW-UP BRANCH; LATEST CI NOT GREEN.** A Playwright Chromium smoke suite runs in the shared test workflow for pushes to `dev`/`main` and PRs targeting those branches. Five of six browser tests pass: app startup/privacy preferences, legal navigation, dev-preview noindex/path prefix, mobile content overflow, and keyboard focus/reduced-motion. The standalone-report test currently fails its print-width assertion: the long-label stress table measured 433px against a 321px emulated viewport. A print CSS correction is committed and awaits rerun. Broader screen-reader, contrast and 200–400% zoom QA remains.

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

- The Node.js test/syntax workflow passed on audited `dev` commit `caccaf26b4415ae783959e888ff45e33becdadf6` ([run 42553842534](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42553842534)); the independent dev web build/publish also passed ([run 42553842533](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42553842533)). The docs/benchmark publishing workflow was in progress when checked ([run 42553842591](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42553842591)).
- No manual screen-reader/WCAG review, Lighthouse run, deployed CSP/header scan or external dependency/security scan was completed during this source review. The latest CI failure is tracked in the implementation plan.
- `npm ci` reports no installed dependencies beyond the project itself; VitePress is installed separately by the documentation build script without updating the lockfile. This is reproducible only to the extent that the VitePress version is pinned by the script.
- Action references use version tags rather than immutable commit SHAs. Consider SHA pinning for higher supply-chain assurance, with automated update tooling.
- Benchmark validation checks expected observation counts and parameter sweeps; it does not independently validate every bank-rate source or the financial correctness of each observation.

## Operational recommendations

1. Keep the preview and production deployments serialized.
2. Preserve the previous successful production artifact if a component build fails.
3. Preserve the verified crawler controls: keep preview pages out of production sitemaps, keep the dev preview crawlable so crawlers can read `noindex,nofollow`, and exclude preview URLs from the production sitemap.
4. Add a smoke test for generated URLs and worker/module loading under the project subpath.
5. Defer porting the preview-aware Pages assembler to `main` until main-branch work begins; the current delivery target is `dev`.
6. Add a concise deployment runbook documenting how to inspect/roll back web, docs and dev artifact refs.
