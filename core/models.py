from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, timedelta
from enum import Enum
from pathlib import Path
from typing import Optional

from core.interest import add_period, calc_interest, parse_period_days

CUMULATIVE = "cumulative"
PERIODIC_INTEREST = "periodic_interest"
INSTALLMENT = "installment"
VALID_PAYOUT_TYPES = {CUMULATIVE, PERIODIC_INTEREST, INSTALLMENT}


class EventType(Enum):
    """All things that can appear on the event timeline."""
    INFLOW           = "inflow"           # scheduled new cash arrives
    OUTFLOW          = "outflow"          # scheduled cash payment
    TRANSFER         = "transfer"         # cash transferred between bank accounts (may incur fee)
    BOOKING          = "booking"          # an FD is booked (decision)
    CASH_FLOW        = "cash_flow"        # periodic interest / installment payment received
    MATURITY         = "maturity"         # FD matures: principal + final interest returned
    CARRY_FORWARD    = "carry_forward"    # cash present but below min threshold; carried to next event
    IDLE             = "idle"             # cash left genuinely undeployed at end of horizon


@dataclass
class Account:
    """A bank account holding liquid cash."""
    id: str
    bank_key: str
    label: str = ""
    balance: float = 0.0

    def __post_init__(self):
        if not self.label:
            self.label = f"{self.bank_key.title()} Account"


@dataclass
class TransferFeeConfig:
    """
    Configuration for inter-bank and intra-bank transfer fees.

    - Same-bank transfer fee: 0.0 by default.
    - Inter-bank transfer fee: default_inter_bank_fee (e.g. 30.0 LKR), or customized per pair.
    """
    default_inter_bank_fee: float = 30.0
    same_bank_fee: float = 0.0
    custom_fees: dict[tuple[str, str], float] = field(default_factory=dict)

    def get_fee(self, from_bank: str, to_bank: str) -> float:
        b1 = from_bank.strip().lower()
        b2 = to_bank.strip().lower()
        if b1 == b2:
            return self.same_bank_fee
        if (b1, b2) in self.custom_fees:
            return self.custom_fees[(b1, b2)]
        if (b2, b1) in self.custom_fees:
            return self.custom_fees[(b2, b1)]
        return self.default_inter_bank_fee


@dataclass
class Event:
    """
    One thing that happened (or is predicted to happen) on a given day.

    ``date_key`` is the canonical integer key used in the timeline dict
    (``YYYYMMDD``, e.g. 20260203 for 2026-Feb-03).
    """
    event_type:          EventType
    on_date:             date
    amount:              float       # cash amount relevant to this event
    label:               str  = ""   # human-readable description
    booking_ref:         str  = ""   # non-empty for booking / cash-flow / maturity events
    account_id:          str  = ""   # which account this event directly affected
    payment_policy:      str  = ""   # outflow policy when applicable
    bank_key:            str  = ""   # which bank
    fee:                 float = 0.0 # transfer fee if transfer event
    balance_after:       float = -1.0 # balance of this specific account after the event
    total_balance_after: float = -1.0 # total liquid cash across all accounts after the event

    @property
    def date_key(self) -> int:
        return int(self.on_date.strftime("%Y%m%d"))


PAYOUT_ABBR = {
    CUMULATIVE: "Lump at maturity",
    PERIODIC_INTEREST: "Periodic interest",
    INSTALLMENT: "Installment (EMI)",
}

DEFAULT_MIN_INVESTMENT: float = 25_000.0


