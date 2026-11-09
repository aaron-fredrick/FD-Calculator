# Strategies and search audit

## Scope

Reviewed Greedy, GSS, Absolute R, Absolute R+, shared search primitives, search scoring/pruning, path replay, diagnostics, worker orchestration and the test inventory for strategy parity.

## Findings

### SEARCH-01 — Scoped Absolute R+ has no default expansion budget or post-start execution timeout

**Current status: IMPLEMENTED in PR #75.** Browser configuration now defaults to 10,000 expanded states and 30 seconds, with explicit unlimited controls, cooperative time-budget stopping, optimality diagnostics, cancellation and a post-start worker watchdog. Regression coverage was added. The owner confirmed these as the baseline defaults and requested a controlled 5k/10k/20k/uncapped comparison with 15/30/60-second budgets. Measure result quality, search diagnostics and runtime; the comparison has not yet been executed.

**Severity: P2**

**Evidence:** [SearchStrategyBase constructor L1342-L1357](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/strategies/search-strategy-base.js#L1342-L1357) defaults `max_decisions` to `null). [GAML run loop L1246-L1284](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/strategies/search-strategy-base.js#L1246-L1284) continues while the beam is non-empty and only enforces a cap when one is configured. The UI leaves the decision-cap field blank by default ([app.js L76](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js#L76)). The worker runner clears its handshake timer after the worker sends `started` ([simulation-runner.js L184-L193](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/simulation-runner.js#L184-L193)); there is no execution deadline after that acknowledgement.

**Impact:** a large or pathological scenario can keep a worker occupied for an unbounded duration. The UI shows elapsed time but has no explicit cancel action. A worker protects the main thread from synchronous search work, but it does not guarantee bounded resource consumption or a clear user recovery path.

**Recommendation:** add a documented default decision/time budget for browser runs, expose “cancel”, and enforce a post-start deadline. When a budget stops search, surface `optimality_proven: false` and the exact budget/expanded-state count. Keep an explicit opt-in for unbounded CLI runs if needed.

### SEARCH-02 — Large strategy modules concentrate several independent responsibilities

**Current status: OPEN.** No module extraction/refactor has been applied; preserve the current parity tests while planning any decomposition.

**Evidence:** [search-strategy-base.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/strategies/search-strategy-base.js) is a large shared module containing state representation, option selection, cache management, branch expansion, bounds, scoring, beam search, exhaustive search, goal evaluation and path replay. [gss.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/strategies/gss.js) is also a large strategy module with recursive planning and execution logic.

**Impact:** changes to one search concern can affect several modes. The cost is not merely file length: it is the number of domain responsibilities and invariants that must be held in working memory during a change.

**Recommendation:** after correctness findings are resolved and parity tests are stable, extract cohesive modules such as search-state/keying, bounds and scoring, expansion generation, beam/exhaustive orchestration, and path replay. Keep strategy contracts small and avoid splitting into one-function files.

### SEARCH-03 — GSS and search paths contain independent future-planning logic that needs continued parity protection

**Current status: OPEN / ongoing control.** Existing parity and runtime-replay tests are positive controls, but the independent planning logic remains and new event/fee/product rules still require cross-strategy parity fixtures.

**Evidence:** [gss.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/strategies/gss.js) contains its own future liquidity reservation, plan generation and recursive wait/reforecast paths; [search-strategy-base.js](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/strategies/search-strategy-base.js) also constructs hypothetical future states before replaying a selected path through `SimulationEngine`.

**Impact:** a financial rule added to the authoritative runtime can be omitted or implemented differently in a hypothetical planner. The replay step is a useful safety boundary, but it does not prove that candidate generation explores every valid path.

**Recommendation:** keep one authoritative execution engine. Treat planners as candidate generators and add parity fixtures for every new event type, outflow policy, fee rule, payout type and account constraint. Where a planner intentionally approximates, document the approximation and diagnostics.

## Existing strengths

- Greedy is an explicit baseline and Absolute R+ compares candidate paths against it before selection.
- Absolute R+ exposes beam pruning, local-combination pruning, expanded states, cache statistics, search settings and optimality status.
- The search code uses bounded caches and state memoization rather than unbounded memo maps.
- Path replay through `SimulationEngine.runUnfinalized` checks that selected candidate actions are executable by the runtime.
- The tests include legacy-oracle and parity suites for Greedy, GSS and search strategies, plus search primitives and goal-objective tests.

## Strategy-specific notes

- **Greedy:** suitable as a fast heuristic, not a proof of global optimality. The UI description correctly communicates that limitation.
- **GSS:** preserve its liquidity reservation and split/consolidate constraints with targeted regression fixtures. Avoid treating its best plan as a global optimum unless the search space is formally covered.
- **Absolute R:** exhaustive branch-and-bound can be expensive; it is CLI-only in the browser workflow and should remain clearly identified as a potentially costly exact search.
- **Absolute R+:** beam search is bounded by width and optional decision/local-branch caps. Beam pruning means a globally optimal result is not generally guaranteed; the result's optimality diagnostic must remain visible.

## Tests to add

- A deterministic scenario that reaches the default browser search budget and proves graceful termination.
- Cancellation during a long-running worker computation and immediate recovery on the next submission.
- Parity cases for new fee, payout, eligibility and outflow rules across GSS/search planning and runtime replay.
- Regression tests that assert diagnostics correctly distinguish exhaustive proof, beam pruning and decision-budget termination.
