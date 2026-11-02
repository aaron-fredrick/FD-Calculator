from __future__ import annotations

import csv
import json
from datetime import date
from math import isfinite
from pathlib import Path
from typing import Any

from core.interest import add_period, parse_period_delta
from core.models import Account, FDOption, TransferFeeConfig, load_options_from_bank_csv


def _resolve_date(
    value: str | None,
    *,
    investment_start: date | None = None,
    investment_end: date | None = None,
) -> date:
    """Resolve an ISO date or an investment-relative date token."""
    if value is None or not str(value).strip():
        raise ValueError("Date value is required")
    token = str(value).strip().lower()
    if token == "today":
        return date.today()
    if token in {"investment_start", "start"}:
        if investment_start is None:
            raise ValueError("'investment_start' can only be used after the investment start is resolved")
        return investment_start
    if token in {"investment_end", "end"}:
        if investment_end is None:
            raise ValueError("'investment_end'/'end' can only be used after the investment end is resolved")
        return investment_end
    if token.startswith("investment_start+") and investment_start is not None:
        return add_period(investment_start, token.split("+", 1)[1])
    try:
        return date.fromisoformat(token)
    except ValueError as exc:
        raise ValueError(
            f"Invalid date {value!r}. Use YYYY-MM-DD, 'today', 'investment_start', "
            "'investment_end'/'end', or 'investment_start+1m'."
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
    if not isinstance(accounts_data, dict) or not accounts_data:
        raise ValueError("Configuration 'accounts' must be a non-empty object keyed by account ID")

    # The bank catalogue is authoritative for bank identity. The FD-options index
    # supplies the internal product-file key, but it is never accepted as config identity.
    repo_root = Path(__file__).resolve().parent.parent
    banks_path = repo_root / "data" / "banks" / "banks.csv"
    if not banks_path.is_file():
        raise FileNotFoundError(f"Bank catalogue not found: {banks_path}")
    with banks_path.open("r", encoding="utf-8-sig", newline="") as handle:
        bank_rows = list(csv.DictReader(handle))
    bank_registry = {
        str(row.get("id", "")).strip(): row
        for row in bank_rows if str(row.get("id", "")).strip()
    }
    options_file_for_index = Path(str(config.get("options_file", "data/fd_options/fd_options.csv")))
    if not options_file_for_index.is_absolute():
        candidate = path.parent / options_file_for_index
        options_file_for_index = candidate if candidate.exists() else repo_root / options_file_for_index
    if options_file_for_index.suffix.lower() != ".csv":
        raise ValueError("The bank_id account schema requires the bank FD-options CSV index")
    with options_file_for_index.open("r", encoding="utf-8-sig", newline="") as handle:
        index_rows = list(csv.DictReader(handle))
    bank_key_by_id = {
        str(row.get("bank_id", "")).strip(): str(row.get("bank_key", "")).strip().lower()
        for row in index_rows
    }

    accounts: list[Account] = []
    account_ids: set[str] = set()
    bank_ids: list[str] = []
    for account_id_raw, entry in accounts_data.items():
        account_id = str(account_id_raw).strip()
        if not account_id:
            raise ValueError("Account dictionary keys must not be empty")
        if not isinstance(entry, dict):
            raise ValueError(f"accounts[{account_id!r}] must be an object")
        bank_id = str(entry.get("bank_id", "")).strip()
        if not bank_id:
            raise ValueError(f"accounts[{account_id!r}].bank_id must not be empty")
        if bank_id not in bank_registry:
            raise ValueError(f"Account {account_id!r} references unknown bank_id {bank_id!r}; it must match data/banks/banks.csv")
        bank_key = bank_key_by_id.get(bank_id, "")
        if not bank_key:
            raise ValueError(f"Bank {bank_id!r} has no FD-options index entry in {options_file_for_index}")
        label = str(entry.get("label", "")).strip()
        supports_efd = entry.get("supports_efd", True)
        if not isinstance(supports_efd, bool):
            raise ValueError(f"accounts[{account_id!r}].supports_efd must be a boolean")
        try:
            balance = float(entry.get("balance", 0.0))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"accounts[{account_id!r}].balance must be a number") from exc
        if not isfinite(balance) or balance < 0:
            raise ValueError(f"Starting balance for account {account_id!r} must be finite and non-negative")
        account_ids.add(account_id)
        if bank_id not in bank_ids:
            bank_ids.append(bank_id)
        accounts.append(Account(id=account_id, bank_key=bank_key, label=label, balance=balance, supports_efd=supports_efd, bank_id=bank_id))

    options_file_value = str(config.get("options_file", "data/fd_options/fd_options.csv"))
    options_path = Path(options_file_value).expanduser()
    if not options_path.is_absolute():
        config_relative = path.parent / options_path
        repo_relative = Path(__file__).resolve().parent.parent / options_path
        options_path = config_relative if config_relative.exists() else repo_relative
    options_path = options_path.resolve()
    if not options_path.is_file():
        raise FileNotFoundError(f"FD options file not found: {options_path}")

    if options_path.suffix.lower() != ".csv":
        raise ValueError("Only the bank-specific FD options CSV index is supported")

    options = load_options_from_bank_csv(
        options_path,
        bank_ids=bank_ids,
    )

    consolidation_account_id = str(
        config.get("consolidation_account_id", accounts[0].id)
    ).strip()
    if consolidation_account_id not in account_ids:
        raise ValueError(
            "consolidation_account_id must reference an account ID defined in 'accounts'; "
            f"got {consolidation_account_id!r}"
        )

    for account in accounts:
        eligible_options = [
            option for option in options
            if (not option.bank_id or option.bank_id == account.bank_id)
            and account.can_use_option(option)
        ]
        if not eligible_options:
            capability = "eFD-capable" if account.supports_efd else "standard-FD-only"
            raise ValueError(
                f"Account {account.id!r} ({account.bank_id}) is {capability}, "
                f"but no compatible standard/eFD products were loaded. Check the bank options CSV."
            )

    def build_schedule(raw_events: Any, kind: str) -> tuple[dict[date, list[dict[str, Any]]], list[dict[str, Any]]]:
        if not isinstance(raw_events, list):
            raise ValueError(f"'{kind}s' must be a list")
        schedule: dict[date, list[dict[str, Any]]] = {}
        summaries: list[dict[str, Any]] = []
        for index, entry in enumerate(raw_events):
            if not isinstance(entry, dict):
                raise ValueError(f"{kind}s[{index}] must be an object")
            name = str(entry.get("name") or f"{kind.title()} {index + 1}").strip()
            account_id = str(entry.get("account_id", "")).strip()
            if account_id not in account_ids:
                raise ValueError(f"{kind.title()} {name!r} targets unknown account {account_id!r}")
            try:
                amount = float(entry["amount"])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError(f"{kind.title()} {name!r} requires a numeric amount") from exc
            if not isfinite(amount) or amount <= 0:
                raise ValueError(f"{kind.title()} {name!r} amount must be finite and greater than zero")
            event_type = str(entry.get("type", "recurring")).strip().lower()
            if event_type not in {"recurring", "scheduled"}:
                raise ValueError(f"{kind.title()} {name!r} type must be 'recurring' or 'scheduled'")
            dates: list[date] = []
            if event_type == "scheduled":
                raw_dates = entry.get("dates")
                if not isinstance(raw_dates, list) or not raw_dates:
                    raise ValueError(f"{kind.title()} {name!r} scheduled events require a non-empty 'dates' list")
                dates = [_resolve_date(str(value), investment_start=start, investment_end=end) for value in raw_dates]
                if len(set(dates)) != len(dates):
                    raise ValueError(f"{kind.title()} {name!r} contains duplicate scheduled dates")
            else:
                interval = str(entry.get("interval", "")).strip().lower()
                try:
                    delta = parse_period_delta(interval)
                    if delta.years <= 0 and delta.months <= 0 and delta.days <= 0:
                        raise ValueError("interval must be positive")
                except (AttributeError, ValueError) as exc:
                    raise ValueError(
                        f"{kind.title()} {name!r} has invalid interval {interval!r}; "
                        "use a positive period such as '30d', '1m', or '1y'"
                    ) from exc
                first_value = entry.get("start_date")
                first_date = (
                    add_period(start, interval)
                    if first_value is None
                    else _resolve_date(str(first_value), investment_start=start, investment_end=end)
                )
                last_value = entry.get("end_date", "end")
                last_date = _resolve_date(str(last_value), investment_start=start, investment_end=end)
                if first_date < start or last_date > end or first_date > last_date:
                    raise ValueError(
                        f"{kind.title()} {name!r} dates must be within the investment period "
                        f"and start_date must not be after end_date"
                    )
                occurrence = 0
                current = first_date
                while current <= last_date:
                    dates.append(current)
                    occurrence += 1
                    current = first_date + delta * occurrence
            if any(day < start or day > end for day in dates):
                raise ValueError(f"{kind.title()} {name!r} has a date outside the investment period")
            policy = str(entry.get("payment_policy", "strict")).strip().lower() if kind == "outflow" else ""
            if kind == "outflow" and policy not in {"strict", "defer", "best_effort"}:
                raise ValueError(
                    f"Outflow {name!r} payment_policy must be 'strict', 'defer', or 'best_effort'"
                )
            for day in dates:
                if kind == "inflow":
                    day_amounts = schedule.setdefault(day, {})
                    day_amounts[account_id] = day_amounts.get(account_id, 0.0) + amount
                else:
                    schedule.setdefault(day, []).append({
                        "name": name,
                        "amount": amount,
                        "account_id": account_id,
                        "payment_policy": policy,
                        "type": event_type,
                    })
            summaries.append({
                "name": name,
                "amount": amount,
                "type": event_type,
                "account_id": account_id,
                "dates": dates,
                "occurrences": len(dates),
                "total": amount * len(dates),
                **({"payment_policy": policy} if kind == "outflow" else {}),
                **({"interval": interval, "start_date": dates[0], "end_date": dates[-1]} if event_type == "recurring" and dates else {}),
            })
        return schedule, summaries

    inflow_schedule, inflow_summaries = build_schedule(config.get("inflows", []), "inflow")
    outflow_schedule, outflow_summaries = build_schedule(config.get("outflows", []), "outflow")

    fees_data = config.get("transfer_fees", {})
    if not isinstance(fees_data, dict):
        raise ValueError("'transfer_fees' must be an object")
    custom_fees: dict[tuple[str, str], float] = {}
    for index, item in enumerate(fees_data.get("custom_fees", [])):
        if not isinstance(item, dict):
            raise ValueError(f"transfer_fees.custom_fees[{index}] must be an object")
        from_bank_id = str(item.get("from_bank_id", "")).strip()
        to_bank_id = str(item.get("to_bank_id", "")).strip()
        fee = float(item.get("amount", 0.0))
        if from_bank_id not in bank_registry or to_bank_id not in bank_registry:
            raise ValueError(f"Custom transfer fee at index {index} must reference valid from_bank_id/to_bank_id values from data/banks/banks.csv")
        if not isfinite(fee) or fee < 0:
            raise ValueError(f"Invalid custom transfer fee at index {index}")
        custom_fees[(from_bank_id.upper(), to_bank_id.upper())] = fee

    bank_fees: dict[str, tuple[float, float]] = {}
    for bank_id, bank_row in bank_registry.items():
        bank_key = bank_key_by_id.get(bank_id, "")
        if not bank_key:
            continue
        try:
            intra_fee = float(bank_row.get("intra_bank_transfer_fee") or fees_data.get("same_bank_fee", 0.0))
            inter_fee = float(bank_row.get("domestic_inter_bank_transfer_fee") or fees_data.get("default_inter_bank_fee", 30.0))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid transfer fee data for bank_id {bank_id!r}") from exc
        if not isfinite(intra_fee) or not isfinite(inter_fee) or intra_fee < 0 or inter_fee < 0:
            raise ValueError(f"Transfer fees for bank_id {bank_id!r} must be finite and non-negative")
        bank_fees[bank_id.upper()] = (intra_fee, inter_fee)

    fee_config = TransferFeeConfig(
        default_inter_bank_fee=float(fees_data.get("default_inter_bank_fee", 30.0)),
        same_bank_fee=float(fees_data.get("same_bank_fee", 0.0)),
        custom_fees=custom_fees,
        bank_fees=bank_fees,
    )
    if (
        not isfinite(fee_config.default_inter_bank_fee)
        or not isfinite(fee_config.same_bank_fee)
        or fee_config.default_inter_bank_fee < 0
        or fee_config.same_bank_fee < 0
    ):
        raise ValueError("Transfer fees must be finite and non-negative")

    decision_log_output_file = str(
        config.get("decision_log_output_file", "decision_log.json")
    ).strip()
    if not decision_log_output_file:
        raise ValueError("decision_log_output_file must be a non-empty path")

    strategy = str(config.get("strategy", "absolute")).strip().lower()
    if strategy not in {"absolute", "greedy", "gaml"}:
        raise ValueError(f"Unsupported strategy {strategy!r}; use 'absolute', 'greedy', or 'gaml'")

    return {
        "source_path": path,
        "options_path": options_path,
        "strategy": strategy,
        "accounts": accounts,
        "consolidation_account_id": consolidation_account_id,
        "options": options,
        "start": start,
        "end": end,
        "inflow_schedule": inflow_schedule,
        "inflow_summaries": inflow_summaries,
        "outflow_schedule": outflow_schedule,
        "outflow_summaries": outflow_summaries,
        "fee_config": fee_config,
        "compound": bool(config.get("compound", False)),
        "actual_leap_year": bool(config.get("actual_leap_year", True)),
        "show_timeline": bool(config.get("show_timeline", True)),
        "show_ledger": bool(config.get("show_ledger", False)),
        "decision_log_output_file": decision_log_output_file,
        "show_plots": bool(config.get("show_plots", True)),
        "plot_output_dir": str(config.get("plot_output_dir", "plots")),
    }
