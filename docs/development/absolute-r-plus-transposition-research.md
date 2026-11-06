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

The post-advance memo and R+ per-beam candidate deduplication already prevent most duplicate expansions. The useful additional early check is a raw-state memo for Absolute R's depth-first traversal, where identical raw states can otherwise replay event advancement. For R+, benchmark evidence is required before adding another memo/cache layer.

### Existing benchmark evidence

The latest successful main docs benchmark run was workflow run [42279469236](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42279469236), on merge commit `cddb52dc06ab9d851aa3afd9cebc0b81fed24278`.

In its Scoped Range horizon sweep, Absolute R+ measured:
- 24 months: approximately 6.14 seconds;
- 36 months: approximately 15.20 seconds;
- 48 months: approximately 24.83 seconds;
- 60 months: approximately 26.80 seconds.

The 24-month parameter sweep reported 15/15 configurations with `optimality_proven: false`. At the tested baseline (beam width 96, local branch limit 48, decision budget 5,000), 2,791 states were expanded and runtime was approximately 5.8–6.2 seconds. Increasing beam width to 192/256 increased runtime to approximately 12.8/14.7 seconds without improving the reported objective.

The decision-budget regression was reproduced: cap 500 returned LKR 63,302.37, while caps 1,000, 2,500, 5,000 and 10,000 returned the Greedy baseline LKR 61,886.03. The 500 run selected an Absolute R+ budget-frontier prefix; larger runs discarded that prefix as the beam evolved. This is a search-retention defect, not a ledger/provenance error. The implementation now archives the top four feasible frontier prefixes every 500 expanded states and replays them against Greedy; the GAML benchmark asserts non-decreasing best net interest as the decision budget increases.

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
- [x] Add counters for raw-state memo hits/prunes/evictions, normalized-state memo hits, generated local/consolidation branches, duplicate candidate states and budget-frontier archives.
- [x] Reproduce the non-monotonic decision-budget result in the full 24-month GAML parameter fixture and identify budget-frontier loss as the cause.

### Phase 1 — State identity and reuse design
- [x] Prove scoped state equivalence from the transition implementation; Goal provenance and Goal path history remain outside the new reuse path.
- [x] Keep the existing normalized-state memo for both Absolute strategies; keep R+ candidate deduplication within each beam generation.
- [x] Add a bounded raw-state memo before event advancement for Absolute R DFS. It is disabled for R+ after measurement showed only 11 raw-state hits across 108 R+ scenarios, too few to justify serializing every expanded R+ state twice.
- [x] Prototype and measure a completed-expansion cache. It recorded zero hits across the 108 R+ benchmark scenarios, so it was removed rather than retained as unused production complexity.
- [x] Add an incremental eFD tie-break count to bounded local-combination partials, avoiding repeated scans of all prior account choices during sort comparisons.
- [x] Reuse the candidate state fingerprint for both priority caching and beam deduplication, avoiding a second JSON serialization per generated candidate.
- [x] Design a bounded budget-frontier archive: retain the top four candidate prefixes at 500-state checkpoints, up to 512 archived paths, then authoritatively replay them with greedy continuation.

### Phase 2 — Correctness tests
- [x] Same raw state reached through equivalent standard/eFD branches is pruned before event advancement in Absolute R.
- [x] R+ duplicate states are deduplicated within beam generation and by the normalized-state memo; a separate expansion cache was not retained because measured hits were zero.
- [x] State identity tests cover date, balance, pending-flow date/amount/account, obligation identity/date/amount and paid amount; full Node.js suite passes.
- [x] Existing replay/parity and cash-flow tests cover booking-created maturity and payout events.
- [x] Add a focused positive-hit test proving an identical raw state is pruned before advancement (equivalent standard/eFD branches); Node.js CI passes.
- [ ] Verify root-diversity retention under actual duplicate-state hits in R+.
- [x] Goal-mode bypass is asserted explicitly; legacy parity tests pass.
- [x] Existing strict-outflow and provenance suites pass; no financial constraints were weakened.

### Phase 3 — Search quality and budget correctness
- [x] Reproduce decision-budget non-monotonicity in the 24-month fixture.
- [x] Implement a bounded archive of frontier prefixes every 500 expanded states; replay each archived path with authoritative simulation and Greedy continuation.
- [x] Add a benchmark invariant requiring net interest not to regress as the decision budget increases.
- [ ] Verify monotonicity and compare selected strategy/objective at 500, 1,000, 2,500, 5,000 and 10,000 after the archive implementation.
- [x] Preserve optimality_proven: false whenever beam/local/budget pruning prevents proof.

