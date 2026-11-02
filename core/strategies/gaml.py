from __future__ import annotations

from datetime import date
from functools import lru_cache
from typing import Optional

from core.models import (
    Account,
    Booking,
    Event,
    EventType,
    FDOption,
    SimResult,
    TransferFeeConfig,
    normalize_inflow_schedule,
)
from core.strategies.base import BaseStrategy
from core.strategies.absolute import AbsoluteStrategy


def _date_key(d: date) -> int:
    """Convert a date to the canonical int timeline key (YYYYMMDD)."""
    return int(d.strftime("%Y%m%d"))


def _project_cash_to_end(
    principal: float,
    bank_key: str,
    today: date,
    end: date,
    options: list[FDOption],
    compound: bool,
    actual_leap_year: bool,
) -> float:
    """Return the best terminal value for one cash balance under configured FDs.

    This is an exact finite-horizon search for a single reinvestable cash balance:
    each eligible cumulative FD is considered, and its maturity proceeds are
    recursively optimised. Cash can always remain liquid. The cache avoids
    recalculating identical (rounded amount, date) states.
    """
    if principal <= 0.001 or today >= end:
        return max(0.0, principal)

    eligible_options = tuple(
        option for option in options
        if (not option.bank_key or option.bank_key == bank_key)
        and option.payout_type == "cumulative"
        and option.days > 0
    )

    @lru_cache(maxsize=100_000)
    def best_value(amount_cents: int, cursor_ordinal: int) -> float:
        cash = amount_cents / 100.0
        cursor = date.fromordinal(cursor_ordinal)
        best = cash  # Explicit HOLD action: liquid cash is always feasible.
        if cursor >= end or cash <= 0.001:
            return best

        for option in eligible_options:
            if cash + 1e-9 < option.min_amount:
                continue
            maturity = option.maturity_date(cursor)
            # Strict advancement prevents zero-day loops; never book past horizon.
            if maturity <= cursor or maturity > end:
                continue
            proceeds = cash + option.total_interest_on(
                cash, cursor, compound, actual_leap_year
            )
            future = best_value(round(proceeds * 100), maturity.toordinal())
            if future > best:
                best = future
        return best

    return best_value(round(principal * 100), today.toordinal())


def _project_option_terminal_value(
    principal: float,
    option: FDOption,
    today: date,
    end: date,
    options: list[FDOption],
    compound: bool,
    actual_leap_year: bool,
) -> float:
    """Project an FD's contractual payouts to the common end-date horizon."""
    flows = option.generate_cash_flows(
        principal=principal,
        start=today,
        compound=compound,
        actual_leap_year=actual_leap_year,
    )
    terminal_value = 0.0
    for flow_date, amount in flows:
        if flow_date >= end:
            terminal_value += amount
        else:
            terminal_value += _project_cash_to_end(
                amount, option.bank_key, flow_date, end, options,
                compound, actual_leap_year,
            )
    return terminal_value


def _best_option_by_projection(
    options: list[FDOption],
    cash: float,
    bank_key: str,
    today: date,
    end: date,
    compound: bool,
    actual_leap_year: bool,
) -> Optional[FDOption]:
    """Choose the eligible option with the best projected terminal value."""
    eligible = [
        option for option in options
        if (not option.bank_key or option.bank_key == bank_key)
        and option.can_invest(cash, today, end)
        and option.maturity_date(today) > today
    ]
    if not eligible:
        return None
    return max(
        eligible,
        key=lambda option: (
            _project_option_terminal_value(
                cash, option, today, end, options, compound, actual_leap_year
            ),
            -option.days,
            option.annual_rate,
        ),
    )


