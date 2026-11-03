from datetime import date
import unittest

from core.html_report import _build_account_balance_series
from core.models import Account, Event, EventType, SimResult


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
        timeline={20270101: events[:3], 20270102: events[3:4],
                  20270103: events[4:5], 20270104: events[5:]},
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
