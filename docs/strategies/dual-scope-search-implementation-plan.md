# Dual-Scope Search Strategies — Implementation Plan

## Status and authority

This document is the execution contract for extending the existing search strategies to operate correctly in both **scoped date-range mode** and **goal mode**. All implementation work for this task must remain on `feature/dual-scope-strategy-planning`.

Work proceeds phase by phase in this document. A phase is not complete merely because code has been written: its acceptance checks must pass, findings must be reviewed against the objective and project constraints, and any regression must be corrected before the next phase begins. Update this document as decisions, evidence, and completion status change. If implementation evidence contradicts this plan, stop that specific change, re-analyse the design, document the correction here, and then continue.

Do not merge this branch without explicit authorization.

## Objective

Make **GSS, Absolute, and Absolute+ independently usable in both simulation scopes** while retaining each strategy's search identity and preserving the existing scoped-mode result quality, decisions, diagnostics, and practical performance.

- **Scoped mode:** optimise the existing finite date-range objective. This is the compatibility baseline; its established behaviour must not be weakened to accommodate goal mode.
- **Goal mode:** optimise the time to first valid achievement of the configured cumulative net interest actually credited to the consolidation account. The shared runtime remains authoritative for actual accounting and termination.
- **Greedy:** explicitly out of scope for strategy-policy changes. It remains the single-plan executor using the shared runtime boundary to stop when the goal is achieved.

The internal 30-year goal horizon is a safety boundary, not a user-selected optimisation date and not a reason to optimise for 30-year terminal portfolio value.

## Verified starting point on main

Starting commit: `1f57da418ae32f2895207a4d262cf4da67ae06be`.

The existing implementation is materially further along than an earlier high-level assessment implied. The following facilities already exist and must be reused rather than duplicated:

- `createSimulationContext()` normalises scoped/goal mode and supplies the internal 30-year goal safety horizon.
- `SimulationRuntime` and `SimulationEngine` own event execution, goal accounting, stopping and finalisation.
- `BalanceProvenance` tracks principal, uncredited interest and counted interest through accounting operations.
- `search-strategy-base.js` already contains goal candidate replay through the authoritative `SimulationEngine`, a goal score comparator, and goal-mode search branches.
- Absolute and Absolute+ are thin strategy wrappers over the shared `SearchStrategyBase`; they share transition generation but use different search drivers/settings.
- GSS has its own recursive hypothetical planner and is not implemented through the Absolute search engine.
- Existing Absolute/Absolute+ branch generation still contains fixed-horizon interest ranking and fixed-horizon upper-bound/priority logic. Goal-aware candidate replay alone does not guarantee that a fastest-achievement path survives branch ordering or bounded pruning.
- Existing GSS planning receives the simulation horizon and forecasts against it, but its candidate ordering and plan selection are not explicitly ranked by the configured goal's earliest achievable credit date.
- The existing goal implementation plan is `docs/strategies/goal-achievement-implementation-plan.md`. This document is a follow-on strategy-optimisation plan, not a replacement for the shared accounting/runtime contract in that document.

These observations are an initial source audit, not a substitute for the detailed per-phase code review.

## Non-negotiable design constraints

1. **No Greedy policy changes.** Do not add goal-aware product selection or scope-aware planning to Greedy.
2. **Preserve scoped execution.** The scoped branch scores, terminal-value objective, admissible bounds, memo/dominance behaviour, local candidate ordering, GSS candidate order, recursive forecasts, and configured limits must remain equivalent to the pre-change implementation unless a separately proven bug requires a documented correction.
3. **No accidental hot-path tax in scoped mode.** Select the objective once at the strategy/context boundary where practical. Do not add repeated goal checks, provenance replay, or goal-only state fields to the scoped expansion loop.
4. **Keep strategy mechanics distinct.** GSS remains recursive; Absolute remains exhaustive branch-and-bound; Absolute+ remains bounded layered/beam search. Share only genuinely common goal accounting/scoring/state utilities.
5. **Runtime is the accounting authority.** Search estimates are heuristics only. Any candidate used for final goal scoring must be replayed through the authoritative simulation accounting path or be validated against an equivalent proven-exact calculation.
6. **No unsafe pruning.** A branch may be pruned only when the bound/dominance rule is admissible for the active objective. Goal-mode pruning must not inherit a terminal-portfolio bound merely because it is valid for scoped mode.
7. **Honest proof status.** Report optimality only when the selected search is exhaustive and every relevant pruning rule is proven safe for that objective. Beam/local truncation, decision-budget exhaustion, or heuristic pruning must mark the result incomplete.
8. **No false success.** Never describe a target as achieved from projected interest, gross interest, principal, non-consolidation credits, or a candidate estimate. Use actual credited net interest from runtime replay.
9. **Date-independent goal semantics.** The user supplies a start date and goal target, not a goal end date. The internal safety horizon remains fixed and must not leak into goal objective scoring as a user scope.
10. **Document and test all contract changes.** Keep implementation, schema/validation if affected, strategy documentation, web/CLI documentation, sensitive/regression tests, and benchmark methodology aligned.

