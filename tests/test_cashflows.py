from __future__ import annotations

import unittest
from datetime import date

from core.cashflows import process_outflows, validate_outflow_schedule
from core.models import Account, FDOption
from core.strategies import AbsoluteStrategy, GAMLStrategy, GreedyStrategy


class CashFlowStateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.day = date(2027, 1, 1)

    def test_strict_payment_rejects_insufficient_account_balance(self) -> None:
        balances = (("cash", 5000.0), ("other", 20000.0))
        updated, pending, paid, valid = process_outflows(
            self.day,
            balances,
            (),
            [{
                "name": "Tuition",
                "account_id": "cash",
                "amount": 6000.0,
                "payment_policy": "strict",
            }],
        )
        self.assertFalse(valid)
        self.assertEqual(updated, balances)
        self.assertEqual(paid, 0.0)
        self.assertEqual(pending[0][1], "cash")

    def test_defer_waits_for_full_amount_then_pays(self) -> None:
        first, pending, paid, valid = process_outflows(
            self.day,
            (("cash", 4000.0),),
            (),
            [{
                "name": "Rent",
                "account_id": "cash",
                "amount": 10000.0,
                "payment_policy": "defer",
            }],
        )
        self.assertTrue(valid)
        self.assertEqual(first, (("cash", 4000.0),))
        self.assertEqual(paid, 0.0)
        self.assertEqual(pending[0][2], 10000.0)

        second, pending, paid, valid = process_outflows(
            date(2027, 1, 2),
            (("cash", 12000.0),),
            pending,
            [],
        )
        self.assertTrue(valid)
        self.assertEqual(second, (("cash", 2000.0),))
        self.assertEqual(paid, 10000.0)
        self.assertEqual(pending, ())

    def test_best_effort_carries_only_unpaid_remainder(self) -> None:
        updated, pending, paid, valid = process_outflows(
            self.day,
            (("cash", 4000.0),),
            (),
            [{
                "name": "Utilities",
                "account_id": "cash",
                "amount": 10000.0,
                "payment_policy": "best_effort",
            }],
        )
        self.assertTrue(valid)
        self.assertEqual(updated, (("cash", 0.0),))
        self.assertEqual(paid, 4000.0)
        self.assertEqual(pending[0][2], 6000.0)

    def test_outflow_cannot_draw_from_another_account(self) -> None:
        updated, pending, paid, valid = process_outflows(
            self.day,
            (("cash", 0.0), ("savings", 50000.0)),
            (),
            [{
                "name": "Account-specific bill",
                "account_id": "cash",
                "amount": 1000.0,
                "payment_policy": "strict",
            }],
        )
        self.assertFalse(valid)
        self.assertEqual(updated, (("cash", 0.0), ("savings", 50000.0)))
        self.assertEqual(paid, 0.0)

    def test_validation_rejects_outside_dates_and_unknown_accounts(self) -> None:
        with self.assertRaisesRegex(ValueError, "outside the investment period"):
            validate_outflow_schedule(
                {date(2026, 12, 31): []},
                self.day,
                date(2027, 2, 1),
                {"cash"},
            )
        with self.assertRaisesRegex(ValueError, "unknown account"):
            validate_outflow_schedule(
                {self.day: [{
                    "account_id": "missing",
                    "amount": 1000.0,
                    "payment_policy": "strict",
                }]},
                self.day,
                date(2027, 2, 1),
                {"cash"},
            )


class StrategyCashFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.start = date(2027, 1, 1)
        self.account = Account(
            id="cash",
            bank_key="commercial",
            label="Cash",
            balance=0.0,
        )
        # The minimum is intentionally above available funds so the test
        # isolates cash-flow ordering from FD product selection.
        self.options = [
            FDOption(
                label="Test FD",
                period_str="1m",
                annual_rate=8.0,
                min_amount=100000.0,
                bank_key="commercial",
            )
        ]
        self.outflow = {
            self.start: [{
                "name": "Same-day bill",
                "amount": 10000.0,
                "account_id": "cash",
                "payment_policy": "strict",
            }]
        }

    def test_same_day_inflow_funds_strict_outflow_in_all_strategies(self) -> None:
        strategies = [
            GreedyStrategy(),
            AbsoluteStrategy(),
            GAMLStrategy(max_decisions=1000),
        ]
        for strategy in strategies:
            with self.subTest(strategy=strategy.name):
                result = strategy.simulate(
                    options=self.options,
                    start=self.start,
                    end=self.start,
                    inflow_schedule={self.start: {"cash": 10000.0}},
                    accounts=[self.account],
                    inflow_account_id="cash",
                    consolidation_account_id="cash",
                    outflow_schedule=self.outflow,
                )
                self.assertTrue(result.valid)
                self.assertEqual(result.total_outflows_paid, 10000.0)
                self.assertEqual(result.outstanding_outflows, [])
                self.assertEqual(result.accounts["cash"].balance, 0.0)

    def test_strict_failure_is_rejected_by_search_strategies(self) -> None:
        strict = {
            self.start: [{
                "name": "Unaffordable bill",
                "amount": 10000.0,
                "account_id": "cash",
                "payment_policy": "strict",
            }]
        }
        for strategy in [AbsoluteStrategy(), GAMLStrategy(max_decisions=1000)]:
            with self.subTest(strategy=strategy.name):
                with self.assertRaisesRegex(ValueError, "No feasible strategy"):
                    strategy.simulate(
                        options=self.options,
                        start=self.start,
                        end=self.start,
                        inflow_schedule={},
                        accounts=[Account("cash", "commercial", balance=5000.0)],
                        inflow_account_id="cash",
                        consolidation_account_id="cash",
                        outflow_schedule=strict,
                    )

    def test_defer_and_best_effort_report_unpaid_liabilities(self) -> None:
        for policy, expected_paid, expected_remaining in [
            ("defer", 0.0, 10000.0),
            ("best_effort", 5000.0, 5000.0),
        ]:
            with self.subTest(policy=policy):
                schedule = {
                    self.start: [{
                        "name": "Unfunded bill",
                        "amount": 10000.0,
                        "account_id": "cash",
                        "payment_policy": policy,
                    }]
                }
                result = GreedyStrategy().simulate(
                    options=self.options,
                    start=self.start,
                    end=self.start,
                    inflow_schedule={},
                    accounts=[Account("cash", "commercial", balance=5000.0)],
                    inflow_account_id="cash",
                    consolidation_account_id="cash",
                    outflow_schedule=schedule,
                )
                self.assertTrue(result.valid)
                self.assertEqual(result.total_outflows_paid, expected_paid)
                self.assertEqual(result.outstanding_outflows[0]["remaining"], expected_remaining)
                self.assertEqual(result.cash_retained, 5000.0 - expected_paid)
                self.assertEqual(result.cash_flow_net_worth, result.cash_retained - expected_remaining)
                self.assertEqual(result.total_outflows_due, expected_paid + expected_remaining)


if __name__ == "__main__":
    unittest.main()
