#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadConfigurationFromFile } from "../src/io/data-loader.js";
import { validateConfiguration } from "../src/core/configuration.js";
import { GreedyStrategy } from "../src/core/strategies/greedy.js";
import { AbsoluteStrategy } from "../src/core/strategies/absolute.js";
import { GAMLStrategy } from "../src/core/strategies/gaml.js";
import { formatSimulation } from "../src/reporting/console.js";
import { generateHtmlReport } from "../src/reporting/html.js";

function parseArgs(argv) {
  const out = { config: "config.json", strategy: null, beam_width: undefined, max_local_branches: undefined, max_decisions: undefined, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--config" || arg === "-c") out.config = argv[++i];
    else if (arg === "--strategy" || arg === "-s") out.strategy = argv[++i];
    else if (arg === "--beam-width") out.beam_width = Number(argv[++i]);
    else if (arg === "--max-local-branches") out.max_local_branches = argv[++i] === "none" ? null : Number(argv[i]);
    else if (arg === "--max-decisions" || arg === "--state-cap") out.max_decisions = argv[++i] === "none" ? null : Number(argv[i]);
    else throw new Error("Unknown argument: " + arg);
  }
  return out;
}

function todayLocal() {
  const date = new Date();
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    console.log([
      "Usage: npm run cli -- [--config config.json] [--strategy greedy|gaml|absolute]",
      "GAML settings: --beam-width N --max-local-branches N|none --max-decisions N|none"
    ].join("\n"));
    return;
  }

  const loaded = await loadConfigurationFromFile(cli.config);
  const selected = String(cli.strategy || loaded.raw.strategy || "absolute").trim().toLowerCase();
  if (!["greedy", "gaml", "absolute"].includes(selected)) throw new Error("Unsupported strategy " + selected + "; use greedy, gaml or absolute.");

  const config = validateConfiguration(loaded.raw, {
    bankRegistry: loaded.bankRegistry, bankKeyById: loaded.bankKeyById,
    options: loaded.options, today: todayLocal()
  });
  config.options_path = loaded.optionsPath;
  config.source_path = loaded.resolvedConfig;

  const input = {
    options: config.options, start: config.start, end: config.end,
    inflow_schedule: config.inflow_schedule, accounts: config.accounts,
    inflow_account_id: config.accounts[0].id, fee_config: config.fee_config,
    consolidation_account_id: config.consolidation_account_id,
    outflow_schedule: config.outflow_schedule
  };

  let strategy;
  if (selected === "greedy") {
    strategy = new GreedyStrategy({
      compound: config.compound, actual_leap_year: config.actual_leap_year,
      ait_enabled: config.ait_enabled, ait_rate: config.ait_rate
    });
  } else if (selected === "absolute") {
    strategy = new AbsoluteStrategy({
      compound: config.compound, actual_leap_year: config.actual_leap_year,
      ait_enabled: config.ait_enabled, ait_rate: config.ait_rate
    });
  } else {
    const settings = { ...config.gaml_settings };
    for (const key of ["beam_width", "max_local_branches", "max_decisions"]) {
      if (cli[key] !== undefined) settings[key] = cli[key];
    }
    strategy = new GAMLStrategy({
      compound: config.compound, actual_leap_year: config.actual_leap_year,
      ait_enabled: config.ait_enabled, ait_rate: config.ait_rate,
      ...settings
    });
  }

  const result = strategy.simulate(input);
  if (!result.valid) throw new Error("The selected strategy cannot satisfy one or more strict outflows.");
  console.log(formatSimulation(result, config, loaded.resolvedConfig, loaded.optionsPath, {
    showEventTimeline: config.show_timeline, showBookingLedger: config.show_ledger
  }));
  if (result.search_diagnostics) {
    const d = result.search_diagnostics;
    console.log("\nSEARCH DIAGNOSTICS");
    console.log("Expanded states              : " + d.expanded_states.toLocaleString("en-US"));
    console.log("Terminal leaves              : " + d.leaves.toLocaleString("en-US"));
    console.log("Bound-pruned states          : " + d.bound_pruned.toLocaleString("en-US"));
    console.log("Memo-pruned states           : " + d.memo_pruned.toLocaleString("en-US"));
    if (selected === "gaml") {
      console.log("Beam-pruned states           : " + d.beam_pruned.toLocaleString("en-US"));
      console.log("Local-combination pruned     : " + d.local_combination_pruned.toLocaleString("en-US"));
      console.log("Root strategy diversity peak : " + d.root_strategy_peak.toLocaleString("en-US"));
      console.log("Optimality                   : " + (d.optimality_proven ? "proven" : "not proven"));
      console.log("GAML settings                : beam " + config.gaml_settings.beam_width +
        ", local width " + config.gaml_settings.max_local_branches +
        ", state cap " + (config.gaml_settings.max_decisions ?? "unlimited"));
    } else console.log("Optimality                   : proven (exhaustive branch-and-bound)");
  }

  const output = resolve(dirname(loaded.resolvedConfig), config.report_output_file);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, generateHtmlReport(result, config), "utf8");
  console.log("Report saved: " + output);
}

main().catch(error => {
  console.error("FD Calculator error: " + error.message);
  process.exitCode = 1;
});
