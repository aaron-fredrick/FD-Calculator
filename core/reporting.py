from __future__ import annotations

import os
import sys
from datetime import date

from core.models import Booking, Event, EventType, FDOption, SimResult, PAYOUT_ABBR

# Enable virtual terminal processing in Windows console if needed
if sys.platform == "win32":
    os.system("")

W = 125


def divider(char: str = "-") -> str:
    return char * W


# ANSI color codes
RESET = "\033[0m"
BOLD  = "\033[1m"
DIM   = "\033[2m"

COLOR_DATE = "\033[36m"   # blue-green / cyan
COLOR_DESC = "\033[90m"   # grey
COLOR_SEP  = "\033[90m"   # dim grey for separators

EVENT_COLORS = {
    EventType.INFLOW:        "\033[94m",   # blue
    EventType.TRANSFER:      "\033[96m",   # cyan
    EventType.CARRY_FORWARD: "\033[93m",   # yellow
    EventType.BOOKING:       "\033[95m",   # magenta
    EventType.MATURITY:      "\033[32m",   # dark green
    EventType.CASH_FLOW:     "\033[92m",   # light green
    EventType.IDLE:          "\033[90m",   # grey
}


# ---------------------------------------------------------------------------
# Options table
# ---------------------------------------------------------------------------

def print_options_table(options: list[FDOption]) -> None:
    print(divider("-"))
    print(f"  {'Option Label':<24} {'Bank':<10} {'Period':<8} {'Days':>5}  {'Ann. Rate':>9}  {'Min. Invest':>12}  {'Payout':<18} {'Every':<6}")
    print(f"  {'-'*24} {'-'*10} {'-'*8} {'-'*5}  {'-'*9}  {'-'*12}  {'-'*18} {'-'*6}")
    for o in options:
        pp = o.payout_period_str if o.payout_period_str else "-"
        bank_str = (o.bank_key.title() if o.bank_key else "-")[:10]
        print(f"  {o.label:<24} {bank_str:<10} {o.period_str:<8} {o.days:>5}  {o.annual_rate:>8.4f}%  {o.min_amount:>12,.2f}  {PAYOUT_ABBR[o.payout_type]:<18} {pp:<6}")
    print(divider("-"))


# ---------------------------------------------------------------------------
# Event timeline printer
# ---------------------------------------------------------------------------

_EVENT_LABELS = {
    EventType.INFLOW:        "[INFLOW] ",
    EventType.TRANSFER:      "[XFER]   ",
    EventType.BOOKING:       "[BOOK]   ",
    EventType.CASH_FLOW:     "[CF]     ",
    EventType.MATURITY:      "[MATURE] ",
    EventType.CARRY_FORWARD: "[CARRY]  ",
    EventType.IDLE:          "[IDLE]   ",
}


def print_event_timeline(result: SimResult) -> None:
    """Print every event in chronological order -- grouped by date with running balance and colors."""
    print()
    print(divider("="))
    print(f"  EVENT TIMELINE  [{result.strategy_name} strategy]")
    print(divider("="))
    header = f"  {'Date':<12} {'Account':<12} {'Type':<10} {'Amount':>14} {'Balance':>14}   {'Description'}"
    print(f"{BOLD}{header}{RESET}")
    sep_line = f"  {'-'*12} {'-'*12} {'-'*10} {'-'*14} {'-'*14}   {'-'*55}"
    print(f"{COLOR_SEP}{sep_line}{RESET}")

    sorted_dates = result.sorted_dates()
    for d_idx, key in enumerate(sorted_dates):
        day_events = result.timeline[key]
        for e_idx, e in enumerate(day_events):
            lbl = _EVENT_LABELS.get(e.event_type, "[?]      ")
            col = EVENT_COLORS.get(e.event_type, "")

            if e.event_type == EventType.BOOKING:
                amt_str = f"{'-' + f'{e.amount:,.2f}':>14}"
            elif e.event_type == EventType.TRANSFER:
                if "to " in e.label.lower():
                    amt_str = f"{'-' + f'{e.amount:,.2f}':>14}"
                else:
                    amt_str = f"{'+' + f'{e.amount:,.2f}':>14}"
            elif e.event_type in (EventType.INFLOW, EventType.CASH_FLOW, EventType.MATURITY):
                amt_str = f"{'+' + f'{e.amount:,.2f}':>14}"
            else:
                amt_str = f"{e.amount:>14,.2f}" if e.amount > 0 else f"{'--':>14}"

            bal_str = f"{e.balance_after:>14,.2f}" if e.balance_after >= 0 else f"{'--':>14}"
            date_str = str(e.on_date) if e_idx == 0 else ""

            acc_label = ""
            if result.accounts and e.account_id in result.accounts:
                acc_label = result.accounts[e.account_id].label[:12]
            elif e.account_id:
                acc_label = e.account_id[:12]

            # Pad raw text first for alignment, then wrap with color
            c_date = f"{COLOR_DATE}{date_str:<12}{RESET}"
            c_acc  = f"{acc_label:<12}"
            c_type = f"{col}{lbl:<10}{RESET}"
            c_amt  = f"{col}{amt_str}{RESET}"
            c_bal  = bal_str
            c_desc = f"{COLOR_DESC}{e.label}{RESET}"

            print(f"  {c_date} {c_acc} {c_type} {c_amt} {c_bal}   {c_desc}")

        if d_idx < len(sorted_dates) - 1:
            print(f"{COLOR_SEP}{sep_line}{RESET}")

    print(divider("="))


# ---------------------------------------------------------------------------
# Booking ledger
# ---------------------------------------------------------------------------

