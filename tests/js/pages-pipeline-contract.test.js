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

test("documentation producer owns benchmark readiness and publication", () => {
  const docs = read(".github/workflows/docs-pages.yml");
  assert.match(docs, /scripts\/benchmark-fingerprint\.js/);
  assert.match(docs, /scripts\/validate-scoped-benchmark-data\.js/);
  assert.match(docs, /remote_data_valid/);
  assert.match(docs, /reusing it instead of overwriting newer data/);
  assert.match(docs, /scripts\/strategy-sensitivity\.js/);
  assert.match(docs, /scripts\/gaml-sensitivity\.js/);
  assert.match(docs, /always\(\) && needs\.prepare\.result/);
  assert.match(docs, /docs\/strategies\/benchmarks\/results\.json/);
  assert.match(docs, /TZ=Asia\/Colombo/);
  assert.match(docs, /publish_branch="data-/);
  assert.match(docs, /merged_at=/);
  assert.match(docs, /refusing to build or publish documentation/);
  assert.match(docs, /gh pr merge/);
  assert.match(docs, /gh workflow run docs-pages\.yml --ref main/);
  assert.match(docs, /dispatch_docs=true/);
  assert.match(docs, /pages-docs-artifact/);
  assert.match(docs, /uses: \.\/\.github\/workflows\/pages\.yml/);
  assert.match(docs, /Documentation or benchmark inputs changed after this artifact was built/);
  assert.doesNotMatch(docs, /data\/\*\*/);
});

test("main strategy workflow cannot duplicate the docs-owned benchmark", () => {
  const strategy = read(".github/workflows/strategy-sensitivity.yml");
  const pushBlock = strategy.split("  pull_request:")[0];
  assert.doesNotMatch(pushBlock, /branches: \[main/);
  assert.match(pushBlock, /feature\/\*\*/);
  assert.match(pushBlock, /chore\/\*\*/);
  assert.match(strategy, /github\.ref != 'refs\/heads\/main'/);
});

test("component build scripts validate and stage separate output roots", () => {
  const pages = read(".github/workflows/pages.yml");
  const preservation = read("scripts/build-docs-preservation.sh");
  const web = read("scripts/build-web-site.sh");
  const docs = read("scripts/build-docs-site.sh");
  const validator = read("scripts/validate-scoped-benchmark-data.js");
  assert.match(pages, /build-docs-preservation\.sh/);
  assert.match(web, /src\/web/);
  assert.match(web, /src\/strategies/);
  assert.match(docs, /validate-scoped-benchmark-data\.js/);
  assert.match(docs, /benchmark-fingerprint\.js --check/);
  assert.match(docs, /site\/docs/);
  assert.match(validator, /324/);
  assert.match(validator, /108/);
  assert.match(validator, /15 Absolute R\+ parameter observations/);
  assert.match(preservation, /last successful/);
  assert.doesNotMatch(preservation, /validate-scoped-benchmark-data/);
});
