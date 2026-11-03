from datetime import date
import unittest

from core.html_report import _build_account_balance_series
from core.models import Account, Event, EventType, FDOption, SimResult
from core.strategies.greedy import GreedyStrategy


class HtmlReportAccountChartTests(unittest.TestCase):
    def test_account_history_ignores_unposted_outflow_placeholder_and_tracks_cash_flows(self):
        start = date(2027, 1, 1)
        day_2 = date(2027, 1, 2)
        day_3 = date(2027, 1, 3)
        day_4 = date(2027, 1, 4)
        account = Account(
            id="cash",
            bank_id="LK_COMMERCIAL_BANK_OF_CEYLON",
            label="Commercial Primary",
            balance=500.0,
        )
        events = [
            Event(
                EventType.INFLOW, start, 1_000.0, "Deposit",
                account_id="cash", balance_after=1_500.0,
            ),
            # Positive OUTFLOW is an obligation marker, not a posted transaction.
            # Event.balance_after remains its -1 default sentinel.
            Event(
                EventType.OUTFLOW, start, 200.0, "Rent obligation",
                account_id="cash",
            ),
            Event(
                EventType.OUTFLOW, start, -200.0, "Paid rent",
                account_id="cash", balance_after=1_300.0,
            ),
            Event(
                EventType.CASH_FLOW, day_2, 25.0, "Periodic interest",
                account_id="cash", balance_after=1_325.0,
            ),
            Event(
                EventType.MATURITY, day_3, 1_000.0, "FD maturity",
                account_id="cash", balance_after=2_325.0,
            ),
            Event(
                EventType.TRANSFER, day_4, 300.0, "Transfer to DFCC Savings",
                account_id="cash", balance_after=2_025.0,
            ),
        ]
        result = SimResult(
            strategy_name="Greedy",
            timeline={
                20270101: events[:3],
                20270102: events[3:4],
                20270103: events[4:5],
                20270104: events[5:],
            },
            bookings=[],
            total_principal=1_000.0,
            end_date=day_4,
            accounts={"cash": account},
        )

        series = _build_account_balance_series(
            result, {"cash": 500.0}, start, day_4, "cash"
        )

        self.assertEqual(series[0]["points"], [
            {"x": "2027-01-01", "y": 1_300.0},
            {"x": "2027-01-02", "y": 1_325.0},
            {"x": "2027-01-03", "y": 2_325.0},
            {"x": "2027-01-04", "y": 2_025.0},
        ])

    def test_real_strategy_periodic_payouts_and_maturity_change_account_history(self):
        start = date(2027, 1, 1)
        end = date(2027, 4, 1)
        account = Account(
            id="cash",
            bank_id="LK_COMMERCIAL_BANK_OF_CEYLON",
            label="Commercial Primary",
            balance=0.0,
        )
        option = FDOption(
            label="Quarterly periodic FD",
            period_str="3m",
            annual_rate=12.0,
            min_amount=100_000.0,
            payout_type="periodic_interest",
            payout_period_str="1m",
            bank_key="commercial",
            bank_id="LK_COMMERCIAL_BANK_OF_CEYLON",
        )
        result = GreedyStrategy(ait_enabled=True).simulate(
            options=[option],
            start=start,
            end=end,
            inflow_schedule={start: {"cash": 100_000.0}},
            accounts=[account],
            inflow_account_id="cash",
            consolidation_account_id="cash",
        )

        series = _build_account_balance_series(
            result, {"cash": 0.0}, start, end, "cash"
        )
        values = {point["x"]: point["y"] for point in series[0]["points"]}

        # The chart tracks liquid cash only: booking moves the deposit into
        # the separate FD, so the bank-account balance falls to zero.
        self.assertEqual(values["2027-01-01"], 0.0)
        self.assertEqual(values["2027-01-31"], 0.0)
        self.assertGreater(values["2027-02-01"], values["2027-01-31"])
        self.assertGreater(values["2027-03-01"], values["2027-02-28"])
        self.assertGreater(values["2027-04-01"], values["2027-03-31"])
        self.assertAlmostEqual(
            values["2027-04-01"],
            100_000.0 + result.total_interest - result.ait_withheld,
            places=2,
        )
        self.assertTrue(any(
            event.event_type == EventType.CASH_FLOW
            for events in result.timeline.values() for event in events
        ))
        self.assertTrue(any(
            event.event_type == EventType.MATURITY
            for events in result.timeline.values() for event in events
        ))

    def test_account_history_uses_distinct_colors_and_relationship_line_styles(self):
        accounts = {
            "commercial-primary": Account(
                "commercial-primary", "LK_COMMERCIAL_BANK_OF_CEYLON",
                "Commercial Primary", balance=10_000.0,
            ),
            "commercial-savings": Account(
                "commercial-savings", "LK_COMMERCIAL_BANK_OF_CEYLON",
                "Commercial Savings", balance=20_000.0,
            ),
            "dfcc": Account(
                "dfcc", "LK_DFCC_BANK", "DFCC Savings", balance=30_000.0,
            ),
        }
        result = SimResult(
            strategy_name="Greedy",
            timeline={},
            bookings=[],
            total_principal=0.0,
            end_date=date(2027, 1, 2),
            accounts=accounts,
        )

        series = _build_account_balance_series(
            result,
            {account_id: account.balance for account_id, account in accounts.items()},
            date(2027, 1, 1),
            date(2027, 1, 2),
            "commercial-primary",
        )

        by_name = {item["name"]: item for item in series}
        self.assertEqual(by_name["Commercial Primary"]["lineStyle"], "solid")
        self.assertEqual(by_name["Commercial Savings"]["lineStyle"], "dashed")
        self.assertEqual(by_name["DFCC Savings"]["lineStyle"], "dotted")
        self.assertEqual(len({item["color"] for item in series}), 3)
        self.assertEqual(by_name["Commercial Primary"]["points"][0]["y"], 10_000.0)
        self.assertEqual(by_name["Commercial Savings"]["points"][0]["y"], 20_000.0)


if __name__ == "__main__":
    unittest.main()
