# Search budget calibration

**Run:** [GitHub Actions search-budget calibration #42566748203](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42566748203)  
**Branch:** `audit/owner-feedback-followups`  
**Runner:** GitHub-hosted Ubuntu, Node.js 22  
**Date:** 9 November 2026

## Matrix

The controlled matrix compared four expanded-state caps (5,000, 10,000, 20,000, unlimited) against three cooperative time budgets (15, 30, 60 seconds). Beam width and local branch limit were held at the browser defaults (256 and 128). All cases used the same deterministic inputs.

### Harder 60-month scenario

- Starting capital: LKR 1,000,000 across three accounts and three banks.
- Horizon: 60 months.
- Monthly inflow: LKR 10,000 into the first account.
- Monthly strict outflow: LKR 5,000 from the first account.
- AIT enabled; no compounding.
- Search strategy: Absolute R+.

| Time budget | Runtime range | Expanded states | Net interest after AIT | Final value after AIT | Bookings |
|---:|---:|---:|---:|---:|---:|
| 15 s | 15.17–15.59 s | 1,493–1,510 | LKR 746,112.45 | LKR 2,346,112.45 | 45 |
| 30 s | 30.18–30.71 s | 2,647–2,765 | LKR 746,112.45 | LKR 2,346,112.45 | 45 |
| 60 s | 60.19–61.00 s | 4,288–4,311 | LKR 746,112.45 | LKR 2,346,112.45 | 45 |

All 12 combinations returned the same financial result, 45 bookings and LKR 285 transfer fees. The 5,000-state cap was not reached even in the longest run; therefore the 10,000, 20,000 and unlimited caps also did not bind. The 15/30/60-second time budgets did bind and increased explored states, but did not improve the selected financial result in this scenario.

Search remained bounded by beam/local pruning: approximately 62k–63k beam prunes and 43.7k local-combination prunes at 15 seconds; approximately 121k–126k and 74.4k–76.4k respectively at 30 seconds; approximately 250k–254k and 252k–260k at 60 seconds.

**Important:** `optimality_proven` was false in every case. Identical results do not establish global optimality; they show only that the extra search budget did not improve the best candidate found under the fixed beam width/local branch limit.

### 24-month baseline control

A smaller 24-month, LKR 300,000, three-bank scenario without scheduled inflows/outflows was also run across the same 12 combinations:

- Runtime: 4.58–5.28 seconds.
- Expanded states: 1,908.
- Net interest after AIT: LKR 73,441.
- Final value after AIT: LKR 373,441.
- Transfer fees: LKR 105.
- Bookings: 8.
- All settings returned the same result; neither time nor state limits bound.

## Recommendation

1. **Keep the browser defaults at 10,000 expanded states / 30 seconds.** The 10k cap is comfortably above the 4.3k states reached in the harder test, and 30 seconds provides headroom over the 15-second result without the doubled runtime of 60 seconds.
2. **Keep explicit unlimited/longer-running controls.** A user running a more complex portfolio should be able to opt into a longer time budget and an uncapped state limit.
3. **Do not lower the state cap to 5,000 from this evidence alone.** It did not bind in these scenarios, but the test matrix is not an exhaustive portfolio distribution.
4. **Do not increase the default time budget to 60 seconds.** It doubled runtime without changing the candidate on the tested scenarios.
5. **For a quality improvement, benchmark beam width and local branch limit next.** The pruning counts are much larger than the number of expanded states, so those controls may have more influence than simply raising the state cap.

## Limitations and follow-up

- Measurements are runner-specific; runtime values are not user-device performance guarantees.
- The calibration uses one harder deterministic scenario plus one smaller control. Add varied account counts, bank counts, capital distributions, payout types and outflow policies before changing defaults.
- The search does not prove optimality in these runs. The UI/report must continue to distinguish a valid result from an optimality proof.
- The workflow uploaded the full 12-row JSON result as the artifact attached to the linked Actions run.
