# Security and privacy audit

## SEC-01 — Imported account IDs are interpolated into HTML without escaping

**Current status: COMPLETED in PR #75.** The account-card `data-id`, radio `value` and remove-button attribute now pass IDs through the shared HTML encoder. The ID itself is not restricted, preserving import compatibility. See `src/web/escape-html.js`, `src/web/app.js` and the adversarial security regression tests.

**Severity: P1**

**Evidence:**
- [config-schema.js L25-L26](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/core/config-schema.js#L25-L26) requires account IDs to be non-empty but does not constrain their characters.
- [app.js L214](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js#L214) parses an imported JSON file, validates its configuration and applies it.
- [app.js L84](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js#L84) uses each imported account object key as the account ID.
- [app.js L63](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js#L63) inserts `a.id` directly into `data-id`, radio `value` and `data-remove-account` attributes inside an `innerHTML` template. The local `esc` helper is used for labels but not for the ID.

**Impact:** a crafted JSON file can supply an account ID containing quotes/HTML and break out of an attribute when the user imports it. This is a client-side DOM-XSS path in the public application origin. It requires the victim to import a malicious scenario file, but the import feature is an explicit untrusted-file boundary.

**Recommendation:**
1. Escape the ID for every HTML attribute context at render time (at minimum use the existing `esc(a.id)` consistently).
2. Prefer DOM construction and `setAttribute` over concatenating untrusted values into HTML.
3. Consider validating IDs against a documented safe identifier format, but do not rely on validation as a substitute for output encoding.
4. Add a regression test importing an account ID such as `"><img src=x onerror=alert(1)>` and assert that it is rendered as inert text/attribute data.
5. Audit every `innerHTML` template for imported values and keep report rendering covered by adversarial-label tests.

## Positive security controls

- Imported configuration is JSON-parsed and checked against an allowlisted schema before application.
- Field values are generally inserted using `textContent` or HTML escaping; the account-ID path is the exception identified above.
- The standalone report escapes dynamic table/ledger/instruction text and protects embedded JSON from closing the script element.
- The worker is a dedicated application-owned worker. Its protocol validates message type, positive safe integer request ID and object payload; using `event.origin` as worker authentication was correctly avoided.
- The browser app uses a local static catalogue and does not require a backend account/session service.
- No third-party analytics, advertising pixels or session-replay scripts were identified in the reviewed web template.

## PRIV-01 — Local scenario drafts persist without an in-app clear/retention control

**Current status: OPEN.** Drafts still use `localStorage`; no user-facing clear-saved-draft action or retention explanation was found in the current UI.

**Evidence:** [app.js L10](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js#L10) defines a localStorage draft key; [app.js L89-L90](https://github.com/aaron-fredrick/FD-Calculator/blob/a455462a959f37db757970d0a3078a4d9a3ef028/src/web/app.js#L89-L90) saves and restores the scenario.

**Impact:** account labels, balances, inflow/outflow schedules and other personal planning data remain in browser storage until overwritten or manually cleared through browser controls. The app accurately says the draft stays in the browser, but users are not given a clear in-app deletion path or retention explanation.

**Recommendation:** add a visible “Clear saved draft” action with confirmation; explain that drafts remain in this browser profile until cleared. Keep export/import local and avoid transmitting scenario data. Do not add analytics or replay tools without a separate privacy review.

## WEB-SEC-02 — Static hosting still needs an explicit security-header strategy

**Current status: OPEN / hosting constraint.** The app remains on GitHub Pages and no verifiable response-header policy was established by the reviewed repository files. Document the limits accurately; move hosting only if the required header controls justify it.

GitHub Pages does not provide arbitrary per-route response headers through a repository file in the same way as a configurable origin server. The reviewed app should therefore document which controls are available at the hosting layer and avoid claiming that a `robots.txt` file is a security boundary. If a stronger Content-Security-Policy, Referrer-Policy or Permissions-Policy is required, use a hosting layer that can emit those headers or an accurately tested meta-policy where suitable. A CSP meta element is not equivalent to a full response header and has limitations.

## Privacy assessment

- The browser copy states that calculations run locally and drafts stay in the browser.
- The app's data flows are primarily local catalogue fetches, local storage and a same-origin worker.
- The standalone report is generated client-side and can be saved as a local HTML file.
- No remote analytics or session replay was found in the reviewed source.
- A concise privacy notice should explain local storage, file import/export, local report generation, network requests for static catalogue assets, and how to clear saved data. Avoid generic legal boilerplate that does not match the actual product.
