from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date
from typing import Optional

from core.models import Account, FDOption, SimResult, TransferFeeConfig


class BaseStrategy(ABC):
    """
    Contract that every investment strategy must implement.
    """

    name: str = "Unnamed"

    @abstractmethod
    def simulate(
        self,
        options: list[FDOption],
        start: date,
        end: date,
        inflow_schedule: dict[date, float],
        accounts: Optional[list[Account]] = None,
        inflow_account_id: Optional[str] = None,
        fee_config: Optional[TransferFeeConfig] = None,
        consolidation_account_id: Optional[str] = None,
    ) -> SimResult:
        """
        Run the strategy over the given horizon.
        """
