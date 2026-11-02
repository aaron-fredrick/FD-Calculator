from __future__ import annotations

import bisect
import math
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Optional

from core.cashflows import Obligations, process_outflows, validate_outflow_schedule
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

# ---------------------------------------------------------------------------
# Immutable state types
# ---------------------------------------------------------------------------
#
# BalanceTuple  : ((account_id, rounded_balance), ...)  sorted by account_id
# FlowEntry     : (account_id, rounded_amount)
# DayFlows      : (date, (FlowEntry, ...))  sorted FlowEntries by account_id
# FlowsTuple    : (DayFlows, ...)           sorted by date
#
# Using immutable tuples means:
#   - No dict copy needed per branch; building a new tuple is O(n_accounts)
#   - The memo key IS the state arguments — no extra hashing pass
#   - Substructure is shared between states (Python interns equal tuples)
# ---------------------------------------------------------------------------

BalanceTuple = tuple[tuple[str, float], ...]
FlowEntry    = tuple[str, float]
DayFlows     = tuple[date, tuple[FlowEntry, ...]]
FlowsTuple   = tuple[DayFlows, ...]


# ---------------------------------------------------------------------------
# Immutable state helpers
# ---------------------------------------------------------------------------

def _round2(x: float) -> float:
    return round(x, 2)


def _make_balances(d: dict[str, float]) -> BalanceTuple:
    return tuple(sorted((k, _round2(v)) for k, v in d.items()))


def _bal_set(b: BalanceTuple, aid: str, val: float) -> BalanceTuple:
    """Return a new BalanceTuple with account *aid* set to *val*."""
    rounded = _round2(val)
    return tuple((k, rounded if k == aid else v) for k, v in b)


def _bal_add(b: BalanceTuple, aid: str, delta: float) -> BalanceTuple:
    """Return a new BalanceTuple with *delta* added to account *aid*."""
    return tuple((k, _round2(v + delta) if k == aid else v) for k, v in b)


def _flows_merge(f: FlowsTuple, new_flows: list[tuple[date, str, float]]) -> FlowsTuple:
    """
    Merge a list of (date, account_id, amount) into the existing FlowsTuple.
    Maintains sorted-by-date order and sorted-by-account_id within each date.
    O(len(f) + len(new_flows)) for the merge + small constant for per-date grouping.
    """
    if not new_flows:
        return f

    # Group new flows by date
    additions: dict[date, dict[str, float]] = {}
    for dt, aid, amt in new_flows:
        additions.setdefault(dt, {}).setdefault(aid, 0.0)
        additions[dt][aid] += amt

    # Merge sorted
    existing: dict[date, dict[str, float]] = {}
    for dt, flows in f:
        existing[dt] = dict(flows)

    for dt, adds in additions.items():
        if dt in existing:
            for aid, amt in adds.items():
                existing[dt][aid] = existing[dt].get(aid, 0.0) + amt
        else:
            existing[dt] = adds

    return tuple(
        sorted(
            (dt, tuple(sorted((aid, _round2(amt)) for aid, amt in flows.items())))
            for dt, flows in existing.items()
        )
    )


# ---------------------------------------------------------------------------
# Option dominance pruning
# ---------------------------------------------------------------------------

def _prune_dominated_options(options: list[FDOption], compound: bool) -> list[FDOption]:
    """
    Filter out strictly dominated options within each bank.

    Option A strictly dominates Option B in the same bank iff:
      - A.days <= B.days
      - A.annual_rate >= B.annual_rate
      - A.min_amount <= B.min_amount
      - At least one inequality is strict (shorter days, higher rate, or lower min_amount)
      - Payout type and payout interval must match exactly; cash-flow timing is material.
    """
    res: list[FDOption] = []
    by_bank: dict[tuple[str, bool], list[FDOption]] = {}
    for o in options:
        by_bank.setdefault((o.bank_identity, o.is_efd), []).append(o)

    for (bkey, is_efd), bopts in by_bank.items():
        for cand in bopts:
            dom = False
            for other in bopts:
                if other is cand:
                    continue
                # Only compare products with identical payout mechanics.
                # Earlier/interim payouts change liquidity and can be required to
                # satisfy scheduled outflows; a cumulative product cannot safely
                # dominate a periodic or installment product (or vice versa).
                same_cashflow_shape = (
                    other.payout_type == cand.payout_type
                    and other.payout_period_str == cand.payout_period_str
                )
                if (
                    same_cashflow_shape
                    and other.days <= cand.days
                    and other.annual_rate >= cand.annual_rate
                    and other.min_amount <= cand.min_amount
                ):
                    if (
                        other.annual_rate > cand.annual_rate
                        or other.days < cand.days
                        or other.min_amount < cand.min_amount
                    ):
                        dom = True
                        break
            if not dom:
                res.append(cand)
    return res


# ---------------------------------------------------------------------------
# Action types and Tree Data Structure (zero-copy path recording)
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class ConsolidateAction:
    target_id: str
    option: FDOption
    transfers: list[dict[str, Any]]
    principal: float
    carries: list[str]


@dataclass(slots=True)
class LocalBookingsAction:
    bookings: list[dict[str, Any]]
    carries: list[str]


@dataclass(slots=True)
class CarryAction:
    carries: list[str]


DailyAction = ConsolidateAction | LocalBookingsAction | CarryAction


@dataclass(slots=True)
class SearchTreeNode:
    """
    Branch-and-bound search tree node.
    Enables O(1) path expansion without copying action lists across branches.
    """
    parent: Optional[SearchTreeNode]
    action: Optional[DailyAction]
    today: date
    # First decision on this path; used to reserve beam capacity across
    # materially different investment plans.
    root_signature: Optional[tuple] = None

    def get_path(self) -> list[tuple[date, DailyAction]]:
        path: list[tuple[date, DailyAction]] = []
        curr: Optional[SearchTreeNode] = self
        while curr is not None and curr.action is not None:
            path.append((curr.today, curr.action))
            curr = curr.parent
        path.reverse()
        return path


# ---------------------------------------------------------------------------
# GAMLStrategy
# ---------------------------------------------------------------------------

