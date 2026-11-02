# FD Calculator

Simulate fixed-deposit (FD) investment plans across multiple banks. Compare a fast Greedy heuristic, a horizon-aware Goal-Aware Maturity Ladder (GAML), and the broader Absolute search.

## 1. Run it

Requirements: Python 3.13+ and [uv](https://docs.astral.sh/uv/).

```powershell
uv run fd_cal.py
```

Useful commands:

| Command | What it does |
| --- | --- |
| `uv run fd_cal.py` | Run using `config.json` and its configured strategy |
| `uv run fd_cal.py --strategy greedy` | Run the Greedy strategy for this run |
| `uv run fd_cal.py --strategy absolute` | Run the Absolute strategy for this run |
| `uv run fd_cal.py --strategy gaml` | Run the Goal-Aware Maturity Ladder strategy |
| `uv run fd_cal.py --config my-config.json` | Use another configuration file |
| `uv run fd_cal.py --config my-config.json --strategy greedy` | Choose both a config file and strategy |
| `uv run fd_cal.py --help` | Show command-line options |

The command-line strategy overrides `strategy` in the config for that run only; it does not edit the file.

## 2. Strategies

- **Greedy:** Selects a strong available action at each event. Fast, but not globally optimal.
- **GAML:** Uses bounded global search with maturity and contribution-aware branch ordering. It prioritises promising investment paths within a decision budget; it does not guarantee the global optimum.
- **Absolute:** Explores feasible investment paths using branch-and-bound, memoisation, and dominated-option pruning. It seeks the best result found and has no fixed decision budget, so runtime can grow sharply with scenario complexity.

All strategies use the same investment dates, accounts, inflows, FD options, fees, and interest settings. GAML and Absolute also run Greedy as a baseline. GAML plans toward the configured end date; it does not forecast future rate changes.

### Absolute search complexity

Let the configuration and search-state variables be:

- Number of accounts: $A$
- Number of effective FD options after dominated options are removed: $O$
- Number of eligible options for account $i$ at a decision date: $o_i$
- Maximum number of decision dates along a path: $K$. This depends on the investment window, scheduled inflows, and FD cash-flow/maturity dates.
- Number of pending cash-flow entries in a search state: $F$

At one decision date, the number of non-empty combinations of local bookings is:

```math
C = \prod_{i=1}^{A}(1+o_i)-1
```

The number of consolidation choices is:

```math
Q = \sum_{i=1}^{A}o_{bank(i)}
```

Here, $o_{bank(i)}$ is the number of horizon-eligible effective options for account $i$'s bank. There is also one carry-forward choice.

A configuration-level upper bound on the branching factor is:

```math
B \leq Q+C+1
  = Q+\prod_{i=1}^{A}(1+o_i)
```

This ignores current balances and minimum-deposit feasibility, so the actual branch count at a state is usually lower.

Across at most $K$ decision levels, the unpruned search tree has a worst-case size of:

```math
O(B^K)
```

A conservative time bound including local-combination generation and sorting is:

```math
O\left(B^K \left(C\log C + Q\log Q + A + F\right)\right)
```

Worst-case auxiliary space is $O(S(A+F)+K(C+Q))$, where $S$ is the number of distinct states retained by memoisation. The search stack can retain each level's generated branch lists; $S$ can also be exponential in $K$.

These are worst-case bounds, not expected runtime. Branch-and-bound, memoisation, and option pruning can reduce the explored search substantially, but do not change the exponential worst-case nature. In practice, runtime is most sensitive to the number of accounts, eligible options per account, and the number of event dates created by inflows and FD cash flows. Absolute is therefore best suited to smaller scenarios or when a thorough search is worth the additional runtime.

### Estimate Absolute search size

Run the root-level estimator against the current configuration:

```powershell
uv run search_complexity.py
uv run search_complexity.py --config path\to\config.json
```

It applies Absolute's dominated-option pruning, counts horizon-eligible options by bank, and prints conservative branching, leaf, node, time-complexity, and space-complexity estimates. It also substitutes the calculated configuration values into the complexity equations. Pending cash-flow entries (`F`) and retained memoised states (`S`) depend on the search state and are therefore labelled runtime-dependent rather than guessed. The leaf and node counts are theoretical upper bounds, not predictions of how many states Absolute will actually visit; pruning and state-dependent feasibility make actual counts scenario-dependent.

## 3. Configure `config.json`

Edit this file to describe your investment scenario. Amounts and fees are in **LKR**; rates in `options.json` are annual percentages.

### Investment period

```json
"investment": {
  "start_date": "today",
  "end_date": "2027-06-30"
}
```

- `start_date`: First date of the simulation.
- `end_date`: Last date of the simulation; it is **inclusive**.
- Dates can be `"today"` or `"YYYY-MM-DD"`. For dates relative to the start, use `"investment_start"` or `"investment_start+1m"`.

Periods use `d` (days), `m` (calendar months), or `y` (years). For example, `30d`, `1m`, and `1y`. Month-based dates follow calendar-month arithmetic, so a date near the end of a month may land on the last valid day of the target month.

### Accounts

```json
"accounts": [
  {
    "id": "com",
    "bank_key": "commercial",
    "label": "Commercial",
    "balance": 10030
  },
  {
    "id": "dfcc",
    "bank_key": "dfcc",
    "label": "DFCC",
    "balance": 0
  }
]
```

- `id`: Unique identifier used by inflows and internal transfers.
- `bank_key`: Must match a bank key in `options.json`.
- `label`: Human-readable name shown in reports; optional.
- `balance`: Starting available funds for this account.

At least one account is required. Only FD options for banks used by these accounts are loaded. Each configured bank must have a non-empty options list.

### Inflows

Inflows add money to a specific account. Use `type: "recurring"` for repeating contributions or `type: "scheduled"` for one-off/multiple explicitly dated credits. Each entry must reference an account using `account_id`.

**Recurring inflow:**

```json
{
  "name": "Monthly savings",
  "amount": 10000,
  "type": "recurring",
  "interval": "1m",
  "start_date": "2026-11-30",
  "end_date": "end",
  "account_id": "com"
}
```

**Scheduled inflow:**

```json
{
  "name": "Annual bonus",
  "amount": 50000,
  "type": "scheduled",
  "dates": ["2027-04-10", "2027-10-10"],
  "account_id": "com"
}
```

- `name`: Description shown in the run summary.
- `amount`: Amount credited on each occurrence/date.
- `type`: `recurring` or `scheduled`.
- `interval`: Required for recurring entries; examples include `1m`, `30d`, and `1y`.
- `start_date`: First recurring date. Date keywords such as `investment_start` are supported.
- `end_date`: Last recurring date, inclusive. `end` means the investment end date.
- `dates`: Required for scheduled entries; each listed date receives the specified amount.
- `account_id`: Destination account's `id`; it must match an account above.

Recurring occurrences are anchored to the first occurrence and use calendar-relative periods. For example, `1m` means one calendar month, not 30 days. Start and end dates are inclusive. An omitted `type` on a legacy inflow is treated as `recurring` for backward compatibility.

For complete standalone examples, see [examples/inflows.example.json](examples/inflows.example.json).

### FD options — `options.json`

This file defines the products the simulator can choose from, grouped by bank key.

```json
"commercial": [
  {
    "label": "12 Months",
    "period": "12m",
    "annual_rate": 10.0,
    "min_amount": 25000,
    "payout_type": "cumulative"
  }
]
```

- `label`: Product name shown in results and charts.
- `period`: FD term, such as `100d`, `6m`, or `12m`.
- `annual_rate`: Annual interest rate as a percentage, e.g. `10.0` means 10%.
- `min_amount`: Minimum principal needed to open the FD.
- `payout_type`: `cumulative` pays interest with the principal at maturity; `periodic_interest` pays interest during the term.
- `payout_period`: Required for `periodic_interest`; defines how often interest is paid, e.g. `1m` or `1y`.

Keep each bank key consistent with the accounts' `bank_key`. Verify rates, minimums, terms, and payout conditions against the bank's current published terms before relying on results.

### Transfer fees

```json
"transfer_fees": {
  "default_inter_bank_fee": 30,
  "same_bank_fee": 0,
  "custom_fees": []
}
```

- `default_inter_bank_fee`: Fee applied to transfers between different banks unless a custom fee matches.
- `same_bank_fee`: Fee for transfers within the same bank.
- `custom_fees`: Optional bank-pair overrides, each with `from_bank`, `to_bank`, and `amount`. Bank keys must match `options.json` / account bank keys.

Fees affect the simulated value, so use the fees that apply to your actual accounts.

### Interest and output settings

| Field | Meaning |
| --- | --- |
| `strategy` | Default strategy: `"greedy"`, `"gaml"`, or `"absolute"`. |
| `options_file` | FD options JSON path; defaults to `options.json`. |
| `compound` | `true` enables the simulator's compound-interest calculations; `false` uses simple-interest calculations. |
| `actual_leap_year` | `true` uses actual 366-day leap years where applicable; `false` uses a 365-day basis. |
| `show_timeline` | Show the event timeline in the terminal. |
| `show_ledger` | Show the booking ledger in the terminal. |
| `show_plots` | Generate and display charts. |
| `plot_output_dir` | Folder for saved charts; defaults to `plots`. |

Final consolidation transfers remaining account balances to the **first account listed in `accounts`**. Any applicable transfer fee is included in the simulation.

## 4. Charts and output files

With `"show_plots": true`, charts are saved to `plot_output_dir`:

- `<strategy>_account_values.png`: account value over time. GAML and Absolute include Greedy for comparison.
- `<strategy>_decision_timeline.png`: FD booking and maturity periods. GAML and Absolute include Greedy for comparison.

A relative plot path is resolved from the directory containing the selected config file. For example, `"plot_output_dir": "plots"` saves to a `plots` folder beside `config.json`. An absolute path saves to that exact location. The output folder is created if needed.

The account-value chart is an estimate for comparison: interest is shown as accruing between booking and maturity. Use the simulator's final results and cash-flow records for the calculated outcome; the chart is not a bank statement.

## 5. Before using results

1. Update `options.json` with verified, current FD terms.
2. Check minimum deposits and transfer fees.
3. Run the simulation and review the chosen bookings, final value, and interest.
4. Treat the output as a model, not a guaranteed return or financial advice.

This project simulates investment choices only. It does not open deposits, contact banks, or execute transfers.


## Cash flows

The simulator supports recurring and scheduled inflows and outflows. Both are account-specific: each entry's `account_id` must match an account in the top-level `accounts` list.

### Recurring inflow

A recurring inflow credits the same amount at each occurrence between its inclusive start and end dates.

```json
{
  "name": "Monthly salary",
  "amount": 150000,
  "type": "recurring",
  "interval": "1m",
  "start_date": "investment_start",
  "end_date": "end",
  "account_id": "com"
}
```

### Scheduled inflow

A scheduled inflow credits the amount on every date in its `dates` list.

```json
{
  "name": "Annual bonus",
  "amount": 75000,
  "type": "scheduled",
  "dates": ["2027-04-10", "2027-10-10"],
  "account_id": "com"
}
```

### Recurring outflow

A recurring outflow creates a payment obligation at each occurrence. The payment policy determines what happens if the account does not have enough available cash.

```json
{
  "name": "Monthly household expenses",
  "amount": 45000,
  "type": "recurring",
  "interval": "1m",
  "start_date": "investment_start",
  "end_date": "end",
  "account_id": "com",
  "payment_policy": "best_effort"
}
```

### Scheduled outflow

A scheduled outflow creates an obligation on each listed date.

```json
{
  "name": "University fee",
  "amount": 120000,
  "type": "scheduled",
  "dates": ["2027-01-15", "2027-06-15"],
  "account_id": "com",
  "payment_policy": "strict"
}
```

### Outflow payment policies

- `strict`: The full amount must be available in the specified account on the due date. If it cannot be paid, that simulation/search branch is invalid.
- `defer`: Pay only when the full outstanding amount is available; otherwise carry the obligation forward.
- `best_effort`: Pay whatever is available on the due date and carry the unpaid remainder forward.
- If omitted, `payment_policy` defaults to `strict`.

Unpaid `defer` and `best_effort` amounts remain account-specific liabilities and are included in the final reporting. They are not silently discarded at the end of the investment period.

### Date and event rules

- Date bounds are inclusive.
- Date keywords include `today`, `investment_start`, `investment_end` (or `end`), and relative expressions such as `investment_start+1m`.
- Recurring intervals support days (`d`), calendar months (`m`), and years (`y`). For example, `1m` is one calendar month, not 30 days.
- Recurrences are anchored to their first occurrence to avoid month-end drift.
- All scheduled dates and recurring bounds must fall within the investment period.
- On a date with multiple events, inflows and FD cash flows are credited before outflows are processed. Strategy investment decisions happen after outflow processing.

Standalone configuration examples:
- [Inflows: recurring and scheduled](examples/inflows.example.json)
- [Outflows: recurring, scheduled, and payment policies](examples/outflows.example.json)

