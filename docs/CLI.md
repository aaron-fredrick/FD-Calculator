# Command-line interface

The CLI runs the shared JavaScript financial engine and supports all four **scoped date-range** strategies.

## Strategies

- **Absolute R** — exhaustive branch-and-bound search. CLI-only.
- **Absolute R+** — bounded layered beam search.
- **Greedy** — fast immediate-decision baseline.
- **GSS** — recursive scoped planner.

All strategies use the configured investment start and end dates. Goal mode is under development and is rejected by public configuration validation.

## Run

```bash
npm run cli -- --config ./config.json --strategy absolute-r
npm run cli -- --config ./config.json --strategy absolute-r-plus
npm run cli -- --config ./config.json --strategy greedy
npm run cli -- --config ./config.json --strategy gss
```

For compatibility, `absolute` remains an alias for `absolute-r`, and `absolute-plus` remains an alias for `absolute-r-plus`. The JSON strategy identifiers remain `absolute` and `gaml`; existing configuration files do not need to be renamed.

## Absolute R+ settings

`gaml_settings` is the canonical configuration object. The historical aliases `gaml` and `strategy_settings.gaml` remain accepted.

| Setting | Default | Meaning |
|---|---:|---|
| `beam_width` | 256 | Maximum number of candidate states retained at each search layer. |
| `max_local_branches` | 128 | Maximum partial local-booking combinations retained during one state expansion. Set to null for exhaustive local combinations. |
| `max_decisions` | Unlimited | Optional cap on expanded search states. |

CLI flags override JSON values:

```bash
npm run cli -- --strategy absolute-r-plus --beam-width 512 --max-local-branches 256 --max-decisions 20000
npm run cli -- --strategy absolute-r-plus --max-local-branches none --max-decisions none
```

Absolute R+ reports expanded states, terminal leaves, bound/memo pruning, beam pruning, local-combination pruning, root-strategy diversity and whether optimality was proven. Any relevant truncation means the result is an incumbent rather than a global-optimality proof.

## GSS settings

The GSS recursion threshold defaults to 30 days. Override it with `--small-period-days N`. Short waits skip deeper future-goal subdivision while preserving scoped liquidity constraints.

## Goal mode

Goal-based net-interest planning is not available through the CLI configuration contract while its strategy architecture is being reworked. Configurations containing `simulation.mode: "goal"` are rejected. The internal simulation-runtime goal tests remain available to developers and do not constitute a supported CLI mode.
