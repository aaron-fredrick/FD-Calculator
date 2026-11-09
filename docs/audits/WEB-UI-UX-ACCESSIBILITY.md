# Web UI, UX and accessibility audit

## Scope

Reviewed the browser form structure, account and cash-flow editors, strategy controls, status/error feedback, responsive CSS, motion helpers, focus/error handling, and the web rules in RULESETS.

## Findings

### UI-01 — Programmatic scrolling and reduced-motion preference

**Current status: IMPLEMENTED on this branch; CI passed.** Validation errors, general error feedback and result navigation use the shared `scrollElementIntoView()` helper in `src/web/motion.js`. It checks `prefers-reduced-motion` at the time of each request, selects `behavior: "auto"` for reduced-motion users, and preserves smooth scrolling for other users. The existing reduced-motion CSS rule forces computed `scroll-behavior: auto`.

**Regression coverage:** `tests/js/motion-guidelines.test.js` verifies both preference branches and confirms the app no longer calls smooth `scrollIntoView()` directly.

### UI-02 — Help tooltip content and touch operation

**Current status: IMPLEMENTED on this branch; CI passed.** Static and dynamically rendered help markers are native `button type="button"` controls. Their accessible names contain the full help explanation, and `aria-expanded` exposes the disclosure state. Pointer hover and keyboard focus retain the visual tooltip; clicking/tapping toggles it, clicking elsewhere closes it, and Escape dismisses the open tooltip. The focus-visible indicator is retained.

**Regression coverage:** `tests/js/web-controls-contract.test.js` checks native button semantics, accessible naming, expanded-state handling, Escape dismissal and the CSS disclosure state.

**Verification boundary:** the Node contract suite does not replace manual keyboard, touch-device or screen-reader verification. Those remain part of browser QA.

### UI-03 — Inline validation messages and field association

**Current status: IMPLEMENTED on this branch; CI passed.** `markField()` now assigns each generated error message a unique ID and adds that ID to the invalid control's `aria-describedby`. `clearFieldErrors()` removes only generated error IDs from existing description lists, preserving unrelated descriptions, then removes the visual error and `aria-invalid` state.

**Regression coverage:** `tests/js/web-controls-contract.test.js` verifies generated IDs, field association and safe cleanup.

**Verification boundary:** real screen-reader announcement and focus order still require browser/assistive-technology verification.

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
- UI-01/02/03 implementation fixes are present on the working branch; full accessibility QA still requires real-browser, keyboard, touch and screen-reader verification.
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
