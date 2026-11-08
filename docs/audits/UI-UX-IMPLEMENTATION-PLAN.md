# FD Cal UI/UX Improvement and Implementation Plan

**Status:** Implementation in progress; this plan is the execution source of truth  
**Branch:** `docs/ui-ux-audit-charles-skills`  
**Parent audit:** [UI/UX Audit Findings — Charles Skills Review](./UI-UX-AUDIT-CHARLES-SKILLS.md)  
**Product:** FD Cal — Sri Lankan fixed-deposit portfolio planning and optimisation

## Execution log

- **2026-11-08 — Phase 0 source revalidation:** the branch head before implementation was `251d31a57983b1f106c62bae26f6389ac4a5cbf3`, with `main` as its merge base and no behind commits. The source tree still contains the synchronous `simulate(c)` call after catalogue loading; UI-009 remains applicable. The canonical token file is unchanged. The current app is native browser ES modules, not a Vite/bundler project; the worker design is therefore native module-worker loading, with no new build dependency.
- **Phase 0 evidence still pending:** this session has no working local GitHub network route or browser-capture runtime. A local clone attempt failed at DNS resolution, so no npm test baseline, browser screenshots, viewport/keyboard checks or report-size measurement are claimed. The existing CI workflow runs on pull requests to `main`, not pushes to this feature branch; use the draft PR CI as the executable integration gate once the first coherent implementation slice is ready.
- **2026-11-08 — Phase 2A implementation started:** added a module worker, a pure shared-engine task adapter, a Promise-based single-flight runner, effective-config/catalogue fingerprinting, completed-result reuse, supersession/cancellation, result rehydration for report generation, elapsed-time and submitted-config feedback, plus runner and strategy-parity tests. This remains in progress pending CI and browser verification.
- **2026-11-08 — Phase 1 implementation:** clarified first-use/privacy copy, aligned the investment-window heading with the journey rail, explained final-valuation consolidation, scheduled-date syntax and outflow payment policies, added strategy-specific descriptions and a distinct search-limits heading, preserved the disabled Goal mode while linking to the feature-request route, and surfaced catalogue age/guardian conditions in report booking details without changing the simulation-context option contract.
- **2026-11-08 — Phase 2 implementation:** catalogue-dependent form and import/export controls are gated until both bank/product catalogues load; loading/error/ready states are announced and remain visible on mobile. Unexpected calculation errors are kept generic for users while diagnostics are sent to the developer console without scenario payloads. Existing focus-visible, tooltip keyboard focus, reduced-motion and touch-target rules were retained.
- **2026-11-08 — Phase 3 implementation:** the concise in-app summary contract remains unchanged. The standalone report now carries a device-clock UTC timestamp, a SHA-256 fingerprint of the exact product/bank/fee snapshot, privacy and nominal-rate/XIRR explanations, product age-condition details, and collapsible keyboard-accessible data tables adjacent to each canvas chart. Report CSS now embeds a generated copy of the canonical brand token block; generation and drift-check scripts plus offline-output tests were added.
- **2026-11-08 — Phase 4 implementation:** updated the getting-started journey, project overview, age-eligibility reference, brand-token instructions and documentation home page to describe worker execution, scenario stages, privacy, offline reports, manual eligibility verification and the distinction between summary and full report.
- **Verification state:** code-level contract tests and CI artifact checks have been added, but have not yet been executed in this session. The draft PR CI run and real-browser desktop/mobile/keyboard/reduced-motion/print checks remain mandatory before marking the implementation verified. Phase 5 is therefore still open.
- **Deferrals:** Section 7 remains unchanged. Analytics/telemetry, broad SEO expansion, decorative redesign/new palette, animation/chart/UI frameworks, financial-engine changes, backend/accounts and automated bank/eligibility verification remain out of scope. No deferred item is being pulled into this implementation.

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
3. Reproduce the relevant current states in a real browser at desktop and mobile widths when a browser runtime is available.
4. Record screenshots for the first-use state, populated configuration, validation errors, loading/run state, result summary, generated report and documentation pages. If browser capture is unavailable, record this as pending evidence; do not infer visual success from source inspection.
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

### Phase 2A — Non-blocking background computation and run lifecycle

**Priority:** Critical  
**Goal:** expensive optimisation and simulation work must not block the browser's main thread. The page must remain responsive, continue painting, and communicate honestly that a computation is in progress.

This is a functional performance requirement, not a spinner/visual polish task. The current browser submit flow awaits preparation and then calls the synchronous `simulate(c)` path on the main thread. Awaiting a Promise around synchronous CPU work does not move that work off the main thread; the simulation itself must execute in a Web Worker (or another genuine background execution context).

#### Architecture

