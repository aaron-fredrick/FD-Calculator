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

    def test_scheduled_inflows_and_recurring_outflows_are_resolved(self) -> None:
        self.config["inflows"] = [{
            "name": "Bonus",
            "amount": 2500.0,
            "type": "scheduled",
            "dates": ["investment_start", "end"],
            "account_id": "cash",
        }]
        self.config["outflows"] = [{
            "name": "Monthly expenses",
            "amount": 750.0,
            "type": "recurring",
            "interval": "1m",
            "start_date": "investment_start",
            "end_date": "end",
            "account_id": "cash",
            "payment_policy": "best_effort",
        }]
        self._write_config()

        loaded = load_configuration(self.config_path)
        self.assertEqual(
            loaded["inflow_schedule"][loaded["start"]]["cash"],
            2500.0,
        )
        self.assertEqual(
            loaded["inflow_schedule"][loaded["end"]]["cash"],
            2500.0,
        )
        self.assertGreaterEqual(len(loaded["outflow_schedule"]), 1)
        self.assertEqual(
            loaded["outflow_schedule"][loaded["start"]][0]["payment_policy"],
            "best_effort",
        )
        self.assertEqual(loaded["outflow_summaries"][0]["total"],
                         750.0 * loaded["outflow_summaries"][0]["occurrences"])

    def test_duplicate_scheduled_dates_are_rejected(self) -> None:
        self.config["inflows"] = [{
            "name": "Duplicate payment",
            "amount": 1000.0,
            "type": "scheduled",
            "dates": ["investment_start", "investment_start"],
            "account_id": "cash",
        }]
        self._write_config()
        with self.assertRaisesRegex(ValueError, "duplicate scheduled dates"):
            load_configuration(self.config_path)

    def test_missing_bank_options_fails_fast(self) -> None:
        self.config["accounts"][0]["bank_key"] = "unknown-bank"
        self._write_config()
        with self.assertRaisesRegex(ValueError, "has no entry"):
            load_configuration(self.config_path)


    def test_csv_options_default_to_account_banks_and_efd_only(self) -> None:
        index = self.root / "fd_options.csv"
        bank_a = self.root / "bank_a.csv"
        bank_b = self.root / "bank_b.csv"
        header = "name,type,period,annual_rate,min_amount,payout_type,payout_period,eFD,currency,source_url,source_effective_date,source_type,notes\n"
        bank_a.write_text(
            header
            + "1m eFD,fixed_deposit,1m,9,,cumulative,,true,LKR,,,,\n"
            + "1m Standard,fixed_deposit,1m,8,1000,cumulative,,false,LKR,,,,\n",
            encoding="utf-8",
        )
        bank_b.write_text(
            header + "1m eFD,fixed_deposit,1m,10,,cumulative,,true,LKR,,,,\n",
            encoding="utf-8",
        )
        index.write_text(
            "bank_id,bank_key,options_file,research_status,research_notes\n"
            "LK_A,commercial,bank_a.csv,populated_direct,\n"
            "LK_B,dfcc,bank_b.csv,populated_direct,\n",
            encoding="utf-8",
        )
        self.config["options_file"] = "fd_options.csv"
        self.config["accounts"].append({
            "id": "other", "bank_key": "dfcc", "label": "Other", "balance": 0,
        })
        self._write_config()

        loaded = load_configuration(self.config_path)
        self.assertEqual(loaded["account_banks_only"], True)
        self.assertEqual(loaded["efd_only"], True)
        self.assertEqual(
            {(option.bank_key, option.annual_rate) for option in loaded["options"]},
            {("commercial", 9.0), ("dfcc", 10.0)},
        )
        self.assertEqual(
            {option.bank_key: option.min_amount for option in loaded["options"]},
            {"commercial": 25_000.0, "dfcc": 10_000.0},
        )

    def test_csv_efd_only_false_loads_standard_and_efd(self) -> None:
        index = self.root / "fd_options.csv"
        bank_a = self.root / "bank_a.csv"
        header = "name,type,period,annual_rate,min_amount,payout_type,payout_period,eFD,currency,source_url,source_effective_date,source_type,notes\n"
        bank_a.write_text(
            header
            + "1m eFD,fixed_deposit,1m,9,1000,cumulative,,true,LKR,,,,\n"
            + "1m Standard,fixed_deposit,1m,8,1000,cumulative,,false,LKR,,,,\n",
            encoding="utf-8",
        )
        index.write_text(
            "bank_id,bank_key,options_file,research_status,research_notes\n"
            "LK_A,commercial,bank_a.csv,populated_direct,\n",
            encoding="utf-8",
        )
        self.config["options_file"] = "fd_options.csv"
        self.config["efd_only"] = False
        self._write_config()

        loaded = load_configuration(self.config_path)
        self.assertEqual(
            {option.annual_rate for option in loaded["options"]},
            {8.0, 9.0},
        )


    def test_equivalent_standard_and_efd_options_prefer_efd(self) -> None:
        index = self.root / "fd_options.csv"
        bank_a = self.root / "bank_a.csv"
        header = "name,type,period,annual_rate,min_amount,payout_type,payout_period,eFD,currency,source_url,source_effective_date,source_type,notes\\n"
        bank_a.write_text(
            header
            + "1m Standard,fixed_deposit,1m,9,25000,cumulative,,false,LKR,,,,\\n"
            + "1m eFD,fixed_deposit,1m,9,25000,cumulative,,true,LKR,,,,\\n"
            + "2m Standard,fixed_deposit,2m,8,25000,cumulative,,false,LKR,,,,\\n",
            encoding="utf-8",
        )
        index.write_text(
            "bank_id,bank_key,options_file,research_status,research_notes\\n"
            "LK_A,commercial,bank_a.csv,populated_direct,\\n",
            encoding="utf-8",
        )
        self.config["options_file"] = "fd_options.csv"
        self.config["efd_only"] = False
        self._write_config()

        loaded = load_configuration(self.config_path)
        self.assertEqual(len(loaded["options"]), 2)
        one_month = next(option for option in loaded["options"] if option.days == 30)
        self.assertEqual(one_month.label, "1m eFD")
        self.assertTrue(one_month.is_efd)
        two_month = next(option for option in loaded["options"] if option.days == 60)
        self.assertFalse(two_month.is_efd)

    def test_end_before_start_is_rejected(self) -> None:
        self.config["investment"]["end_date"] = "2000-01-01"
        self._write_config()
        with self.assertRaisesRegex(ValueError, "before start date"):
            load_configuration(self.config_path)


if __name__ == "__main__":
    unittest.main()
