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


---

# Addendum — user-centred product and GitHub Pages review

**Review date:** 8 November 2026  
**Source revision reviewed:** `main` at `e952c9509be8d9ac57f7fd0ceb6f1221094e10dc`  
**Published web artifact:** `pages-web-artifact` at `00afe0afacbdb0601d6ba95eee3b515eb5c338c8`  
**Published docs artifact:** `pages-docs-artifact` at `e401a1703217717b3da7a790d261f7dcf324bc67`  
**Published component source revision:** Both artifact commit messages identify source revision `e952c9509be8d9ac57f7fd0ceb6f1221094e10dc`. The `pages-deploy-state` record identifies those same web and docs artifact SHAs as the currently recorded deployment components.

This addendum extends the original source audit with a user-context review of the two public GitHub Pages surfaces: the browser tool and the VitePress documentation website. It also inspects the published component artifacts and the independent Pages publication workflows. It does not authorise code changes, visual redesign, content rewrites or workflow changes.

## A. Product context and user mental model

### A.1 What FD Cal is from the user's perspective

FD Cal is a Sri Lankan fixed-deposit portfolio planning and simulation tool. A user brings a hypothetical or intended investment scenario and uses the tool to explore how money could be allocated across supported bank accounts and fixed-deposit products over a selected date range.

The scenario can represent:

- Money currently allocated for FD investing across one or more savings accounts.
- Additional money arriving over time, such as salary or savings contributions.
- Planned withdrawals or expenses that need to be funded.
- Different banks, FD products, tenures, payout structures and account-level eFD capability.
- Modelling assumptions such as AIT withholding, compounding, leap-year day count and transfer fees.
- Alternative planning strategies with different search behaviour, runtime cost and optimality guarantees.

The user-facing outcome is a simulated portfolio plan and its financial/event history. The tool does **not** connect to a user's bank, verify the user's identity or account ownership, execute a transfer, open an FD, reserve a rate or guarantee that a bank will accept a placement. The catalogue and assumptions are inputs to a model; they are not a live bank quote or a substitute for confirming current product terms.

This distinction matters to every UI and documentation judgement. FD Cal is not primarily a generic calculator, bank comparison directory, online deposit marketplace or transaction interface. It is a scenario-based planning and optimisation tool whose output is conditional on user inputs, available catalogue rows and configured assumptions.

### A.2 Primary user journey implied by the product

The end-to-end user task implied by the current application is:

1. Understand the scope and limitations of FD Cal.
2. Choose the investment start and end dates.
3. Add the bank accounts participating in the plan and enter only the amount allocated to FD investing in each account.
4. Describe future inflows and required outflows, including which account they affect and when they occur.
5. Select eligible product groups and financial assumptions.
6. Choose a planning strategy and, where relevant, understand its search controls.
7. Run the simulation.
8. Interpret the resulting portfolio, bookings, cash movements, interest, withholding, fees, unpaid obligations and limitations.
9. Decide independently whether to verify a product with the bank and act outside FD Cal.

This is a product-context model inferred from the source and documentation, not a validated user-research journey. No interviews, analytics, usability sessions or observed user recordings were available.

### A.3 Distinct audiences

The public surfaces serve at least two materially different audiences:

- **FD planning users:** people who want to understand or compare possible fixed-deposit allocations without needing to understand the implementation of the optimisation algorithms.
- **Developers and technically curious users:** people who want to run the CLI, inspect strategies, understand the simulation lifecycle, reproduce benchmarks, contribute code or investigate financial-model behaviour.

The current documentation contains substantial material for the second audience. The browser tool is the primary interface for the first. The degree to which the documentation bridges these audiences is an explicit subject of the findings below.

### A.4 Existing user-protective context that is already present

The current web markup and documentation already communicate several important boundaries:

- The starting balance entered for an account is the amount allocated to FD investing, not necessarily the full balance held at the bank.
- Scenario data is processed in the browser and is not uploaded by the application.
- The browser has configuration import/export controls.
- The age-segment switches include senior/minor products but do not establish an individual's eligibility.
- The application says the simulation does not execute bank transfers or open deposits.
- The application and documentation warn users to verify bank terms and not treat results as financial or tax advice.
- The age-eligibility reference distinguishes simulated products from research-only entries and records cases where product terms are incomplete or conflicting.

These are meaningful foundations. The findings below concern the visibility, timing, discoverability and coherence of this information, not an assumption that the project has ignored it.

## B. Review of the published GitHub Pages surfaces

### B.1 Browser application