1. Introduce a dedicated browser worker entry point for the CPU-intensive simulation path. Keep the existing shared calculation engine and strategy implementations as the source of financial behaviour; do not fork or reimplement the algorithms for the worker.
2. The current web app is a static native-ES-module application: `package.json` has no bundler/build dependency and `src/web/README.md` documents direct static serving. Do not introduce a bundler for this work. Load the worker with the browser-native module-worker form `new Worker(new URL("./simulation.worker.js", import.meta.url), { type: "module" })`; keep the worker and its task module beside the app entry point, and verify the isolated web artifact preserves their relative paths/imports.
3. Keep DOM access, form state, status text, elapsed-time display, report Blob creation/download and result rendering on the main thread. The worker receives a serializable, validated computation payload and returns a serializable result payload.
4. Complete required bank-rate/catalogue loading and configuration validation before dispatching work. Show a preparation/loading state during this stage; distinguish it from the actual CPU computation phase.
5. Wrap worker execution in a Promise-based runner on the main thread. The Promise must settle exactly once on success, worker-reported error, message deserialisation failure, worker startup failure, timeout if a defensible timeout is adopted, or explicit cancellation/supersession. Always release worker resources and event handlers.
6. Use structured-clone-safe inputs and outputs. Do not send DOM objects, functions, class instances with required prototype behaviour, or mutable application state. Convert FD options and configuration to the plain serializable representation required by the engine, then reconstruct required domain objects inside the worker where appropriate.
7. Preserve deterministic parity with the existing CLI/shared engine. Worker execution must call the same `SimulationEngine` and strategy classes with equivalent inputs. Do not change strategy defaults, tie-breakers, numerical precision or financial rules as part of this refactor.
8. Do not silently fall back to running a heavy simulation synchronously on the main thread if Worker creation fails. Present a recoverable, actionable error. A synchronous fallback would reintroduce the browser-freeze defect this phase is intended to remove.
9. Avoid unnecessary copying of large catalogue payloads. Measure structured-clone cost; use transferable buffers only where the data format and ownership semantics make this safe. Do not detach buffers or mutate cached catalogue data still needed by the app.

#### Run identity, deduplication and supersession

The runner must have explicit request identity and single-flight semantics.

- Compute a stable request fingerprint from the effective validated scenario, selected strategy settings, relevant financial assumptions and the exact catalogue/data snapshot used. Avoid relying only on raw form JSON if equivalent configurations can serialize differently or catalogue data can change.
- If a request with the same fingerprint is already running, do not start another worker or duplicate the computation. Reuse/return the in-flight Promise and preserve the existing visible run state. Repeated clicks/submissions must not create duplicate work.
- Keep the existing completed-result optimisation: if the effective fingerprint is unchanged and the matching result is still valid for the current catalogue snapshot, reuse the completed result rather than recomputing. Make this behaviour clear and do not hide a failed or stale run behind a false cache hit.
- If the user changes the scenario while a run is in progress and submits the new configuration, treat it as a new request. Use a latest-request-wins policy: cancel/terminate the obsolete worker, invalidate its request identity, and start the new request after its inputs are ready. Do not allow two expensive optimisation jobs to compete for CPU by default.
- Ignore any late message/result from a superseded worker. Only the currently active request fingerprint may update the result summary, report, cache key or error state.
- If the user edits the form but does not submit again, the old run may finish, but its result must remain clearly associated with the exact configuration that produced it. Do not imply that it represents unsaved edits. Prefer marking the result as belonging to the last submitted scenario and indicate when the current form differs.
- Disable only actions that would cause unsafe duplicate execution. Do not freeze the whole form unnecessarily; users should be able to inspect or edit inputs while a computation runs. The run action should clearly communicate whether it will reuse the in-flight request, start a changed scenario, or is temporarily unavailable.

#### Progress and elapsed-time feedback

- Keep a persistent, polite live status region visible throughout preparation and computation. Use text such as “Loading bank data…”, “Preparing scenario…”, and “Computing Absolute R+…” rather than presenting every phase as generic loading.
- Once the worker actually starts, start a monotonic elapsed-time clock (for example, based on `performance.now()`). Display elapsed time in a human-readable format such as `00:04` or `1m 12s`; update it on the main thread so the page remains responsive.
- Stop and freeze the compute elapsed timer on success, error or cancellation. Do not include bank-data loading time in the compute-only figure. If total end-to-end duration is useful, label it separately from worker compute duration.
- On success, show completion and elapsed duration briefly or alongside the result metadata without obscuring the result summary. On failure, retain the useful phase and elapsed context in the error state. On cancellation/supersession, do not announce a successful completion.
- Do not display a fabricated percentage. Only show determinate progress if the engine exposes meaningful, measured progress events. If it does not, use an indeterminate progress indicator plus elapsed time.
- Continue to honour reduced-motion preferences. The status text and elapsed duration must remain useful with animation disabled and must not rely on colour alone.
- Avoid announcing every timer tick through an assertive screen-reader alert. Keep the status region polite and use a sensible announcement cadence; the visual timer can update more frequently than assistive-technology announcements.

#### Failure, cancellation and lifecycle handling

- Handle worker construction failure, import/runtime errors, thrown strategy errors, invalid result payloads and unexpected worker termination.
- On navigation/unload, supersession or explicit cancellation, terminate the worker and clean up the timer and listeners.
- Ensure a worker error cannot leave the run button disabled, the spinner active, a stale “computing” message visible or a Promise permanently pending.
- Ensure a worker result is validated before it is passed to report generation. Report generation remains on the main thread unless separately measured and proven to be a material source of blocking.
- Keep diagnostic detail for developers while showing a clear user-facing recovery message. Never include private scenario data in telemetry; analytics/telemetry remains deferred.

