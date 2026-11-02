# Configuring inflows

Inflows represent money entering an account during the investment simulation. They can represent salary, monthly savings, deposits from another source, bonuses, or other expected credits.

Every inflow is credited to one configured account. The `account_id` must match a key in the top-level `accounts` object in your configuration.

## Where inflows are configured

Add an `inflows` array at the top level of your configuration file:

```json
{
  "accounts": {
    "com": {
      "bank_id": "LK_COMMERCIAL_BANK_OF_CEYLON",
      "label": "Commercial",
      "balance": 10000,
      "supports_efd": true
    }
  },
  "inflows": []
}
```

The examples below show the contents of individual array entries. Do not add a second top-level `inflows` property if your configuration already has one; add additional entries to its existing array.

## Recurring inflows

Use `"type": "recurring"` when the same amount is credited repeatedly at a fixed interval.

### Example: monthly savings

```json
{
  "name": "Monthly savings",
  "amount": 10000,
  "type": "recurring",
  "interval": "1m",
  "start_date": "2026-11-30",
  "end_date": "end",
  "account_id": "com"
}
```

This credits LKR 10,000 to account `com` on each monthly occurrence, starting on 30 November 2026 and continuing through the investment end date.

### Recurring fields

| Field | Required | Description |
| --- | --- | --- |
| `name` | Yes | Human-readable description shown in reports. |
| `amount` | Yes | Amount credited on each occurrence. |
| `type` | Yes for new entries | Must be `"recurring"`. Legacy inflows without a type are interpreted as recurring. |
| `interval` | Yes | Time between occurrences, such as `"30d"`, `"1m"`, or `"1y"`. |
| `start_date` | No | First occurrence. If omitted, the first occurrence is one interval after the investment start. |
| `end_date` | No | Last permitted occurrence, inclusive. If omitted, the investment end is used. |
| `account_id` | Yes | Destination account ID matching a key in the top-level `accounts` object. |

### Intervals and recurrence dates

Intervals use the following units:

- `d`: days, e.g. `"14d"`.
- `m`: calendar months, e.g. `"1m"`.
- `y`: calendar years, e.g. `"1y"`.

A month is a calendar month, not a fixed 30-day duration. Occurrences are calculated from the first occurrence, rather than repeatedly adding the interval to the previous occurrence. This avoids month-end drift.

For example, a monthly recurrence anchored on 31 January follows calendar-month dates, clamping to the last valid day of shorter months. It does not permanently shift to the 28th or 30th because of an earlier short month.

### Date values

The date fields accept ISO dates (`YYYY-MM-DD`) and supported date keywords:

- `"today"`: current date.
- `"investment_start"`: first date of the investment period.
- `"investment_end"` or `"end"`: final date of the investment period.
- Relative expressions such as `"investment_start+1m"`.

The start and end bounds are inclusive. The resolved dates must be within the investment period, and the start date cannot be after the end date.

## Scheduled inflows

Use `"type": "scheduled"` when you know the exact dates on which money will be credited. The amount is credited separately on every date in the `dates` array.

### Example: two bonus payments

```json
{
  "name": "Performance bonus",
  "amount": 50000,
  "type": "scheduled",
  "dates": [
    "2027-04-10",
    "2027-10-10"
  ],
  "account_id": "com"
}
```

This credits LKR 50,000 on each of the two dates. It does not divide the amount between those dates.

### Scheduled fields

| Field | Required | Description |
| --- | --- | --- |
| `name` | Yes | Human-readable description shown in reports. |
| `amount` | Yes | Amount credited on each listed date. |
| `type` | Yes | Must be `"scheduled"`. |
| `dates` | Yes | Array of ISO dates. Each date creates one credit for the full amount. |
| `account_id` | Yes | Destination account ID from the top-level `accounts` object. |

Every scheduled date must fall within the inclusive investment period. Use a separate entry if different dates have different amounts or destination accounts.

## Multiple inflows

You can mix recurring and scheduled entries in the same array and direct them to different accounts:

```json
{
  "inflows": [
    {
      "name": "Monthly salary",
      "amount": 150000,
      "type": "recurring",
      "interval": "1m",
      "start_date": "investment_start",
      "end_date": "end",
      "account_id": "com"
    },
    {
      "name": "Annual bonus",
      "amount": 75000,
      "type": "scheduled",
      "dates": ["2027-04-10", "2027-10-10"],
      "account_id": "dfcc"
    }
  ]
}
```

In this example, salary is credited to Commercial and the bonus is credited to DFCC. Both account IDs must exist in the configuration's `accounts` array.

## How inflows affect the simulation

Inflows increase the available balance of their destination account on their occurrence dates. On a date when an inflow and an outflow or FD cash flow occur together, incoming cash flows are processed before outflow payments. Investment decisions are made after outflows are processed.

Inflows are not transfers between configured accounts. Use the simulator's transfer and consolidation behaviour for account-to-account movement.

## Common configuration mistakes

- Referencing an `account_id` that does not exist in `accounts`.
- Using `interval` with a scheduled entry instead of supplying `dates`.
- Omitting `interval` from a recurring entry.
- Putting a scheduled date or recurring bound outside the investment period.
- Assuming `"1m"` means 30 days.
- Assuming a scheduled entry's amount is split across its dates; the full amount is credited on every date.

## Complete example

See [examples/inflows.example.json](../examples/inflows.example.json) for a standalone example containing both recurring and scheduled inflows.
