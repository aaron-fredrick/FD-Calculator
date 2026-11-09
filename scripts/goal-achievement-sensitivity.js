import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseCSV } from "../src/io/csv.js";
import { Account, FDOption, TransferFeeConfig } from "../src/core/models.js";
import { addPeriod, formatISODate, daysBetween } from "../src/core/dates.js";
import { SimulationEngine } from "../src/core/simulation.js";
import { GreedyStrategy } from "../src/strategies/greedy.js";
import { AbsolutePlusStrategy } from "../src/strategies/absolute-plus.js";
import { GSSStrategy } from "../src/strategies/gss.js";

const START = "2026-11-05";
const SAFETY_HORIZON_YEARS = 30;
const END = formatISODate(addPeriod(START, SAFETY_HORIZON_YEARS + "y"));
// Runs may terminate earlier when no future event can change the portfolio.
const BANK_IDS = ["LK_DFCC_BANK", "LK_COMMERCIAL_BANK_OF_CEYLON", "LK_NATIONAL_DEVELOPMENT_BANK"];
const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const banks = new Map(parseCSV(read("data/banks/banks.csv")).map(row => [row.id, row]));
const index = new Map(parseCSV(read("data/fd_options/fd_options.csv")).map(row => [row.bank_id, row]));
const optionsByBank = new Map();

for (const bankId of BANK_IDS) {
  const entry = index.get(bankId);
  if (!entry) throw new Error("Missing FD option index for " + bankId);
  const key = entry.bank_key.toLowerCase();
  const minimum = ({ dfcc: 10000, commercial: 25000, ndb: 25000 })[key] ?? 25000;
  const rows = parseCSV(read("data/fd_options/" + entry.options_file));
  const options = rows.map(row => new FDOption({
    label: row.name, period_str: row.period, annual_rate: Number(row.annual_rate),
    min_amount: row.min_amount ? Number(row.min_amount) : minimum,
    payout_type: row.payout_type || "cumulative", payout_period_str: row.payout_period || "",
    bank_key: key, bank_id: bankId, is_efd: String(row.eFD).toLowerCase() === "true"
  }));
  if (!options.length) throw new Error("No FD products for " + bankId);
  optionsByBank.set(bankId, options);
}
const options = [...optionsByBank.values()].flat();
const bankFees = Object.fromEntries(BANK_IDS.map(id => {
  const bank = banks.get(id);
  return [id.toUpperCase(), [Number(bank.intra_bank_transfer_fee || 0), Number(bank.domestic_inter_bank_transfer_fee || 25)]];
}));
const feeConfig = new TransferFeeConfig({ default_inter_bank_fee: 25, same_bank_fee: 0, bank_fees: bankFees });
const engine = new SimulationEngine();

function makeAccounts(count, capital, bankCount, efd) {
  const chosenBanks = BANK_IDS.slice(0, bankCount);
  const base = Math.floor(capital / count), remainder = capital - base * count;
  return Array.from({ length: count }, (_, i) => {
    const bankId = chosenBanks[i % chosenBanks.length], bank = banks.get(bankId);
    return new Account({
      id: "account_" + (i + 1), bank_id: bankId, bank_key: index.get(bankId).bank_key,
      label: bank.name + " account " + (i + 1), balance: base + (i === 0 ? remainder : 0),
      supports_efd: efd
    });
  });
}

function makeInflows(kind, accountId, end) {
  const schedule = {};
  const recurring = kind === "monthly_10k" ? ["1m", 10000] : kind === "quarterly_30k" ? ["3m", 30000] : null;
  if (recurring) {
    for (let i = 1; ; i++) {
      const date = formatISODate(addPeriod(START, recurring[0], i));
      if (date > end) break;
      schedule[date] = { [accountId]: recurring[1] };
    }
  } else if (kind === "lump_100k") {
    const date = formatISODate(addPeriod(START, "6m"));
    if (date <= end) schedule[date] = { [accountId]: 100000 };
  }
  return schedule;
}

const strategies = [
  ["Greedy", () => new GreedyStrategy({ ait_enabled: true })],
  ["Absolute+", () => new AbsolutePlusStrategy({
    ait_enabled: true, beam_width: 96, max_local_branches: 48, max_decisions: 5000
  })],
  ["GSS", () => new GSSStrategy({ ait_enabled: true, small_period_days: 30 })]
];
const results = [];

