from __future__ import annotations

from datetime import date

from typing import Optional

from core import (
    AbsoluteStrategy,
    Account,
    FDOption,
    GreedyStrategy,
    TransferFeeConfig,
    build_inflow_schedule,
    divider,
    load_options_from_json,
    print_simulation,
)
from core.interest import add_period
from core.visualization import plot_strategy_results

# --- Strategy Selector ---
# Supported strategies:
#   - "greedy"   : Fast event-driven greedy multi-bank decision engine
#   - "absolute" : Exhaustive branch-and-bound global search (evaluates all branching paths & holding cash)
STRATEGY: str = "absolute"

# --- Accounts Configuration ---
ACCOUNTS: list[Account] = [
    Account(id="com", bank_key="commercial", label="Commercial", balance=10_030.0),
    Account(id="dfcc", bank_key="dfcc", label="DFCC"),
]
INFLOW_ACCOUNT_ID: str          = "com"
CONSOLIDATION_ACCOUNT_ID: str   = "com"  # all balances swept here at end of horizon

# --- Transfer Fees Configuration ---
# Same-bank transfer fee defaults to 0.0.
# Inter-bank default fee (e.g. 30.0 LKR), with optional custom fee overrides per bank pair.
TRANSFER_FEES = TransferFeeConfig(
    default_inter_bank_fee=30.0,
    same_bank_fee=0.0,
    custom_fees={
        # ("commercial", "hnb"): 30.0,
    },
)

# --- Inflow Configuration ---
PERIODIC_NEW_INFLOW_AMOUNT: float = 10_000.0
PERIODIC_INFLOW_INTERVAL: str     = "1m"
FIRST_INFLOW_DATE: Optional[str]  = "2026-11-30"  # or None to dynamically start 1 interval after start date

# --- Investment Horizon ---
# Dynamically loads today's date (or set an explicit ISO string e.g. "2026-11-01")
INVESTMENT_START_DATE: Optional[str] = date.today().isoformat()
INVESTMENT_END_DATE: str             = "2027-06-30"

# --- Options Configuration ---
OPTIONS_FILE: str                 = "options.json"
# Load all options across all banks (or pass bank_key="commercial" to restrict to a single bank)
OPTIONS: list[FDOption]           = load_options_from_json(OPTIONS_FILE, bank_key=None)


COMPOUND: bool           = False
ACTUAL_LEAP_YEAR: bool   = True
SHOW_TIMELINE: bool      = True   # print full event-by-event diary
SHOW_LEDGER: bool        = False   # print every FD contract with cash-flow schedule
SHOW_PLOTS: bool         = True    # save and display dark-theme Matplotlib charts
PLOT_OUTPUT_DIR: str     = "plots"


def main():
    start = date.fromisoformat(INVESTMENT_START_DATE) if INVESTMENT_START_DATE else date.today()
    end = date.fromisoformat(INVESTMENT_END_DATE)
    if FIRST_INFLOW_DATE:
        first_inflow = date.fromisoformat(FIRST_INFLOW_DATE)
    else:
        first_inflow = add_period(start, PERIODIC_INFLOW_INTERVAL)
    days = (end - start).days + 1

    inflow_schedule = build_inflow_schedule(
        first_inflow_date=first_inflow,
        end=end,
        interval_str=PERIODIC_INFLOW_INTERVAL,
        amount=PERIODIC_NEW_INFLOW_AMOUNT,
    )
    total_capital = sum(inflow_schedule.values())

    print()
    print(divider("="))
    print("  MULTI-BANK FIXED DEPOSIT INVESTMENT CALCULATOR")
    print(divider("="))
    print(f"  Window: {start} -> {end} ({days} days) | Method: {'Compound' if COMPOUND else 'Simple interest'} ({'366d leap' if ACTUAL_LEAP_YEAR else '365d'})")
    acc_labels = ", ".join(f"{a.label} [{a.bank_key}]" for a in ACCOUNTS)
    print(f"  Accounts: {acc_labels}")
    print(f"  Designated Inflow Account: {INFLOW_ACCOUNT_ID} | Inter-Bank Transfer Fee: {TRANSFER_FEES.default_inter_bank_fee:,.2f} LKR (Same-Bank: {TRANSFER_FEES.same_bank_fee:,.2f} LKR)")
    print(f"  Periodic Inflow: {PERIODIC_NEW_INFLOW_AMOUNT:,.2f} every {PERIODIC_INFLOW_INTERVAL} starting {first_inflow} | Total Capital: {total_capital:,.2f} ({len(inflow_schedule)} inflows)")

    selected_strategy = STRATEGY.strip().lower()
    if selected_strategy == "absolute":
        strategy = AbsoluteStrategy(compound=COMPOUND, actual_leap_year=ACTUAL_LEAP_YEAR)
        compare_strategy = GreedyStrategy(compound=COMPOUND, actual_leap_year=ACTUAL_LEAP_YEAR)
    elif selected_strategy == "greedy":
        strategy = GreedyStrategy(compound=COMPOUND, actual_leap_year=ACTUAL_LEAP_YEAR)
        compare_strategy = None
    else:
        raise ValueError(f"Unsupported STRATEGY: {STRATEGY!r}. Use 'greedy' or 'absolute'.")

    common_kwargs = dict(
        options=OPTIONS,
        start=start,
        end=end,
        inflow_schedule=inflow_schedule,
        accounts=ACCOUNTS,
        inflow_account_id=INFLOW_ACCOUNT_ID,
        fee_config=TRANSFER_FEES,
        consolidation_account_id=CONSOLIDATION_ACCOUNT_ID,
    )

    sim = strategy.simulate(**common_kwargs)

    # Absolute mode compares against Greedy. Greedy mode deliberately avoids
    # launching the expensive Absolute search just for a chart.
    compare_sim = None
    comparison = None
    if compare_strategy is not None:
        compare_sim = compare_strategy.simulate(**common_kwargs)
        comparison = {compare_strategy.name: compare_sim.net_interest}

    print_simulation(
        sim,
        show_event_timeline=SHOW_TIMELINE,
        show_booking_ledger=SHOW_LEDGER,
        comparison=comparison,
    )

    if SHOW_PLOTS:
        chart_paths = plot_strategy_results(
            sim,
            comparison=compare_sim if selected_strategy == "absolute" else None,
            accounts=ACCOUNTS,
            inflow_schedule=inflow_schedule,
            inflow_account_id=INFLOW_ACCOUNT_ID,
            start=start,
            end=end,
            output_dir=PLOT_OUTPUT_DIR,
            show=True,
        )
        print("\\n  Charts saved:")
        for chart_path in chart_paths:
            print(f"    - {chart_path}")


if __name__ == "__main__":
    main()