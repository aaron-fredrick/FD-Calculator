# FD Cal UI/UX Improvement and Implementation Plan

**Status:** Proposed implementation plan; no application code changes authorised by this document alone  
**Branch:** `docs/ui-ux-audit-charles-skills`  
**Parent audit:** [UI/UX Audit Findings — Charles Skills Review](./UI-UX-AUDIT-CHARLES-SKILLS.md)  
**Product:** FD Cal — Sri Lankan fixed-deposit portfolio planning and optimisation

## 1. Purpose

This plan turns the audit into an ordered, user-centred improvement programme. The audit records observations and risks; this document decides what should be improved, what should deliberately remain as it is, why the changes fit FD Cal, and how each stage should be implemented and verified.

The goal is not to redesign FD Cal into a generic SaaS dashboard or to reproduce the appearance of another product. FD Cal is already a working financial-planning application with a shared calculation engine, a browser interface, a CLI, a detailed report generator, bank/product data, and a separately deployed documentation site. The work should improve comprehension, confidence, usability and consistency without destabilising the financial engine or making the interface heavier.

The Charles Skills are used as design-review frameworks only. We are not invoking Claude, installing those skills into the application, or mechanically following their tool-specific workflows. Their useful principles are translated into project-appropriate engineering and design requirements below.

## 2. Product direction

### 2.1 Product definition

FD Cal helps people plan and compare Sri Lankan fixed-deposit portfolios across banks, accounts, product terms, cash movements, tax assumptions and investment strategies. It simulates possible plans; it does not open deposits, transfer money, verify bank eligibility, or execute transactions.

### 2.2 Product character

- **Character:** precise, calm, transparent.
- **World:** a financial planning instrument: account statements, rate schedules, portfolio allocation and an auditable event ledger.
- **Primary moment:** the user can move from a small set of understandable scenario inputs to a clear portfolio outcome, then inspect the evidence behind that outcome when needed.
- **Signature:** a traceable plan: headline outcome in the app, with the complete account, booking, cash-flow and event detail available in a portable report.
- **Concept:** *Make the plan easy to understand at a glance, and make every important number inspectable when the user wants the detail.*

This direction favours clarity over decoration. The application should feel like a carefully designed financial instrument, not a marketing landing page, trading terminal, bank website, or generic admin dashboard.

### 2.3 Primary user journey

1. Understand what FD Cal does, what data it uses, and what it does not do.
2. Configure the investment period and objective.
3. Add one or more bank accounts and opening balances.
4. Configure inflows, outflows and relevant assumptions.
5. Choose a supported strategy and understand any advanced settings.
6. Run the simulation and receive clear execution feedback.
7. Read a concise result summary and decide whether the result is useful.
8. Open or download the full report to inspect bookings, maturities, cash flows, account movements, assumptions and the event ledger.
9. Save/export the scenario or report, verify bank terms independently, and share feedback or contribute where appropriate.

The design should serve both first-time users and experienced users without forcing either group through unnecessary explanation. Advanced detail should be available progressively, not removed.

## 3. Design principles translated from the Charles Skills