function runPoint(category, value, {
  target = 50000, capital = 300000, accountCount = 3,
  bankCount = 3, inflow = "none", efd = true
} = {}) {
  const end = END;
  const accounts = makeAccounts(accountCount, capital, bankCount, efd);
  const input = {
    options, start: START, end,
    simulation: { mode: "goal", goal: { metric: "consolidation_net_interest", target } },
    accounts, inflow_account_id: accounts[0].id, consolidation_account_id: accounts[0].id,
    inflow_schedule: makeInflows(inflow, accounts[0].id, end),
    outflow_schedule: {}, fee_config: feeConfig
  };
  for (const [name, createStrategy] of strategies) {
    const started = performance.now();
    const result = engine.run(createStrategy(), input);
    const runtimeMs = performance.now() - started;
    if (!result.finalized || !result.goal_outcome || !Number.isFinite(result.credited_net_interest)) {
      throw new Error(name + " produced an invalid goal result at " + category + "/" + value);
    }
    const goal = result.goal_outcome;
    const row = {
      category, value, strategy: name, target_lkr: target, safety_horizon_years: SAFETY_HORIZON_YEARS,
      starting_capital_lkr: capital, account_count: accountCount, bank_count: bankCount,
      inflow, efd: efd ? "eligible" : "standard_only",
      achieved: goal.achieved, achievement_date: goal.achievement_date,
      days_to_achievement: goal.achieved && Number.isFinite(goal.elapsed_days) ? goal.elapsed_days : null,
      actual_duration_days: daysBetween(START, formatISODate(result.end_date)),
      stopping_date: formatISODate(result.end_date),
      actual_net_interest_at_achievement: goal.achieved ? Number(goal.actual.toFixed(2)) : null,
      credited_net_interest_at_stop: Number(result.credited_net_interest.toFixed(2)),
      final_net_interest_after_ait: Number(result.net_interest_after_ait.toFixed(2)),
      shortfall_lkr: goal.achieved ? 0 : Number(goal.shortfall.toFixed(2)),
      transfer_fees_lkr: Number(result.total_transfer_fees.toFixed(2)),
      booking_count: result.bookings.length,
      runtime_ms: runtimeMs,
      absolute_plus_expanded_states: result.search_diagnostics?.expanded_states ?? null,
      goal_candidates_evaluated: result.search_diagnostics?.goal_candidates_evaluated ?? null,
      goal_invalid_candidates: result.search_diagnostics?.goal_invalid_candidates ?? null,
      goal_invalid_candidate_reasons: result.search_diagnostics?.goal_invalid_candidate_reasons ?? null,
      goal_invalid_candidate_examples: result.search_diagnostics?.goal_invalid_candidate_examples ?? [],
      goal_search_score: result.search_diagnostics?.selected_goal_score ? {
        achieved: result.search_diagnostics.selected_goal_score.achieved,
        elapsed_days: Number.isFinite(result.search_diagnostics.selected_goal_score.elapsed_days) ? result.search_diagnostics.selected_goal_score.elapsed_days : null,
        actual: result.search_diagnostics.selected_goal_score.actual,
        fees: result.search_diagnostics.selected_goal_score.fees,
        operations: result.search_diagnostics.selected_goal_score.operations
      } : null,
      beam_pruned: result.search_diagnostics?.beam_pruned ?? null,
      local_combination_pruned: result.search_diagnostics?.local_combination_pruned ?? null,
      optimality_proven: result.search_diagnostics?.optimality_proven ?? null,
      stopping_reason: goal.stopping_reason,
      target_attainment_pct: Number((result.credited_net_interest / target * 100).toFixed(3)),
      credited_interest_per_day_lkr: daysBetween(START, formatISODate(result.end_date)) > 0
        ? Number((result.credited_net_interest / daysBetween(START, formatISODate(result.end_date))).toFixed(4)) : null,
      fees_pct_of_credited_interest: result.credited_net_interest > 0
        ? Number((result.total_transfer_fees / result.credited_net_interest * 100).toFixed(3)) : null,
      target_overshoot_lkr: goal.achieved ? Number((goal.actual - target).toFixed(2)) : 0
    };
    results.push(row);
    process.stdout.write("GOAL_SENSITIVITY_POINT=" + JSON.stringify({
      category, value, strategy: name, achieved: row.achieved,
      days_to_achievement: row.days_to_achievement, credited_net_interest: row.credited_net_interest_at_stop,
      runtime_ms: runtimeMs
    }) + "\n");
  }
}

