from datetime import date
import unittest

from core.models import Account, Booking, FDOption, SimResult, TransferFeeConfig
from core.strategies.gaml import GAMLStrategy, _prune_dominated_options
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

    def test_efd_is_preferred_when_standard_product_has_identical_terms(self):
        account = Account(
            id="com",
            bank_key="commercial",
            label="Commercial",
            balance=10000.0,
            supports_efd=True,
        )
        standard = FDOption(
            "Commercial Standard",
            "1m",
            8.0,
            10000.0,
            bank_key="commercial",
            is_efd=False,
        )
        efd = FDOption(
            "Commercial eFD",
            "1m",
            8.0,
            10000.0,
            bank_key="commercial",
            is_efd=True,
        )
        result = GreedyStrategy().simulate(
            options=[standard, efd],
            start=self.start,
            end=self.end,
            inflow_schedule={},
            accounts=[account],
            inflow_account_id="com",
            fee_config=self.fees,
            consolidation_account_id="com",
        )
        self.assertTrue(result.bookings)
        self.assertTrue(result.bookings[0].option.is_efd)

    def test_greedy_applies_ait_before_reinvesting_fd_proceeds(self):
        account = Account(
            id="com", bank_key="commercial", label="Commercial", balance=10000.0
        )
        option = FDOption(
            "Commercial 1m", "1m", 10.0, 10000.0, bank_key="commercial"
        )
        result = GreedyStrategy(ait_enabled=True).simulate(
            options=[option],
            start=self.start,
            end=date(2026, 3, 1),
            inflow_schedule={},
            accounts=[account],
            inflow_account_id="com",
            fee_config=self.fees,
            consolidation_account_id="com",
        )
        self.assertGreater(result.ait_withheld, 0.0)
        self.assertTrue(result.ait_enabled)
        first_booking = result.bookings[0]
        gross_payout = first_booking.cash_flows[0][1]
        payout_events = [
            event
            for events in result.timeline.values()
            for event in events
            if event.booking_ref == "FD-0001" and event.event_type.value in {"cash_flow", "maturity"}
        ]
        self.assertTrue(payout_events)
        self.assertLess(payout_events[0].amount, gross_payout)
        self.assertAlmostEqual(
            payout_events[0].amount,
            first_booking.option.generate_cash_flows_after_ait(
                first_booking.principal, first_booking.start, 0.10
            )[0][1],
        )

    def test_ait_is_included_in_strategy_objective_when_enabled(self):
        option = FDOption(
            "Commercial Standard",
            "1m",
            10.0,
            10000.0,
            bank_key="commercial",
        )
        booking = Booking(
            option=option,
            principal=10000.0,
            start=self.start,
            cash_flows=[(date(2026, 2, 1), 11000.0)],
        )
        result = SimResult(
            strategy_name="Test",
            timeline={},
            bookings=[booking],
            total_principal=10000.0,
            end_date=date(2026, 2, 1),
            total_transfer_fees=100.0,
            ait_enabled=True,
            ait_rate=0.10,
        )

        self.assertAlmostEqual(result.total_interest, 1000.0)
        self.assertAlmostEqual(result.ait_withheld, 100.0)
        self.assertAlmostEqual(result.net_interest, 800.0)
        self.assertAlmostEqual(result.net_interest_after_ait, 800.0)
        self.assertAlmostEqual(result.final_value, 10800.0)
        self.assertAlmostEqual(result.final_value_after_ait, 10800.0)

    def test_ait_is_withheld_from_interest_before_periodic_cash_is_reinvested(self):
        option = FDOption(
            "Monthly payout FD",
            "2m",
            12.0,
            10000.0,
            payout_type="periodic_interest",
            payout_period_str="1m",
            bank_key="commercial",
        )
        gross = option.generate_cash_flows(
            10000.0, self.start, compound=False, actual_leap_year=False
        )
        net = option.generate_cash_flows_after_ait(
            10000.0, self.start, ait_rate=0.10,
            compound=False, actual_leap_year=False,
        )
        self.assertEqual(len(gross), len(net))
        self.assertAlmostEqual(
            sum(amount for _, amount in gross) - sum(amount for _, amount in net),
            sum(round((amount - (10000.0 if i == len(gross) - 1 else 0.0)) * 0.10, 2)
                for i, (_, amount) in enumerate(gross)),
        )
        self.assertAlmostEqual(net[-1][1] - 10000.0, (gross[-1][1] - 10000.0) * 0.90, places=2)

    def test_ait_disabled_preserves_gross_cash_flows(self):
        option = FDOption("Cumulative FD", "1m", 10.0, 10000.0)
        gross = option.generate_cash_flows(10000.0, self.start)
        net = option.generate_cash_flows_after_ait(10000.0, self.start, ait_rate=0.0)
        self.assertEqual(gross, net)

    def test_dominance_pruning_preserves_distinct_payout_schedules(self):
        cumulative = FDOption(
            "Higher-rate cumulative",
            "6m",
            12.0,
            10000.0,
            payout_type="cumulative",
            bank_key="commercial",
        )
        periodic = FDOption(
            "Lower-rate monthly payout",
            "6m",
            10.0,
            10000.0,
            payout_type="periodic_interest",
            payout_period_str="1m",
            bank_key="commercial",
        )

        retained = _prune_dominated_options([cumulative, periodic], compound=False)

        self.assertIn(cumulative, retained)
        self.assertIn(periodic, retained)

    def test_dominance_pruning_still_removes_same_shape_dominated_options(self):
        shorter = FDOption(
            "Shorter cumulative",
            "3m",
            10.0,
            10000.0,
            payout_type="cumulative",
            bank_key="commercial",
        )
        dominated = FDOption(
            "Longer cumulative",
            "6m",
            9.0,
            15000.0,
            payout_type="cumulative",
            bank_key="commercial",
        )

        retained = _prune_dominated_options([shorter, dominated], compound=False)

        self.assertIn(shorter, retained)
        self.assertNotIn(dominated, retained)

    def test_invalid_beam_width_is_rejected(self):
        with self.assertRaises(ValueError):
            GAMLStrategy(beam_width=0)

    def test_invalid_search_budget_is_rejected(self):
        with self.assertRaises(ValueError):
            GAMLStrategy(max_decisions=0)


if __name__ == "__main__":
    unittest.main()
