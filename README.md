# FD Calculator

A multi-bank fixed-deposit simulator that compares Greedy and Absolute investment strategies.

## Run

Requires Python and [uv](https://docs.astral.sh/uv/).

```powershell
uv run fd_cal.py
uv run fd_cal.py --strategy greedy
uv run fd_cal.py --config config.json --strategy absolute
```

The default configuration is `config.json`. A command-line strategy override applies only to that run.

## Configuration

Edit `config.json` to set the investment period, accounts, recurring inflows, transfer fees, and output options.

- **Accounts:** Set a unique `id`, `bank_key`, starting `balance`, and optional `label`. The `bank_key` must exist in `options.json`.
- **FD options:** Only options for configured banks are loaded. A missing or empty bank options list stops the run with an error.
- **Inflows:** Each entry defines its own `amount`, `interval`, `start_date`, and destination `account_id`. Add multiple entries to send contributions to different accounts.
- **Dates:** Use `today`, an explicit `YYYY-MM-DD` date, or relative dates such as `investment_start+1m`.
- **Transfer fees:** Configure default inter-bank and same-bank fees, plus optional custom bank-pair fees.
- **Output:** Use `show_timeline`, `show_ledger`, and `show_plots` to control reports and charts.

Example inflows:

```json
"inflows": [
  {
    "name": "Commercial savings",
    "amount": 10000,
    "interval": "1m",
    "start_date": "2026-11-30",
    "account_id": "com"
  },
  {
    "name": "DFCC savings",
    "amount": 5000,
    "interval": "1m",
    "start_date": "2026-11-30",
    "account_id": "dfcc"
  }
]
```

The investment end date is inclusive. If an inflow omits `start_date`, its first contribution is scheduled one interval after the investment start date. Final consolidation defaults to the first account listed in `accounts`.

## Notes

- Check the rates and minimum deposits in `options.json` against current bank terms before making investment decisions.
- This simulator does not place deposits or interact with banks.
