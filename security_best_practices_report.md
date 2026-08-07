# Campfire security review

## Executive summary

The Campfire MVP has no known critical or high-severity issue after the current hardening pass. Untrusted Voices are validated on the Worker and rendered with text-only DOM APIs. Administrative access remains server-side, rate-limit identifiers are separated from editorial data, and the Worker source is excluded from public assets.

Production release is not yet approved: crawler verification and the complete staging lifecycle remain unverified.

## Resolved findings

### SEC-001 — Stored DOM XSS sink

- Severity: High
- Location: `assets/campfire.js`, `element`, `renderEmbers`, `renderVoices`, lines 5–40
- Evidence: API content is now rendered with `document.createElement`, `textContent`, and `replaceChildren`; no `innerHTML` sink remains.
- Impact prevented: a malicious stored Voice cannot become executable HTML or JavaScript in a visitor's browser.
- Fix: replaced interpolated HTML with explicit DOM construction.
- Mitigation: Worker validation also rejects angle-bracket markup, and response headers apply a restrictive CSP.

### SEC-002 — Anti-abuse identifier retained with editorial content

- Severity: Medium
- Location: `worker.js`, `hashVisitor`, lines 84–89; `CampfireStore` schema and rate-limit processing, lines 209–214 and 274–285
- Evidence: Voices no longer contain an IP-derived field. A salted pseudonymous key is stored only in `rate_limits`; entries older than 48 hours are deleted during submission processing.
- Impact prevented: long-term editorial records cannot be correlated using the anti-abuse identifier.
- Fix: separated rate limiting from Voices and required the `CAMPFIRE_HASH_SALT` secret.
- Mitigation: raw IP addresses are never stored.

### SEC-003 — Unbounded, duplicate, or promotional submissions

- Severity: Medium
- Location: `worker.js`, submission routing and validation, lines 120–149 and 249–289
- Evidence: requests over 8 KiB return 413; invalid shapes, markup, and links return 400; duplicate fingerprints return 409; the fourth accepted-format request in 24 hours returns 429.
- Impact prevented: memory abuse, trivial spam amplification, duplicate queue flooding, and promotional-link storage.
- Fix: added byte limits before JSON parsing, strict field validation, duplicate fingerprints, and fixed-window rate limiting.

### SEC-004 — Weak browser and administrative boundaries

- Severity: Medium
- Location: `worker.js`, `SECURITY_HEADERS`, lines 12–20; `secureEqual`, lines 91–98; moderation route, lines 154–166
- Evidence: secrets are read only from Worker bindings; admin tokens are compared without an early-exit string comparison; wildcard CORS was removed; static responses receive CSP, Permissions-Policy, Referrer-Policy, and `nosniff`.
- Impact prevented: accidental browser exposure of secrets, broad cross-origin submission access, and reduced defense against injected content.
- Fix: server-only secrets, restricted same-origin browser access, security headers, and bounded moderation bodies.

### SEC-005 — Worker source could be exposed as an asset

- Severity: Medium
- Location: `.assetsignore`
- Evidence: `worker.js`, tests, Wrangler configurations, repository metadata, and README are excluded from the static asset upload. `agent-protocol.json` and `openapi.json` remain public intentionally.
- Impact prevented: accidental publication of server implementation details and operational test files.
- Fix: explicit asset ignore rules plus a staging smoke assertion that `/worker.js` returns 404.

## Remaining findings

### SEC-006 — Crawler verification depends on Cloudflare account capability

- Severity: Medium
- Location: `worker.js`, `identifyBot`, `botVerification`, and Ember recording
- Evidence: family matching starts with the declared User-Agent. An Ember becomes `cloudflare-verified` or `cloudflare-signed-agent` only when the corresponding trusted `request.cf.botManagement` signal exists; otherwise it remains `unverified`.
- Impact: on a Cloudflare plan without Bot Management metadata, spoofed User-Agents can still create explicitly unverified Embers.
- Required production check: confirm whether the active account exposes verified-bot or signed-agent metadata. If it does not, retain the unverified label or add provider-specific IP validation.
- Current mitigation: a missing signal never upgrades identity, and the interface never represents a fetch as an opinion.

### SEC-007 — End-to-end staging lifecycle not yet executed

- Severity: Medium
- Location: `tests/campfire-staging-smoke.ps1`
- Evidence: Wrangler dry-run passes, but Cloudflare authentication is not configured and the local Wrangler runtime did not open successfully from the OneDrive workspace.
- Impact: Durable Object persistence, moderation transitions, rate limiting, and asset exclusion have not yet been proven in a running Cloudflare environment.
- Required fix: authenticate Wrangler, configure both staging secrets, deploy `wrangler.staging.jsonc`, and run the smoke suite.
- Current mitigation: production has not been deployed.

### SEC-008 — Third-party scripts remain trusted dependencies

- Severity: Low
- Location: `campfire.html`, Giscus loader; all HTML pages, Google Fonts stylesheet
- Evidence: the site loads Giscus and Google Fonts from third-party origins. Giscus is not pinned with SRI.
- Impact: a compromised third-party origin could affect the page within the permissions allowed by CSP.
- Fix: evaluate self-hosting fonts and whether the Giscus client can be pinned or isolated further.
- Current mitigation: CSP restricts scripts to the same origin and `https://giscus.app`; Giscus remains secondary and receives no administrative token.

## Release gate

Do not deploy to production until SEC-006 and SEC-007 are resolved or explicitly accepted. The first public Voice must also be genuinely authored by the site owner or labeled with its real provenance; it must not be fabricated as human.
