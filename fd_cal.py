from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Optional, Sequence

from core import AbsoluteStrategy, GAMLStrategy, GreedyStrategy, divider, print_simulation
from core.reporting import build_decision_log
from core.configuration import load_configuration
from core.visualization import plot_strategy_results


def _write_decision_log(result, output_path: str | Path, start_date: date) -> Path:
    """Write a human-readable, chronological action sheet for the selected path."""
    path = Path(output_path).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    records = build_decision_log(result)

    def money(value: float) -> str:
        return f"{value:,.2f} LKR"

    lines = [
        "FD CALCULATOR — DECISION / EXECUTION LOG",
        "=" * 72,
        f"Strategy          : {result.strategy_name}",
        f"Simulation period : {start_date.isoformat()} to {result.end_date.isoformat()}",
        f"Actions recorded  : {len(records)}",
        "",
        "PURPOSE",
        "This file records the selected simulation path in execution order.",
        "Use it as a manual reference when arranging transfers and FD bookings.",
        "It is a plan only: no bank transaction or FD booking has been executed.",
        "",
        "IMPORTANT",
        "Confirm current rates, minimums, fees, account details and availability",
        "with the bank before placing any booking or transfer.",
        "",
        "=" * 72,
        "SELECTED ACTIONS",
        "=" * 72,
        "",
    ]

    if not records:
        lines.append("No FD booking or cash-retention decisions were recorded.")
    transfer_dates_written = set()
    for index, record in enumerate(records, 1):
        lines.append(f"ACTION {index:03d} — {record['date'].isoformat()} — {record['action'].upper()}")
        lines.append("-" * 72)
        if record.get("available_funds"):
            lines.append("Available balances before action:")
            for account_id, balance in record["available_funds"].items():
                account = result.accounts.get(account_id)
                label = account.label if account else account_id
                lines.append(f"  - {label} [{account_id}]: {money(balance)}")

        transfer_steps = record.get("transfer_steps", [])
        if transfer_steps and record["date"] not in transfer_dates_written:
            transfer_dates_written.add(record["date"])
            for step in transfer_steps:
                lines.append(
                    f"TRANSFER: {step['channel']} | {step['description']} | "
                    f"Account {step['account_label']} [{step['account_id']}] | "
                    f"Recorded amount {money(step['amount'])} | Fee {money(step['fee'])}"
                )

        if record.get("product"):
            lines.extend([
                "",
                "FD BOOKING INSTRUCTIONS:",
                f"  Booking reference: {record.get('booking_ref', '-')}",
                f"  Destination bank : {record.get('bank', '-')}",
                f"  Destination acct : {record.get('account_label', record['account_id'])} [{record['account_id']}]",
                f"  Product          : {record['product']}",
                f"  Deposit type     : {record['fd_type']}",
                f"  Principal        : {money(record['principal'])}",
                f"  Interest rate    : {record['rate']:.3f}% p.a.",
                f"  Term             : {record['term']}",
                f"  Booking date     : {record['booking_start']}",
                f"  Maturity date    : {record['maturity_date']}",
                f"  Payout method    : {record['payout_type']}",
                f"  Expected interest: {money(record['expected_return'])}",
                f"  Expected total   : {money(record['expected_total'])}",
            ])
            if record.get("cash_flows"):
                lines.append("  Expected payout schedule:")
                for flow_date, amount in record["cash_flows"]:
                    lines.append(f"    - {flow_date}: {money(amount)}")

        if record.get("relevant_events"):
            lines.append("")
            lines.append("Same-day cash events:")
            lines.extend(f"  - {event}" for event in record["relevant_events"])
        if record.get("reason"):
            lines.append("")
            lines.append("Decision rationale:")
            lines.extend(f"  - {reason}" for reason in record["reason"])
        lines.append(f"Next liquidity checkpoint: {record['next_milestone']}")
        lines.extend(["", ""])

    lines.extend([
        "=" * 72,
        "END OF LOG",
        "All amounts are simulated estimates. Verify all details with the bank.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


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
            f"    - {account.id}: {account.label} [{account.bank_id}] "
            f"starting funds {account.balance:,.2f} LKR | "
            f"eFD {'enabled' if account.supports_efd else 'disabled'}"
        )
    print(f"  AIT withholding: {'enabled' if ait_enabled else 'disabled'}" + (f" ({ait_rate:.1%} of interest)" if ait_enabled else ""))
    print(
        f"  Transfer fees: inter-bank {fee_config.default_inter_bank_fee:,.2f} LKR | "
        f"same-bank {fee_config.same_bank_fee:,.2f} LKR"
    )
    print("  New-money inflows:")
    if config["inflow_summaries"]:
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

    print_simulation(
        result,
        show_event_timeline=config["show_timeline"],
        show_booking_ledger=config["show_ledger"],
        comparison=comparison,
        show_decision_log=False,
    )

    decision_log_path = Path(config["decision_log_output_file"]).expanduser()
    if not decision_log_path.is_absolute():
        decision_log_path = Path(config["source_path"]).parent / decision_log_path
    decision_log_path = _write_decision_log(result, decision_log_path, start)
    print(f"  Decision log saved: {decision_log_path}")

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
            consolidation_account_id=consolidation_account_id,
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
