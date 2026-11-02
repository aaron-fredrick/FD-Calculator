"""Dark-theme Matplotlib visualizations for FD strategy results.

The portfolio curves are marked-to-model estimates: each FD's total contractual
interest is accrued linearly between booking and maturity. They are comparison
visuals, not bank-statement cash balances or daily interest calculations.
"""
from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Optional, Sequence

from core.models import Account, EventType, SimResult

_BACKGROUND = "#111318"
_AXES = "#171b22"
_GRID = "#343b47"
_TEXT = "#e6e9ef"
_MUTED = "#a8b0bd"
_GREEDY_PALE = "#7e91a8"
_COLORS = (
    "#56b4e9", "#e69f00", "#009e73", "#cc79a7",
    "#f0e442", "#d55e00", "#8be9fd", "#bd93f9",
)


def _configure_dark_theme() -> None:
    import matplotlib.pyplot as plt

    plt.rcParams.update({
        "figure.facecolor": _BACKGROUND,
        "axes.facecolor": _AXES,
        "axes.edgecolor": _GRID,
        "axes.labelcolor": _TEXT,
        "text.color": _TEXT,
        "xtick.color": _MUTED,
        "ytick.color": _MUTED,
        "grid.color": _GRID,
        "legend.facecolor": _AXES,
        "legend.edgecolor": _GRID,
        "savefig.facecolor": _BACKGROUND,
        "font.size": 9,
    })


def _date_range(start: date, end: date) -> list[date]:
    if end < start:
        raise ValueError("end date must not be earlier than start date")
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def _account_labels(accounts: Sequence[Account]) -> dict[str, str]:
    return {a.id: f"{a.label} ({a.bank_key})" for a in accounts}


def _portfolio_series(
    result: SimResult,
    accounts: Sequence[Account],
    inflow_schedule: dict[date, float] | dict[date, dict[str, float]],
    inflow_account_id: str,
    start: date,
    end: date,
) -> dict[str, list[float]]:
    """Mark each account's liquid cash plus its active FD assets over time.

    FD interest between booking and maturity is linearly estimated for display;
    the simulator's contractual cash flows remain the source of final results.
    """
    dates = _date_range(start, end)
    liquid = {account.id: float(account.balance) for account in accounts}
    values = {account.id: [] for account in accounts}
    events_by_date: dict[date, list] = {}
    for events in result.timeline.values():
        for event in events:
            if start <= event.on_date <= end:
                events_by_date.setdefault(event.on_date, []).append(event)

    for day in dates:
        # Reconcile liquid account balances from the actual simulated event log.
        if day in inflow_schedule:
            scheduled = inflow_schedule[day]
            if isinstance(scheduled, dict):
                for account_id, amount in scheduled.items():
                    if account_id in liquid:
                        liquid[account_id] += amount
            elif inflow_account_id in liquid:
                liquid[inflow_account_id] += scheduled

        day_events = events_by_date.get(day, [])
        for event in day_events:
            if event.event_type in (EventType.CASH_FLOW, EventType.MATURITY):
                if event.account_id in liquid:
                    liquid[event.account_id] += event.amount
            elif event.event_type == EventType.OUTFLOW and event.amount < 0:
                if event.account_id in liquid:
                    liquid[event.account_id] += event.amount

        # Transfer events have source and destination entries. Their recorded
        # amounts are gross at source and net at destination, so fees are not
        # deducted a second time here.
        for event in day_events:
            if event.event_type == EventType.TRANSFER and event.account_id in liquid:
                if event.label.startswith("Transfer to ") or event.label.startswith("Final sweep to "):
                    liquid[event.account_id] -= event.amount
                elif event.label.startswith("Transfer received") or event.label.startswith("Final sweep received"):
                    liquid[event.account_id] += event.amount

        for event in day_events:
            if event.event_type == EventType.BOOKING and event.account_id in liquid:
                liquid[event.account_id] -= event.amount

        # Inflows are represented in the result event log as well; only add
        # them from that log when no schedule entry exists (e.g. opening marker).
        if inflow_account_id in liquid:
            for event in day_events:
                if event.event_type == EventType.INFLOW and event.amount and day not in inflow_schedule:
                    target_id = event.account_id if event.account_id in liquid else inflow_account_id
                    liquid[target_id] += event.amount

        marked = dict(liquid)
        for booking in result.bookings:
            if booking.account_id not in marked or not (booking.start <= day < booking.end):
                continue
            full_days = max((booking.end - booking.start).days, 1)
            elapsed = max(0, (day - booking.start).days)
            accrued = booking.total_interest * min(elapsed, full_days) / full_days
            paid_flows = sum(amount for flow_date, amount in booking.cash_flows if flow_date <= day)
            # Before maturity, paid periodic interest is already in liquid cash.
            unpaid_accrual = max(0.0, accrued - paid_flows)
            marked[booking.account_id] += booking.principal + unpaid_accrual

        for account_id in values:
            values[account_id].append(marked[account_id])

    return values