def _pick_daily_gaml_plan(
    all_accounts: dict[str, Account],
    options: list[FDOption],
    today: date,
    end: date,
    fee_config: TransferFeeConfig,
    consolidation_account_id: str,
    compound: bool,
    actual_leap_year: bool,
    next_event_date: Optional[date] = None,
    next_event_cash: Optional[dict[str, float]] = None,
) -> dict:
    """Compare local investment, consolidation, and an explicit wait action.

    Candidate values use actual configured cash-flow and interest calculations.
    Transfer fees are deducted exactly once, using the fees the simulator will
    execute. The wait action holds current balances until the next known event,
    allowing them to pool with cash arriving at that event.
    """
    active_accounts = [a for a in all_accounts.values() if a.balance > 0.001]
    if not active_accounts:
        return {"type": "CARRY", "carries": []}

    next_event_date = next_event_date or end
    if next_event_date <= today or next_event_date > end:
        next_event_date = end
    next_event_cash = next_event_cash or {}

    def project_cash(amount: float, bank: str, on_date: date) -> float:
        return _project_cash_to_end(
            amount, bank, on_date, end, options, compound, actual_leap_year
        )

    candidates: list[dict] = []

    # Candidate A: invest each account locally where eligible; carry the rest.
    split_bookings = []
    split_carries = []
    for acc in active_accounts:
        option = _best_option_by_projection(
            options, acc.balance, acc.bank_key, today, end, compound, actual_leap_year
        )
        if option is None:
            split_carries.append(acc)
        else:
            split_bookings.append({
                "account": acc,
                "option": option,
                "principal": acc.balance,
                "interest": option.total_interest_on(
                    acc.balance, today, compound, actual_leap_year
                ),
                "rate": option.annual_rate,
                "days": option.days,
            })
    if split_bookings:
        candidates.append({
            "type": "SPLIT",
            "bookings": split_bookings,
            "transfers": [],
            "carries": split_carries,
            "fees_today": 0.0,
            "gross_interest": sum(item["interest"] for item in split_bookings),
            "net_interest": sum(item["interest"] for item in split_bookings),
        })

    # Candidate B: consolidate cash into each possible target account.
    for target in all_accounts.values():
        transfers = []
        deployable = 0.0
        fees_today = 0.0
        carries = []
        for source in all_accounts.values():
            if source.balance <= 0.001:
                continue
            if source.id == target.id:
                deployable += source.balance
                continue
            fee = fee_config.get_fee(source.bank_key, target.bank_key)
            if source.balance <= fee:
                carries.append(source)
                continue
            net_amount = source.balance - fee
            deployable += net_amount
            fees_today += fee
            transfers.append({
                "src": source,
                "tgt": target,
                "amount": source.balance,
                "fee": fee,
                "net": net_amount,
            })
        if not transfers:
            continue

        option = _best_option_by_projection(
            options, deployable, target.bank_key, today, end, compound, actual_leap_year
        )
        if option is None:
            continue
        interest = option.total_interest_on(
            deployable, today, compound, actual_leap_year
        )
        candidates.append({
            "type": "CONSOLIDATE",
            "target_account": target,
            "option": option,
            "transfers": transfers,
            "booking": {"account": target, "option": option, "principal": deployable},
            "carries": carries,
            "fees_today": fees_today,
            "gross_interest": interest,
            "net_interest": interest - fees_today,
        })

    # Candidate C: hold until the next scheduled event. Estimate the next-event
    # state using known incoming cash so the planner can value pooling.
    candidates.append({
        "type": "CARRY",
        "carries": active_accounts,
        "fees_today": 0.0,
        "gross_interest": 0.0,
        "net_interest": 0.0,
        "wait_until": next_event_date,
    })

    def projected_plan_value(plan: dict) -> float:
        value = 0.0
        deployed_ids: set[str] = set()
        if plan["type"] == "SPLIT":
            for booking in plan["bookings"]:
                acc = booking["account"]
                deployed_ids.add(acc.id)
                value += _project_option_terminal_value(
                    booking["principal"], booking["option"], today, end,
                    options, compound, actual_leap_year,
                )
        elif plan["type"] == "CONSOLIDATE":
            booking = plan["booking"]
            deployed_ids.update(t["src"].id for t in plan["transfers"])
            deployed_ids.add(plan["target_account"].id)
            value += _project_option_terminal_value(
                booking["principal"], booking["option"], today, end,
                options, compound, actual_leap_year,
            )

        # Existing cash not deployed today can pool with known incoming cash at
        # the next event. Future cash for accounts whose current balance is
        # deployed is projected separately, as it remains outside today's FD.
        if plan["type"] == "CARRY":
            # Value the wait action as a real future portfolio decision. At the
            # next event, cash from every account is available for local
            # investment or consolidation into any configured destination.
            # Previously this projected each account independently, which
            # systematically undervalued waiting when pooling crossed the
            # minimum investment threshold.
            future_cash = {
                acc.id: acc.balance + next_event_cash.get(acc.id, 0.0)
                for acc in all_accounts.values()
            }
            local_value = sum(
                project_cash(amount, all_accounts[account_id].bank_key, next_event_date)
                for account_id, amount in future_cash.items()
            )
            value = local_value

            for target in all_accounts.values():
                deployable = 0.0
                transfer_fees = 0.0
                feasible = True
                for source in all_accounts.values():
                    amount = future_cash.get(source.id, 0.0)
                    if amount <= 0.001:
                        continue
                    if source.id == target.id:
                        deployable += amount
                        continue
                    fee = fee_config.get_fee(source.bank_key, target.bank_key)
                    if amount <= fee:
                        # The balance cannot economically be transferred;
                        # retain it at source and value it independently.
                        continue
                    deployable += amount - fee
                    transfer_fees += fee

                consolidated_value = project_cash(
                    deployable, target.bank_key, next_event_date
                ) + sum(
                    project_cash(amount, all_accounts[account_id].bank_key, next_event_date)
                    for account_id, amount in future_cash.items()
                    if amount > 0.001
                    and account_id != target.id
                    and amount <= fee_config.get_fee(
                        all_accounts[account_id].bank_key, target.bank_key
                    )
                ) - transfer_fees
                value = max(value, consolidated_value)
        else:
            for acc in plan.get("carries", []):
                pooled = acc.balance + next_event_cash.get(acc.id, 0.0)
                value += project_cash(pooled, acc.bank_key, next_event_date)
            for account_id, amount in next_event_cash.items():
                if account_id in deployed_ids or all(
                    item.id != account_id for item in plan.get("carries", [])
                ):
                    account = all_accounts.get(account_id)
                    if account is not None and amount > 0.001:
                        value += project_cash(amount, account.bank_key, next_event_date)
        return value - plan["fees_today"]

    for candidate in candidates:
        candidate["projected_terminal_value"] = projected_plan_value(candidate)

    # Prefer projected terminal value; fees and immediate interest only break ties.
    return max(
        candidates,
        key=lambda plan: (
            plan["projected_terminal_value"],
            plan["net_interest"],
            -plan["fees_today"],
        ),
    )


class GAMLStrategy(AbsoluteStrategy):
    """
    Bounded global portfolio optimiser.

    GAML shares Absolute's exact portfolio transitions, event scheduling,
    transfer accounting, dominance pruning, memoisation and admissible-bound
    pruning, but imposes a deterministic decision budget. Branches are visited
    in descending immediate-value order, while the Greedy result is retained
    as a guaranteed feasible incumbent.

    This gives GAML a quality-vs-computation trade-off instead of the full
    exhaustive search performed by Absolute.
    """

    name: str = "GAML"

    def __init__(
        self,
        compound: bool = False,
        actual_leap_year: bool = True,
        max_decisions: int = 15_000,
    ):
        if max_decisions < 1:
            raise ValueError("max_decisions must be at least 1")
        super().__init__(
            compound=compound,
            actual_leap_year=actual_leap_year,
            max_decisions=max_decisions,
        )
