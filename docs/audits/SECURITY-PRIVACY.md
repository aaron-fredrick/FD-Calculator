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

## PRIV-01 — Local scenario draft deletion and retention

**Current status: IMPLEMENTED on this branch; CI passed.** The UI states that draft data is stored only in the current browser until the user clears it. A visible `Clear saved draft` button requests confirmation and removes the `fd-cal:draft:v1` localStorage entry. The current form remains in the active tab; the status message explains that editing it will create a new saved draft. The click handler stops propagation so the surrounding form click-to-save handler cannot immediately recreate the deleted entry.

**Evidence:** [draft save/restore/clear logic](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/rulesets-codebase-review/src/web/app.js), [retention notice and control](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/rulesets-codebase-review/src/web/index.html), [privacy regression contract](https://github.com/aaron-fredrick/FD-Calculator/blob/audit/rulesets-codebase-review/tests/js/web-controls-contract.test.js).

**Boundary:** this control deletes FD Cal's saved draft key only. It does not clear browser history, downloads, exported JSON files, other sites' storage, or the currently displayed in-memory form. No scenario data transmission or analytics was added.

**Acceptance:** met on this branch. Retention is explained; deletion is user-initiated and confirmed; the deleted draft is not re-saved by the same click. CI passed; pending shipment to `dev`.


## WEB-SEC-02 — Static hosting needs an explicit security-header strategy

**Current status: OPEN / hosting constraint documented.** FD Cal is published on GitHub.com Pages. The repository's static build and Pages artifact do not provide a configurable origin-server response-header policy. No verified response-header set for the production or dev origin has been established in this audit.

**Verified platform boundary:**
- GitHub describes Pages as a static hosting service that publishes HTML, CSS and JavaScript from a repository: [GitHub Pages overview](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
- GitHub's Pages documentation states that custom MIME types cannot be configured per file or repository: [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).
- GitHub Enterprise Server has a separate administrator-level response-header configuration in its Management Console; that is not a setting available to this GitHub.com Pages repository: [GitHub Enterprise Server response headers](https://docs.github.com/en/enterprise-server@latest/admin/configuring-settings/configuring-user-applications-for-your-enterprise/configuring-github-pages-for-your-enterprise).

Do not treat a `_headers` file or workflow-generated artifact as proof that GitHub.com Pages emits custom response headers. Verify actual origin responses before recording any header as deployed.

**Controls and decision:**
1. Keep all application assets same-origin and avoid adding third-party scripts, analytics or session replay without a separate review.
2. Keep the existing escaping, safe-link handling, noindex and crawler controls. They address different risks and are not substitutes for response headers.
3. If policy requires enforceable `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` / `frame-ancestors`, or `Permissions-Policy`, put a CDN/reverse proxy or a host with response-header configuration in front of Pages, or migrate hosting.
4. Meta policies may provide limited defence-in-depth for supported directives, but they cannot fully replace response headers (for example, a CSP meta policy cannot enforce `frame-ancestors`).
5. Before closing this finding, capture `curl -I` evidence for production and dev origins and compare the returned headers against an approved policy. Do not claim a header is present based on repository configuration alone.

**Acceptance:** a hosting-layer decision is recorded, required headers are verified from actual HTTP responses, and the policy is tested on both production and `/dev/` paths. No hosting migration or security-header deployment is included in this branch.


## Privacy assessment

- The browser copy states that calculations run locally and drafts stay in the browser.
- The app's data flows are primarily local catalogue fetches, local storage and a same-origin worker.
- The standalone report is generated client-side and can be saved as a local HTML file.
- No remote analytics or session replay was found in the reviewed source.
- A concise privacy notice should explain local storage, file import/export, local report generation, network requests for static catalogue assets, and how to clear saved data. Avoid generic legal boilerplate that does not match the actual product.
