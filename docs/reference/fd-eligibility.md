---
title: Age-based FD eligibility
description: Bank-specific senior and minor fixed-deposit age rules, verified product rates, catalogue fields and current coverage limits.
---

# Age-based FD eligibility

Some Sri Lankan banks publish separate fixed-deposit products or rates for senior customers and minors. These are **product eligibility rules**, not universal age rules: each bank defines its own cutoff, boundary wording, minimum deposit, permitted tenure and account-opening requirements.

## How FD Cal represents age eligibility

The bank product CSVs can record:

| Field | Meaning |
| --- | --- |
| `customer_segment` | `general`, `senior` or `minor` |
| `min_age`, `max_age` | Published lower and upper age bounds; blank means the bank did not publish that bound in the source we verified |
| `min_age_inclusive`, `max_age_inclusive` | Whether the corresponding boundary is inclusive |
| `guardian_required` | Whether the source explicitly requires a parent or guardian |

The browser exposes **Include senior citizen FDs** and **Include child / minor FDs** switches. They default off, preserve all general products, and add only the selected age-segment products. The switches do not collect a date of birth or claim that a particular person qualifies. A bank's wording such as “over 60” is stored as a strict lower bound, not silently rounded to “60+”.

## Verified products currently represented in the rate catalogue

| Bank / product | Published age rule | Dataset coverage | Source |
| --- | --- | --- | --- |
| SANASA Development Bank — Upahara FD | Over 55 years | Maturity rates for 1, 3, 6, 12, 13, 24, 36, 48, 60 and 120 months; monthly rates for 12, 13, 24, 36, 48, 60 and 120 months; minimum LKR 10,000 | [Official rates](https://www.sdb.lk/en/rates?tableid=4) | 
| SANASA Development Bank — Minor FD | Sri Lankan citizens below 18, with a guardian | Maturity rates for 12, 24, 36, 48, 60 and 120 months; minimum LKR 10,000 | [Official rates](https://www.sdb.lk/en/rates?tableid=4) · [Minor FD KFD](https://www.sdb.lk/images/pdf/kfd/sdb-minor-fd-en.pdf) | 
| Seylan Bank — Senior Citizens FD | Over 60 years | Published maturity rates for 1, 48 and 60 months, where the product-specific LKR 100,000 minimum is stated. Other tenures are held back because the reviewed schedule does not give a matching minimum-deposit value | [Official rate schedule](https://www.seylan.lk/interest-rates?url=senior-citizen-fds) |

Rates retain their source effective dates and minimum-deposit values in the CSV rows. They should be checked against the linked bank schedule before an actual placement.

## Identified products not yet added as simulated rate rows

- **People's Bank senior / Parinatha FDs:** official pages publish over-55 and over-60 products and rate bands, but the product pages and rate page do not reconcile cleanly on minimum deposit, and the over-60 special scheme has a LKR 1.5 million cumulative cap plus tax-exempt interest. Those product caps/tax conditions are not enforced by the simulator, so the rates are held in the research ledger rather than optimised. See [term-deposit terms](https://www.peoplesbank.lk/term-deposite/) and [rate schedule](https://peoplesbank.lk/interest-rates/).
- **[People's Bank Minor FD](https://www.peoplesbank.lk/term-deposite/):** the bank says the product is for children up to 18 years, can be opened by a parent or guardian, and pays 0.5 percentage points above normal FD rates. The product page does not clearly publish a separate minimum deposit or complete product-specific rate/tenure table. We are not copying the adult minimum or deriving simulated rates until the minor product's terms are confirmed.
- **[RDB Senior Citizen FD](https://www.rdb.lk/interest-rates/):** the official schedule states over 60 and publishes one-year maturity and monthly rates, but does not state a senior-product minimum. The general FD minimum is not borrowed; the senior option remains in the research ledger only.
- **[Nations Trust Bank — Nations Prabuddha Senior Citizen FD](https://www.nationstrust.com/images/pdf/key-facts-doc/kfd-senior-citizen-savings-en.pdf):** the official key facts document confirms an over-60 product with 12–60 month tenures and monthly or maturity payout. Current senior-specific rates are not yet confirmed.
- **[Sampath Bank — Sanhinda senior special FD](https://www.sampath.lk/api/uploads/senior_citizen_opening_special_fd_accounts_d3405c3b1a_a20fdec085.pdf):** the official declaration confirms resident Sri Lankan citizens over 60 and a scheme-wide LKR 1.5 million deposit cap across banks. Current product rates and full terms are not yet confirmed.
- **[HDFC Vishrama Udana](https://www.hdfc.lk/fd-%26-investments/vishrama-udana-fixed-deposit)** and **[SMIB Senior Citizen FD](https://www.smib.lk/en/investments/senior-citizen-fixed-deposits):** official product pages state an over-60 eligibility rule. Their senior product rates are not added here until a current, matching rate schedule is verified.

## Research ledger

The machine-readable research ledger includes products whose eligibility is known even when a current matching rate or minimum deposit is not yet safe to simulate: [age_eligibility.csv](https://github.com/aaron-fredrick/FD-Calculator/blob/main/data/fd_options/age_eligibility.csv). Its `research_status` distinguishes catalogue-ready entries from incomplete or conflicting evidence.

## Data policy

No age threshold is inferred from a product name, tax treatment, general account eligibility or another bank's rules. No dummy rates are inserted. If a bank publishes a rate but omits an age cutoff, or publishes eligibility but not a current rate, that information remains documented as incomplete rather than becoming an optimisable product.

Age eligibility is evaluated at the product/account-opening point where the bank's terms say so. Where the bank does not specify the exact reference date or boundary, the catalogue must retain that uncertainty rather than invent a rule.
