# FD Calculator

A multi-bank fixed-deposit investment simulator with Greedy and Absolute strategies.

## Run

Use `uv` to run the project:

```powershell
uv run fd_cal.py
uv run fd_cal.py --config config.json
uv run fd_cal.py --strategy greedy
uv run fd_cal.py --config config.json --strategy greedy
```

The default configuration is `config.json`. `--strategy` overrides the strategy in the configuration for one run; it does not rewrite the file.

## Configuration

The checked-in `config.json` is populated with the values previously used by the application:

- Strategy: `absolute`
- Accounts: Commercial (`commercial`) starts with LKR 10,030; DFCC (`dfcc`) starts with LKR 0
- Investment window: `today` through `2027-06-30`
- New money: LKR 10,000 every `1m`, starting `2026-11-30`, deposited into account `com`
- Inter-bank transfer fee: LKR 30; same-bank fee: LKR 0
- Simple interest, actual leap-year day count, timeline enabled, ledger disabled, charts enabled

### Accounts and bank options

Each account needs a unique `id`, a `bank_key`, an optional `label`, and a starting `balance`. The bank key must match a top-level key in `options.json`.

Only FD options for banks referenced by configured accounts are passed to the simulation. If a configured bank is missing from `options.json`, or has an empty options list, configuration loading fails before the simulation starts. This is intentional: a typo must not silently change the investment choices.

### New-money inflows

Each entry in `inflows` describes one recurring contribution:

- `amount`: amount deposited each time
- `interval`: recurrence interval such as `1m`, `3m`, `30d`, or `1y`
- `start_date`: first contribution date
- `account_id`: destination account ID
- `name`: optional label for reporting

Each inflow defines its own destination; there is no global `inflow_account_id`. Multiple inflows can use different amounts, intervals, dates, and destination accounts. Contributions on the same date to the same account are combined.

The final consolidation target is no longer configured separately. For backward-compatible strategy behavior, the first account in `accounts` is used as the default target for final consolidation and legacy scalar inflow schedules.

### Dates

- `"today"`: resolves to the machine's local date when the program starts.
- `"YYYY-MM-DD"`: an explicit date.
- For an inflow start date, `"investment_start"` means the investment start date.
- `"investment_start+1m"` means one calendar month after the investment start date.
- If an inflow omits `start_date`, its first occurrence is one interval after the investment start date.

The investment end date must not precede the investment start date. Inflow occurrences are generated through the end date, inclusive.

### Transfer fees and output

`transfer_fees.custom_fees` is a list of objects with `from_bank`, `to_bank`, and `amount`. Custom pair fees are symmetric, matching the existing transfer-fee model.

The output flags `show_timeline`, `show_ledger`, and `show_plots` control reporting. `plot_output_dir` is resolved relative to the configuration file when it is a relative path.

## Notes

- Rates and minimum deposits come from `options.json`; verify those values against current bank product terms before making real investment decisions.
- This program models a strategy; it does not place deposits or interact with banks.
