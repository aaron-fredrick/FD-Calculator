from datetime import date
import io
import unittest
from contextlib import redirect_stdout

from core.models import Account, Booking, Event, EventType, FDOption, SimResult, PERIODIC_INTEREST
from core.reporting import print_event_timeline


class TimelineReportingTests(unittest.TestCase):
    def test_transfer_fee_and_fd_cash_flows_are_split_into_clear_rows(self):
        start = date(2026, 1, 1)
        month = date(2026, 2, 1)
        maturity = date(2026, 3, 1)
        option = FDOption(
            "Monthly payout FD",
            "2m",
            12.0,
            10000.0,
            payout_type=PERIODIC_INTEREST,
            payout_period_str="1m",
            bank_key="commercial",
            bank_id="commercial",
        )
        booking = Booking(
            option=option,
            principal=10000.0,
            start=start,
            cash_flows=[(month, 100.0), (maturity, 10100.0)],
            account_id="com",
            bank_key="commercial",
            bank_id="commercial",
        )
        events = [
            Event(
                EventType.TRANSFER, start, 1000.0,
                "Transfer to DFCC (Amt: 970.00, Fee: 30.00)",
                account_id="com", transfer_channel="domestic_ceft",
                fee=30.0, balance_after=0.0,
            ),
            Event(
                EventType.TRANSFER, start, 970.0,
                "Transfer received from Commercial",
                account_id="dfcc", transfer_channel="domestic_ceft",
                balance_after=970.0,
            ),
            Event(
                EventType.CASH_FLOW, month, 90.0,
                "Cash flow [FD-0001]", booking_ref="FD-0001",
                account_id="com", balance_after=100.0,
            ),
            Event(
                EventType.MATURITY, maturity, 10090.0,
                "Maturity [FD-0001]", booking_ref="FD-0001",
                account_id="com", balance_after=10200.0,
            ),
        ]
        result = SimResult(
            strategy_name="Test",
            timeline={
                20260101: events[:2],
                20260201: [events[2]],
                20260301: [events[3]],
            },
            bookings=[booking],
            total_principal=10000.0,
            end_date=maturity,
            ait_enabled=True,
            ait_rate=0.10,
            accounts={
                "com": Account(id="com", bank_id="commercial", bank_key="commercial", label="Commercial"),
                "dfcc": Account(id="dfcc", bank_id="dfcc", bank_key="dfcc", label="DFCC"),
            },
        )

        output = io.StringIO()
        with redirect_stdout(output):
            print_event_timeline(result)
        rendered = output.getvalue()

        self.assertIn("INTER-BANK TO", rendered)
        self.assertIn("-970.00", rendered)
        self.assertIn("+30.00", rendered)  # intermediate source balance before fee
        self.assertIn("INTER-BANK TF", rendered)
        self.assertIn("-30.00", rendered)
        self.assertIn("INTER-BANK TI", rendered)
        self.assertIn("+970.00", rendered)
        self.assertIn("MONTH INTEREST", rendered)
        self.assertIn("MATURE PRINCIPAL", rendered)
        self.assertIn("MATURE INTEREST", rendered)
        self.assertIn("+10,000.00", rendered)
        self.assertIn("+100.00", rendered)
        self.assertIn("AIT WITHHELD", rendered)
        self.assertIn("-10.00", rendered)
        self.assertIn("INFLOW", rendered)
        self.assertIn("CARRY FORWARD", rendered)
        self.assertNotIn("[INFLOW]", rendered)
        self.assertNotIn("[CARRY]", rendered)


if __name__ == "__main__":
    unittest.main()
