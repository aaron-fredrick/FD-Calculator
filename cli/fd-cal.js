#!/usr/bin/env node

// CLI entry point will be connected to the shared engine after the domain,
// simulation, and strategy ports are complete. Absolute remains CLI-only.
console.error('FD Calculator JavaScript migration is in progress. The legacy Python CLI is preserved under archive/.');
process.exitCode = 2;
