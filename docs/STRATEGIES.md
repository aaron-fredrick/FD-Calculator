# Strategy guide

FD Cal provides three strategies. They differ in how much of the decision space they explore, how long they take, and whether they can prove that a result is optimal.

## At a glance

| Strategy | How it decides | Typical use | Can prove global optimality? |
|---|---|---|---|
| **Greedy** | Makes the best-looking decision available at each step, using the current situation. | Fast baseline and quick comparisons. | No |
| **GAML** | Explores several promising plans in parallel, but limits how many alternatives it keeps. | Broader exploration without the cost of a fully exhaustive search. | Only if the search completes without search limits truncating it |
| **Absolute** | Systematically explores the decision space using branch-and-bound and pruning. | Finding and proving the best result when the search can finish. | Yes, when the exhaustive search completes |

All strategies use the same underlying FD, account, cash-flow, transfer-fee and AIT modelling rules. They can choose different bookings and transfers because their search methods differ.

## Greedy

Greedy is the fast baseline. At each decision date, it evaluates the currently available account balances and eligible FD options, then chooses the best immediate plan according to its selection rules.

It can consider booking separately from multiple accounts or consolidating balances into another account before booking. Account-level eFD eligibility and transfer fees are taken into account.

Greedy does not retain a large set of alternative future plans. A decision that looks best now may prevent a more profitable combination later, so its result is a useful baseline rather than a guarantee of the best possible portfolio.

### Greedy tenor tie-breakers

Greedy exposes two independent settings, both defaulting to `shortest` to preserve the original behaviour:

- `tenor_tiebreaker`: used when selecting an FD option for an account or consolidation target. The highest annual rate remains the primary criterion; equal-rate options are resolved by shortest or longest tenor. The existing equivalent-terms eFD preference remains a subsequent tie-breaker.
- `plan_tenor_tiebreaker`: used when ranking admitted SPLIT and CONSOLIDATE plans. Plan rate remains primary, followed by the configured tenor direction, then net interest, actual transfer fees and the existing equivalent eFD preference.

Example JavaScript configuration:

~~~js
const strategy = new GreedyStrategy({
  tenor_tiebreaker: "longest",
  plan_tenor_tiebreaker: "longest"
});
~~~

The settings can be configured independently. For example, option selection can prefer the shortest FD while plan ranking prefers the longest plan tenor. A longer tenor is only a tie-break preference when the preceding rate criterion is equal; it does not imply higher total interest.

**Use it when:** you want a quick result, a baseline for comparison, or a starting solution for the search-based strategies.

## GAML

GAML is a heuristic search strategy. Instead of committing to one plan immediately, it expands multiple candidate plans in layers. It scores the resulting states and keeps a limited number of promising candidates for the next layer.

Two settings control the main search breadth:

- **Beam width** (beam_width): the maximum number of candidate states retained at each layer. A wider beam keeps more alternative plans alive for later decisions.
- **Max local branches** (max_local_branches): the maximum number of local booking combinations explored while expanding a state. A higher limit lets GAML consider more ways to split or combine available balances.

These settings limit different parts of the search. Beam width limits how many overall plans continue; max local branches limits how many combinations are considered when expanding each plan.

A larger value for either setting can improve exploration, but generally increases runtime and memory use. Increasing them does not guarantee a better result in every scenario.

### GAML settings

Example configuration:

~~~json
{
  "strategy": "gaml",
  "gaml_settings": {
    "beam_width": 256,
    "max_local_branches": 128,
    "max_decisions": null
  }
}
~~~

| Setting | Meaning |
|---|---|
| beam_width | Candidate states retained per search layer. Default: 256. |
| max_local_branches | Local booking combinations explored per expanded state. Default: 128. Set to null to enumerate all local combinations. |
| max_decisions | Optional maximum number of expanded states. Default: null, meaning no hard state-expansion budget. |

For example, raising beam_width from 256 to 512 retains more competing plans at each layer. Raising max_local_branches from 128 to 256 explores more booking combinations from each plan.

If any of these limits truncates the search, GAML returns the best solution it found; it does not establish that no better solution exists. Its diagnostics report search and pruning counts and whether optimality was proven.

**Use it when:** Greedy's result may be missing useful future combinations and you want a broader search with controllable resource limits.

## Absolute

Absolute uses exhaustive branch-and-bound search. It starts with a feasible Greedy result as an incumbent, then systematically explores alternative decisions. Branch-and-bound uses an optimistic upper bound to stop exploring paths that cannot beat the best known result; equivalent states can also be pruned.

Unlike GAML, Absolute is not designed to discard promising candidates simply to maintain a fixed-width search frontier. It can therefore be substantially more expensive, particularly when many accounts, FD products, dates or possible combinations are involved.

If the search finishes, Absolute can prove that its result is globally optimal under the configured model and constraints. If it is interrupted or otherwise does not complete, the best result found so far is not a proof.

Absolute is currently available through the CLI for internal verification and testing; it is not exposed in the web app.

**Use it when:** you need an optimality proof and the scenario is small enough for exhaustive search to complete.

## Choosing a strategy

- Start with **Greedy** to get a quick baseline.
- Use **GAML** to explore more alternatives. Increase beam width when you want more complete plans to survive between layers; increase max local branches when you want more combinations considered within each plan.
- Use **Absolute** when you need a proof of optimality and can afford potentially much longer runtimes.

Compare strategies using the same configuration and modelling assumptions. A higher reported net interest is a better result for that scenario, but only a completed exhaustive search can certify global optimality.

## Important validation note

The JavaScript strategy ports have automated tests, but their financial outputs still require regression comparison against the archived Python implementation across representative scenarios. Strategy descriptions and search diagnostics do not replace that validation.
