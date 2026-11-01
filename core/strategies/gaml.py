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
            for acc in all_accounts.values():
                pooled = acc.balance + next_event_cash.get(acc.id, 0.0)
                value += project_cash(pooled, acc.bank_key, next_event_date)
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


class GAMLStrategy(BaseStrategy):
    """
    Event-driven greedy simulation supporting multi-bank accounts and transfer fees.
    """

    name: str = "GAML"

    def __init__(self, compound: bool = False, actual_leap_year: bool = True):
        self.compound = compound
        self.actual_leap_year = actual_leap_year

    def simulate(
        self,
        options: list[FDOption],
        start: date,
        end: date,
        inflow_schedule: dict[date, float] | dict[date, dict[str, float]],
        accounts: Optional[list[Account]] = None,
        inflow_account_id: Optional[str] = None,
        fee_config: Optional[TransferFeeConfig] = None,
        consolidation_account_id: Optional[str] = None,
    ) -> SimResult:
        # Default accounts and configuration
        if not accounts:
            default_bank = options[0].bank_key if options and options[0].bank_key else "commercial"
            accounts = [Account(id="default", bank_key=default_bank, label="Main Account")]

        if not inflow_account_id:
            inflow_account_id = accounts[0].id

        if fee_config is None:
            fee_config = TransferFeeConfig()

        if consolidation_account_id is None:
            consolidation_account_id = inflow_account_id

        inflow_schedule = normalize_inflow_schedule(inflow_schedule, inflow_account_id)
        accounts_map = {
            acc.id: Account(id=acc.id, bank_key=acc.bank_key, label=acc.label, balance=acc.balance)
            for acc in accounts
        }
        if inflow_account_id not in accounts_map:
            raise ValueError(
                f"inflow_account_id {inflow_account_id!r} not found in accounts: {list(accounts_map.keys())}"
            )

        timeline: dict[int, list[Event]] = {}
        # Ensure idle cash is revisited at the horizon even when no inflow or
        # maturity happens on the final date.
        self._add_event(
            timeline,
            Event(
                event_type=EventType.INFLOW,
                on_date=end,
                amount=0.0,
                label="Investment horizon trigger",
                account_id=inflow_account_id,
                bank_key=accounts_map[inflow_account_id].bank_key,
            ),
        )
        bookings: list[Booking] = []
        booking_counter = 0
        total_transfer_fees: float = 0.0

        # ── Step 1: seed inflow events to the designated account ──────────
        inflow_num = 0
        for inflow_date, account_amounts in sorted(inflow_schedule.items()):
            if inflow_date > end:
                continue
            for account_id, amount in sorted(account_amounts.items()):
                if account_id not in accounts_map:
                    raise ValueError(f"Inflow destination account {account_id!r} is not configured")
                inflow_num += 1
                self._add_event(
                    timeline,
                    Event(
                        event_type=EventType.INFLOW,
                        on_date=inflow_date,
                        amount=amount,
                        label=f"Inflow {inflow_num:02d}",
                        account_id=account_id,
                        bank_key=accounts_map[account_id].bank_key,
                    ),
                )

        # ── Step 1b: ensure start date is processed if any account has an
        #            opening balance (seed a zero-amount marker so the greedy
        #            decision loop runs on day 1 for those funds) ───────────
        start_key = _date_key(start)
        if start_key not in timeline and any(
            acc.balance > 0.001 for acc in accounts_map.values()
        ):
            self._add_event(
                timeline,
                Event(
                    event_type=EventType.INFLOW,
                    on_date=start,
                    amount=0.0,
                    label="Opening balance trigger",
                    account_id=inflow_account_id,
                    bank_key=accounts_map[inflow_account_id].bank_key,
                ),
            )

        # ── Step 2: walk timeline dynamically ────────────────────────────
        processed: set[int] = set()

        while True:
            remaining = [k for k in timeline if k not in processed]
            if not remaining:
                break
            key = min(remaining)
            processed.add(key)

            today = self._key_to_date(key)
            day_events = timeline[key]

            # a) Process all incoming cash (INFLOW, CASH_FLOW, MATURITY) for today
            for e in day_events:
                if e.event_type in (EventType.INFLOW, EventType.CASH_FLOW, EventType.MATURITY):
                    target_id = e.account_id if e.account_id in accounts_map else inflow_account_id
                    target_acc = accounts_map[target_id]
                    target_acc.balance += e.amount
                    e.account_id = target_acc.id
                    e.bank_key = target_acc.bank_key
                    e.balance_after = target_acc.balance
                    e.total_balance_after = sum(a.balance for a in accounts_map.values())

            # b) Make decisions for accounts holding liquid cash
            future_keys = [future_key for future_key in timeline if future_key > key]
            next_event_key = min(future_keys) if future_keys else _date_key(end)
            next_event_date = self._key_to_date(next_event_key)
            next_event_cash: dict[str, float] = {}
            for future_event in timeline.get(next_event_key, []):
                if future_event.event_type in (EventType.INFLOW, EventType.CASH_FLOW, EventType.MATURITY):
                    account_id = future_event.account_id if future_event.account_id in accounts_map else inflow_account_id
                    next_event_cash[account_id] = next_event_cash.get(account_id, 0.0) + future_event.amount

            plan = _pick_daily_gaml_plan(
                all_accounts=accounts_map,
                options=options,
                today=today,
                end=end,
                fee_config=fee_config,
                consolidation_account_id=consolidation_account_id,
                compound=self.compound,
                actual_leap_year=self.actual_leap_year,
                next_event_date=next_event_date,
                next_event_cash=next_event_cash,
            )

            if plan["type"] == "CONSOLIDATE":
                tgt_acc: Account = plan["target_account"]
                chosen_opt: FDOption = plan["option"]

                for t in plan["transfers"]:
                    src: Account = t["src"]
                    tgt: Account = t["tgt"]
                    fee: float = t["fee"]
                    net_amt: float = t["net"]
                    src_cash = t["amount"]

                    total_transfer_fees += fee
                    src.balance = 0.0

                    self._add_event(
                        timeline,
                        Event(
                            event_type=EventType.TRANSFER,
                            on_date=today,
                            amount=src_cash,
                            label=f"Transfer to {tgt.label} (Amt: {net_amt:,.2f}, Fee: {fee:,.2f})",
                            account_id=src.id,
                            bank_key=src.bank_key,
                            fee=fee,
                            balance_after=src.balance,
                            total_balance_after=sum(a.balance for a in accounts_map.values()),
                        ),
                    )

                    tgt.balance += net_amt
                    self._add_event(
                        timeline,
                        Event(
                            event_type=EventType.TRANSFER,
                            on_date=today,
                            amount=net_amt,
                            label=f"Transfer received from {src.label}",
                            account_id=tgt.id,
                            bank_key=tgt.bank_key,
                            fee=0.0,
                            balance_after=tgt.balance,
                            total_balance_after=sum(a.balance for a in accounts_map.values()),
                        ),
                    )

                principal = tgt_acc.balance
                tgt_acc.balance = 0.0

                booking_counter += 1
                ref = f"FD-{booking_counter:04d}"

                flows = chosen_opt.generate_cash_flows(
                    principal=principal,
                    start=today,
                    compound=self.compound,
                    actual_leap_year=self.actual_leap_year,
                )
                booking = Booking(
                    option=chosen_opt,
                    principal=principal,
                    start=today,
                    cash_flows=flows,
                    account_id=tgt_acc.id,
                    bank_key=tgt_acc.bank_key,
                )
                bookings.append(booking)

                book_event = Event(
                    event_type=EventType.BOOKING,
                    on_date=today,
                    amount=principal,
                    label=f"Book {chosen_opt.label} @ {chosen_opt.annual_rate:.2f}% -> matures {booking.end}",
                    booking_ref=ref,
                    account_id=tgt_acc.id,
                    bank_key=tgt_acc.bank_key,
                    balance_after=tgt_acc.balance,
                    total_balance_after=sum(a.balance for a in accounts_map.values()),
                )
                self._add_event(timeline, book_event)

                mat_date = booking.end
                is_cumulative = chosen_opt.payout_type == "cumulative"
                for flow_date, flow_amt in flows:
                    ev_type = EventType.MATURITY if (
                        flow_date == mat_date and (is_cumulative or flow_date == flows[-1][0])
                    ) else EventType.CASH_FLOW
                    flow_label = (
                        f"Maturity [{ref}]  ({chosen_opt.label})"
                        if ev_type == EventType.MATURITY
                        else f"Cash flow [{ref}]  ({chosen_opt.label})"
                    )
                    self._add_event(
                        timeline,
                        Event(
                            event_type=ev_type,
                            on_date=flow_date,
                            amount=flow_amt,
                            label=flow_label,
                            booking_ref=ref,
                            account_id=tgt_acc.id,
                            bank_key=tgt_acc.bank_key,
                        ),
                    )

                for acc in plan.get("carries", []):
                    if acc.balance > 0.001:
                        self._add_event(
                            timeline,
                            Event(
                                event_type=EventType.CARRY_FORWARD,
                                on_date=today,
                                amount=acc.balance,
                                label=f"Below min / no option fits; balance {acc.balance:,.2f} carries forward",
                                account_id=acc.id,
                                bank_key=acc.bank_key,
                                balance_after=acc.balance,
                                total_balance_after=sum(a.balance for a in accounts_map.values()),
                            ),
                        )

            elif plan["type"] == "SPLIT":
                for b_info in plan["bookings"]:
                    acc: Account = b_info["account"]
                    chosen_opt: FDOption = b_info["option"]
                    principal = acc.balance
                    acc.balance = 0.0

                    booking_counter += 1
                    ref = f"FD-{booking_counter:04d}"

                    flows = chosen_opt.generate_cash_flows(
                        principal=principal,
                        start=today,
                        compound=self.compound,
                        actual_leap_year=self.actual_leap_year,
                    )
                    booking = Booking(
                        option=chosen_opt,
                        principal=principal,
                        start=today,
                        cash_flows=flows,
                        account_id=acc.id,
                        bank_key=acc.bank_key,
                    )
                    bookings.append(booking)

                    book_event = Event(
                        event_type=EventType.BOOKING,
                        on_date=today,
                        amount=principal,
                        label=f"Book {chosen_opt.label} @ {chosen_opt.annual_rate:.2f}% -> matures {booking.end}",
                        booking_ref=ref,
                        account_id=acc.id,
                        bank_key=acc.bank_key,
                        balance_after=acc.balance,
                        total_balance_after=sum(a.balance for a in accounts_map.values()),
                    )
                    self._add_event(timeline, book_event)

                    mat_date = booking.end
                    is_cumulative = chosen_opt.payout_type == "cumulative"
                    for flow_date, flow_amt in flows:
                        ev_type = EventType.MATURITY if (
                            flow_date == mat_date and (is_cumulative or flow_date == flows[-1][0])
                        ) else EventType.CASH_FLOW
                        flow_label = (
                            f"Maturity [{ref}]  ({chosen_opt.label})"
                            if ev_type == EventType.MATURITY
                            else f"Cash flow [{ref}]  ({chosen_opt.label})"
                        )
                        self._add_event(
                            timeline,
                            Event(
                                event_type=ev_type,
                                on_date=flow_date,
                                amount=flow_amt,
                                label=flow_label,
                                booking_ref=ref,
                                account_id=acc.id,
                                bank_key=acc.bank_key,
                            ),
                        )

                for acc in plan.get("carries", []):
                    if acc.balance > 0.001:
                        self._add_event(
                            timeline,
                            Event(
                                event_type=EventType.CARRY_FORWARD,
                                on_date=today,
                                amount=acc.balance,
                                label=f"Below min / no option fits; balance {acc.balance:,.2f} carries forward",
                                account_id=acc.id,
                                bank_key=acc.bank_key,
                                balance_after=acc.balance,
                                total_balance_after=sum(a.balance for a in accounts_map.values()),
                            ),
                        )

            elif plan["type"] == "CARRY":
                for acc in plan.get("carries", []):
                    if acc.balance > 0.001:
                        self._add_event(
                            timeline,
                            Event(
                                event_type=EventType.CARRY_FORWARD,
                                on_date=today,
                                amount=acc.balance,
                                label=f"Below min / no option fits; balance {acc.balance:,.2f} carries forward",
                                account_id=acc.id,
                                bank_key=acc.bank_key,
                                balance_after=acc.balance,
                                total_balance_after=sum(a.balance for a in accounts_map.values()),
                            ),
                        )

        # ── Step 3: consolidate all balances into the consolidation account ──
        if consolidation_account_id in accounts_map:
            consol_acc = accounts_map[consolidation_account_id]
            for acc in list(accounts_map.values()):
                if acc.id == consolidation_account_id or acc.balance <= 0.001:
                    continue
                fee = fee_config.get_fee(acc.bank_key, consol_acc.bank_key)
                if acc.balance <= fee:
                    continue  # too small to sweep; will appear as IDLE below
                src_balance = acc.balance
                cash_to_sweep = src_balance - fee
                total_transfer_fees += fee
                acc.balance = 0.0
                self._add_event(
                    timeline,
                    Event(
                        event_type=EventType.TRANSFER,
                        on_date=end,
                        amount=src_balance,
                        label=f"Final sweep to {consol_acc.label} (Amt: {cash_to_sweep:,.2f}, Fee: {fee:,.2f})",
                        account_id=acc.id,
                        bank_key=acc.bank_key,
                        fee=fee,
                        balance_after=0.0,
                        total_balance_after=sum(a.balance for a in accounts_map.values()),
                    ),
                )
                consol_acc.balance += cash_to_sweep
                self._add_event(
                    timeline,
                    Event(
                        event_type=EventType.TRANSFER,
                        on_date=end,
                        amount=cash_to_sweep,
                        label=f"Final sweep received from {acc.label}",
                        account_id=consol_acc.id,
                        bank_key=consol_acc.bank_key,
                        fee=0.0,
                        balance_after=consol_acc.balance,
                        total_balance_after=sum(a.balance for a in accounts_map.values()),
                    ),
                )

        # ── Step 4: residual cash at end of horizon ───────────────────────
        for acc in accounts_map.values():
            if acc.balance > 0.01:
                self._add_event(
                    timeline,
                    Event(
                        event_type=EventType.IDLE,
                        on_date=end,
                        amount=acc.balance,
                        label=f"Final cash balance in {acc.label}",
                        account_id=acc.id,
                        bank_key=acc.bank_key,
                        balance_after=acc.balance,
                        total_balance_after=sum(a.balance for a in accounts_map.values()),
                    ),
                )

        total_principal = sum(amount for account_amounts in inflow_schedule.values() for amount in account_amounts.values()) + sum(a.balance for a in accounts)

        return SimResult(
            strategy_name=self.name,
            timeline=timeline,
            bookings=bookings,
            total_principal=total_principal,
            end_date=end,
            accounts=accounts_map,
            total_transfer_fees=total_transfer_fees,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _add_event(timeline: dict[int, list[Event]], event: Event) -> None:
        key = event.date_key
        if key not in timeline:
            timeline[key] = []
        timeline[key].append(event)

    @staticmethod
    def _key_to_date(key: int) -> date:
        s = str(key)
        return date(int(s[:4]), int(s[4:6]), int(s[6:8]))

