# FD Calculator

Simulate fixed-deposit (FD) investment plans across multiple banks. Compare a fast Greedy strategy with an Absolute search for the best feasible plan.

## 1. Run it

Requirements: Python 3.13+ and [uv](https://docs.astral.sh/uv/).

\`\`\`powershell
uv run fd_cal.py
\`\`\`

Useful commands:

| Command | What it does |
| --- | --- |
| \`uv run fd_cal.py\` | Run using \`config.json\` and its configured strategy |
| \`uv run fd_cal.py --strategy greedy\` | Run the Greedy strategy for this run |
| \`uv run fd_cal.py --strategy absolute\` | Run the Absolute strategy for this run |
| \`uv run fd_cal.py --config my-config.json\` | Use another configuration file |
| \`uv run fd_cal.py --config my-config.json --strategy greedy\` | Choose both a config file and strategy |
| \`uv run fd_cal.py --help\` | Show command-line options |

The command-line strategy overrides \`strategy\` in the config for that run only; it does not edit the file.

## 2. Strategies

- **Greedy:** Quickly chooses a good available action at each decision point. Useful for fast runs, but it does not guarantee the best overall result.
- **Absolute:** Searches across feasible investment decisions to maximise the final result. It can take longer, especially with many FD options and a long investment period. It also runs Greedy as a baseline for comparison.

Both strategies use the same dates, accounts, inflows, FD options, fees, and interest settings.

## 3. Configure \`config.json\`

Edit this file to describe your investment scenario. Amounts and fees are in **LKR**; rates in \`options.json\` are annual percentages.

### Investment period

\`\`\`json
"investment": {
  "start_date": "today",
  "end_date": "2027-06-30"
}
\`\`\`

- \`start_date\`: First date of the simulation.
- \`end_date\`: Last date of the simulation; it is **inclusive**.
- Dates can be \`"today"\` or \`"YYYY-MM-DD"\`. For dates relative to the start, use \`"investment_start"\` or \`"investment_start+1m"\`.

Periods use \`d\` (days), \`m\` (calendar months), or \`y\` (years). For example, \`30d\`, \`1m\`, and \`1y\`. Month-based dates follow calendar-month arithmetic, so a date near the end of a month may land on the last valid day of the target month.

### Accounts

\`\`\`json
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
\`\`\`

- \`id\`: Unique identifier used by inflows and internal transfers.
- \`bank_key\`: Must match a bank key in \`options.json\`.
- \`label\`: Human-readable name shown in reports; optional.
- \`balance\`: Starting available funds for this account.

At least one account is required. Only FD options for banks used by these accounts are loaded. Each configured bank must have a non-empty options list.

### Recurring inflows

Each inflow sends new money to its own destination account. Add multiple entries if you contribute to different accounts.

\`\`\`json
"inflows": [
  {
    "name": "Monthly savings",
    "amount": 10000,
    "interval": "1m",
    "start_date": "2026-11-30",
    "account_id": "com"
  }
]
\`\`\`

- \`name\`: Description shown in the run summary.
- \`amount\`: Amount added each time.
- \`interval\`: Time between contributions, such as \`1m\` or \`30d\`.
- \`start_date\`: First contribution date. If omitted, the first contribution is one interval after the investment start.
- \`account_id\`: Destination account's \`id\`; it must match an account above.

Contributions repeat from the first date by the specified interval, up to and including the investment end date. A contribution scheduled after the end date is not included.

### FD options — \`options.json\`

This file defines the products the simulator can choose from, grouped by bank key.

\`\`\`json
"commercial": [
  {
    "label": "12 Months",
    "period": "12m",
    "annual_rate": 10.0,
    "min_amount": 25000,
    "payout_type": "cumulative"
  }
]
\`\`\`

- \`label\`: Product name shown in results and charts.
- \`period\`: FD term, such as \`100d\`, \`6m\`, or \`12m\`.
- \`annual_rate\`: Annual interest rate as a percentage, e.g. \`10.0\` means 10%.
- \`min_amount\`: Minimum principal needed to open the FD.
- \`payout_type\`: \`cumulative\` pays interest with the principal at maturity; \`periodic_interest\` pays interest during the term.
- \`payout_period\`: Required for \`periodic_interest\`; defines how often interest is paid, e.g. \`1m\` or \`1y\`.

Keep each bank key consistent with the accounts' \`bank_key\`. Verify rates, minimums, terms, and payout conditions against the bank's current published terms before relying on results.

### Transfer fees

\`\`\`json
"transfer_fees": {
  "default_inter_bank_fee": 30,
  "same_bank_fee": 0,
  "custom_fees": []
}
\`\`\`

- \`default_inter_bank_fee\`: Fee applied to transfers between different banks unless a custom fee matches.
- \`same_bank_fee\`: Fee for transfers within the same bank.
- \`custom_fees\`: Optional bank-pair overrides, each with \`from_bank\`, \`to_bank\`, and \`amount\`. Bank keys must match \`options.json\` / account bank keys.

Fees affect the simulated value, so use the fees that apply to your actual accounts.

### Interest and output settings

| Field | Meaning |
| --- | --- |
| \`strategy\` | Default strategy: \`"absolute"\` or \`"greedy"\`. |
| \`options_file\` | FD options JSON path; defaults to \`options.json\`. |
| \`compound\` | \`true\` enables the simulator's compound-interest calculations; \`false\` uses simple-interest calculations. |
| \`actual_leap_year\` | \`true\` uses actual 366-day leap years where applicable; \`false\` uses a 365-day basis. |
| \`show_timeline\` | Show the event timeline in the terminal. |
| \`show_ledger\` | Show the booking ledger in the terminal. |
| \`show_plots\` | Generate and display charts. |
| \`plot_output_dir\` | Folder for saved charts; defaults to \`plots\`. |

Final consolidation transfers remaining account balances to the **first account listed in \`accounts\`**. Any applicable transfer fee is included in the simulation.

## 4. Charts and output files

With \`"show_plots": true\`, charts are saved to \`plot_output_dir\`:

- \`absolute_account_values.png\` or \`greedy_account_values.png\`: estimated account value over time.
- \`absolute_decision_timeline.png\` or \`greedy_decision_timeline.png\`: FD booking and maturity periods.

A relative plot path is resolved from the directory containing the selected config file. For example, \`"plot_output_dir": "plots"\` saves to a \`plots\` folder beside \`config.json\`. An absolute path saves to that exact location. The output folder is created if needed.

The account-value chart is an estimate for comparison: interest is shown as accruing between booking and maturity. Use the simulator's final results and cash-flow records for the calculated outcome; the chart is not a bank statement.

## 5. Before using results

1. Update \`options.json\` with verified, current FD terms.
2. Check minimum deposits and transfer fees.
3. Run the simulation and review the chosen bookings, final value, and interest.
4. Treat the output as a model, not a guaranteed return or financial advice.

This project simulates investment choices only. It does not open deposits, contact banks, or execute transfers.
