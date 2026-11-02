from datetime import date
import tempfile
import unittest
from pathlib import Path

from fd_cal import _write_decision_log

from core.models import Account, FDOption, TransferFeeConfig
from core.strategies.absolute import AbsoluteStrategy
from core.strategies.gaml import GAMLStrategy
from core.strategies.greedy import GreedyStrategy


class DecisionLogTests(unittest.TestCase):
    def test_carry_decision_logs_all_available_account_balances(self):
        result = GreedyStrategy().simulate(
            options=[FDOption("Commercial 1m", "1m", 8.0, 10000, bank_key="commercial")],
            start=date(2026, 1, 1),
            end=date(2026, 1, 1),
            inflow_schedule={},
            accounts=[
                Account("cash", "commercial", "Cash", 5000),
                Account("reserve", "commercial", "Reserve", 2500),
            ],
            inflow_account_id="cash",
            consolidation_account_id="cash",
        )
        carry = next(item for item in result.decision_log if item["action"] == "Carry cash forward")
        self.assertEqual(carry["available_funds"], {"cash": 5000, "reserve": 2500})
        self.assertTrue(carry["reason"])
        self.assertTrue(carry["next_milestone"])

        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "reports" / "decisions.txt"
            written = _write_decision_log(result, output, date(2026, 1, 1))
            report = written.read_text(encoding="utf-8")
            self.assertEqual(written, output)
            self.assertIn("FD CALCULATOR — DECISION / EXECUTION LOG", report)
            self.assertIn("Strategy          : Greedy", report)
            self.assertIn("Simulation period : 2026-01-01 to 2026-01-01", report)
            self.assertIn("CARRY CASH FORWARD", report)
            self.assertIn("Available balances before action:", report)
            self.assertIn("END OF LOG", report)

    def test_log_explains_selected_consolidation_for_each_strategy(self):
        strategies = [
            GreedyStrategy(),
            GAMLStrategy(max_decisions=1000),
            AbsoluteStrategy(),
        ]
        for strategy in strategies:
            with self.subTest(strategy=strategy.name):
                accounts = [
                    Account("dfcc-1", "dfcc", "DFCC standard", 10000, False),
                    Account("dfcc-2", "dfcc", "DFCC eFD A", 10000, True),
                    Account("dfcc-3", "dfcc", "DFCC eFD B", 10000, True),
                ]
                options = [
                    FDOption("DFCC eFD 1m", "1m", 12.0, 25000, bank_key="dfcc", is_efd=True),
                ]
                result = strategy.simulate(
                    options=options,
                    start=date(2026, 1, 1),
                    end=date(2026, 2, 1),
                    inflow_schedule={},
                    accounts=accounts,
                    inflow_account_id="dfcc-1",
                    fee_config=TransferFeeConfig(same_bank_fee=0.0),
                    consolidation_account_id="dfcc-1",
                )
                log = result.decision_log
                self.assertTrue(log)
                investment = next(item for item in log if item["product"] is not None)
                self.assertEqual(investment["action"], "Consolidate and invest")
                self.assertIn(investment["account_id"], {"dfcc-2", "dfcc-3"})
                self.assertEqual(investment["fd_type"], "eFD")
                self.assertEqual(investment["principal"], 30000)
                self.assertGreater(investment["expected_return"], 0)
                self.assertEqual(
                    investment["available_funds"],
                    {"dfcc-1": 10000, "dfcc-2": 10000, "dfcc-3": 10000},
                )
                self.assertTrue(investment["next_milestone"])
                self.assertTrue(investment["reason"])


if __name__ == "__main__":
    unittest.main()