### Phase 4 — Performance validation and tuning
- [x] Run the 108-point matrix on the implementation before budget-frontier archival and compare with main: 24-month R+ runtime fell from about 6.14s to 3.32s; 60-month runtime fell from about 26.80s to 14.08s.
- [x] Inspect reuse metrics: 11 raw-state hits, 1,821 normalized memo hits, 2.99m same-layer candidate duplicates and zero expansion-cache hits across 108 R+ scenarios.
- [ ] Re-run identical 24-, 36-, 48- and 60-month cases on the final budget-archive implementation.
- [ ] Compare expanded states, unique expansions, local combinations, candidate generation, runtime and bounded memory.
- [x] Do not add IndexedDB/localStorage: measured duplicate reuse is per-search; no cross-run cache benefit was demonstrated.

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

- **Raw-state transposition lookup:** before `advanceState`, Absolute R checks a bounded memo keyed by the complete raw state. An identical state reached by an equal/worse operation-count path is skipped before replaying inflows, pending maturities/payouts and outflow processing. This is disabled for R+ because its measured raw-state hit rate was negligible.
- **Normalized-state memo:** the existing post-advance memo remains shared by Absolute R and R+ to catch different raw states that converge to the same future state after today's events are applied. R+ also deduplicates candidates within each beam generation.
- **Expansion-cache decision:** a bounded child-expansion cache was prototyped and measured, but had zero hits across the 108 R+ scenarios. It was removed from production code to avoid memory and complexity without benefit.
- **Budget-frontier archive:** R+ now snapshots the selected frontier every 500 expanded states, retains up to four paths per checkpoint (512 paths maximum), and replays archived paths with greedy continuation. This is intended to prevent a larger decision budget from losing a better earlier feasible prefix.
- **Local branch ranking:** eFD tie-break counts are carried incrementally in each partial combination rather than recalculated by scanning all account choices on every sort comparison. The equivalent-standard-term set uses the full compatible account catalogue, matching the previous `efdFor` semantics rather than only the currently eligible options.
- **Instrumentation:** benchmark rows include raw/normalized memo activity, branch-generation counts, candidate-state duplicates, budget frontier/archive sizes and selected strategy/reason. The GAML parameter benchmark now asserts monotonic best net interest across increasing decision caps.
- **Benchmark artifact handling:** the PR/feature-branch sensitivity workflow now retains generated JSON and its fingerprint only as a one-day Actions artifact. It no longer pushes benchmark snapshots or requests pull-request write permission; the production docs workflow on main independently regenerates its own run-local datasets.
- **Parity:** the first CI attempts exposed only expected differences in newly-added diagnostic fields; those fields are excluded from legacy behavioural parity comparison. The Node.js test suite passed after the raw-state memo and eFD tie-break correction at commit `48675ec2cc3a3febb8cae18ed4d748c681131141` (run [42288854621](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42288854621)), including the pre-refactor ledger parity tests.
- **Measured pre-archive performance:** run [42288854738](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42288854738) completed all 108 R+ scenarios. Aggregate R+ runtime was about 820s. At 24 months it measured 3.32s versus 6.14s on main; at 60 months it measured 14.08s versus 26.80s on main. The 24-month parameter sweep reproduced the 500-versus-1,000 budget regression. The new archive implementation still requires a fresh benchmark run.
- **Persistent browser storage:** not added. The useful overlap is within one search, so in-memory per-run maps are the correct layer. Persisting intermediate nodes across runs would require full simulation, product-catalogue, algorithm-version and runtime fingerprints, plus invalidation and serialization costs. IndexedDB is deferred unless repeat-run evidence justifies caching completed simulation results.
- **Web defaults:** aligned the browser's initial Absolute R+ settings with the benchmark baseline (beam 96, local branches 48, decision cap 5,000). The 24-month parameter sweep showed beam 256 took about 14.7s versus about 6.2s at beam 96 without improving the reported net interest; the tested local-branch sweep from 16 through 128 also produced the same reported objective. Explicit imported `null` caps remain uncapped. The report now discloses search states and whether optimality was proven, including the applicable beam/local/budget limits.
- **UI regression tests:** verify the bounded web defaults, preserve explicit imported `null` caps as uncapped, and assert the report discloses bounded-search optimality. Goal-mode tests assert the raw-state memo remains unused in Goal mode.
- **Raw-state memo regression:** an Absolute R fixture with equivalent standard/eFD products reaches the same raw future state through separate branches; the test asserts a positive memo hit and prune before state advancement.
