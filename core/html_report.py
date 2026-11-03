from __future__ import annotations

from datetime import date
from html import escape
from pathlib import Path
import os
from typing import Any, Sequence

from core.reporting import build_decision_log, _xirr
from core.models import EventType, SimResult


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

    account_rows = []
    for account in result.accounts.values():
        account_rows.append({
            "label": account.label or account.id,
            "id": account.id,
            "bank": account.bank_id or account.bank_key,
            "balance": _money(account.balance),
            "efd": "Enabled" if account.supports_efd else "Standard FD only",
            "role": "Consolidation account" if account.id == config.get("consolidation_account_id") else "Investment account",
        })
    inflows = config.get("inflow_summaries", [])
    outflows = config.get("outflow_summaries", [])
    inflow_rows = [{
        "name": x["name"], "amount": _money(x["amount"]), "schedule": _schedule_text(x),
        "account": x["account_id"], "occurrences": x["occurrences"], "total": _money(x["total"]),
    } for x in inflows]
    outflow_rows = [{
        "name": x["name"], "amount": _money(x["amount"]), "schedule": _schedule_text(x),
        "account": x["account_id"], "occurrences": x["occurrences"],
        "total": _money(x["total"]), "policy": x.get("payment_policy", "—"),
    } for x in outflows]

    def table(headers: Sequence[tuple[str, str]], rows: Sequence[dict]) -> str:
        head = "".join(f"<th>{escape(label)}</th>" for _, label in headers)
        return f'<div class="table-wrap"><table><thead><tr>{head}</tr></thead><tbody>{_table_rows(rows, headers)}</tbody></table></div>'

    account_table = table(
        [("label", "Account"), ("id", "ID"), ("bank", "Bank ID"), ("balance", "Opening balance"),
         ("efd", "eFD capability"), ("role", "Role")], account_rows)
    inflow_table = table(
        [("name", "Inflow"), ("amount", "Per occurrence"), ("schedule", "Schedule"),
         ("account", "Credit account"), ("occurrences", "Count"), ("total", "Total")], inflow_rows)
    outflow_table = table(
        [("name", "Outflow"), ("amount", "Per occurrence"), ("schedule", "Schedule"),
         ("account", "Debit account"), ("occurrences", "Count"), ("total", "Total"),
         ("policy", "Payment policy")], outflow_rows)

    decision_cards = []
    for index, item in enumerate(records, 1):
        transfers = "".join(
            f'<li><b>{escape(step["channel"])}</b> · {escape(step["description"])} · '
            f'{escape(step["account_label"])} · { _money(step["amount"]) } '
            f'(fee { _money(step["fee"]) })</li>'
            for step in item.get("transfer_steps", [])
        )
        reasons = "".join(f"<li>{escape(str(reason))}</li>" for reason in item.get("reason", []))
        balances = "".join(
            f'<span class="chip">{escape(str(account_id))}: {_money(float(balance))}</span>'
            for account_id, balance in item.get("available_funds", {}).items()
        )
        if item.get("product"):
            action_detail = f"""
              <div class="detail-grid">
                <div><small>Destination</small><b>{escape(str(item.get('bank', '—')))} · {escape(str(item.get('account_label', item.get('account_id', '—'))))}</b></div>
                <div><small>Product</small><b>{escape(str(item.get('product')))} · {escape(str(item.get('fd_type')))}</b></div>
                <div><small>Principal</small><b>{_money(item['principal'])}</b></div>
                <div><small>Rate / term</small><b>{float(item['rate']):.3f}% p.a. · {escape(str(item['term']))}</b></div>
                <div><small>Booking → maturity</small><b>{_date(item['booking_start'])} → {_date(item['maturity_date'])}</b></div>
                <div><small>Payout</small><b>{escape(str(item.get('payout_type', '—')))}</b></div>
                <div><small>Gross interest</small><b>{_money(item.get('expected_return', 0))}</b></div>
                <div><small>AIT withheld</small><b class="negative">{_money(item.get('expected_ait', 0))}</b></div>
                <div><small>Net interest after AIT</small><b class="positive">{_money(item.get('expected_net_return', 0))}</b></div>
                <div><small>Net payout total</small><b>{_money(item.get('expected_total', 0))}</b></div>
              </div>"""
        else:
            action_detail = f'<p class="muted">Cash retained in <b>{escape(str(item.get("account_label", item.get("account_id", "account"))))}</b>; no FD booking was made at this decision point.</p>'
        decision_cards.append(f"""
          <article class="decision">
            <div class="decision-head"><span class="step">ACTION {index:02d}</span>
              <span class="date">{_date(item['date'])}</span><span class="tag">{escape(str(item['action']))}</span></div>
            {action_detail}
            {('<h4>Transfer instructions</h4><ul class="compact">' + transfers + '</ul>') if transfers else ''}
            {('<h4>Balances before decision</h4><div class="chips">' + balances + '</div>') if balances else ''}
            {('<h4>Why this action</h4><ul class="compact">' + reasons + '</ul>') if reasons else ''}
            <p class="checkpoint"><b>Next checkpoint:</b> {escape(str(item.get('next_milestone', '—')))}</p>
          </article>""")

    event_rows = []
    booking_by_ref = {
        f"FD-{index:04d}": booking
        for index, booking in enumerate(result.bookings, 1)
    }

    def append_event_row(day, account_label, label, amount, description, balance, css_type):
        amount_class = "positive" if amount > 0 else "negative" if amount < 0 else "muted"
        event_rows.append(
            f'<tr><td>{_date(day)}</td><td>{escape(account_label)}</td>'
            f'<td><span class="event-pill {escape(css_type)}">{escape(label)}</span></td>'
            f'<td class="num {amount_class}">{_money(amount)}</td>'
            f'<td>{escape(description)}</td><td class="num">{_money(balance)}</td></tr>'
        )

    for key in result.sorted_dates():
        for event in result.timeline[key]:
            if event.event_type == EventType.INFLOW and event.amount == 0 and event.label == "Opening balance trigger":
                continue
            account = result.accounts.get(event.account_id)
            account_label = account.label if account else (event.account_id or "—")
            event_type = event.event_type.value.replace("_", " ").title()
            display_amount = float(event.amount)
            display_balance = float(event.balance_after)

            if event.event_type == EventType.BOOKING:
                display_amount = -abs(display_amount)
            elif event.event_type == EventType.TRANSFER:
                outgoing = event.label.startswith(("Transfer to ", "Final sweep to "))
                incoming = event.label.startswith(("Transfer received", "Final sweep received"))
                if outgoing:
                    display_amount = -abs(event.amount - event.fee)
                    display_balance += event.fee
                elif incoming:
                    display_amount = abs(event.amount)

            booking = booking_by_ref.get(event.booking_ref)
            if booking is not None and event.event_type in {EventType.CASH_FLOW, EventType.MATURITY}:
                gross_amount = next(
                    (amount for flow_day, amount in booking.cash_flows if flow_day == event.on_date),
                    event.amount,
                )
                ait = max(0.0, float(gross_amount) - float(event.amount)) if result.ait_enabled else 0.0
                display_amount = float(gross_amount)
                display_balance += ait
                append_event_row(
                    event.on_date, account_label, event_type, display_amount,
                    event.label, display_balance, event.event_type.value,
                )
                if ait > 0.005:
                    append_event_row(
                        event.on_date, account_label, "AIT Withheld", -ait,
                        "10% withholding deducted from interest", event.balance_after, "outflow",
                    )
                continue

            append_event_row(
                event.on_date, account_label, event_type, display_amount,
                event.label, display_balance, event.event_type.value,
            )
            if event.event_type == EventType.TRANSFER and event.fee > 0 and event.label.startswith(("Transfer to ", "Final sweep to ")):
                append_event_row(
                    event.on_date, account_label, "Transfer Fee", -event.fee,
                    f"Fee for {event.label}", event.balance_after, "outflow",
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
.grid2{{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px}}.table-wrap{{overflow-x:auto;border:1px solid var(--line);border-radius:12px}}table{{border-collapse:collapse;width:100%;min-width:700px;background:var(--panel);font-size:13px}}th,td{{padding:11px 13px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}}th{{background:var(--panel2);color:#b8c7d8;font-size:11px;text-transform:uppercase;letter-spacing:.07em}}tr:last-child td{{border-bottom:0}}.empty{{color:var(--muted);text-align:center}}.num{{text-align:right;font-variant-numeric:tabular-nums}}
.positive{{color:var(--green)}}.negative{{color:var(--red)}}.warning{{color:var(--amber);background:#382817;padding:12px;border-radius:10px}}
.decision{{border-left:3px solid var(--amber);padding:20px 22px}}.decision-head{{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}}.step{{font-size:11px;color:var(--amber);font-weight:800;letter-spacing:.12em}}.date{{font-weight:700}}.tag{{margin-left:auto;border:1px solid #795a31;color:#f0bd77;background:#302416;border-radius:30px;padding:4px 10px;font-size:12px}}
.detail-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:14px}}.detail-grid div{{background:var(--panel2);padding:11px;border-radius:9px}}.detail-grid small{{display:block;font-size:11px}}.detail-grid b{{display:block;margin-top:4px;font-size:13px}}
ul.compact{{padding-left:20px;color:#c7d0dc}}ul.compact li{{margin:5px 0}}.chips{{display:flex;gap:8px;flex-wrap:wrap}}.chip{{background:var(--panel2);padding:5px 9px;border-radius:7px;color:#c7d0dc;font-size:12px}}.checkpoint{{border-top:1px solid var(--line);padding-top:12px;color:var(--muted);font-size:13px}}
figure{{margin:0 0 18px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px}}figure img{{display:block;width:100%;height:auto;border-radius:8px}}figcaption{{padding:10px 4px 2px}}figcaption b,figcaption span{{display:block}}figcaption span{{font-size:12px;color:var(--muted);margin-top:3px}}
.event-pill{{display:inline-block;padding:3px 8px;border-radius:20px;background:#253143;color:#b9d9ef;font-size:11px;white-space:nowrap}}.event-pill.outflow{{background:#3a2227;color:#ff9c9c}}.event-pill.transfer{{background:#243143;color:#8bd3fa}}.event-pill.booking{{background:#332742;color:#d4a8ff}}.event-pill.maturity,.event-pill.cash_flow{{background:#1e382e;color:#7fe0b0}}.event-pill.inflow{{background:#1e3442;color:#82d2fa}}
footer{{border-top:1px solid var(--line);margin-top:40px;padding-top:18px;color:var(--muted);font-size:12px}}
@media(max-width:600px){{main{{padding:22px 14px 48px}}.tag{{margin-left:0}}.metric strong{{font-size:19px}}}}
@media print{{body{{background:#fff;color:#17202b}}.panel,.decision,.metric,figure,table{{background:#fff;color:#17202b;break-inside:avoid}}.muted,small,figcaption span{{color:#526070}}}}
</style></head><body><main>
<header><div class="eyebrow">FD Cal · Portfolio planning</div><h1>Investment simulation report</h1>
<p class="muted">{_date(start)} — {_date(end)} · { (end-start).days + 1 } calendar days · {escape(result.strategy_name)} strategy</p>
<p class="muted">Generated from the selected simulation path. Use the highlighted action cards as a manual execution checklist; verify all terms with each bank before transacting.</p></header>
<div class="metrics">
<div class="metric"><small>Starting + planned capital</small><strong>{_money(total_capital)}</strong></div>
<div class="metric"><small>Gross interest</small><strong>{_money(gross_interest)}</strong></div>
<div class="metric"><small>AIT withheld</small><strong class="negative">{_money(result.ait_withheld)}</strong></div>
<div class="metric"><small>Transfer fees</small><strong class="negative">{_money(result.total_transfer_fees)}</strong></div>
<div class="metric"><small>Net interest after costs</small><strong class="positive">{_money(net_interest)}</strong></div>
<div class="metric"><small>Final simulated value</small><strong>{_money(result.final_value)}</strong></div>
<div class="metric"><small>Net return on planned capital</small><strong>{yield_pct:.3f}%</strong></div>
<div class="metric"><small>Annualised XIRR</small><strong>{f"{xirr:.3f}% p.a." if xirr is not None else "N/A"}</strong></div>
</div>{summary_note}
<section><h2>01 · Scenario conditions</h2><div class="panel"><div class="grid2">
<div><small>Strategy</small><p><b>{escape(result.strategy_name)}</b></p></div>
<div><small>Interest method</small><p><b>{"Compound" if config.get("compound") else "Simple"} interest</b></p></div>
<div><small>Day-count basis</small><p><b>{"Actual leap-year basis" if config.get("actual_leap_year") else "365-day basis"}</b></p></div>
<div><small>Withholding tax</small><p><b>{f"AIT enabled · {result.ait_rate:.1%} of interest" if result.ait_enabled else "AIT disabled"}</b></p></div>
<div><small>Consolidation account</small><p><b>{escape(str(config.get("consolidation_account_id", "—")))}</b></p></div>
<div><small>Transfer fee defaults</small><p><b>Inter-bank {_money(config.get("fee_config").default_inter_bank_fee)} · Same-bank {_money(config.get("fee_config").same_bank_fee)}</b></p></div>
</div></div></section>
<section><h2>02 · Accounts</h2>{account_table}</section>
<section><h2>03 · Scheduled money movements</h2><div class="grid2"><div><h3>Inflows</h3>{inflow_table}</div><div><h3>Outflows</h3>{outflow_table}</div></div></section>
<section><h2>04 · Visual overview</h2>{''.join(chart_items) if chart_items else '<p class="muted">Charts were not generated for this run. Enable show_plots to include them.</p>'}</section>
<section><h2>05 · Actions to execute</h2><p class="muted">These are the final strategy decisions in chronological order, not rejected alternatives. Follow the transfer and booking details only after confirming current bank terms, account eligibility, fees and availability.</p>
{''.join(decision_cards) if decision_cards else '<div class="panel">No FD bookings or cash-retention decisions were generated.</div>'}</section>
<section><h2>06 · Full event timeline</h2><p class="muted">Chronological record of credits, transfers, fees, FD bookings, interest, maturities and withdrawals. Decision cards above identify the user actions.</p>
<div class="table-wrap"><table><thead><tr><th>Date</th><th>Account</th><th>Event</th><th class="num">Amount</th><th>Description</th><th class="num">Balance after</th></tr></thead><tbody>{''.join(event_rows) if event_rows else '<tr><td colspan="6" class="empty">No events</td></tr>'}</tbody></table></div></section>
<footer><b>Important:</b> This report is a simulation and manual planning aid. It does not execute bank transfers or open fixed deposits. Interest, rates, minimums, tax treatment, fees and product availability may differ in practice. Confirm all details directly with the relevant bank. Portfolio charts estimate accrued interest between booking and maturity; contractual cash-flow events and the final summary are authoritative within this simulation.</footer>
</main></body></html>"""
    path.write_text(html, encoding="utf-8")
    return path
