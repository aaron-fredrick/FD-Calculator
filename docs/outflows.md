# Configuring outflows

Outflows represent money that must leave an account during the investment simulation. Examples include household expenses, rent, tuition payments, insurance premiums, loan repayments, and other planned spending.

Each outflow is tied to one configured account. Its `account_id` must match a key in the top-level `accounts` object.

Unlike inflows, outflows create payment obligations. The `payment_policy` determines how the simulator handles an account that cannot pay the full amount when it is due.

## Where outflows are configured

Add an `outflows` array at the top level of your configuration file:

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
  "outflows": []
}
```

The examples below show individual entries. Add them to the existing top-level `outflows` array.

## Recurring outflows

Use `"type": "recurring"` for payments that repeat at a regular interval.

### Example: monthly household expenses

```json
{
  "name": "Household expenses",
  "amount": 45000,
  "type": "recurring",
  "interval": "1m",
  "start_date": "investment_start",
  "end_date": "end",
  "account_id": "com",
  "payment_policy": "best_effort"
}
```

This creates a LKR 45,000 obligation each month from the investment start through the investment end date. Payments are attempted from account `com`.

### Recurring fields

| Field | Required | Description |
| --- | --- | --- |
| `name` | Yes | Human-readable description shown in reports. |
| `amount` | Yes | Amount due on each occurrence. |
| `type` | Yes | Must be `"recurring"`. |
| `interval` | Yes | Time between occurrences, such as `"1m"`, `"30d"`, or `"1y"`. |
| `start_date` | No | First due date. If omitted, the first occurrence is one interval after the investment start. |
| `end_date` | No | Last permitted due date, inclusive. If omitted, the investment end is used. |
| `account_id` | Yes | Account key from the top-level `accounts` object from which the payment is made. |
| `payment_policy` | No | `"strict"`, `"defer"`, or `"best_effort"`. Defaults to `"strict"`. |

Recurring dates use calendar-relative intervals anchored to the first occurrence. For example, `"1m"` means one calendar month, not 30 days. Supported units are `d` (days), `m` (calendar months), and `y` (years).

Date fields accept ISO dates (`YYYY-MM-DD`), `"today"`, `"investment_start"`, `"investment_end"` / `"end"`, and relative expressions such as `"investment_start+1m"`. The bounds are inclusive and must resolve within the investment period.

## Scheduled outflows

Use `"type": "scheduled"` for obligations due on specific dates.

### Example: university fee instalments

```json
{
  "name": "University fee",
  "amount": 120000,
  "type": "scheduled",
  "dates": [
    "2027-01-15",
    "2027-06-15"
  ],
  "account_id": "com",
  "payment_policy": "strict"
}
```

This creates a separate LKR 120,000 obligation on each date. The amount is not divided between the dates.

### Scheduled fields

| Field | Required | Description |
| --- | --- | --- |
| `name` | Yes | Human-readable description shown in reports. |
| `amount` | Yes | Amount due on each listed date. |
| `type` | Yes | Must be `"scheduled"`. |
| `dates` | Yes | Array of ISO dates. Each date creates one obligation for the full amount. |
| `account_id` | Yes | Account from which the payment is made. |
| `payment_policy` | No | `"strict"`, `"defer"`, or `"best_effort"`. Defaults to `"strict"`. |

Every date must be within the inclusive investment period. Use separate entries for obligations with different amounts, accounts, or payment policies.

## Payment policies

Payment policies control what happens when the account does not have enough available cash to pay an obligation.

### strict

The full amount must be available in the specified account on the due date. If it cannot be paid, the current simulation/search branch is invalid.

Use this when a payment absolutely must be made on time and a plan that misses it should not be considered feasible.

```json
{
  "name": "Fixed loan repayment",
  "amount": 25000,
  "type": "recurring",
  "interval": "1m",
  "start_date": "investment_start",
  "end_date": "end",
  "account_id": "com",
  "payment_policy": "strict"
}
```

### defer

The payment is made only when the full outstanding amount is available. If the account cannot pay the full amount, the obligation remains outstanding and is carried forward. Partial payment is not made.

Use this when a payment may be delayed but must eventually be paid in full.

```json
{
  "name": "Optional large purchase",
  "amount": 80000,
  "type": "scheduled",
  "dates": ["2027-03-01"],
  "account_id": "com",
  "payment_policy": "defer"
}
```

### best_effort

The simulator pays as much as is available on the due date. Any unpaid remainder is carried forward as an outstanding liability.

Use this for expenses where partial payment is meaningful and should reduce the outstanding amount.

```json
{
  "name": "Monthly living expenses",
  "amount": 45000,
  "type": "recurring",
  "interval": "1m",
  "start_date": "investment_start",
  "end_date": "end",
  "account_id": "com",
  "payment_policy": "best_effort"
}
```

### Policy comparison

| Policy | If full amount is available | If only part is available | If nothing is available |
| --- | --- | --- | --- |
| `strict` | Pay in full | Invalidate the branch | Invalidate the branch |
| `defer` | Pay in full | Pay nothing; carry full amount | Carry full amount |
| `best_effort` | Pay in full | Pay available amount; carry remainder | Carry full amount |

The default policy is `strict` when `payment_policy` is omitted.

Outstanding obligations under `defer` and `best_effort` remain associated with their originating account. Any unpaid amount remaining at the investment end is reported as a liability; it is not discarded.

## Multiple outflows

Recurring and scheduled entries can be mixed in the same array:

```json
{
  "outflows": [
    {
      "name": "Monthly household expenses",
      "amount": 45000,
      "type": "recurring",
      "interval": "1m",
      "start_date": "investment_start",
      "end_date": "end",
      "account_id": "com",
      "payment_policy": "best_effort"
    },
    {
      "name": "University fee",
      "amount": 120000,
      "type": "scheduled",
      "dates": ["2027-01-15", "2027-06-15"],
      "account_id": "dfcc",
      "payment_policy": "strict"
    }
  ]
}
```

The household expenses are paid from Commercial using best-effort payments. The university fees are due from DFCC and must be paid in full on their scheduled dates.

## Event ordering and account balances

On a date with multiple events, the simulator processes incoming inflows and FD cash flows before outflows. Outflows are then processed before the strategy makes new investment decisions for that date.

Outflows are account-specific. Money in another account is not automatically available to pay an obligation unless the simulator's transfer decisions move funds into the account that owes the payment. Do not assume that a positive combined balance across all accounts means a particular account can pay its outflow.

## Common configuration mistakes

- Referencing an account ID that is not present in `accounts`.
- Omitting `interval` for a recurring outflow.
- Using `dates` for recurring entries or `interval` for scheduled entries.
- Setting a due date outside the investment period.
- Choosing `strict` when the plan is allowed to delay or partially pay the expense.
- Assuming `defer` makes partial payments; it does not.
- Assuming `best_effort` clears the full obligation; unpaid amounts remain liabilities.
- Forgetting that each date in a scheduled entry incurs the full configured amount.

## Complete example

See [examples/outflows.example.json](../examples/outflows.example.json) for a standalone example containing recurring and scheduled outflows with different payment policies.
