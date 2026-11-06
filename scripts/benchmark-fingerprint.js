import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const collect = directory => {
  const absolute = resolve(root, directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(absolute, entry.name);
    return entry.isDirectory()
      ? collect(relative(root, path))
      : [relative(root, path).replaceAll("\\\\", "/")];
  });
};
const files = [
  ...collect("src/core"),
  ...collect("src/strategies"),
  ...collect("src/fd-options"),
  ...collect("data/banks"),
  ...collect("data/fd_options"),
  "src/io/csv.js",
  "scripts/strategy-sensitivity.js",
  "scripts/benchmark-fingerprint.js", "scripts/gaml-sensitivity.js"
].sort();
const hash = createHash("sha256");
for (const path of files) {
  hash.update(path);
  hash.update("\\0");
  hash.update(readFileSync(resolve(root, path)));
  hash.update("\\0");
}
const manifest = {
  algorithm: "sha256",
  fingerprint: hash.digest("hex"),
  files
};
const manifestPath = resolve(root, "docs/strategies/benchmarks/.input-fingerprint.json");
const resultsPath = resolve(root, "docs/strategies/benchmarks/results.json");
const searchResultsPath = resolve(root, "docs/strategies/benchmarks/gaml-search-results.json");
const mode = process.argv[2] ?? "--check";

if (mode === "--write") {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\\n");
  process.stdout.write(manifest.fingerprint + "\\n");
} else if (mode === "--fingerprint") {
  process.stdout.write(manifest.fingerprint + "\\n");
} else if (mode === "--check") {
  const current = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  const outputsExist = existsSync(resultsPath) && existsSync(searchResultsPath);
  process.stdout.write(current?.fingerprint === manifest.fingerprint && outputsExist ? "false\\n" : "true\\n");
} else {
  throw new Error("Usage: node scripts/benchmark-fingerprint.js [--check|--fingerprint|--write]");
}
