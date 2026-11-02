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
    EventType.OUTFLOW:       "\033[91m",   # red
    EventType.TRANSFER:      "\033[96m",   # cyan
    EventType.CARRY_FORWARD: "\033[93m",   # yellow
    EventType.BOOKING:       "\033[95m",   # magenta
    EventType.MATURITY:      "\033[32m",   # dark green
    EventType.CASH_FLOW:     "\033[92m",   # light green
    EventType.IDLE:          "\033[90m",   # grey
}


def _xirr(result: SimResult) -> float | None:
    """Money-weighted annualised return from dated capital contributions."""
    dated_events = [event for events in result.timeline.values() for event in events]
    if not dated_events:
        return None
    contributions: dict[date, float] = {}
    for event in dated_events:
        if event.event_type == EventType.INFLOW and event.amount > 0:
            contributions[event.on_date] = contributions.get(event.on_date, 0.0) + event.amount
    opening_capital = max(0.0, result.total_principal - sum(contributions.values()))
    first_date = min(event.on_date for event in dated_events)
    flows: list[tuple[date, float]] = []
    if opening_capital > 0:
        flows.append((first_date, -opening_capital))
    flows.extend((day, -amount) for day, amount in contributions.items() if amount > 0)
    withdrawals: dict[date, float] = {}
    for event in dated_events:
        if event.event_type == EventType.OUTFLOW and event.amount < 0:
            withdrawals[event.on_date] = withdrawals.get(event.on_date, 0.0) - event.amount
    flows.extend((day, amount) for day, amount in withdrawals.items() if amount > 0)
    terminal_liabilities = sum(
        float(item.get("remaining", 0.0)) for item in result.outstanding_outflows
    )
    terminal_value = result.final_value - result.total_outflows_paid - terminal_liabilities
    flows.append((result.end_date, terminal_value))
    if not any(amount < 0 for _, amount in flows):
        return None
    origin = min(day for day, _ in flows)
    dated = [((day - origin).days / 365.0, amount) for day, amount in flows]
    def npv(rate: float) -> float:
        return sum(amount / ((1.0 + rate) ** years) for years, amount in dated)
    low, high = -0.999999, 1.0
    low_value, high_value = npv(low), npv(high)
    while low_value * high_value > 0 and high < 1_000_000:
        high = high * 2.0 + 1.0
        high_value = npv(high)
    if low_value * high_value > 0:
        return None
    for _ in range(200):
        mid = (low + high) / 2.0
        mid_value = npv(mid)
        if abs(mid_value) < 1e-8:
            return mid * 100.0
        if low_value * mid_value <= 0:
            high, high_value = mid, mid_value
        else:
            low, low_value = mid, mid_value
    return ((low + high) / 2.0) * 100.0


def _summary_line(label: str, value: str, color: str) -> None:
    print(f"  {color}{label:<18}{RESET} : {BOLD}{value}{RESET}")


# ---------------------------------------------------------------------------
# Options table
# ---------------------------------------------------------------------------

def print_options_table(options: list[FDOption]) -> None:
    print(divider("-"))
    print(f"  {'Option Label':<24} {'Bank':<10} {'FD Type':<9} {'Period':<8} {'Days':>5}  {'Ann. Rate':>9}  {'Min. Invest':>12}  {'Payout':<18} {'Every':<6}")
    print(f"  {'-'*24} {'-'*10} {'-'*9} {'-'*8} {'-'*5}  {'-'*9}  {'-'*12}  {'-'*18} {'-'*6}")
    for o in options:
        pp = o.payout_period_str if o.payout_period_str else "-"
        bank_str = (o.bank_id or o.bank_key or "-")[:10]
        fd_type = "eFD" if o.is_efd else "Standard"
        print(f"  {o.label:<24} {bank_str:<10} {fd_type:<9} {o.period_str:<8} {o.days:>5}  {o.annual_rate:>8.4f}%  {o.min_amount:>12,.2f}  {PAYOUT_ABBR[o.payout_type]:<18} {pp:<6}")
    print(divider("-"))


