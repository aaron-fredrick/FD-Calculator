from __future__ import annotations

from datetime import date, timedelta
import csv
from html import escape
from pathlib import Path
import os
import json
from typing import Any, Sequence

from core.reporting import build_decision_log, _xirr
from core.models import EventType, SimResult


def _load_bank_names() -> dict[str, str]:
    """Load display names for canonical bank IDs; IDs remain the model identity."""
    catalogue = Path(__file__).resolve().parent.parent / "data" / "banks" / "banks.csv"
    if not catalogue.is_file():
        return {}
    with catalogue.open("r", encoding="utf-8-sig", newline="") as handle:
        return {
            row["id"].strip(): row["name"].strip()
            for row in csv.DictReader(handle)
            if row.get("id", "").strip() and row.get("name", "").strip()
        }


def _money(value: float) -> str:
    return f"LKR {value:,.2f}"


def _amount(value: float) -> str:
    return f"{value:,.2f}"


def _date(value: Any) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)

_ACCOUNT_CHART_COLORS = (
    "#56b4e9", "#e69f00", "#009e73", "#cc79a7",
    "#f0e442", "#d55e00", "#8be9fd", "#bd93f9",
    "#4dd0e1", "#f78c6b", "#a3be8c", "#c792ea",
)


def _build_account_balance_series(
    result: SimResult,
    opening_balances: dict[str, float],
    start: date,
    end: date,
    consolidation_account_id: str | None,
    *,
    compound: bool = False,
    actual_leap_year: bool = True,
) -> dict[str, list[dict[str, Any]]]:
    """Build event-stage liquid-cash and bank-level outstanding-FD-principal series."""
    import colorsys

    if end < start:
        raise ValueError("end date must not be earlier than start date")

    accounts = list(result.accounts.values())
    if consolidation_account_id in result.accounts:
        accounts.sort(key=lambda account: account.id != consolidation_account_id)

    def identity(value: str) -> str:
        return str(value or "").strip().upper()

    consolidation = result.accounts.get(consolidation_account_id or "")
    main_bank = identity(consolidation.bank_identity) if consolidation else ""
    bank_order: list[str] = []
    for account in accounts:
        bank = identity(account.bank_identity)
        if bank and bank not in bank_order:
            bank_order.append(bank)
    if main_bank in bank_order:
        bank_order.remove(main_bank)
        bank_order.insert(0, main_bank)

    # Bank hues run from blue through cyan/green to yellow-orange. Every
    # account at one bank shares its bank hue; FD principal uses a muted
    # version of that exact hue.
    bank_colors: dict[str, str] = {}
    fd_colors: dict[str, str] = {}
    for index, bank in enumerate(bank_order):
        fraction = index / max(1, len(bank_order) - 1)
        hue = (220.0 - 185.0 * fraction) / 360.0
        brightness = 1.0 if bank == main_bank else 0.8
        rgb = colorsys.hsv_to_rgb(hue, 1.0, brightness)
        bank_colors[bank] = "#" + "".join(f"{round(channel * 255):02x}" for channel in rgb)
        fd_rgb = colorsys.hsv_to_rgb(hue, 0.5, 0.5)
        fd_colors[bank] = "#" + "".join(f"{round(channel * 255):02x}" for channel in fd_rgb)

    bank_names = _load_bank_names()
    display_names = {
        bank: bank_names.get(bank, bank.removeprefix("LK_").replace("_", " ").title())
        for bank in bank_order
    }
    cash = {account.id: float(opening_balances.get(account.id, 0.0)) for account in accounts}

    booking_events = [
        event for day_key in result.sorted_dates()
        for event in result.timeline[day_key]
        if event.event_type == EventType.BOOKING
    ]
    booking_by_ref = {
        event.booking_ref: booking
        for event, booking in zip(booking_events, result.bookings)
        if event.booking_ref
    }
    fd_principal: dict[str, float] = {bank: 0.0 for bank in bank_order}
    for booking in result.bookings:
        bank = identity(booking.bank_id or booking.option.bank_identity or booking.bank_key)
        if bank and booking.start < start <= booking.end:
            fd_principal[bank] = fd_principal.get(bank, 0.0) + float(booking.principal)

    account_series = []
    for account in accounts:
        bank = identity(account.bank_identity)
        is_main_account = account.id == consolidation_account_id
        same_main_bank = bool(main_bank and bank == main_bank)
        account_series.append({
            "name": account.label or account.id,
            "seriesType": "account",
            "accountId": account.id,
            "bankId": bank,
            "points": [],
            "color": bank_colors.get(bank, "#56b4e9"),
            "lineStyle": "solid" if is_main_account else ("dashed" if same_main_bank else "dotted"),
        })

    fd_series = []
    booked_banks = []
    for booking in result.bookings:
        bank = identity(booking.bank_id or booking.option.bank_identity or booking.bank_key)
        if bank and bank not in booked_banks:
            booked_banks.append(bank)
    booked_banks.sort(key=lambda bank: bank_order.index(bank) if bank in bank_order else len(bank_order))
    for bank in booked_banks:
        fd_series.append({
            "name": f"{display_names.get(bank, bank)} · FD principal",
            "seriesType": "fd_principal",
            "bankId": bank,
            "points": [],
            "color": fd_colors.get(bank, "#808080"),
            "lineStyle": "solid",
        })

    series_by_account = {item["accountId"]: item for item in account_series}
    series_by_bank = {item["bankId"]: item for item in fd_series}
    stages: list[dict[str, Any]] = []
    sequence = 0

    def append_stage(day: date, stage_number: int, label: str) -> None:
        nonlocal sequence
        sequence += 1
        stage = {
            "x": sequence,
            "date": _date(day),
            "stage": f"S{stage_number}",
            "event": label,
        }
        stages.append(stage)
        for account in account_series:
            account["points"].append({
                **stage, "y": round(cash.get(account["accountId"], 0.0), 2)
            })
        for bank_series in fd_series:
            bank_series["points"].append({
                **stage, "y": round(fd_principal.get(bank_series["bankId"], 0.0), 2)
            })

    for day_key in result.sorted_dates():
        events = result.timeline[day_key]
        day = events[0].on_date if events else date.fromisoformat(str(day_key))
        if not start <= day <= end:
            continue
        stage_number = 0
        for event in events:
            account_id = str(event.account_id or "")
            amount = float(event.amount)
            label = event.label or event.event_type.value.upper()

            if event.event_type == EventType.INFLOW:
                cash[account_id] = cash.get(account_id, 0.0) + amount
                stage_number += 1
                append_stage(day, stage_number, label)
            elif event.event_type == EventType.OUTFLOW:
                if amount < 0:
                    cash[account_id] = cash.get(account_id, 0.0) + amount
                    stage_number += 1
                    append_stage(day, stage_number, label)
            elif event.event_type == EventType.BOOKING:
                cash[account_id] = cash.get(account_id, 0.0) - abs(amount)
                bank = identity(event.bank_id or event.bank_key)
                if not bank and event.booking_ref in booking_by_ref:
                    booking = booking_by_ref[event.booking_ref]
                    bank = identity(booking.bank_id or booking.option.bank_identity or booking.bank_key)
                if bank:
                    fd_principal[bank] = fd_principal.get(bank, 0.0) + abs(amount)
                stage_number += 1
                append_stage(day, stage_number, label)
            elif event.event_type in {EventType.CASH_FLOW, EventType.MATURITY}:
                cash[account_id] = cash.get(account_id, 0.0) + amount
                if event.event_type == EventType.MATURITY:
                    booking = booking_by_ref.get(event.booking_ref)
                    bank = identity(
                        (booking.bank_id or booking.option.bank_identity or booking.bank_key)
                        if booking else (event.bank_id or event.bank_key)
                    )
                    principal = float(booking.principal) if booking else 0.0
                    if bank and principal:
                        fd_principal[bank] = max(0.0, fd_principal.get(bank, 0.0) - principal)
                stage_number += 1
                append_stage(day, stage_number, label)
            elif event.event_type == EventType.TRANSFER:
                if label.startswith(("Transfer to ", "Final sweep to ")):
                    cash[account_id] = cash.get(account_id, 0.0) - abs(amount)
                    stage_number += 1
                    channel = "INTRA-BANK" if event.transfer_channel == "intra_bank" else "INTER-BANK"
                    destination = label.removeprefix("Transfer to ").removeprefix("Final sweep to ")
                    append_stage(day, stage_number, f"{channel} TO · {destination}")
                    # The fee is a distinct ledger movement and therefore gets
                    # its own chart stage after the transfer principal.
                    if event.fee > 0:
                        cash[account_id] = cash.get(account_id, 0.0) - abs(float(event.fee))
                        stage_number += 1
                        append_stage(day, stage_number, f"{channel} TF")
                elif label.startswith(("Transfer received", "Final sweep received")):
                    cash[account_id] = cash.get(account_id, 0.0) + amount
                    stage_number += 1
                    channel = "INTRA-BANK" if event.transfer_channel == "intra_bank" else "INTER-BANK"
                    append_stage(day, stage_number, f"{channel} TI")

    return {"accounts": account_series, "fd_principal": fd_series, "stages": stages}