def print_booking_ledger(result: SimResult) -> None:
    """Print every FD contract booked, with its cash-flow schedule."""
    if not result.bookings:
        print("  (no FD contracts were booked)")
        return

    print()
    print(divider("-"))
    print("  BOOKING LEDGER -- ALL FD CONTRACTS")
    print(divider("-"))
    print(f"  {'Ref':<9} {'Bank':<12} {'Option':<23} {'Payout':<18} {'Open':<11} {'Maturity':<11} {'Principal':>12} {'Interest':>10} {'Total':>12}")
    print(f"  {'-'*9} {'-'*12} {'-'*23} {'-'*18} {'-'*11} {'-'*11} {'-'*12} {'-'*10} {'-'*12}")

    for idx, b in enumerate(result.bookings, start=1):
        ref = f"FD-{idx:04d}"
        payout_tag = PAYOUT_ABBR[b.payout_type]
        bank_str = (b.bank_key.title() if b.bank_key else "-")[:12]
        if b.payout_type == "cumulative":
            print(f"  {ref:<9} {bank_str:<12} {b.option.label:<23} {payout_tag:<18} {str(b.start):<11} {str(b.end):<11} {b.principal:>12,.2f} {b.total_interest:>10,.2f} {b.total_received:>12,.2f}")
        else:
            print(f"  {ref:<9} {bank_str:<12} {b.option.label:<23} {payout_tag:<18} {str(b.start):<11} {str(b.end):<11} {b.principal:>12,.2f} {'':>10} {'':>12}")
            for i, (flow_date, flow_amt) in enumerate(b.cash_flows, 1):
                is_last = (i == len(b.cash_flows))
                flow_lbl = (
                    "capital+interest" if (is_last and b.payout_type == "periodic_interest")
                    else ("last instalment" if is_last else f"payment {i}")
                )
                print(f"  {'':9}   * {flow_lbl:<22} {'':18} {'':11} {str(flow_date):<11} {'':>12} {'':>10} {flow_amt:>12,.2f}")

    print(divider("-"))


# ---------------------------------------------------------------------------
# Main simulation printer
# ---------------------------------------------------------------------------

def print_simulation(
    result: SimResult,
    show_event_timeline: bool = True,
    show_booking_ledger: bool = True,
    comparison: dict[str, float] | None = None,
) -> None:
    """
    Print the simulation results: event timeline, grand summary, and booking ledger.

    Args:
        result: The simulation result to display.
        show_event_timeline: Print the full event-by-event diary.
        show_booking_ledger: Print every FD contract with cash-flow schedule.
        comparison: Optional mapping of {strategy_name: net_interest} for OTHER
                    strategies that were also run, shown in the summary for comparison.
    """
    tot_ret = (result.total_interest / result.total_principal * 100) if result.total_principal > 0 else 0.0
    net_ret = (result.net_interest / result.total_principal * 100) if result.total_principal > 0 else 0.0
    n_bookings = len(result.bookings)

    if show_event_timeline:
        print_event_timeline(result)

    # -- Grand summary --
    print()
    print(divider("="))
    print(f"  GRAND SUMMARY  [{result.strategy_name}]")
    print(f"  Strategy       : {result.strategy_name}")
    print(f"  Total Inflow   : {result.total_principal:>14,.2f}")
    print(f"  Gross Interest : {result.total_interest:>14,.2f}")
    if result.total_transfer_fees > 0:
        print(f"  Transfer Fees  : {result.total_transfer_fees:>14,.2f}")
        print(f"  Net Interest   : {result.net_interest:>14,.2f}")
    print(f"  Net Yield      : {net_ret:>13.3f}%")
    if result.total_decisions_evaluated is not None:
        print(f"  Decisions Eval : {result.total_decisions_evaluated:>14,}")
    print(f"  Final Balance  : {result.final_value:>14,.2f}  (at {result.end_date})")

    # -- Comparison with other strategies (only other net interest shown) --
    if comparison:
        print()
        print("  Other Strategy Net Interest:")
        for strat_name, other_net in sorted(comparison.items()):
            delta = other_net - result.net_interest
            delta_str = f"+{delta:,.2f}" if delta >= 0 else f"{delta:,.2f}"
            print(f"    - {strat_name:<16} : {other_net:>14,.2f}  (diff vs current: {delta_str:>10})")

    # -- Alternative leaf outcomes (non-best terminal paths) --
    if result.alternative_leaf_net_interests:
        print()
        alt_leaves = result.alternative_leaf_net_interests
        unique_nets = sorted(set(alt_leaves), reverse=True)
        print(f"  Alternative Leaf Net Interests ({len(alt_leaves):,} non-best completed paths evaluated, {len(unique_nets):,} distinct outcomes):")
        for rank, net in enumerate(unique_nets[:10], 1):
            diff = net - result.net_interest
            diff_str = f"{diff:,.2f}" if diff < 0 else f"+{diff:,.2f}"
            print(f"    - Leaf #{rank:02d} Net Interest : {net:>14,.2f} LKR  (diff vs best: {diff_str:>10})")
        if len(unique_nets) > 10:
            print(f"      ... and {len(unique_nets) - 10} more distinct leaf outcomes down to {min(unique_nets):,.2f} LKR")

    if result.accounts:
        print()
        print("  Ending Balances by Account:")
        for acc in result.accounts.values():
            print(f"    - {acc.label:<20} ({acc.bank_key}): {acc.balance:>12,.2f}")

    print(divider("="))
    print()

    if show_booking_ledger:
        print_booking_ledger(result)