def _plot_account_lines(
    ax, dates, series, labels, accounts: Sequence[Account],
    consolidation_account_id: Optional[str],
) -> None:
    """Style account-value lines by relationship to the consolidation account."""
    account_by_id = {account.id: account for account in accounts}
    consolidation = account_by_id.get(consolidation_account_id or "")
    consolidation_bank_id = (
        consolidation.bank_identity.strip().upper() if consolidation else ""
    )

    # Assign the consolidation account the first palette color regardless of
    # its position in the account dictionary; every other account gets its own.
    ordered_ids = list(series)
    if consolidation_account_id in ordered_ids:
        ordered_ids.remove(consolidation_account_id)
        ordered_ids.insert(0, consolidation_account_id)

    for index, account_id in enumerate(ordered_ids):
        account = account_by_id.get(account_id)
        bank_id = account.bank_identity.strip().upper() if account else ""
        if account_id == consolidation_account_id:
            linestyle, linewidth = "-", 2.5
        elif consolidation_bank_id and bank_id == consolidation_bank_id:
            linestyle, linewidth = "--", 2.0
        else:
            linestyle, linewidth = ":", 2.0
        ax.plot(
            dates,
            series[account_id],
            label=labels.get(account_id, account_id),
            color=_COLORS[index % len(_COLORS)],
            linestyle=linestyle,
            linewidth=linewidth,
            alpha=1.0,
        )


def _plot_decision_timeline(ax, results: Sequence[SimResult], styles: dict[str, dict]) -> None:
    """Show FD booking-to-maturity intervals as a date-based horizontal timeline."""
    import matplotlib.dates as mdates
    rows = [
        (result.strategy_name, booking)
        for result in results
        for booking in result.bookings
    ]
    if not rows:
        ax.text(
            0.5, 0.5, "No FD bookings to display",
            ha="center", va="center", color=_MUTED, transform=ax.transAxes,
        )
        ax.set_axis_off()
        return

    account_labels = {}
    for _, booking in rows:
        account_labels.setdefault(booking.account_id, booking.account_id)

    labels = [
        f"{strategy} · {account_labels[booking.account_id]} · "
        f"{booking.option.label} ({booking.option.annual_rate:.2f}%)"
        for strategy, booking in rows
    ]

    for y, (strategy, booking) in enumerate(rows):
        style = styles.get(strategy, {})
        color = style.get("color", _COLORS[y % len(_COLORS)])
        start_num = mdates.date2num(booking.start)
        end_num = max(mdates.date2num(booking.end), start_num + 1)
        ax.barh(
            y, end_num - start_num, left=start_num, height=0.68,
            color=color, alpha=style.get("alpha", 0.95),
            edgecolor=color, linewidth=0.7,
        )
        ax.scatter([start_num], [y], color=color, s=15, zorder=3)
        ax.scatter([end_num], [y], color=color, s=22, marker="|", zorder=3)
        ax.text(
            start_num + max((end_num - start_num) * 0.02, 1),
            y, f"{booking.principal:,.0f}",
            va="center", ha="left", fontsize=7, color="#111318",
            fontweight="bold", clip_on=True,
        )

    ax.set_yticks(list(range(len(rows))), labels)
    # Keep strategy identity visible in the left-side labels as well as the bars.
    tick_labels = ax.get_yticklabels()
    for tick, (strategy, _) in zip(tick_labels, rows):
        tick.set_color("#56b4e9" if strategy.lower() in {"absolute", "gaml"} else _MUTED)
    absolute_count = sum(1 for strategy, _ in rows if strategy.lower() != "greedy")
    if 0 < absolute_count < len(rows):
        # Visually separate primary strategy decisions from the Greedy comparison below.
        ax.axhline(absolute_count - 0.5, color=_GRID, linewidth=1.2, alpha=0.95, zorder=4)
    ax.invert_yaxis()
    ax.set_xlabel("Date")
    ax.set_title("FD booking and maturity timeline", loc="left", fontweight="bold", pad=10)
    ax.grid(axis="x", linestyle="--", alpha=0.45)
    ax.grid(axis="y", visible=False)
    ax.set_axisbelow(True)