@dataclass
class FDOption:
    label: str
    period_str: str
    annual_rate: float
    min_amount: float = DEFAULT_MIN_INVESTMENT
    payout_type: str = CUMULATIVE
    payout_period_str: str = ""
    bank_key: str = ""

    days: int = field(init=False)
    payout_period_days: int = field(init=False)

    def __post_init__(self):
        if isinstance(self.min_amount, str):
            passed_payout = self.min_amount
            self.min_amount = DEFAULT_MIN_INVESTMENT
            if self.payout_type != CUMULATIVE and not self.payout_period_str:
                self.payout_period_str = self.payout_type
            self.payout_type = passed_payout

        norm_type = self.payout_type.strip().lower()
        if norm_type in ("periodic", "periodic_interest", "monthly_interest"):
            self.payout_type = PERIODIC_INTEREST
        elif norm_type in ("installment", "emi"):
            self.payout_type = INSTALLMENT
        elif norm_type in ("cumulative", "lump", "maturity"):
            self.payout_type = CUMULATIVE
        else:
            raise ValueError(f"Invalid payout_type {self.payout_type!r}. Must be 'cumulative', 'periodic_interest', or 'installment'.")

        self.days = parse_period_days(self.period_str)
        self.payout_period_days = (
            parse_period_days(self.payout_period_str)
            if self.payout_period_str
            else self.days
        )
        if self.payout_type != CUMULATIVE and not self.payout_period_str:
            raise ValueError(f"Option {self.label!r} requires payout_period_str for {self.payout_type!r}")

    def maturity_date(self, start: date) -> date:
        return add_period(start, self.period_str)

    def fits_before(self, start: date, end: date) -> bool:
        return self.maturity_date(start) <= end

    def can_invest(self, cash: float, start: date, end: date) -> bool:
        return cash >= self.min_amount and self.fits_before(start, end)

    def total_interest_on(
        self,
        principal: float,
        start: Optional[date] = None,
        compound: bool = False,
        actual_leap_year: bool = True,
    ) -> float:
        days = (self.maturity_date(start) - start).days if start else self.days
        return calc_interest(principal, self.annual_rate, days, start, compound, actual_leap_year)

    def generate_cash_flows(
        self,
        principal: float,
        start: date,
        compound: bool = False,
        actual_leap_year: bool = True,
    ) -> list[tuple[date, float]]:
        mat = self.maturity_date(start)
        tenor_days = (mat - start).days

        if self.payout_type == CUMULATIVE:
            interest = calc_interest(principal, self.annual_rate, tenor_days, start, compound, actual_leap_year)
            return [(mat, principal + interest)]

        if self.payout_type == PERIODIC_INTEREST:
            flows: list[tuple[date, float]] = []
            current = start
            step = 1
            while True:
                pay_date = add_period(start, self.payout_period_str, step)
                if pay_date >= mat:
                    period_days = (mat - current).days
                    interest = (
                        calc_interest(principal, self.annual_rate, period_days, current, compound, actual_leap_year)
                        if period_days > 0
                        else 0.0
                    )
                    flows.append((mat, principal + interest))
                    break
                period_days = (pay_date - current).days
                interest = calc_interest(principal, self.annual_rate, period_days, current, compound, actual_leap_year)
                flows.append((pay_date, interest))
                current = pay_date
                step += 1
            return flows

        if self.payout_type == INSTALLMENT:
            pay_dates: list[date] = []
            step = 1
            while True:
                p_date = add_period(start, self.payout_period_str, step)
                if p_date >= mat:
                    pay_dates.append(mat)
                    break
                pay_dates.append(p_date)
                step += 1
            n = len(pay_dates)
            total_interest = calc_interest(principal, self.annual_rate, tenor_days, start, compound, actual_leap_year)
            installment = (principal + total_interest) / n
            return [(d, installment) for d in pay_dates]

        raise ValueError(f"Unhandled payout_type: {self.payout_type!r}")

    def num_periods(self) -> int:
        return max(1, round(self.days / self.payout_period_days))


@dataclass
class Booking:
    option: FDOption
    principal: float
    start: date
    cash_flows: list[tuple[date, float]]
    account_id: str = ""
    bank_key: str = ""

    @property
    def total_received(self) -> float:
        return sum(amt for _, amt in self.cash_flows)

    @property
    def total_interest(self) -> float:
        return self.total_received - self.principal

    @property
    def end(self) -> date:
        return max(d for d, _ in self.cash_flows)

    @property
    def payout_type(self) -> str:
        return self.option.payout_type


