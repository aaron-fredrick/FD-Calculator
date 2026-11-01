from __future__ import annotations

import json
from datetime import date
from math import isfinite
from pathlib import Path
from typing import Any

from core.interest import add_period, parse_period_delta
from core.models import Account, FDOption, TransferFeeConfig, load_options_from_json


def _resolve_date(value: str | None, *, investment_start: date | None = None) -> date:
    """Resolve an ISO date or supported relative date token."""
    if value is None or not str(value).strip():
        raise ValueError("Date value is required")
    token = str(value).strip().lower()
    if token == "today":
        return date.today()
    if token == "investment_start":
        if investment_start is None:
            raise ValueError("'investment_start' can only be used after the investment start is resolved")
        return investment_start
    if token.startswith("investment_start+") and len(token) > len("investment_start+"):
        if investment_start is None:
            raise ValueError("'investment_start+period' can only be used after the investment start is resolved")
        return add_period(investment_start, token.split("+", 1)[1])
    try:
        return date.fromisoformat(token)
    except ValueError as exc:
        raise ValueError(
            f"Invalid date {value!r}. Use YYYY-MM-DD, 'today', 'investment_start', "
            "or 'investment_start+1m' (periods use d/m/y)."
        ) from exc


def _load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"Configuration file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"Configuration root in {path} must be a JSON object")
    return data


