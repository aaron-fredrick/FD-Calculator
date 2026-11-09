# Data catalogue and financial assumptions audit

## DATA-01 — Product-source provenance is not visible in the user-facing workflow

**Current status: PARTIAL in PR #75.** Per-bank `dataset_reviewed_at` and `research_status` are shown beside the bank selector and in the report. Product-level `source_url`, `source_effective_date`, source notes and caveats are not yet propagated to each selected product/report row; this finding remains open for that missing provenance.

**Severity: P2**

**Evidence:**
- [fd_options.csv](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/data/fd_options/fd_options.csv) contains `research_status` and `research_notes`.
- Per-bank product CSVs contain `source_url`, `source_effective_date`, `source_type` and notes.
- [app.js L57-L61](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js#L57-L61) uses the index status to disable only banks with `no_public_rate_verified`; it does not display the remaining source status or notes.
- [app.js L78](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js#L78) constructs FDOption objects from the product terms but does not retain source URL, effective date or research metadata.
- [data-loader.js L11](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/io/data-loader.js#L11) likewise maps the simulation terms into FDOption without source provenance.

**Impact:** products backed by a direct official schedule, a secondary compilation, or a source with no effective date can appear as equivalent options. The catalogue's internal research notes already distinguish these cases, but users cannot assess the evidence quality at the point of comparison.

**Recommendation:** add a separate immutable provenance object to each product, not financial calculation fields. Show source type, source link, effective date (or “not published”), last-reviewed date and research caveat in the product details and standalone report. Visibly distinguish direct official data from secondary/unverified inputs. Preserve provenance through worker serialization and report generation.

## DATA-02 — Senior/minor selection is not an actual depositor eligibility check

**Current status: CLOSED AS AN OWNER-CONFIRMED SCOPE DECISION.** The toggles intentionally filter candidate products; FD Cal does not verify depositor age, guardian status or bank onboarding eligibility. Retain the disclosure and do not represent the toggles as verification.

**Severity: P2**

**Evidence:** [configuration.js L140-L148](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/configuration.js#L140-L148) includes senior/minor products when the corresponding boolean is true. The web form stores these booleans in [app.js L76-L88](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js#L76-L88). It does not collect depositor age or guardian status. The report explicitly states that catalogue age and guardian conditions are informational and are not verified ([html.js L219](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/reporting/html.js#L219)).

**Impact:** the toggle means “include this customer segment's products”, not “verify that the depositor qualifies”. A user can include senior/minor rates without the application checking age thresholds, inclusive/exclusive boundaries or guardian requirements.

**Recommendation:** either:
1. Add a customer eligibility profile (age on booking date, citizenship/residency where required, guardian confirmation) and enforce catalogue conditions; or
2. Rename the controls to make their scope unmistakable (“Include senior-citizen products in the candidate set”) and keep a persistent warning that eligibility is not checked.

Do not imply that a category toggle is proof of eligibility.

## DATA-03 — The active FD model cannot yet represent all special-product constraints

**Current status: DEFERRED.** No owner-approved scope for modelling the special-product constraints has been supplied. Keep products with unenforced simulation-critical constraints outside the active catalogue.

**Evidence:** the research register [age_eligibility.csv](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/data/fd_options/age_eligibility.csv) contains fields such as `product_max_amount` and `tax_exempt`. The active [FDOption model](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/models.js) and data loaders currently model minimum amount and age/segment fields, but not product maximum amount or tax-exempt treatment.

**Impact:** products with scheme-wide caps, product caps or special tax treatment must remain excluded from simulation until those rules can be enforced. Reusing general FD rates or minimums for a special product can create an invalid plan.

**Recommendation:** extend the domain model only when a real product requires it: maximum amount, per-customer/scheme-wide cap, tax treatment, required documentation/guardian and any renewal/eligibility conditions. Add validation and tests before moving a research-register row into the active product catalogue.

## DATA-04 — CSV rows require strict structural validation

**Current status: IMPLEMENTED on this branch; CI passed.** The parser now rejects malformed quote placement, unterminated quoted fields, characters after a closing quote, and rows whose field count differs from the header. Errors include the source path and physical line number. The parser retains support for UTF-8 BOM, LF/CRLF, quoted commas, escaped quotes, multiline fields, and legitimate trailing empty cells.

**Inventory and data corrections:** all 33 checked-in catalogue CSV files were inventoried and are covered by a regression test. The inventory found 93 malformed rows across three files:
- `data/banks/banks.csv`: 26 rows had unquoted commas in `fee_basis`, which shifted/truncated `fee_source_url`.
- `data/fd_options/banks/LK_COMMERCIAL_BANK_OF_CEYLON.csv`: 43 rows had unquoted commas in the final `notes` field.
- `data/fd_options/banks/LK_DFCC_BANK.csv`: 24 rows had unquoted commas in the final `notes` field.

Those fields are now correctly quoted. The bank fee source URL and product provenance notes remain in their intended columns.

**Implementation:** [strict parser](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/rulesets-codebase-review/src/io/csv.js), [CSV regression tests](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/rulesets-codebase-review/tests/js/csv.test.js), [bank metadata](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/rulesets-codebase-review/data/banks/banks.csv).

**Acceptance:** exact row width and valid CSV quoting are enforced; all 33 current catalogue files parse; malformed input fails with actionable source/line context. Pending shipment from this working branch to `dev`.

## DATA-05 — Transfer-fee assumptions are not a full transfer-channel model

**Current status: OPEN / documented limitation.** No channel/tier/privilege model has been added; keep fees explicitly described as estimates.

**Evidence:** [data/banks/banks.csv](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/data/banks/banks.csv) records bank fee values and notes that distinguish online/mobile CEFT, OTC, SLIPS, fallback CBSL maxima and assumptions. The active fee model chooses same-bank or domestic inter-bank fees per source bank; it does not model all channels, transaction tiers, customer privileges or limits.

**Impact:** a single fee per bank/channel class can be a useful planning approximation, but it is not a complete bank tariff model. The catalogue itself records conflicts and fallback assumptions (for example, bank-published values that differ from a CBSL digital CEFT maximum).

**Recommendation:** keep the current model labelled “estimated transfer fee”. If channel selection materially changes outcomes, add a transfer method dimension (digital CEFT, OTC CEFT, SLIPS, internal transfer), transaction tier and effective date. Do not resolve contradictory sources by silently selecting one.

## DATA-06 — Bank-rate freshness and secondary sources need a visible warning policy

**Current status: PARTIAL.** Bank source status and review dates are now visible, but no freshness threshold, stale-data policy or product-level confidence/effective-date disclosure has been completed.

The index distinguishes `populated_direct`, `populated_secondary`, `no_public_rate_verified` and other research statuses. The web UI disables only the last category. A populated secondary compilation is usable by the engine but should not look identical to a current official schedule.

**Recommendation:** define a freshness policy: effective date required where available, review age threshold, source priority, fallback handling, and visible warnings for secondary or undated rows. Do not automatically disable all secondary data if it remains useful; make confidence and provenance explicit.

## Additional catalogue checks

- Keep rate rows with unresolved product mapping or minimum amounts out of the simulation catalogue, as current research notes already do.
- Do not infer senior rates from general FD rates.
- Preserve product-level labels and payout frequency; avoid flattening different payout contracts into one option.
- Validate duplicate product identities and suspiciously identical rows during catalogue build.
- Keep bank fees and FD rates independently sourced; a verified rate does not imply a verified fee.
- Treat `age_eligibility.csv` as a research register until every simulation-critical term is enforceable by the engine.
