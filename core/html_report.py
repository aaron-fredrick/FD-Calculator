from __future__ import annotations

from datetime import date
import csv
from html import escape
from pathlib import Path
import os
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


def _date(value: Any) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


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
    account_display = {
        account.id: f"{account.label or account.id} · {bank_names.get(account.bank_id, account.bank_id or account.bank_key)}"
        for account in result.accounts.values()
    }

    account_rows = []
    for account in result.accounts.values():
        account_rows.append({
            "label": account.label or account.id,
            "id": account.id,
            "bank": bank_names.get(account.bank_id, account.bank_id or account.bank_key),
            "balance": _money(account.balance),
            "efd": "Enabled" if account.supports_efd else "Standard FD only",
            "role": "Consolidation account" if account.id == config.get("consolidation_account_id") else "Investment account",
        })
    inflows = config.get("inflow_summaries", [])
    outflows = config.get("outflow_summaries", [])
    inflow_rows = [{
        "name": x["name"], "amount": _money(x["amount"]), "schedule": _schedule_text(x),
        "account": account_display.get(x["account_id"], x["account_id"]), "occurrences": x["occurrences"], "total": _money(x["total"]),
    } for x in inflows]
    outflow_rows = [{
        "name": x["name"], "amount": _money(x["amount"]), "schedule": _schedule_text(x),
        "account": account_display.get(x["account_id"], x["account_id"]), "occurrences": x["occurrences"],
        "total": _money(x["total"]), "policy": x.get("payment_policy", "—"),
    } for x in outflows]

    def table(headers: Sequence[tuple[str, str]], rows: Sequence[dict]) -> str:
        head = "".join(f"<th>{escape(label)}</th>" for _, label in headers)
        return f'<div class="table-wrap"><table><thead><tr>{head}</tr></thead><tbody>{_table_rows(rows, headers)}</tbody></table></div>'

    account_table = table(
        [("label", "Account"), ("id", "Account ID"), ("bank", "Bank"), ("balance", "Opening balance"),
         ("efd", "eFD capability"), ("role", "Role")], account_rows)
    inflow_table = table(
        [("name", "Inflow"), ("amount", "Per occurrence"), ("schedule", "Schedule"),
         ("account", "Credit account"), ("occurrences", "Count"), ("total", "Total")], inflow_rows)
    outflow_table = table(
        [("name", "Outflow"), ("amount", "Per occurrence"), ("schedule", "Schedule"),
         ("account", "Debit account"), ("occurrences", "Count"), ("total", "Total"),
         ("policy", "Payment policy")], outflow_rows)

    decision_cards = []
    rendered_transfer_days: set[date] = set()
    investment_rows = []
    capital_flow_rows = []

    def _instruction_transfer(step: dict) -> str:
        description = str(step.get("description", ""))
        if not description.startswith("Transfer to "):
            return ""
        destination = description.removeprefix("Transfer to ")
        source = str(step.get("account_label") or step.get("account_id") or "Source account")
        source_id = str(step.get("account_id") or "")
        source_display = account_display.get(source_id, source)
        channel = str(step.get("channel", "TRANSFER")).replace("DOMESTIC CEFT", "Inter-bank CEFT").replace("INTRA-BANK", "Same-bank transfer")
        return f"""
          <div class="instruction transfer-instruction">
            <div class="instruction-title"><span>TRANSFER</span> Move funds between accounts</div>
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

    for index, item in enumerate(records, 1):
        is_booking = bool(item.get("product"))
        # Only outgoing, actionable transfers are instructions. Incoming ledger
        # counterparts and terminal final-sweep movements are deliberately omitted.
        transfer_steps = []
        if item["date"] not in rendered_transfer_days:
            transfer_steps = [
                step for step in item.get("transfer_steps", [])
                if str(step.get("description", "")).startswith("Transfer to ")
            ]
            if transfer_steps:
                rendered_transfer_days.add(item["date"])
        transfers = "".join(_instruction_transfer(step) for step in transfer_steps)
        reasons = "".join(f"<li>{escape(str(reason))}</li>" for reason in item.get("reason", []))
        balances = "".join(
            f'<span class="chip">{escape(account_display.get(str(account_id), str(account_id)))}: {_money(float(balance))}</span>'
            for account_id, balance in item.get("available_funds", {}).items()
        )
        if is_booking:
            account_id = str(item.get("account_id", ""))
            account_name = account_display.get(account_id, item.get("account_label", account_id))
            action_detail = f"""
              <div class="instruction booking-instruction">
                <div class="instruction-title"><span>FD BOOKING</span> Open the fixed deposit</div>
                <div class="detail-grid">
                  <div><small>Account</small><b>{escape(str(account_name))}</b></div>
                  <div><small>Product</small><b>{escape(str(item.get('product', '—')))} · {escape(str(item.get('fd_type', '—')))}</b></div>
                  <div><small>Investment amount</small><b>{_money(item['principal'])}</b></div>
                  <div><small>Rate / term</small><b>{float(item['rate']):.3f}% p.a. · {escape(str(item['term']))}</b></div>
                  <div><small>Booking → maturity</small><b>{_date(item['booking_start'])} → {_date(item['maturity_date'])}</b></div>
                  <div><small>Payout</small><b>{escape(str(item.get('payout_type', '—')))}</b></div>
                </div>
              </div>"""
            investment_rows.append({
                "account": account_name, "product": f"{item.get('product', '—')} · {item.get('fd_type', '—')}",
                "principal": _money(item["principal"]), "rate": f"{float(item['rate']):.3f}%",
                "term": item.get("term", "—"), "booking": _date(item["booking_start"]),
                "maturity": _date(item["maturity_date"]),
                "gross": _money(item.get("expected_return", 0)),
                "ait": _money(item.get("expected_ait", 0)),
                "net": _money(item.get("expected_net_return", 0)),
            })
            title = "Transfer funds and open an FD" if transfers else "Open an FD using available funds"
            expected = f"""
              <div class="expected">
                <span>Gross interest <b>{_money(item.get('expected_return', 0))}</b></span>
                <span>AIT <b class="negative">{_money(item.get('expected_ait', 0))}</b></span>
                <span>Net interest <b class="positive">{_money(item.get('expected_net_return', 0))}</b></span>
                <span>Maturity <b>{_date(item['maturity_date'])}</b></span>
              </div>"""
        else:
            title = "Keep funds available"
            account_name = account_display.get(str(item.get("account_id", "")), item.get("account_label", "account"))
            action_detail = f'<div class="retained-note"><b>No bank transaction required.</b> Keep available cash in {escape(str(account_name))} until the next liquidity checkpoint.</div>'
            expected = ""
        action_parts = (transfers + action_detail) if transfers or is_booking else action_detail
        decision_cards.append(f"""
          <article class="decision">
            <div class="decision-head"><span class="step">DECISION {index:02d}</span>
              <span class="date">{_date(item['date'])}</span><h3>{escape(title)}</h3></div>
            <h4>Action required</h4>
            {action_parts}
            {('<h4>Why this decision</h4><ul class="compact">' + reasons + '</ul>') if reasons else ''}
            {expected}
            {('<h4>Balances before decision</h4><div class="chips">' + balances + '</div>') if balances else ''}
            <p class="checkpoint"><b>Next checkpoint:</b> {escape(str(item.get('next_milestone', '—')))}</p>
          </article>""")

    for key in result.sorted_dates():
        for event in result.timeline[key]:
            account = result.accounts.get(event.account_id)
            account_name = account_display.get(event.account_id, event.account_id or "—")
            if event.event_type == EventType.TRANSFER and event.label.startswith("Transfer to "):
                capital_flow_rows.append({
                    "date": _date(event.on_date), "movement": "Account transfer",
                    "source": account_name, "destination": event.label.removeprefix("Transfer to "),
                    "amount": _money(event.amount), "fee": _money(event.fee),
                })
            elif event.event_type == EventType.BOOKING:
                capital_flow_rows.append({
                    "date": _date(event.on_date), "movement": "FD booking",
                    "source": account_name, "destination": event.label,
                    "amount": _money(abs(event.amount)), "fee": "—",
                })

    investment_table = table(
        [("account", "Account / bank"), ("product", "FD product"), ("principal", "Principal"),
         ("rate", "Rate"), ("term", "Term"), ("booking", "Booking date"), ("maturity", "Maturity"),
         ("gross", "Gross interest"), ("ait", "AIT"), ("net", "Net interest")],
        investment_rows,
    )
    capital_flow_table = table(
        [("date", "Date"), ("movement", "Movement"), ("source", "From / account"),
         ("destination", "To / product"), ("amount", "Amount"), ("fee", "Fee")],
        capital_flow_rows,
    )

    event_rows = []
    booking_by_ref = {
        f"FD-{index:04d}": booking
        for index, booking in enumerate(result.bookings, 1)
    }

    last_event_day = None

    def append_event_row(day, account_label, label, amount, description, balance, css_type):
        nonlocal last_event_day
        amount_class = "positive" if amount > 0 else "negative" if amount < 0 else "muted"
        is_new_day = day != last_event_day
        date_cell = _date(day) if is_new_day else ""
        row_class = ' class="day-start"' if is_new_day and last_event_day is not None else ""
        event_rows.append(
            f'<tr{row_class}><td class="event-date">{date_cell}</td><td>{escape(account_label)}</td>'
            f'<td><span class="event-pill {escape(css_type)}">{escape(label)}</span></td>'
            f'<td class="num {amount_class}">{_money(amount)}</td>'
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
                    event.label, display_balance, "booking",
                )
                continue

            if event.event_type == EventType.TRANSFER:
                channel = "INTRA-BANK" if event.transfer_channel == "intra_bank" else "INTER-BANK"
                outgoing = event.label.startswith(("Transfer to ", "Final sweep to "))
                if outgoing:
                    append_event_row(
                        event.on_date, account_label, f"{channel} TO",
                        -(event.amount - event.fee), event.label,
                        display_balance + event.fee, "transfer-to",
                    )
                    if event.fee > 0:
                        append_event_row(
                            event.on_date, account_label, f"{channel} TF", -event.fee,
                            f"Transfer fee for {event.label}", event.balance_after, "outflow",
                        )
                else:
                    append_event_row(
                        event.on_date, account_label, f"{channel} TI", event.amount,
                        event.label, display_balance, "transfer",
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
                    else:
                        label = "INSTALLMENT"
                    append_event_row(
                        event.on_date, account_label, label, float(gross_amount),
                        event.label, display_balance + ait, "cash_flow",
                    )
                elif booking.payout_type in {"cumulative", "periodic_interest"}:
                    maturity_interest = float(event.amount) - booking.principal
                    gross_interest = float(gross_amount) - booking.principal
                    append_event_row(
                        event.on_date, account_label, "MATURE PRINCIPAL",
                        booking.principal, f"Principal returned {event.booking_ref}",
                        display_balance - max(0.0, maturity_interest), "mature-principal",
                    )
                    if gross_interest > 0:
                        append_event_row(
                            event.on_date, account_label, "MATURE INTEREST",
                            gross_interest, f"Interest paid at maturity {event.booking_ref}",
                            display_balance + ait, "cash_flow",
                        )
                else:
                    append_event_row(
                        event.on_date, account_label, "MATURE CASH FLOW",
                        float(gross_amount), event.label, display_balance + ait, "maturity",
                    )
                if ait > 0.005:
                    append_event_row(
                        event.on_date, account_label, "AIT WITHHELD", -ait,
                        "AIT deducted from interest payout", event.balance_after, "outflow",
                    )
                continue

            labels = {
                EventType.INFLOW: "INFLOW", EventType.OUTFLOW: "OUTFLOW",
                EventType.CARRY_FORWARD: "CARRY FORWARD", EventType.IDLE: "IDLE",
            }
            append_event_row(
                event.on_date, account_label, labels.get(event.event_type, event_type).upper(),
                display_amount, event.label, display_balance, event.event_type.value,
            )

    chart_items = []
    chart_captions = {
        "account_values": ("Portfolio value by account", "Estimated account value includes modelled accrued interest between booking and maturity; it is not a bank statement."),
        "decision_timeline": ("FD booking and maturity schedule", "Each bar shows the active term of an FD, with its booking and maturity dates."),
        "cash_flows": ("Cash movement timeline", "Positive bars are receipts; negative bars are uses of cash, transfers and investments."),
    }
    for chart in chart_paths:
        chart = Path(chart)
        key = next((name for name in chart_captions if name in chart.name), "")
        caption, description = chart_captions.get(key, (chart.stem.replace("_", " ").title(), "Simulation chart"))
        relative = Path(os.path.relpath(chart.resolve(), path.resolve().parent)).as_posix()
        chart_items.append(
            f'<figure><img src="{escape(relative, quote=True)}" alt="{escape(caption)}">'
            f'<figcaption><b>{escape(caption)}</b><span>{escape(description)}</span></figcaption></figure>'
        )

    xirr = _xirr(result)
    gross_interest = result.total_interest
    net_interest = result.net_interest
    total_capital = result.total_principal
    yield_pct = (net_interest / total_capital * 100.0) if total_capital else 0.0
    search_status = getattr(result, "search_diagnostics", None)
    summary_note = ""
    if result.outstanding_outflows:
        summary_note = f'<p class="warning">Outstanding outflows remain: {escape(str(result.outstanding_outflows))}</p>'

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FD Cal · Simulation Report</title>
<style>
:root{{--bg:#0b0e13;--panel:#131923;--panel2:#192230;--line:#293445;--text:#e8edf5;--muted:#9ba8b8;--blue:#56b4e9;--green:#55c99a;--red:#ef7777;--amber:#e9ad58;--purple:#bd93f9}}
*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(ellipse at 15% 0%,#172334 0,transparent 42%),var(--bg);color:var(--text);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}}
main{{max-width:1180px;margin:0 auto;padding:38px 24px 70px}}header{{padding:24px 0 30px;border-bottom:1px solid var(--line)}}.eyebrow{{color:var(--blue);font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}}
h1{{font-size:clamp(30px,5vw,46px);line-height:1.1;margin:10px 0}}h2{{font-size:22px;margin:0 0 16px}}h3{{font-size:17px;margin:0 0 12px}}h4{{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:20px 0 8px}}
p{{margin:8px 0}}.muted,small{{color:var(--muted)}}section{{margin-top:34px}}.panel,.decision{{background:linear-gradient(145deg,var(--panel),#10151d);border:1px solid var(--line);border-radius:16px;padding:20px;margin:12px 0}}
.metrics{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:24px}}.metric{{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:17px}}.metric small{{display:block;font-size:12px}}.metric strong{{display:block;font-size:22px;margin-top:5px;font-variant-numeric:tabular-nums}}

.equation-panel{{background:linear-gradient(145deg,#142333,#111923);border:1px solid #36506a;border-radius:16px;padding:22px;margin:14px 0}}
.equation{{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:16px 0}}
.equation>div{{display:flex;flex-direction:column;gap:5px;min-width:125px}}.equation small,.outcome-metric small{{font-size:11px;color:var(--muted)}}.equation strong{{font-size:clamp(17px,2vw,23px);font-variant-numeric:tabular-nums}}.equation>span{{font-size:22px;color:#8292a6}}.equation-result{{border-left:2px solid var(--green);padding-left:14px}}.equation-result strong{{color:var(--green)}}
.outcome-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-top:14px}}.outcome-metric{{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:16px}}.outcome-metric strong{{display:block;font-size:21px;margin:5px 0;font-variant-numeric:tabular-nums}}.outcome-metric p{{font-size:12px;color:var(--muted);margin:0}}
.instruction{{border:1px solid var(--line);border-radius:12px;padding:15px;margin:12px 0;background:var(--panel2)}}.transfer-instruction{{border-left:3px solid var(--amber)}}.booking-instruction{{border-left:3px solid var(--purple)}}
.instruction-title{{font-weight:750;margin-bottom:12px}}.instruction-title span{{font-size:10px;letter-spacing:.1em;color:var(--muted);margin-right:10px}}
.route{{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:14px;align-items:center}}.route small,.instruction-meta small{{display:block;color:var(--muted);font-size:10px;letter-spacing:.06em}}.route b{{display:block;margin-top:4px;font-size:13px}}.route-arrow{{font-size:23px;color:var(--amber)}}
.instruction-meta{{display:flex;gap:24px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}}.instruction-meta b{{display:block;margin-top:4px;font-size:13px}}
.expected{{display:flex;gap:18px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:12px;margin-top:14px;font-size:12px;color:var(--muted)}}.expected b{{color:var(--text)}}.retained-note{{padding:13px;background:#202833;border:1px solid #3b4655;border-radius:10px;color:#c7d0dc}}
.grid2{{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}}.table-wrap{{overflow-x:auto;border:1px solid var(--line);border-radius:12px}}table{{border-collapse:collapse;width:100%;min-width:700px;background:var(--panel);font-size:13px}}th,td{{padding:11px 13px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}}th{{background:var(--panel2);color:#b8c7d8;font-size:11px;text-transform:uppercase;letter-spacing:.07em}}tr:last-child td{{border-bottom:0}}.empty{{color:var(--muted);text-align:center}}.num{{text-align:right;font-variant-numeric:tabular-nums}}.event-date{{white-space:nowrap;color:#8fa5bd;font-weight:700;font-variant-numeric:tabular-nums}}tr.day-start td{{border-top:2px solid #40516a;padding-top:16px}}tr.day-start:first-child td{{border-top:0}}
.positive{{color:var(--green)}}.negative{{color:var(--red)}}.warning{{color:var(--amber);background:#382817;padding:12px;border-radius:10px}}
.decision{{border-left:3px solid var(--amber);padding:20px 22px}}.decision-head{{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}}.step{{font-size:11px;color:var(--amber);font-weight:800;letter-spacing:.12em}}.date{{font-weight:700}}.tag{{margin-left:auto;border:1px solid #795a31;color:#f0bd77;background:#302416;border-radius:30px;padding:4px 10px;font-size:12px}}
.detail-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:14px}}.detail-grid div{{background:var(--panel2);padding:11px;border-radius:9px}}.detail-grid small{{display:block;font-size:11px}}.detail-grid b{{display:block;margin-top:4px;font-size:13px}}
ul.compact{{padding-left:20px;color:#c7d0dc}}ul.compact li{{margin:5px 0}}.chips{{display:flex;gap:8px;flex-wrap:wrap}}.chip{{background:var(--panel2);padding:5px 9px;border-radius:7px;color:#c7d0dc;font-size:12px}}.checkpoint{{border-top:1px solid var(--line);padding-top:12px;color:var(--muted);font-size:13px}}
figure{{margin:0 0 18px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px}}figure img{{display:block;width:100%;height:auto;border-radius:8px}}figcaption{{padding:10px 4px 2px}}figcaption b,figcaption span{{display:block}}figcaption span{{font-size:12px;color:var(--muted);margin-top:3px}}
.event-pill{{display:inline-block;padding:3px 8px;border-radius:20px;background:#253143;color:#b9d9ef;font-size:11px;white-space:nowrap}}.event-pill.inflow{{background:#1e3442;color:#82aaff}}.event-pill.outflow{{background:#3a2227;color:#ff7777}}.event-pill.transfer{{background:#243143;color:#56d8e8}}.event-pill.transfer-to{{background:#3b2b1b;color:#e9ad58}}.event-pill.carry_forward{{background:#3a321d;color:#e9d15b}}.event-pill.booking{{background:#332742;color:#d78bfa}}.event-pill.maturity{{background:#173b25;color:#32b65b}}.event-pill.cash_flow{{background:#183c2b;color:#55c99a}}.event-pill.idle{{background:#292d33;color:#9ba8b8}}.event-pill.mature-principal{{background:#332b42;color:#bd93f9}}
footer{{border-top:1px solid var(--line);margin-top:40px;padding-top:18px;color:var(--muted);font-size:12px}}
@media(max-width:600px){{main{{padding:22px 14px 48px}}.tag{{margin-left:0}}.metric strong{{font-size:19px}}.route{{grid-template-columns:1fr}}.route-arrow{{transform:rotate(90deg);justify-self:start}}}}
@media print{{body{{background:#fff;color:#17202b}}.panel,.decision,.metric,figure,table{{background:#fff;color:#17202b;break-inside:avoid}}.muted,small,figcaption span{{color:#526070}}}}
</style></head><body><main>
<header><div class="eyebrow">FD Cal · Portfolio planning</div><h1>Investment simulation report</h1>
<p class="muted">{_date(start)} — {_date(end)} · { (end-start).days + 1 } calendar days · {escape(result.strategy_name)} strategy</p>
<p class="muted">Generated from the selected simulation path. Use the highlighted action cards as a manual execution checklist; verify all terms with each bank before transacting.</p></header>
<section class="outcome"><h2>01 · Portfolio outcome</h2>
<div class="equation-panel"><b>Net interest calculation</b>
<div class="equation">
<div><small>Gross interest earned</small><strong class="positive">{_money(gross_interest)}</strong></div><span>−</span>
<div><small>AIT withheld</small><strong class="negative">{_money(result.ait_withheld)}</strong></div><span>−</span>
<div><small>Transfer fees</small><strong class="negative">{_money(result.total_transfer_fees)}</strong></div><span>=</span>
<div class="equation-result"><small>Net interest earned</small><strong>{_money(net_interest)}</strong></div>
</div><p class="muted">Net interest = gross interest − AIT − transfer fees. AIT is withheld from interest; transfer fees are deducted from cash.</p></div>
<div class="outcome-grid">
<div class="outcome-metric"><small>Total capital contributed</small><strong>{_money(total_capital)}</strong><p>Opening funds plus scheduled deposits.</p></div>
<div class="outcome-metric"><small>Final simulated portfolio value</small><strong>{_money(result.final_value)}</strong><p>Cash held across accounts at the end of the simulation.</p></div>
<div class="outcome-metric"><small>Net return on contributed capital</small><strong>{yield_pct:.3f}%</strong><p>Net interest divided by total contributed capital.</p></div>
<div class="outcome-metric"><small>Annualised money-weighted return (XIRR)</small><strong>{f"{xirr:.3f}% p.a." if xirr is not None else "N/A"}</strong><p>Accounts for the timing of deposits and withdrawals.</p></div>
</div>{summary_note}</section>
<section><h2>02 · Capital flow</h2><p class="muted">Transfers and FD bookings selected by the strategy. Incoming transfer accounting entries are intentionally not duplicated here; they remain in the full event ledger.</p>{capital_flow_table}</section>
<section><h2>03 · Execution plan</h2><p class="muted">This is the manual bank checklist. Each transfer is listed once from the sending account; the receiving-side entry is accounting only. Final cash sweeps are excluded because they are terminal valuation movements, not planned execution tasks. Confirm rates, fees, minimums and product availability with the bank before acting.</p>{''.join(decision_cards) if decision_cards else '<div class="panel">No FD bookings or actionable transfers were selected.</div>'}</section>
<section><h2>04 · Investment portfolio</h2><h3>Accounts</h3>{account_table}<h3>Selected fixed deposits</h3>{investment_table}</section>
<section><h2>05 · Scheduled cash flows</h2><div class="grid2"><div><h3>Planned inflows</h3>{inflow_table}</div><div><h3>Planned outflows</h3>{outflow_table}</div></div></section>
<section><h2>06 · Performance charts</h2>{''.join(chart_items) if chart_items else '<p class="muted">Charts were not generated for this run. Enable show_plots to include them.</p>'}</section>
<section><h2>08 · Scenario assumptions</h2><div class="panel"><div class="grid2">
<div><small>Strategy</small><p><b>{escape(result.strategy_name)}</b></p></div>
<div><small>Interest method</small><p><b>{"Compound" if config.get("compound") else "Simple"} interest</b></p></div>
<div><small>Day-count basis</small><p><b>{"Actual leap-year basis" if config.get("actual_leap_year") else "365-day basis"}</b></p></div>
<div><small>Withholding tax</small><p><b>{f"AIT enabled · {result.ait_rate:.1%} of interest" if result.ait_enabled else "AIT disabled"}</b></p></div>
<div><small>Consolidation account</small><p><b>{escape(account_display.get(config.get("consolidation_account_id"), config.get("consolidation_account_id", "—")))}</b></p></div>
<div><small>Transfer fee defaults</small><p><b>Inter-bank {_money(config.get("fee_config").default_inter_bank_fee)} · Same-bank {_money(config.get("fee_config").same_bank_fee)}</b></p></div>
</div></div></section>
<section><h2>07 · Full event ledger</h2><p class="muted">Complete accounting audit trail, including both sides of transfers, fees, bookings, interest, AIT and maturities. This ledger records what the simulation accounts for; it is not an execution checklist.</p>
<div class="table-wrap"><table><thead><tr><th>Date</th><th>Account</th><th>Event</th><th class="num">Amount</th><th>Description</th><th class="num">Balance after</th></tr></thead><tbody>{''.join(event_rows) if event_rows else '<tr><td colspan="6" class="empty">No events</td></tr>'}</tbody></table></div></section>
<footer><b>Important:</b> This report is a simulation and manual planning aid. It does not execute bank transfers or open fixed deposits. Interest, rates, minimums, tax treatment, fees and product availability may differ in practice. Confirm all details directly with the relevant bank. Portfolio charts estimate accrued interest between booking and maturity; contractual cash-flow events and the final summary are authoritative within this simulation.</footer>
</main></body></html>"""
    path.write_text(html, encoding="utf-8")
    return path
