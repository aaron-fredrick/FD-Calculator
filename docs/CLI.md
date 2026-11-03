# JavaScript CLI

## Current support

The Node CLI currently supports the Greedy strategy. GAML and Absolute remain unavailable in JavaScript and fail explicitly; they are not silently substituted with Greedy.

## Run

From the repository root:

\`\`\`powershell
npm install
npm test
npm run cli -- --config .\config.json --strategy greedy
\`\`\`

If the configuration already selects Greedy, omit --strategy:

\`\`\`powershell
npm run cli -- --config .\config.json
\`\`\`

Help:

\`\`\`powershell
npm run cli -- --help
\`\`\`

The CLI reads the JSON configuration, resolves the bank registry and bank-specific FD product CSVs from root data/, validates the configuration, runs the shared JavaScript Greedy strategy, prints a console event timeline and booking summary, and writes a standalone HTML report to report_output_file (relative paths resolve against the configuration file directory).

The root data/ directory is copied from the archived catalogue. Do not edit archive/ to update live catalogue data; update root data/ and review the corresponding source/effective-date notes.

## Known differences from the Python CLI

- Only Greedy is implemented in JavaScript.
- No Greedy-vs-selected-strategy comparison.
- No Absolute/GAML diagnostics or optimization metrics.
- No matplotlib chart generation.
- Console output is a functional initial formatter, not byte-for-byte Python output.
- The HTML report is a basic offline report with the eight section anchors and event/booking tables. It does not yet reproduce the Python report's execution decision cards, interactive charts, XIRR, account/FD principal history, or detailed styling.

Do not treat JavaScript output as financially validated until golden parity fixtures have been run against the archived Python implementation.
