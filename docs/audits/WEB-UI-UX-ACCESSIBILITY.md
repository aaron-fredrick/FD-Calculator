# Web UI, UX and accessibility audit

## Scope

Reviewed the browser form structure, account and cash-flow editors, strategy controls, status/error feedback, responsive CSS, motion helpers, focus/error handling, and the web rules in RULESETS.

## Findings

### UI-01 — Programmatic smooth scrolling does not respect reduced-motion preference

**Severity: P3**

**Evidence:** [app.js L35](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js#L35), [app.js L51](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js#L51), [app.js L124](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js#L124).

Validation errors and the result section call `scrollIntoView({ behavior: "smooth" })` directly. The CSS and motion helpers support reduced motion, but these JavaScript calls do not check `prefers-reduced-motion`.

**Impact:** users who request reduced motion can still receive smooth programmatic scrolling during validation or result display.

**Recommendation:** centralize scrolling in a helper that uses `matchMedia("(prefers-reduced-motion: reduce)")` and chooses `behavior: "auto"` when reduced motion is enabled. Add a test for both branches.

### UI-02 — Help tooltip content is not exposed as a reliable accessible description

**Severity: P3**

**Evidence:** [app.js L67](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js#L67) renders the outflow help marker as a focusable `span` with `role="img"`, an aria-label of “Outflow payment policy help”, and tooltip text in a CSS `data-tooltip` pseudo-element.

**Impact:** the actual Strict/Defer/Best effort explanation is not programmatically associated with the payment-policy control. A screen reader may announce only a generic “help” image, not the tooltip content.

**Recommendation:** use a real button or a labelled help control with an adjacent element carrying an ID and `role="tooltip"`; connect it with `aria-describedby`. Ensure the explanation can be opened and dismissed with keyboard and touch, not hover alone.

### UI-03 — Inline validation messages are not explicitly associated with their fields

**Evidence:** [app.js L34-L35](https://github.com/aaron-fredrick/FD-Calculator/blob/dev/src/web/app.js#L34-L35) adds `aria-invalid` and appends a visual `small.field-error`, but does not assign the message an ID or add that ID to the field's `aria-describedby`.

**Impact:** focus moves to the invalid field, but assistive technology is not guaranteed to announce the corresponding error message.

**Recommendation:** generate a stable error ID, set `aria-describedby` while the error is present, and restore the prior description when clearing errors. Keep the visible error and `aria-invalid` state.

## Visual and interaction assessment

### Positive

- The form uses semantic labels, real buttons/links, headings and a clear primary action.
- The account editor uses a radio control for the consolidation account and visually marks the selected card.
- Specific cash-flow dates use a bounded date input with removable date chips.
- The layout has desktop/tablet/mobile breakpoints, collapses the navigation rail on smaller screens, and uses larger mobile control sizes.
- Focus-visible styling, touch-target sizing and reduced-motion CSS are present.
- The recent visual-restraint pass reduced redundant numbering, decorative labels, heavy gradients and excessive pill/container treatments while preserving meaningful financial warnings and states.
- Simulation status is exposed with a live status region and elapsed time.

### Gaps requiring rendered QA

- No browser screenshot comparison or automated visual-regression suite was found in the repository tests.
- Contrast has not been measured against WCAG 2.2 AA thresholds; token usage alone does not prove contrast.
- Screen-reader announcement order, keyboard-only operation, browser zoom at 200–400%, and small viewport overflow were not manually verified.
- The help tooltip and validation associations above need correction before calling accessibility QA complete.
- Desktop/mobile layout and all meaningful states should be checked in the new dev preview once deployment succeeds.

## Required manual state matrix

| Area | States to inspect |
|---|---|
| Catalogue | loading, loaded, empty/unavailable, one bank with no rate data |
| Accounts | one account, many accounts, primary change, remove last account, imported unusual IDs |
| Cash flows | recurring/scheduled, long names, invalid date, outside-period date, strict/defer/best-effort |
| Strategy | Greedy, GSS, Absolute R+, setting panel transitions, decision cap reached |
| Simulation | preparing, running, edit while running, success, failure, reuse, superseded/cancelled |
| Results | no bookings, many bookings, outstanding outflows, large numbers, long labels |
| Motion | normal, reduced motion, keyboard, touch, interrupted transitions |
| Viewports | 320px, 375px, 620px, 850px, 1280px and browser zoom |

## Design-system assessment

The web UI has a coherent dark token-based palette and a restrained component language after the recent visual pass. Avoid another broad visual redesign. The next UI pass should prioritize functional clarity, error association, real-device inspection and contrast measurement rather than additional styling.