def _table_rows(items: Sequence[dict], columns: Sequence[tuple[str, str]]) -> str:
    if not items:
        return '<tr><td colspan="99" class="empty">None configured</td></tr>'
    out = []
    for item in items:
        cells = "".join(f"<td>{escape(str(item.get(key, '—')))}</td>" for key, _ in columns)
        out.append(f"<tr>{cells}</tr>")
    return "".join(out)


def _schedule_text(item: dict) -> str:
    if item.get("type") == "recurring":
        return f"Every {item.get('interval', '—')} · {_date(item.get('start_date', '—'))} to {_date(item.get('end_date', '—'))}"
    return ", ".join(_date(day) for day in item.get("dates", []))


def generate_html_report(
    result: SimResult,
    config: dict,
    *,
    start: date,
    end: date,
    output_path: str | Path,
    chart_paths: Sequence[str | Path] = (),
) -> Path:
    """Create a self-contained dark-themed HTML execution and analysis report."""
    path = Path(output_path).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    records = sorted(build_decision_log(result), key=lambda item: (item["date"], item.get("booking_ref", "")))
    bank_names = _load_bank_names()
    def _bank_display_name(bank_id: str | None, bank_key: str | None) -> str:
        registered = bank_names.get(bank_id or "") or bank_names.get(bank_key or "")
        if registered:
            return registered
        fallback = (bank_key or bank_id or "Bank").removeprefix("LK_")
        return fallback.replace("_", " ").title()

    account_display = {
        account.id: f"{account.label or account.id} · {_bank_display_name(account.bank_id, account.bank_key)}"
        for account in result.accounts.values()
    }
    account_display_by_label = {
        account.label: account_display[account.id]
        for account in result.accounts.values() if account.label
    }

    # Configuration stores accounts as a list[Account], not a dict keyed by ID.
    # The simulator works on copies, so these retain the original opening balances.
    configured_accounts = config.get("accounts", [])
    if isinstance(configured_accounts, dict):
        opening_balances = {
            str(account_id): float(entry.get("balance", 0.0) if isinstance(entry, dict) else getattr(entry, "balance", 0.0))
            for account_id, entry in configured_accounts.items()
        }
    else:
        opening_balances = {
            account.id: float(account.balance)
            for account in configured_accounts
            if hasattr(account, "id") and hasattr(account, "balance")
        }

    account_rows = []
    for account in result.accounts.values():
        account_rows.append({
            "label": account.label or account.id,
            "id": account.id,
            "bank": _bank_display_name(account.bank_id, account.bank_key),
            # Account objects contain post-simulation balances. This table describes
            # scenario setup, so display the configured starting cash instead.
            "balance": _amount(opening_balances.get(account.id, account.balance)),
            "efd": "Enabled" if account.supports_efd else "Standard FD only",
            "role": "Consolidation account" if account.id == config.get("consolidation_account_id") else "Investment account",
        })
    inflows = config.get("inflow_summaries", [])
    outflows = config.get("outflow_summaries", [])
    inflow_rows = [{
        "name": x["name"], "amount": _amount(x["amount"]), "schedule": _schedule_text(x),
        "account": (result.accounts[x["account_id"]].label if x["account_id"] in result.accounts else x["account_id"]), "occurrences": x["occurrences"], "total": _amount(x["total"]),
    } for x in inflows]
    outflow_rows = [{
        "name": x["name"], "amount": _amount(x["amount"]), "schedule": _schedule_text(x),
        "account": (result.accounts[x["account_id"]].label if x["account_id"] in result.accounts else x["account_id"]), "occurrences": x["occurrences"],
        "total": _amount(x["total"]), "policy": x.get("payment_policy", "—"),
    } for x in outflows]

    def table(title: str, headers: Sequence[tuple[str, str]], rows: Sequence[dict]) -> str:
        head = "".join(f"<th>{escape(label)}</th>" for _, label in headers)
        count = len(rows)
        summary = f"{escape(title)} <span>{count} rows · click to expand</span>"
        return (
            f'<details class="collapsible-table"><summary>{summary}</summary>'
            f'<div class="table-wrap"><table><thead><tr>{head}</tr></thead>'
            f'<tbody>{_table_rows(rows, headers)}</tbody></table></div></details>'
        )

    account_table = table("Accounts", 
        [("label", "Account"), ("id", "Account ID"), ("bank", "Bank"), ("balance", "Opening balance (LKR)"),
         ("efd", "eFD capability"), ("role", "Role")], account_rows)
    inflow_table = table("Planned inflows",
        [("name", "Inflow"), ("amount", "Per occurrence (LKR)"), ("schedule", "Schedule"),
         ("account", "Credit account"), ("occurrences", "Count"), ("total", "Total (LKR)")], inflow_rows)
    outflow_table = table("Planned outflows",
        [("name", "Outflow"), ("amount", "Per occurrence (LKR)"), ("schedule", "Schedule"),
         ("account", "Debit account"), ("occurrences", "Count"), ("total", "Total (LKR)"),
         ("policy", "Payment policy")], outflow_rows)

    decision_cards = []
    investment_rows = []
    capital_flow_rows = []
    records_by_day: dict[date, list[dict]] = {}
    for record in records:
        records_by_day.setdefault(record["date"], []).append(record)

    def _instruction_transfer(step: dict, step_number: int) -> str:
        description = str(step.get("description", ""))
        if not description.startswith("Transfer to "):
            return ""
        destination_label = description.removeprefix("Transfer to ")
        destination = account_display_by_label.get(destination_label, destination_label)
        source_id = str(step.get("account_id") or "")
        source_display = account_display.get(source_id, str(step.get("account_label") or source_id))
        channel = str(step.get("channel", "TRANSFER")).replace(
            "DOMESTIC CEFT", "Inter-bank CEFT"
        ).replace("INTRA-BANK", "Same-bank transfer")
        return f"""
          <div class="instruction transfer-instruction">
            <div class="instruction-title"><span>STEP {step_number}</span> Transfer funds</div>
            <div class="route">
              <div><small>FROM · SOURCE ACCOUNT</small><b>{escape(source_display)}</b></div>
              <span class="route-arrow">→</span>
              <div><small>TO · DESTINATION ACCOUNT</small><b>{escape(destination)}</b></div>
            </div>
            <div class="instruction-meta">
              <span><small>Transfer amount</small><b>{_money(float(step.get("amount", 0)))}</b></span>
              <span><small>Estimated fee</small><b class="negative">{_money(float(step.get("fee", 0)))}</b></span>
              <span><small>Transfer method</small><b>{escape(channel)}</b></span>
            </div>
          </div>"""

    for decision_day, day_records in sorted(records_by_day.items()):
        booking_records = [item for item in day_records if item.get("product")]
        carry_records = [item for item in day_records if not item.get("product")]
        transfer_steps = [
            step for item in day_records for step in item.get("transfer_steps", [])
            if str(step.get("description", "")).startswith("Transfer to ")
        ]
        # build_decision_log repeats the day's transfer events on every booking
        # record. Deduplicate by source account, description and amount.
        unique_transfers = []
        seen_transfers = set()
        for step in transfer_steps:
            identity = (
                step.get("account_id"), step.get("description"),
                round(float(step.get("amount", 0)), 2), round(float(step.get("fee", 0)), 2),
            )
            if identity not in seen_transfers:
                seen_transfers.add(identity)
                unique_transfers.append(step)
        transfer_steps = unique_transfers
        transfers = "".join(
            _instruction_transfer(step, number)
            for number, step in enumerate(transfer_steps, 1)
        )

        reasons = []
        for record in day_records:
            for reason in record.get("reason", []):
                if reason not in reasons:
                    reasons.append(reason)
        reasons_html = "".join(f"<li>{escape(str(reason))}</li>" for reason in reasons)
        first_record = booking_records[0] if booking_records else day_records[0]
        balances = "".join(
            f'<span class="chip">{escape((result.accounts[str(account_id)].label if str(account_id) in result.accounts else str(account_id)))}: {_money(float(balance))}</span>'
            for account_id, balance in first_record.get("available_funds", {}).items()
        )

        booking_actions = []
        expected_blocks = []
        for booking_index, item in enumerate(booking_records, len(transfer_steps) + 1):
            account_id = str(item.get("account_id", ""))
            account_name = str(item.get("account_label", account_id))
            booking_actions.append(f"""
              <div class="instruction booking-instruction">
                <div class="instruction-title"><span>STEP {booking_index}</span> Open the fixed deposit</div>
                <div class="detail-grid">
                  <div><small>Account</small><b>{escape(str(account_name))}</b></div>
                  <div><small>Product</small><b>{escape(str(item.get('product', '—')))} · {escape(str(item.get('fd_type', '—')))}</b></div>
                  <div><small>Investment amount</small><b>{_money(item['principal'])}</b></div>
                  <div><small>Rate / term</small><b>{float(item['rate']):.3f}% p.a. · {escape(str(item['term']))}</b></div>
                  <div><small>Booking → maturity</small><b>{_date(item['booking_start'])} → {_date(item['maturity_date'])}</b></div>
                  <div><small>Payout</small><b>{escape(str(item.get('payout_type', '—')))}</b></div>
                </div>
              </div>""")
            expected_blocks.append(f"""
              <div class="expected">
                <b>{escape(str(item.get('booking_ref', 'FD')))} expected outcome</b>
                <span>Gross interest {_money(item.get('expected_return', 0))}</span>
                <span>AIT <b class="negative">{_money(item.get('expected_ait', 0))}</b></span>
                <span>Net interest <b class="positive">{_money(item.get('expected_net_return', 0))}</b></span>
                <span>Maturity <b>{_date(item['maturity_date'])}</b></span>
              </div>""")
            investment_rows.append({
                "account": str(item.get("account_label", account_name)), "product": f"{item.get('product', '—')} · {item.get('fd_type', '—')}",
                "principal": _amount(item["principal"]), "rate": f"{float(item['rate']):.3f}%",
                "term": item.get("term", "—"), "booking": _date(item["booking_start"]),
                "maturity": _date(item["maturity_date"]),
                "gross": _amount(item.get("expected_return", 0)),
                "ait": _amount(item.get("expected_ait", 0)),
                "net": _amount(item.get("expected_net_return", 0)),
            })

        if booking_records:
            title = (
                "Transfer funds and open multiple FDs" if transfers and len(booking_records) > 1
                else "Transfer funds and open an FD" if transfers
                else "Open multiple FDs across accounts" if len(booking_records) > 1
                else "Open an FD using available funds"
            )
            action_html = transfers + "".join(booking_actions)
            expected_html = "".join(expected_blocks)
        else:
            retained_accounts = sorted({
                str(item.get("account_label", item.get("account_id", "account")))
                for item in carry_records
            })
            title = "Transfer funds between accounts" if transfers else "Keep funds available"
            retained = (
                '<div class="retained-note"><b>No FD booking required.</b> '
                f'Keep available cash in {escape(", ".join(retained_accounts))} until the next liquidity checkpoint.</div>'
                if carry_records else ""
            )
            action_html = transfers + retained
            expected_html = ""

        checkpoint = first_record.get("next_milestone", "—")
        decision_cards.append(f"""
          <article class="decision">
            <div class="decision-head"><span class="step">DECISION {len(decision_cards)+1:02d}</span>
              <span class="date">{_date(decision_day)}</span><h3>{escape(title)}</h3></div>
            <h4>Action required</h4>
            {'<p class="muted">Strategy classification: Carry cash forward.</p>' if carry_records and not booking_records else ''}
            {action_html if action_html else '<p class="muted">No external bank action is required at this point.</p>'}
            {('<h4>Why this decision</h4><ul class="compact">' + reasons_html + '</ul>') if reasons_html else ''}
            {expected_html}
            {('<h4>Balances before decision</h4><div class="chips">' + balances + '</div>') if balances else ''}
            <p class="checkpoint"><b>Next checkpoint:</b> {escape(str(checkpoint))}</p>
          </article>""")

    for key in result.sorted_dates():
        for event in result.timeline[key]:
            account = result.accounts.get(event.account_id)
            account_name = (account.label if account else (event.account_id or "—"))
            if event.event_type == EventType.TRANSFER and event.label.startswith("Transfer to "):
                capital_flow_rows.append({
                    "date": _date(event.on_date), "movement": "Account transfer",
                    "source": account_name, "destination": event.label.removeprefix("Transfer to "),
                    "amount": _amount(event.amount), "fee": _amount(event.fee),
                })
            elif event.event_type == EventType.BOOKING:
                capital_flow_rows.append({
                    "date": _date(event.on_date), "movement": "FD booking",
                    "source": account_name, "destination": event.label,
                    "amount": _amount(abs(event.amount)), "fee": "—",
                })

    investment_table = table("Selected fixed deposits",
        [("account", "Account"), ("product", "FD product"), ("principal", "Principal (LKR)"),
         ("rate", "Rate"), ("term", "Term"), ("booking", "Booking date"), ("maturity", "Maturity"),
         ("gross", "Gross interest (LKR)"), ("ait", "AIT (LKR)"), ("net", "Net interest (LKR)")],
        investment_rows,
    )
    capital_flow_table = table("Movement records",
        [("date", "Date"), ("movement", "Movement"), ("source", "From / account"),
         ("destination", "To / product"), ("amount", "Amount (LKR)"), ("fee", "Fee (LKR)")],
        capital_flow_rows,
    )

    event_rows = []
    booking_by_ref = {
        f"FD-{index:04d}": booking
        for index, booking in enumerate(result.bookings, 1)
    }
    last_event_day = None
    last_group_day = None
    last_group_title = None

    def _event_account_reference(label: str) -> str:
        for prefix in ("Transfer to ", "Transfer from ", "Final sweep to ", "Final sweep from "):
            if label.startswith(prefix):
                account_label = label.removeprefix(prefix)
                return prefix + account_display_by_label.get(account_label, account_label)
        return label

    def append_event_row(day, account_label, label, amount, description, balance, css_type, group_title):
        nonlocal last_event_day, last_group_day, last_group_title
        is_new_day = day != last_event_day
        date_cell = _date(day) if is_new_day else ""
        if last_event_day is None:
            row_class = ""
        elif is_new_day:
            row_class = ' class="event-day-start"'
        elif day != last_group_day or group_title != last_group_title:
            row_class = ' class="event-subgroup-start"'
        else:
            row_class = ' class="event-item-start"'
        last_group_day = day
        last_group_title = group_title
        signed_amount = (
            f"+{amount:,.2f}" if amount > 0
            else _amount(amount)
        )
        event_rows.append(
            f'<tr{row_class}><td class="event-date">{date_cell}</td><td>{escape(account_label)}</td>'
            f'<td><span class="event-pill {escape(css_type)}">{escape(label)}</span></td>'
            f'<td class="num event-amount {escape(css_type)}">{signed_amount}</td>'
            f'<td>{escape(description)}</td><td class="num">{_money(balance)}</td></tr>'
        )
        last_event_day = day

    for key in result.sorted_dates():
        for event in result.timeline[key]:
            if event.event_type == EventType.INFLOW and event.amount == 0 and event.label == "Opening balance trigger":
                continue
            account = result.accounts.get(event.account_id)
            account_label = account.label if account else (event.account_id or "—")
            event_type = event.event_type.value.replace("_", " ").title()
            display_amount = float(event.amount)
            display_balance = float(event.balance_after)
            booking = booking_by_ref.get(event.booking_ref)

            if event.event_type == EventType.BOOKING:
                append_event_row(
                    event.on_date, account_label, "BOOK", -abs(display_amount),
                    event.label, display_balance, "booking", "FD BOOKINGS",
                )
                continue

            if event.event_type == EventType.TRANSFER:
                channel = "INTRA-BANK" if event.transfer_channel == "intra_bank" else "INTER-BANK"
                outgoing = event.label.startswith(("Transfer to ", "Final sweep to "))
                if outgoing:
                    append_event_row(
                        event.on_date, account_label, f"{channel} TO",
                        -(event.amount - event.fee), event.label,
                        display_balance + event.fee, "transfer-to", f"{channel} TRANSFERS",
                    )
                    if event.fee > 0:
                        append_event_row(
                            event.on_date, account_label, f"{channel} TF", -event.fee,
                            f"Transfer fee for {_event_account_reference(event.label)}", event.balance_after, "outflow",
                            f"{channel} TRANSFERS",
                        )
                else:
                    append_event_row(
                        event.on_date, account_label, f"{channel} TI", event.amount,
                        _event_account_reference(event.label), display_balance, "transfer", f"{channel} TRANSFERS",
                    )
                continue

            if booking is not None and event.event_type in {EventType.CASH_FLOW, EventType.MATURITY}:
                gross_amount = next(
                    (amount for flow_day, amount in booking.cash_flows if flow_day == event.on_date),
                    event.amount,
                )
                ait = max(0.0, float(gross_amount) - float(event.amount)) if result.ait_enabled else 0.0
                if event.event_type == EventType.CASH_FLOW:
                    if booking.payout_type == "periodic_interest":
                        period = (booking.option.payout_period_str or "").strip().lower()
                        label = "YEAR INTEREST" if period.startswith("y") else "MONTH INTEREST" if period.startswith("m") else f"{period.upper()} INTEREST".strip()
                        group_title = "PERIODIC INTEREST PAYOUT · AIT" if ait > 0.005 else "PERIODIC INTEREST PAYOUT"
                    else:
                        label = "INSTALLMENT"
                        group_title = "INSTALLMENT PAYOUT · AIT" if ait > 0.005 else "INSTALLMENT PAYOUT"
                    append_event_row(
                        event.on_date, account_label, label, float(gross_amount),
                        event.label, display_balance + ait, "cash_flow", group_title,
                    )
                elif booking.payout_type in {"cumulative", "periodic_interest"}:
                    maturity_interest = float(event.amount) - booking.principal
                    gross_interest = float(gross_amount) - booking.principal
                    maturity_group = "FD MATURITY · PRINCIPAL · INTEREST · AIT"
                    append_event_row(
                        event.on_date, account_label, "MATURE PRINCIPAL",
                        booking.principal, f"Principal returned {event.booking_ref}",
                        display_balance - max(0.0, maturity_interest), "mature-principal",
                        maturity_group,
                    )
                    if gross_interest > 0:
                        append_event_row(
                            event.on_date, account_label, "MATURE INTEREST",
                            gross_interest, f"Interest paid at maturity {event.booking_ref}",
                            display_balance + ait, "cash_flow", maturity_group,
                        )
                else:
                    maturity_group = "FD MATURITY · CASH FLOW · AIT"
                    append_event_row(
                        event.on_date, account_label, "MATURE CASH FLOW",
                        float(gross_amount), event.label, display_balance + ait, "maturity",
                        maturity_group,
                    )
                if ait > 0.005:
                    append_event_row(
                        event.on_date, account_label, "AIT WITHHELD", -ait,
                        "AIT deducted from interest payout", event.balance_after, "outflow",
                        maturity_group if event.event_type == EventType.MATURITY else group_title,
                    )
                continue

            labels = {
                EventType.INFLOW: "INFLOW", EventType.OUTFLOW: "OUTFLOW",
                EventType.CARRY_FORWARD: "CARRY FORWARD", EventType.IDLE: "IDLE",
            }
            label = labels.get(event.event_type, event_type).upper()
            group_title = {
                EventType.INFLOW: "AVAILABLE CAPITAL · INFLOWS",
                EventType.OUTFLOW: "CASH REQUIREMENTS · OUTFLOWS",
                EventType.CARRY_FORWARD: "RETAINED CASH · NO TRANSACTION",
                EventType.IDLE: "IDLE / UNALLOCATED CASH",
            }.get(event.event_type, "OTHER LEDGER EVENTS")
            append_event_row(
                event.on_date, account_label, label, display_amount,
                event.label, display_balance, event.event_type.value, group_title,
            )


    xirr = _xirr(result)
    gross_interest = result.total_interest
    net_interest = result.net_interest
    total_capital = result.total_principal
    yield_pct = (net_interest / total_capital * 100.0) if total_capital else 0.0
    summary_note = ""
    if result.outstanding_outflows:
        summary_note = f'<p class="warning">Outstanding outflows remain: {escape(str(result.outstanding_outflows))}</p>'

    fee_config = config.get("fee_config")
    overview_html = f"""
      <div class="overview-grid">
        <article class="panel"><small>Simulation window</small><strong>{_date(start)} → {_date(end)}</strong><p>{(end-start).days + 1} calendar days</p></article>
        <article class="panel"><small>Strategy</small><strong>{escape(result.strategy_name)}</strong><p>Selected simulation path</p></article>
        <article class="panel"><small>Interest calculation</small><strong>{"Compound" if config.get("compound") else "Simple"}</strong><p>{"Actual leap-year basis" if config.get("actual_leap_year") else "365-day basis"}</p></article>
        <article class="panel"><small>Tax treatment</small><strong>{f"AIT · {result.ait_rate:.1%}" if result.ait_enabled else "AIT disabled"}</strong><p>Applied to interest payouts</p></article>
        <article class="panel"><small>Consolidation account</small><strong>{escape(account_display.get(config.get("consolidation_account_id"), config.get("consolidation_account_id", "—")))}</strong><p>Terminal cash destination</p></article>
        <article class="panel"><small>Default transfer fees</small><strong>{_money(fee_config.default_inter_bank_fee if fee_config else 0)}</strong><p>Inter-bank · Same-bank {_money(fee_config.same_bank_fee if fee_config else 0)}</p></article>
      </div>
    """
    outcome_html = f"""
      <div class="equation-panel"><b>Net interest reconciliation</b>
      <div class="equation">
        <div><small>Gross interest (LKR)</small><strong class="positive">{_amount(gross_interest)}</strong></div><span>−</span>
        <div><small>AIT withheld (LKR)</small><strong class="negative">{_amount(result.ait_withheld)}</strong></div><span>−</span>
        <div><small>Transfer fees (LKR)</small><strong class="negative">{_amount(result.total_transfer_fees)}</strong></div><span>=</span>
        <div class="equation-result"><small>Net interest (LKR)</small><strong>{_amount(net_interest)}</strong></div>
      </div><p class="muted">Net interest = gross interest − AIT − transfer fees. AIT is withheld from interest; transfer fees are deducted from cash.</p></div>
      <div class="outcome-grid">
        <div class="outcome-metric"><small>Total capital contributed (LKR)</small><strong>{_amount(total_capital)}</strong><p>Opening funds plus scheduled deposits.</p></div>
        <div class="outcome-metric"><small>Final simulated portfolio value (LKR)</small><strong>{_amount(result.final_value)}</strong><p>Cash held across accounts at the end of the simulation.</p></div>
        <div class="outcome-metric"><small>Net return on contributed capital</small><strong>{yield_pct:.3f}%</strong><p>Net interest divided by total contributed capital.</p></div>
        <div class="outcome-metric"><small>Annualised money-weighted return</small><strong>{f"{xirr:.3f}% p.a." if xirr is not None else "N/A"}</strong><p>XIRR accounts for the timing of deposits and withdrawals.</p></div>
      </div>{summary_note}
    """
    # Build compact, source-derived chart datasets. No browser-side financial
    # calculations are used for headline results.
    flow_totals: dict[str, dict[str, float]] = {}
    for day_key in result.sorted_dates():
        for event in result.timeline[day_key]:
            day = _date(event.on_date)
            category = None
            amount = float(event.amount)
            if event.event_type == EventType.INFLOW:
                category = "Deposits"
            elif event.event_type == EventType.OUTFLOW and amount < 0:
                category = "Outflows"
            elif event.event_type == EventType.BOOKING:
                category, amount = "FD investments", -abs(amount)
            elif event.event_type == EventType.CASH_FLOW:
                category = "Interest payouts"
            elif event.event_type == EventType.MATURITY:
                category = "FD maturities"
            elif event.event_type == EventType.TRANSFER:
                if event.label.startswith(("Transfer to ", "Final sweep to ")):
                    category, amount = "Transfers out", -abs(amount)
                elif event.label.startswith(("Transfer received", "Final sweep received")):
                    category = "Transfers in"
            if category and abs(amount) >= 0.005:
                bucket = flow_totals.setdefault(category, {})
                bucket[day] = bucket.get(day, 0.0) + amount

    account_chart = _build_account_balance_series(
        result,
        opening_balances,
        start,
        end,
        config.get("consolidation_account_id"),
        compound=bool(config.get("compound", False)),
        actual_leap_year=bool(config.get("actual_leap_year", True)),
    )
    flow_chart = [{"name": name, "points": [{"x": d, "y": v} for d, v in sorted(points.items())]}
                  for name, points in flow_totals.items()]
    maturity_chart = [{
        "name": f"{booking.option.label} · {booking.account_id}",
        "start": _date(booking.start), "end": _date(booking.end),
        "principal": float(booking.principal), "interest": float(booking.total_interest),
        "rate": float(booking.option.annual_rate),
    } for booking in result.bookings]
    chart_data = {
        "accounts": account_chart["accounts"], "fd_principal": account_chart["fd_principal"],
        "stages": account_chart["stages"], "cashflows": flow_chart, "maturities": maturity_chart,
        "returns": [
            {"name": "Net interest", "value": float(net_interest)},
            {"name": "AIT withheld", "value": float(result.ait_withheld)},
            {"name": "Transfer fees", "value": float(result.total_transfer_fees)},
        ],
    }
    chart_json = json.dumps(chart_data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    ledger_html = f"""
      <details class="collapsible-table"><summary>Ledger entries <span>{len(event_rows)} rows · expand</span></summary>
      <div class="table-wrap"><table><thead><tr><th>Date</th><th>Account</th><th>Event</th><th class="num">Amount (LKR)</th><th>Description</th><th class="num">Balance after (LKR)</th></tr></thead><tbody>{''.join(event_rows) if event_rows else '<tr><td colspan="6" class="empty">No events</td></tr>'}</tbody></table></div></details>
    """
    template_dir = Path(__file__).resolve().parent / "report_templates"
    template = (template_dir / "report.html").read_text(encoding="utf-8")
    css = (template_dir / "report.css").read_text(encoding="utf-8")
    js = (template_dir / "report.js").read_text(encoding="utf-8")
    html = template.replace("{{REPORT_CSS}}", css)
    html = html.replace("{{REPORT_JS}}", js)
    replacements = {
        "{{REPORT_TITLE}}": "FD Cal · Simulation Report",
        "{{REPORT_PERIOD}}": f"{_date(start)} — {_date(end)} · {(end-start).days + 1} calendar days · {escape(result.strategy_name)} strategy",
        "{{OVERVIEW_CONTENT}}": overview_html,
        "{{OUTCOME_CONTENT}}": outcome_html,
        "{{EXECUTION_CONTENT}}": ''.join(decision_cards) if decision_cards else '<div class="panel">No FD bookings or actionable transfers were selected.</div>',
        "{{PORTFOLIO_CONTENT}}": f"{account_table}{investment_table}",
        "{{CASHFLOW_CONTENT}}": f'<div class="grid2"><div>{inflow_table}</div><div>{outflow_table}</div></div>',
        "{{ANALYTICS_CONTENT}}": '<div class="chart-grid"><article class="chart-panel"><h3>Account cash and bank FD principal</h3><canvas id="account-chart" aria-label="Intra-day account cash and bank fixed deposit principal by event stage"></canvas><p class="muted">Each plotted stage is the state immediately after a ledger event. Account lines show liquid cash; bank FD lines aggregate outstanding principal only. Interest is excluded from FD principal.</p></article><article class="chart-panel"><h3>Cash movement timeline</h3><canvas id="cashflow-chart" aria-label="Cash movement timeline"></canvas><p class="muted">Positive values are receipts; negative values are uses of cash.</p></article><article class="chart-panel"><h3>FD maturity schedule</h3><canvas id="maturity-chart" aria-label="FD booking and maturity schedule"></canvas><p class="muted">Bars span each contract booking date to maturity.</p></article><article class="chart-panel"><h3>Return composition</h3><canvas id="returns-chart" aria-label="Net return composition"></canvas><p class="muted">Net interest, AIT withheld and transfer fees.</p></article></div>',
        "{{PORTFOLIO_AUDIT_CONTENT}}": capital_flow_table,
        "{{LEDGER_CONTENT}}": ledger_html,
        "{{CHART_DATA}}": chart_json,
    }
    for token, value in replacements.items():
        html = html.replace(token, value)
    path.write_text(html, encoding="utf-8")
    return path
