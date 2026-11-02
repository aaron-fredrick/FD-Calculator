from __future__ import annotations

import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from core.configuration import load_configuration
from core.interest import add_period
from core.strategies.greedy import GreedyStrategy


COMMERCIAL_ID = "LK_COMMERCIAL_BANK_OF_CEYLON"
DFCC_ID = "LK_DFCC_BANK"


class ConfigurationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.options_path = self.root / "fd_options.csv"
        self.commercial_path = self.root / "commercial.csv"
        self.dfcc_path = self.root / "dfcc.csv"
        header = "name,type,period,annual_rate,min_amount,payout_type,payout_period,eFD\n"
        self.commercial_path.write_text(
            header
            + "Commercial 1m eFD,fixed_deposit,1m,9,25000,cumulative,,true\n"
            + "Commercial 1m Standard,fixed_deposit,1m,8,25000,cumulative,,false\n",
            encoding="utf-8",
        )
        self.dfcc_path.write_text(
            header
            + "DFCC 1m eFD,fixed_deposit,1m,10,10000,cumulative,,true\n"
            + "DFCC 1m Standard,fixed_deposit,1m,9,10000,cumulative,,false\n",
            encoding="utf-8",
        )
        self.options_path.write_text(
            "bank_id,bank_key,options_file,research_status,research_notes\n"
            f"{COMMERCIAL_ID},commercial,commercial.csv,populated_direct,\n"
            f"{DFCC_ID},dfcc,dfcc.csv,populated_direct,\n",
            encoding="utf-8",
        )
        self.config_path = self.root / "config.json"
        self.config = {
            "strategy": "greedy",
            "options_file": "fd_options.csv",
            "investment": {
                "start_date": "today",
                "end_date": "investment_start+1y",
            },
            "accounts": {
                "cash": {
                    "bank_id": COMMERCIAL_ID,
                    "label": "Commercial Cash",
                    "balance": 2500.0,
                    "supports_efd": True,
                }
            },
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

    def test_dictionary_accounts_resolve_today_and_bank_id(self) -> None:
        loaded = load_configuration(self.config_path)
        self.assertEqual(loaded["start"], date.today())
        self.assertEqual(loaded["end"], add_period(date.today(), "1y"))
        self.assertEqual(len(loaded["accounts"]), 1)
        account = loaded["accounts"][0]
        self.assertEqual(account.id, "cash")
        self.assertEqual(account.bank_id, COMMERCIAL_ID)
        self.assertEqual(account.bank_key, "commercial")
        self.assertEqual(loaded["inflow_summaries"][0]["account_id"], "cash")
        self.assertEqual(loaded["inflow_summaries"][0]["amount"], 500.0)
        self.assertTrue(all("cash" in amounts for amounts in loaded["inflow_schedule"].values()))

    def test_repository_config_uses_valid_account_dictionary(self) -> None:
        repository_config = Path(__file__).resolve().parent.parent / "config.json"
        loaded = load_configuration(repository_config)
        self.assertEqual(
            {account.id for account in loaded["accounts"]},
            {"comfp", "comfs", "dfcc"},
        )
        self.assertEqual(
            {account.bank_id for account in loaded["accounts"]},
            {COMMERCIAL_ID, DFCC_ID},
        )

    def test_strategy_replay_preserves_bank_ids_from_configuration(self) -> None:
        repository_config = Path(__file__).resolve().parent.parent / "config.json"
        loaded = load_configuration(repository_config)
        result = GreedyStrategy(
            compound=loaded["compound"],
            actual_leap_year=loaded["actual_leap_year"],
        ).simulate(
            options=loaded["options"],
            start=loaded["start"],
            end=loaded["end"],
            inflow_schedule=loaded["inflow_schedule"],
            accounts=loaded["accounts"],
            inflow_account_id=loaded["accounts"][0].id,
            fee_config=loaded["fee_config"],
            consolidation_account_id=loaded["consolidation_account_id"],
            outflow_schedule=loaded["outflow_schedule"],
        )
        self.assertEqual(result.accounts["comfp"].bank_id, COMMERCIAL_ID)
        self.assertEqual(result.accounts["comfs"].bank_id, COMMERCIAL_ID)
        self.assertEqual(result.accounts["dfcc"].bank_id, DFCC_ID)
        self.assertTrue(result.bookings)
        self.assertTrue(all(booking.bank_id in {COMMERCIAL_ID, DFCC_ID} for booking in result.bookings))
        self.assertTrue(all(event.bank_id in {COMMERCIAL_ID, DFCC_ID} for day in result.timeline.values() for event in day if event.account_id))

    def test_unknown_consolidation_account_id_is_rejected(self) -> None:
        self.config["consolidation_account_id"] = "missing-account"
        self._write_config()
        with self.assertRaisesRegex(ValueError, "consolidation_account_id"):
            load_configuration(self.config_path)

    def test_unknown_bank_id_is_rejected_against_bank_catalogue(self) -> None:
        self.config["accounts"]["cash"]["bank_id"] = "commercial"
        self._write_config()
        with self.assertRaisesRegex(ValueError, "unknown bank_id"):
            load_configuration(self.config_path)

    def test_multiple_accounts_at_same_bank_keep_independent_efd_capability(self) -> None:
        self.config["inflows"] = []
        self.config["accounts"] = {
            "dfcc-1": {
                "bank_id": DFCC_ID, "label": "DFCC standard", "balance": 10000,
                "supports_efd": False,
            },
            "dfcc-2": {
                "bank_id": DFCC_ID, "label": "DFCC eFD", "balance": 20000,
                "supports_efd": True,
            },
        }
        self._write_config()
        loaded = load_configuration(self.config_path)
        by_id = {account.id: account for account in loaded["accounts"]}
        self.assertFalse(by_id["dfcc-1"].supports_efd)
        self.assertTrue(by_id["dfcc-2"].supports_efd)
        self.assertEqual(by_id["dfcc-1"].bank_id, by_id["dfcc-2"].bank_id)

    def test_standard_and_efd_products_are_loaded_without_global_efd_filter(self) -> None:
        loaded = load_configuration(self.config_path)
        self.assertEqual({option.is_efd for option in loaded["options"]}, {False, True})

    def test_supports_efd_requires_a_boolean(self) -> None:
        self.config["accounts"]["cash"]["supports_efd"] = "false"
        self._write_config()
        with self.assertRaisesRegex(ValueError, "supports_efd must be a boolean"):
            load_configuration(self.config_path)

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
        self.assertEqual(loaded["inflow_schedule"][loaded["start"]]["cash"], 2500.0)
        self.assertEqual(loaded["inflow_schedule"][loaded["end"]]["cash"], 2500.0)
        self.assertGreaterEqual(len(loaded["outflow_schedule"]), 1)
        self.assertEqual(loaded["outflow_schedule"][loaded["start"]][0]["payment_policy"], "best_effort")

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

    def test_transfer_fee_overrides_use_directional_bank_ids(self) -> None:
        self.config["accounts"]["dfcc"] = {
            "bank_id": DFCC_ID, "label": "DFCC", "balance": 0,
        }
        self.config["transfer_fees"]["custom_fees"] = [{
            "from_bank_id": COMMERCIAL_ID,
            "to_bank_id": DFCC_ID,
            "amount": 12.0,
        }]
        self._write_config()
        loaded = load_configuration(self.config_path)
        self.assertEqual(loaded["fee_config"].get_fee(COMMERCIAL_ID, DFCC_ID), 12.0)
        self.assertEqual(loaded["fee_config"].get_fee(DFCC_ID, COMMERCIAL_ID), 30.0)

    def test_custom_transfer_fee_rejects_unknown_bank_id(self) -> None:
        self.config["transfer_fees"]["custom_fees"] = [{
            "from_bank_id": "commercial",
            "to_bank_id": DFCC_ID,
            "amount": 12.0,
        }]
        self._write_config()
        with self.assertRaisesRegex(ValueError, "valid from_bank_id/to_bank_id"):
            load_configuration(self.config_path)

    def test_end_before_start_is_rejected(self) -> None:
        self.config["investment"]["end_date"] = "2000-01-01"
        self._write_config()
        with self.assertRaisesRegex(ValueError, "before start date"):
            load_configuration(self.config_path)


if __name__ == "__main__":
    unittest.main()
