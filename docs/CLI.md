# JavaScript CLI

For a plain-language explanation of how the strategies differ and when to use each, see [Strategy guide](STRATEGIES.md).

## Strategy support

The CLI supports all four JavaScript strategies:

- **Greedy** — fast baseline heuristic.
- **Absolute** — exhaustive branch-and-bound in scoped mode; exhaustive earliest-achievement search in goal mode.
- **GAML / Absolute+** — bounded layered beam search. Scoped mode ranks terminal portfolio value; goal mode uses provenance-aware credit timing, payout-aware local branches and goal-date-aware waiting.
- **GSS** — independent recursive planner. Scoped mode preserves manager-ordered candidates; goal mode ranks viable plans by projected consolidation-credit timing and can defer rebooking for an earlier future consolidation opportunity.

## Run

From the repository root:

```powershell
npm install
npm test
npm run cli -- --config .\config.json --strategy greedy
npm run cli -- --config .\config.json --strategy absolute
npm run cli -- --config .\config.json --strategy gaml
npm run cli -- --config .\config.json --strategy gss
```

If `strategy` is present in the JSON configuration, `--strategy` is optional.

## GAML settings

GAML accepts these settings in the configuration JSON:

```json
{
  "strategy": "gaml",
  "gaml_settings": {
    "beam_width": 256,
    "max_local_branches": 128,
    "max_decisions": null
  }
}
```

Defaults mirror the archived Python implementation for scoped mode. `beam_width` controls how many candidate states survive each search layer; `max_local_branches` controls how many local booking combinations are explored when expanding a state. In scoped mode, `max_decisions: null` means no hard expanded-state cap. In goal mode, Absolute+ applies a default 5,000-state decision budget when no positive cap is configured. `max_local_branches: null` enumerates all local booking combinations rather than truncating the combination search. See the [strategy guide](STRATEGIES.md) for examples and trade-offs.

CLI flags override the JSON values:

```powershell
npm run cli -- --config .\config.json --strategy gaml --beam-width 512 --max-local-branches 256 --max-decisions 100000
```

Use `none` to explicitly disable a configured local-combination or state cap:

```powershell
npm run cli -- --strategy gaml --max-local-branches none --max-decisions none
```

The JSON key `gaml_settings` is canonical. For compatibility, `gaml` and `strategy_settings.gaml` are also accepted.

GAML reports expanded states, terminal leaves, bound/memo pruning, beam pruning, local-combination pruning, root-strategy diversity and whether optimality was proven. Goal mode additionally reports goal candidate evaluations, invalid replay candidates, the objective and the decision budget. If beam width, local combinations or a state budget truncate the search, the result is an incumbent solution, not a proof of global optimality. Absolute goal search is exhaustive and reports proof only when no unsafe pruning occurs.

## GSS settings

GSS accepts a positive integer recursion threshold:

~~~json
{ "strategy": "gss", "gss_settings": { "small_period_days": 30 } }
~~~

The default is 30 days. Override it with `--small-period-days N`. Short waiting periods are processed without deeper future-goal subdivision, but immediately achievable goals remain eligible.

## Data and report output

The CLI reads the JSON configuration, resolves the bank registry and bank-specific FD product CSVs from root `data/`, validates the configuration, runs the selected JavaScript strategy, prints the event timeline and booking summary, and writes a standalone HTML report to `report_output_file` (relative paths resolve against the configuration file directory).

The root `data/` directory is copied from the archived catalogue. Do not edit `archive/` to update live catalogue data; update root `data/` and review the corresponding source/effective-date notes.

## Validation status

The strategy implementations require regression parity against archived Python scenarios before financial output should be treated as fully validated. Unit and CLI integration tests alone do not establish parity for every payout type, outflow policy, multi-account topology or large GAML search.
