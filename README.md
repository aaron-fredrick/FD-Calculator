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
Q = \sum_{i=1}^{A}o_i
```

Here, $o_i$ is the number of horizon-eligible effective options that account $i$ is allowed to use, after applying its `supports_efd` setting. There is also one carry-forward choice.

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

Edit this file to describe your investment scenario. Amounts and fees are in **LKR**; FD rates are annual nominal percentages loaded from the bank-specific CSV files under `data/fd_options/`.

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
"accounts": {
  "com_savings": {
    "bank_id": "LK_COMMERCIAL_BANK_OF_CEYLON",
    "label": "Commercial Savings",
    "balance": 10030,
    "supports_efd": true
  },
  "dfcc_savings": {
    "bank_id": "LK_DFCC_BANK",
    "label": "DFCC Savings",
    "balance": 0,
    "supports_efd": false
  }
}
```

- The dictionary key is the unique account ID. Use that exact key as `account_id` in inflows and outflows.
- `bank_id`: Must exactly match the `id` column in `data/banks/banks.csv`. Do not use a bank name or an FD-options `bank_key`.
- `label`: Human-readable account label shown in reports; optional.
- `balance`: Starting available funds for this account.
- `supports_efd`: Whether this specific account can open eFDs. Defaults to `true`; set it to `false` for standard-FD-only accounts.

At least one account is required. Multiple account IDs may reference the same `bank_id`; balances and eFD capabilities remain independent. The bank ID is resolved to the internal FD-options index entry when products are loaded. All standard and eFD products for configured banks are loaded; product eligibility is applied per destination account. During consolidation, any account may supply funds, but an eFD booking can only be made in an eFD-enabled destination account.


### Decision log

The event timeline records facts; the booking ledger describes FD contracts. The Decision Log is a separate JSON output file, not terminal output. It records the account balances available before each action, same-day inflows/outflows/transfers/maturities, the action taken, selected FD terms and expected interest, eligibility/minimum-deposit rationale, and the next scheduled milestone.

For GAML and Absolute, the file contains the final replayed path only. It does not list rejected branches, search-tree nodes or alternative leaves. Search alternatives remain available as aggregate outcome information in the simulation summary. The output path is configured with `decision_log_output_file`; relative paths are resolved beside the selected config file.


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

### FD options — bank-specific CSV files

FD options are stored under `data/fd_options/`:

- `fd_options.csv`: index mapping each canonical `bank_id` to its bank-specific options CSV; `bank_key` is retained only as an internal routing key.
- `banks/<bank_id>.csv`: the bank's individual FD products, nominal rates, minimum amounts, payout frequencies, eFD status, and source metadata.

The runtime validates each configured `bank_id` against `data/banks/banks.csv`, resolves it through the FD-options index, and opens only the required bank files. The index's `bank_id` must match the bank catalogue; `bank_key` is an internal file-routing key, not a user configuration key.

The CSV index is the default and supported runtime source. Standard and eFD rows are both loaded; account-level `supports_efd` determines which account may book each product. There is no global eFD filter.

Each bank CSV uses these main fields:

| Field | Meaning |
| --- | --- |
| `name` | Product/option label displayed by the simulator. |
| `period` | Deposit term, e.g. `100d`, `6m`, `12m`. |
| `annual_rate` | Nominal annual interest rate as a percentage; e.g. `10.5` means 10.5%. |
| `min_amount` | Minimum principal required to open the FD, in LKR. |
| `payout_type` | `cumulative` pays at maturity; `periodic_interest` pays during the term. |
| `payout_period` | Frequency for periodic interest, e.g. `1m`, `3m`, `6m`, or `1y`. |
| `eFD` | Boolean product flag. `true` is eFD; `false` is standard FD. |
| `currency` | Product currency. |
| `source_url`, `source_effective_date`, `source_type`, `notes` | Provenance and research notes; retained in the dataset for auditing. |