The relevant reference skills were re-read from the upstream [Charles Skills repository](https://github.com/LemonFace0309/charles-skills):

| Reference | Underlying goal | FD Cal application |
|---|---|---|
| [charles-unslop](https://github.com/LemonFace0309/charles-skills/tree/main/skills/charles-unslop) | Remove generic, unnecessary UI; derive design from the actual product; establish hierarchy and a distinctive product moment. | Preserve FD Cal's existing identity. Remove duplication and visual noise only where it impedes financial comprehension. Use actual account, rate, schedule and outcome data as the meaningful content. |
| [charles-polish](https://github.com/LemonFace0309/charles-skills/tree/main/skills/charles-polish) | Make all interaction states deliberate; refine hierarchy, focus, touch, responsive behaviour and motion; verify at real sizes. | Treat configuration, loading, validation, disabled/planned, success, error, results and report states as one coherent workflow. Prioritise reliable interaction over decorative animation. |
| [charles-unreasonable-craft](https://github.com/LemonFace0309/charles-skills/tree/main/skills/charles-unreasonable-craft) | Maintain a coherent system, make deliberate decisions, inspect every relevant viewport/state, and use independent critique. | Use the repository's canonical brand tokens; avoid one-off styling. Apply a high quality bar while remaining proportionate to a practical financial tool. Its award-level visual target is not adopted as a product requirement. |

The transferable principles are: product-specific direction, subtraction before addition, coherent design tokens, clear hierarchy, complete state design, accessible interaction, responsive verification, and evidence-based critique.

The following are **not** adopted literally: award-show visual excess, compulsory three-direction visual explorations for every small correction, generated decorative assets, animation choreography without a user need, or a requirement to make a utilitarian calculator visually unconventional. These would add cost and visual weight without improving FD Cal's core task.

## 4. Non-negotiable product and implementation constraints

### 4.1 Preserve the existing brand system

The canonical colour and typography source is:

- `src/brand/tokens.css`

The browser application consumes it through `src/web/styles.css`; the VitePress theme imports it through `docs/.vitepress/theme/custom.css`. These remain the authoritative design-system entry points.

Current core values include:

- Background: `#0b0e13`
- Raised background: `#10151d`
- Panel: `#131923`
- Raised panel: `#192230`
- Border: `#293445`
- Primary text: `#e8edf5`
- Muted text: `#9ba8b8`
- Accent: `#56b4e9`
- Positive: `#55c99a`
- Danger: `#ef7777`
- Warning: `#e9ad58`
- Strategy: `#bd93f9`

These are reference values, not an invitation to copy hex values into every new component. Components should consume the CSS custom properties. If a token genuinely needs to change, update the canonical token and assess the web app, docs and report together. Do not introduce a competing palette, random accent colours, unapproved gradients, or isolated hard-coded colours.

Financial meaning must remain consistent: positive, danger, warning and strategy colours should not be reassigned casually. Colour must never be the only way to distinguish a state or chart series.

### 4.2 The standalone report is a hard boundary

The generated HTML report must remain a portable, standalone document. Once generated, it must not fetch styles, fonts, scripts, images, chart libraries, metadata, bank rates, or any other data from the internet.

The report must contain everything required to render its own presentation and supplied result data:

- Embedded report CSS.
- Embedded report JavaScript.
- Embedded brand colour values derived from the canonical token source at generation/build time.
- Embedded chart data and all content needed for the report.
- Inline or embedded lightweight assets only where they are justified.

No runtime CDN, remote stylesheet, remote font, remote image, external script, API request or network-dependent rendering is permitted. The report must still work when opened from a local file with the device offline.

Do not solve this by copying the entire brand stylesheet into the report. Extract/compile only the small set of tokens the report needs. Keep the report's embedded design payload compact and avoid adding a UI framework or charting dependency for cosmetic convenience. Native HTML, CSS, SVG/canvas and the existing report code are preferred.

The report must not depend on the original web application being open, on local storage, or on a server after it has been generated.

### 4.3 Preserve the summary/report division

This is a deliberate product contract, not an audit defect.

**In-app result summary:** a concise decision-level overview. It should present the key outcome metrics, the relevant scenario context, important warnings/status and clear actions to open/download the report or export the configuration. It must not become a second report.

**Standalone HTML report:** the detailed record. It is the place for individual FD bookings, product and account details, maturity history, cash-flow schedules, portfolio progression, transfers, capital movements, analytics and the full event ledger.

Do not move booking rows, event history, maturity timelines or the full cash-flow ledger into the in-app summary. The report should be progressively navigable, with detailed tables available when users want to inspect them.

Both surfaces must derive from the same simulation result and configuration. Headline values must reconcile exactly; do not create a second calculation path in the UI or report.

### 4.4 Planned or unavailable choices are intentional product communication

Some unavailable choices (including the currently unavailable Goal mode) are intentionally visible to show users what is being worked on and to invite suggestions or contributions. The audit's observation that a choice is not selectable must not be interpreted as an instruction to remove it or make it functional prematurely.

Preserve this roadmap/coming-soon purpose. Improve the communication so users can understand:

- The capability is planned or in progress, not broken.
- It is not currently selectable and will not silently affect the simulation.
- Where to follow progress, suggest improvements, or contribute, using existing repository issue/discussion/contribution routes where appropriate.

Do not make a disabled option look like an active control. Do not attach a dead click handler or simulate a selection. If it is genuinely non-interactive, use appropriate disabled/non-interactive semantics and visible explanatory text. If a separate “Suggest an improvement” or “Contribute” action is provided, that action must be a real, clearly labelled link or button with a working destination. Keep the roadmap marker distinct from a functional strategy selection.

This is a product-discovery and community signal, not merely a disabled-control defect.

### 4.5 Protect financial meaning and user data

- Do not change calculation logic, financial assumptions, strategy behaviour or event-ledger semantics as part of a visual correction.
- Do not imply that FD Cal verifies bank terms, customer age, eligibility, tax status or transaction completion when it does not.
- Retain clear distinctions between nominal product rates, portfolio returns, money-weighted returns, gross interest, AIT, fees, principal and net interest.
- Keep local scenario data local unless the user explicitly chooses an export/share action.
- Treat downloaded reports as potentially sensitive: they can contain account labels, balances, selected products, bookings and event history. Explain this at the point of export/share without blocking normal use.
- Use synthetic/anonymised fixtures in tests and documentation.

## 5. Current foundations to retain

The audit and source review establish that FD Cal already has meaningful foundations:

- A shared brand token file used by the web app and documentation theme.
- A four-part scenario configuration model.
- Strategy-dependent configuration and validation.
- Browser-local scenario persistence and configuration import/export.
- A shared JavaScript calculation engine used by the browser and CLI.
- A concise in-app result summary and a separate HTML report generator.
- A report with portfolio, execution, cash-flow and ledger detail.
- Existing responsive and reduced-motion CSS.
- Existing page metadata, Open Graph/Twitter metadata and structured WebApplication metadata in the web entry point.
- Documentation metadata/canonical URL generation in the VitePress configuration.
- Separate web and documentation build/deployment workflows.

The implementation plan should improve these foundations rather than replace them. In particular, **meta tags are not a current priority**: the basic metadata layer already exists. More detailed metadata review can be part of a final release check. Analytics and tracking are explicitly deferred until a later, separately scoped phase. Do not add analytics scripts, cookies, tracking pixels, telemetry endpoints or third-party analytics dependencies in this work.

## 6. Prioritised implementation programme

The phases are ordered to reduce rework. Each phase should be completed and verified before broadening the scope. Keep commits focused and avoid combining visual changes with financial-engine changes.

### Phase 0 — Revalidate and establish the implementation baseline

**Goal:** ensure the plan is applied to the current branch state, not blindly to stale audit observations.

Work:
1. Read the audit and this plan before implementation.
2. Re-fetch the current source and compare it with the audit's reviewed revision.
3. Reproduce the relevant current states in a real browser at desktop and mobile widths.
4. Record screenshots for the first-use state, populated configuration, validation errors, loading/run state, result summary, generated report and documentation pages.
5. Identify which findings are still present, already fixed, or no longer relevant.
6. Record the current test baseline and report size baseline.

Deliverable: a short implementation baseline note with source SHA, screenshots, confirmed findings and any changed assumptions.

Exit criteria:
- No fix is based solely on a stale source observation.
- Each selected change maps to a user problem and an audit finding or a clearly documented improvement opportunity.
- Existing functionality and the calculation/report contracts are understood before edits begin.

### Phase 1 — First-use comprehension and scenario workflow

**Priority:** High  
**Goal:** make the main journey understandable without turning the app into a tutorial.

Work:
1. Refine the opening explanation to say what the user can do, that the calculation runs in the browser, and that scenario data remains in the browser.
2. Clarify the four configuration stages and their order. Keep labels and navigation consistent across the rail, section headings and status feedback.
3. Make account, inflow and outflow concepts understandable in the context of the user's financial task. Use concise contextual help only where a term or decision is not self-explanatory.
4. Review consolidation-account terminology and explain its role at the point of selection.
5. Improve scheduled-date entry and validation so date syntax and accepted ranges are obvious. Do not change the underlying schedule model merely to change the control.
6. Review dense cash-flow configuration. Group related controls and make conditional fields predictable. Preserve advanced options; progressively reveal them when appropriate.
7. Clarify senior/minor product inclusion. State that these switches include age-segmented products in the candidate set and do not verify a person's age or eligibility. Where available, expose the relevant product conditions in the detailed information/report rather than implying automatic verification.
8. Keep strategy-specific settings grouped under their strategy and explain their effect in plain, precise language. Separate financial assumptions from optimisation/search-budget controls.
9. Make the unavailable Goal mode communicate “in progress” and its contribution path without making the selection itself clickable or implying it can run.
10. Review import/export and local-persistence messaging so users understand what is stored and what leaves the browser.

Acceptance criteria:
- A first-time user can identify the required inputs and run a supported scenario without needing to infer hidden syntax.
- Invalid fields identify the problem and the expected format without losing unrelated inputs.
- Advanced controls remain available and do not overwhelm the primary path.
- Unavailable functionality is clearly marked as planned/in progress and cannot be mistaken for an active mode.
- No change to the underlying financial configuration schema or simulation result is introduced without separate approval and regression tests.

### Phase 2 — Interaction quality and execution feedback

**Priority:** High  
**Goal:** make every interaction state predictable and trustworthy.

Work:
1. Map the full states of each major control and workflow: initial/loading, ready, focused, invalid, disabled, running, success, failure and recovery.
2. Ensure the catalogue loading state is clear and that controls cannot be used in a misleading partially initialised state.
3. Review synchronous simulation feedback. The UI should clearly indicate that a run has started and avoid suggesting that the page is still interactive if the main thread is occupied. Any architectural change such as workers or asynchronous execution is a separate performance task and must preserve engine parity.
4. Prevent accidental duplicate submissions while a run is active; restore the correct state on failure.
5. Provide actionable error messages. Avoid exposing stack traces or raw internal errors to ordinary users; retain diagnostics in developer-facing channels without logging private scenario data.
6. Audit keyboard focus order, visible focus, labels, help affordances, disabled semantics, touch targets and status announcements.
7. Use motion only when it communicates a state change. Keep transitions short, interruptible and consistent with the existing motion token. Honour reduced-motion preferences.
8. Avoid adding extra badges, icons, helper lines, containers or animation unless each communicates unique information.

Acceptance criteria:
- Keyboard users can complete the primary workflow and understand validation/run states.
- Focus is visible and follows a logical sequence.
- Running, success and failure are distinguishable without relying on colour alone.
- No control appears actionable when it is not.
- Reduced-motion users receive the same information and functional outcome.
- No duplicate run or stale UI state is produced during normal interaction.

### Phase 3 — Results summary and standalone report

**Priority:** Critical  
**Goal:** establish a coherent two-level result experience while keeping the report portable and lightweight.

#### 3A. In-app result summary

Work:
1. Preserve the concise six-metric summary for scoped results: gross interest, AIT withheld, transfer fees, net interest, final value and capital invested, with goal-specific metrics only when the relevant goal outcome exists.
2. Include only the minimum scenario context needed to interpret the metrics (period, strategy and meaningful status/warnings).
3. Keep report open/download and configuration export actions clear and distinct.
4. Do not insert booking lists, maturity history, detailed cash flows, transfer histories, account ledgers or full event chronology into the summary.
5. Ensure all displayed values are taken from the same result object and reconcile with the report.

Acceptance criteria:
- A user can understand the headline outcome quickly.
- The summary remains materially shorter and simpler than the report.
- No detailed booking or event history is duplicated in the summary.

#### 3B. Standalone report structure and comprehension

Work:
1. Keep the report as the full inspection surface: overview, portfolio outcome, execution plan, performance analysis, investment portfolio, scheduled cash flows, capital movements and full event ledger.
2. Improve section hierarchy and orientation so users can move from overview to evidence without losing context.
3. Make report language explicit about simulation versus execution. Execution instructions are a planning checklist, not bank instructions, transfer commands or transaction confirmations.
4. Distinguish product nominal rates from portfolio-level annualised/money-weighted return. Explain the assumptions and cash-flow timing behind return measures.
5. Preserve traceability of each booking: bank/product, account, principal, rate, term, booking date, maturity date, payout type and relevant interest/tax treatment.
6. Make cash flows, transfers, fees, maturities, AIT and event-ledger movements reconcile. Keep outstanding/unpaid outflows visibly distinct from paid obligations.
7. Improve provenance so a saved report can identify the simulation period, strategy and the catalogue/data snapshot used. Add a generated timestamp and stable data/catalogue fingerprint only if these values are available reliably from the build/result context. Do not invent provenance or claim rates were verified live.
8. Make the report's privacy implications clear before download/share: the file can contain scenario account labels, balances, bookings and event history.
9. Keep large detail tables collapsible where this genuinely reduces initial visual load, but ensure keyboard users can open them and the collapsed state does not hide critical warnings or summary information.

Acceptance criteria:
- A user can trace important portfolio totals into the underlying bookings and event history.
- Report labels distinguish estimates, simulated events, assumptions and manual steps.
- Summary and report financial values reconcile exactly.
- The report remains useful as a saved historical record, with honest provenance.
- The report does not imply bank confirmation or guaranteed product eligibility.

#### 3C. Report visual system and offline packaging

Work:
1. Treat `src/brand/tokens.css` as the single source of truth for brand colours and typography.
2. Provide a small, explicit report-token export/embedding path. At generation/build time, resolve the relevant canonical tokens into the report's inline CSS; do not load `tokens.css` from a relative path at report-open time.
3. Keep report-specific layout variables local to the report only where they are not brand tokens (for example, table spacing or chart dimensions). Brand colours, typography and shared radii must not drift.
4. Review report chart series colours against the brand palette and contrast requirements. Series may use a restrained, deterministic data palette where necessary to distinguish many accounts; it must remain legible, repeatable and clearly separate from semantic status colours. Do not replace useful series differentiation with a single accent.
5. Preserve native lightweight chart rendering. Do not add a chart framework unless a documented accessibility or correctness requirement cannot reasonably be met with the current implementation.
6. Ensure all CSS, JavaScript, chart data and required assets are embedded in the output. Avoid remote fonts and assets; use the existing system font stack/fallbacks.
7. Add a report self-containment check that scans generated HTML for remote resource references and verifies that the report opens with network access disabled.
8. Track generated report size against a recorded baseline. Avoid shipping unused CSS/JS, duplicate token payloads or unnecessary libraries. Set a size budget after measuring representative small, normal and large reports rather than choosing an arbitrary limit before measuring.

Acceptance criteria:
- Generated HTML has no required external network dependencies.
- The report opens and its controls/charts work from a local file while offline.
- Embedded brand tokens match the canonical source at the time of generation.
- Report file size grows primarily with scenario data, not duplicated libraries or unused styling.
- No separate, drifting report palette is introduced.

#### 3D. Report accessibility, responsive and print behaviour

Work:
1. Provide a non-hover-only way to inspect chart values. Where a canvas remains, provide an adjacent accessible data representation or equivalent keyboard-operable controls.
2. Ensure chart descriptions communicate what is plotted, units, dates and series. Do not rely on colour alone.
3. Verify collapsible sections, table navigation, focus order and accessible names.
4. Test wide tables at narrow viewports. Preserve useful row/column context and avoid clipping critical values.
5. Review print CSS so navigation and interactive-only controls do not waste printed pages, while key sections, tables and chart information remain readable.
6. Respect reduced motion and avoid unnecessary animation in a report that is primarily read and inspected.

Acceptance criteria:
- Important chart information is available without pointer hover.
- Report navigation and disclosure controls work with keyboard.
- Report is readable at phone, tablet, laptop and wide desktop widths.
- Print/PDF output preserves critical content and does not clip columns or warnings.
- Offline, keyboard and reduced-motion behaviour are covered by repeatable tests.

### Phase 4 — Documentation as part of the product

**Priority:** High  
**Goal:** make the documentation the reliable companion to the actual app, not a separate developer-only appendix.

Work:
1. Organise the user-facing path around what a person is trying to do: understand FD Cal, prepare a scenario, configure accounts/cash flows, choose a strategy, interpret results, inspect/download the report and understand limitations.
2. Keep architecture, engine internals, benchmarks and strategy implementation detail available, but place them in clearly identified technical/reference sections.
3. Ensure screenshots and examples reflect the current application. Use synthetic data only; never publish personal financial information.
4. Document the distinction between the in-app summary and the full HTML report, including offline use and report privacy.
5. Explain that age-segmented product inclusion does not prove customer eligibility; explain the meaning of the consolidation account and the major financial assumptions.
6. Document the planned Goal capability accurately and provide the same contribution/feedback path as the app.
7. Ensure docs navigation, cross-links, edit links and app links work. Avoid duplicated guidance that can drift.
8. Maintain separate documentation build/deployment behaviour. A docs change should not unnecessarily block or trigger the web app deployment; the existing component-specific publishing model should remain intact.
9. Add a concise “verify with the bank” and “not financial/tax advice” statement where it helps users interpret outputs, without repeating it on every page.

Acceptance criteria:
- A new user can follow the documentation in the same order as the app workflow.
- Every documented control/strategy matches the current supported implementation.
- The report and app are described consistently.
- Technical documentation remains available without dominating the user guide.
- Documentation builds and deploys independently according to the existing workflow.

### Phase 5 — Cross-surface consistency and final verification

**Priority:** High  
**Goal:** ensure the app, report and documentation feel like one product and that fixes are demonstrated rather than assumed.

Work:
1. Compare app, report and docs against the canonical tokens for colour, type, focus, border, radius and spacing.
2. Verify desktop, mobile and awkward intermediate widths. Minimum viewport set: 360, 390, 768, 1024, 1280, 1440 and 1920 px.
3. Run keyboard-only checks on the full scenario journey and the report.
4. Test reduced motion, light/dark system preference where supported, and print output.
5. Test representative scenarios: simple single account; multi-account; recurring and one-off inflows; strict and best-effort outflows; same-bank/inter-bank transfers and fees; cumulative/periodic-interest/installment products; AIT on/off; senior/minor product inclusion; and large event ledgers.
6. Reconcile summary, report and raw result values for gross interest, AIT, fees, net interest, capital and final value.
7. Verify report offline operation by disabling network after generation.
8. Run the full Node.js suite, syntax checks, web build, docs build and relevant component deployment workflows.
9. Inspect browser console/network logs and verify there are no broken assets, external report requests, layout shifts or uncaught errors.
10. Capture before/after screenshots and record the tested source SHA and deployed component artifact SHAs.

Acceptance criteria:
- All selected audit findings are either fixed, explicitly deferred with rationale, or shown to be no longer applicable.
- All relevant existing tests pass and new regression/end-to-end tests cover changed behaviour.
- No financial-engine regression is introduced.
- Browser-level evidence exists for the visual and interaction claims.
- The report passes offline and data-reconciliation checks.
- Web and docs artifacts correspond to the intended source revision.

## 7. Explicitly deferred work

The following are intentionally outside the current implementation programme unless separately approved:

- **Analytics/telemetry:** deferred. No analytics provider, tracking script, cookies, telemetry endpoint or user-behaviour instrumentation in this work.
- **Expanded SEO/metadata campaign:** basic metadata already exists in the app and docs. Only correct obvious metadata defects during final QA; a broader SEO strategy is a separate task.
- **Decorative redesign or new brand palette:** not required. Retain the existing FD Cal tokens.
- **New animation system:** not required. Use motion only to communicate meaningful state changes.
- **New charting framework or UI framework:** not required. Prefer existing native report implementation.
- **Financial-engine/strategy changes:** separate scope with domain review, benchmark/regression evidence and explicit approval.
- **New backend or user accounts:** not implied by this plan. Preserve the browser-local operating model.
- **Automatic verification of bank rates, depositor age or eligibility:** do not imply such capabilities.

## 8. Implementation order and change management

Recommended delivery order:

1. Phase 0 baseline and finding triage.
2. Phase 1 first-use and configuration comprehension.
3. Phase 2 interaction and execution feedback.
4. Phase 3A summary contract and 3B report content/traceability.
5. Phase 3C standalone token packaging and 3D report accessibility/responsive/print.
6. Phase 4 user documentation.
7. Phase 5 cross-surface verification.

Keep each PR focused. Prefer one coherent workflow or report concern per PR rather than a large “UI cleanup” change. Do not mix calculation-engine refactors into UI commits. If a visual correction exposes a financial-model ambiguity, document it and open a separate issue instead of silently changing the model.

For each implementation PR:
- Link the relevant audit finding(s) and this plan section.
- State the user problem and the intended outcome.
- List the surfaces affected (web app, report, docs).
- Include before/after screenshots for visual changes.
- Add or update automated tests for behaviour changes.
- Record accessibility and responsive checks.
- Confirm the standalone report has no external dependencies if report code changed.
- Confirm summary/report values reconcile if result presentation changed.
- State what is deliberately unchanged.

## 9. Verification matrix

The audit's RPT-01–RPT-18 matrix remains the detailed report test baseline. The following additional product-level cases should be included in the implementation acceptance process.

| ID | Surface | Test | Pass condition |
|---|---|---|---|
| UX-01 | App first use | Open with no prior saved scenario | Purpose, local data behaviour and first configuration step are clear. |
| UX-02 | Configuration | Configure one account and one cash flow | User can complete the primary path without hidden syntax or unexplained terminology. |
| UX-03 | Configuration | Submit invalid dates and amounts | Field-specific correction is clear; unrelated data is retained. |
| UX-04 | Planned feature | Inspect unavailable Goal mode | Clearly marked in progress; not selectable; real feedback/contribution route available separately. |
| UX-05 | Strategy | Switch supported strategies | Only relevant settings appear; descriptions match actual behaviour. |
| UX-06 | Eligibility | Include age-segmented products | No implication that depositor eligibility has been verified. |
| UX-07 | Execution | Run a normal and a heavier scenario | Status is truthful; duplicate submission prevented; error recovery works. |
| UX-08 | Results | Inspect in-app summary | Only decision-level summary; no booking/history ledger. |
| UX-09 | Results/report | Compare summary with report | Headline metrics reconcile exactly. |
| UX-10 | Report | Generate and reopen saved report offline | All report sections, charts and controls work without network. |
| UX-11 | Report | Inspect report at 360–1920 px | No clipped critical content; navigation and tables remain usable. |
| UX-12 | Accessibility | Keyboard-only app and report walkthrough | Focus visible; all important actions and chart data accessible. |
| UX-13 | Documentation | Follow user guide against current app | Labels, routes, capabilities and limitations match the app. |
| UX-14 | Publishing | Build web and docs components | Independent deployment paths remain functional and source revisions are recorded. |

## 10. Definition of done

The programme is complete when:

- The primary scenario workflow is understandable and usable for first-time and experienced users.
- Existing brand tokens remain the single source of truth across the app and docs; the report embeds the relevant token values in its own output.
- The in-app summary remains concise and the standalone report remains the detailed, offline-capable record.
- Planned/unavailable functionality communicates roadmap intent without pretending to be interactive.
- Report content, charts, tables, privacy messaging and provenance are understandable and accessible.
- Documentation follows the user journey and matches the deployed application.
- Analytics remains absent until a separately approved future phase.
- Relevant automated tests, browser checks, responsive checks, keyboard checks, offline checks and financial reconciliation tests pass.
- No unapproved financial calculation, strategy, data-source or privacy behaviour has changed.

## 11. Source references

- [Audit findings and report test matrix](./UI-UX-AUDIT-CHARLES-SKILLS.md)
- [Canonical brand tokens](../../src/brand/tokens.css)
- [Web application markup](../../src/web/index.html)
- [Web application behaviour](../../src/web/app.js)
- [Web application styles](../../src/web/styles.css)
- [Report generator](../../src/reporting/html.js)
- [Standalone report template](../../src/reporting/template.js)
- [Documentation VitePress configuration](../.vitepress/config.mts)
- [Documentation theme](../.vitepress/theme/custom.css)
- [Getting started guide](../guide/getting-started.md)
- [Contributing guide](../../CONTRIBUTING.md)
