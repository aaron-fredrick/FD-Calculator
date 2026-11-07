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

## Why browser storage is not the first optimisation

Persistent browser storage can reuse completed simulations between separate user runs, but it cannot safely replace intra-search transposition reuse. IndexedDB is asynchronous and introduces serialisation/versioning/invalidation complexity into a hot search path.

The first implementation should therefore use a bounded in-memory expansion cache. A later persistent result cache may be added at the simulation-result boundary, keyed by a complete input/algorithm fingerprint, if real usage demonstrates repeated identical web simulations.

`localStorage` should not be used for large search-node payloads.

## Investigation plan

1. Instrument expansion work by state and local-combination generation so the cost distribution is observable.
2. Add focused tests proving identical Scoped states can reuse an expansion without changing child semantics.
3. Implement a bounded per-run expansion-result cache.
4. Preserve the existing dominance memo as a separate pruning mechanism.
5. Re-run parity, search-strategy and adversarial state-identity tests.
6. Run the production CI benchmark and inspect Absolute R+ runtime/search diagnostics.
7. If expansion reuse is insufficient, investigate local-combination generation as the next hotspot rather than increasing beam width.
8. Only then consider an optional persistent completed-result cache for the browser.

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
