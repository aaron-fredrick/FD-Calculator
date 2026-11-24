# Security and privacy audit

## SEC-01 — Imported account IDs are interpolated into HTML without escaping

**Current status: COMPLETED on dev.** Account IDs used in account-card attributes, radio values and remove controls are HTML-attribute escaped. The ID format remains compatible with imported configurations. Regression coverage is present in the web/security tests.

The original finding was that a malicious imported account ID could break out of an HTML attribute when the account list was rendered. The fix addresses the output-encoding boundary; input validation alone would not be an adequate substitute. Continue to treat imported JSON and catalogue values as untrusted data.

## Positive security controls

- Imported configuration is JSON-parsed and validated against the configuration schema.
- Dynamic labels and account identifiers rendered through HTML templates use the shared HTML-escaping helper; DOM text is otherwise assigned through text-safe APIs.
- The standalone report escapes dynamic table/ledger/instruction text and protects embedded JSON from closing the script element.
- The worker is an application-owned worker. Its protocol validates message type, positive safe-integer request ID and object payload; `event.origin` is not treated as worker authentication.
- The browser app uses a local static catalogue and has no FD Cal application backend for scenario processing.
- Optional analytics is integrated through a consent-gated Google Tag Manager container and Microsoft Clarity. The scripts are loaded only after analytics consent; advertising-related consent signals remain denied. See the [Privacy Policy](../../src/web/privacy.html) for the currently disclosed providers, event categories and limitations. Do not describe the application as having no analytics integration.

## PRIV-01 — Local scenario draft deletion and retention

**Current status: IMPLEMENTED on dev.** The UI explains that draft data is stored in the current browser. A visible “Clear saved draft” control requests confirmation and removes the `fd-cal:draft:v1` localStorage entry. The current form remains in the active tab; editing it can create a new saved draft.

**Boundary:** this control deletes FD Cal's saved draft key only. It does not clear browser history, downloads, exported JSON files, other sites' storage or the currently displayed in-memory form.

## WEB-SEC-02 — Static hosting response-header strategy

**Current status: OPEN — live origin verification remains outstanding.** FD Cal is published on GitHub Pages. Repository build files do not prove which HTTP response headers the production or dev origins emit.

GitHub Pages is a static hosting service. Do not treat a `_headers` file or workflow-generated artifact as proof that GitHub.com Pages emits custom response headers. Before closing this finding, capture actual response headers for both production and `/dev/` URLs and compare them with an approved policy.

If enforceable CSP, HSTS, MIME-sniffing, framing or permissions policies are required but unavailable from the host, use a CDN/reverse proxy or a host that supports response-header configuration. Meta policies are not a complete replacement for response headers; for example, CSP meta cannot enforce `frame-ancestors`.

## PRIV-02 — Public privacy notice, terms and preference management

**Current status: IMPLEMENTED on dev.** Public Privacy Policy and Terms pages, first-visit preference UI, footer preference management and local-storage controls are present. The privacy notice describes local scenario processing, local draft retention, worker execution, client-generated reports/exports, static asset requests, hosting-layer logs and the consent-gated GTM/Clarity integration.

The privacy policy explains that analytics scripts load only after consent and describes the disclosed event/data categories. This audit does not independently verify the live GTM container configuration, third-party provider retention or every consent transition across tabs. Keep those as separate operational/privacy verification tasks.

Legal-page implementation is not a legal opinion. Obtain qualified Sri Lankan legal review before commercial operation or material changes to personal-data processing.

## Privacy assessment and verification boundary

Scenario calculations and report generation run in the browser; the application does not submit scenario data to an FD Cal backend. Static catalogue assets are fetched from the site. Optional analytics providers are disclosed in the Privacy Policy and are consent-gated. Hosting providers and analytics providers may process ordinary technical connection data under their own policies.

Automated source/tests do not establish live provider configuration, complete consent-revocation behaviour, actual deployed response headers, legal compliance or full privacy-law compliance. Recheck the policy whenever analytics providers, event payloads, storage keys, hosting or data flows change.