## Goal objective

The primary goal-mode ordering is:

1. An actually achieved candidate outranks an unachieved candidate.
2. Among achieved candidates, the earliest achievement date wins.
3. For same-date achievers, preserve the established goal contract: higher actual net interest credited at that achievement boundary wins.
4. Then prefer lower transfer fees.
5. Then fewer operations.
6. Then higher remaining portfolio value and stable deterministic tie-breakers.

For unachieved candidates, rank by:
1. Whether the candidate remains feasible within the safety horizon, where this can be established.
2. Earliest optimistic feasible achievement date / best defensible progress estimate.
3. Lowest remaining target shortfall at the safety boundary.
4. Lower fees and operational burden.
5. Remaining portfolio value and deterministic tie-breakers.

Do not treat a heuristic estimate as a proof of feasibility or optimality. If an admissible earliest-achievement lower bound cannot be established, use it only for ordering, not pruning. Preserve the existing comparator semantics unless a demonstrated defect and explicit project-level decision justify changing them.

## Phase 0 — Source audit and baseline (must precede strategy changes)

### Source map and verified findings

- **Shared context:** `createSimulationContext()` supplies the 30-year safety horizon in goal mode. `SearchStrategyBase.createContext()` copies the simulation mode and treats that horizon as `endDate`; the search then uses it for FD eligibility and event projection.
- **Absolute/Absolute+:** `expandState()` still generates local and consolidation branches using total post-AIT tenor interest. `allLocalCombinations()` truncates partial combinations only when a local-branch limit is configured (Absolute uses exhaustive combinations; Absolute+ defaults to 128). `buildConsolidationBranches()` orders by projected tenor interest less fees.
- **Absolute goal path:** goal mode disables the scoped terminal-value upper-bound and memo pruning. It replays paths that can credit the consolidation account and prunes states strictly after the best achieved date. The search driver currently returns `optimalityProven: true` unconditionally; this requires proof review against option dominance, event coverage, and date pruning before retaining that claim.
- **Absolute+ goal path:** candidate replay and earliest-achievement comparison already exist, and the goal search defaults to 5,000 expanded states. However, its beam priority still calls the fixed-horizon `makePriority()`/`makeUpperBound()`; local branch truncation still ranks total tenor interest; `waitFirst` compares future annual rates; and beam deduplication uses `stateKey()` containing only date, scalar balances, aggregate pending flows, obligations and paid outflows. Distinct action histories/provenance can therefore collapse into one state before replay.
- **Search state:** the search engine models pending flows as date/account/amount triples, not principal-versus-interest components. The authoritative `BalanceProvenance` is already implemented in the runtime, but it is not represented in these hypothetical search states. Goal-mode state equivalence must preserve distinct histories unless a safe provenance-aware equivalence is proven.
- **GSS:** `createSession()` passes the simulation mode and goal target into `#planHypothetically()`. Goal planning evaluates candidate plans against projected consolidation-credit schedules. A consolidation transfer permanently removes cash from its source account, so source-account obligations must remain reserved through the remaining simulation horizon, net of intervening inflows/cash flows; reserving only through the target FD maturity is unsafe because the principal matures in the target account. Split bookings remain in their source account and can re-evaluate liquidity at maturity.
- **Existing compatibility evidence:** `tests/js/search-parity.test.js` compares Absolute and Absolute+ against the legacy search oracle; `tests/js/gss-parity.test.js` compares GSS against its legacy oracle. These are exact scoped-ledger/diagnostic regression gates and must remain intact.
- **Greedy:** no change is planned. The engine's shared runtime owns goal stopping for Greedy and all strategies.

### Baseline evidence (before strategy source changes)

