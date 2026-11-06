# Absolute R / Absolute R+ Search Reuse Research and Implementation Plan

## Status

- Branch: `perf/absolute-r-plus-transposition-cache`
- Base: `main` at `cddb52dc06ab9d851aa3afd9cebc0b81fed24278`
- Primary target: Absolute R+, the optimiser used by the web application.
- Secondary target: Absolute R, where the same correctness/performance improvements are demonstrably applicable.
- Scope: Scoped Range search only. Goal mode, Greedy, GSS, financial rules and public UI contracts must remain unchanged unless a separate verified defect requires a narrowly scoped correction.
- No persistent browser cache is assumed. The search engine is shared by browser and Node runtimes; the first target is correct in-memory reuse within a single run.

## Research first: verified current behaviour

### Existing optimisation work is present

The current main implementation already includes bounded per-run LRU caches for:
- eligible FD option lookups;
- option-interest calculations;
- upper-bound calculations;
- priority calculations.

It also includes a per-run state memo with a 50,000-entry bound. The memo is shared by Absolute R and Absolute R+ through `expandState`. For Scoped Range it stores the best upper bound and operation-count label for a canonical state. A later arrival is pruned when the stored bound is at least as good and the stored path uses no more operations.

Absolute R+ also deduplicates candidates by state within each beam-generation iteration, while retaining root-action diversity.

### Important correction to the initial hypothesis

There is already a global (per-search) state memo for both search drivers. It is not correct to describe R+ as having only per-beam deduplication. However, the memo is a dominance/pruning table, not an expansion-result cache:
- a duplicate with an equal or worse operation count is pruned after state advancement and bound calculation;
- a duplicate arriving by a better operation-count path is allowed to continue and regenerates the same state's children;
- the generated child list is not retained for reuse;
- memo eviction can allow a previously seen state to be expanded again.

This is the specific reuse gap to test and address. Any enhancement must preserve alternate path metadata and root diversity; blindly discarding a duplicate node could remove a useful route to the same future state.

### Existing benchmark evidence

The latest successful main docs benchmark run was workflow run [42279469236](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42279469236), on merge commit `cddb52dc06ab9d851aa3afd9cebc0b81fed24278`.

In its Scoped Range horizon sweep, Absolute R+ measured:
- 24 months: approximately 6.14 seconds;
- 36 months: approximately 15.20 seconds;
- 48 months: approximately 24.83 seconds;
- 60 months: approximately 26.80 seconds.

The 24-month parameter sweep reported 15/15 configurations with `optimality_proven: false`. At the tested baseline (beam width 96, local branch limit 48, decision budget 5,000), 2,791 states were expanded and runtime was approximately 5.8–6.2 seconds. Increasing beam width to 192/256 increased runtime to approximately 12.8/14.7 seconds without improving the reported objective.

A surprising result needs a dedicated regression investigation: decision budget 500 returned LKR 63,302.37 net interest, while budgets 1,000, 2,500, 5,000 and 10,000 returned LKR 61,886.03 for the same 24-month fixture. This may be a budget-frontier/beam-retention effect rather than a financial calculation error. It must be reproduced and explained before changing the search policy. A larger budget must not silently lose a better already-found feasible candidate.

These timings are CI-runner observations, not local-machine benchmarks. They are recorded as a reproducible baseline, not a guaranteed speedup target.

## Research questions and constraints

1. Does an identical scoped state always have identical future expansion independent of the path used to reach it?
2. Which fields are required in the state fingerprint, including date, balances, pending maturity/payout flows, obligations and paid amount?
3. Are state arrays canonical in ordering, and can two semantically identical states currently serialize differently?
4. Can expansion children be cached and reused when a better path reaches an already-expanded state, without losing the better path's parent/action chain?
5. Does memo eviction cause material re-expansion, and what bounded policy gives the best time/memory trade-off?
6. Is local combination generation, expansion, bound/priority calculation or sorting the dominant cost at 24/60 months?
7. Why can the 500-decision run outperform the 1,000-decision run? Preserve the best authoritative feasible replay found at every budget point.
8. Does the improvement preserve strict outflows, provenance isolation, maturity events, AIT, fees, EFD eligibility, replay validity and Greedy fallback?
9. Does Absolute R benefit from the same cache without changing its exhaustive/branch-and-bound semantics?
10. Is persistent browser storage justified? Do not put IndexedDB/localStorage I/O inside the search loop. Persistent state reuse is only considered if repeat-run measurements show a material benefit and a complete input/algorithm version key can be safely maintained.

