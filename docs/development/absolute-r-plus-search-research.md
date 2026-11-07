# Absolute R / Absolute R+ Search Research

## Status

Research baseline for the Absolute R+ optimisation work on branch `perf/absolute-r-plus-transposition-reuse`.

## Objective

Improve the Scoped Range Absolute R / Absolute R+ search used by the web tool without changing financial semantics, Goal-mode semantics, Greedy fallback guarantees, or authoritative runtime replay.

The primary hypothesis is that the existing optimisation work removes repeated scalar calculations but does not eliminate enough repeated **search expansion work**. Absolute R+ is the production web strategy, so improvements must remain browser-compatible and bounded.

## Current evidence

The latest main-branch documentation benchmark run generated the expected horizon sweep through 60 months. Absolute R+ runtime grows materially with horizon:

| Horizon | Absolute R+ runtime |
| ---: | ---: |
| 12 months | 0.615 s |
| 24 months | 6.138 s |
| 36 months | 15.197 s |
| 48 months | 24.831 s |
| 60 months | 26.802 s |

The separate Absolute R+ parameter sensitivity run at a 24-month scenario reported:

- beam width 32: 385 expanded states, 1.326 s
- beam width 96: 2,791 expanded states, 6.151 s
- beam width 256: 5,000 expanded states, 14.687 s
- local branch limit 16: 2,824 expanded states, 5.637 s
- local branch limit 128: 2,845 expanded states, 5.938 s
- decision cap 500: 500 expanded states, 1.502 s, net interest LKR 63,302.37
- decision cap 1,000: 1,000 expanded states, 3.063 s, net interest LKR 61,886.03
- decision cap 5,000: 2,791 expanded states, 5.833 s, net interest LKR 61,886.03

All reported Absolute R+ sensitivity points had `optimality_proven=false`.

These measurements show that search expansion and beam/local candidate generation are material costs. Increasing search budgets is not itself an optimisation and can increase work without improving the selected result.

## Production-default setting finding

The browser currently exposes Absolute R+ defaults of beam width 256 and local-branch limit 128, while the scoped benchmark uses 96 and 48 with a 5,000 decision cap. The 24-month parameter sensitivity showed the wider 256/128 configuration reaching the same reported net interest as 96/48 in that scenario while taking materially longer.

This does **not** justify changing production defaults yet. It is a separate configuration-quality question: the default must be chosen from broader adversarial and horizon evidence, not from one benchmark point. The implementation therefore leaves the UI defaults unchanged until the benchmark and scenario matrix establish a quality/runtime trade-off.

## Existing reuse mechanisms

The current shared search implementation already has:

- bounded LRU caches for eligible-option lookup, option interest, upper bounds and priority;
- a canonical Scoped state key containing date, balances, pending cash-flow schedule, obligations and paid amount;
- a 50,000-entry per-run state memo/transposition table;
- same-beam Absolute R+ candidate deduplication by canonical state;
- authoritative replay before selecting an Absolute result;
- Greedy as the financial baseline and fallback;
- budget-frontier continuation through a limited number of Absolute prefixes followed by Greedy.

These are useful, but they do not cache the complete expansion result of a state. The expensive work inside `expandState` includes local-combination enumeration/scoring, consolidation branch construction, cash-flow generation and child-state construction.

## Important distinction: state identity vs expansion reuse

A canonical state match means two search paths have the same future-relevant financial state. Their historical path must remain separate for replay, but the deterministic expansion from that state can be reused.

The current memo can prune a later state when its recorded bound and operation count dominate the new arrival. That avoids a second expansion in many cases. However, it cannot reuse an already-generated child list when a state must be revisited because the new path has a lower operation count or otherwise does not satisfy the memo dominance condition.

Therefore the next optimisation should be an **expansion-result transposition cache**, separate from the dominance memo.

## Safety requirements for expansion caching

A cached expansion is valid only when:

1. the canonical Scoped state is identical;
2. the search context and strategy settings affecting transitions are identical;
3. the expansion mode is identical;
4. the result is complete, not truncated by a decision budget;
5. the cached children are treated as immutable search descriptions;
6. child node/path metadata is reconstructed for the current parent rather than sharing mutable parent links;
7. Goal mode is excluded unless its provenance/path semantics are explicitly included in the key.

The current implementation already represents booking-generated future events in the state's pending flow schedule. Goal mode additionally carries provenance and path-sensitive identity, so this work remains Scoped-only.

## Beam-search implication

The 24-month sensitivity result where a 500-decision run found more net interest than a 1,000-decision run is not, by itself, evidence of a financial bug. Standard beam search is not generally monotonic as its search budget or beam width changes: a wider or deeper bounded beam can discard a different set of states and therefore return a different heuristic solution. This means the Absolute R+ contract must keep Greedy as the financial floor and must not assume that more search budget automatically means a better returned portfolio.

For this implementation, exact duplicate-state elimination is safer than generic beam duplicate elimination because the Scoped state key represents the complete future-relevant financial state. Historical path information is retained separately for replay and operation-count tie-breaking.


## Decision-budget quality regression: root cause and mitigation

The lower-budget result can be better because budget exhaustion introduces a second candidate class: the top four states on the current beam frontier are completed by Greedy during authoritative replay. A 500-decision run evaluates its own cutoff frontier. A 1,000-decision run continues expanding that frontier, so those exact 500-decision prefixes may disappear from the final frontier and never receive the same Greedy completion. The best terminal search incumbent is retained, but the budget-frontier completion incumbent was not retained across deeper search.


