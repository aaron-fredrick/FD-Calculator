from __future__ import annotations

import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from core.interest import add_period

from core.configuration import load_configuration


class ConfigurationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.options_path = self.root / "options.json"
        self.options_path.write_text(
            json.dumps({
                "commercial": [{
                    "label": "One Month",
                    "period": "1m",
                    "annual_rate": 8.0,
                    "min_amount": 1000.0,
                    "payout_type": "cumulative",
                }]
            }),
            encoding="utf-8",
        )
        self.config_path = self.root / "config.json"
        self.config = {
            "strategy": "greedy",
            "options_file": "options.json",
            "investment": {
                "start_date": "today",
                "end_date": "investment_start+1y",
            },
            "accounts": [{
                "id": "cash",
                "bank_key": "commercial",
                "label": "Cash",
                "balance": 2500.0,
            }],
            "inflow_account_id": "cash",
            "consolidation_account_id": "cash",
            "inflows": [{
                "name": "Monthly saving",
                "amount": 500.0,
                "interval": "1m",
                "start_date": "investment_start+1m",
                "account_id": "cash",
            }],
            "transfer_fees": {
                "default_inter_bank_fee": 30.0,
                "same_bank_fee": 0.0,
                "custom_fees": [],
            },
        }
        self._write_config()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_config(self) -> None:
        self.config_path.write_text(json.dumps(self.config), encoding="utf-8")

    def test_resolves_today_and_account_targeted_recurring_inflows(self) -> None:
        loaded = load_configuration(self.config_path)
        self.assertEqual(loaded["start"], date.today())
        self.assertEqual(loaded["end"], add_period(date.today(), "1y"))
        self.assertEqual(loaded["inflow_summaries"][0]["start_date"], add_period(date.today(), "1m"))
        summary = loaded["inflow_summaries"][0]
        self.assertEqual(summary["account_id"], "cash")
        self.assertEqual(summary["amount"], 500.0)
        self.assertGreaterEqual(summary["occurrences"], 1)
        self.assertTrue(all("cash" in amounts for amounts in loaded["inflow_schedule"].values()))
        self.assertEqual([option.bank_key for option in loaded["options"]], ["commercial"])

    def test_missing_bank_options_fails_fast(self) -> None:
        self.config["accounts"][0]["bank_key"] = "unknown-bank"
        self._write_config()
        with self.assertRaisesRegex(ValueError, "has no entry"):
            load_configuration(self.config_path)

    def test_end_before_start_is_rejected(self) -> None:
        self.config["investment"]["end_date"] = "2000-01-01"
        self._write_config()
        with self.assertRaisesRegex(ValueError, "before start date"):
            load_configuration(self.config_path)


if __name__ == "__main__":
    unittest.main()
