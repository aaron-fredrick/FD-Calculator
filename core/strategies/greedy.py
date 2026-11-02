from __future__ import annotations

from datetime import date
from typing import Optional

from core.cashflows import validate_outflow_schedule
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


def _pick_daily_greedy_plan(
    all_accounts: dict[str, Account],
    options: list[FDOption],
    today: date,
    end: date,
    fee_config: TransferFeeConfig,
    consolidation_account_id: str,
    compound: bool,
    actual_leap_year: bool,
) -> dict:
    """
    Global daily decision engine.
    Evaluates:
      1. Split / Local execution (each account with positive cash invests locally if possible).
      2. Consolidation to target account T (for each candidate T, pulling cash in from other accounts).
    Compares plans based on:
      - Highest annual rate.
      - Profitability after transfer fees (net interest > 0, and transfer fees covered).
      - Shortest tenure as tie-breaker for equal rates.
      - Lowest fees / highest net interest as tie-breaker for equal rate and tenure.
    """
    active_accounts = [a for a in all_accounts.values() if a.balance > 0.001]
    if not active_accounts:
        return {"type": "CARRY", "carries": []}

    consol_acc = all_accounts.get(consolidation_account_id)
    consol_bank = consol_acc.bank_key if consol_acc else ""

    # ── 1. Evaluate Split / Local Plan ───────────────────────────────
    split_bookings = []
    split_carries = []
    split_gross_interest = 0.0

    for acc in active_accounts:
        local_opts = [
            o for o in options
            if (not o.bank_key or o.bank_key == acc.bank_key) and acc.can_use_option(o) and o.can_invest(acc.balance, today, end)
        ]
        if local_opts:
            best_opt = local_opts[0]
            for opt in local_opts[1:]:
                if opt.annual_rate > best_opt.annual_rate:
                    best_opt = opt
                elif opt.annual_rate == best_opt.annual_rate and opt.days < best_opt.days:
                    best_opt = opt

            intr = best_opt.total_interest_on(acc.balance, today, compound, actual_leap_year)
            split_bookings.append({
                "account": acc,
                "option": best_opt,
                "principal": acc.balance,
                "interest": intr,
                "rate": best_opt.annual_rate,
                "days": best_opt.days,
            })
            split_gross_interest += intr
        else:
            split_carries.append(acc)

    plan_split: Optional[dict] = None
    if split_bookings:
        max_rate = max(b["rate"] for b in split_bookings)
        min_days = min(b["days"] for b in split_bookings)
        plan_split = {
            "type": "SPLIT",
            "bookings": split_bookings,
            "transfers": [],
            "carries": split_carries,
            "rate": max_rate,
            "days": min_days,
            "fees_today": 0.0,
            "fees_eval": 0.0,
            "gross_interest": split_gross_interest,
            "net_interest": split_gross_interest,
        }

    # ── 2. Evaluate Consolidation Plans for each target account ──────
    consol_plans: list[dict] = []

    for tgt_acc in all_accounts.values():
        tgt_bank = tgt_acc.bank_key
        transfers_to_tgt = []
        total_deployable = 0.0
        fees_today = 0.0
        fees_eval = 0.0
        carries = []

        for src_acc in all_accounts.values():
            if src_acc.balance <= 0.001:
                continue
            if src_acc.id == tgt_acc.id:
                total_deployable += src_acc.balance
            else:
                fee = fee_config.get_fee(src_acc.bank_key, tgt_bank)
                if src_acc.balance > fee:
                    net_amt = src_acc.balance - fee
                    total_deployable += net_amt
                    fees_today += fee

                    # Strategic decision evaluation fee:
                    # - If going OUT of CONSOLIDATION_ACCOUNT_ID: double the transfer fee
                    # - If going INTO CONSOLIDATION_ACCOUNT_ID: single transfer fee
                    if src_acc.id == consolidation_account_id:
                        eval_fee = 2.0 * fee
                    elif tgt_acc.id == consolidation_account_id:
                        eval_fee = 1.0 * fee
                    else:
                        eval_fee = 2.0 * fee
                    fees_eval += eval_fee

                    transfers_to_tgt.append({
                        "src": src_acc,
                        "tgt": tgt_acc,
                        "amount": src_acc.balance,
                        "fee": fee,
                        "net": net_amt,
                    })
                else:
                    carries.append(src_acc)

        if not transfers_to_tgt:
            continue

        tgt_opts = [
            o for o in options
            if (not o.bank_key or o.bank_key == tgt_bank) and tgt_acc.can_use_option(o) and o.can_invest(total_deployable, today, end)
        ]
        if not tgt_opts:
            continue

        best_tgt_opt = tgt_opts[0]
        for opt in tgt_opts[1:]:
            if opt.annual_rate > best_tgt_opt.annual_rate:
                best_tgt_opt = opt
            elif opt.annual_rate == best_tgt_opt.annual_rate and opt.days < best_tgt_opt.days:
                best_tgt_opt = opt

        gross_intr = best_tgt_opt.total_interest_on(total_deployable, today, compound, actual_leap_year)
        net_intr = gross_intr - fees_eval

        if net_intr <= 0.0:
            continue

        consol_plans.append({
            "type": "CONSOLIDATE",
            "target_account": tgt_acc,
            "option": best_tgt_opt,
            "transfers": transfers_to_tgt,
            "booking": {
                "account": tgt_acc,
                "option": best_tgt_opt,
                "principal": total_deployable,
            },
            "carries": carries,
            "rate": best_tgt_opt.annual_rate,
            "days": best_tgt_opt.days,
            "fees_today": fees_today,
            "fees_eval": fees_eval,
            "gross_interest": gross_intr,
            "net_interest": net_intr,
        })

    # ── 3. Filter and Select the Winning Plan ────────────────────────
    candidates: list[dict] = []
    if plan_split is not None:
        candidates.append(plan_split)

    for cp in consol_plans:
        if plan_split is not None:
            if cp["rate"] > plan_split["rate"]:
                if cp["net_interest"] > plan_split["net_interest"]:
                    candidates.append(cp)
            elif cp["rate"] == plan_split["rate"]:
                if cp["net_interest"] > plan_split["net_interest"] + 0.01:
                    candidates.append(cp)
        else:
            if cp["net_interest"] > 0:
                candidates.append(cp)

    if not candidates:
        return {"type": "CARRY", "carries": active_accounts}

    candidates.sort(
        key=lambda p: (
            p["rate"],
            -p["days"],
            p["net_interest"],
            -p["fees_today"],
        ),
        reverse=True,
    )
    return candidates[0]


