from datetime import date
import unittest

from core.models import FDOption
from core.strategies.gaml import (
    _best_option_by_projection,
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


if __name__ == "__main__":
    unittest.main()