- Draft PR #55's documentation-only head `8feffdc0456e388e7026fa4c8a0923391b890368` ran the existing Node.js 22 suite: **158 passed, 0 failed, 0 skipped** (reported test duration 993.327965 ms). The JavaScript syntax-check workflow also completed successfully. Dependency review passed. Build and CodeQL were still in progress at the time of this record.
- Existing fixed-horizon benchmark artifact `docs/strategies/benchmarks/results.json`, generated `2026-11-05T09:00:44.315Z`, provides a 24-month, LKR 300,000, three-account/three-bank, AIT-on/simple-interest reference using DFCC, Commercial Bank and NDB: Greedy LKR 61,886.03 net interest / 10 bookings / 5 ms; Absolute+ LKR 61,886.03 / 10 bookings / 2,791 expanded states / 6,468 ms / not proven optimal; GSS LKR 59,421.46 / 1 booking / 2 ms. Timings are historical runner-specific measurements, not portable performance guarantees.
- The existing Absolute+ search sensitivity artifact records the same LKR 61,886.03 net interest across its 15 scoped parameter points; at the baseline setting (beam 96, local limit 48, cap 5,000) it expanded 2,791 states, pruned 72,870 beam candidates and 12,912 local combinations, and did not prove optimality.
- No clean, dedicated pre-change benchmark was captured for this new strategy-scope work. The existing benchmark artifacts and legacy parity tests are the available baseline. In particular, the archived fixed-horizon matrix does not include Absolute. A dedicated Absolute performance comparison must therefore be added or explicitly marked unavailable; do not fabricate one.

### Work
- Re-read the current branch source and this plan before each new phase; record the actual branch head and changed-file set.
- Map the full strategy flow from context construction through candidate generation, search expansion, state equivalence/dominance, candidate replay, session output, runtime execution and reporting.
- Identify every use of `endDate` / `context.end` that affects product eligibility, cash-flow projection, liquidity reservation, branch score, upper bound, waiting policy, stopping, or terminal value. Classify it as:
  - actual simulation/safety boundary;
  - scoped objective horizon;
  - candidate feasibility constraint;
  - search heuristic only.
- Audit existing goal scoring, replay, provenance, search diagnostics and proof-status handling. Do not duplicate existing implementations.
- Establish a reproducible scoped baseline using current main fixtures and representative real catalogue scenarios for GSS, Absolute and Absolute+. Record result values, selected decisions/signatures where deterministic, expanded/pruned states, GSS recursion diagnostics, and runtime where it can be measured consistently.
- If no clean pre-change benchmark can be executed or recovered, explicitly mark that limitation and use deterministic regression/oracle fixtures as the hard compatibility gate; do not invent benchmark numbers.

### Acceptance
- A written source map identifies the real goal/scoped divergence points and existing reusable primitives.
- Baseline commands, fixtures, outputs and limitations are recorded.
- No strategy implementation changes are made until the baseline is captured or its unavailable portions are explicitly explained.

## Phase 1 — Shared goal-search foundations

### Work
- Reconcile the goal comparator with the objective hierarchy above. Preserve established semantics unless evidence demonstrates a defect; in particular, test whether same-date lower overshoot is more correct than maximising credited amount.
- Audit candidate replay settings and result metadata. Ensure replay uses the same financial assumptions, accounts, cash flows, fees, goal target and safety boundary as the candidate search.
- Audit state keys and dominance rules. Determine which state attributes can change future consolidation-credit timing: date, balances, pending payout schedules, inflows, obligations, paid outflows, account/product eligibility and any necessary provenance. Add only the minimum goal-relevant information.
- Reuse existing `BalanceProvenance` for accounting. Do not assume the search simulator's scalar balances carry sufficient provenance; prove whether search states need provenance or whether exact replay can safely defer provenance until leaf evaluation.
- Separate objective-specific evaluation/ranking from strategy-specific exploration without forcing a large generic policy framework.
- Correct `optimality_proven` and completion diagnostics where they overstate proof.

### Acceptance
- Unit tests cover comparator ordering, replay parity, state equivalence/dominance safety, and honest proof status.
- Scoped objective and its hot path remain unchanged.
- Candidate replay agrees with actual runtime goal accounting on adversarial accounting cases.

## Phase 2 — GSS goal-aware recursive planning

### Work
- Preserve the recursive GSS planner, forecast contraction, parent-goal ownership, event advancement, liquidity protection, and current scoped candidate order.
- Introduce goal-mode-specific plan evaluation: compare viable SPLIT/CONSOLIDATE plans by their earliest actual or safely projected consolidation-credit schedule, not simply total tenor interest.
- Evaluate more than the first viable plan when a later-ranked plan may achieve the target sooner. Keep candidate/path alternatives only where needed; avoid turning GSS into exhaustive Absolute search.
- Make recursive waiting and interim booking choices goal-aware. A booking is useful only if its payout/maturity schedule advances earliest target achievement without violating parent liquidity or outflow obligations.
- Use actual event schedules and AIT-adjusted payouts. Transfer fees and consolidation destination matter.
- Stop hypothetical planning work when the goal objective is resolved or when no future events can change the relevant outcome, without confusing the 30-year safety horizon with a target date.
- Replay/validate the chosen plan through the shared runtime; runtime still owns final stopping.

