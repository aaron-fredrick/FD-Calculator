from __future__ import annotations

from core.strategies.absolute import AbsoluteStrategy


class GAMLStrategy(AbsoluteStrategy):
    """
    Bounded global portfolio optimiser.

    GAML uses the same portfolio state transitions and financial accounting as
    Absolute, but limits the number of search states it expands. The search
    retains Greedy's fully simulated result as a feasible incumbent, orders
    investment branches by immediate net return, and uses the existing
    upper-bound, dominance and transposition pruning.

    The deterministic decision budget gives a predictable computation ceiling.
    A completed better leaf replaces the incumbent; an interrupted or
    incomplete branch is never replayed.
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
