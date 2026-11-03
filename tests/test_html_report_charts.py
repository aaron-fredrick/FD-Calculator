from datetime import date
import unittest

from core.html_report import _build_account_balance_series
from core.models import Account, Booking, Event, EventType, FDOption, SimResult


class HtmlReportAccountChartTests(unittest.TestCase):
    def setUp(self):
        self.start = date(2027, 1, 1)

    def test_event_stages_capture_intra_day_transfer_fee_and_booking_order(self):
        commercial = Account("commercial", "LK_COMMERCIAL_BANK_OF_CEYLON", "Commercial Flash Savings", 0)
        dfcc = Account("dfcc", "LK_DFCC_BANK", "DFCC Savings", 0)
        option = FDOption("Commercial 1M", "1m", 10.0, bank_id="LK_COMMERCIAL_BANK_OF_CEYLON")
        booking = Booking(option, 21_005.0, self.start, [(date(2027, 2, 1), 21_180.0)], "commercial", bank_id=option.bank_id)
        events = [
            Event(EventType.INFLOW, self.start, 11_000.0, "INFLOW", account_id="commercial"),
            Event(EventType.TRANSFER, self.start, 21_005.0, "Transfer to DFCC Savings", account_id="commercial", bank_id=commercial.bank_id, fee=25.0, transfer_channel="domestic_ceft"),
            Event(EventType.TRANSFER, self.start, 21_005.0, "Transfer received from Commercial Flash Savings", account_id="dfcc", bank_id=dfcc.bank_id, transfer_channel="domestic_ceft"),
            Event(EventType.BOOKING, self.start, 21_005.0, "Book Commercial 1M", booking_ref="FD-0001", account_id="dfcc", bank_id=commercial.bank_id),
        ]
        # The FD destination bank is the product bank, not the source account bank.
        booking.account_id = "dfcc"
        result = SimResult("Greedy", {20270101: events}, [booking], 21_005.0, self.start,
                           accounts={"commercial": commercial, "dfcc": dfcc})
        chart = _build_account_balance_series(result, {"commercial": 10_030.0, "dfcc": 0.0},
                                              self.start, date(2027, 2, 1), "commercial")
        self.assertEqual([p["stage"] for p in chart["stages"]], ["S1", "S2", "S3", "S4", "S5"])
        self.assertEqual([p["event"] for p in chart["stages"]][1], "INTER-BANK TO · DFCC Savings")
        self.assertEqual([p["event"] for p in chart["stages"]][2], "INTER-BANK TF")
        self.assertEqual([p["event"] for p in chart["stages"]][3], "INTER-BANK TI")
        commercial_points = chart["accounts"][0]["points"]
        dfcc_points = chart["accounts"][1]["points"]
        self.assertEqual([p["y"] for p in commercial_points], [21_030.0, 25.0, 0.0, 0.0, 0.0])
        self.assertEqual([p["y"] for p in dfcc_points], [0.0, 0.0, 0.0, 21_005.0, 0.0])
        self.assertEqual(chart["fd_principal"][0]["points"][-1]["y"], 21_005.0)

    def test_fd_principal_aggregates_by_bank_and_only_changes_on_booking_and_maturity(self):
        account = Account("cash", "LK_COMMERCIAL_BANK_OF_CEYLON", "Commercial Cash", 0)
        opt = FDOption("Commercial FD", "1m", 10.0, bank_id=account.bank_id)
        first = Booking(opt, 10_000.0, self.start, [(date(2027, 2, 1), 10_100.0)], "cash", bank_id=account.bank_id)
        second = Booking(opt, 20_000.0, self.start, [(date(2027, 3, 1), 20_200.0)], "cash", bank_id=account.bank_id)
        events = [
            Event(EventType.BOOKING, self.start, 10_000.0, "Book first", booking_ref="FD-0001", account_id="cash", bank_id=account.bank_id),
            Event(EventType.BOOKING, self.start, 20_000.0, "Book second", booking_ref="FD-0002", account_id="cash", bank_id=account.bank_id),
            Event(EventType.CASH_FLOW, date(2027, 1, 15), 50.0, "Periodic interest", booking_ref="FD-0001", account_id="cash", bank_id=account.bank_id),
            Event(EventType.MATURITY, date(2027, 2, 1), 10_100.0, "Maturity first", booking_ref="FD-0001", account_id="cash", bank_id=account.bank_id),
        ]
        result = SimResult("Greedy", {20270101: events[:2], 20270115: events[2:3], 20270201: events[3:]},
                           [first, second], 30_000.0, date(2027, 2, 1), accounts={"cash": account})
        chart = _build_account_balance_series(result, {"cash": 30_000.0}, self.start,
                                              date(2027, 2, 1), "cash")
        values = [p["y"] for p in chart["fd_principal"][0]["points"]]
        self.assertEqual(values, [10_000.0, 30_000.0, 30_000.0, 20_000.0])
        self.assertEqual(chart["fd_principal"][0]["lineStyle"], "solid")

    def test_bank_hsv_palette_prioritizes_consolidation_bank_and_muted_fd_color(self):
        accounts = {
            "main": Account("main", "LK_COMMERCIAL_BANK_OF_CEYLON", "Commercial", 1_000.0),
            "same": Account("same", "LK_COMMERCIAL_BANK_OF_CEYLON", "Commercial Savings", 2_000.0),
            "other": Account("other", "LK_DFCC_BANK", "DFCC", 3_000.0),
        }
        result = SimResult("Greedy", {}, [], 0.0, self.start, accounts=accounts)
        chart = _build_account_balance_series(result, {k: v.balance for k, v in accounts.items()},
                                              self.start, date(2027, 1, 2), "main")
        by_name = {item["name"]: item for item in chart["accounts"]}
        self.assertEqual(by_name["Commercial"]["lineStyle"], "solid")
        self.assertEqual(by_name["Commercial Savings"]["lineStyle"], "dashed")
        self.assertEqual(by_name["DFCC"]["lineStyle"], "dotted")
        self.assertEqual(by_name["Commercial"]["color"], by_name["Commercial Savings"]["color"])
        self.assertNotEqual(by_name["Commercial"]["color"], by_name["DFCC"]["color"])
        self.assertEqual(chart["fd_principal"], [])

    def test_stage_number_resets_each_day_and_each_series_has_every_stage(self):
        account = Account("cash", "LK_COMMERCIAL_BANK_OF_CEYLON", "Cash", 100.0)
        result = SimResult("Greedy", {
            20270101: [Event(EventType.INFLOW, self.start, 10.0, "Deposit", account_id="cash")],
            20270102: [Event(EventType.OUTFLOW, date(2027, 1, 2), -5.0, "Payment", account_id="cash")],
        }, [], 0.0, date(2027, 1, 2), accounts={"cash": account})
        chart = _build_account_balance_series(result, {"cash": 100.0}, self.start,
                                              date(2027, 1, 2), "cash")
        self.assertEqual([p["stage"] for p in chart["stages"]], ["S1", "S1"])
        self.assertEqual(len(chart["accounts"][0]["points"]), 2)
        self.assertEqual([p["y"] for p in chart["accounts"][0]["points"]], [110.0, 105.0])


if __name__ == "__main__":
    unittest.main()
