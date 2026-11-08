# Data catalogue and financial assumptions audit

## DATA-01 — Product-source provenance is not visible in the user-facing workflow

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

**Severity: P2**

**Evidence:** [configuration.js L140-L148](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/configuration.js#L140-L148) includes senior/minor products when the corresponding boolean is true. The web form stores these booleans in [app.js L76-L88](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js#L76-L88). It does not collect depositor age or guardian status. The report explicitly states that catalogue age and guardian conditions are informational and are not verified ([html.js L219](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/reporting/html.js#L219)).

**Impact:** the toggle means “include this customer segment's products”, not “verify that the depositor qualifies”. A user can include senior/minor rates without the application checking age thresholds, inclusive/exclusive boundaries or guardian requirements.

**Recommendation:** either:
1. Add a customer eligibility profile (age on booking date, citizenship/residency where required, guardian confirmation) and enforce catalogue conditions; or
2. Rename the controls to make their scope unmistakable (“Include senior-citizen products in the candidate set”) and keep a persistent warning that eligibility is not checked.

Do not imply that a category toggle is proof of eligibility.

## DATA-03 — The active FD model cannot yet represent all special-product constraints

**Evidence:** the research register [age_eligibility.csv](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/data/fd_options/age_eligibility.csv) contains fields such as `product_max_amount` and `tax_exempt`. The active [FDOption model](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/models.js) and data loaders currently model minimum amount and age/segment fields, but not product maximum amount or tax-exempt treatment.

**Impact:** products with scheme-wide caps, product caps or special tax treatment must remain excluded from simulation until those rules can be enforced. Reusing general FD rates or minimums for a special product can create an invalid plan.

**Recommendation:** extend the domain model only when a real product requires it: maximum amount, per-customer/scheme-wide cap, tax treatment, required documentation/guardian and any renewal/eligibility conditions. Add validation and tests before moving a research-register row into the active product catalogue.

## DATA-04 — CSV rows are not checked for exact field count

**Severity: P3**

**Evidence:** [src/io/csv.js L6](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/io/csv.js#L6) maps headers to values with `values[i] ?? ""`. Surplus values are silently ignored; missing values become empty strings.

**Impact:** a malformed or incorrectly quoted bank row may be partially accepted, with trailing data discarded or missing fields represented as blank. Downstream validation catches some missing financial fields but does not guarantee the row was structurally valid.

**Recommendation:** after parsing each row, require `values.length === headers.length`; reject malformed quote placement and include filename/row number in the error. Add fixtures for short rows, long rows, embedded commas, escaped quotes, multiline notes and unterminated quotes.

## DATA-05 — Transfer-fee assumptions are not a full transfer-channel model

**Evidence:** [data/banks/banks.csv](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/data/banks/banks.csv) records bank fee values and notes that distinguish online/mobile CEFT, OTC, SLIPS, fallback CBSL maxima and assumptions. The active fee model chooses same-bank or domestic inter-bank fees per source bank; it does not model all channels, transaction tiers, customer privileges or limits.

**Impact:** a single fee per bank/channel class can be a useful planning approximation, but it is not a complete bank tariff model. The catalogue itself records conflicts and fallback assumptions (for example, bank-published values that differ from a CBSL digital CEFT maximum).

**Recommendation:** keep the current model labelled “estimated transfer fee”. If channel selection materially changes outcomes, add a transfer method dimension (digital CEFT, OTC CEFT, SLIPS, internal transfer), transaction tier and effective date. Do not resolve contradictory sources by silently selecting one.

## DATA-06 — Bank-rate freshness and secondary sources need a visible warning policy

The index distinguishes `populated_direct`, `populated_secondary`, `no_public_rate_verified` and other research statuses. The web UI disables only the last category. A populated secondary compilation is usable by the engine but should not look identical to a current official schedule.

**Recommendation:** define a freshness policy: effective date required where available, review age threshold, source priority, fallback handling, and visible warnings for secondary or undated rows. Do not automatically disable all secondary data if it remains useful; make confidence and provenance explicit.

## Additional catalogue checks

- Keep rate rows with unresolved product mapping or minimum amounts out of the simulation catalogue, as current research notes already do.
- Do not infer senior rates from general FD rates.
- Preserve product-level labels and payout frequency; avoid flattening different payout contracts into one option.
- Validate duplicate product identities and suspiciously identical rows during catalogue build.
- Keep bank fees and FD rates independently sourced; a verified rate does not imply a verified fee.
- Treat `age_eligibility.csv` as a research register until every simulation-critical term is enforceable by the engine.
