from __future__ import annotations

import csv
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
    bank_id: str = ""  # canonical ID from data/banks/banks.csv
    label: str = ""
    balance: float = 0.0
    supports_efd: bool = True
    bank_key: str = ""  # internal FD-options routing key; never used as config identity

    def __post_init__(self):
        if not self.label:
            self.label = f"{(self.bank_key or self.bank_id).title()} Account"
        if not isinstance(self.supports_efd, bool):
            raise ValueError("supports_efd must be a boolean")

    @property
    def bank_identity(self) -> str:
        """Canonical bank ID; bank_key is only a legacy/internal fallback."""
        return self.bank_id or self.bank_key

    def can_use_option(self, option: "FDOption") -> bool:
        """Whether this specific account can open the given bank product."""
        return not option.is_efd or self.supports_efd


@dataclass
class TransferFeeConfig:
    """
    Configuration for inter-bank and intra-bank transfer fees.

    - Same-bank transfer fee: 0.0 by default.
    - Inter-bank transfer fee: bank-specific sending-bank tariff, then directional bank-ID override, then fallback.
    """
    default_inter_bank_fee: float = 30.0
    same_bank_fee: float = 0.0
    custom_fees: dict[tuple[str, str], float] = field(default_factory=dict)
    bank_fees: dict[str, tuple[float, float]] = field(default_factory=dict)

    def get_fee(self, from_bank_id: str, to_bank_id: str) -> float:
        from_id = from_bank_id.strip().upper()
        to_id = to_bank_id.strip().upper()
        if from_id == to_id:
            return self.bank_fees.get(from_id, (self.same_bank_fee, self.default_inter_bank_fee))[0]
        if (from_id, to_id) in self.custom_fees:
            return self.custom_fees[(from_id, to_id)]
        return self.bank_fees.get(from_id, (self.same_bank_fee, self.default_inter_bank_fee))[1]


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
    bank_key:            str  = ""   # internal FD-options routing key
    bank_id:             str  = ""   # canonical ID from data/banks/banks.csv
    fee:                 float = 0.0 # transfer fee if transfer event
    transfer_channel:    str = ""    # intra_bank or domestic_ceft
    balance_after:       float = -1.0 # balance of this specific account after the event
    total_balance_after: float = -1.0 # total liquid cash across all accounts after the event
    decision_context: dict = field(default_factory=dict) # final-path decision snapshot; empty for non-decision events

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
    bank_key: str = ""  # internal FD-options routing key
    is_efd: bool = False
    bank_id: str = ""

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

    @property
    def bank_identity(self) -> str:
        """Canonical bank ID; bank_key is only a legacy/internal fallback."""
        return self.bank_id or self.bank_key

    @property
    def economic_terms_key(self) -> tuple:
        """Terms that must match before eFD can win a standard-FD tie-break."""
        return (
            self.bank_identity,
            self.days,
            self.annual_rate,
            self.min_amount,
            self.payout_type,
            self.payout_period_str,
        )

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

    def generate_cash_flows_after_ait(
        self,
        principal: float,
        start: date,
        ait_rate: float,
        compound: bool = False,
        actual_leap_year: bool = True,
    ) -> list[tuple[date, float]]:
        """Generate cash actually available after withholding AIT from interest only."""
        gross_flows = self.generate_cash_flows(
            principal, start, compound=compound, actual_leap_year=actual_leap_year
        )
        return self.apply_ait_to_cash_flows(principal, gross_flows, ait_rate)

    def apply_ait_to_cash_flows(
        self,
        principal: float,
        gross_flows: list[tuple[date, float]],
        ait_rate: float,
    ) -> list[tuple[date, float]]:
        """Apply AIT to an existing gross payout schedule without recalculating interest."""
        if ait_rate <= 0:
            return list(gross_flows)
        total_interest = sum(amount for _, amount in gross_flows) - principal
        net_flows: list[tuple[date, float]] = []
        for index, (flow_date, amount) in enumerate(gross_flows):
            if self.payout_type == CUMULATIVE:
                interest_component = amount - principal
            elif self.payout_type == PERIODIC_INTEREST:
                principal_component = principal if index == len(gross_flows) - 1 else 0.0
                interest_component = amount - principal_component
            else:
                interest_component = total_interest / len(gross_flows)
            withheld = round(max(0.0, interest_component) * ait_rate, 2)
            net_flows.append((flow_date, round(amount - withheld, 2)))
        return net_flows


