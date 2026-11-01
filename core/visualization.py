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
    inflow_schedule: dict[date, float],
    inflow_account_id: str,
    start: date,
    end: date,
) -> dict[str, list[float]]:
    """Estimate per-account value while retaining invested principal as an asset."""
    dates = _date_range(start, end)
    values = {a.id: [float(a.balance)] * len(dates) for a in accounts}
    date_index = {day: i for i, day in enumerate(dates)}

    for day, amount in inflow_schedule.items():
        if day in date_index and inflow_account_id in values:
            for i in range(date_index[day], len(dates)):
                values[inflow_account_id][i] += amount

    # Approximate accrued interest linearly for visualization only.
    for booking in result.bookings:
        account_values = values.get(booking.account_id)
        if account_values is None or booking.end < start or booking.start > end:
            continue
        full_days = max((booking.end - booking.start).days, 1)
        total_interest = booking.total_interest
        for i, day in enumerate(dates):
            if day < booking.start:
                continue
            elapsed = min((day - booking.start).days, full_days)
            account_values[i] += total_interest * elapsed / full_days

    # A transfer fee is recorded on the source-side transfer event.
    for events in result.timeline.values():
        for event in events:
            if event.event_type != EventType.TRANSFER or event.fee <= 0:
                continue
            account_values = values.get(event.account_id)
            if account_values is None or event.on_date not in date_index:
                continue
            for i in range(date_index[event.on_date], len(dates)):
                account_values[i] -= event.fee

    return values


def _plot_account_lines(ax, dates, series, labels) -> None:
    for index, (account_id, values) in enumerate(series.items()):
        ax.plot(
            dates,
            values,
            label=labels.get(account_id, account_id),
            color=_COLORS[index % len(_COLORS)],
            linestyle="-" if index == 0 else ("--" if index % 2 else ":"),
            linewidth=2.25 if index == 0 else 1.9,
            alpha=1.0,
        )


def _plot_decision_timeline(ax, results: Sequence[SimResult], styles: dict[str, dict]) -> None:
    """Show FD booking-to-maturity intervals as a date-based horizontal timeline."""
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
        start_num = booking.start.toordinal()
        end_num = max(booking.end.toordinal(), start_num + 1)
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
    ax.invert_yaxis()
    ax.set_xlabel("Date")
    ax.set_title("FD booking and maturity timeline", loc="left", fontweight="bold", pad=10)
    ax.grid(axis="x", linestyle="--", alpha=0.45)
    ax.grid(axis="y", visible=False)
    ax.set_axisbelow(True)


def plot_strategy_results(
    primary: SimResult,
    *,
    comparison: Optional[SimResult] = None,
    accounts: Sequence[Account],
    inflow_schedule: dict[date, float],
    inflow_account_id: str,
    start: date,
    end: date,
    output_dir: str | Path = "plots",
    show: bool = True,
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
    is_absolute = primary.strategy_name.lower() == "absolute"
    primary_series = _portfolio_series(
        primary, accounts, inflow_schedule, inflow_account_id, start, end
    )

    saved: list[Path] = []
    fig, ax = plt.subplots(figsize=(13, 6.5), constrained_layout=True)
    if is_absolute and comparison is not None:
        comparison_series = _portfolio_series(
            comparison, accounts, inflow_schedule, inflow_account_id, start, end
        )
        for account_id, values in comparison_series.items():
            ax.plot(
                dates, values, color=_GREEDY_PALE, linestyle="--",
                linewidth=1.35, alpha=0.48,
                label=f"Greedy · {labels.get(account_id, account_id)}",
                zorder=1,
            )

    _plot_account_lines(ax, dates, primary_series, labels)
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
    plt.close(fig)

    timeline_results = [primary]
    styles = {primary.strategy_name: {"color": _COLORS[0], "alpha": 0.95}}
    if is_absolute and comparison is not None:
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

    if show:
        plt.show()
    plt.close(fig)
    return saved
