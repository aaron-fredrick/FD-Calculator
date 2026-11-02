from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path
from typing import Optional, Sequence

from core import AbsoluteStrategy, GAMLStrategy, GreedyStrategy, divider, print_simulation
from core.configuration import load_configuration
from core.visualization import plot_strategy_results


def main(
    config_path: str | Path = "config.json",
    strategy_override: Optional[str] = None,
) -> None:
    """Run the FD simulator using a validated JSON configuration."""
    config = load_configuration(config_path)

    start: date = config["start"]
    end: date = config["end"]
    accounts = config["accounts"]
    options = config["options"]
    inflow_schedule = config["inflow_schedule"]
    outflow_schedule = config["outflow_schedule"]
    # Legacy scalar inflow schedules and final consolidation default to the first
    # configured account. New inflows specify their own destination in config.json.
    default_account_id = accounts[0].id
    fee_config = config["fee_config"]
    compound = config["compound"]
    actual_leap_year = config["actual_leap_year"]
    selected_strategy = (strategy_override or config["strategy"]).strip().lower()
    if selected_strategy not in {"absolute", "greedy", "gaml"}:
        raise ValueError(f"Unsupported strategy {selected_strategy!r}; use 'absolute', 'greedy', or 'gaml'")

    days = (end - start).days + 1
    total_new_money = sum(
        amount
        for account_amounts in inflow_schedule.values()
        for amount in account_amounts.values()
    )
    starting_funds = sum(account.balance for account in accounts)

    print()
    print(divider("="))
    print("  MULTI-BANK FIXED DEPOSIT INVESTMENT CALCULATOR")
    print(divider("="))
    print(f"  Config: {config['source_path']}")
    print(f"  FD options: {config['options_path']}")
    print(
        f"  Window: {start} -> {end} ({days} days) | "
        f"Method: {'Compound' if compound else 'Simple interest'} "
        f"({'366d leap' if actual_leap_year else '365d'})"
    )
    print("  Accounts:")
    for account in accounts:
        print(
            f"    - {account.id}: {account.label} [{account.bank_key}] "
            f"starting funds {account.balance:,.2f} LKR"
        )
    print(
        f"  Transfer fees: inter-bank {fee_config.default_inter_bank_fee:,.2f} LKR | "
        f"same-bank {fee_config.same_bank_fee:,.2f} LKR"
    )
    print("  New-money inflows:")
    if config["inflow_summaries"]:
        for inflow in config["inflow_summaries"]:
            print(
                f"    - {inflow['name']}: {inflow['amount']:,.2f} LKR every "
                f"{inflow['interval']} from {inflow['start_date']} to {end}, "
                f"account {inflow['account_id']} | {inflow['occurrences']} payments, "
                f"{inflow['total']:,.2f} LKR total"
            )
    else:
        print("    - None")
    print("  Planned outflows:")
    if config["outflow_summaries"]:
        for outflow in config["outflow_summaries"]:
            dates_text = ", ".join(str(day) for day in outflow["dates"])
            print(
                f"    - {outflow['name']}: {outflow['amount']:,.2f} LKR x "
                f"{outflow['occurrences']} ({outflow['payment_policy']}) on {dates_text}"
            )
    else:
        print("    - None")
    print(
        f"  Starting funds: {starting_funds:,.2f} LKR | "
        f"Scheduled new money: {total_new_money:,.2f} LKR | "
        f"Total planned capital: {starting_funds + total_new_money:,.2f} LKR"
    )

    strategy_class = {"absolute": AbsoluteStrategy, "greedy": GreedyStrategy, "gaml": GAMLStrategy}[selected_strategy]
    strategy = strategy_class(compound=compound, actual_leap_year=actual_leap_year)
    compare_strategy = (
        GreedyStrategy(compound=compound, actual_leap_year=actual_leap_year)
        if selected_strategy in {"absolute", "gaml"}
        else None
    )

    common_kwargs = dict(
        options=options,
        start=start,
        end=end,
        inflow_schedule=inflow_schedule,
        accounts=accounts,
        inflow_account_id=default_account_id,
        fee_config=fee_config,
        consolidation_account_id=default_account_id,
        outflow_schedule=outflow_schedule,
    )
    result = strategy.simulate(**common_kwargs)
    if not result.valid:
        raise ValueError("The selected strategy cannot satisfy one or more strict outflows")

    comparison_result = None
    comparison = None
    if compare_strategy is not None:
        comparison_result = compare_strategy.simulate(**common_kwargs)
        comparison = {compare_strategy.name: comparison_result.net_interest}

    print_simulation(
        result,
        show_event_timeline=config["show_timeline"],
        show_booking_ledger=config["show_ledger"],
        comparison=comparison,
    )

    if config["show_plots"]:
        output_dir = Path(config["plot_output_dir"]).expanduser()
        if not output_dir.is_absolute():
            output_dir = Path(config["source_path"]).parent / output_dir
        chart_paths = plot_strategy_results(
            result,
            comparison=comparison_result,
            accounts=accounts,
            inflow_schedule=inflow_schedule,
            inflow_account_id=default_account_id,
            start=start,
            end=end,
            output_dir=output_dir,
            show=True,
            consolidation_account_id=default_account_id,
        )
        print("\n  Charts saved:")
        for chart_path in chart_paths:
            print(f"    - {chart_path}")


def _parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Multi-bank fixed-deposit investment calculator"
    )
    parser.add_argument(
        "-c", "--config",
        default="config.json",
        help="path to the JSON configuration file (default: config.json)",
    )
    parser.add_argument(
        "-s", "--strategy",
        choices=("greedy", "absolute", "gaml"),
        default=None,
        help="override the strategy configured in the JSON file",
    )
    return parser.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args()
    try:
        main(config_path=args.config, strategy_override=args.strategy)
    except (ValueError, FileNotFoundError, KeyError) as exc:
        raise SystemExit(f"Configuration error: {exc}") from exc