A second edge case was found while making the checkpoint candidate sets comparable: the decision counter was incremented before `expandState`, while `expandState` itself used that counter to stop generating branches. Therefore the last permitted state could be only partially expanded at the exact budget boundary, while the same state was fully expanded in a higher-budget run. The counter now increments after the state has completed expansion. A cap of N therefore permits N complete state expansions and stops before expansion N+1. A focused test asserts that a one-state budget still produces a non-empty, valid frontier.

This is an implementation-level anytime-quality gap, not a claim that beam search itself is monotonic. The search order is shared up to the smaller budget; the non-monotonicity enters when each budget independently chooses a different final frontier for Greedy completion.

Mitigation implemented on this branch:

- Capture bounded top-four budget-frontier checkpoints every 500 expanded states.
- Keep those checkpoint prefixes alongside the final cutoff frontier.
- Replay checkpoint prefixes with the same authoritative Greedy continuation used for the final frontier.
- Select the best valid replay across all checkpoints, terminal search incumbent and Greedy baseline.
- Keep checkpointing Scoped/Absolute R+ only; Goal mode remains unchanged.
- Expose the checkpoint count in search diagnostics.

This makes the tested 500/1,000/5,000 decision-budget points cumulative at 500-state checkpoints: a larger budget still evaluates the earlier checkpoint portfolios rather than discarding them. It does not assert mathematical monotonicity for arbitrary non-checkpoint budgets, and the benchmark must verify that the additional bounded replay work is acceptable.

## Follow-up verification

- Add a deterministic multi-account, multi-product test that runs the same input at 500 and 1,000 decisions.
- Assert both runs reach their configured caps, checkpoint counts are cumulative, and the higher-budget result is no worse.
- Re-run the production sensitivity benchmark and inspect both quality and runtime, including the additional checkpoint replays.

## Why browser storage is not the first optimisation

Persistent browser storage can reuse completed simulations between separate user runs, but it cannot safely replace intra-search transposition reuse. IndexedDB is asynchronous and introduces serialisation/versioning/invalidation complexity into a hot search path.

The first implementation should therefore use a bounded in-memory expansion cache. A later persistent result cache may be added at the simulation-result boundary, keyed by a complete input/algorithm fingerprint, if real usage demonstrates repeated identical web simulations.

`localStorage` should not be used for large search-node payloads.

## Investigation plan

1. Instrument expansion work by state and local-combination generation so the cost distribution is observable.
2. Add focused tests proving identical Scoped states can reuse an expansion without changing child semantics.
3. Memoize canonical state-key serialization without introducing strong cross-run references.
4. Implement a bounded per-run expansion-result cache.
5. Preserve the existing dominance memo as a separate pruning mechanism.
6. Re-run parity, search-strategy and adversarial state-identity tests.
7. Run the production CI benchmark and inspect Absolute R+ runtime/search diagnostics.
8. If expansion reuse is insufficient, investigate local-combination generation as the next hotspot rather than increasing beam width.
9. Only then consider an optional persistent completed-result cache for the browser.

## Explicit non-goals

- No SQLite in shared browser code.
- No Goal-mode state merging.
- No weakening of strict outflow, provenance, maturity, fee or eFD constraints.
- No assumption that a larger beam or decision budget is better.
- No claim of optimality from budget exhaustion.
- No new strategic preferences unsupported by authoritative replay.

## Acceptance criteria

The optimisation is complete only if:

- focused and full tests pass;
- canonical state identity remains correct;
- cached and uncached expansion paths produce identical financial children;
- the selected web strategy never violates the Greedy financial floor;
- no Goal-mode behaviour changes;
- production benchmark evidence demonstrates either a measurable runtime reduction or a clear reduction in repeated expansion work with no material memory regression;
- the implementation remains bounded, deterministic and understandable.


## Production-scenario budget verification (24-month sensitivity)

Executed the repository's `scripts/gaml-sensitivity.js` on the PR branch using the existing production sensitivity scenario: LKR 300,000 across DFCC, Commercial Bank and NDB, 24-month horizon, AIT enabled, no inflows, beam width 96 and local branch limit 48.

| Decision cap | Expanded states | Net interest (LKR) | Final value (LKR) | Runtime |
|---:|---:|---:|---:|---:|
| 500 | 500 | 63,302.37 | 363,302.37 | 803.89 ms |
| 1,000 | 1,000 | 63,302.37 | 363,302.37 | 1,590.02 ms |
| 2,500 | 2,500 | 63,302.37 | 363,302.37 | 3,100.42 ms |
| 5,000 | 2,791 | 63,302.37 | 363,302.37 | 3,232.45 ms |
| 10,000 | 2,791 | 63,302.37 | 363,302.37 | 3,203.83 ms |

The 5,000 and 10,000 caps both naturally exhausted the search after 2,791 expansions; the configured cap was not reached. All rows were financially valid and finalized. `optimality_proven` remained false, so this is evidence of budget-quality preservation for this scenario, not proof of global optimality or a universal guarantee across every input.

Before the fix, the same 24-month scenario returned LKR 63,302.37 at 500 decisions but LKR 61,886.03 at both 1,000 and 5,000. The updated implementation now retains the 500-decision incumbent through later checkpoints, and all tested decision caps return LKR 63,302.37.

Benchmark workflow: https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42409787756
Artifact: absolute-r-plus-sensitivity (includes the full JSON dataset and raw point output).