**Published URL:** [FD Cal web application](https://aaron-fredrick.github.io/FD-Calculator/web/)  
**Source:** `src/web/index.html`, `src/web/app.js`, `src/web/styles.css`, shared modules under `src/core/`, `src/strategies/`, `src/fd-options/` and `src/reporting/`.  
**Published artifact inspected:** `pages-web-artifact/web/index.html`.

The published web artifact was inspected as generated HTML/source, not through an interactive browser session. Its markup confirms the public application entry point, page structure, copy, navigation, form sections and results actions. It does not establish how the page looks or behaves at runtime.

The current entry experience presents four numbered areas:

1. Investment window.
2. Bank accounts.
3. Cash-flow plans.
4. Strategy and settings.

The page also exposes import/export JSON, a documentation link, a support link, a catalogue-loading status, a local-processing note and a run-simulation action. The results area exposes aggregate metrics, an HTML report, a configuration download and a statement that the simulation does not execute transactions.

From a user perspective, the most consequential concepts are not the implementation details of the strategies; they are the amount of money being modelled, when money becomes available or is needed, which products can be considered, how much liquidity remains available, and what the resulting plan actually means. The review therefore considers whether the interface communicates those concepts in the order and language a depositor is likely to understand.

### B.2 Documentation website

**Published URL:** [FD Cal documentation](https://aaron-fredrick.github.io/FD-Calculator/docs/)  
**Source:** `docs/`, `docs/.vitepress/config.mts`, `docs/.vitepress/theme/custom.css` and `scripts/build-docs-site.sh`.  
**Published artifact inspected:** `pages-docs-artifact/docs/index.html`, `overview.html`, `guide/getting-started.html`, `strategies/index.html`, `strategies/benchmarks.html`, `reference/fd-eligibility.html` and `strategies/ABSOLUTE-PLUS.html`.

The published docs home has a clear project identity, a concise high-level tagline, Get started and Explore strategies actions, feature summaries, and a separate callout linking to the web application. The global navigation includes Overview, Strategies, Architecture and Open app. This provides a working route between the two public surfaces.

The documentation sidebar has a **User guide** group whose only current item is Issues and support. The Getting started page briefly explains how to open and run the browser app, then moves into Node.js installation, repository cloning, CLI commands and local configuration. Most deeper pages explain architecture, strategy mechanics, benchmark setup or contributor/developer workflows.

The documentation is therefore navigable and technically substantial, but the published information architecture is weighted towards project/engineering knowledge rather than a complete depositor-oriented operating guide.

### B.3 GitHub Pages publication model

The current repository does not publish the docs and browser application as one indivisible build:

- `.github/workflows/web-pages.yml` builds and publishes the web component to `pages-web-artifact`.
- `.github/workflows/docs-pages.yml` runs the Scoped Range and Absolute R+ benchmark jobs, validates their generated data, builds the VitePress docs and publishes the docs component to `pages-docs-artifact`.
- `.github/workflows/pages.yml` assembles the latest published/baseline web and docs components and deploys the combined Pages site.
- `pages-deploy-state/deployment.json` records the web and docs artifact SHAs used for the last recorded deployment.

The currently recorded component artifacts both identify the same source revision, `e952c9509be8d9ac57f7fd0ceb6f1221094e10dc`. There is no evidence in that deployment record of a current source-revision mismatch between the two components.

The component publication workflows are restricted to `main` for their normal push-triggered builds. A documentation-only commit on this audit branch does not, by itself, rebuild or publish the public documentation website. The audit branch is a review/documentation branch, not a Pages preview environment.

## C. Additional findings

The numbering continues from UI-024. These findings add product-context and cross-surface observations; they do not supersede the original findings.

### C.1 Product positioning and first-use comprehension

**Finding UI-025 — The browser introduction foregrounds implementation context more than the user's financial-planning outcome**

- **Area:** Product proposition / first impression.
- **Observation:** The application heading is “Build your FD strategy.” The introductory paragraph asks users to configure accounts, cash movements and an investment window, then explains that the browser runs the same JavaScript calculation engine as the CLI and that scenario data stays in the browser.
- **Concern:** The shared-engine statement is meaningful to technical audiences but is not the central question a first-time depositor is likely to have: what decision will this tool help me explore, what information do I need, and what will it give me back? The page's financial-planning purpose is present in metadata and section labels, but the first-use explanation is weighted towards configuration and implementation.
- **Evidence:** `src/web/index.html`, metadata, intro section and `docs/overview.md`.
- **Status:** Published markup/source verified; first-impression comprehension not tested with users.

**Finding UI-026 — The browser workflow is structured, but a first-time user journey is not documented end-to-end**

- **Area:** Onboarding / task completion.
- **Observation:** The app presents four numbered sections, but the reviewed entry markup does not provide a sample scenario or an end-to-end worked example. The published Getting started page says to configure inputs, choose a strategy and run the simulation, then transitions to developer setup and CLI instructions.
- **Concern:** A first-time user must infer the order and meaning of several financial inputs without a cohesive walkthrough showing how a realistic scenario is assembled and how the resulting report should be read.
- **Evidence:** `src/web/index.html`; `docs/guide/getting-started.md`; published `docs/guide/getting-started.html`.
- **Status:** Source and published content verified; user comprehension and task completion not tested.

**Finding UI-027 — The interface mixes depositor language with optimisation and financial-model terminology**

- **Area:** Language / domain comprehension.
- **Observation:** The interface uses terms including “Scoped date range”, “Consolidation account”, “Optimisation strategy”, “AIT”, “eFD”, “Beam width”, “Local branch limit” and “Decision cap”. Some fields have helper text or tooltips; others rely on the user knowing the domain term. The strategy documentation explains the technical meanings in depth.
- **Concern:** The user must cross a terminology gap between ordinary deposit planning and algorithm/search concepts. The amount of explanation is uneven, and the current documentation does not provide one plain-language glossary or user-level explanation spanning these terms.
- **Evidence:** `src/web/index.html`, `src/web/app.js`, `docs/STRATEGIES.md`, `docs/strategies/ABSOLUTE-PLUS.md`, `docs/reference/fd-eligibility.md`.
- **Status:** Terminology source-verified; comprehension impact not tested.

**Finding UI-028 — The tool's simulation-only boundary is more explicit in the results area than at the point of entry**

- **Area:** User expectation / financial safety.
- **Observation:** The results area says that the simulation does not execute bank transfers or open deposits. The intro describes local browser computation, while the page footer says it is an open-source planning tool and not financial or tax advice.
- **Concern:** A user should understand before entering financial information that this is a planning simulation, not a bank-connected service, executable instruction, rate reservation or transaction workflow. The explicit non-execution statement is currently located with the results actions rather than being the primary first-use explanation.
- **Evidence:** `src/web/index.html`, intro, results section and footer; `src/web/README.md`; `docs/guide/getting-started.md`.
- **Status:** Copy and placement source-verified; user expectation not tested.

### C.2 Scenario inputs and financial mental model

**Finding UI-029 — The account-balance explanation is a strong existing user-context safeguard**

- **Area:** Account input / financial mental model.
- **Observation:** The Bank accounts section explicitly says the starting balance is only the amount allocated to FD investing, not the account's entire bank balance, and provides an LKR 100,000 / LKR 20,000 example.
- **Concern:** No defect is asserted here. This is an important positive baseline because confusing total bank balance with investable scenario capital could materially distort a user's plan. Future review should preserve this distinction and assess whether it remains visible when users add or import accounts.
- **Evidence:** `src/web/index.html`, Bank accounts section.
- **Status:** Positive source-verified observation; runtime persistence/import comprehension not tested.

**Finding UI-030 — Age-product controls are not directly connected to the detailed eligibility reference at the point of choice**

- **Area:** Age-based product discovery / eligibility.
- **Observation:** The app explains that senior/minor switches include age-segmented products and do not verify a depositor's age or guarantee eligibility. The docs contain a detailed age-eligibility reference with bank-specific cutoffs, inclusive/exclusive boundaries, guardian conditions, catalogue coverage and research-only products. The application markup's strategy control has a direct strategy-documentation link; the age-product controls do not have an equivalent direct reference link in the inspected markup.
- **Concern:** A user considering a senior or minor FD may need the bank-specific age threshold, minimum, tenure, guardian requirement and product coverage to interpret the switch correctly. The detailed evidence exists, but the connection is less immediate than the strategy documentation connection.
- **Evidence:** `src/web/index.html`, Age-based FD products section; `docs/reference/fd-eligibility.md`; `docs/.vitepress/config.mts`.
- **Status:** Source and docs content verified; actual discovery path not usability-tested.

**Finding UI-031 — Product catalogue provenance and freshness are not prominent in the main scenario-entry surface**

- **Area:** Data trust / rate interpretation.
- **Observation:** The application displays a catalogue-loading status and states that rates, minimums and default transfer fees come from repository datasets. The detailed documentation and source datasets contain bank/product information and source/effective-date context, including incomplete or research-only eligibility cases. The main app entry copy does not itself present a concise catalogue coverage summary or a visible last-verified/effective-date overview.
- **Concern:** Fixed-deposit rates and terms are time-sensitive. A user may not know how broad the current catalogue is, which entries have current source evidence, or how old a particular rate is without leaving the planning flow and consulting supporting material.
- **Evidence:** `src/web/index.html`, catalogue status and strategy/assumptions hints; `data/fd_options/`; `docs/reference/fd-eligibility.md`; `docs/strategies/benchmarks.md`.
- **Status:** Entry-surface copy/source verified; exact provenance surfaced in all dynamic product/report states requires further inspection.

**Finding UI-032 — Strategy choice is exposed as an algorithm choice before a plain-language decision aid**

- **Area:** Strategy selection.
- **Observation:** The web form presents Absolute R+, Greedy and GSS by name, with conditional algorithm-specific settings. A documentation icon opens the strategy documentation. The strategy guide describes each method's search approach and optimality limits, but much of that explanation is technical.
- **Concern:** A depositor may not know which strategy is appropriate for a given need, what trade-off is being made, or how to interpret a result that is heuristic or bounded. The choice currently assumes more familiarity with optimisation methods than the core financial-planning task requires.
- **Evidence:** `src/web/index.html`, strategy selector and conditional settings; `docs/STRATEGIES.md`; `docs/strategies/index.md`; individual strategy references.
- **Status:** Source and published docs verified; choice quality and decision confidence not tested.

**Finding UI-033 — Users compare strategies by rerunning scenarios rather than through an explicit in-app comparison flow**

- **Area:** Results comparison / decision support.
- **Observation:** The web form selects one strategy per simulation and renders that run's result. The app provides configuration export and an HTML report; the repository's benchmark pages compare strategies on predefined, shared scenarios. The reviewed web markup does not show a control for running and comparing multiple strategies against the user's current scenario in one results view.
- **Concern:** A user wanting to know whether Greedy, GSS and Absolute R+ produce materially different plans for their own inputs must understand that comparison is not the same as the published benchmark and may need to repeat runs while preserving identical settings.
- **Evidence:** `src/web/index.html`, strategy selector and results section; `src/web/app.js`, form submission and results rendering; `docs/strategies/benchmarks.md`.
- **Status:** Single-strategy UI flow source-verified; any alternate comparison workflow outside the inspected markup requires confirmation.

### C.3 Results interpretation and user confidence

**Finding UI-034 — The in-page result summary and standalone HTML report need a deliberately strict division of detail**

- **Area:** Results hierarchy / report continuity.
- **Observation:** The in-page result currently presents six top-line metrics: gross interest, AIT withheld, transfer fees, net interest, final value and capital invested. It then offers Open report, Download HTML report and Download config JSON actions. The standalone HTML report contains the detailed portfolio, booking/execution plan, analytics, cash-flow schedules, capital movements and full event ledger.
- **Concern:** This is the correct product-level separation and must be preserved. The in-page result is a summary, not a second copy of the full report. Adding every FD booking, maturity, transfer, event or historical ledger entry to the result summary would duplicate the report, increase result-screen density and make the primary outcome harder to scan. The summary should communicate the overall outcome and clearly hand off to the full report for detail. This finding is a preservation constraint, not a request to expand the summary.
- **Evidence:** `src/web/index.html`, results section; `src/web/app.js`, `results()`; `src/reporting/html.js`; `src/reporting/template.js`.
- **Status:** Current six-metric summary and separate report implementation source-verified. The summary/report division is an explicit product requirement. Runtime presentation not browser-tested.

**Finding UI-035 — Benchmark pages can be mistaken for user-specific recommendations unless their role is understood**

- **Area:** Evidence / benchmark interpretation.
- **Observation:** The documentation publishes controlled strategy sensitivity studies using fixed scenario inputs, a defined bank catalogue snapshot and specified financial assumptions. The benchmark documentation explains the study setup and that strategy observations use identical inputs.
- **Concern:** Benchmark charts are evidence about strategy behaviour under those test conditions; they are not a personalised recommendation, a current market-wide ranking or a forecast for a user's own scenario. This distinction is present in the methodology, but the pages are technical and require careful reading to infer the limits.
- **Evidence:** `docs/strategies/benchmarks.md`, benchmark setup, catalogue and Reading the results sections; published `docs/strategies/benchmarks.html`.
- **Status:** Benchmark methodology source and published output verified; user interpretation not tested.

### C.4 Documentation website as a user-support surface

**Finding UI-036 — The published documentation sidebar has no dedicated practical user-guide journey**

- **Area:** Documentation information architecture.
- **Observation:** The published sidebar's User guide group contains only Issues and support. Getting started is under Start here and is a short hybrid page: a brief browser-app introduction followed by developer setup and CLI usage. The remaining navigation is predominantly strategies, architecture, tools/libraries and contributing.
- **Concern:** A user who needs to learn how to construct a scenario, select account balances, configure inflows/outflows, understand age-product inclusion, select a strategy, interpret results or export a report does not have a clearly signposted set of task-oriented guide pages in the current navigation.
- **Evidence:** `docs/.vitepress/config.mts`, `docs/guide/getting-started.md`; published `docs/overview.html` and `docs/guide/getting-started.html`.
- **Status:** Source navigation and published sidebar/content verified.

**Finding UI-037 — Documentation homepage positioning is clearer than the detailed user onboarding that follows it**

- **Area:** Docs landing-to-task continuity.
- **Observation:** The docs homepage uses “Fixed-deposit planning, made transparent”, describes the shared engine/strategy/architecture features, and provides Get started, Explore strategies and Open web application links. The subsequent Getting started page does not expand this into a detailed depositor workflow.
- **Concern:** The landing page establishes a useful identity and entry points, but the next step does not fully answer the practical questions a first-time user is likely to have before entering financial scenario data.
- **Evidence:** `docs/index.md`, `docs/guide/getting-started.md`, `docs/.vitepress/config.mts`; published `docs/index.html` and `docs/guide/getting-started.html`.
- **Status:** Source and published output verified; task success not tested.

**Finding UI-038 — Technical strategy references explain algorithm internals more deeply than user-facing implications**

- **Area:** Documentation language and audience fit.
- **Observation:** Strategy references explain search states, candidate ordering, pruning, decision contracts, recursion, optimality proofs and runtime ownership. The strategy guide contains a concise comparison table, including typical use and optimality, but the linked technical references are primarily implementation-oriented.
- **Concern:** Users who follow the strategy link from the application may land in material that explains how an algorithm works without first getting a concise, user-level account of what differences they should expect in planning behaviour, result interpretation and practical trade-offs.
- **Evidence:** `docs/STRATEGIES.md`, `docs/strategies/GREEDY.md`, `docs/strategies/GSS.md`, `docs/strategies/ABSOLUTE.md`, `docs/strategies/ABSOLUTE-PLUS.md`.
- **Status:** Source and published strategy content verified.

**Finding UI-039 — The docs website is the main source of detailed product caveats, but the route from relevant app controls is uneven**

- **Area:** Contextual help / cross-surface discoverability.
- **Observation:** Detailed caveats are distributed across Getting started, the strategy guide, benchmark pages and the age-eligibility reference. The application provides a direct strategy-documentation link, a general Documentation link and a support link; the inspected markup does not provide equally contextual links for every high-consequence concept such as age eligibility, catalogue provenance or report interpretation.
- **Concern:** Users may need to search the documentation or understand its sidebar taxonomy to locate the explanation relevant to the control they are using.
- **Evidence:** `src/web/index.html`; `docs/.vitepress/config.mts`; `docs/guide/getting-started.md`; `docs/reference/fd-eligibility.md`; `docs/strategies/benchmarks.md`.
- **Status:** Source/navigation verified; actual navigation behaviour and findability not tested.

### C.5 Cross-surface publishing and version context

**Finding UI-040 — The web application and documentation can be published from independent source revisions**

- **Area:** Public-surface consistency / release traceability.
- **Observation:** Separate workflows publish web and docs artifacts independently. The reusable Pages workflow assembles the latest available component artifact (or preserved baseline) for each component. The deployment-state branch records the selected artifact SHAs. The current recorded artifacts both identify the same source revision, but the architecture permits a web artifact and docs artifact from different source revisions to be assembled if one component has updated and the other has not.
- **Concern:** A user can encounter a documentation page that describes a newer or older capability than the currently served browser app, or vice versa, during component publication gaps. The current deployment record does not show that mismatch now; this is a structural consistency risk, not a claim of a current defect.
- **Evidence:** `.github/workflows/web-pages.yml`, `.github/workflows/docs-pages.yml`, `.github/workflows/pages.yml`, `pages-deploy-state/deployment.json`.
- **Status:** Workflow architecture source-verified; current component SHAs inspected and match source revision `e952c9509be8d9ac57f7fd0ceb6f1221094e10dc`.

**Finding UI-041 — Audit-branch documentation changes are not a live Pages preview**

- **Area:** Review and publication expectations.
- **Observation:** The web and docs component workflows run on `main` pushes (and manual dispatch subject to a `main` ref condition). The Pages assembly workflow consumes published artifact/baseline branches. The current audit branch `docs/ui-ux-audit-charles-skills` is not a configured preview source for either component.
- **Concern:** A reviewer may assume that changing documentation on this branch changes the public docs site. It does not; the change remains in the Git branch until separately merged/published through the configured workflow.
- **Evidence:** `.github/workflows/web-pages.yml`, `.github/workflows/docs-pages.yml`, `.github/workflows/pages.yml`.
- **Status:** Workflow conditions source-verified.

## D. Additional verification still outstanding

The repository and published artifacts were inspected, but this review did **not** execute the application in a real browser. The following are still open and must not be described as passed:

- Live browser inspection of [the web app](https://aaron-fredrick.github.io/FD-Calculator/web/) and [the docs site](https://aaron-fredrick.github.io/FD-Calculator/docs/) at desktop, tablet and mobile breakpoints.
- A real first-time user completing a scenario without verbal or written assistance.
- Comprehension testing for account balance semantics, consolidation, AIT, eFD, strict/deferred/best-effort outflows and strategy settings.
- Catalogue loading success, slow loading, partial data, failed network requests and the user's ability to understand catalogue coverage/freshness.
- Running the same user scenario with all web-supported strategies and comparing result values, plan composition, feasibility, runtime and report output.
- Full report inspection with representative scenarios, including cases with no bookings, multiple accounts, cash flows, strict unpaid outflows and age-segmented products.
- Browser persistence behaviour across reloads, imported configurations and shared-device scenarios.
- Keyboard, screen-reader, contrast, zoom/reflow, reduced-motion and focus management across both public surfaces.
- Cross-browser testing and real touch-device testing.
- Confirming the source revision represented by each future Pages deployment and whether the docs/app describe the same capability set after independent publications.

## E. Instructions for future agentic workflows

When using this audit as context for a later UI/UX or product-experience task:

1. Read the original findings UI-001–UI-024 and this addendum UI-025–UI-041 together.
2. Treat FD Cal as a financial planning/simulation tool, not a transaction platform or live-rate marketplace.
3. Evaluate each interface from the perspective of a depositor trying to construct, understand and verify a fixed-deposit plan; separately evaluate the needs of developers and contributors.
4. Preserve and make legible the boundaries around local scenario data, non-execution of bank transactions, catalogue provenance, age eligibility, tax assumptions and the fact that results are conditional on the model.
5. Distinguish benchmark evidence from a personalised result, and distinguish a strategy's heuristic/bounded output from a proven optimum.
6. Inspect both the source tree and the published component artifacts. Do not assume that a successful source build means the currently deployed component has changed.
7. Check the component SHAs recorded in `pages-deploy-state/deployment.json` when making claims about the deployed docs/web pair.
8. Do not treat an item marked as source-verified as proof of visual quality, accessibility conformance or successful user comprehension.
9. Keep findings descriptive unless the user separately asks for recommendations, prioritisation or implementation. This document itself does not authorise code changes.

## F. Additional evidence links

- [Published FD Cal web application](https://aaron-fredrick.github.io/FD-Calculator/web/)
- [Published FD Cal documentation](https://aaron-fredrick.github.io/FD-Calculator/docs/)
- [Published documentation homepage](https://aaron-fredrick.github.io/FD-Calculator/docs/)
- [Published Getting started page](https://aaron-fredrick.github.io/FD-Calculator/docs/guide/getting-started.html)
- [Published strategy documentation](https://aaron-fredrick.github.io/FD-Calculator/docs/strategies/)
- [Published Scoped Range benchmarks](https://aaron-fredrick.github.io/FD-Calculator/docs/strategies/benchmarks.html)
- [Published age-based eligibility reference](https://aaron-fredrick.github.io/FD-Calculator/docs/reference/fd-eligibility.html)
- [Web Pages workflow](https://github.com/aaron-fredrick/FD-Calculator/blob/main/.github/workflows/web-pages.yml)
- [Docs Pages workflow](https://github.com/aaron-fredrick/FD-Calculator/blob/main/.github/workflows/docs-pages.yml)
- [Pages assembly/deployment workflow](https://github.com/aaron-fredrick/FD-Calculator/blob/main/.github/workflows/pages.yml)
- [Deployment component state](https://github.com/aaron-fredrick/FD-Calculator/tree/pages-deploy-state)


---

# Addendum — report-surface audit, output separation and verification sweep

**Review date:** 8 November 2026  
**Application/docs source revision:** `e952c9509be8d9ac57f7fd0ceb6f1221094e10dc`  
**Current audit branch:** `docs/ui-ux-audit-charles-skills`  
**Scope:** Read-only review of the current web result summary, report generator/template, report-specific tests, GitHub Actions evidence and recorded Pages component state. No application, report or workflow code was changed.

## G. Explicit result-summary versus full-report contract

The in-app result summary and the standalone HTML report are two different presentation layers for the same simulation result. They must not be treated as interchangeable.

### G.1 In-app result summary

The result summary is intended to answer, at a glance:

- What was the overall financial outcome?
- How much gross interest was generated?
- How much AIT was withheld?
- How much was paid in transfer fees?
- What was the net interest?
- What was the final simulated portfolio value?
- How much capital was invested?

The current web implementation displays these six metrics for the scoped result:

1. Gross interest.
2. AIT withheld.
3. Transfer fees.
4. Net interest.
5. Final value.
6. Capital invested.

It also identifies the selected simulation period and strategy, and exposes actions to open/download the full HTML report or download the configuration.

**The summary must remain a summary.** It should not become a condensed ledger or a duplicate of the standalone report. Individual FD bookings, product-by-product details, maturity dates, chronological histories, transfer records, cash-flow event histories, chart series and full accounting entries belong in the full report. The summary's purpose is to make the result quickly understandable and direct the user to the report when they need supporting detail.

This is an explicit product constraint for future work. Do not interpret the existence of detailed report sections as evidence that those same sections should be copied into the in-app summary. Conversely, do not remove detailed evidence from the full report merely to keep the summary short.

### G.2 Standalone HTML report

The HTML report is the detailed, portable record of how the simulation reached its result. It is generated from the same simulation result/configuration and is offered as both an in-browser new tab and a downloadable standalone `.html` file.

The current report template has eight navigable sections:

1. Scenario overview.
2. Portfolio outcome.
3. Execution plan.
4. Performance analysis.
5. Investment portfolio.
6. Scheduled cash flows.
7. Capital movements.
8. Full event ledger.

The report's depth is intentional. It is the place for individual bookings, rates/tenures, account-level allocation, event progression, cash movements, maturity information, cash-flow schedules and supporting accounting detail. Several tables and decision groups use native collapsible `details/summary` elements so long content can remain collapsed until requested.

The report describes the execution plan as a **chronological manual bank checklist**. It also states that final valuation sweeps are not executable tasks. The application separately states that FD Cal does not execute transfers or open deposits. Future work must preserve this distinction: generated actions are simulated/manual reference information, not bank instructions or transactions performed by the software.

## H. Standalone HTML report findings

These findings extend the audit to the report as a distinct user-facing deliverable.

### H.1 Report purpose, structure and navigation

**Finding UI-042 — The standalone report is a full audit/explanation surface, not a second summary card**

- **Area:** Report purpose / output hierarchy.
- **Observation:** The report template contains eight sections covering scenario assumptions, portfolio outcome, execution, analytics, selected investments, scheduled cash flows, capital movements and the complete ledger. The in-app result view contains only six aggregate metrics and report/config actions.
- **Concern:** The distinction is valuable and should remain explicit across future UI work. If the report is shortened until it no longer provides the booking and accounting evidence, users lose the ability to inspect how the summary was produced. If the in-app summary is expanded to reproduce report details, the result screen becomes unnecessarily dense.
- **Evidence:** `src/web/index.html`, result section; `src/web/app.js`, `results()`; `src/reporting/template.js`, `REPORT_TEMPLATE`; `src/reporting/html.js`, `generateHtmlReport()`.
- **Status:** Source-verified product structure; actual user comprehension not tested.

**Finding UI-043 — The report is long by design, with navigation and progressive disclosure carrying much of its usability burden**

- **Area:** Information architecture / report length.
- **Observation:** The report provides an eight-section navigation rail. Large tables such as accounts, selected FDs, inflows, outflows and ledger entries are rendered in collapsible native details elements. Decision/event groups in the execution section are also expandable.
- **Concern:** The report can contain a substantial amount of information for multi-account, multi-booking or cash-flow-heavy scenarios. The navigation and collapsed tables reduce initial density, but the report's practical scanability, section orientation and ability to find a particular FD or event have not been tested with a long realistic report.
- **Evidence:** `src/reporting/template.js`, section navigation and report CSS; `src/reporting/html.js`, `table()`, `buildExecution()` and report section assembly.
- **Status:** Source-verified; large-report runtime and usability testing outstanding.

**Finding UI-044 — The execution plan is labelled as a manual checklist, but individual action wording still needs careful interpretation**

- **Area:** Financial safety / simulated actions.
- **Observation:** The report labels the execution section “Execution plan” and describes it as a chronological manual bank checklist. Individual cards use action language such as “Transfer funds” and “Open the fixed deposit”, with account, destination, product, amount, rate, term, booking and maturity details. The report notes that final valuation sweeps are not executable tasks; the app says no bank transfer or FD opening is executed.
- **Concern:** Action-oriented language is useful for a user reviewing a proposed plan, but can be mistaken for a transaction confirmation or a guaranteed instruction if the surrounding manual/simulated status is overlooked. The report must not imply that a bank has accepted a placement, that a transfer has occurred, or that the quoted product remains available.
- **Evidence:** `src/reporting/template.js`, report header and Execution plan introduction; `src/reporting/html.js`, `buildExecution()`; `src/web/index.html`, results disclaimer.
- **Status:** Wording and safeguards source-verified; interpretation not user-tested.

### H.2 Report data, provenance and financial interpretation

**Finding UI-045 — The report shows selected product terms but does not make per-product source freshness immediately auditable**

- **Area:** Data provenance / rate confidence.
- **Observation:** The selected fixed-deposit table records account, product, principal, rate, term, booking date, maturity, gross interest, AIT and net interest. The scenario overview records interest calculation, AIT treatment, consolidation account and default transfer fees. The detailed catalogue/reference documentation contains source and effective-date context, but the inspected report output does not visibly attach the source URL or source-effective date to each selected product row.
- **Concern:** A user reviewing a downloaded report later may be able to see which product and rate the simulation used but may not be able to determine from the report alone when that rate/term was verified or retrieve the source used for that row. This matters because FD rates, minimums and eligibility can change.
- **Evidence:** `src/reporting/html.js`, `investmentTable`, `overview` and `accountRows`; `docs/reference/fd-eligibility.md`; bank product catalogue data.
- **Status:** Report fields source-verified; provenance absence applies to the inspected generated report structure, not necessarily every underlying catalogue record.

**Finding UI-046 — The report's annualised money-weighted return needs to remain distinguishable from a bank's advertised annual rate**

- **Area:** Financial metric interpretation.
- **Observation:** The portfolio outcome can include “Annualised money-weighted return” calculated by the report's XIRR routine. The report explains that XIRR accounts for the timing of deposits and withdrawals. Separately, the selected FD table displays each product's nominal annual rate.
- **Concern:** These are different measures. A user may compare the portfolio-level XIRR directly with an FD product's advertised annual rate without accounting for cash-flow timing, portfolio composition, fees, withholding and the distinction between a portfolio money-weighted return and a product rate.
- **Evidence:** `src/reporting/html.js`, `xirr()`, `yieldPct`, portfolio outcome and investment table.
- **Status:** Calculation and labels source-verified; metric comprehension not user-tested.

**Finding UI-047 — The downloaded report is a portable file containing detailed financial scenario information**

- **Area:** Privacy / report portability.
- **Observation:** The app creates the report as a Blob from the generated HTML string, can open it in a new tab and can download it as `fd-cal-report.html`. The report embeds chart data and includes account labels, balances, configured cash-flow schedules, selected products, booking details and the event ledger. The report is designed to work offline.
- **Concern:** Local processing means the application does not need to upload this scenario, but the downloaded file can still expose sensitive financial planning information if it is shared, emailed, synced to a shared folder or opened on a shared device. The app's local-processing message does not by itself explain the contents and portability of the report file.
- **Evidence:** `src/web/app.js`, `results()`, report Blob and download handlers; `src/reporting/html.js`, embedded chart data and report generation; `src/reporting/template.js`.
- **Status:** Source-verified; user awareness and actual file-sharing behaviour not tested.

**Finding UI-048 — The report's long tables rely on horizontal scrolling at narrow widths**

- **Area:** Responsive report tables.
- **Observation:** Report tables have a minimum width of approximately 640 CSS pixels and are placed in wrappers with horizontal overflow. The report CSS includes mobile breakpoints and adjusts layout, but the table content remains wider than a narrow phone viewport.
- **Concern:** Horizontal scrolling is a reasonable way to preserve financial table columns, but users need to discover the scroll affordance and keep row/column context while navigating wide tables on touch devices. This is especially relevant to the full event ledger.
- **Evidence:** `src/reporting/template.js`, `.table-wrap`, table minimum-width rules and mobile media queries.
- **Status:** CSS behaviour source-verified; actual mobile scrolling and column comprehension not tested.

### H.3 Report interaction and accessibility

**Finding UI-049 — Report charts are primarily pointer-interactive and do not expose a complete keyboard interaction path in the inspected source**

- **Area:** Accessibility / analytics charts.
- **Observation:** The four chart canvases have `aria-label` descriptions. Chart hover details are driven by pointer movement and pointer events; wheel zoom and pointer interaction are implemented. The inspected report template does not assign a tab stop to the canvas or show keyboard handlers for moving chart focus/selection. The report does include focus-visible styling for focusable controls.
- **Concern:** A screen-reader or keyboard-only user may receive the canvas label but cannot necessarily inspect individual data points, series or hover values using the keyboard. A label describing the chart is not equivalent to a textual representation of the chart's values. The report's tables and ledger provide related data, but they are not established as complete, equivalent alternatives for every chart.
- **Evidence:** `src/reporting/template.js`, canvas markup, chart JS pointer handlers, wheel handler and focus-visible CSS; `src/reporting/html.js`, `chartData` and analytics section.
- **Status:** Source-level accessibility concern; keyboard and screen-reader behaviour not tested in a browser.

**Finding UI-050 — The report has print and reduced-motion CSS support, but neither has been validated against a real generated report**

- **Area:** Print / motion preferences.
- **Observation:** The report stylesheet contains a `prefers-reduced-motion: reduce` rule and an `@media print` rule that hides the sidebar and adjusts report content for printing. Additional chart/decision controls also reduce transitions under reduced-motion preferences.
- **Concern:** The existence of CSS is positive but does not prove that a long report prints without clipped tables, missing chart context, awkward page breaks or unreadable colours. It also does not establish that every animated or interactive behaviour is appropriately handled by assistive technology.
- **Evidence:** `src/reporting/template.js`, `REPORT_CSS`.
- **Status:** Source-verified positive support; print preview, PDF output and reduced-motion runtime behaviour not tested.

**Finding UI-051 — The report's chart interaction has no verified non-pointer equivalent for its detailed hover/zoom affordances**

- **Area:** Accessibility / chart controls.
- **Observation:** The report provides chart hover cards, wheel zoom and reset controls. Some chart series controls are buttons, but point inspection and pointer-anchored details are implemented through pointer events. No keyboard-specific point navigation was identified in the inspected report JavaScript.
- **Concern:** Keyboard users may be able to reach and operate some controls without being able to reproduce the detailed point inspection available to pointer users. Touch pointer support does not resolve keyboard or screen-reader access.
- **Evidence:** `src/reporting/template.js`, `REPORT_JS`, chart event listeners and chart toolbar construction.
- **Status:** Source-level concern; requires runtime accessibility testing. This overlaps UI-049 intentionally: UI-049 records the chart's semantic/alternative-content issue, while this finding records the interaction parity issue.

**Finding UI-052 — The report is standalone/offline-capable, but the generated file does not visibly identify a generation timestamp or exact catalogue snapshot**

- **Area:** Report traceability / reproducibility.
- **Observation:** The report header shows the simulation period and strategy. Its overview shows modelling assumptions and transfer-fee defaults; selected FD rows show the product terms used. The inspected template does not visibly include a report-generated timestamp, source commit, catalogue fingerprint or explicit data snapshot identifier.
- **Concern:** A saved report can be revisited well after rates or product terms have changed. Without a clear generated-at and data-version reference, users may have difficulty distinguishing an old simulation from a current one or reproducing the exact catalogue state later.
- **Evidence:** `src/reporting/template.js`, report header; `src/reporting/html.js`, `overview`, `investmentTable` and report replacement values.
- **Status:** Not identified in inspected generated report structure; verify runtime output and any metadata injected by another layer before treating as an absolute absence.

## I. Live and automated verification sweep

This section records what could be tested or verified during this pass. It distinguishes executed CI evidence from source inspection and from browser tests that remain outstanding.

### I.1 Successful automated test run on the reviewed application revision

The latest successful Node.js test/syntax/build workflow found for the current main source revision was:

- [Node.js tests and syntax checks — run 42474569549](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42474569549)
- **Branch:** `main`
- **Source SHA:** `e952c9509be8d9ac57f7fd0ceb6f1221094e10dc`
- **Runner:** Node.js 22
- **Test result:** 187 passed, 0 failed, 0 skipped.
- **Test duration:** approximately 12.99 seconds.
- **Additional successful steps:** JavaScript syntax checks across `src`, `scripts` and `tests/js`; shell syntax checks for component build scripts; isolated web artifact build; preserved documentation baseline build; YAML parsing of the GitHub Actions workflows.
- **Dependency audit in the install step:** npm reported 0 vulnerabilities for the installed dependency set at that run.

The successful suite includes report-specific tests, including:

- Greedy CLI execution producing a standalone report.
- Account-chart colour progression and bank grouping.
- Single-account chart colour normalisation.
- Cash-movement chart event colours and separation of FD principal, interest and AIT.
- Cursor-anchored wheel zoom and reset controls.
- Report layout, decision accents, maturity colours and chart hover controls.
- Goal-report consolidation-interest outcome and event progression.

The test log records all 187 tests passing. These are automated Node.js tests, not end-to-end browser tests.

### I.2 Successful web component build and Pages deployment

- [Build and publish FD Cal web component — run 42474569572](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42474569572)
- **Source SHA:** `e952c9509be8d9ac57f7fd0ceb6f1221094e10dc`
- Successful jobs: web build, artifact publication, Pages assembly, Pages deployment and deployment-state recording.
- The build step created the isolated web artifact and uploaded it successfully.

### I.3 Successful documentation benchmark/build and Pages deployment

- [Benchmark and publish FD Cal documentation — run 42474569576](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42474569576)
- **Source SHA:** `e952c9509be8d9ac57f7fd0ceb6f1221094e10dc`
- Successful jobs: Scoped Range benchmark, Absolute R+ benchmark, docs build from that run's generated data, artifact publication, Pages assembly, deployment and deployment-state recording.
- The run validated 324 Scoped Range observations across 108 scenarios, four two-year cash-flow sweeps and 15 Absolute R+ parameter observations.
- VitePress completed its build and rendered the documentation pages successfully.

### I.4 Recorded deployment component consistency

The current `pages-deploy-state/deployment.json` was fetched and reports:

- Web artifact SHA: `00afe0afacbdb0601d6ba95eee3b515eb5c338c8`
- Docs artifact SHA: `e401a1703217717b3da7a790d261f7dcf324bc67`

The corresponding artifact commit messages identify source revision `e952c9509be8d9ac57f7fd0ceb6f1221094e10dc` for both components. The recorded web and docs artifacts therefore correspond to the same application/documentation source revision in this snapshot.

### I.5 What was not possible in this pass

The following are **not** claimed as completed:

- Direct interactive browser operation of the hosted Pages site.
- A real scenario submission through the deployed web UI.
- A real report download/open interaction from the deployed UI.
- Cross-browser testing, mobile-device testing or responsive screenshot capture.
- Keyboard-only and screen-reader inspection of the report.
- Browser print preview or PDF generation from a generated report.
- A representative large report generated from a real multi-account, multi-booking scenario and inspected visually.
- Live network failure/slow catalogue loading and browser persistence tests.

The available GitHub connector allowed source, published artifact branches, workflow runs, job steps and job logs to be inspected. Direct access to the public GitHub Pages host was not available through the browser retrieval channel in this execution environment. A local clone was also attempted, but this environment could not resolve `github.com`; therefore no local Playwright/browser session or local npm test rerun was possible. The successful GitHub Actions run above is the available execution evidence and is explicitly tied to the main source SHA, not to a fresh test run on this documentation-only audit branch.

## J. Future test matrix for the result summary and HTML report

The following test cases should be treated as the outstanding end-to-end verification scope. They are test requirements, not claims that the tests have already passed.

| ID | Surface | Scenario / action | What must be observed |
|---|---|---|---|
| RPT-01 | In-app summary | Run a simple single-account, single-booking scenario | Summary remains concise; shows top-line metrics and period/strategy; no booking/history table appears in the summary. |
| RPT-02 | Summary → report | Open report and download report for the same result | Both report actions produce the same complete report content; summary does not duplicate report sections. |
| RPT-03 | Full report | Scenario with multiple accounts and multiple FD bookings | Each booking is traceable to account, bank/product, principal, rate, term, booking date and maturity. |
| RPT-04 | Full report | Scenario with recurring and one-off inflows | Scheduled cash-flow summary and ledger reconcile with simulation events. |
| RPT-05 | Full report | Scenario with strict and best-effort outflows, including unpaid remainder | Paid and outstanding obligations are visibly distinguishable; warnings match simulation result fields. |
| RPT-06 | Full report | Scenario with inter-bank and same-bank transfers plus fees | Sending/receiving movements and fees reconcile; no duplicated manual action is presented. |
| RPT-07 | Full report | Cumulative, periodic-interest and installment FD products | Execution, maturity and cash-flow histories reflect the correct payout type and do not double-count principal or interest. |
| RPT-08 | Full report | AIT on/off and simple/compound calculation variants | Summary and report metrics reconcile with the same calculation settings. |
| RPT-09 | Full report | Senior/minor product inclusion | Selected product terms are shown, and report language does not imply that the depositor's age/eligibility was verified. |
| RPT-10 | Report analytics | Inspect all four charts with pointer, touch and keyboard | Values/series can be inspected without relying exclusively on hover; labels and alternative data are meaningful. |
| RPT-11 | Report tables | Expand/collapse each table and navigate the full ledger | Native details controls work with keyboard/screen reader; row counts and empty states are accurate. |
| RPT-12 | Responsive | Open a long report at 360, 390, 768, 1024 and desktop widths | Navigation remains usable; wide tables can be horizontally explored without losing row/column context. |
| RPT-13 | Print | Print preview a long report and save to PDF | Navigation is appropriately omitted; sections, tables, warnings and charts remain readable and are not clipped. |
| RPT-14 | Offline | Download report, disconnect network, reopen file | Report content and chart code work without external network dependencies. |
| RPT-15 | Data integrity | Compare summary values with report outcome and raw simulation result | Gross interest, AIT, fees, net interest, capital and final value reconcile; no report-only arithmetic drift. |
| RPT-16 | Privacy | Inspect report contents and share/save workflow | Users can recognise that the portable HTML file contains account labels, scenario amounts and event history before sharing it. |
| RPT-17 | Traceability | Generate reports before/after a catalogue update | Report makes it possible to identify the catalogue/rate snapshot used for a historical simulation. |
| RPT-18 | Large output | Generate hundreds/thousands of ledger events | Report generation, open, expand/collapse, chart render and print remain responsive and stable. |

## K. Instructions for future workflows — result/report separation

1. Preserve the in-app result summary as a concise overview. Do not add individual bookings, maturity history, chronological event rows, transfer ledger entries or full cash-flow history to it.
2. Keep detailed booking, execution, portfolio, cash-flow, analytics and ledger content in the standalone HTML report.
3. The summary and report must be generated from the same simulation result/configuration; do not independently recalculate headline figures in the UI.
4. Ensure that the summary's headline values reconcile exactly with the corresponding report outcome and simulation result.
5. Keep the report clearly labelled as a simulated/manual planning document. It is not a transaction receipt, bank confirmation or executable instruction.
6. Preserve offline operation and local-data expectations when changing report generation or download behaviour.
7. Treat report charts as an accessibility surface in their own right. Canvas labels alone do not prove keyboard or screen-reader access to the underlying data.
8. Re-run the report-specific automated tests and add end-to-end browser coverage when report presentation or interactions change.
9. Record the exact source SHA and Pages component SHAs when validating the deployed report-producing application.
10. Do not claim browser-level validation based only on passing unit tests, a successful static build or a successful Pages deployment.

## L. Additional report evidence links

- [Report generator](https://github.com/aaron-fredrick/FD-Calculator/blob/main/src/reporting/html.js)
- [Standalone report template, CSS and JavaScript](https://github.com/aaron-fredrick/FD-Calculator/blob/main/src/reporting/template.js)
- [Report-specific automated tests](https://github.com/aaron-fredrick/FD-Calculator/blob/main/tests/js/reporting.test.js)
- [Result model tests](https://github.com/aaron-fredrick/FD-Calculator/blob/main/tests/js/results.test.js)
- [Report chart colour tests](https://github.com/aaron-fredrick/FD-Calculator/blob/main/tests/js/report-chart-colors.test.js)
- [Web result summary and report actions](https://github.com/aaron-fredrick/FD-Calculator/blob/main/src/web/app.js)
- [Node.js test and syntax-check run](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42474569549)
- [Web component build and deployment run](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42474569572)
- [Documentation benchmark/build and deployment run](https://github.com/aaron-fredrick/FD-Calculator/actions/runs/42474569576)
