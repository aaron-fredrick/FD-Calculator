# Bank dataset metadata contract

The authoritative metadata index is `data/fd_options/fd_options.csv`. It describes the bank-level option dataset and is separate from each product row's bank-source fields.

| Field | Meaning | Update rule |
|---|---|---|
| `dataset_updated_at` | Date the bank's economic option data last materially changed (rate, tenor, minimum, payout terms, eligibility or another simulation input). | Update only when one or more economic product rows change. Leave blank when the actual change date is unknown. |
| `dataset_reviewed_at` | Date a maintainer last rechecked the bank's source material, whether or not the catalogue changed. | Update only after an actual source review. This is the input to freshness warnings. |
| `dataset_schema_version` | Version of the bank option CSV row schema/format. | Increment for schema-only migrations such as adding columns or renaming fields. |
| `source_effective_date` | Effective date stated by the bank for an individual product/rate row. | Preserve per product row; it is not the repository edit date. |

## Migration rules

1. A schema-only migration may add or reorder columns and increment `dataset_schema_version`.
2. A schema-only migration must preserve `dataset_updated_at` and `dataset_reviewed_at` exactly.
3. Do not infer either date from Git commit time, file modification time, release time or deployment time.
4. Do not set `dataset_updated_at` merely because the CSV gained columns or was reformatted.
5. A source recheck with no rate/term change updates `dataset_reviewed_at` only.
6. A confirmed economic-data change updates `dataset_updated_at`; update `dataset_reviewed_at` as well only if the source was rechecked at that time.
7. Blank dates mean unknown/unrecorded, not current. Never backfill dates from assumptions.

The loader validates dates and schema versions, exposes normalized metadata through `bankDatasetRegistry`, and keeps the existing `dataset_reviewed_at` freshness behaviour. The metadata merge helper preserves both dates when only the schema version changes.

At introduction, existing bank review/data-change dates remain blank because no bank-by-bank source recheck was completed as part of this schema change. The schema version is recorded as `1`; this is not a claim that the rate data was updated.
