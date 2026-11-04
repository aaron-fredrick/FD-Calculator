from __future__ import annotations

from datetime import date
from typing import Optional

from core.models import FDOption

_DP_CACHE: dict[tuple, tuple[float, Optional[FDOption]]] = {}


def clear_cache() -> None:
    _DP_CACHE.clear()


def get_optimal_dp(
    options: list[FDOption],
    current_date: date,
    end: date,
    cash: float,
    compound: bool = False,
    actual_leap_year: bool = True,
) -> tuple[float, Optional[FDOption]]:
    options_key = tuple(
        (o.label, o.period_str, o.annual_rate, o.min_amount, o.payout_type, o.payout_period_str)
        for o in options
    )
    cache_key = (options_key, current_date, end, round(cash, 2), compound, actual_leap_year)
    if cache_key in _DP_CACHE:
        return _DP_CACHE[cache_key]

    if current_date >= end or cash <= 0:
        return 1.0, None

    best_mult = 1.0
    best_opt: Optional[FDOption] = None

    for opt in options:
        if opt.can_invest(cash, current_date, end):
            flows = opt.generate_cash_flows(cash, current_date, compound, actual_leap_year)
            tot_final_cash = 0.0
            for flow_date, flow_amt in flows:
                if flow_date < end and any(sub.can_invest(flow_amt, flow_date, end) for sub in options):
                    sub_mult, _ = get_optimal_dp(
                        options, flow_date, end, flow_amt, compound, actual_leap_year
                    )
                    tot_final_cash += flow_amt * sub_mult
                else:
                    tot_final_cash += flow_amt

            mult = tot_final_cash / cash if cash > 0 else 1.0
            if mult > best_mult + 1e-9:
                best_mult = mult
                best_opt = opt
            elif abs(mult - best_mult) <= 1e-9:
                if best_opt is None or opt.annual_rate > best_opt.annual_rate or (
                    opt.annual_rate == best_opt.annual_rate and opt.days < best_opt.days
                ):
                    best_opt = opt

    _DP_CACHE[cache_key] = (best_mult, best_opt)
    return _DP_CACHE[cache_key]


def get_optimal_option(
    options: list[FDOption],
    today: date,
    end: date,
    cash: float,
    compound: bool = False,
    actual_leap_year: bool = True,
) -> Optional[FDOption]:
    _, best_opt = get_optimal_dp(options, today, end, cash, compound, actual_leap_year)
    return best_opt
