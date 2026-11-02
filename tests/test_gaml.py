from datetime import date
import unittest

from core.models import Account, FDOption, TransferFeeConfig
from core.strategies.gaml import (
    _best_option_by_projection,
    _pick_daily_gaml_plan,
    _project_cash_to_end,
)


class GAMLProjectionTests(unittest.TestCase):
    def test_cash_stays_liquid_when_no_product_matures_by_horizon(self):
        start = date(2026, 1, 1)
        end = date(2026, 6, 1)
        option = FDOption(
            label="12 months",
            period_str="12m",
            annual_rate=12.0,
            min_amount=1000.0,
            bank_key="bank_a",
        )

        result = _project_cash_to_end(
            10000.0, "bank_a", start, end, [option], False, True
        )

        self.assertEqual(result, 10000.0)

    def test_projection_reinvests_cash_when_a_term_fits(self):
        start = date(2026, 1, 1)
        end = date(2026, 4, 1)
        option = FDOption(
            label="1 month",
            period_str="1m",
            annual_rate=12.0,
            min_amount=1000.0,
            bank_key="bank_a",
        )

        result = _project_cash_to_end(
            10000.0, "bank_a", start, end, [option], False, True
        )

        self.assertGreater(result, 10000.0)

    def test_option_selection_is_bank_scoped(self):
        start = date(2026, 1, 1)
        end = date(2026, 4, 1)
        options = [
            FDOption("Commercial 1m", "1m", 20.0, 1000.0, bank_key="commercial"),
            FDOption("DFCC 1m", "1m", 10.0, 1000.0, bank_key="dfcc"),
        ]

        selected = _best_option_by_projection(
            options, 10000.0, "dfcc", start, end, False, True
        )

        self.assertIsNotNone(selected)
        self.assertEqual(selected.bank_key, "dfcc")
        self.assertEqual(selected.label, "DFCC 1m")

    def test_wait_action_can_pool_cash_with_next_event(self):
        today = date(2026, 1, 1)
        next_event = date(2026, 2, 1)
        end = date(2026, 5, 1)
        account = Account(id="a", bank_key="bank_a", label="A", balance=10000.0)
        options = [
            FDOption("1 month", "1m", 1.0, 10000.0, bank_key="bank_a"),
            FDOption("3 months", "3m", 40.0, 20000.0, bank_key="bank_a"),
        ]

        plan = _pick_daily_gaml_plan(
            all_accounts={"a": account},
            options=options,
            today=today,
            end=end,
            fee_config=TransferFeeConfig(),
            consolidation_account_id="a",
            compound=False,
            actual_leap_year=True,
            next_event_date=next_event,
            next_event_cash={"a": 10000.0},
        )

        self.assertEqual(plan["type"], "CARRY")
        self.assertEqual(plan["wait_until"], next_event)
        self.assertGreater(plan["projected_terminal_value"], 20000.0)

    def test_wait_values_cross_bank_pooling_at_next_event(self):
        today = date(2026, 1, 1)
        next_event = date(2026, 2, 1)
        end = date(2026, 5, 1)
        commercial = Account(id="com", bank_key="commercial", balance=10000.0)
        dfcc = Account(id="dfcc", bank_key="dfcc", balance=0.0)
        options = [
            FDOption("Commercial 1m", "1m", 1.0, 10000.0, bank_key="commercial"),
            FDOption("DFCC 3m", "3m", 40.0, 20000.0, bank_key="dfcc"),
        ]

        plan = _pick_daily_gaml_plan(
            all_accounts={"com": commercial, "dfcc": dfcc},
            options=options,
            today=today,
            end=end,
            fee_config=TransferFeeConfig(default_inter_bank_fee=30.0),
            consolidation_account_id="com",
            compound=False,
            actual_leap_year=True,
            next_event_date=next_event,
            next_event_cash={"com": 10000.0},
        )

        self.assertEqual(plan["type"], "CARRY")
        self.assertEqual(plan["wait_until"], next_event)

    def test_projection_never_uses_another_banks_rate(self):
        today = date(2026, 1, 1)
        end = date(2026, 4, 1)
        options = [
            FDOption("Bank A 1m", "1m", 30.0, 1000.0, bank_key="bank_a"),
            FDOption("Bank B 1m", "1m", 1.0, 1000.0, bank_key="bank_b"),
        ]

        result_a = _project_cash_to_end(
            10000.0, "bank_a", today, end, options, False, True
        )
        result_b = _project_cash_to_end(
            10000.0, "bank_b", today, end, options, False, True
        )

        self.assertGreater(result_a, result_b)


if __name__ == "__main__":
    unittest.main()