@dataclass
class Booking:
    option: FDOption
    principal: float
    start: date
    cash_flows: list[tuple[date, float]]
    account_id: str = ""
    bank_key: str = ""  # internal FD-options routing key
    bank_id: str = ""

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
    decision_log: list[dict] = field(default_factory=list)
    ait_enabled: bool = False
    ait_rate: float = 0.10

    @property
    def total_interest(self) -> float:
        return sum(b.total_interest for b in self.bookings)

    @property
    def net_interest(self) -> float:
        """Interest after transfer fees and any enabled AIT withholding."""
        return self.total_interest - self.total_transfer_fees - self.ait_withheld

    @property
    def ait_withheld(self) -> float:
        """AIT actually withheld across scheduled FD payouts when enabled."""
        if not self.ait_enabled:
            return 0.0
        total = 0.0
        for booking in self.bookings:
            gross_flows = booking.cash_flows
            total_interest = booking.total_interest
            for index, (_, amount) in enumerate(gross_flows):
                if booking.payout_type == CUMULATIVE:
                    interest_component = amount - booking.principal
                elif booking.payout_type == PERIODIC_INTEREST:
                    principal_component = booking.principal if index == len(gross_flows) - 1 else 0.0
                    interest_component = amount - principal_component
                else:
                    interest_component = total_interest / len(gross_flows)
                total += round(max(0.0, interest_component) * self.ait_rate, 2)
        return round(total, 2)

    @property
    def net_interest_after_ait(self) -> float:
        return self.net_interest

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
        """Terminal value after any AIT withholding applied during simulation."""
        return self.total_principal + self.total_interest - self.total_transfer_fees - self.ait_withheld

    @property
    def final_value_after_ait(self) -> float:
        """Terminal value; AIT is already reflected when enabled."""
        return self.final_value

    def sorted_dates(self) -> list[int]:
        """Timeline keys in ascending chronological order."""
        return sorted(self.timeline.keys())


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


def load_options_from_bank_csv(
    index_filepath: str | Path,
    bank_ids: list[str],
    *,
    default_min_invest: float = DEFAULT_MIN_INVESTMENT,
) -> list[FDOption]:
    """Load all standard and eFD products for the requested canonical bank IDs."""
    index_path = Path(index_filepath).expanduser().resolve()
    if not index_path.is_file():
        raise FileNotFoundError(f"FD options index not found: {index_path}")

    with index_path.open("r", encoding="utf-8-sig", newline="") as handle:
        index_rows = list(csv.DictReader(handle))
    required = {"bank_id", "bank_key", "options_file"}
    if not index_rows or not required.issubset(index_rows[0]):
        raise ValueError(
            f"{index_path} must contain columns: {', '.join(sorted(required))}"
        )

    requested = {str(bank_id).strip() for bank_id in bank_ids}
    if not requested:
        raise ValueError("At least one canonical bank_id is required")
    rows_by_id = {
        str(row.get("bank_id", "")).strip(): row
        for row in index_rows if str(row.get("bank_id", "")).strip()
    }
    missing = sorted(requested - set(rows_by_id))
    if missing:
        raise ValueError(f"No FD-options index entry for bank_id(s): {', '.join(missing)}")

    result: list[FDOption] = []
    for bank_id in sorted(requested):
        bank = rows_by_id[bank_id]
        bank_key = str(bank.get("bank_key", "")).strip().lower()
        relative_file = str(bank.get("options_file", "")).strip()
        if not relative_file:
            raise ValueError(f"Bank {bank_id!r} has no options_file")
        bank_file = (index_path.parent / relative_file).resolve()
        if not bank_file.is_file():
            raise FileNotFoundError(f"FD options file for {bank_id!r} not found: {bank_file}")

        with bank_file.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        bank_options: list[FDOption] = []
        bank_default_min = {
            "commercial": 25_000.0,
            "dfcc": 10_000.0,
        }.get(bank_key, default_min_invest)
        for row in rows:
            raw_efd = str(row.get("eFD", "")).strip().lower()
            if raw_efd not in {"true", "false"}:
                raise ValueError(
                    f"Option {row.get('name', '')!r} in {bank_file} has invalid eFD value {raw_efd!r}"
                )
            try:
                min_amount = float(row["min_amount"]) if str(row.get("min_amount", "")).strip() else bank_default_min
                option = FDOption(
                    label=str(row.get("name", "")).strip(),
                    period_str=str(row.get("period", "")).strip(),
                    annual_rate=float(row.get("annual_rate", "")),
                    min_amount=min_amount,
                    payout_type=str(row.get("payout_type", CUMULATIVE)).strip() or CUMULATIVE,
                    payout_period_str=str(row.get("payout_period", "")).strip(),
                    bank_key=bank_key,
                    is_efd=(raw_efd == "true"),
                    bank_id=bank_id,
                )
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Invalid FD option row in {bank_file}: {row!r}") from exc
            if not option.label:
                raise ValueError(f"FD option in {bank_file} has an empty name")
            bank_options.append(option)

        if not bank_options:
            raise ValueError(f"Bank {bank_id!r} has no FD products in {bank_file}")
        result.extend(bank_options)

    return result
