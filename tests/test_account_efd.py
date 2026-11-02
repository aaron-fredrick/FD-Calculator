from datetime import date
import unittest

from core.models import Account, FDOption, TransferFeeConfig
from core.strategies.greedy import GreedyStrategy


class AccountEFDStrategyTests(unittest.TestCase):
    def test_consolidation_targets_an_efd_capable_account_at_same_bank(self):
        accounts = [
            Account(id="dfcc-1", bank_key="dfcc", label="DFCC standard", balance=10_000, supports_efd=False),
            Account(id="dfcc-2", bank_key="dfcc", label="DFCC eFD A", balance=10_000, supports_efd=True),
            Account(id="dfcc-3", bank_key="dfcc", label="DFCC eFD B", balance=10_000, supports_efd=True),
        ]
        options = [
            FDOption("DFCC Standard 1m", "1m", 9.0, min_amount=25_000, bank_key="dfcc", is_efd=False),
            FDOption("DFCC eFD 1m", "1m", 12.0, min_amount=25_000, bank_key="dfcc", is_efd=True),
        ]

        result = GreedyStrategy().simulate(
            options=options,
            start=date(2026, 1, 1),
            end=date(2026, 3, 1),
            inflow_schedule={},
            accounts=accounts,
            inflow_account_id="dfcc-1",
            fee_config=TransferFeeConfig(same_bank_fee=0.0),
            consolidation_account_id="dfcc-1",
        )

        self.assertTrue(result.valid)
        self.assertEqual(len(result.bookings), 1)
        booking = result.bookings[0]
        self.assertEqual(booking.account_id, "dfcc-2")
        self.assertTrue(booking.option.is_efd)
        self.assertEqual(booking.principal, 30_000)

