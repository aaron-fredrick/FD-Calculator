#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:?Usage: scripts/build-docs-site.sh <output-directory>}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="$(mkdir -p "$output_dir" && cd "$output_dir" && pwd)"

cd "$root_dir"
node scripts/validate-scoped-benchmark-data.js

npm install --no-save --package-lock=false vitepress@2.0.0-alpha.21
npm exec -- vitepress build docs
cp src/brand/favicon.svg site/docs/favicon.svg

if [ "${FD_CAL_PREVIEW:-false}" != "true" ]; then
python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET

site = Path("site")
namespace = "http://www.sitemaps.org/schemas/sitemap/0.9"
ET.register_namespace("", namespace)
docs_sitemap = site / "docs" / "sitemap.xml"
sitemap = ET.parse(docs_sitemap).getroot()
existing = {node.text for node in sitemap.findall(f"{{{namespace}}}url/{{{namespace}}}loc")}
for url in (
    "https://aaron-fredrick.github.io/FD-Calculator/",
    "https://aaron-fredrick.github.io/FD-Calculator/web/",
):
    if url not in existing:
        item = ET.SubElement(sitemap, f"{{{namespace}}}url")
        ET.SubElement(item, f"{{{namespace}}}loc").text = url
ET.ElementTree(sitemap).write(site / "sitemap.xml", encoding="utf-8", xml_declaration=True)
PY
fi

rm -rf "$output_dir"/*
mkdir -p "$output_dir/docs"
cp -R site/docs/. "$output_dir/docs/"
if [ "${FD_CAL_PREVIEW:-false}" != "true" ]; then
  cp site/sitemap.xml "$output_dir/sitemap.xml"
else
  rm -f "$output_dir/docs/sitemap.xml"
fi
test -s "$output_dir/docs/index.html"
if [ "${FD_CAL_PREVIEW:-false}" != "true" ]; then test -s "$output_dir/sitemap.xml"; fi