#### Acceptance criteria

- The expensive simulation executes in a Web Worker, not on the browser main thread.
- While a deliberately slow test scenario is running, the page continues to paint, scroll, accept safe input edits and respond to browser interactions; the browser does not report the page as unresponsive.
- The visible status distinguishes preparation from actual computation and names the selected strategy.
- A live elapsed timer starts when worker computation starts and stops accurately on completion, error or cancellation.
- Repeated submission of the same in-flight fingerprint starts exactly one computation.
- Submitting a changed scenario supersedes the old computation; an old worker result cannot overwrite the newer scenario.
- Re-running an unchanged, already completed scenario reuses the valid result according to the existing cache policy and does not misleadingly display a new computation.
- Worker and main-thread results match for representative fixtures, including all browser-supported strategies, cash-flow types, fees, AIT settings and edge cases.
- Worker failure and unsupported environments fail visibly and recoverably; there is no silent synchronous fallback.
- Existing CLI results and benchmark behaviour remain unchanged.
- Worker resources, timers and event listeners are cleaned up after every terminal path.

#### Required tests

1. Unit tests for request fingerprint stability and catalogue-snapshot inclusion.
2. Runner tests for success, error, message error, startup failure, cancellation, supersession and cleanup.
3. Single-flight test: multiple submissions with one fingerprint dispatch one worker computation.
4. Supersession test: request B replaces request A; a late response from A is ignored.
5. Completed-result reuse test: unchanged input and unchanged catalogue reuse the prior result; changed catalogue invalidates it.
6. Parity tests comparing worker and direct shared-engine outputs for deterministic fixtures.
7. Browser end-to-end test with an intentionally expensive fixture: verify elapsed time advances and a main-thread heartbeat/UI interaction continues during computation.
8. Accessibility test for phase announcements, timer labelling and reduced-motion behaviour.
9. Production-build test confirming the worker is emitted and loads from the deployed web artifact.
10. Regression test confirming CLI execution remains independent of browser worker infrastructure.

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
9. Inspect browser console/network logs and verify there are no broken assets, external report requests, layout shifts or uncaught errors. Confirm the simulation runs in a worker, the main thread remains responsive, elapsed timing is accurate, and duplicate/superseded requests behave as specified.
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
3. Phase 2A worker-based computation and run lifecycle (critical dependency for trustworthy execution feedback).
4. Phase 2 interaction and execution feedback.
5. Phase 3A summary contract and 3B report content/traceability.
6. Phase 3C standalone token packaging and 3D report accessibility/responsive/print.
7. Phase 4 user documentation.
8. Phase 5 cross-surface verification.

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
| UX-07 | Execution | Run a normal and a deliberately expensive scenario | Simulation runs in a worker; UI remains responsive; phase status and elapsed compute time are accurate. |\n| UX-07a | Execution | Submit the same scenario repeatedly while active | One in-flight worker computation only; no duplicate CPU work. |\n| UX-07b | Execution | Change configuration and submit while a run is active | Old run is cancelled/superseded; stale output cannot replace the latest request. |\n| UX-07c | Execution | Re-run an unchanged completed scenario | Valid completed result is reused without pretending a new computation started. |
| UX-08 | Results | Inspect in-app summary | Only decision-level summary; no booking/history ledger. |
| UX-09 | Results/report | Compare summary with report | Headline metrics reconcile exactly. |
| UX-10 | Report | Generate and reopen saved report offline | All report sections, charts and controls work without network. |
| UX-11 | Report | Inspect report at 360–1920 px | No clipped critical content; navigation and tables remain usable. |
| UX-12 | Accessibility | Keyboard-only app and report walkthrough | Focus visible; all important actions and chart data accessible. |
| UX-13 | Documentation | Follow user guide against current app | Labels, routes, capabilities and limitations match the app. |
| UX-14 | Publishing | Build web and docs components | Independent deployment paths remain functional and source revisions are recorded. |

## 10. Definition of done

The programme is complete when:

- The primary scenario workflow is understandable and usable for first-time and experienced users.\n- Expensive browser computation runs in a background worker through a Promise-based lifecycle; the UI stays responsive and reports truthful phase/elapsed-time feedback.\n- Identical in-flight requests are single-flight deduplicated; changed requests supersede stale work without allowing stale results to render.
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
- Canonical brand tokens: `src/brand/tokens.css`
- Web application markup: `src/web/index.html`
- Web application behaviour: `src/web/app.js`
- Simulation engine: `src/core/simulation.js`
- Strategy implementations: `src/strategies/`
- Web application styles: `src/web/styles.css`
- Report generator: `src/reporting/html.js`
- Standalone report template: `src/reporting/template.js`
- Documentation VitePress configuration: `docs/.vitepress/config.mts`
- Documentation theme: `docs/.vitepress/theme/custom.css`
- [Getting started guide](../guide/getting-started.md)
- Contributor guide: `CONTRIBUTING.md`
