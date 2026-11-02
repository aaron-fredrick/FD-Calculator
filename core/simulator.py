from __future__ import annotations

from datetime import date
from typing import Optional

from core.interest import parse_period_delta
from core.models import FDOption, SimResult
from core.strategies.greedy import GreedyStrategy


def build_inflow_schedule(
    first_inflow_date: date,
    end: date,
    interval_str: str,
    amount: float,
) -> dict[date, float]:
    schedule: dict[date, float] = {}
    if amount <= 0 or first_inflow_date > end:
        return schedule

    delta = parse_period_delta(interval_str)
    step = 0
    while True:
        d = first_inflow_date + (delta * step)
        if d > end:
            break
        schedule[d] = schedule.get(d, 0.0) + amount
        step += 1
    return schedule


def simulate(
    options: list[FDOption],
    start: date,
    end: date,
    inflow_schedule: dict[date, float],
    compound: bool = False,
    actual_leap_year: bool = True,
    outflow_schedule: dict[date, list[dict]] | None = None,
) -> SimResult:
    strategy = GreedyStrategy(compound=compound, actual_leap_year=actual_leap_year)
    return strategy.simulate(
        options=options,
        start=start,
        end=end,
        inflow_schedule=inflow_schedule,
        outflow_schedule=outflow_schedule,
    )
