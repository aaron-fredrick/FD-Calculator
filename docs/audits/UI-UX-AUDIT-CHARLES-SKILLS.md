# FD Cal UI/UX Audit Findings — Charles Skills Review

**Status:** Findings documented; no implementation work authorised  
**Audit basis:** Source inspection of the FD Cal `main` branch  
**Reference repository:** [LemonFace0309/charles-skills](https://github.com/LemonFace0309/charles-skills)  
**Application repository:** [aaron-fredrick/FD-Calculator](https://github.com/aaron-fredrick/FD-Calculator)

## 1. Purpose and scope

This document records UI/UX, interaction, accessibility, design-system and product-experience findings identified during a source-level review of FD Cal, using the relevant Charles Skills as an audit framework.

It is intended as durable context for subsequent agentic workflows. Future agents should read this document before undertaking UI/UX audit or redesign work so that the observations are not lost or rediscovered without context.

**This document records findings, not implementation instructions.** It does not prescribe fixes, select a redesign, author implementation tasks, or authorise code changes. Findings should be independently revalidated against the current application before implementation because the source may change after this audit.

### Scope reviewed

Primary FD Cal files inspected:

- `src/web/index.html` — browser application markup and content structure.
- `src/web/app.js` — application state, form rendering, configuration, validation, simulation execution and results interaction.
- `src/web/styles.css` — browser application styling and responsive/accessibility rules.
- `src/brand/tokens.css` — shared brand/design tokens.
- `docs/.vitepress/config.mts` — documentation site configuration.
- `docs/.vitepress/theme/custom.css` — documentation site theme styling.
- `docs/index.md`, `docs/overview.md`, `docs/guide/getting-started.md`, `docs/strategies/index.md`, and `docs/strategies/benchmarks.md` — documentation information architecture and content.

The review included source inspection only. The deployed UI was not captured and inspected in a browser during this audit. No screenshot-based visual verification, live keyboard test, screen-reader test, or cross-viewport runtime test was completed. Findings that depend on rendered appearance or runtime behaviour are explicitly marked for verification.

## 2. Charles Skills reviewed

Reference: [charles-skills repository](https://github.com/LemonFace0309/charles-skills)

### 2.1 Relevant skills

| Skill | Relevance | Audit application |
|---|---|---|
| `charles-unslop` | High | Visual hierarchy, typography, spacing, colour, icon consistency, generic interface patterns, unnecessary UI and product-specific visual identity. |
| `charles-polish` | High | Interaction quality, form behaviour, focus/hover states, touch targets, layout stability, loading/error/success states, responsive behaviour and reduced motion. |
| `charles-unreasonable-craft` | Supporting | Independent critique, visual quality standards, consistency and evidence-based verification. Its verification mindset is relevant even where its visual target is not directly appropriate to a financial calculator. |

### 2.2 Skills not considered applicable to this audit

- `charles-arcade-motion`: specialised arcade/pixel-art motion and voiceover-timed animation workflow; not a natural fit for FD Cal's financial-planning interface.
- `charles-claude-editing`: video-editing workflow; unrelated to the application UI.
- `charles-storage-cleanup`: macOS storage-management workflow; unrelated to the application UI.

The skills are audit references, not requirements to reproduce another product's visual style. FD Cal's interface must be evaluated in the context of a financial planning and optimisation tool.

## 3. Existing implementation observations

The current application source shows several established foundations:

- A four-part scenario configuration structure covering investment window, accounts, cash flows, and strategy/assumptions.
- Strategy-dependent settings visibility.
- Shared brand tokens.
- Responsive styling and media queries.
- Explicit reduced-motion styling.
- Form validation and field-level error presentation.
- Scenario draft persistence in browser `localStorage`.
- Configuration import/export.
- Simulation result metrics and standalone HTML report actions.
- Documentation pages covering application usage, architecture, strategies and benchmarks.

These are observations about the implementation, not a conclusion that every associated user experience is complete or visually verified.

## 4. Findings

Severity labels below are provisional audit prioritisation, not confirmed defect classifications. Runtime and visual-dependent items require further evidence.

### 4.1 Scenario configuration and information architecture

**Finding UI-001 — Unavailable simulation mode is represented in the configuration experience**

- **Area:** Investment window / simulation objective.
- **Observation:** The application forces the simulation mode to `scoped` in `renderSimulationMode()`. Goal-based planning is under development and unavailable in the browser, while the UI communicates that limitation through the mode-related interface.
- **Concern:** A configuration choice that cannot currently be used may create ambiguity about supported functionality and the state of Goal mode.
- **Evidence:** `src/web/app.js`, `renderSimulationMode()`, `raw()`, and `applyConfig()`.
- **Status:** Source-verified.

**Finding UI-002 — Consolidation account terminology may not fully communicate the account's role**

- **Area:** Bank account configuration.
- **Observation:** Each account has a radio control labelled `Consolidation`; the configuration also has a `consolidation-account` selector.
- **Concern:** The term may not make the operational meaning of the selected account self-evident to all users, particularly users who do not understand the simulation's final consolidation behaviour.
- **Evidence:** `src/web/app.js`, `renderAccounts()`, `accountOptions()`, and `raw()`.
- **Status:** Source-verified wording/control; user comprehension not tested.

**Finding UI-003 — Specific-date cash-flow schedules use comma-separated date text**

- **Area:** Inflow and outflow configuration.
- **Observation:** A schedule with type `scheduled` presents a text input for comma-separated dates in `YYYY-MM-DD` format.
- **Concern:** This requires users to know and correctly enter a date-list syntax. It is a different interaction model from the date inputs used elsewhere in the form.
- **Evidence:** `src/web/app.js`, `renderOne()` and `syncSchedules()`.
- **Status:** Source-verified.

**Finding UI-004 — Cash-flow schedule complexity is concentrated inside dynamically rendered account-linked forms**

- **Area:** Inflows and outflows.
- **Observation:** Each schedule can include a name, amount, account, recurring/specific-date type, interval, date range or explicit date list. Outflows additionally expose a payment policy.
- **Concern:** The number of conditional fields and dependencies may make it difficult to understand a schedule as a whole, especially when several schedules are configured.
- **Evidence:** `src/web/app.js`, `renderOne()`, `renderSchedules()`, and `syncSchedules()`.
- **Status:** Source-verified structure; usability impact not tested.

### 4.2 FD product and age eligibility

**Finding UI-005 — Senior-citizen and minor eligibility controls are inclusion switches, not customer eligibility verification**

- **Area:** FD eligibility.
- **Observation:** The configuration exposes `include_senior` and `include_minor` switches. The application warning explains that these switches select age-segmented products and do not verify depositor age or guarantee eligibility.
- **Concern:** Users may conflate including age-segmented products in the candidate set with confirming that a depositor meets the relevant bank/product requirements.
- **Evidence:** `src/web/app.js`, `raw()` and `applyConfig()`; corresponding controls and explanatory content in `src/web/index.html`.
- **Status:** Source-verified. This is a product-model/UI distinction, not evidence that the underlying eligibility warning is absent.

**Finding UI-006 — The visible eligibility model does not itself communicate the full set of age-related product conditions**

- **Area:** FD product eligibility.
- **Observation:** The UI switches represent senior and minor product inclusion. The underlying product data and option construction also carry fields such as customer segment, minimum/maximum age, inclusive boundaries and guardian requirement.
- **Concern:** The visible controls do not, by themselves, expose the complete set of product-level eligibility conditions represented in the data model.
- **Evidence:** `src/web/app.js`, `raw()`, `applyConfig()`, and `getOptions()`.
- **Status:** Source-verified distinction between visible controls and product fields. The exact information exposed elsewhere in the rendered interface requires browser verification.

### 4.3 Strategy configuration

**Finding UI-007 — Strategy settings are conditional and differ by strategy**

- **Area:** Strategy selection and advanced settings.
- **Observation:** The UI conditionally displays Greedy settings, GSS settings, or Absolute R+ settings. Absolute R+ exposes beam width, local branch limit and decision cap; Greedy exposes tenor tie-breakers; GSS exposes a small-period threshold.
- **Concern:** Users must understand both the strategy choice and the meaning/impact of its specialised controls. The source establishes the controls, but does not establish that every setting's consequences are sufficiently clear to users.
- **Evidence:** `src/web/app.js`, `syncStrategySettings()`, `raw()`, and `applyConfig()`; strategy controls in `src/web/index.html`.
- **Status:** Conditional behaviour source-verified; explanatory quality requires browser/content review.

**Finding UI-008 — Search-budget controls and financial assumptions coexist in the broader configuration area**

- **Area:** Strategy and assumptions.
- **Observation:** The raw configuration includes search settings, strategy tie-breakers, compounding, AIT, leap-year calculation and transfer-fee settings.
- **Concern:** These settings represent different conceptual categories: optimisation/search behaviour versus financial modelling assumptions. Their grouping and hierarchy should be examined for conceptual clarity.
- **Evidence:** `src/web/app.js`, `raw()`, and `applyConfig()`.
- **Status:** Source-verified configuration model; rendered grouping requires browser verification.

### 4.4 Simulation execution and feedback

**Finding UI-009 — Simulation computation runs synchronously on the browser main thread**

- **Area:** Run simulation / responsiveness.
- **Observation:** The submit handler updates status text, yields for a browser paint, loads options and then calls `simulate(c)`. The `simulate(c)` function constructs the selected strategy and invokes `new SimulationEngine().run(s,input)) synchronously.
- **Concern:** Computationally expensive scenarios can occupy the main thread. During such work, rendering and user interaction may be delayed or blocked, which can undermine loading feedback and perceived responsiveness.
- **Evidence:** `src/web/app.js`, `simulate()` and the `scenario-form` submit handler in `wire()`.
- **Status:** Synchronous call path source-verified. The duration and severity of visible blocking require runtime profiling on representative scenarios.

**Finding UI-010 — Loading feedback is dependent on the browser being able to render between synchronous stages**

- **Area:** Simulation status.
- **Observation:** The submit handler changes the status text and awaits `nextPaint()` before loading data and before running the simulation. The calculation itself is synchronous.
- **Concern:** Status text may be visible before the calculation begins but may not continue to animate or update while the main thread is occupied.
- **Evidence:** `src/web/app.js`, `nextPaint()` and the submit handler.
- **Status:** Source-verified execution sequence; visible behaviour requires runtime verification.

**Finding UI-011 — Initial event wiring occurs after catalogue loading**

- **Area:** Application initialisation.
- **Observation:** `init()` loads bank and FD index CSV data using `Promise.all`, then calls `wire()`. The source shows the form submit handler is attached inside `wire()`.
- **Concern:** Before catalogue loading and event wiring complete, the displayed form may not yet have its normal interaction handlers. The initial disabled/enabled state of controls and the exact visible loading experience need inspection.
- **Evidence:** `src/web/app.js`, `init()` and `wire()`.
- **Status:** Source-verified ordering; actual early-interaction behaviour requires browser verification.

### 4.5 Results and report experience

**Finding UI-012 — The in-page results summary is primarily a set of aggregate financial metrics**

- **Area:** Simulation results.
- **Observation:** The results renderer displays gross interest, AIT withheld, transfer fees, net interest, final value and capital invested for scoped results. It also displays goal-specific metrics when a goal outcome exists.
- **Concern:** Aggregate metrics alone may not explain how the strategy produced the outcome or how the portfolio evolved through individual events.
- **Evidence:** `src/web/app.js`, `results()`.
- **Status:** Source-verified.

**Finding UI-013 — Strategy decision transparency is not established by the inspected in-page summary**

- **Area:** Results explanation.
- **Observation:** The inspected results summary exposes aggregate values and actions to open/download the HTML report and download the configuration. The inspected summary code does not itself establish a complete explanation of selected products, rejected alternatives, search constraints or decision rationale.
- **Concern:** Users may have difficulty understanding why a particular FD plan was selected from the summary view alone.
- **Evidence:** `src/web/app.js`, `results()`; report generation is delegated to `generateHtmlReport()` in `src/reporting/html.js`.
- **Status:** The in-page summary observation is source-verified. The full standalone report was not audited in this pass; do not infer that the report lacks these details.

**Finding UI-014 — The results experience spans the browser summary and a separate HTML report**

- **Area:** Results/report continuity.
- **Observation:** The application creates a standalone HTML report, exposes an open-report action and a download-report action, and separately exposes configuration download.
- **Concern:** The continuity of information architecture, terminology, visual hierarchy and user orientation between the in-page result and standalone report has not been established by this source review.
- **Evidence:** `src/web/app.js`, `results()`, and the import of `generateHtmlReport()`.
- **Status:** Source-verified split; report-level consistency requires separate inspection.

### 4.6 Accessibility and interaction semantics

**Finding UI-015 — Custom tooltip semantics need accessibility verification**

- **Area:** Help/tooltips.
- **Observation:** The source contains a custom help tooltip implemented with a focusable `span`, `role="img"` and an `aria-label`, while explanatory content is held in a `data-tooltip` attribute.
- **Concern:** The semantic relationship between the focused help affordance and its explanatory content is not established by this markup alone. Announcement and keyboard behaviour may differ across assistive technologies.
- **Evidence:** Help/tooltip markup in `src/web/index.html` and tooltip styling/behaviour in `src/web/styles.css`.
- **Status:** Source-level concern; screen-reader and keyboard testing not performed.

**Finding UI-016 — Accessibility implementation exists but has not been validated end-to-end**

- **Area:** Overall accessibility.
- **Observation:** The source includes explicit labels, `aria-invalid`, field-level error messages, focus-visible styling, reduced-motion rules and touch-target styling.
- **Concern:** The existence of these attributes and rules does not prove complete keyboard accessibility, correct screen-reader announcements, sufficient contrast, logical focus order or usable zoom/reflow.
- **Evidence:** `src/web/app.js`, `src/web/index.html`, and `src/web/styles.css`.
- **Status:** Partial support source-verified; conformance and runtime behaviour unverified.

**Finding UI-017 — Removal interactions use animation completion with a timeout fallback**

- **Area:** Dynamic account and schedule removal.
- **Observation:** The removal flow disables the button, marks the card as removing, listens for an animation-end event and uses a timeout fallback to complete removal.
- **Concern:** The relationship between animation state, reduced-motion settings, focus position after removal and assistive-technology feedback has not been tested.
- **Evidence:** `src/web/app.js`, `animateRemoval()`; removal handlers in `wire()`.
- **Status:** Source-verified; interaction/accessibility behaviour requires runtime verification.

### 4.7 Design system and styling maintainability

**Finding UI-018 — The application stylesheet contains accumulated overrides and repeated rules**

- **Area:** CSS architecture.
- **Observation:** `src/web/styles.css` contains multiple appended styling sections, repeated selectors/media-query areas and component-specific overrides.
- **Concern:** The cascade is harder to reason about and the same component behaviour may be defined or adjusted in multiple locations. This creates a maintainability and visual-consistency risk.
- **Evidence:** `src/web/styles.css`.
- **Status:** Source-inspection finding.

**Finding UI-019 — Shared brand tokens coexist with component-level hardcoded styling**

- **Area:** Design tokens.
- **Observation:** `src/brand/tokens.css` defines shared brand values, while the web stylesheet also contains component-level values and overrides.
- **Concern:** The degree to which colour, spacing, typography, radius and state styling consistently derive from shared tokens is not established. This may lead to drift between components and between the application and documentation.
- **Evidence:** `src/brand/tokens.css`, `src/web/styles.css`, and `docs/.vitepress/theme/custom.css`.
- **Status:** Both token and component styling sources verified; complete token-usage inventory not performed.

**Finding UI-020 — Rendered visual hierarchy and product-specific identity have not been independently assessed**

- **Area:** Visual design.
- **Observation:** Source files establish a dark theme, shared tokens and a structured form-based application. No browser screenshots were captured during this audit.
- **Concern:** Actual typography scale, spacing rhythm, contrast, density, alignment, icon consistency, visual hierarchy and perceived distinctiveness cannot be reliably judged from source inspection alone.
- **Evidence:** `src/web/index.html`, `src/web/styles.css`, and `src/brand/tokens.css`.
- **Status:** Open visual-audit requirement; not a confirmed visual defect.

### 4.8 Privacy and local persistence

**Finding UI-021 — Scenario drafts are persisted in browser localStorage**

- **Area:** Scenario persistence and privacy.
- **Observation:** The application stores the scenario draft under `fd-cal:draft:v1` using `localStorage`, and attempts to restore it during initialisation.
- **Concern:** Users may not understand that scenario data remains in the browser across visits or on a shared device. Financial scenario information can be sensitive even where it is not a bank credential.
- **Evidence:** `src/web/app.js`, `STORAGE_KEY`, `saveDraft()`, and `restoreDraft()`.
- **Status:** Source-verified.

**Finding UI-022 — No explicit user-facing clear-saved-draft control was identified in the inspected application flow**

- **Area:** Local data control.
- **Observation:** The inspected persistence code writes, restores and removes a draft when restoration fails. The inspected UI wiring exposes configuration import/export but no normal user-facing action to clear a valid saved draft.
- **Concern:** Users may not have an obvious way to remove persisted scenario data from the application.
- **Evidence:** `src/web/app.js`, `saveDraft()`, `restoreDraft()`, and `wire()`.
- **Status:** Not identified in inspected source; verify the complete markup and all UI entry points before treating as a confirmed absence.

### 4.9 Documentation website

**Finding UI-023 — Documentation is strongly developer/architecture oriented**

- **Area:** Documentation information architecture.
- **Observation:** The reviewed documentation covers project architecture, strategy internals, benchmark methodology, simulation lifecycle and getting started. The getting-started guide describes how to configure and run a scenario, but the overall documentation set is substantially technical.
- **Concern:** A user seeking practical guidance on configuring accounts, eligibility, cash flows, strategies and interpreting results may not find a single cohesive user-oriented journey.
- **Evidence:** `docs/index.md`, `docs/overview.md`, `docs/guide/getting-started.md`, `docs/strategies/index.md`, and `docs/strategies/benchmarks.md`.
- **Status:** Source/content inspection finding.

**Finding UI-024 — Application and documentation are separate presentation surfaces**

- **Area:** Cross-surface consistency.
- **Observation:** The browser application has its own markup and stylesheet; the documentation site uses VitePress and its own theme customisation while referencing shared brand tokens.
- **Concern:** Visual and interaction consistency between the application and documentation has not been established through rendered comparison.
- **Evidence:** `src/web/index.html`, `src/web/styles.css`, `src/brand/tokens.css`, `docs/.vitepress/config.mts`, and `docs/.vitepress/theme/custom.css`.
- **Status:** Separate implementation surfaces source-verified; consistency unverified.

## 5. Cross-cutting verification gaps

The following aspects were not verified in this audit and must not be represented as passing:

- Actual rendered visual quality at desktop, tablet and mobile widths.
- Layout behaviour at 360, 390, 768, 1024, 1280, 1440 and 1920 CSS pixels.
- Keyboard-only completion of the entire scenario workflow.
- Screen-reader announcements for help, validation, loading, results and dynamic removal.
- Colour contrast for text, controls, focus indicators, charts and disabled states.
- Browser behaviour during slow or failed catalogue loading.
- Responsiveness during representative long-running strategy calculations.
- Focus restoration after adding/removing accounts and schedules.
- Full standalone HTML report UX and its consistency with the in-page results.
- Cross-browser rendering and mobile touch interaction.
- Visual consistency between the web application and VitePress documentation.

## 6. Audit status and interpretation

This is a **preliminary source-based findings register**, not a final visual/accessibility certification.

The findings are intentionally descriptive. They identify observed implementation characteristics, potential user-facing consequences and evidence locations. They do not decide the implementation approach or prescribe a solution.

Future workflows using this document should:

1. Re-read the current versions of the referenced files and confirm whether each finding still applies.
2. Treat items marked as requiring runtime/browser verification as unconfirmed until evidence is collected.
3. Avoid interpreting a missing feature in one inspected function as proof that it is absent everywhere in the application.
4. Preserve financial calculation correctness, strategy semantics and existing data/eligibility constraints when separately planning any UI work.
5. Record new evidence and changed status rather than silently deleting or rewriting historical findings.

## 7. Reference links

- [Charles Skills repository](https://github.com/LemonFace0309/charles-skills)
- [charles-unslop](https://github.com/LemonFace0309/charles-skills/tree/main/skills/charles-unslop)
- [charles-polish](https://github.com/LemonFace0309/charles-skills/tree/main/skills/charles-polish)
- [charles-unreasonable-craft](https://github.com/LemonFace0309/charles-skills/tree/main/skills/charles-unreasonable-craft)
- [FD Cal repository](https://github.com/aaron-fredrick/FD-Calculator)
- [FD Cal web application source](https://github.com/aaron-fredrick/FD-Calculator/tree/main/src/web)
- [FD Cal brand tokens](https://github.com/aaron-fredrick/FD-Calculator/blob/main/src/brand/tokens.css)
- [FD Cal documentation](https://github.com/aaron-fredrick/FD-Calculator/tree/main/docs)