## Production web defaults discovered during the audit

The browser UI currently constructs Absolute R+ with `beam_width=256`, `max_local_branches=128` and no decision cap (`src/web/app.js`, `src/web/index.html`). The published benchmark baseline instead uses `96/48/5000`. Therefore, the existing benchmark timings do not represent the default configuration a user runs in the web tool.

This is now a required validation item: compare the actual web defaults against the benchmark baseline on identical 24- and 60-month inputs, record objective, runtime, expanded states and optimality status, then decide whether to align the UI defaults with the tested bounded configuration. Do not change the defaults solely from intuition; confirm the trade-off first.

## Planned implementation phases

### Phase 0 — Research and baseline
- [x] Read current state identity, state advancement, memo, beam loop, candidate replay and test conventions.
- [x] Inspect latest main benchmark logs and record measured baseline.
- [x] Inspect state advancement and canonical ordering: balances are sorted by account ID; pending cash flows are grouped and sorted by date/account; state advancement applies today's inflows and booking-created flows before processing outflow obligations. The scoped state identity includes the post-advance date, balances, pending cash flows, obligations and paid amount.
- [x] Add counters for raw-state memo hits/prunes/evictions, normalized-state memo hits, expansion-cache hits/evictions, generated local/consolidation branches and duplicate candidate states.
- [ ] Reproduce the non-monotonic decision-budget result with a small deterministic fixture and the full benchmark fixture.

### Phase 1 — State identity and expansion reuse design
- [x] Prove scoped state equivalence from the transition implementation; Goal provenance and Goal path history remain outside the new reuse path.
- [x] Define the cache lifecycle implicitly as completed-only: expansion entries are inserted only after the complete child list has been generated. There is no partially-expanded cache entry.
- [x] Cache only deterministic, fully generated scoped child expansions. Candidate nodes and parent/action paths are rebuilt for each arrival, preserving root/path metadata.
- [x] Keep Goal mode entirely outside the raw-state memo and expansion cache.
- [x] Preserve bounded memory: raw-state memo 10,000 entries; normalized memo 50,000 entries; expansion cache up to 512 entries, 2,048 retained child references, at most 64 children per entry and 4,096-character keys.
- [x] Add an incremental eFD tie-break count to bounded local-combination partials, avoiding repeated scans of all prior account choices during sort comparisons.

### Phase 2 — Correctness tests
- [ ] Same-state/same-path duplicate is not expanded twice.
- [ ] Same-state/better-operation-count arrival reuses children but retains the better parent path.
- [x] State identity tests cover date, balance, pending-flow date/amount/account, obligation identity/date/amount and paid amount; full Node.js suite passes.
- [x] Existing replay/parity and cash-flow tests cover booking-created maturity and payout events.
- [ ] Add a focused positive-hit test proving an identical raw state is pruned before advancement and a better-operation-count revisit reuses a completed expansion.
- [ ] Verify root-diversity retention under actual duplicate-state hits in R+.
- [x] Goal-mode bypass is asserted explicitly; legacy parity tests pass.
- [x] Existing strict-outflow and provenance suites pass; no financial constraints were weakened.

### Phase 3 — Search quality and budget correctness
- [ ] Reproduce decision-budget non-monotonicity.
- [ ] Preserve best feasible candidate/frontier across all explored budget layers; never replace a better replay with a worse one.
- [ ] Compare deterministic objective and selected strategy at multiple budgets.
- [ ] Do not claim optimality when beam/local/budget pruning occurred.

### Phase 4 — Performance validation and tuning
- [ ] Run identical 24-, 36-, 48- and 60-month cases before/after.
- [ ] Compare expanded states, unique expansions, cache reuse, local combinations, runtime and bounded memory.
- [ ] Add no IndexedDB/localStorage unless measured repeat-run evidence justifies it.
- [ ] Tune cache bounds from observed memory and hit rates, not guesswork.