### Acceptance
- Scoped GSS decision logs and outputs match the baseline fixtures.
- Goal-mode adversarial tests cover multiple candidates, multiple accounts, periodic/cumulative/installment payouts, AIT, fees, inflows, parent recursion, interim bookings, outflows/liquidity and unreachable goals.
- Goal-mode candidate choice improves or preserves earliest achievement against a deterministic exhaustive oracle on small scenarios.
- No GSS fallback to Greedy, Absolute or Absolute+ is introduced.

## Phase 3 — Absolute goal-aware exhaustive search

### Work
- Preserve scoped Absolute branch-and-bound, terminal portfolio scoring, upper bounds, memoisation and local combination ordering.
- For goal mode, change branch generation/order so it does not discard a fast-credit path because its total tenor interest is lower.
- Define a goal-specific admissible bound or disable pruning that cannot be proven safe. The scoped terminal-value bound is not automatically a valid earliest-achievement bound.
- Evaluate candidate goal paths by authoritative replay; keep actual credited interest and achievement date as the result authority.
- Establish state equivalence/dominance with pending payout timing and account destination in mind. Do not merge states that have different future credit schedules.
- Make proof status conditional on exhaustive completion and proven-safe goal pruning.

### Acceptance
- Scoped Absolute fixtures, decision signatures, results and diagnostics match baseline.
- Small goal scenarios match an exhaustive reference oracle for earliest achievement and tie-breaks.
- An adversarial case where a lower-total-interest path achieves earlier is retained.
- Search completion and optimality metadata are truthful.

## Phase 4 — Absolute+ goal-aware bounded search

### Work
- Preserve scoped Absolute+ beam priority, local ordering, root diversity and limits.
- Goal mode requires its own local-branch ranking and beam priority. Fixed-horizon terminal-value heuristics may be retained only as secondary tie-breakers, never as the primary goal objective.
- Rework `waitFirst`: waiting must be justified by an expected improvement in earliest goal achievement, not merely a higher annual rate or a future inflow.
- Preserve diversity across payout schedules, consolidation destinations, account allocations and roots that have materially different credit dates.
- Track all truncation sources (beam, local branches, decision cap) and any goal-specific pruning. Any truncation that can discard a better achievement path invalidates global optimality proof.
- Ensure the goal-mode default budget remains explicit and unchanged unless measured evidence justifies a separate reviewed change.

### Acceptance
- Scoped Absolute+ results, selected decisions, settings and diagnostics match baseline.
- Adversarial goal scenarios retain the fastest path even when its projected total interest is lower.
- Search budget exhaustion and pruning are visible and never reported as proven optimal.
- Goal results are replayed through the authoritative runtime.

## Phase 5 — Cross-scope regression, sensitivity and hardening

### Work
- Test each strategy under both scopes with identical financial inputs wherever the scope semantics permit.
- Cover target size, capital, account count, bank diversity (DFCC, Commercial Bank, NDB), inflow timing/size, product eligibility/eFD, AIT, payout type/frequency, fees, maturity alignment and outflow obligations.
- Include adversarial scenarios: short low-rate FD vs long high-rate FD; multiple payout streams; future lump inflow; goal reached mid-period; target just above/below a payout; unreachable target; different provenance with same scalar balance; identical-date ties; high transfer fees; same-day credits.
- Run the existing scoped sensitivity benchmark and compare to the captured baseline. Separate algorithmic result regressions from expected machine/runtime noise.
- Measure goal achievement date, credited net interest, overshoot/shortfall, fees, operations, expanded/pruned states, recursion depth, runtime and proof status.
- Verify goal planning/execution does not unnecessarily process to the 30-year horizon after achievement or after all relevant events are exhausted.

### Acceptance
- All tests pass.
- Scoped outputs and deterministic decisions match baseline; any deliberate correction is isolated, justified, and separately tested.
- No material scoped performance regression is introduced. Report measured deltas and runner conditions; do not claim equivalence based on a single noisy timing sample.
- Goal strategy outcomes are validated against oracle scenarios and runtime replay.

## Phase 6 — Documentation, schemas, web/CLI and release verification