class GreedyStrategy(BaseStrategy):
    """
    Event-driven greedy simulation supporting multi-bank accounts and transfer fees.
    """

    name: str = "Greedy"

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
        outflow_schedule: Optional[dict[date, list[dict]]] = None,
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
        outflow_schedule = outflow_schedule or {}
        accounts_map = {
            acc.id: Account(id=acc.id, bank_key=acc.bank_key,
                    bank_id=acc.bank_id, label=acc.label, balance=acc.balance, supports_efd=acc.supports_efd)
            for acc in accounts
        }
        validate_outflow_schedule(outflow_schedule, start, end, set(accounts_map))
        if inflow_account_id not in accounts_map:
            raise ValueError(
                f"inflow_account_id {inflow_account_id!r} not found in accounts: {list(accounts_map.keys())}"
            )

        timeline: dict[int, list[Event]] = {}
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

        # Seed cash-out events. They are processed after same-day incoming cash.
        for outflow_date, entries in sorted(outflow_schedule.items()):
            if outflow_date < start or outflow_date > end:
                raise ValueError(f"Outflow date {outflow_date} is outside the investment period")
            for entry in entries:
                account_id = str(entry.get("account_id", ""))
                if account_id not in accounts_map:
                    raise ValueError(f"Outflow destination account {account_id!r} is not configured")
                self._add_event(timeline, Event(
                    event_type=EventType.OUTFLOW,
                    on_date=outflow_date,
                    amount=float(entry["amount"]),
                    label=str(entry.get("name", "Outflow")),
                    account_id=account_id,
                    payment_policy=str(entry.get("payment_policy", "strict")),
                    bank_key=accounts_map[account_id].bank_key,
                ))

        pending_obligations: list[dict] = []
        total_outflows_paid = 0.0
        strict_payment_failed = False

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

            # b) Process due payments and outstanding obligations before investing.
            # New inflows and FD cash flows above are available for same-day payments.
            due = [e for e in day_events if e.event_type == EventType.OUTFLOW]
            for event in due:
                pending_obligations.append({
                    "name": event.label,
                    "account_id": event.account_id,
                    "remaining": event.amount,
                    "payment_policy": event.payment_policy or "strict",
                    "due_date": today,
                })

            still_pending = []
            for obligation in sorted(
                pending_obligations,
                key=lambda item: (
                    {"strict": 0, "defer": 1, "best_effort": 2}.get(item["payment_policy"], 3),
                    item["due_date"],
                ),
            ):
                account = accounts_map[obligation["account_id"]]
                required = float(obligation["remaining"])
                policy = obligation["payment_policy"]
                if policy == "strict":
                    if account.balance + 0.001 < required:
                        strict_payment_failed = True
                        still_pending.append(obligation)
                        continue
                    paid = required
                elif policy == "defer":
                    if account.balance + 0.001 < required:
                        still_pending.append(obligation)
                        continue
                    paid = required
                else:  # best_effort
                    paid = min(account.balance, required)
                    if paid + 0.001 < required:
                        obligation = {**obligation, "remaining": round(required - paid, 2)}
                        still_pending.append(obligation)
                if paid > 0.001:
                    account.balance = round(account.balance - paid, 2)
                    total_outflows_paid += paid
                    self._add_event(timeline, Event(
                        event_type=EventType.OUTFLOW,
                        on_date=today,
                        amount=-paid,
                        label=f"Paid {obligation['name']} ({policy})",
                        account_id=account.id,
                        bank_key=account.bank_key,
                    bank_id=account.bank_id,
                        balance_after=account.balance,
                        total_balance_after=sum(a.balance for a in accounts_map.values()),
                    ))
            pending_obligations = still_pending

            if strict_payment_failed:
                # A strict payment failure invalidates this greedy path.
                break

            # b) Make decisions for accounts holding liquid cash
            plan = _pick_daily_greedy_plan(
                all_accounts=accounts_map,
                options=options,
                today=today,
                end=end,
                fee_config=fee_config,
                consolidation_account_id=consolidation_account_id,
                compound=self.compound,
                actual_leap_year=self.actual_leap_year,
            )

            if plan["type"] == "CONSOLIDATE":
                tgt_acc: Account = plan["target_account"]
                chosen_opt: FDOption = plan["option"]
                decision_balances_before = {aid: account.balance for aid, account in accounts_map.items()}

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
                    bank_id=src.bank_id,
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
                    bank_id=tgt.bank_id,
                            fee=0.0,
                            balance_after=tgt.balance,
                            total_balance_after=sum(a.balance for a in accounts_map.values()),
                        ),
                    )                principal = tgt_acc.balance
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
                    bank_id=tgt_acc.bank_id,
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
                    bank_id=tgt_acc.bank_id,
                    balance_after=tgt_acc.balance,
                    total_balance_after=sum(a.balance for a in accounts_map.values()),
                    decision_context={"action": "consolidate", "balances_before": decision_balances_before},
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
                    bank_id=tgt_acc.bank_id,
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
                    bank_id=acc.bank_id,
                                balance_after=acc.balance,
                                total_balance_after=sum(a.balance for a in accounts_map.values()),
                            ),
                        )

            elif plan["type"] == "SPLIT":
                for b_info in plan["bookings"]:
                    acc: Account = b_info["account"]
                    chosen_opt: FDOption = b_info["option"]
                    decision_balances_before = {aid: account.balance for aid, account in accounts_map.items()}
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
                    bank_id=acc.bank_id,
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
                    bank_id=acc.bank_id,
                        balance_after=acc.balance,
                        total_balance_after=sum(a.balance for a in accounts_map.values()),
                        decision_context={"action": "split", "balances_before": decision_balances_before},
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
                    bank_id=acc.bank_id,
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
                    bank_id=acc.bank_id,
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
                    bank_id=acc.bank_id,
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
                    bank_id=acc.bank_id,
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
                    bank_id=consol_acc.bank_id,
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
                    bank_id=acc.bank_id,
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
            total_outflows_paid=total_outflows_paid,
            outstanding_outflows=pending_obligations,
            valid=not strict_payment_failed,
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