@dataclass
class SimResult:
    """
    Complete output of a strategy run.
    """
    strategy_name:       str
    timeline:            dict[int, list[Event]]    # YYYYMMDD -> events
    bookings:            list[Booking]
    total_principal:     float
    end_date:            date
    accounts:            dict[str, Account] = field(default_factory=dict)
    total_transfer_fees: float = 0.0
    total_decisions_evaluated: Optional[int] = None
    alternative_leaf_net_interests: list[float] = field(default_factory=list)
    total_outflows_paid: float = 0.0
    outstanding_outflows: list[dict] = field(default_factory=list)
    valid: bool = True

    @property
    def total_interest(self) -> float:
        return sum(b.total_interest for b in self.bookings)

    @property
    def net_interest(self) -> float:
        return self.total_interest - self.total_transfer_fees

    @property
    def total_outflows_due(self) -> float:
        return self.total_outflows_paid + sum(
            float(item.get("remaining", 0.0)) for item in self.outstanding_outflows
        )

    @property
    def cash_retained(self) -> float:
        """Liquid cash remaining across configured accounts at the end of the run."""
        return sum(account.balance for account in self.accounts.values())

    @property
    def cash_flow_net_worth(self) -> float:
        """Ending liquid cash less unpaid outflow liabilities."""
        return self.cash_retained - sum(
            float(item.get("remaining", 0.0)) for item in self.outstanding_outflows
        )

    @property
    def total_idle(self) -> float:
        idle = 0.0
        for events in self.timeline.values():
            for e in events:
                if e.event_type == EventType.IDLE:
                    idle += e.amount
        return idle

    @property
    def total_carry_forward(self) -> float:
        cf = 0.0
        for events in self.timeline.values():
            for e in events:
                if e.event_type == EventType.CARRY_FORWARD:
                    cf += e.amount
        return cf

    @property
    def final_value(self) -> float:
        return self.total_principal + self.total_interest - self.total_transfer_fees

    def sorted_dates(self) -> list[int]:
        """Timeline keys in ascending chronological order."""
        return sorted(self.timeline.keys())


def build_fd_options(
    options_config: list,
    default_min_invest: float = DEFAULT_MIN_INVESTMENT,
    bank_key: str = "",
) -> list[FDOption]:
    result = []
    for entry in options_config:
        if isinstance(entry, FDOption):
            if bank_key and not entry.bank_key:
                entry.bank_key = bank_key
            result.append(entry)
        elif isinstance(entry, dict):
            label = str(entry.get("label", ""))
            period_str = str(entry.get("period_str") or entry.get("period", ""))
            annual_rate = float(entry.get("annual_rate") if "annual_rate" in entry else entry.get("rate", 0.0))
            min_val = entry.get("min_amount") if "min_amount" in entry else entry.get("minimum", entry.get("min_invest", default_min_invest))
            min_amount = float(min_val) if min_val is not None else default_min_invest
            payout_type = str(entry.get("payout_type", CUMULATIVE))
            payout_period_str = str(entry.get("payout_period_str") or entry.get("payout_period", ""))
            b_key = str(entry.get("bank_key") or bank_key)
            result.append(
                FDOption(
                    label=label,
                    period_str=period_str,
                    annual_rate=annual_rate,
                    min_amount=min_amount,
                    payout_type=payout_type,
                    payout_period_str=payout_period_str,
                    bank_key=b_key,
                )
            )
        elif len(entry) == 3:
            label, period, rate = entry
            result.append(FDOption(label, period, rate, min_amount=default_min_invest, bank_key=bank_key))
        elif len(entry) == 4:
            label, period, rate, val4 = entry
            if isinstance(val4, (int, float)):
                result.append(FDOption(label, period, rate, min_amount=float(val4), bank_key=bank_key))
            else:
                result.append(FDOption(label, period, rate, min_amount=default_min_invest, payout_type=str(val4), bank_key=bank_key))
        elif len(entry) == 5:
            label, period, rate, val4, val5 = entry
            if isinstance(val4, (int, float)):
                result.append(FDOption(label, period, rate, min_amount=float(val4), payout_type=str(val5), bank_key=bank_key))
            else:
                result.append(FDOption(label, period, rate, min_amount=default_min_invest, payout_type=str(val4), payout_period_str=str(val5), bank_key=bank_key))
        elif len(entry) == 6:
            label, period, rate, val4, val5, val6 = entry
            if isinstance(val4, (int, float)):
                result.append(FDOption(label, period, rate, min_amount=float(val4), payout_type=str(val5), payout_period_str=str(val6), bank_key=bank_key))
            else:
                result.append(FDOption(label, period, rate, min_amount=float(val6), payout_type=str(val4), payout_period_str=str(val5), bank_key=bank_key))
        else:
            raise ValueError(f"OPTIONS entry must be 3 to 6 elements, got {len(entry)}: {entry!r}")
    return result