# ---------------------------------------------------------------------------
# Event timeline printer
# ---------------------------------------------------------------------------

_EVENT_LABELS = {
    EventType.INFLOW:        "[INFLOW] ",
    EventType.OUTFLOW:       "[OUTFLOW]",
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
            elif e.event_type == EventType.OUTFLOW:
                amt_str = f"{e.amount:>14,.2f}"
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
    print(f"  {'Ref':<9} {'Bank':<12} {'FD Type':<9} {'Option':<23} {'Payout':<18} {'Open':<11} {'Maturity':<11} {'Principal':>12} {'Interest':>10} {'Total':>12}")
    print(f"  {'-'*9} {'-'*12} {'-'*9} {'-'*23} {'-'*18} {'-'*11} {'-'*11} {'-'*12} {'-'*10} {'-'*12}")

    for idx, b in enumerate(result.bookings, start=1):
        ref = f"FD-{idx:04d}"
        payout_tag = PAYOUT_ABBR[b.payout_type]
        bank_str = (b.bank_id or b.bank_key or "-")[:12]
        fd_type = "eFD" if b.option.is_efd else "Standard"
        if b.payout_type == "cumulative":
            print(f"  {ref:<9} {bank_str:<12} {fd_type:<9} {b.option.label:<23} {payout_tag:<18} {str(b.start):<11} {str(b.end):<11} {b.principal:>12,.2f} {b.total_interest:>10,.2f} {b.total_received:>12,.2f}")
        else:
            print(f"  {ref:<9} {bank_str:<12} {fd_type:<9} {b.option.label:<23} {payout_tag:<18} {str(b.start):<11} {str(b.end):<11} {b.principal:>12,.2f} {'':>10} {'':>12}")
            for i, (flow_date, flow_amt) in enumerate(b.cash_flows, 1):
                is_last = (i == len(b.cash_flows))
                flow_lbl = (
                    "capital+interest" if (is_last and b.payout_type == "periodic_interest")
                    else ("last instalment" if is_last else f"payment {i}")
                )
                print(f"  {'':9}   * {flow_lbl:<22} {'':18} {'':11} {str(flow_date):<11} {'':>12} {'':>10} {flow_amt:>12,.2f}")

    print(divider("-"))



# ---------------------------------------------------------------------------
# Decision log -- final selected path only
# ---------------------------------------------------------------------------

def build_decision_log(result: SimResult) -> list[dict]:
    """Build a chronological explanation from the actions actually replayed.

    GAML and Absolute search trees are deliberately not inspected here: their
    replay timelines contain only the winning path, so alternatives never leak
    into the user-facing log.
    """
    dated_events = [
        event
        for key in result.sorted_dates()
        for event in result.timeline[key]
    ]
    booking_events = [event for event in dated_events if event.event_type == EventType.BOOKING]
    booking_by_ref = {
        event.booking_ref: booking
        for event, booking in zip(booking_events, result.bookings)
    }
    by_day: dict[date, list[Event]] = {}
    for event in dated_events:
        by_day.setdefault(event.on_date, []).append(event)

    def next_milestone(day: date) -> str:
        candidates = [
            event for event in dated_events
            if event.on_date > day and event.event_type in {
                EventType.CASH_FLOW, EventType.MATURITY, EventType.INFLOW, EventType.OUTFLOW
            }
        ]
        if not candidates:
            return f"Investment horizon ends {result.end_date}"
        event = min(candidates, key=lambda item: item.on_date)
        return f"{event.on_date}: {event.event_type.value} — {event.label} ({event.amount:,.2f} LKR)"

    records: list[dict] = []
    split_counts: dict[date, int] = {}
    for event in booking_events:
        if event.decision_context.get("action") == "split":
            split_counts[event.on_date] = split_counts.get(event.on_date, 0) + 1

    for event in booking_events:
        booking = booking_by_ref.get(event.booking_ref)
        if booking is None:
            continue
        account = result.accounts.get(booking.account_id)
        balances = event.decision_context.get("balances_before", {})
        action = event.decision_context.get("action", "invest")
        if action == "split":
            action_label = "Split investments" if split_counts.get(event.on_date, 0) > 1 else "Invest"
        else:
            action_label = "Consolidate and invest" if action == "consolidate" else "Invest"
        option = booking.option
        eligible = account.can_use_option(option) if account else not option.is_efd
        reasons = [
            f"{'Eligible' if eligible else 'Not eligible'} destination account for {'eFD' if option.is_efd else 'standard FD'}",
            f"Principal {booking.principal:,.2f} LKR meets minimum {option.min_amount:,.2f} LKR",
        ]
        if action == "consolidate":
            transfer_events = [
                item for item in by_day.get(event.on_date, [])
                if item.event_type == EventType.TRANSFER
            ]
            if transfer_events:
                fees = sum(item.fee for item in transfer_events)
                reasons.append(f"Consolidation transfers incurred {fees:,.2f} LKR in fees")
        if result.strategy_name.lower() == "greedy":
            reasons.append("Selected by Greedy's daily ranking of feasible rate, term, net interest and fees")
        elif result.strategy_name.lower() == "gaml":
            reasons.append("Part of the highest-value feasible path found within the GAML search budget")
        else:
            reasons.append("Part of the highest-value feasible path retained by Absolute branch-and-bound search")

        relevant = [
            f"{item.event_type.value}: {item.label} ({item.amount:,.2f} LKR)"
            for item in by_day.get(event.on_date, [])
            if item is not event and item.event_type in {
                EventType.INFLOW, EventType.OUTFLOW, EventType.TRANSFER,
                EventType.CASH_FLOW, EventType.MATURITY
            }
        ]
        milestone = next_milestone(event.on_date)
        reasons.append(f"Liquidity checkpoint: {milestone}")
        records.append({
            "date": event.on_date,
            "available_funds": dict(balances),
            "relevant_events": relevant,
            "action": action_label,
            "account_id": booking.account_id,
            "bank": booking.bank_id or booking.bank_key,
            "product": option.label,
            "fd_type": "eFD" if option.is_efd else "Standard FD",
            "rate": option.annual_rate,
            "term": option.period_str,
            "principal": booking.principal,
            "expected_return": booking.total_interest,
            "reason": reasons,
            "next_milestone": milestone,
        })

    # Carry records represent final-path decisions that intentionally retained
    # liquidity rather than creating an FD contract.
    for event in dated_events:
        if event.event_type != EventType.CARRY_FORWARD:
            continue
        milestone = next_milestone(event.on_date)
        carry_reason = event.label
        if "outflow" in milestone.lower():
            carry_reason += f"; liquidity retained ahead of the upcoming obligation ({milestone})"
        else:
            carry_reason += f"; cash remains liquid until the next scheduled event ({milestone})"
        records.append({
            "date": event.on_date,
            "available_funds": dict(event.decision_context.get("balances_before", {event.account_id: event.amount})),
            "relevant_events": [
                f"{item.event_type.value}: {item.label} ({item.amount:,.2f} LKR)"
                for item in by_day.get(event.on_date, [])
                if item is not event and item.event_type in {
                    EventType.INFLOW, EventType.OUTFLOW, EventType.TRANSFER,
                    EventType.CASH_FLOW, EventType.MATURITY
                }
            ],
            "action": "Carry cash forward",
            "account_id": event.account_id,
            "bank": event.bank_key,
            "product": None,
            "fd_type": None,
            "rate": None,
            "term": None,
            "principal": 0.0,
            "expected_return": 0.0,
            "reason": [carry_reason],
            "next_milestone": milestone,
        })

    records.sort(key=lambda item: (item["date"], item["action"], item["account_id"]))
    result.decision_log = records
    return records


def print_decision_log(result: SimResult) -> None:
    """Print the chronological decisions that produced the selected simulation."""
    records = build_decision_log(result)
    print()
    print(divider("="))
    print(f"  DECISION LOG — SELECTED {result.strategy_name.upper()} PATH")
    print(divider("="))
    if not records:
        print("  (no investment or carry-forward decisions)")
        print(divider("="))
        return
    for index, record in enumerate(records, 1):
        print(f"  {index:03d}. {record['date']} — {record['action']}")
        if record["available_funds"]:
            funds = ", ".join(f"{key}: {value:,.2f}" for key, value in record["available_funds"].items())
            print(f"       Available funds before action: {funds} LKR")
        if record["relevant_events"]:
            print("       Relevant events: " + "; ".join(record["relevant_events"]))
        if record["product"]:
            print(
                f"       Selected FD: {record['bank']} / {record['product']} "
                f"({record['fd_type']}, {record['rate']:.3f}%, {record['term']})"
            )
            print(
                f"       Account: {record['account_id']} | Principal: {record['principal']:,.2f} LKR | "
                f"Expected interest: {record['expected_return']:,.2f} LKR"
            )
        for reason in record["reason"]:
            print(f"       Reason: {reason}")
        print(f"       Next milestone: {record['next_milestone']}")
    print(divider("="))


# ---------------------------------------------------------------------------
# Main simulation printer
# ---------------------------------------------------------------------------

def print_simulation(
    result: SimResult,
    show_event_timeline: bool = True,
    show_booking_ledger: bool = True,
    comparison: dict[str, float] | None = None,
    show_decision_log: bool = True,
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
    if show_decision_log:
        print_decision_log(result)

    # -- Shared financial summary (same layout for every strategy) --
    print()
    print(divider("="))
    print(f"  GRAND SUMMARY  [{result.strategy_name}]")
    print(divider("-"))
    annualised = _xirr(result)
    _summary_line("Total Capital", f"{result.total_principal:,.2f} LKR", EVENT_COLORS[EventType.INFLOW])
    _summary_line("Gross Interest", f"{result.total_interest:,.2f} LKR", EVENT_COLORS[EventType.MATURITY])
    _summary_line("Transfer Fees", f"{result.total_transfer_fees:,.2f} LKR", EVENT_COLORS[EventType.TRANSFER])
    if result.total_outflows_due:
        _summary_line("Total Outflows", f"{result.total_outflows_due:,.2f} LKR", EVENT_COLORS[EventType.OUTFLOW])
        _summary_line("Outflows Paid", f"{result.total_outflows_paid:,.2f} LKR", EVENT_COLORS[EventType.OUTFLOW])
        if result.outstanding_outflows:
            outstanding_total = sum(float(item.get("remaining", 0.0)) for item in result.outstanding_outflows)
            _summary_line("Outstanding", f"{outstanding_total:,.2f} LKR", EVENT_COLORS[EventType.OUTFLOW])
            for item in result.outstanding_outflows:
                print(
                    f"    - {item.get('name', 'Outflow')} [{item.get('account_id', '')}]: "
                    f"{float(item.get('remaining', 0.0)):,.2f} LKR ({item.get('payment_policy', '')})"
                )
    _summary_line("Net Interest", f"{result.net_interest:,.2f} LKR", EVENT_COLORS[EventType.CASH_FLOW])
    _summary_line("Net Yield", f"{net_ret:.3f}%", EVENT_COLORS[EventType.BOOKING])
    annualised_text = f"{annualised:.3f}% p.a. (XIRR, money-weighted)" if annualised is not None else "N/A"
    _summary_line("Annualised Return", annualised_text, EVENT_COLORS[EventType.MATURITY])
    _summary_line("Final Balance", f"{result.final_value:,.2f} LKR", EVENT_COLORS[EventType.IDLE])
    if result.total_outflows_due:
        _summary_line("Cash Retained", f"{result.cash_retained:,.2f} LKR", EVENT_COLORS[EventType.IDLE])
        _summary_line("Cash-Flow Net Worth", f"{result.cash_flow_net_worth:,.2f} LKR", EVENT_COLORS[EventType.OUTFLOW])
    print(f"  {COLOR_DESC}{'Valuation Date':<18}{RESET} : {result.end_date}")
    if result.total_decisions_evaluated is not None:
        print(f"  {COLOR_DESC}{'Decisions Evaluated':<18}{RESET} : {result.total_decisions_evaluated:>14,}")

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