class GAMLStrategy(BaseStrategy):
    """
    Bounded-width global portfolio optimiser using best-first beam search.

    Retains at most ``beam_width`` frontier states, so the search does not materialise
    the exponentially growing full decision tree. Per-state action generation is
    bounded by ``max_local_branches`` for local booking combinations. The optional
    ``max_decisions`` is an additional hard expansion cap and is disabled by default.

    Evaluates promising decision branches across accounts and eligible FD options
    at event dates, exploring:
      - Consolidating funds into any bank account and booking any available option.
      - Split / independent bookings across multiple accounts.
      - Carrying cash forward without investing (holding liquidity for future opportunities).

    Optimizations:
      - Tree-structured search nodes (zero list copies during exploration).
      - Greedy lower-bounding: Initializes search with the concrete Greedy solution.
      - Admissible upper-bound pruning: Prunes branches that mathematically cannot beat the best known value.
      - Dominance pruning on options.
      - Fixed-width best-first frontier: Prioritises states by optimistic terminal value.
      - Decision tallying: Reports expanded states and all pruning categories.
    """

    name: str = "GAML"

    def __init__(
        self,
        compound: bool = False,
        actual_leap_year: bool = True,
        max_decisions: Optional[int] = None,
        max_local_branches: int = 128,
        beam_width: int = 256,
    ):
        if max_decisions is not None and max_decisions < 1:
            raise ValueError("max_decisions must be at least 1 when configured")
        if max_local_branches < 1:
            raise ValueError("max_local_branches must be at least 1")
        self.compound = compound
        self.actual_leap_year = actual_leap_year
        self.max_decisions = max_decisions
        self.max_local_branches = max_local_branches
        if beam_width < 1:
            raise ValueError("beam_width must be at least 1")
        self.beam_width = beam_width

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
        import time
        from core.strategies.greedy import GreedyStrategy

        if not accounts:
            default_bank = options[0].bank_identity if options and options[0].bank_identity else "commercial"
            accounts = [Account(id="default", bank_key=default_bank, bank_id=default_bank, label="Main Account")]

        if not inflow_account_id:
            inflow_account_id = accounts[0].id

        if fee_config is None:
            fee_config = TransferFeeConfig()

        if consolidation_account_id is None:
            consolidation_account_id = inflow_account_id

        inflow_schedule = normalize_inflow_schedule(inflow_schedule, inflow_account_id)
        outflow_schedule = outflow_schedule or {}
        accounts_meta: dict[str, Account] = {
            acc.id: Account(id=acc.id, bank_key=acc.bank_key,
                    bank_id=acc.bank_id, label=acc.label, balance=acc.balance, supports_efd=acc.supports_efd)
            for acc in accounts
        }
        validate_outflow_schedule(outflow_schedule, start, end, set(accounts_meta))
        consol_acc_id = consolidation_account_id
        consol_bank   = accounts_meta[consol_acc_id].bank_identity

        effective_options = _prune_dominated_options(options, self.compound)
        options_by_account: dict[str, tuple[FDOption, ...]] = {
            aid: tuple(
                opt for opt in effective_options
                if (not opt.bank_identity or opt.bank_identity == account.bank_identity)
                and account.can_use_option(opt)
            )
            for aid, account in accounts_meta.items()
        }

        # 1. Obtain Greedy lower bound
        greedy = GreedyStrategy(compound=self.compound, actual_leap_year=self.actual_leap_year)
        greedy_res = greedy.simulate(
            options=options,
            start=start,
            end=end,
            inflow_schedule=inflow_schedule,
            accounts=accounts,
            inflow_account_id=inflow_account_id,
            fee_config=fee_config,
            consolidation_account_id=consolidation_account_id,
            outflow_schedule=outflow_schedule,
        )
        greedy_liabilities = sum(float(item.get("remaining", 0.0)) for item in greedy_res.outstanding_outflows)
        greedy_objective = greedy_res.final_value - greedy_liabilities
        best_final_val: float = greedy_objective if greedy_res.valid else float("-inf")
        initial_greedy_final: float = greedy_objective

        # Maximum possible annualized interest rate achievable within the remaining horizon
        fitting_rates = [o.annual_rate for o in effective_options if o.fits_before(start, end)]
        max_rate: float = (max(fitting_rates, default=11.0)) / 100.0

        fixed_inflows: dict[date, dict[str, float]] = {d: amounts for d, amounts in inflow_schedule.items() if d <= end}
        sorted_inflow_dates: list[date] = sorted(fixed_inflows)
        fixed_outflows = {d: entries for d, entries in outflow_schedule.items() if d <= end}
        sorted_outflow_dates: list[date] = sorted(fixed_outflows)

        # Cash-flow generation cache
        _flow_cache: dict[tuple, list[tuple[date, float]]] = {}

        def _get_flows(opt: FDOption, booking_start: date, principal: float) -> list[tuple[date, float]]:
            key = (opt.label, opt.bank_identity, booking_start, _round2(principal))
            cached = _flow_cache.get(key)
            if cached is not None:
                return cached
            result = opt.generate_cash_flows(
                principal=principal,
                start=booking_start,
                compound=self.compound,
                actual_leap_year=self.actual_leap_year,
            )
            _flow_cache[key] = result
            return result

        def _next_event_date(today: date, flows: FlowsTuple) -> date:
            idx = bisect.bisect_right(sorted_inflow_dates, today)
            candidates: list[date] = [end]
            if idx < len(sorted_inflow_dates):
                candidates.append(sorted_inflow_dates[idx])
            out_idx = bisect.bisect_right(sorted_outflow_dates, today)
            if out_idx < len(sorted_outflow_dates):
                candidates.append(sorted_outflow_dates[out_idx])
            if flows:
                first_future = next((dt for dt, _ in flows if dt > today), None)
                if first_future is not None and first_future <= end:
                    candidates.append(first_future)
            return min(candidates)

        def calc_upper_bound(today: date, bal: BalanceTuple, active_pf: FlowsTuple, obligations: Obligations, paid_outflows: float) -> float:
            # Assume every available rupee can continuously reinvest at the
            # highest eligible annual rate, with no minimums, fees or idle gaps.
            # exp(r * t) is a conservative envelope for repeated simple-interest
            # reinvestments and compound products, unlike the old linear estimate
            # which could underestimate multi-rollover growth and prune a winner.
            rate = max(0.0, max_rate)
            terminal_bound = sum(
                amount * math.exp(rate * max(0, (end - today).days) / 365.0)
                for _, amount in bal
            )

            for dt, entries in active_pf:
                if dt <= end:
                    amount = sum(value for _, value in entries)
                    terminal_bound += amount * math.exp(
                        rate * max(0, (end - dt).days) / 365.0
                    )

            for dt, amounts in fixed_inflows.items():
                if today < dt <= end:
                    amount = sum(amounts.values())
                    terminal_bound += amount * math.exp(
                        rate * max(0, (end - dt).days) / 365.0
                    )

            liability = sum(item[2] for item in obligations)
            return terminal_bound + paid_outflows - liability

        total_capital = sum(amount for amounts in inflow_schedule.values() for amount in amounts.values()) + sum(a.balance for a in accounts)
        best_leaf: Optional[SearchTreeNode] = None
        tally: int = 0
        leaf_count: int = 0
        pruned_count: int = 0
        local_combination_pruned_count: int = 0
        memo_visited: dict[tuple, float] = {}
        alternative_leaf_net_interests: list[float] = []
        account_rate_cache: dict[tuple[str, date], float] = {}
        root_strategy_peak = 0

        def _best_account_rate(account_id: str, on_date: date) -> float:
            key = (account_id, on_date)
            cached = account_rate_cache.get(key)
            if cached is not None:
                return cached
            rate = max(
                (
                    opt.annual_rate
                    for opt in options_by_account[account_id]
                    if opt.fits_before(on_date, end)
                ),
                default=0.0,
            )
            account_rate_cache[key] = rate
            return rate

        state_cap_label = f"{self.max_decisions:,}" if self.max_decisions is not None else "unlimited"
        print(
            f"  [{self.name} Strategy] Initializing layered beam search | "
            f"Greedy baseline: {greedy_res.net_interest:,.2f} LKR | "
            f"beam width: {self.beam_width} | "
            f"local combination width: {self.max_local_branches} | "
            f"state cap: {state_cap_label}"
        )

        def expand(state: tuple) -> list[tuple]:
            nonlocal best_final_val, best_leaf, tally, leaf_count, pruned_count, local_combination_pruned_count
            today, balances, pending_flows, obligations, paid_outflows, parent_node = state
            children: list[tuple] = []

            # 1. Apply today's inflows
            bal = balances
            inflow_today = fixed_inflows.get(today, {})
            for account_id, amount in inflow_today.items():
                if account_id not in accounts_meta:
                    raise ValueError(f"Inflow destination account {account_id!r} is not configured")
                bal = _bal_add(bal, account_id, amount)

            # 2. Apply pending flows arriving today
            pf_future_start = 0
            for i, (dt, day_entries) in enumerate(pending_flows):
                if dt < today:
                    pf_future_start = i + 1
                    continue
                if dt == today:
                    for aid, amt in day_entries:
                        bal = _bal_add(bal, aid, amt)
                    pf_future_start = i + 1
                else:
                    break
            active_pf = pending_flows[pf_future_start:]

            bal, active_obligations, paid_today, payments_valid = process_outflows(
                today, bal, obligations, fixed_outflows.get(today, [])
            )
            if not payments_valid:
                return children
            paid_total = round(paid_outflows + paid_today, 2)

            # 3. Base case (today >= end) - Leaf node reached
            if today >= end:
                leaf_count += 1
                final_bal = dict(bal)
                for aid, b in bal:
                    if aid == consol_acc_id or b <= 0.001:
                        continue
                    fee = fee_config.get_fee(accounts_meta[aid].bank_identity, consol_bank)
                    if b > fee:
                        final_bal[consol_acc_id] += (b - fee)
                        final_bal[aid] = 0.0
                terminal_val = (
                    final_bal.get(consol_acc_id, 0.0) + paid_total
                    - sum(item[2] for item in active_obligations)
                )
                net_intr = terminal_val - total_capital

                if terminal_val > best_final_val:
                    best_final_val = terminal_val
                    best_leaf = parent_node
                    delta = best_final_val - initial_greedy_final
                    delta_str = f"+{delta:,.2f}" if delta >= 0 else f"{delta:,.2f}"
                    print(f"  [Leaf #{leaf_count:,} | Decision #{tally:,}] [NEW BEST] Net Interest = {net_intr:,.2f} LKR ({delta_str} vs Greedy)")
                else:
                    # Defer alternative reporting until the search has finished.
                    alternative_leaf_net_interests.append(net_intr)
                    alternative_leaf_net_interests.sort(reverse=True)
                    del alternative_leaf_net_interests[10:]
                return children
            # 4. Upper bound pruning
            ub = calc_upper_bound(today, bal, active_pf, active_obligations, paid_total)
            if ub <= best_final_val + 0.001:
                pruned_count += 1
                return children
            # 5. Transposition check
            state_key = (today, bal, active_pf, active_obligations, paid_total)
            if state_key in memo_visited and memo_visited[state_key] >= ub:
                return children
            memo_visited[state_key] = ub

            next_date_default = _next_event_date(today, active_pf)
            active_accs = [aid for aid, b in bal if b > 0.001]
            if not active_accs:
                children.append((next_date_default, bal, active_pf, active_obligations, paid_total, parent_node))
                return children

            bal_dict = dict(bal)

            # GAML prioritises waiting when a scheduled contribution is close.
            # This lets existing liquidity pool with near-term inflows instead
            # of paying a transfer fee or locking a smaller principal too early.
            next_inflow_index = bisect.bisect_right(sorted_inflow_dates, today)
            next_inflow_date = (
                sorted_inflow_dates[next_inflow_index]
                if next_inflow_index < len(sorted_inflow_dates)
                else None
            )
            has_maturity_aligned_to_inflow = False
            if next_inflow_date is not None:
                for aid, amount in bal:
                    if amount <= 0.001:
                        continue
                    bank_key = accounts_meta[aid].bank_identity
                    for option in effective_options:
                        if (
                            (not option.bank_identity or option.bank_identity == bank_key)
                            and accounts_meta[aid].can_use_option(option)
                            and option.can_invest(amount, today, end)
                        ):
                            maturity_date = today + timedelta(days=option.days)
                            inflow_index = bisect.bisect_left(sorted_inflow_dates, maturity_date)
                            if inflow_index < len(sorted_inflow_dates):
                                following_inflow = sorted_inflow_dates[inflow_index]
                                days_before_inflow = (following_inflow - maturity_date).days
                                if 0 <= days_before_inflow <= 7:
                                    has_maturity_aligned_to_inflow = True
                                    break
                    if has_maturity_aligned_to_inflow:
                        break

            def best_available_rate(balance_state: BalanceTuple) -> float:
                best_rate = 0.0
                state_balances = dict(balance_state)
                for target_id, target_account in accounts_meta.items():
                    deployable = 0.0
                    for source_id, amount in state_balances.items():
                        if amount <= 0.001:
                            continue
                        if source_id == target_id:
                            deployable += amount
                        else:
                            fee = fee_config.get_fee(
                                accounts_meta[source_id].bank_identity,
                                target_account.bank_identity,
                            )
                            if amount > fee:
                                deployable += amount - fee
                    for option in effective_options:
                        if (
                            (not option.bank_identity or option.bank_identity == target_account.bank_identity)
                            and target_account.can_use_option(option)
                            and option.can_invest(deployable, today, end)
                        ):
                            best_rate = max(best_rate, option.annual_rate)
                return best_rate

            current_best_rate = best_available_rate(bal)
            projected_balances = bal
            for account_id, amount in fixed_inflows.get(next_inflow_date, {}).items():
                projected_balances = _bal_add(projected_balances, account_id, amount)
            contribution_unlocks_better_rate = (
                best_available_rate(projected_balances) > current_best_rate + 0.001
            )

            prioritise_wait = (
                next_inflow_date is not None
                and 0 < (next_inflow_date - today).days <= 30
                and any(amount > 0.001 for _, amount in bal)
                and (
                    not has_maturity_aligned_to_inflow
                    or contribution_unlocks_better_rate
                )
            )
            if prioritise_wait and (self.max_decisions is None or tally < self.max_decisions):
                wait_node = SearchTreeNode(
                    parent=parent_node,
                    action=CarryAction(carries=list(active_accs)),
                    today=today,
                    root_signature=(
                        parent_node.root_signature
                        if parent_node.root_signature is not None
                        else ("carry",)
                    ),
                )
                children.append((next_date_default, bal, active_pf, active_obligations, paid_total, wait_node))

            # ── Branch 1: Consolidate into target account T ──────────────
            consolidation_branches = []
            for tgt_id, tgt_acc in accounts_meta.items():
                tgt_bank = tgt_acc.bank_identity
                transfers: list[dict[str, Any]] = []
                deployable = 0.0
                carries: list[str] = []

                for aid, b in bal:
                    if b <= 0.001:
                        continue
                    if aid == tgt_id:
                        deployable += b
                    else:
                        fee = fee_config.get_fee(accounts_meta[aid].bank_identity, tgt_bank)
                        if b > fee:
                            net_amt = b - fee
                            deployable += net_amt
                            transfers.append({
                                "src_id": aid,
                                "tgt_id": tgt_id,
                                "amount": b,
                                "fee": fee,
                                "net": net_amt,
                            })
                        else:
                            carries.append(aid)

                if not transfers:
                    continue

                actual_fees = sum(t["fee"] for t in transfers)

                for opt in effective_options:
                    if (not opt.bank_identity or opt.bank_identity == tgt_bank) and tgt_acc.can_use_option(opt) and opt.can_invest(deployable, today, end):
                        gross_intr = opt.total_interest_on(deployable, today, self.compound, self.actual_leap_year)
                        if gross_intr <= actual_fees:
                            continue
                        consolidation_branches.append((gross_intr - actual_fees, tgt_id, opt, transfers, deployable, carries))

            # Prioritize high profit branches first
            consolidation_branches.sort(key=lambda x: x[0], reverse=True)
            for _, tgt_id, opt, transfers, deployable, carries in consolidation_branches:
                if self.max_decisions is not None and tally >= self.max_decisions:
                    break
                b_bal = bal
                for t in transfers:
                    b_bal = _bal_set(b_bal, t["src_id"], 0.0)
                b_bal = _bal_set(b_bal, tgt_id, 0.0)

                flows = _get_flows(opt, today, deployable)
                b_flows = _flows_merge(active_pf, [(fd, tgt_id, fa) for fd, fa in flows])
                b_next = _next_event_date(today, b_flows)

                act = ConsolidateAction(
                    target_id=tgt_id,
                    option=opt,
                    transfers=transfers,
                    principal=deployable,
                    carries=carries,
                )
                child_node = SearchTreeNode(
                    parent=parent_node,
                    action=act,
                    today=today,
                    root_signature=(
                        parent_node.root_signature
                        if parent_node.root_signature is not None
                        else ("consolidate", tgt_id, opt.label, opt.payout_type, opt.payout_period_str)
                    ),
                )
                children.append((b_next, b_bal, b_flows, active_obligations, paid_total, child_node))

            # ── Branch 2: Local bookings ─────────────────────────────────
            local_opts_per_acc: dict[str, list[FDOption]] = {}
            for aid in active_accs:
                b = bal_dict[aid]
                bkey = accounts_meta[aid].bank_identity
                opts = [
                    o for o in effective_options
                    if (not o.bank_identity or o.bank_identity == bkey) and accounts_meta[aid].can_use_option(o) and o.can_invest(b, today, end)
                ]
                if opts:
                    local_opts_per_acc[aid] = opts

            if local_opts_per_acc:
                acc_list = list(local_opts_per_acc.keys())
                n = len(acc_list)
                opt_slots = [[None] + local_opts_per_acc[aid] for aid in acc_list]
                slot_sizes = [len(s) for s in opt_slots]
                total_combos = 1
                for sz in slot_sizes:
                    total_combos *= sz

                local_branches = []
                if self.max_local_branches is None:
                    # Fallback: enumerate the complete Cartesian product.
                    indices = [0] * n
                    for _ in range(total_combos):
                        chosen = [(acc_list[i], opt_slots[i][indices[i]]) for i in range(n)]
                        valid_bookings = [
                            {"account_id": aid, "option": opt, "principal": bal_dict[aid]}
                            for aid, opt in chosen if opt is not None
                        ]
                        if valid_bookings:
                            est_profit = sum(
                                item["option"].total_interest_on(
                                    item["principal"], today, self.compound, self.actual_leap_year
                                )
                                for item in valid_bookings
                            )
                            local_branches.append((est_profit, valid_bookings))

                        for i in range(n - 1, -1, -1):
                            indices[i] += 1
                            if indices[i] < slot_sizes[i]:
                                break
                            indices[i] = 0
                else:
                    # GAML: keep only the top K partial combinations at each
                    # account. Local booking values are additive and independent,
                    # so this retains the K highest immediate-value combinations
                    # without materialising the full Cartesian product.
                    partials: list[tuple[float, list[tuple[str, Optional[FDOption]]]]] = [
                        (0.0, [])
                    ]
                    for aid in acc_list:
                        account_options = sorted(
                            local_opts_per_acc[aid],
                            key=lambda opt: opt.total_interest_on(
                                bal_dict[aid], today, self.compound, self.actual_leap_year
                            ),
                            reverse=True,
                        )
                        choices: list[Optional[FDOption]] = [None, *account_options]
                        expanded: list[
                            tuple[float, list[tuple[str, Optional[FDOption]]]]
                        ] = []
                        for partial_profit, partial_choices in partials:
                            for opt in choices:
                                profit = partial_profit
                                if opt is not None:
                                    profit += opt.total_interest_on(
                                        bal_dict[aid], today, self.compound, self.actual_leap_year
                                    )
                                expanded.append((profit, [*partial_choices, (aid, opt)]))
                        expanded.sort(key=lambda item: item[0], reverse=True)
                        if len(expanded) > self.max_local_branches:
                            local_combination_pruned_count += len(expanded) - self.max_local_branches
                        partials = expanded[: self.max_local_branches]

                    for est_profit, chosen in partials:
                        valid_bookings = [
                            {"account_id": aid, "option": opt, "principal": bal_dict[aid]}
                            for aid, opt in chosen if opt is not None
                        ]
                        if valid_bookings:
                            local_branches.append((est_profit, valid_bookings))

                local_branches.sort(key=lambda x: x[0], reverse=True)
                for _, valid_bookings in local_branches:
                    if self.max_decisions is not None and tally >= self.max_decisions:
                        break
                    booked_ids = {b_info["account_id"] for b_info in valid_bookings}
                    carries = [aid for aid in active_accs if aid not in booked_ids]

                    b_bal = bal
                    new_raw: list[tuple[date, str, float]] = []
                    for b_info in valid_bookings:
                        aid = b_info["account_id"]
                        opt = b_info["option"]
                        p = b_info["principal"]
                        b_bal = _bal_set(b_bal, aid, 0.0)
                        for fd, fa in _get_flows(opt, today, p):
                            new_raw.append((fd, aid, fa))

                    b_flows = _flows_merge(active_pf, new_raw)
                    b_next = _next_event_date(today, b_flows)

                    act = LocalBookingsAction(bookings=valid_bookings, carries=carries)
                    child_node = SearchTreeNode(
                        parent=parent_node,
                        action=act,
                        today=today,
                        root_signature=(
                            parent_node.root_signature
                            if parent_node.root_signature is not None
                            else (
                                "local",
                                tuple(sorted(
                                    (
                                        item["account_id"],
                                        item["option"].label,
                                        item["option"].payout_type,
                                        item["option"].payout_period_str,
                                    )
                                    for item in valid_bookings
                                )),
                            )
                        ),
                    )
                    children.append((b_next, b_bal, b_flows, active_obligations, paid_total, child_node))

            # ── Branch 3: Carry forward (hold all cash) ──────────────────
            # If waiting was prioritised above, this branch has already been
            # explored first; do not duplicate the same state transition.
            if not prioritise_wait and (self.max_decisions is None or tally < self.max_decisions):
                carry_act = CarryAction(carries=list(active_accs))
                child_node = SearchTreeNode(
                    parent=parent_node,
                    action=carry_act,
                    today=today,
                    root_signature=(
                        parent_node.root_signature
                        if parent_node.root_signature is not None
                        else ("carry",)
                    ),
                )
                children.append((next_date_default, bal, active_pf, active_obligations, paid_total, child_node))

            return children

        # ----------------------------------------------------------------
        # Run Branch-and-Bound search from start date
        # ----------------------------------------------------------------
        t0 = time.time()
        init_bal = _make_balances({acc.id: acc.balance for acc in accounts})
        root_node = SearchTreeNode(parent=None, action=None, today=start)
        beam = [(start, init_bal, (), (), 0.0, root_node)]

        # Layered beam search: expand at most W states per decision depth, then
        # retain the W children with the strongest optimistic terminal values.
        # This bounds expanded states by O(event_depth * W), rather than
        # traversing the exponentially growing full decision tree.
        beam_width = self.beam_width
        sequence = 0
        beam_pruned_count = 0
        budget_stopped = False

        def frontier_priority(state: tuple) -> float:
            state_date, state_bal, state_flows, state_obligations, state_paid, _ = state
            bound = calc_upper_bound(
                state_date, state_bal, state_flows, state_obligations, state_paid
            )

            # Keep the optimistic global bound for safe pruning, but do not use
            # it alone to rank the beam. Its "best rate everywhere" assumption
            # makes many economically different portfolios look equivalent.
            # This estimate respects each account's bank/eFD eligibility and
            # remaining term. It is a ranking heuristic only, never a prune.
            estimate = state_paid - sum(item[2] for item in state_obligations)

            def add_estimated_cash(account_id: str, amount: float, cash_date: date) -> None:
                nonlocal estimate
                if amount <= 0.0 or cash_date > end:
                    return
                rate = max(0.0, _best_account_rate(account_id, cash_date)) / 100.0
                years_left = max(0, (end - cash_date).days) / 365.0
                estimate += amount * math.exp(rate * years_left)

            for account_id, amount in state_bal:
                add_estimated_cash(account_id, amount, state_date)

            for account_id, amount in fixed_inflows.get(state_date, {}).items():
                add_estimated_cash(account_id, amount, state_date)

            for flow_date, entries in state_flows:
                for account_id, amount in entries:
                    add_estimated_cash(account_id, amount, flow_date)

            for inflow_date, account_amounts in fixed_inflows.items():
                if state_date < inflow_date <= end:
                    for account_id, amount in account_amounts.items():
                        add_estimated_cash(account_id, amount, inflow_date)

            # A small fraction of the admissible bound preserves some optimism
            # for cross-account consolidation and future reinvestment that this
            # inexpensive account-local estimate cannot fully model.
            return estimate + 0.05 * max(0.0, bound - estimate)

        def _candidate_order(item: tuple[float, int, tuple]) -> tuple[float, int]:
            return (-item[0], item[1])

        while beam:
            next_beam: list[tuple[float, int, tuple]] = []
            # Keep one representative of each distinct first decision in
            # addition to the globally strongest candidates. This stops one
            # early booking family from monopolising every beam slot.
            root_best: dict[tuple, tuple[float, int, tuple]] = {}
            generated_count = 0

            for state in beam:
                if self.max_decisions is not None and tally >= self.max_decisions:
                    budget_stopped = True
                    break

                tally += 1
                if tally % 25_000 == 0:
                    print(
                        f"  [Decision Tally: #{tally:,}] Expanded {tally:,} states "
                        f"({leaf_count:,} leaves, {pruned_count:,} bound-pruned, "
                        f"{beam_pruned_count:,} beam-pruned, "
                        f"{local_combination_pruned_count:,} local-combination-pruned) | "
                        f"Current best final value: {best_final_val:,.2f}"
                    )

                for child_state in expand(state):
                    generated_count += 1
                    sequence += 1
                    candidate = (frontier_priority(child_state), sequence, child_state)

                    signature = child_state[5].root_signature or ("unclassified",)
                    previous = root_best.get(signature)
                    if previous is None or _candidate_order(candidate) < _candidate_order(previous):
                        root_best[signature] = candidate

                    next_beam.append(candidate)

                # Both pools are bounded after each parent expansion. Temporary
                # storage is O(W + B), not the full layer's child count.
                if len(next_beam) > beam_width:
                    next_beam.sort(key=_candidate_order)
                    del next_beam[beam_width:]
                if len(root_best) > beam_width:
                    best_roots = sorted(root_best.items(), key=lambda item: _candidate_order(item[1]))
                    root_best = dict(best_roots[:beam_width])

            if budget_stopped:
                break

            # Reserve one slot per represented root decision, then fill unused
            # slots with the globally highest-ranked remaining states.
            selected: list[tuple[float, int, tuple]] = []
            seen_states: set[tuple] = set()
            # Reserve one third of the beam for root diversity; keep the
            # remaining two thirds available for deeper refinement of strong
            # paths. Reserving every slot would prevent descendants of a root
            # strategy from competing with one another.
            diversity_slots = max(1, beam_width // 3)
            root_representatives = sorted(
                root_best.values(), key=_candidate_order
            )[:diversity_slots]
            root_strategy_peak = max(root_strategy_peak, len(root_representatives))

            for candidate in root_representatives:
                state_key = candidate[2][:5]
                if state_key not in seen_states:
                    selected.append(candidate)
                    seen_states.add(state_key)

            next_beam.sort(key=_candidate_order)
            for candidate in next_beam:
                if len(selected) >= beam_width:
                    break
                state_key = candidate[2][:5]
                if state_key not in seen_states:
                    selected.append(candidate)
                    seen_states.add(state_key)

            beam_pruned_count += max(0, generated_count - len(selected))
            beam = [item[2] for item in selected]

        search_exhausted = not beam and not budget_stopped
        elapsed = time.time() - t0

        best_net_interest = best_final_val - total_capital
        top_alternatives = sorted(
            alternative_leaf_net_interests,
            reverse=True,
        )[:10]
        print(f"  [{self.name} Strategy] Top 10 alternative leaves (excluding the best):")
        if not top_alternatives:
            print("    No alternative completed leaves were recorded.")
        else:
            for rank, net_interest in enumerate(top_alternatives, start=1):
                difference = net_interest - best_net_interest
                difference_str = f"{difference:,.2f}" if difference < 0 else f"+{difference:,.2f}"
                print(
                    f"    #{rank:02d} Net Interest = {net_interest:,.2f} LKR "
                    f"(diff vs best: {difference_str} LKR)"
                )

        budget_note = (
            f", state budget {self.max_decisions:,} reached"
            if self.max_decisions is not None and tally >= self.max_decisions
            else ""
        )
        search_status = (
            "optimality proven"
            if search_exhausted and beam_pruned_count == 0 and local_combination_pruned_count == 0 and not budget_note
            else "best solution found; optimality not proven"
        )
        print(
            f"  [{self.name} Search Complete] {tally:,} states "
            f"({leaf_count:,} leaves, {pruned_count:,} bound-pruned, "
            f"{beam_pruned_count:,} beam-pruned, "
            f"{local_combination_pruned_count:,} local-combination-pruned, "
            f"root-strategy diversity peak {root_strategy_peak:,}{budget_note}) "
            f"in {elapsed:.2f}s | {search_status}"
        )

        # Greedy is a valid, fully simulated incumbent. If the budget expires
        # before a better complete leaf is found, return that incumbent rather
        # than replaying an incomplete search path.
        if best_leaf is None:
            if not greedy_res.valid:
                raise ValueError("GAML did not find a feasible path satisfying strict outflows within its configured search budget")
            greedy_res.strategy_name = self.name
            greedy_res.total_decisions_evaluated = tally
            return greedy_res

        best_path: list[tuple[date, DailyAction]] = best_leaf.get_path()

        return self._replay_simulation(
            best_path=best_path,
            options=options,
            start=start,
            end=end,
            inflow_schedule=inflow_schedule,
            accounts=accounts,
            inflow_account_id=inflow_account_id,
            fee_config=fee_config,
            consolidation_account_id=consolidation_account_id,
            total_decisions_evaluated=tally,
            alternative_leaf_net_interests=alternative_leaf_net_interests,
            outflow_schedule=outflow_schedule,
        )

    # ----------------------------------------------------------------
    # Replay
    # ----------------------------------------------------------------

    def _replay_simulation(
        self,
        best_path: list[tuple[date, DailyAction]],
        options: list[FDOption],
        start: date,
        end: date,
        inflow_schedule: dict[date, float] | dict[date, dict[str, float]],
        accounts: list[Account],
        inflow_account_id: str,
        fee_config: TransferFeeConfig,
        consolidation_account_id: str,
        total_decisions_evaluated: Optional[int] = None,
        alternative_leaf_net_interests: Optional[list[float]] = None,
        outflow_schedule: Optional[dict[date, list[dict]]] = None,
    ) -> SimResult:
        accounts_map = {
            acc.id: Account(id=acc.id, bank_key=acc.bank_key,
                    bank_id=acc.bank_id, label=acc.label, balance=acc.balance, supports_efd=acc.supports_efd)
            for acc in accounts
        }
        timeline: dict[int, list[Event]] = {}
        bookings: list[Booking] = []
        booking_counter = 0
        total_transfer_fees: float = 0.0
        outflow_schedule = outflow_schedule or {}
        pending_obligations: list[dict] = []
        total_outflows_paid = 0.0
        strict_payment_failed = False

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
                        bank_id=accounts_map[account_id].bank_id,
                    ),
                )

        for outflow_date, entries in sorted(outflow_schedule.items()):
            for entry in entries:
                self._add_event(timeline, Event(
                    event_type=EventType.OUTFLOW,
                    on_date=outflow_date,
                    amount=float(entry["amount"]),
                    label=str(entry.get("name", "Outflow")),
                    account_id=str(entry["account_id"]),
                    payment_policy=str(entry.get("payment_policy", "strict")),
                    bank_key=accounts_map[str(entry["account_id"])].bank_key,
                    bank_id=accounts_map[str(entry["account_id"])].bank_id,
                ))

        start_key = int(start.strftime("%Y%m%d"))
        if start_key not in timeline and any(acc.balance > 0.001 for acc in accounts_map.values()):
            self._add_event(
                timeline,
                Event(
                    event_type=EventType.INFLOW,
                    on_date=start,
                    amount=0.0,
                    label="Opening balance trigger",
                    account_id=inflow_account_id,
                    bank_key=accounts_map[inflow_account_id].bank_key,
                    bank_id=accounts_map[inflow_account_id].bank_id,
                ),
            )

        action_map = {d: act for d, act in best_path}
        processed: set[int] = set()

        while True:
            remaining = [k for k in timeline if k not in processed]
            if not remaining:
                break
            key = min(remaining)
            processed.add(key)

            s     = str(key)
            today = date(int(s[:4]), int(s[4:6]), int(s[6:8]))
            day_events = timeline[key]

            for e in day_events:
                if e.event_type in (EventType.INFLOW, EventType.CASH_FLOW, EventType.MATURITY):
                    target_id  = e.account_id if e.account_id in accounts_map else inflow_account_id
                    target_acc = accounts_map[target_id]
                    target_acc.balance += e.amount
                    e.account_id          = target_acc.id
                    e.bank_key            = target_acc.bank_key
                    e.bank_id             = target_acc.bank_id
                    e.balance_after       = target_acc.balance
                    e.total_balance_after = sum(a.balance for a in accounts_map.values())

            due = [e for e in day_events if e.event_type == EventType.OUTFLOW]
            for event in due:
                pending_obligations.append({
                    "name": event.label, "account_id": event.account_id,
                    "remaining": event.amount,
                    "payment_policy": event.payment_policy or "strict",
                    "due_date": today,
                })
            still_pending = []
            for obligation in sorted(pending_obligations, key=lambda item: ({"strict": 0, "defer": 1, "best_effort": 2}.get(item["payment_policy"], 3), item["due_date"])):
                acc = accounts_map[obligation["account_id"]]
                required = float(obligation["remaining"])
                policy = obligation["payment_policy"]
                if policy == "strict" and acc.balance + 0.001 < required:
                    strict_payment_failed = True
                    still_pending.append(obligation)
                    continue
                if policy == "defer" and acc.balance + 0.001 < required:
                    still_pending.append(obligation)
                    continue
                paid = required if policy in {"strict", "defer"} else min(acc.balance, required)
                acc.balance = round(acc.balance - paid, 2)
                total_outflows_paid += paid
                remaining = round(required - paid, 2)
                if remaining > 0.001:
                    still_pending.append({**obligation, "remaining": remaining})
                if paid > 0.001:
                    self._add_event(timeline, Event(
                        event_type=EventType.OUTFLOW, on_date=today, amount=-paid,
                        label=f"Paid {obligation['name']} ({policy})",
                        account_id=acc.id, bank_key=acc.bank_key,
                    bank_id=acc.bank_id,
                        balance_after=acc.balance,
                        total_balance_after=sum(a.balance for a in accounts_map.values()),
                    ))
            pending_obligations = still_pending
            if strict_payment_failed:
                break

            if today in action_map:
                act = action_map[today]

                if isinstance(act, ConsolidateAction):
                    tgt_acc = accounts_map[act.target_id]
                    decision_balances_before = {aid: account.balance for aid, account in accounts_map.items()}

                    for t in act.transfers:
                        src     = accounts_map[t["src_id"]]
                        tgt     = accounts_map[t["tgt_id"]]
                        fee     = t["fee"]
                        net_amt = t["net"]
                        src_cash = t["amount"]

                        total_transfer_fees += fee
                        src.balance = 0.0
                        self._add_event(timeline, Event(
                            event_type=EventType.TRANSFER,
                            on_date=today,
                            amount=src_cash,
                            label=f"Transfer to {tgt.label} (Amt: {net_amt:,.2f}, Fee: {fee:,.2f})",
                            account_id=src.id,
                            bank_key=src.bank_key,
                            bank_id=src.bank_id,
                            transfer_channel="intra_bank" if src.bank_identity.strip().upper() == tgt.bank_identity.strip().upper() else "domestic_ceft",
                            fee=fee,
                            balance_after=src.balance,
                            total_balance_after=sum(a.balance for a in accounts_map.values()),
                        ))
                        tgt.balance += net_amt
                        self._add_event(timeline, Event(
                            event_type=EventType.TRANSFER,
                            on_date=today,
                            amount=net_amt,
                            label=f"Transfer received from {src.label}",
                            account_id=tgt.id,
                            bank_key=tgt.bank_key,
                            bank_id=tgt.bank_id,
                            transfer_channel="intra_bank" if src.bank_identity.strip().upper() == tgt.bank_identity.strip().upper() else "domestic_ceft",
                            fee=0.0,
                            balance_after=tgt.balance,
                            total_balance_after=sum(a.balance for a in accounts_map.values()),
                        ))
                    principal = tgt_acc.balance
                    tgt_acc.balance = 0.0
                    booking_counter += 1
                    ref = f"FD-{booking_counter:04d}"

                    chosen_opt = act.option
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

                    self._add_event(timeline, Event(
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
                    ))

                    mat_date      = booking.end
                    is_cumulative = chosen_opt.payout_type == "cumulative"
                    for flow_date, flow_amt in flows:
                        ev_type = EventType.MATURITY if (
                            flow_date == mat_date and (is_cumulative or flow_date == flows[-1][0])
                        ) else EventType.CASH_FLOW
                        self._add_event(timeline, Event(
                            event_type=ev_type,
                            on_date=flow_date,
                            amount=flow_amt,
                            label=(
                                f"Maturity [{ref}]  ({chosen_opt.label})"
                                if ev_type == EventType.MATURITY
                                else f"Cash flow [{ref}]  ({chosen_opt.label})"
                            ),
                            booking_ref=ref,
                            account_id=tgt_acc.id,
                            bank_key=tgt_acc.bank_key,
                            bank_id=tgt_acc.bank_id,
                        ))

                    for aid in act.carries:
                        acc = accounts_map[aid]
                        if acc.balance > 0.001:
                            self._add_event(timeline, Event(
                                event_type=EventType.CARRY_FORWARD,
                                on_date=today,
                                amount=acc.balance,
                                label=f"Holding liquidity; balance {acc.balance:,.2f} carries forward",
                                account_id=acc.id,
                                bank_key=acc.bank_key,
                                bank_id=acc.bank_id,
                                balance_after=acc.balance,
                                total_balance_after=sum(a.balance for a in accounts_map.values()),
                                decision_context={"action": "carry", "balances_before": {aid: account.balance for aid, account in accounts_map.items()}},
                            ))

                elif isinstance(act, LocalBookingsAction):
                    for b_info in act.bookings:
                        acc        = accounts_map[b_info["account_id"]]
                        chosen_opt = b_info["option"]
                        decision_balances_before = {aid: account.balance for aid, account in accounts_map.items()}
                        principal  = acc.balance
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

                        self._add_event(timeline, Event(
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
                        ))

                        mat_date      = booking.end
                        is_cumulative = chosen_opt.payout_type == "cumulative"
                        for flow_date, flow_amt in flows:
                            ev_type = EventType.MATURITY if (
                                flow_date == mat_date and (is_cumulative or flow_date == flows[-1][0])
                            ) else EventType.CASH_FLOW
                            self._add_event(timeline, Event(
                                event_type=ev_type,
                                on_date=flow_date,
                                amount=flow_amt,
                                label=(
                                    f"Maturity [{ref}]  ({chosen_opt.label})"
                                    if ev_type == EventType.MATURITY
                                    else f"Cash flow [{ref}]  ({chosen_opt.label})"
                                ),
                                booking_ref=ref,
                                account_id=acc.id,
                                bank_key=acc.bank_key,
                                bank_id=acc.bank_id,
                            ))

                    for aid in act.carries:
                        acc = accounts_map[aid]
                        if acc.balance > 0.001:
                            self._add_event(timeline, Event(
                                event_type=EventType.CARRY_FORWARD,
                                on_date=today,
                                amount=acc.balance,
                                label=f"Holding liquidity; balance {acc.balance:,.2f} carries forward",
                                account_id=acc.id,
                                bank_key=acc.bank_key,
                                bank_id=acc.bank_id,
                                balance_after=acc.balance,
                                total_balance_after=sum(a.balance for a in accounts_map.values()),
                                decision_context={"action": "carry", "balances_before": {aid: account.balance for aid, account in accounts_map.items()}},
                            ))

                elif isinstance(act, CarryAction):
                    for aid in act.carries:
                        acc = accounts_map[aid]
                        if acc.balance > 0.001:
                            self._add_event(timeline, Event(
                                event_type=EventType.CARRY_FORWARD,
                                on_date=today,
                                amount=acc.balance,
                                label=f"Holding liquidity; balance {acc.balance:,.2f} carries forward",
                                account_id=acc.id,
                                bank_key=acc.bank_key,
                                bank_id=acc.bank_id,
                                balance_after=acc.balance,
                                total_balance_after=sum(a.balance for a in accounts_map.values()),
                                decision_context={"action": "carry", "balances_before": {aid: account.balance for aid, account in accounts_map.items()}},
                            ))

        # Final consolidation sweep
        if consolidation_account_id in accounts_map:
            consol_acc = accounts_map[consolidation_account_id]
            for acc in list(accounts_map.values()):
                if acc.id == consolidation_account_id or acc.balance <= 0.001:
                    continue
                fee = fee_config.get_fee(acc.bank_identity, consol_acc.bank_identity)
                if acc.balance <= fee:
                    continue
                src_balance  = acc.balance
                cash_to_sweep = src_balance - fee
                total_transfer_fees += fee
                acc.balance = 0.0
                self._add_event(timeline, Event(
                    event_type=EventType.TRANSFER,
                    on_date=end,
                    amount=src_balance,
                    label=f"Final sweep to {consol_acc.label} (Amt: {cash_to_sweep:,.2f}, Fee: {fee:,.2f})",
                    account_id=acc.id,
                    bank_key=acc.bank_key,
                    bank_id=acc.bank_id,
                    transfer_channel="intra_bank" if acc.bank_identity.strip().upper() == consol_acc.bank_identity.strip().upper() else "domestic_ceft",
                    fee=fee,
                    balance_after=0.0,
                    total_balance_after=sum(a.balance for a in accounts_map.values()),
                ))
                consol_acc.balance += cash_to_sweep
                self._add_event(timeline, Event(
                    event_type=EventType.TRANSFER,
                    on_date=end,
                    amount=cash_to_sweep,
                    label=f"Final sweep received from {acc.label}",
                    account_id=consol_acc.id,
                    bank_key=consol_acc.bank_key,
                    bank_id=consol_acc.bank_id,
                    transfer_channel="intra_bank" if acc.bank_identity.strip().upper() == consol_acc.bank_identity.strip().upper() else "domestic_ceft",
                    fee=0.0,
                    balance_after=consol_acc.balance,
                    total_balance_after=sum(a.balance for a in accounts_map.values()),
                ))

        # Residual idle cash
        for acc in accounts_map.values():
            if acc.balance > 0.01:
                self._add_event(timeline, Event(
                    event_type=EventType.IDLE,
                    on_date=end,
                    amount=acc.balance,
                    label=f"Final cash balance in {acc.label}",
                    account_id=acc.id,
                    bank_key=acc.bank_key,
                    bank_id=acc.bank_id,
                    balance_after=acc.balance,
                    total_balance_after=sum(a.balance for a in accounts_map.values()),
                ))

        result = SimResult(
            strategy_name=self.name,
            timeline=timeline,
            bookings=bookings,
            total_principal=sum(amount for amounts in inflow_schedule.values() for amount in amounts.values()) + sum(a.balance for a in accounts),
            end_date=end,
            accounts=accounts_map,
            total_transfer_fees=total_transfer_fees,
            total_decisions_evaluated=total_decisions_evaluated,
            alternative_leaf_net_interests=alternative_leaf_net_interests or [],
            total_outflows_paid=total_outflows_paid,
            outstanding_outflows=pending_obligations,
            valid=not strict_payment_failed,
        )
        from core.reporting import build_decision_log
        build_decision_log(result)
        return result

    @staticmethod
    def _add_event(timeline: dict[int, list[Event]], event: Event) -> None:
        key = event.date_key
        if key not in timeline:
            timeline[key] = []
        timeline[key].append(event)


