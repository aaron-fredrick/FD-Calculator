import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

test("Pages deployment is a reusable assembler, not a source-change trigger", () => {
  const pages = read(".github/workflows/pages.yml");
  assert.match(pages, /workflow_call:/);
  assert.doesNotMatch(pages, /^\s+push:/m);
  assert.doesNotMatch(pages, /workflow_run:/);
  assert.match(pages, /pages-web-artifact/);
  assert.match(pages, /pages-docs-artifact/);
  assert.match(pages, /pages-web-baseline/);
  assert.match(pages, /pages-docs-baseline/);
  assert.match(pages, /listDeployments/);
  assert.match(pages, /build-docs-preservation\.sh/);
  assert.match(pages, /pages-deploy-state/);
  assert.match(pages, /previous_web_sha/);
  assert.match(pages, /Both component revisions are already deployed/);
  assert.match(pages, /site\/web\/index\.html/);
  assert.match(pages, /site\/docs\/index\.html/);
  assert.match(pages, /cancel-in-progress: false/);
});

test("web producer is isolated from documentation benchmark outputs", () => {
  const web = read(".github/workflows/web-pages.yml");
  assert.match(web, /scripts\/build-web-site\.sh/);
  assert.match(web, /pages-web-artifact/);
  assert.match(web, /uses: \.\/\.github\/workflows\/pages\.yml/);
  assert.doesNotMatch(web, /strategy-sensitivity\.js|gaml-sensitivity\.js|docs\/strategies\/benchmarks/);
  assert.match(web, /group: pages-artifact-web/);
  assert.match(web, /Web dependencies changed after this artifact was built/);
});

test("each benchmark-backed docs page runs its own benchmark on every main push", () => {
  const docs = read(".github/workflows/docs-pages.yml");
  assert.match(docs, /^  push:\n    branches: \[main\]/m);
  assert.match(docs, /group: docs-benchmark-\$\{\{ github\.sha \}\}/);
  assert.match(docs, /scoped-range-benchmark:/);
  assert.match(docs, /name: Scoped Range page benchmark/);
  assert.match(docs, /node scripts\/strategy-sensitivity\.js/);
  assert.match(docs, /scoped-range-benchmark-data/);
  assert.match(docs, /absolute-r-plus-benchmark:/);
  assert.match(docs, /name: Absolute R\+ page benchmark/);
  assert.match(docs, /node scripts\/gaml-sensitivity\.js/);
  assert.match(docs, /absolute-r-plus-benchmark-data/);
  assert.match(docs, /retention-days: 1/);
  assert.match(docs, /needs: \[scoped-range-benchmark, absolute-r-plus-benchmark\]/);
  assert.match(docs, /actions\/download-artifact@v6/);
  assert.match(docs, /node scripts\/validate-scoped-benchmark-data\.js/);
  assert.match(docs, /bash scripts\/build-docs-site\.sh/);
  assert.match(docs, /pages-docs-artifact/);
  assert.match(docs, /uses: \.\/\.github\/workflows\/pages\.yml/);
  assert.match(docs, /main advanced from \$SOURCE_SHA to \$latest_main_sha/);
  assert.doesNotMatch(docs, /benchmark-fingerprint\.js|gh pr create|gh pr merge|pull-requests: write|blocked_by_data_pr|dispatch_docs/);
  assert.doesNotMatch(docs, /git add docs\/strategies\/benchmarks/);
});