_CASH_FLOW_CATEGORIES = (
    ("New money", "#56b4e9"), ("FD payouts", "#009e73"),
    ("FD maturities", "#8be9fd"), ("Outflows", "#d55e00"),
    ("FD investments", "#e69f00"), ("Transfers out", "#cc79a7"),
    ("Transfers in", "#bd93f9"),
)

def _cash_flow_series(result: SimResult, start: date, end: date) -> dict[str, list[tuple[date, float]]]:
    """Aggregate dated cash movements from the selected simulation path."""
    totals: dict[str, dict[date, float]] = {name: {} for name, _ in _CASH_FLOW_CATEGORIES}
    for events in result.timeline.values():
        for event in events:
            if not start <= event.on_date <= end or abs(event.amount) < 0.005:
                continue
            category, amount = None, float(event.amount)
            if event.event_type == EventType.INFLOW:
                category = "New money"
            elif event.event_type == EventType.OUTFLOW and amount < 0:
                # Positive OUTFLOW entries seed obligations; only negative
                # payment events represent cash that actually left an account.
                category = "Outflows"
            elif event.event_type == EventType.BOOKING:
                category, amount = "FD investments", -abs(amount)
            elif event.event_type == EventType.CASH_FLOW:
                category = "FD payouts"
            elif event.event_type == EventType.MATURITY:
                category = "FD maturities"
            elif event.event_type == EventType.TRANSFER:
                if event.label.startswith(("Transfer to ", "Final sweep to ")):
                    category, amount = "Transfers out", -abs(amount)
                elif event.label.startswith(("Transfer received", "Final sweep received")):
                    category = "Transfers in"
            if category:
                values = totals[category]
                values[event.on_date] = values.get(event.on_date, 0.0) + amount
    return {name: sorted(values.items()) for name, values in totals.items() if values}

def _plot_cash_flow_panel(ax, result: SimResult, start: date, end: date) -> None:
    """Draw positive receipts and negative uses of cash on a date axis."""
    import matplotlib.dates as mdates
    series = _cash_flow_series(result, start, end)
    if not series:
        ax.text(0.5, 0.5, "No cash movements to display", ha="center", va="center",
                color=_MUTED, transform=ax.transAxes)
        ax.set_axis_off()
        return
    width = 0.78 / len(_CASH_FLOW_CATEGORIES)
    offsets = {name: (i - (len(_CASH_FLOW_CATEGORIES) - 1) / 2) * width
               for i, (name, _) in enumerate(_CASH_FLOW_CATEGORIES)}
    colors = dict(_CASH_FLOW_CATEGORIES)
    for category, values in series.items():
        xs = [mdates.date2num(day) + offsets[category] for day, _ in values]
        ys = [amount for _, amount in values]
        ax.bar(xs, ys, width=width * 0.94, color=colors[category], alpha=0.9,
               label=category, edgecolor=_BACKGROUND, linewidth=0.25)
    ax.axhline(0, color=_TEXT, linewidth=0.8, alpha=0.8)
    ax.set_xlim(mdates.date2num(start) - 1, mdates.date2num(end) + 1)
    ax.set_ylabel("Cash movement (LKR)")
    ax.set_title(f"{result.strategy_name} · dated cash movements", loc="left",
                 fontweight="bold", pad=8)
    ax.grid(axis="y", linestyle="--", alpha=0.4)
    ax.grid(axis="x", visible=False)
    ax.set_axisbelow(True)
    ax.legend(loc="upper left", ncol=4, fontsize=7, framealpha=0.95)


