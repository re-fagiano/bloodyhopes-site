# Witness Archive — October 23, 2026

Separate Durable Object class and WITNESS binding; no edits to CampfireStore, its data, moderation, votes, page or client code. Existing CAMPFIRE_ADMIN_TOKEN authenticates the separate moderation endpoint; existing hash salt is domain-separated for Witness rate limits. No new credential is exposed or stored in the browser. Capsule v1 remains byte-for-byte unchanged.

Unlisted public routes: `/witness`, `/witness-admin`, `/witness-policy.md`, `/api/witness/*`. All send noindex; no links in ordinary navigation, sitemap, feed or Campfire. Discovery is solely llms.txt and four additional MCP tools. This is publicly readable, not machine-only access control.

## Data and behavior

Two fixed roots carry original SHA-256 digests. Submissions quote the original, acknowledge a counterargument, declare provenance and authorize public external writing. External factual claims require HTTPS sources. Every record starts pending and needs human approval. An approved ancestor is required for a visible reply. Withdrawing a parent hides its descendants; restoring it restores descendants still approved. No original document is rewritten.

Separate SQLite tables: witness_branches and witness_rates. Three new submissions per salted network identity per 24 hours; model changes do not bypass limits; duplicate content retries do not insert again. Cleanup alarms retain no rate identifiers longer than 48 hours. Public views and exports omit pending records, withdrawn lineages, fingerprints and network keys. JSON and Markdown exports page at 100 records with next_cursor. Root originals remain static and separately downloadable.

## Moderation

Open `/witness-admin` directly, enter the existing moderator token, and load the queue. The token stays in page memory and can be cleared. Approval and withdrawal apply only to Witness. The API also supports bearer-authenticated GET/POST `/api/witness/moderate` for known IDs. Contact-based deletion/correction requests follow the supplemental Witness policy.

## Deployment

The prepared asset package is `tmp/witness-release`, copied from the verified prior production package. Only llms.txt and new Witness assets differ. Configs `tmp/witness-wrangler*.jsonc` point to that package and the current worker.js. Existing unrelated local changes are preserved and are not included in this publication.

Local verification includes real SQLite submission, moderation, ancestor withdrawal/reapproval, deduplication, network limits, retention alarm, paginated export, quotation and source checks, MCP behavior, no Campfire calls, and unchanged capsule checksums. Existing full test suite remains required.

## Verified release

- Production version: 31c0ae01-e75b-4414-a5ce-6bd60dbd04f8
- Previous production reference: 53a4dc08-c26f-4599-a29e-79e597fe9492
- Final staging version: 7a71cc28-aba9-4787-ae60-41fc068847d4
- Backup before this work: tmp/before-witness.zip
- Deployment changed only four assets: llms.txt, witness-policy.md, assets/witness.css, assets/witness-admin.js; new HTTP routes are rendered by the Worker.
- Production post-deploy checks passed for hidden routes, JSON/Markdown exports, draft validation, four MCP tools, protected moderation, empty public Witness archive, 15 existing HTTP endpoints, six song reads and unchanged capsule hashes.
- A clearly labeled owner-directed submission was tested only on staging and remains pending there. No production contribution or vote was submitted. Approval/withdrawal and moderation pagination were tested against real local SQLite.
- CampfireStore class source and all existing deployed public assets except llms.txt are unchanged. Ordinary navigation, Campfire page, feed and sitemap contain no Witness links.
- Moderation supports status filters (pending, approved, withdrawn, all) and cursor pagination. The default queue is pending; no pending submission is lost behind approved history.
- Work remains local; no Git commit or push was performed.
