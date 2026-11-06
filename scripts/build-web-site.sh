#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:?Usage: scripts/build-web-site.sh <output-directory>}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="$(mkdir -p "$output_dir" && cd "$output_dir" && pwd)"

cd "$root_dir"
rm -rf "$output_dir"/*
mkdir -p "$output_dir/web" "$output_dir/brand" "$output_dir/core" "$output_dir/fd-options" \
  "$output_dir/strategies" "$output_dir/io" "$output_dir/reporting"

cp -R src/web/. "$output_dir/web/"
cp -R src/brand/. "$output_dir/brand/"
cp -R src/core/. "$output_dir/core/"
cp -R src/fd-options/. "$output_dir/fd-options/"
cp -R src/strategies/. "$output_dir/strategies/"
cp src/io/csv.js "$output_dir/io/csv.js"
cp -R src/reporting/. "$output_dir/reporting/"
cp -R data "$output_dir/data"
cp -R schema "$output_dir/schema"
cp src/brand/favicon.svg "$output_dir/favicon.svg"
cp src/brand/og-image.svg "$output_dir/og-image.svg"
cp robots.txt "$output_dir/robots.txt"
cp README.md CONTRIBUTING.md "$output_dir/"

cat > "$output_dir/index.html" <<'EOF'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#0b0e13">
  <meta name="description" content="FD Cal is a Sri Lankan fixed-deposit portfolio optimiser. Compare bank products, model cash flows and evaluate investment strategies.">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="https://aaron-fredrick.github.io/FD-Calculator/web/">
  <link rel="icon" type="image/svg+xml" href="./favicon.svg">
  <meta http-equiv="refresh" content="0; url=./web/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="FD Cal">
  <meta property="og:title" content="FD Cal — Fixed Deposit Portfolio Optimiser">
  <meta property="og:description" content="Plan and compare Sri Lankan bank fixed deposits with a multi-strategy portfolio simulator.">
  <meta property="og:url" content="https://aaron-fredrick.github.io/FD-Calculator/">
  <meta property="og:image" content="https://aaron-fredrick.github.io/FD-Calculator/og-image.svg">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="https://aaron-fredrick.github.io/FD-Calculator/og-image.svg">
  <title>FD Cal — Fixed Deposit Portfolio Optimiser</title>
</head>
<body>
  <p>Opening <a href="./web/">FD Cal</a>…</p>
  <script>window.location.replace("./web/");</script>
</body>
</html>
EOF

test -s "$output_dir/web/index.html"
test -s "$output_dir/index.html"