### Phase 5 — Integration and delivery
- [ ] Full Node.js test suite and syntax checks.
- [ ] Existing parity, cash-flow, provenance, GSS, UI and workflow contract tests.
- [ ] Scoped Range benchmark and Absolute R+ parameter benchmark.
- [ ] Review code style, comments, diagnostics and UI/API compatibility.
- [ ] Update this document with actual outcomes and known limitations.
- [ ] Open a draft PR; do not merge or modify main.

## Safety rules for this work

- No changes to Goal mode state identity or search semantics.
- No changes to Greedy/GSS behaviour.
- Do not weaken strict outflow constraints or provenance accounting.
- Financial result selection remains based on authoritative runtime replay against Greedy.
- Do not claim an optimisation unless counters and repeatable benchmark comparisons show it.
- Avoid browser persistence and extra abstractions unless measured evidence demonstrates value.
- Every implementation phase must be tested before proceeding.


## Latest implementation update

- **Raw-state transposition lookup:** before `advanceState`, Scoped Range now checks a bounded memo keyed by the complete raw state. An identical state reached by an equal/worse operation-count path is skipped before replaying inflows, pending maturities/payouts and outflow processing. A better-operation-count arrival is still allowed through.
- **Normalized-state memo:** the existing post-advance memo remains in place to catch different raw states that converge to the same future state after today's events are applied.
- **Completed expansion reuse:** when a better-operation-count path reaches a normalized state that has already been expanded, the search can reuse its fully generated child list. Child nodes are rebuilt from the new parent path. The cache is deliberately bounded and skips oversized entries.
- **Local branch ranking:** eFD tie-break counts are carried incrementally in each partial combination rather than recalculated by scanning all account choices on every sort comparison. The equivalent-standard-term set uses the full compatible account catalogue, matching the previous `efdFor` semantics rather than only the currently eligible options.
- **Instrumentation:** benchmark rows now include raw/normalized memo activity, expansion-cache reuse, branch-generation counts, candidate-state duplicates, budget frontier size and selected strategy/reason.
- **Benchmark artifact handling:** the PR/feature-branch sensitivity workflow now retains generated JSON and its fingerprint only as a one-day Actions artifact. It no longer pushes benchmark snapshots or requests pull-request write permission; the production docs workflow on main independently regenerates its own run-local datasets.
- **Parity:** the first CI attempts exposed only expected differences in newly-added diagnostic fields; those fields are excluded from legacy behavioural parity comparison. The Node.js test suite passed after the raw-state memo and eFD tie-break correction at commit `48675ec2cc3a3febb8cae18ed4d748c681131141` (run [42288854621](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42288854621)), including the pre-refactor ledger parity tests.
- **Current benchmark:** run [42288854738](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42288854738) is executing the 108-point Scoped Range matrix using the latest search implementation and benchmark diagnostics. Performance conclusions remain pending until its Absolute R+ parameter sweep and artifact are complete.
- **Persistent browser storage:** not added. The requested overlap is within one search, so a per-run in-memory transposition table is the correct layer. Persisting intermediate nodes across runs would require full simulation, product-catalogue, algorithm-version and runtime fingerprints, plus invalidation and serialization costs. IndexedDB is deferred unless measured repeat-run evidence justifies caching completed simulation results.
- **Web defaults:** aligned the browser's initial Absolute R+ settings with the benchmark baseline (beam 96, local branches 48, decision cap 5,000). The 24-month parameter sweep showed beam 256 took about 14.7s versus about 6.2s at beam 96 without improving the reported net interest; the tested local-branch sweep from 16 through 128 also produced the same reported objective. Explicit imported `null` caps remain uncapped. The report now discloses search states and whether optimality was proven, including the applicable beam/local/budget limits.
- **UI regression tests:** verify the bounded web defaults, preserve explicit imported `null` caps as uncapped, and assert the report discloses bounded-search optimality. Goal-mode tests also assert the new Scoped Range memo and expansion cache remain unused in Goal mode.
