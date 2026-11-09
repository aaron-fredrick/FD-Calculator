# Security Policy

FD Calculator takes security reports seriously. This project is maintained on a best-effort basis by an individual maintainer; it does not have a 24/7 security response team or a guaranteed remediation SLA.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, pull requests, or the ordinary support form.**

Use GitHub's **[Private vulnerability reporting](https://github.com/aaron-fredrick/FD-Calculator/security/advisories/new)** feature to send a confidential report directly to the maintainers. Reports submitted through this channel are not visible as public issues.

Include as much of the following information as you can:

- A concise description of the vulnerability and its potential impact.
- The affected component, file, URL, release, or commit.
- The exact steps needed to reproduce it, including a minimal proof of concept where safe.
- The security assumptions or configuration required for the issue to occur.
- The impact you observed and any realistic attack scenario.
- Suggested mitigation, if known.

You may submit a report without all of these details. Do not include real bank account details, passwords, access tokens, private financial records, or other personal data in a report. Use synthetic or redacted examples.

If GitHub private vulnerability reporting is unavailable, send a confidential report to [a.n.r.fredrick@gmail.com](mailto:a.n.r.fredrick@gmail.com). Do not publish exploit details or include real bank account details, passwords, access tokens, private financial records, or other people's personal data. Use synthetic or redacted examples.

## Scope

The following project-controlled components are in scope:

- The JavaScript calculation engine and Node.js CLI in this repository.
- The browser application and its client-side handling of configuration and user-supplied data.
- The project's own GitHub Actions workflows, build and release configuration, and dependency configuration.
- Security issues in the project's published files or deployment that are caused by this repository's code or configuration.

Examples of relevant reports include cross-site scripting, injection, unsafe parsing or deserialization, unintended disclosure or modification of user data, authentication or authorization flaws if introduced by the project, vulnerable dependencies with a demonstrable impact, and CI/CD weaknesses that could compromise project releases.

## Out of scope

Unless they demonstrate a security impact in this project, the following are not security vulnerabilities:

- Incorrect FD rates, bank product data, interest calculations, or ordinary application bugs. Report these using the normal [issue forms](https://github.com/aaron-fredrick/FD-Calculator/issues/new/choose).
- Vulnerabilities in GitHub Pages, GitHub, a user's browser, operating system, bank, or other third-party service that are not caused by this project.
- Denial-of-service testing, resource exhaustion, spam, social engineering, phishing, or physical attacks.
- Reports that rely only on outdated software or unsupported environments without a demonstrated vulnerability in the current project.

This scope does not grant permission to test third-party systems or services.

## Supported versions

| Version | Security support |
|---|---|
| Current code on the `main` branch | Best-effort security fixes |
| Latest published release, if any | Best-effort security fixes |
| Older releases and snapshots | Not routinely supported; upgrade to the latest version before reporting |

If a vulnerability affects an older release but not the current code, include the affected version and the result of testing against the current version.

## Researcher guidelines

Please:

1. Make a good-faith effort to avoid privacy violations, data destruction, service disruption, and access to data that is not yours.
2. Test only accounts, data, and systems that you own or have explicit permission to test.
3. Do not perform denial-of-service tests, bulk scanning, or actions that degrade availability.
4. Do not modify, delete, or exfiltrate other users' data. Stop testing once you have demonstrated the issue.
5. Keep vulnerability details, exploit code, and affected user information private while a fix is being investigated.
6. Give the maintainer a reasonable opportunity to investigate and coordinate a fix before public disclosure.

The private reporting channel is intended for coordinated disclosure. Please do not create a public issue or publish a proof of concept before discussing disclosure with the maintainer.

## Response and disclosure

The maintainer will make a best-effort attempt to:

- Acknowledge a report within **7 calendar days**.
- Provide an initial assessment or request for clarification within **14 calendar days**.
- Keep the reporter informed when practical, particularly if investigation or remediation takes longer.

These are response targets, not guarantees. The time required to validate and fix a report depends on its severity, reproducibility, complexity, and maintainer availability.

When a fix is ready, the maintainer will coordinate an appropriate disclosure date with the reporter where possible. A public security advisory may be published to explain the impact, affected versions, and remediation. Reporter credit will be included only with the reporter's consent.

## No bug bounty

FD Calculator does not currently operate a paid bug bounty program. Submitting a valid report does not create an entitlement to payment or a service-level agreement.
