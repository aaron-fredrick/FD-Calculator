from __future__ import annotations

import argparse
import math
from collections import Counter
from pathlib import Path

from core.configuration import load_configuration
from core.strategies.absolute import _prune_dominated_options


def _format_count(log10_value: float) -> str:
    """Format a potentially enormous count without constructing the integer."""
    if log10_value == float("-inf"):
        return "0"
    if log10_value < 6:
        return f"{10 ** log10_value:,.0f}"
    exponent = math.floor(log10_value)
    mantissa = 10 ** (log10_value - exponent)
    return f"{mantissa:.3g}e{exponent:,}"


def _log10_geometric_sum(branching: int, depth: int) -> float:
    """log10(1 + B + ... + B**K), computed without huge integers."""
    if depth <= 0:
        return 0.0
    if branching <= 1:
        return math.log10(depth + 1)
    top = depth * math.log10(branching)
    # log10((B**(K+1)-1)/(B-1)), stable for large B**K.
    numerator_log = (depth + 1) * math.log10(branching)
    correction = math.log10(1 - branching ** (-(depth + 1)))
    return numerator_log + correction - math.log10(branching - 1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Estimate Absolute strategy search complexity from an FD config."
    )
    parser.add_argument(
        "-c", "--config", default="config.json",
        help="configuration JSON path (default: config.json)",
    )
    args = parser.parse_args()

    config = load_configuration(args.config)
    start, end = config["start"], config["end"]
    accounts = config["accounts"]
    all_options = config["options"]
    compound = config["compound"]

    effective = _prune_dominated_options(all_options, compound)
    by_bank: dict[str, list] = {}
    for option in effective:
        if option.fits_before(start, end):
            by_bank.setdefault(option.bank_key, []).append(option)

    # Local booking choices: each account may skip booking or choose one
    # eligible option. This deliberately ignores its current cash balance,
    # giving a configuration-level upper bound.
    per_account: list[tuple[str, int]] = []
    local_combinations = 1
    for account in accounts:
        count = len(by_bank.get(account.bank_key, []))
        per_account.append((account.id, count))
        local_combinations *= 1 + count
    local_nonempty = local_combinations - 1

    # A consolidation branch is generated per target account and eligible
    # option for that target bank. This is an upper bound because some states
    # have no transferable cash or insufficient principal.
    consolidation_choices = sum(
        len(by_bank.get(account.bank_key, [])) for account in accounts
    )

    # Absolute also has one carry-forward branch.
    branching = consolidation_choices + local_nonempty + 1

    # Each decision advances to a later event date. At most one decision can
    # occur per calendar date, so inclusive calendar days is a conservative K.
    decision_depth = (end - start).days + 1

    leaves_log10 = decision_depth * math.log10(branching) if branching > 0 else float("-inf")
    nodes_log10 = _log10_geometric_sum(branching, decision_depth)

    total_options_by_bank = Counter(option.bank_key for option in all_options)
    effective_by_bank = Counter(option.bank_key for option in effective)
    horizon_by_bank = Counter(
        option.bank_key for option in effective if option.fits_before(start, end)
    )

    print("\n" + "=" * 76)
    print("  ABSOLUTE SEARCH COMPLEXITY ESTIMATE")
    print("=" * 76)
    print(f"  Config              : {Path(config['source_path'])}")
    print(f"  FD options          : {Path(config['options_path'])}")
    print(f"  Investment window   : {start} -> {end} ({(end - start).days + 1} days, inclusive)")
    print(f"  Accounts (A)        : {len(accounts)}")
    print(f"  Decision depth (K)  : <= {decision_depth} calendar dates")
    print()
    print("  Effective options after Absolute's dominated-option pruning:")
    for bank in sorted({a.bank_key for a in accounts}):
        print(
            f"    {bank:<18} loaded={total_options_by_bank[bank]:>3}  "
            f"effective={effective_by_bank[bank]:>3}  "
            f"fit within horizon={horizon_by_bank[bank]:>3}"
        )

    print()
    print("  Local booking choices (per account; amount/minimum not evaluated):")
    for account_id, count in per_account:
        print(f"    {account_id:<18} eligible options={count:>3}  choices including skip={count + 1:>3}")

    print()
    print("  Branching-factor upper bound:")
    print(f"    Consolidation choices (Q) : {consolidation_choices:,}")
    print(f"    Local booking combinations (C) : {local_nonempty:,}")
    print("    Carry-forward choices     : 1")
    print(f"    B <= Q + C + 1            : {branching:,}")
    print()
    print("  Unpruned search-tree upper bounds:")
    print(f"    Maximum leaves (B^K)      : <= {_format_count(leaves_log10)}")
    print(f"    Total nodes (sum B^0..B^K): <= {_format_count(nodes_log10)}")
    print()
    print("  Complexity variables:")
    print(f"    A = accounts                         : {len(accounts):,}")
    print(f"    O = effective FD options             : {len(effective):,}")
    print(f"    C = local booking combinations       : {local_nonempty:,}")
    print(f"    Q = consolidation choices            : {consolidation_choices:,}")
    print(f"    B = branching-factor upper bound     : {branching:,}")
    print(f"    K = maximum decision depth           : {decision_depth:,}")
    print("    F = pending cash-flow entries        : runtime-dependent")
    print("    S = retained memoised states         : runtime-dependent")
    print()
    print("  Substituted worst-case complexity:")
    print(
        f"    Time  : O({branching:,}^{decision_depth:,} * "
        f"({local_nonempty:,} log {local_nonempty:,} + "
        f"{consolidation_choices:,} log {consolidation_choices:,} + "
        f"{len(accounts):,} + F))"
    )
    print(
        f"    Space : O(S * ({len(accounts):,} + F) + "
        f"{decision_depth:,} * ({local_nonempty:,} + {consolidation_choices:,}))"
    )
    print(
        f"          = O(S * ({len(accounts):,} + F) + "
        f"{decision_depth * (local_nonempty + consolidation_choices):,})"
    )
    print("    F and S are runtime-dependent, not configuration constants.")
    print()
    print("  Interpretation / limitations:")
    print("    - These are conservative structural upper bounds, not expected counts.")
    print("    - K uses every calendar day; actual decision dates are event-driven.")
    print("    - Option counts ignore current balances and minimum-deposit feasibility.")
    print("    - Branch-and-bound, memoisation, and cash/fee constraints reduce actual work.")
    print("    - Absolute has no fixed decision budget; worst-case growth remains exponential.")
    print("=" * 76)


if __name__ == "__main__":
    main()