### Work
- Update `docs/strategies/GSS.md`, `ABSOLUTE.md`, `ABSOLUTE-PLUS.md`, strategy overview/benchmark docs, and the existing goal implementation plan where its status or contract becomes stale.
- Update schemas, semantic validation, CLI/browser-facing docs and sensitive tests only if the public configuration or reporting contract changes. Keep scoped and goal config semantics consistent.
- Update benchmark artifacts only from measured runs. Do not leave placeholders presented as results.
- Run complete Node tests, syntax/build checks, documentation build, dependency review, and relevant security workflows. Inspect the latest CI checks on the final branch commit.
- Review the final diff against this plan and the FD Cal project conversation context.

### Acceptance
- Documentation accurately distinguishes scoped optimisation from goal achievement search and strategy mechanics.
- Schema/validation/docs/tests are mutually consistent.
- All relevant CI checks pass on the final implementation commit.
- This plan records evidence, unresolved limitations and completion status. The branch remains unmerged pending user review.

## Iteration protocol (mandatory)

For every phase and meaningful sub-step:

1. Read this plan and inspect the current branch head and relevant source.
2. State the specific requirement and expected code/test surface internally before changing it.
3. Implement only the smallest coherent change for that step.
4. Run the narrowest relevant tests first, then inspect the actual outputs and diffs.
5. Compare observed behaviour with the plan, the original scoped baseline, and the FD Cal project requirements.
6. If a test fails, a path is dropped, proof status is unsound, or scoped behaviour drifts: revisit the source analysis, identify the cause, fix it, and repeat verification. Do not paper over failures by weakening assertions or changing expected results without evidence.
7. Mark the step complete only with evidence (test names/results, benchmark artifact/run, or explicit explanation why a check cannot be executed).
8. Move to the next step and continue until every feasible phase is complete. Do not stop after documenting, planning, or implementing only one strategy.
9. Before declaring completion, re-read this document from top to bottom and perform a final diff, test and CI audit.

## Progress log

- [ ] Absolute+ local-truncation correction: partial combinations now accumulate goal-specific payout scores instead of fixed-horizon tenor interest; regression verifies a bounded search retains a 30-day goal path over a higher-interest 60-day alternative. Verification pending.

- [ ] GSS liquidity correction: source-account consolidation reserves now extend through the remaining simulation horizon; strict outflow beyond the first maturity and offsetting future-inflow regressions added. Verification pending on this commit.

- [x] Starting main commit identified: `1f57da418ae32f2895207a4d262cf4da67ae06be`.
- [x] Initial audit confirmed existing goal runtime, provenance, candidate replay and goal comparator; these will be reused.
- [x] Phase 0 — source audit and available scoped baseline recorded; limitation: no fresh dedicated pre-change Absolute benchmark exists.
- [x] Phase 1 — shared goal-search foundations. Reused the runtime provenance model in goal search states; preserved distinct goal action histories; retained all goal-compatible options; retained fee-heavy consolidation branches; made Absolute proof status conditional. Comparator and replay remain the existing authoritative contract.
- [ ] Phase 2 — GSS goal-aware recursive planning. Provenance-aware payout/transfer estimates, earliest-credit plan ranking, future consolidation deferral and planner stopping are implemented. The adversarial strict-outflow test exposed an unsafe source-liquidity release at the next-maturity boundary; the correction now reserves source obligations across the remaining horizon while netting scheduled inflows/cash flows. Re-run strict-outflow, offsetting-inflow, scoped parity and full CI before marking this phase complete.
- [x] Phase 3 — Absolute goal-aware exhaustive search. Goal mode avoids scoped terminal-value/memo pruning and option dominance reduction, keeps executable fee-heavy transfer branches, replays goal candidates, and reports proof only when no unsafe pruning occurred.
- [ ] Phase 4 — Absolute+ goal-aware bounded search. Provenance-aware goal state, path-sensitive deduplication, goal-credit beam priority, payout-aware option ordering and earliest-goal-date waiting are implemented. A review found that partial local-combination truncation still accumulated fixed-horizon tenor interest after sorting options by goal timing; the partial score now uses the goal score in goal mode. An end-to-end regression compares bounded Absolute+ with exhaustive Absolute on a faster, lower-interest eFD path. Re-run and verify before marking this phase complete.
- [ ] Phase 5 — cross-scope regression and sensitivity. Scoped comparison is complete: 54 Greedy/Absolute+/GSS scenario rows and 15 Absolute+ search-sweep rows match the archived baseline in every non-timing field. The 63-point goal matrix is running on the final algorithm; inspect invalid replay examples and compare outcomes before closing this phase.
- [ ] Phase 6 — docs, schema/UI alignment and release verification. Strategy, goal, CLI, lifecycle and benchmark docs have been updated. No public configuration/schema field changed; goal scope uses the existing goal contract. Final docs build, final CI/CodeQL, clean published sensitivity artifacts and diff review remain.
