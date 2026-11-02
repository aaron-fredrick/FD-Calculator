from datetime import date
import unittest

from core.models import Account, FDOption, TransferFeeConfig
from core.strategies.gaml import GAMLStrategy
from core.strategies.greedy import GreedyStrategy


class GAMLStrategyTests(unittest.TestCase):
    def setUp(self):
        self.start = date(2026, 1, 1)
        self.end = date(2026, 5, 1)
        self.accounts = [
            Account(id="com", bank_key="commercial", label="Commercial", balance=10000.0),
            Account(id="dfcc", bank_key="dfcc", label="DFCC", balance=0.0),
        ]
        self.options = [
            FDOption("Commercial 1m", "1m", 8.0, 10000.0, bank_key="commercial"),
            FDOption("DFCC 3m", "3m", 12.0, 20000.0, bank_key="dfcc"),
        ]
        self.inflows = {
            date(2026, 2, 1): {"com": 10000.0},
            date(2026, 3, 1): {"com": 10000.0},
        }
        self.fees = TransferFeeConfig(default_inter_bank_fee=30.0)

    def _simulate(self, strategy):
        return strategy.simulate(
            options=self.options,
            start=self.start,
            end=self.end,
            inflow_schedule=self.inflows,
            accounts=self.accounts,
            inflow_account_id="com",
            fee_config=self.fees,
            consolidation_account_id="com",
        )

    def test_budget_is_enforced_and_greedy_incumbent_is_preserved(self):
        result = self._simulate(GAMLStrategy(max_decisions=1))
        greedy = self._simulate(GreedyStrategy())

        self.assertEqual(result.strategy_name, "GAML")
        self.assertEqual(result.total_decisions_evaluated, 1)
        self.assertAlmostEqual(result.final_value, greedy.final_value, places=2)

    def test_gaml_never_returns_less_than_its_greedy_incumbent(self):
        result = self._simulate(GAMLStrategy(max_decisions=5000))
        greedy = self._simulate(GreedyStrategy())

        self.assertGreaterEqual(result.final_value + 0.01, greedy.final_value)

    def test_default_search_uses_bounded_beam_and_matches_greedy_floor(self):
        result = self._simulate(GAMLStrategy(beam_width=32))
        greedy = self._simulate(GreedyStrategy())

        self.assertEqual(result.strategy_name, "GAML")
        self.assertGreaterEqual(result.final_value + 0.01, greedy.final_value)
        self.assertIsNotNone(result.total_decisions_evaluated)

    def test_invalid_beam_width_is_rejected(self):
        with self.assertRaises(ValueError):
            GAMLStrategy(beam_width=0)

    def test_invalid_search_budget_is_rejected(self):
        with self.assertRaises(ValueError):
            GAMLStrategy(max_decisions=0)


if __name__ == "__main__":
    unittest.main()
