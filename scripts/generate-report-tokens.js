import { readFileSync, writeFileSync } from "node:fs";

const sourcePath = new URL("../src/brand/tokens.css", import.meta.url);
const outputPath = new URL("../src/brand/report-tokens.js", import.meta.url);
const source = readFileSync(sourcePath, "utf8");
const root = source.match(/:root\s*\{[\s\S]*?\}/)?.[0];
if (!root) throw new Error("Could not find the canonical :root token block in src/brand/tokens.css.");

const generated = "// Generated from src/brand/tokens.css by scripts/generate-report-tokens.js.\nexport const REPORT_BRAND_TOKENS = " + JSON.stringify(root) + ";\n";
if (process.argv.includes("--check")) {
  let existing = "";
  try { existing = readFileSync(outputPath, "utf8"); } catch { /* missing generated file is a drift */ }
  if (existing !== generated) {
    console.error("Report brand tokens are stale. Run npm run build:report-tokens and commit the generated file.");
    process.exitCode = 1;
  } else {
    console.log("Embedded report tokens match src/brand/tokens.css.");
  }
} else {
  writeFileSync(outputPath, generated);
  console.log("Generated src/brand/report-tokens.js from src/brand/tokens.css.");
}
