from datetime import date

from core.models import Account, Event, EventType, SimResult
from core.visualization import _cash_flow_series, _plot_account_lines


def test_cash_flow_series_categorizes_receipts_uses_and_transfers():
    day = date(2027, 1, 15)
    events = [
        Event(EventType.INFLOW, day, 1_000, "Monthly savings"),
        Event(EventType.OUTFLOW, day, 200, "Rent obligation seeded"),
        Event(EventType.OUTFLOW, day, -200, "Paid rent"),
        Event(EventType.BOOKING, day, 500, "Book FD"),
        Event(EventType.CASH_FLOW, day, 10, "Periodic interest"),
        Event(EventType.MATURITY, day, 510, "FD maturity"),
        Event(EventType.TRANSFER, day, 1_000, "Transfer to DFCC"),
        Event(EventType.TRANSFER, day, 970, "Transfer received from Commercial"),
    ]
    result = SimResult(
        strategy_name="Greedy",
        timeline={20270115: events},
        bookings=[],
        total_principal=500,
        end_date=day,
    )

    series = _cash_flow_series(result, day, day)

    assert dict(series["New money"]) == {day: 1_000}
    assert dict(series["Outflows"]) == {day: -200}
    assert dict(series["FD investments"]) == {day: -500}
    assert dict(series["FD payouts"]) == {day: 10}
    assert dict(series["FD maturities"]) == {day: 510}
    assert dict(series["Transfers out"]) == {day: -1_000}
    assert dict(series["Transfers in"]) == {day: 970}


def test_cash_flow_series_ignores_zero_value_opening_trigger_and_out_of_range_events():
    start = date(2027, 1, 1)
    end = date(2027, 1, 31)
    result = SimResult(
        strategy_name="Greedy",
        timeline={
            20270101: [Event(EventType.INFLOW, start, 0, "Opening balance trigger")],
            20270201: [Event(EventType.INFLOW, date(2027, 2, 1), 500, "Outside range")],
        },
        bookings=[],
        total_principal=0,
        end_date=end,
    )

    assert _cash_flow_series(result, start, end) == {}


def test_account_value_lines_use_consolidation_and_bank_relationship_styles():
    class RecordingAxis:
        def __init__(self):
            self.lines = []

        def plot(self, *args, **kwargs):
            self.lines.append(kwargs)

    accounts = [
        Account(id="comfp", bank_id="LK_COMMERCIAL_BANK_OF_CEYLON"),
        Account(id="comfs", bank_id="LK_COMMERCIAL_BANK_OF_CEYLON"),
        Account(id="dfcc", bank_id="LK_DFCC_BANK"),
    ]
    series = {
        "comfp": [100, 110],
        "comfs": [200, 210],
        "dfcc": [300, 310],
    }
    axis = RecordingAxis()

    _plot_account_lines(
        axis, [date(2027, 1, 1), date(2027, 1, 2)],
        series, {}, accounts, "comfs",
    )

    by_label = {line["label"]: line for line in axis.lines}
    assert by_label["comfs"]["linestyle"] == "-"
    assert by_label["comfp"]["linestyle"] == "--"
    assert by_label["dfcc"]["linestyle"] == ":"
    assert len({line["color"] for line in axis.lines}) == 3
    assert axis.lines[0]["label"] == "comfs"
