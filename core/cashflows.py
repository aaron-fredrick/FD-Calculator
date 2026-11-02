from __future__ import annotations

from datetime import date
from math import isfinite
from typing import Any

# Immutable obligation entries are safe to share between search branches:
# (name, account_id, remaining_amount, policy, original_due_date)
Obligation = tuple[str, str, float, str, date]
Obligations = tuple[Obligation, ...]


def process_outflows(
    today: date,
    balances: tuple[tuple[str, float], ...],
    pending: Obligations,
    due_entries: list[dict[str, Any]],
) -> tuple[tuple[tuple[str, float], ...], Obligations, float, bool]:
    """Apply due and carried outflows to an immutable account-balance state."""
    amounts = dict(balances)
    obligations: list[Obligation] = list(pending)
    for entry in due_entries:
        obligations.append((
            str(entry.get("name", "Outflow")),
            str(entry["account_id"]),
            round(float(entry["amount"]), 2),
            str(entry.get("payment_policy", "strict")).lower(),
            today,
        ))

    priority = {"strict": 0, "defer": 1, "best_effort": 2}
    obligations.sort(key=lambda item: (priority.get(item[3], 3), item[4], item[1], item[0]))
    remaining: list[Obligation] = []
    paid_total = 0.0

    for name, account_id, required, policy, due_date in obligations:
        if account_id not in amounts:
            raise ValueError(f"Outflow {name!r} targets unknown account {account_id!r}")
        available = max(0.0, amounts[account_id])
        if policy == "strict":
            if available + 0.001 < required:
                return balances, tuple(obligations), paid_total, False
            paid = required
        elif policy == "defer":
            if available + 0.001 < required:
                remaining.append((name, account_id, required, policy, due_date))
                continue
            paid = required
        elif policy == "best_effort":
            paid = min(available, required)
        else:
            raise ValueError(f"Unknown outflow payment policy {policy!r}")

        amounts[account_id] = round(available - paid, 2)
        paid_total += paid
        unpaid = round(required - paid, 2)
        if unpaid > 0.001:
            remaining.append((name, account_id, unpaid, policy, due_date))

    new_balances = tuple(sorted((account_id, round(value, 2)) for account_id, value in amounts.items()))
    return new_balances, tuple(remaining), round(paid_total, 2), True


def validate_outflow_schedule(
    schedule: dict[date, list[dict[str, Any]]],
    start: date,
    end: date,
    account_ids: set[str],
) -> None:
    """Validate direct strategy API input, not just JSON-loaded configuration."""
    for day, entries in schedule.items():
        if day < start or day > end:
            raise ValueError(f"Outflow date {day} is outside the investment period")
        if not isinstance(entries, list):
            raise ValueError(f"Outflow schedule entry for {day} must be a list")
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                raise ValueError(f"Outflow on {day} at index {index} must be an object")
            account_id = str(entry.get("account_id", "")).strip()
            if account_id not in account_ids:
                raise ValueError(f"Outflow targets unknown account {account_id!r}")
            try:
                amount = float(entry["amount"])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError(f"Outflow on {day} requires a numeric amount") from exc
            if not isfinite(amount) or amount <= 0:
                raise ValueError(f"Outflow on {day} amount must be finite and greater than zero")
            policy = str(entry.get("payment_policy", "strict")).lower()
            if policy not in {"strict", "defer", "best_effort"}:
                raise ValueError(f"Invalid outflow payment policy {policy!r}")
