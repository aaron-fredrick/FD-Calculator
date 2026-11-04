from contextlib import redirect_stdout
from datetime import date
from io import StringIO
import unittest

from core.models import Account, Event, EventType, SimResult
from core.reporting import print_event_timeline


class EventTimelineTests(unittest.TestCase):
    def test_hides_zero_opening_trigger_and_labels_transfer_channels(self):
        day = date(2026, 11, 3)
        accounts = {
            "com-primary": Account("com-primary", "COM", "Comm Flash Primary"),
            "com-savings": Account("com-savings", "COM", "Comm Flash Savings"),
            "dfcc": Account("dfcc", "DFCC", "DFCC Savings"),
        }
        events = [
            Event(
                EventType.INFLOW, day, 0.0, "Opening balance trigger",
                account_id="com-primary",
            ),
            Event(
                EventType.TRANSFER, day, 1000.0, "Transfer to Comm Flash Savings",
                account_id="com-primary", transfer_channel="intra_bank",
            ),
            Event(
                EventType.TRANSFER, day, 970.0, "Transfer received from Comm Flash Primary",
                account_id="com-savings", transfer_channel="intra_bank",
            ),
            Event(
                EventType.TRANSFER, day, 2000.0, "Transfer to DFCC Savings",
                account_id="com-savings", transfer_channel="domestic_ceft",
            ),
            Event(
                EventType.TRANSFER, day, 1970.0, "Transfer received from Comm Flash Savings",
                account_id="dfcc", transfer_channel="domestic_ceft",
            ),
        ]
        result = SimResult(
            strategy_name="GAML",
            timeline={20261103: events},
            bookings=[],
            total_principal=0.0,
            end_date=day,
            accounts=accounts,
        )

        output = StringIO()
        with redirect_stdout(output):
            print_event_timeline(result)
        rendered = output.getvalue()

        self.assertNotIn("Opening balance trigger", rendered)
        self.assertNotIn("[INFLOW]", rendered)
        self.assertEqual(rendered.count("[INTRA-BANK]"), 2)
        self.assertEqual(rendered.count("[DOMESTIC CEFT]"), 2)


if __name__ == "__main__":
    unittest.main()