test("main strategy workflow cannot duplicate the docs-owned benchmark", () => {
  const strategy = read(".github/workflows/strategy-sensitivity.yml");
  const pushBlock = strategy.split("  pull_request:")[0];
  assert.doesNotMatch(pushBlock, /branches: \[main/);
  assert.match(pushBlock, /feature\/\*\*/);
  assert.match(pushBlock, /chore\/\*\*/);
  assert.match(strategy, /github\.ref != 'refs\/heads\/main'/);
});

test("component build scripts consume generated data without fingerprint publication", () => {
  const pages = read(".github/workflows/pages.yml");
  const preservation = read("scripts/build-docs-preservation.sh");
  const web = read("scripts/build-web-site.sh");
  const docs = read("scripts/build-docs-site.sh");
  const validator = read("scripts/validate-scoped-benchmark-data.js");
  assert.match(pages, /build-docs-preservation\.sh/);
  assert.match(web, /src\/web/);
  assert.match(web, /src\/strategies/);
  assert.match(docs, /validate-scoped-benchmark-data\.js/);
  assert.doesNotMatch(docs, /benchmark-fingerprint\.js/);
  assert.match(docs, /site\/docs/);
  assert.match(validator, /324/);
  assert.match(validator, /108/);
  assert.match(validator, /15 Absolute R\+ parameter observations/);
  assert.match(preservation, /last successful/);
  assert.doesNotMatch(preservation, /validate-scoped-benchmark-data/);
});


test("dev preview publishes web and docs independently and remains path-isolated", () => {
  const pages = read(".github/workflows/pages.yml");
  const web = read(".github/workflows/dev-web-pages.yml");
  const docs = read(".github/workflows/dev-docs-pages.yml");

  assert.match(pages, /dev_pages-preview-artifact/);
  assert.match(pages, /dev_pages-web-artifact/);
  assert.match(pages, /dev_pages-docs-artifact/);
  assert.match(pages, /mkdir -p site\/dev/);
  assert.match(pages, /dev_pages-deploy-state/);
  assert.match(pages, /site\/dev\/web\/index\.html/);
  assert.match(pages, /site\/dev\/docs\/index\.html/);

  assert.match(web, /branches: \[dev\]/);
  assert.match(web, /FD_CAL_PREVIEW: "true"/);
  assert.match(web, /name: dev_web-site/);
  assert.match(web, /dev_pages-web-artifact/);
  assert.match(web, /noindex,nofollow/);
  assert.doesNotMatch(web, /strategy-sensitivity\.js|gaml-sensitivity\.js|docs\/strategies\/benchmarks/);

  assert.match(docs, /branches: \[dev\]/);
  assert.match(docs, /FD_CAL_PREVIEW: "true"/);
  assert.match(docs, /dev_scoped-range-benchmark-data/);
  assert.match(docs, /dev_absolute-r-plus-benchmark-data/);
  assert.match(docs, /name: dev_docs-site/);
  assert.match(docs, /dev_pages-docs-artifact/);
  assert.match(docs, /noindex,nofollow/);
  assert.match(docs, /dev-preview-artifact-publish/);

  assert.match(web, /dev-preview-artifact-publish/);
  assert.match(web, /Refresh the combined dev preview compatibility artifact/);
  assert.match(docs, /Refresh the combined dev preview compatibility artifact/);
  assert.doesNotMatch(web, /needs\.publish\.outputs\.published/);
  assert.doesNotMatch(docs, /needs\.publish\.outputs\.published/);
});


test("production sitemap includes canonical app routes and excludes preview output", () => {
  const docs = read("scripts/build-docs-site.sh");
  const robots = read("robots.txt");

  assert.match(docs, /FD_CAL_PREVIEW:-false.*!=.*true/);
  assert.match(docs, /https:\/\/aaron-fredrick\.github\.io\/FD-Calculator\//);
  assert.match(docs, /https:\/\/aaron-fredrick\.github\.io\/FD-Calculator\/web\//);
  assert.match(docs, /cp site\/sitemap\.xml/);
  assert.match(docs, /rm -f "\$output_dir\/docs\/sitemap\.xml"/);
  assert.match(robots, /^Allow: \/$/m);
  assert.doesNotMatch(robots, /^Disallow: \/FD-Calculator\/dev\/$/m);
  assert.match(robots, /^Sitemap: https:\/\/aaron-fredrick\.github\.io\/FD-Calculator\/sitemap\.xml$/m);
});