def normalize_inflow_schedule(
    schedule: dict[date, float] | dict[date, dict[str, float]],
    default_account_id: str,
) -> dict[date, dict[str, float]]:
    """Normalize legacy date->amount schedules and account-targeted schedules."""
    normalized: dict[date, dict[str, float]] = {}
    for inflow_date, value in schedule.items():
        entries = value if isinstance(value, dict) else {default_account_id: value}
        day_entries: dict[str, float] = {}
        for account_id, amount in entries.items():
            account_id = str(account_id).strip()
            amount = float(amount)
            if not account_id:
                raise ValueError(f"Inflow on {inflow_date} has an empty account_id")
            if amount < 0:
                raise ValueError(f"Inflow on {inflow_date} cannot be negative")
            if amount:
                day_entries[account_id] = day_entries.get(account_id, 0.0) + amount
        if day_entries:
            normalized[inflow_date] = day_entries
    return normalized


def load_options_from_json(
    filepath: str | Path = "options.json",
    bank_key: Optional[str] = None,
    default_min_invest: float = DEFAULT_MIN_INVESTMENT,
) -> list[FDOption]:
    """
    Load FD options from a JSON file.

    If ``bank_key`` is provided (e.g. 'commercial'), only that bank's options
    are returned.
    If ``bank_key`` is None or 'all', options across all banks in the file
    are returned as a combined list with their ``bank_key`` populated.
    """
    path = Path(filepath)
    if not path.is_absolute() and not path.exists():
        base_dir = Path(__file__).resolve().parent.parent
        candidate = base_dir / path
        if candidate.exists():
            path = candidate

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if bank_key is not None and bank_key.lower() != "all":
        if bank_key not in data:
            available = list(data.keys())
            raise KeyError(f"Key {bank_key!r} not found in {path}. Available keys: {available}")
        return build_fd_options(data[bank_key], default_min_invest=default_min_invest, bank_key=bank_key)

    all_options: list[FDOption] = []
    for b_key, opt_list in data.items():
        all_options.extend(build_fd_options(opt_list, default_min_invest=default_min_invest, bank_key=b_key))
    return all_options


def load_all_options_from_json(
    filepath: str | Path = "options.json",
    default_min_invest: float = DEFAULT_MIN_INVESTMENT,
) -> dict[str, list[FDOption]]:
    """Load options grouped by bank key into a dict."""
    path = Path(filepath)
    if not path.is_absolute() and not path.exists():
        base_dir = Path(__file__).resolve().parent.parent
        candidate = base_dir / path
        if candidate.exists():
            path = candidate

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return {
        b_key: build_fd_options(opt_list, default_min_invest=default_min_invest, bank_key=b_key)
        for b_key, opt_list in data.items()
    }
