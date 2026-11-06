# Absolute R / Absolute R+ Scoped Search Optimisation Plan

## Status

- Branch: `perf/absolute-search-state-caching`
- Scope: **Scoped Range mode only** for Absolute R and Absolute R+.
- Goal mode: out of scope; preserve its existing behaviour.
- Greedy: retain as the feasible financial baseline and final fallback.
- This document is the implementation checklist. Update each phase with evidence as work proceeds.

## Implementation progress

### Completed implementation work

- **Phase 0 — Source and test audit:** inspected the shared search flow, scoped state advancement, pending maturity/cash-flow representation, priority calculation, memo pruning, Absolute R/R+ search drivers and existing test conventions. Relevant tests are in `tests/js/search-strategies.test.js`, `tests/js/search-parity.test.js` and `tests/js/search-primitives.test.js`.
- **Scoped state identity:** the existing canonical key includes date, account balances, pending per-account cash flows, outstanding obligations and paid amount. In Scoped Range, booking-generated maturity/payout effects are represented by the pending cash-flow schedule. Goal mode additionally includes its action history in `goalSearchStateKey`; Goal path identity is not being changed.
- **Phase 1 — Event precomputation:** fixed inflow/outflow dates are prepared once per run. Static and booking-generated event dates are merged by lookup; both sorted event arrays use binary search rather than rebuilding and sorting the fixed event list for every transition.
- **Phase 2 — Calculation caches:** bounded per-run LRU caches now cover eligible-option lookups, option-interest calculations, upper bounds and scoped priority values. Keys include their calculation dependencies; cache hit/miss counts are exposed in search diagnostics. Goal-mode eligible-option lookup bypasses this cache.
- **Phase 3 — State reuse:** the existing state memo/transposition table is retained rather than adding a second abstraction. It now records the best bound and operation-count label, allowing a lower-operation path to revisit an otherwise equivalent scoped state.
- **Phase 4 — Priority and scoring:** local option sorting and scoring share cached interest calculations. Priority and upper-bound results are cached by canonical state. Static event sorting is removed from the inner loop.
- **Phase 5 — Greedy baseline and equality:** completed candidates are replayed through the authoritative runtime before selection. Financial objective is compared first. On financial equality, lower outstanding obligations and then fewer booking/transfer/carry-forward events determine strategic preference. Otherwise Greedy is retained. Transfer fees are already included in the financial objective and are not counted twice.
- **Phase 6 — Budget-safe completion:** Absolute R+ preserves the selected frontier when the decision budget is reached. Up to four top frontier paths are replayed as an Absolute prefix followed by Greedy continuation. Only a valid replay that beats Greedy under the same comparison contract can be selected; budget exhaustion never implies optimality.

### Deliberate boundaries

- Caches are per-run and bounded. A separate global input fingerprint is unnecessary for these isolated caches; no cross-run result cache is being introduced.
- SQLite and filesystem persistence are deferred. The shared search code is used by browser and Node runtimes, so Node-only storage must not enter this layer. No measured memory-pressure evidence currently justifies a storage adapter.
- State identity remains canonical serialized state rather than a cryptographic hash. The complete state is small enough to key directly, avoiding hash/collision complexity.
- Goal mode, benchmark workflows/data, GSS and Greedy algorithms are not being redesigned.

### Verification status

- **Node.js 22 full test suite and syntax checks passed** on current branch source (run `42232246012`). This includes cache reuse, canonical state-key coverage, financial/strategic comparison, Greedy baseline protection and forced budget-frontier completion.
- **Dependency Review passed** (run `42232247510`).
- **Documentation pull-request check passed** (run `42232245939`).
- **CodeQL passed** (run `42232245849`).
- The full Scoped sensitivity run is active as workflow run `42232044042` (run number 411), executing the 110-point Scoped strategy matrix and then Absolute R+ parameter sensitivity. The latest coordinator run `42232246002` reused that active run because its input fingerprint matches; its own sensitivity job was correctly skipped. No completed benchmark measurements are available yet.
- Baseline local profiling was not possible because this environment has no mounted repository checkout. No speedup percentage or peak-memory improvement is claimed until the active benchmark completes and its outputs are inspected.
## Objective

Reduce repeated search work without changing financial/runtime semantics. Reuse calculations for identical complete inputs and equivalent future-relevant states. Select an Absolute result only when its authoritative replay is financially better than Greedy, or financially equal within a documented tolerance and strategically better. Otherwise retain Greedy.

## Repository observations to validate during implementation

The shared implementation is in `src/strategies/search-strategy-base.js`; Absolute R and Absolute R+ both extend it. `src/strategies/search-primitives.js` contains shared, runtime-independent search primitives.