def plot_strategy_results(
    primary: SimResult,
    *,
    comparison: Optional[SimResult] = None,
    accounts: Sequence[Account],
    inflow_schedule: dict[date, float] | dict[date, dict[str, float]],
    inflow_account_id: str,
    start: date,
    end: date,
    output_dir: str | Path = "plots",
    show: bool = True,
    consolidation_account_id: Optional[str] = None,
) -> list[Path]:
    """Save dark-theme account-value and booking-timeline charts.

    Greedy mode plots only Greedy. Absolute mode overlays Greedy in a pale,
    dashed style behind high-contrast Absolute account lines.
    """
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt

    _configure_dark_theme()
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    dates = _date_range(start, end)
    labels = _account_labels(accounts)
    has_greedy_comparison = comparison is not None and primary.strategy_name.lower() in {"absolute", "gaml"}
    primary_series = _portfolio_series(
        primary, accounts, inflow_schedule, inflow_account_id, start, end
    )

    saved: list[Path] = []
    fig, ax = plt.subplots(figsize=(13, 6.5), constrained_layout=True)
    if has_greedy_comparison:
        comparison_series = _portfolio_series(
            comparison, accounts, inflow_schedule, inflow_account_id, start, end
        )
        account_by_id = {account.id: account for account in accounts}
        consolidation = account_by_id.get(consolidation_account_id or "")
        consolidation_bank_id = (
            consolidation.bank_identity.strip().upper() if consolidation else ""
        )
        greedy_account_order = list(comparison_series)
        if consolidation_account_id in greedy_account_order:
            greedy_account_order.remove(consolidation_account_id)
            greedy_account_order.insert(0, consolidation_account_id)
        for index, account_id in enumerate(greedy_account_order):
            values = comparison_series[account_id]
            account = account_by_id.get(account_id)
            bank_id = account.bank_identity.strip().upper() if account else ""
            if account_id == consolidation_account_id:
                greedy_style = "-"
            elif consolidation_bank_id and bank_id == consolidation_bank_id:
                greedy_style = "--"
            else:
                greedy_style = ":"
            ax.plot(
                dates, values, color=_COLORS[index % len(_COLORS)],
                linestyle=greedy_style,
                linewidth=1.55 if greedy_style == "-" else 1.35, alpha=0.38,
                label=f"Greedy · {labels.get(account_id, account_id)}",
                zorder=1,
            )

    _plot_account_lines(
        ax, dates, primary_series, labels, accounts, consolidation_account_id
    )
    ax.set_title(
        f"{primary.strategy_name}: estimated account value over time",
        loc="left", fontweight="bold", pad=12,
    )
    ax.set_xlabel("Date")
    ax.set_ylabel("Estimated value (LKR)")
    ax.grid(True, linestyle="--", alpha=0.4)
    ax.set_axisbelow(True)
    locator = mdates.AutoDateLocator(minticks=5, maxticks=10)
    ax.xaxis.set_major_locator(locator)
    ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
    ax.legend(loc="best", framealpha=0.95)
    value_file = output_path / f"{primary.strategy_name.lower()}_account_values.png"
    fig.savefig(value_file, dpi=160, bbox_inches="tight")
    saved.append(value_file)
    value_fig = fig  # Keep open so plt.show() displays both saved figures.

    timeline_results = [primary]
    styles = {primary.strategy_name: {"color": _COLORS[0], "alpha": 0.95}}
    if has_greedy_comparison:
        timeline_results.append(comparison)
        styles[comparison.strategy_name] = {"color": _GREEDY_PALE, "alpha": 0.62}

    booking_count = sum(len(result.bookings) for result in timeline_results)
    fig, ax = plt.subplots(
        figsize=(14, max(5.0, 0.48 * booking_count + 2)),
        constrained_layout=True,
    )
    _plot_decision_timeline(ax, timeline_results, styles)
    locator = mdates.AutoDateLocator(minticks=5, maxticks=12)
    ax.xaxis_date()
    ax.xaxis.set_major_locator(locator)
    ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
    timeline_file = output_path / f"{primary.strategy_name.lower()}_decision_timeline.png"
    fig.savefig(timeline_file, dpi=160, bbox_inches="tight")
    saved.append(timeline_file)
    timeline_fig = fig

    # Date-aligned cash-flow diagram; comparison strategies get their own panel.
    cash_flow_results = [primary] + ([comparison] if has_greedy_comparison else [])
    cash_flow_fig, cash_flow_axes = plt.subplots(
        len(cash_flow_results), 1,
        figsize=(14, 5.2 if len(cash_flow_results) == 1 else 8.2),
        sharex=True, squeeze=False, constrained_layout=True,
    )
    for axis, flow_result in zip(cash_flow_axes[:, 0], cash_flow_results):
        _plot_cash_flow_panel(axis, flow_result, start, end)
    cash_flow_axes[-1, 0].set_xlabel("Date")
    locator = mdates.AutoDateLocator(minticks=5, maxticks=12)
    cash_flow_axes[-1, 0].xaxis.set_major_locator(locator)
    cash_flow_axes[-1, 0].xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
    cash_flow_fig.suptitle(f"{primary.strategy_name}: cash-flow diagram",
                           x=0.02, ha="left", fontweight="bold")
    cash_flow_file = output_path / f"{primary.strategy_name.lower()}_cash_flows.png"
    cash_flow_fig.savefig(cash_flow_file, dpi=160, bbox_inches="tight")
    saved.append(cash_flow_file)

    if show:
        plt.show()
    plt.close(value_fig)
    plt.close(timeline_fig)
    plt.close(cash_flow_fig)
    return saved
