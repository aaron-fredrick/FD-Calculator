from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path
from typing import Optional, Sequence

from core import AbsoluteStrategy, GAMLStrategy, GreedyStrategy, divider, print_simulation
from core.configuration import load_configuration
from core.visualization import plot_strategy_results
from core.html_report import generate_html_report


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
    # Legacy scalar inflow schedules still default to the first account; final
    # consolidation uses the explicitly configured account ID.
    default_account_id = accounts[0].id
    consolidation_account_id = config["consolidation_account_id"]
    fee_config = config["fee_config"]
    compound = config["compound"]
    actual_leap_year = config["actual_leap_year"]
    ait_enabled = config["ait_enabled"]
    ait_rate = config["ait_rate"]
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

    # Plot generation must not suppress the normal console simulation output.
    clean_output = False
    if not clean_output:
        print()
        print(divider("="))
        print("  MULTI-BANK FIXED DEPOSIT INVESTMENT CALCULATOR")
        print(divider("="))
    if not clean_output:
        print(f"  Config: {config['source_path']}")
    if not clean_output:
        print(f"  FD options: {config['options_path']}")
    if not clean_output:
        print(
            f"  Window: {start} -> {end} ({days} days) | "
            f"Method: {'Compound' if compound else 'Simple interest'} "
            f"({'366d leap' if actual_leap_year else '365d'})"
        )
    if not clean_output:
        print("  Accounts:")
    for account in accounts if not clean_output else []:
        print(
            f"    - {account.id}: {account.label} [{account.bank_id}] "
            f"starting funds {account.balance:,.2f} LKR | "
            f"eFD {'enabled' if account.supports_efd else 'disabled'}"
        )
    if not clean_output:
        print(f"  AIT withholding: {'enabled' if ait_enabled else 'disabled'}" + (f" ({ait_rate:.1%} of interest)" if ait_enabled else ""))
    if not clean_output:
        print(
            f"  Transfer fees: inter-bank {fee_config.default_inter_bank_fee:,.2f} LKR | "
            f"same-bank {fee_config.same_bank_fee:,.2f} LKR"
        )
    if not clean_output:
        print("  New-money inflows:")
    if not clean_output and config["inflow_summaries"]:
        for inflow in config["inflow_summaries"]:
            if inflow["type"] == "recurring":
                schedule_text = f"every {inflow['interval']} from {inflow['start_date']} to {inflow['end_date']}"
            else:
                schedule_text = "on " + ", ".join(str(day) for day in inflow["dates"])
            print(
                f"    - {inflow['name']}: {inflow['amount']:,.2f} LKR {schedule_text}, "
                f"account {inflow['account_id']} | {inflow['occurrences']} payments, "
                f"{inflow['total']:,.2f} LKR total"
            )
    elif not clean_output:
        print("    - None")
    if not clean_output:
        print("  Planned outflows:")
    if not clean_output and config["outflow_summaries"]:
        for outflow in config["outflow_summaries"]:
            dates_text = ", ".join(str(day) for day in outflow["dates"])
            print(
                f"    - {outflow['name']}: {outflow['amount']:,.2f} LKR x "
                f"{outflow['occurrences']} ({outflow['payment_policy']}) on {dates_text}"
            )
    elif not clean_output:
        print("    - None")
    if not clean_output:
        print(
            f"  Starting funds: {starting_funds:,.2f} LKR | "
            f"Scheduled new money: {total_new_money:,.2f} LKR | "
            f"Total planned capital: {starting_funds + total_new_money:,.2f} LKR"
        )

    strategy_class = {"absolute": AbsoluteStrategy, "greedy": GreedyStrategy, "gaml": GAMLStrategy}[selected_strategy]
    strategy = strategy_class(compound=compound, actual_leap_year=actual_leap_year, ait_enabled=ait_enabled, ait_rate=ait_rate)
    compare_strategy = (
        GreedyStrategy(compound=compound, actual_leap_year=actual_leap_year, ait_enabled=ait_enabled, ait_rate=ait_rate)
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
        consolidation_account_id=consolidation_account_id,
        outflow_schedule=outflow_schedule,
    )
    result = strategy.simulate(**common_kwargs)
    if not result.valid:
        raise ValueError("The selected strategy cannot satisfy one or more strict outflows")

    comparison_result = None
    comparison = None
    if compare_strategy is not None:
        greedy_comparison = compare_strategy.simulate(**common_kwargs)
        if greedy_comparison.valid:
            comparison_result = greedy_comparison
            comparison = {compare_strategy.name: comparison_result.net_interest}
        else:
            print("  Greedy comparison skipped: its decisions cannot satisfy the configured strict outflows.")

    if not clean_output:
        print_simulation(
            result,
            show_event_timeline=config["show_timeline"],
            show_booking_ledger=config["show_ledger"],
            comparison=comparison,
            show_decision_log=False,
        )

    chart_paths = []
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
            show=False,
            consolidation_account_id=consolidation_account_id,
        )

    report_path = Path(config["report_output_file"]).expanduser()
    if not report_path.is_absolute():
        report_path = Path(config["source_path"]).parent / report_path
    report_path = generate_html_report(
        result, config, start=start, end=end,
        output_path=report_path, chart_paths=chart_paths,
    )
    print(f"Report saved: {report_path}")
    if clean_output:
        print(f"Final value: {result.final_value:,.2f} LKR | Net interest: {result.net_interest:,.2f} LKR")
        print(f"Charts: {len(chart_paths)} saved to {output_dir}")


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