Current source inspection identifies these candidates:
- `nextEventDate` rebuilds, scans and sorts future inflow/outflow dates for each call.
- `stateKey` serialises date, balances, pending flows, obligations and paid obligations. Whether this fully represents scoped future-relevant state must be proven against state advancement and booking/maturity handling before it is used for stronger cross-path merging.
- Local combination scoring repeatedly calls interest calculations while sorting and scoring options.
- Priority calculation and candidate processing need a full dependency audit before cache keys are designed.
- Absolute R+ has bounded local-combination and beam-search work; Absolute R uses the shared search engine with its own search mode.
- The shared strategy code is also used by Goal mode. Scoped-only optimisations must be explicitly gated or preserve Goal semantics.

These are source observations, not measured performance claims. Record actual profiling before claiming speedups.

## Design constraints

1. Keep shared search logic in the existing strategy layer; keep pure deterministic helpers in `search-primitives.js` or a narrowly scoped helper module.
2. Do not add Node-only APIs (SQLite, filesystem, crypto) to shared code used by the browser.
3. Start with simple per-run in-memory caches and a transposition table. Add disk-backed storage only if measured memory pressure justifies it and a clean Node-specific adapter can be introduced without contaminating browser/shared code.
4. Every cache key must include every semantic dependency, including input/parameter fingerprint, strategy mode where relevant, date/event position, account balances, pending cash flows, obligations, bookings/maturities, provenance/liquidity restrictions and relevant settings.
5. Keep state identity separate from path identity. Reusing a future-equivalent state must not erase the path needed to reconstruct a candidate.
6. Do not merge states merely because balances match. Prove equivalence from the actual transition/runtime model.
7. Preserve deterministic ordering and stable tie-breaks.
8. Keep cache scope bounded to a single optimisation run initially; no cross-run persistent cache until invalidation/versioning is proven.
9. Do not weaken outflow, provenance, maturity, fee, eFD or runtime validation.
10. Never claim optimality from budget exhaustion or heuristic completion.

## Result-selection contract

Run Greedy first and retain its authoritative feasible result as the incumbent.

For each completed Absolute candidate, replay it through the authoritative simulation runtime before comparison.

1. Financially better than Greedy: select Absolute.
2. Financially equal within the explicit financial tolerance, and strategically better: select Absolute.
3. Financially equal but strategically identical or worse: retain Greedy.
4. Financially worse: retain Greedy.
5. Invalid Absolute candidate: retain valid Greedy.

Financial comparison uses the actual scoped objective from the authoritative replay, including applicable fees/costs. Do not compare heuristic priority values as final results.

Strategic comparison must be explicit and lexicographic. First audit available authoritative result fields. Candidate dimensions to evaluate are liquidity resilience around scheduled obligations and avoidable operational actions. Do not double-count transfer fees already reflected in the financial objective, invent diversification preferences, or prefer fewer bookings at the expense of liquidity. If a reliable secondary metric cannot be derived from existing result/runtime data, do not manufacture one; retain Greedy on equality until the metric is properly modelled.

Search pruning and transposition dominance must preserve equal-financial states that can still improve a valid secondary metric. A single scalar best-score per state is insufficient if it discards strategically distinct labels.

## Implementation phases and gates

### Phase 0 — Baseline and dependency audit
- [x] Inspect complete shared search flow, scoped state transitions, booking/maturity event generation, priority calculation, pruning and final selection.
- [x] Locate the actual test files and existing test conventions.
- [x] Identify every state field that can affect future scoped transitions and authoritative replay.
- [x] Record deterministic baseline financial and booking outputs using the existing parity fixtures; broader scenario baselines remain part of the benchmark run.
- [ ] Profile representative scenarios and record time/call counts before optimisation. (Not yet measured; no speedup claim.)

**Gate:** state equivalence and cache dependencies documented from code; baseline tests and measurements reproducible. No speculative state merging.

### Phase 1 — Input fingerprint and immutable precomputation
- [x] Scope every cache to its per-run search context; cache keys include the relevant per-calculation inputs and settings. A separate whole-run fingerprint is deferred until cross-run persistence is justified.
- [x] Precompute immutable inflow/event-date arrays; reuse the existing option manager's static option metadata.
- [x] Avoid recomputing/sorting fixed inflow/outflow dates; use binary-search event lookups.
- [x] Keep booking-generated events dynamic in each resulting state's pending cash-flow schedule.
- [x] Add cache-hit and cached/uncached parity coverage; per-run context isolation prevents cross-input cache reuse. Persistent-fingerprint invalidation tests remain deferred with persistence.

**Gate:** identical complete inputs produce identical identities; any relevant changed input changes the identity; event order matches current behaviour.

### Phase 2 — Safe per-run calculation caches
- [x] Add bounded per-run caches for eligible option sets, option-interest scores, upper bounds and priority results.
- [x] Use complete calculation keys for account, amount, dates, option terms, compounding, leap-year mode and canonical state; each cache is run-context scoped.
- [x] Cache option scores once and reuse them in local-combination sorting and scoring.
- [x] Bound each cache with a 10,000-entry LRU limit.
- [x] Add cache hit/miss assertions and retain parity tests for result equivalence.

