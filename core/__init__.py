from __future__ import annotations

from core.interest import (
    add_period,
    calc_interest,
    get_year_base_days,
    parse_period_days,
    parse_period_delta,
)
from core.models import (
    CUMULATIVE,
    DEFAULT_MIN_INVESTMENT,
    INSTALLMENT,
    PAYOUT_ABBR,
    PERIODIC_INTEREST,
    VALID_PAYOUT_TYPES,
    Account,
    Booking,
    Event,
    EventType,
    FDOption,
    SimResult,
    TransferFeeConfig,
    build_fd_options,
    load_all_options_from_json,
    load_options_from_json,
)
from core.reporting import (
    divider,
    print_booking_ledger,
    print_event_timeline,
    print_options_table,
    print_simulation,
)
from core.simulator import build_inflow_schedule, simulate
from core.strategies import AbsoluteStrategy, BaseStrategy, GAMLStrategy, GreedyStrategy

__all__ = [
    # Models
    "Account",
    "Booking",
    "Event",
    "EventType",
    "FDOption",
    "SimResult",
    "TransferFeeConfig",
    "build_fd_options",
    "load_all_options_from_json",
    "load_options_from_json",
    "CUMULATIVE",
    "PERIODIC_INTEREST",
    "INSTALLMENT",
    "VALID_PAYOUT_TYPES",
    "PAYOUT_ABBR",
    "DEFAULT_MIN_INVESTMENT",
    # Interest
    "add_period",
    "calc_interest",
    "get_year_base_days",
    "parse_period_days",
    "parse_period_delta",
    # Reporting
    "divider",
    "print_options_table",
    "print_event_timeline",
    "print_booking_ledger",
    "print_simulation",
    # Simulation
    "build_inflow_schedule",
    "simulate",
    # Strategies
    "AbsoluteStrategy",
    "BaseStrategy",
    "GreedyStrategy",
    "GAMLStrategy",
]