// One-factor-at-a-time design. Outflows are deliberately excluded pending
// independent verification of the shared outflow/provenance interaction.
for (const target of [10000, 25000, 50000, 75000, 100000]) runPoint("goal_target_lkr", target, { target });
for (const capital of [25000, 100000, 300000, 1000000]) runPoint("starting_capital_lkr", capital, { capital });
for (const accountCount of [1, 2, 3]) runPoint("account_count", accountCount, { accountCount, bankCount: 1 });
for (const bankCount of [1, 2, 3]) runPoint("bank_count", bankCount, { bankCount, accountCount: 3 });
for (const inflow of ["none", "monthly_10k", "quarterly_30k", "lump_100k"]) runPoint("inflow_pattern", inflow, { inflow });
for (const efd of [false, true]) runPoint("efd_eligibility", efd ? "eligible" : "standard_only", { efd });

const groups = new Map();
for (const row of results) {
  const key = row.category + "|" + row.value;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
for (const rows of groups.values()) {
  const baseline = rows.find(row => row.strategy === "Greedy");
  for (const row of rows) {
    row.delta_days_vs_greedy = row.days_to_achievement === null || baseline.days_to_achievement === null
      ? null : baseline.days_to_achievement - row.days_to_achievement;
    row.delta_credited_interest_vs_greedy = Number((row.credited_net_interest_at_stop - baseline.credited_net_interest_at_stop).toFixed(2));
  }
}
const report = {
  generated_at: new Date().toISOString(), start_date: START, banks: BANK_IDS.map(id => ({
    id, name: banks.get(id).name, rate_file: index.get(id).options_file,
    research_status: index.get(id).research_status, option_count: optionsByBank.get(id).length
  })),
  objective: "First-time net interest credited to consolidation account after AIT and attributable transfer fees.",
  ait_enabled: true, compound: false, outflows_included: false,
  safety_horizon_years: SAFETY_HORIZON_YEARS,
  absolute_plus_budget: { beam_width: 96, max_local_branches: 48, max_decisions: 5000 },
  timing_method: "Single measured execution per point using performance.now(); runtime is observational and runner-dependent.",
  metric_definitions: {
    actual_duration_days: "Elapsed simulation days until achievement or the strategy's valid stopping boundary.",
    days_to_achievement: "Elapsed days only for achieved goals; null when not achieved.",
    credited_interest_per_day_lkr: "Credited net interest divided by actual elapsed simulation days; descriptive, not an investment yield.",
    target_attainment_pct: "Credited net interest at stop divided by target; values below 100% indicate an unmet target.",
    fees_pct_of_credited_interest: "Transfer fees divided by credited net interest; null when no credited interest exists."
  },
  results
};

// Build self-contained SVG dashboards: six KPIs, three strategies, one scenario factor per file.
const chartDir = new URL("../docs/strategies/assets/goal-achievement/", import.meta.url);
mkdirSync(chartDir, { recursive: true });
const chartMetrics = [
  { key: "actual_duration_days", title: "Elapsed simulation duration", unit: "days" },
  { key: "credited_net_interest_at_stop", title: "Credited net interest at stop", unit: "LKR" },
  { key: "runtime_ms", title: "Strategy computation time", unit: "ms" },
  { key: "transfer_fees_lkr", title: "Transfer fees", unit: "LKR" },
  { key: "credited_interest_per_day_lkr", title: "Credited interest per elapsed day", unit: "LKR/day" },
  { key: "target_attainment_pct", title: "Goal target attainment", unit: "%" }
];
const strategyColors = { Greedy: "#2563eb", "Absolute+": "#d97706", GSS: "#059669" };
const factorTitles = {
  goal_target_lkr: "Goal target", starting_capital_lkr: "Starting capital",
  account_count: "Account count", bank_count: "Bank count",
  inflow_pattern: "Inflow pattern", efd_eligibility: "eFD eligibility"
};
function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function renderPanel(rows, metric, x, y, width, height) {
  const left = x + 76, right = x + width - 24, top = y + 42, bottom = y + height - 58;
  const values = rows.map(row => row[metric.key]).filter(Number.isFinite);
  const max = Math.max(1, ...values) * 1.12, min = 0;
  const labels = [...new Set(rows.map(row => String(row.value)))];
  const numericAxis = labels.every(label => Number.isFinite(Number(label)));
  const numericMin = Math.min(...labels.map(Number)), numericMax = Math.max(...labels.map(Number));
  const xPos = value => labels.length === 1 || (numericAxis && numericMin === numericMax)
    ? (left + right) / 2
    : numericAxis
      ? left + (Number(value) - numericMin) * (right - left) / (numericMax - numericMin)
      : left + labels.indexOf(String(value)) * (right - left) / (labels.length - 1);
  const yPos = value => bottom - (value - min) / (max - min) * (bottom - top);
  let svg = `<text x="${x+16}" y="${y+25}" font-size="17" font-weight="700" fill="#111827">${xml(metric.title)} (${xml(metric.unit)})</text>`;
  for (let tick = 0; tick <= 4; tick++) {
    const val = max * tick / 4, yy = yPos(val);
    svg += `<line x1="${left}" y1="${yy}" x2="${right}" y2="${yy}" stroke="#e5e7eb"/><text x="${left-10}" y="${yy+4}" text-anchor="end" font-size="10" fill="#6b7280">${val.toFixed(metric.unit === "%" ? 0 : 1)}</text>`;
  }
  svg += `<line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="#6b7280"/>`;
  labels.forEach(label => { const xx=xPos(label); svg += `<text x="${xx}" y="${bottom+20}" text-anchor="middle" font-size="10" fill="#4b5563">${xml(label)}</text>`; });
  for (const strategy of ["Greedy", "Absolute+", "GSS"]) {
    const series = rows.filter(row => row.strategy === strategy && Number.isFinite(row[metric.key]));
    if (!series.length) continue;
    const points = series.map(row => `${xPos(row.value)},${yPos(row[metric.key])}`).join(" ");
    svg += `<polyline points="${points}" fill="none" stroke="${strategyColors[strategy]}" stroke-width="2.5" stroke-linejoin="round"/>`;
    for (const row of series) {
      const xx=xPos(row.value), yy=yPos(row[metric.key]);
      svg += `<circle cx="${xx}" cy="${yy}" r="4" fill="${strategyColors[strategy]}"><title>${xml(strategy)}: ${row[metric.key]}</title></circle>`;
    }
  }
  return svg;
}
for (const [category, title] of Object.entries(factorTitles)) {
  const rows = results.filter(row => row.category === category);
  const panels = chartMetrics.map((metric, i) => renderPanel(rows, metric,
    24 + (i % 2) * 700, 50 + Math.floor(i / 2) * 340, 680, 320)).join("");
  const legend = ["Greedy", "Absolute+", "GSS"].map((name, i) =>
    `<line x1="${48+i*180}" y1="1080" x2="${78+i*180}" y2="1080" stroke="${strategyColors[name]}" stroke-width="3"/><text x="${86+i*180}" y="1085" font-size="13" fill="#374151">${xml(name)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1110" viewBox="0 0 1440 1110"><rect width="100%" height="100%" fill="#ffffff"/><text x="28" y="30" font-size="21" font-weight="700" fill="#111827">${xml(title)} — goal-mode strategy sensitivity</text>${panels}${legend}<text x="28" y="1102" font-size="10" fill="#6b7280">Same scenario inputs per point. Runtime is a single-run measurement; null values indicate unavailable metrics.</text></svg>`;
  writeFileSync(new URL(title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".svg", chartDir), svg);
}
writeFileSync(new URL("results.json", chartDir), JSON.stringify(report, null, 2) + "\n");
process.stdout.write("GOAL_ACHIEVEMENT_SENSITIVITY_JSON=" + JSON.stringify(report) + "\n");