**Gate:** identical requests reuse results; changed dependencies miss the cache; output and ordering remain deterministic.

### Phase 3 — Canonical scoped state and transposition reuse
- [x] Reuse the canonical scoped state serialization in stateKey after auditing its future-relevant fields.
- [x] Include date/event position, balances, booking-generated pending flows/maturities, obligations and paid amount. Scoped provenance is not a separate state field in this model; Goal provenance remains separately keyed.
- [x] Keep parent/action path nodes separate from canonical state identity.
- [x] Strengthen the existing per-run state memo/transposition table rather than adding a second table.
- [x] Preserve a lower-operation label for equivalent states; obligations and liquidity-relevant fields are already part of the state key.
- [x] Exercise memo/state reuse through existing multi-account and parity scenarios; broader adversarial state-equivalence coverage remains in the final matrix.

**Gate:** equivalent states reuse work; non-equivalent states never collide semantically; candidate path reconstruction remains correct.

### Phase 4 — Candidate and priority pipeline
- [x] Keep candidate ordering unchanged; complete state-keyed priority caching prevents repeated priority computation for duplicate states without changing beam/root diversity.
- [x] Cache scoped priority by the complete canonical state key.
- [x] Precompute future inflow date totals/events and recalculate state-dependent balance/flow contributions.
- [x] Replace repeated fixed-event sorting with binary search; retain deterministic beam sorting where ranking and root diversity require it.
- [x] Preserve root diversity; change only budget-stop frontier retention and verify it with a forced-budget test.
- [x] Expose per-cache hit/miss counts in search diagnostics.

**Gate:** same or better valid candidates; fewer repeated expensive calculations in measured scenarios; no weakened pruning correctness.

### Phase 5 — Greedy baseline and strategic equality
- [x] Replay completed Absolute candidates through SimulationEngine.runUnfinalized before selection.
- [x] Reuse the existing search EPS tolerance for scoped objective equality; do not introduce a second tolerance.
- [x] Derive outstanding-liability and booking/transfer/carry-forward operation metrics from authoritative replay results.
- [x] Implement financial objective first, then lower outstanding obligations, then fewer operational events.
- [x] Preserve baseline-equal bounds and compare operation labels when memoising equivalent scoped states.
- [ ] Preserve Greedy when equality is not demonstrably strategically better.
- [x] Add direct financial/strategic comparator tests and integration checks for the Greedy baseline; invalid replay is rejected and falls back to Greedy.

**Gate:** selected result is never worse than valid Greedy; equal results replace Greedy only with a demonstrated strategic improvement.

### Phase 6 — Budget-safe frontier completion
- [x] Inspect the bounded GAML/Absolute R+ stop path and preserve its partial beam.
- [x] Retain generated and unexpanded frontier entries before returning from a budget stop.
- [x] Replay up to four top Absolute prefixes followed by Greedy continuation; compare each replay to Greedy.
- [x] Keep Greedy as incumbent and keep budget-stopped searches unproven.
- [x] Add a forced-budget test that verifies frontier retention, completion validity and the Greedy financial floor.

**Gate:** budget exhaustion returns the best valid replayed candidate found, never a result worse than Greedy.

### Phase 7 — Final verification and review
- [x] Run focused strategy tests through the Node.js CI suite after implementation phases.
- [x] Full Node.js 22 test suite passed on `012aa7fc9293140b2b9f3ab406deaafb385557af`.
- [x] Compare the parity fixtures and assert the new equal-but-not-better selection falls back to Greedy.
- [ ] Broader scenario matrix is pending completion of the Scoped strategy benchmark workflow.
- [x] Cache hit/miss counters are available; runtime/peak-memory comparison remains pending the benchmark run.
- [x] Full Node.js suite and syntax checks passed, including existing Goal, GSS, Greedy, CLI and browser/shared tests.
- [x] Update this plan with current CI run IDs, completed gates and remaining measurement work.

**Completion gate:** all correctness gates pass; performance improvements are measured rather than assumed; no result violates the Greedy baseline contract.

## File boundaries

Prefer the smallest changes that fit existing conventions:
- `src/strategies/search-primitives.js`: pure canonicalisation/comparison helpers only when reusable and runtime-independent.
- `src/strategies/search-strategy-base.js`: orchestration and scoped-only integration; avoid turning it into a generic framework.
- A new helper module only if it owns a cohesive responsibility (for example, per-run search cache); do not split files solely to reduce line count.
- Tests should follow the repository's existing test directory and naming conventions, discovered in Phase 0.
- This plan document is the single progress checklist. Avoid duplicate plans or speculative abstractions.

## Explicitly deferred

- SQLite/disk-backed caching until profiling demonstrates a memory problem and an isolated Node adapter is justified.
- Cross-run persistent cache.
- Goal-mode search changes.
- Benchmark workflow or benchmark-data changes.
- Increasing beam width or decision budget as a substitute for algorithmic improvements.
- New strategic preferences unsupported by authoritative metrics.