def load_configuration(config_path: str | Path) -> dict[str, Any]:
    """Load, validate, and resolve application configuration and bank-specific FD options."""
    path = Path(config_path).expanduser().resolve()
    config = _load_json(path)

    investment = config.get("investment")
    if not isinstance(investment, dict):
        raise ValueError("Configuration requires an 'investment' object")
    start = _resolve_date(investment.get("start_date"))
    end = _resolve_date(investment.get("end_date"), investment_start=start)
    if end < start:
        raise ValueError(f"Investment end date {end} is before start date {start}")

    accounts_data = config.get("accounts")
    if not isinstance(accounts_data, list) or not accounts_data:
        raise ValueError("Configuration 'accounts' must be a non-empty list")

    accounts: list[Account] = []
    account_ids: set[str] = set()
    bank_keys: list[str] = []
    for index, entry in enumerate(accounts_data):
        if not isinstance(entry, dict):
            raise ValueError(f"accounts[{index}] must be an object")
        account_id = str(entry.get("id", "")).strip()
        bank_key = str(entry.get("bank_key", "")).strip().lower()
        label = str(entry.get("label", "")).strip()
        try:
            balance = float(entry.get("balance", 0.0))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"accounts[{index}].balance must be a number") from exc
        if not account_id:
            raise ValueError(f"accounts[{index}].id must not be empty")
        if not bank_key:
            raise ValueError(f"accounts[{index}].bank_key must not be empty")
        if account_id in account_ids:
            raise ValueError(f"Duplicate account id {account_id!r}")
        if not isfinite(balance) or balance < 0:
            raise ValueError(f"Starting balance for account {account_id!r} must be finite and non-negative")
        account_ids.add(account_id)
        if bank_key not in bank_keys:
            bank_keys.append(bank_key)
        accounts.append(Account(id=account_id, bank_key=bank_key, label=label, balance=balance))

    options_file_value = str(config.get("options_file", "options.json"))
    options_path = Path(options_file_value).expanduser()
    if not options_path.is_absolute():
        config_relative = path.parent / options_path
        repo_relative = Path(__file__).resolve().parent.parent / options_path
        options_path = config_relative if config_relative.exists() else repo_relative
    options_path = options_path.resolve()
    if not options_path.is_file():
        raise FileNotFoundError(f"FD options file not found: {options_path}")

    # Load only the banks represented by configured accounts. A typo or bank
    # without options is a configuration error, not a reason to silently skip it.
    options: list[FDOption] = []
    for bank_key in bank_keys:
        try:
            bank_options = load_options_from_json(options_path, bank_key=bank_key)
        except KeyError as exc:
            raise ValueError(
                f"Configured bank {bank_key!r} has no entry in {options_path}. "
                "Add valid FD options for that bank or remove its account."
            ) from exc
        if not bank_options:
            raise ValueError(
                f"Configured bank {bank_key!r} has no FD options in {options_path}; refusing to run."
            )
        options.extend(bank_options)

    inflow_data = config.get("inflows", [])
    if not isinstance(inflow_data, list):
        raise ValueError("'inflows' must be a list")
    inflow_account_id = str(config.get("inflow_account_id") or accounts[0].id).strip()
    if inflow_account_id not in account_ids:
        raise ValueError(f"inflow_account_id {inflow_account_id!r} is not a configured account")

    inflow_schedule: dict[date, dict[str, float]] = {}
    inflow_summaries: list[dict[str, Any]] = []
    for index, entry in enumerate(inflow_data):
        if not isinstance(entry, dict):
            raise ValueError(f"inflows[{index}] must be an object")
        name = str(entry.get("name") or f"Inflow {index + 1}").strip()
        account_id = str(entry.get("account_id", "")).strip()
        if account_id not in account_ids:
            raise ValueError(f"Inflow {name!r} targets unknown account {account_id!r}")
        try:
            amount = float(entry["amount"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Inflow {name!r} requires a numeric amount") from exc
        if not isfinite(amount) or amount <= 0:
            raise ValueError(f"Inflow {name!r} amount must be finite and greater than zero")
        interval = str(entry.get("interval", "")).strip().lower()
        # Validate interval once, before constructing the schedule.
        try:
            delta = parse_period_delta(interval)
        except (AttributeError, ValueError) as exc:
            raise ValueError(f"Inflow {name!r} has invalid interval {interval!r}; supported formats include '30d', '1m', and '1y'") from exc
        first_date_value = entry.get("start_date")
        first_date = (
            add_period(start, interval)
            if first_date_value is None
            else _resolve_date(str(first_date_value), investment_start=start)
        )
        if first_date < start:
            raise ValueError(
                f"Inflow {name!r} starts on {first_date}, before investment start {start}"
            )
        occurrence = 0
        current = first_date
        while current <= end:
            day_amounts = inflow_schedule.setdefault(current, {})
            day_amounts[account_id] = day_amounts.get(account_id, 0.0) + amount
            occurrence += 1
            current = first_date + delta * occurrence
        inflow_summaries.append({
            "name": name,
            "amount": amount,
            "interval": interval,
            "start_date": first_date,
            "account_id": account_id,
            "occurrences": occurrence,
            "total": amount * occurrence,
        })

    fees_data = config.get("transfer_fees", {})
    if not isinstance(fees_data, dict):
        raise ValueError("'transfer_fees' must be an object")
    custom_fees: dict[tuple[str, str], float] = {}
    for index, item in enumerate(fees_data.get("custom_fees", [])):
        if not isinstance(item, dict):
            raise ValueError(f"transfer_fees.custom_fees[{index}] must be an object")
        from_bank = str(item.get("from_bank", "")).strip().lower()
        to_bank = str(item.get("to_bank", "")).strip().lower()
        fee = float(item.get("amount", 0.0))
        if not from_bank or not to_bank or not isfinite(fee) or fee < 0:
            raise ValueError(f"Invalid custom transfer fee at index {index}")
        custom_fees[(from_bank, to_bank)] = fee

    fee_config = TransferFeeConfig(
        default_inter_bank_fee=float(fees_data.get("default_inter_bank_fee", 30.0)),
        same_bank_fee=float(fees_data.get("same_bank_fee", 0.0)),
        custom_fees=custom_fees,
    )
    if (
        not isfinite(fee_config.default_inter_bank_fee)
        or not isfinite(fee_config.same_bank_fee)
        or fee_config.default_inter_bank_fee < 0
        or fee_config.same_bank_fee < 0
    ):
        raise ValueError("Transfer fees must be finite and non-negative")

    consolidation_account_id = str(config.get("consolidation_account_id") or inflow_account_id).strip()
    if consolidation_account_id not in account_ids:
        raise ValueError(f"consolidation_account_id {consolidation_account_id!r} is not a configured account")

    strategy = str(config.get("strategy", "absolute")).strip().lower()
    if strategy not in {"absolute", "greedy"}:
        raise ValueError(f"Unsupported strategy {strategy!r}; use 'absolute' or 'greedy'")

    return {
        "source_path": path,
        "options_path": options_path,
        "strategy": strategy,
        "accounts": accounts,
        "options": options,
        "start": start,
        "end": end,
        "inflow_schedule": inflow_schedule,
        "inflow_summaries": inflow_summaries,
        "inflow_account_id": inflow_account_id,
        "consolidation_account_id": consolidation_account_id,
        "fee_config": fee_config,
        "compound": bool(config.get("compound", False)),
        "actual_leap_year": bool(config.get("actual_leap_year", True)),
        "show_timeline": bool(config.get("show_timeline", True)),
        "show_ledger": bool(config.get("show_ledger", False)),
        "show_plots": bool(config.get("show_plots", True)),
        "plot_output_dir": str(config.get("plot_output_dir", "plots")),
    }