AER is intentionally not used as the simulator's annual rate. The nominal rate and payout frequency are represented separately so periodic-interest products are modelled using the bank's stated nominal rate.
If a bank CSV row omits `min_amount`, the loader falls back to LKR 25,000 for Commercial Bank, LKR 10,000 for DFCC, and the general LKR 25,000 default for other banks. Commercial Bank standard-FD rows currently use LKR 25,000 as a configured fallback because the Key Facts Document's revision date and current applicability could not be verified; eFD rows also use LKR 25,000.

Rates, minimums, terms, and payout conditions can change. Verify the source schedule before relying on a simulation. Rows without verified rates are not invented or silently filled.

The bank-specific CSV index is the supported options source. The older `options.json` format is no longer part of the active configuration schema.

### Transfer fees

```json
"transfer_fees": {
  "default_inter_bank_fee": 30,
  "same_bank_fee": 0,
  "custom_fees": []
}
```

- `default_inter_bank_fee` and `same_bank_fee`: Fallback values when the bank catalogue does not provide a fee.
- `custom_fees`: Optional bank-pair overrides, each with `from_bank_id`, `to_bank_id`, and `amount`. Both IDs must match `data/banks/banks.csv`. Overrides are directional and take precedence over catalogue defaults. Catalogue inter-bank fees are selected using the sending bank.

Fees affect the simulated value, so use the fees that apply to your actual accounts.

### Interest and output settings

| Field | Meaning |
| --- | --- |
| `strategy` | Default strategy: `"greedy"`, `"gaml"`, or `"absolute"`. |
| `options_file` | FD options CSV index path; defaults to `data/fd_options/fd_options.csv`. |
| `compound` | `true` enables the simulator's compound-interest calculations; `false` uses simple-interest calculations. |
| `actual_leap_year` | `true` uses actual 366-day leap years where applicable; `false` uses a 365-day basis. |
| `show_timeline` | Show the event timeline in the terminal. |
| `show_ledger` | Show the booking ledger in the terminal. |
| `decision_log_output_file` | JSON file for the selected-path decision log; defaults to `decision_log.json` beside the config file. |
| `show_plots` | Generate and display charts. |
| `plot_output_dir` | Folder for saved charts; defaults to `plots`. |

Final consolidation transfers remaining account balances to the account referenced by `consolidation_account_id`. That value must match an account ID under `accounts`. Any applicable transfer fee is included in the simulation.

## 4. Charts and output files

With `"show_plots": true`, charts are saved to `plot_output_dir`:

- `<strategy>_account_values.png`: account value over time. GAML and Absolute include Greedy for comparison.
- `<strategy>_decision_timeline.png`: FD booking and maturity periods. GAML and Absolute include Greedy for comparison.
- `<strategy>_cash_flows.png`: dated positive and negative cash movements, including new money, FD payouts and maturities, outflows, FD investments, and transfers in/out. When Greedy comparison is available, it appears in a second panel.
- `decision_log.json` (or the configured filename): structured chronological decisions for the selected strategy path.

A relative plot path is resolved from the directory containing the selected config file. For example, `"plot_output_dir": "plots"` saves to a `plots` folder beside `config.json`. An absolute path saves to that exact location. The output folder is created if needed.

The account-value chart is an estimate for comparison: interest is shown as accruing between booking and maturity. Use the simulator's final results and cash-flow records for the calculated outcome; the chart is not a bank statement.

## 5. Before using results

1. Update the relevant bank CSV under `data/fd_options/banks/` with verified, current FD terms and keep the index in `data/fd_options/fd_options.csv` aligned.
2. Check minimum deposits and transfer fees.
3. Run the simulation and review the chosen bookings, final value, and interest.
4. Treat the output as a model, not a guaranteed return or financial advice.

This project simulates investment choices only. It does not open deposits, contact banks, or execute transfers.


## Cash flows

The simulator supports recurring and scheduled inflows and outflows. Each cash-flow entry is associated with a configured account through `account_id`.

Detailed configuration guides:

- [Configuring inflows](docs/inflows.md) — recurring and scheduled credits, fields, intervals, date expressions, and examples.
- [Configuring outflows](docs/outflows.md) — recurring and scheduled payments, payment policies, outstanding liabilities, event ordering, and examples.

Standalone JSON examples:

- [Inflows example](examples/inflows.example.json)
- [Outflows example](examples/outflows.example.json)
