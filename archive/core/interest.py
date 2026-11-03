from __future__ import annotations

import calendar
from datetime import date
from typing import Optional
from dateutil.relativedelta import relativedelta


def parse_period_delta(period_str: str) -> relativedelta:
    s = period_str.strip().lower()
    if s.endswith("d"):
        return relativedelta(days=int(s[:-1]))
    if s.endswith("m"):
        return relativedelta(months=int(s[:-1]))
    if s.endswith("y"):
        return relativedelta(years=int(s[:-1]))
    raise ValueError(f"Unknown period format {period_str!r}. Use e.g. '100d', '1m', '1y'.")


def add_period(start: date, period_str: str, multiplier: int = 1) -> date:
    return start + (parse_period_delta(period_str) * multiplier)


def parse_period_days(period_str: str, start: Optional[date] = None) -> int:
    if start is not None:
        return (add_period(start, period_str) - start).days
    s = period_str.strip().lower()
    if s.endswith("d"):
        return int(s[:-1])
    if s.endswith("m"):
        return round(int(s[:-1]) * 30.4375)
    if s.endswith("y"):
        return round(int(s[:-1]) * 365.25)
    raise ValueError(f"Unknown period format {period_str!r}. Use e.g. '100d', '1m', '1y'.")


def get_year_base_days(on_date: Optional[date] = None, actual_leap_year: bool = True) -> int:
    if not actual_leap_year or on_date is None:
        return 365
    return 366 if calendar.isleap(on_date.year) else 365


def calc_interest(
    principal: float,
    annual_rate_pct: float,
    days: int,
    on_date: Optional[date] = None,
    compound: bool = False,
    actual_leap_year: bool = True,
) -> float:
    base_days = get_year_base_days(on_date, actual_leap_year)
    r = annual_rate_pct / 100.0
    if compound:
        return principal * ((1.0 + r / base_days) ** days - 1.0)
    return principal * r / base_days * days
