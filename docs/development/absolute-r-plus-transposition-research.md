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

## Planned implementation phases

### Phase 0 — Research and baseline
- [x] Read current state identity, state advancement, memo, beam loop, candidate replay and test conventions.
- [x] Inspect latest main benchmark logs and record measured baseline.
- [ ] Inspect all state transitions and canonical ordering, including booking-created timeline events and outflow obligations.
- [ ] Add focused instrumentation/tests to distinguish duplicate-state hits, better-path revisits, memo evictions and actual repeated expansions.
- [ ] Reproduce the non-monotonic decision-budget result with a small deterministic fixture and the full benchmark fixture.

### Phase 1 — State identity and expansion reuse design
- [ ] Prove scoped state equivalence from the transition implementation.
- [ ] Define cache entry lifecycle: unseen, expanding, expanded; never treat partial expansion as complete.
- [ ] Cache only deterministic, fully generated scoped child expansions. Rebuild each candidate's node/path from its own parent so path/root metadata is not shared incorrectly.
- [ ] Keep Goal mode entirely outside the new cache.
- [ ] Preserve bounded memory; record hits, misses, evictions and maximum entries.

### Phase 2 — Correctness tests
- [ ] Same-state/same-path duplicate is not expanded twice.
- [ ] Same-state/better-operation-count arrival reuses children but retains the better parent path.
- [ ] State differences in date, balance, flow date/amount/account, obligation, paid amount and other future-relevant fields do not collide.
- [ ] Booking-created maturity and periodic payout events remain represented.
- [ ] Root diversity remains intact in R+.
- [ ] Goal-mode behaviour and legacy parity remain unchanged.
- [ ] Strict-outflow and provenance adversarial cases remain valid.

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
