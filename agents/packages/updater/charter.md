---
package: '@flighthq/updater'
role: package
crate: flighthq-updater
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# updater — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Application auto-update transactions for Squirrel-style hosts. An Entity-backed provider lives only at
`Host.updater.command`; one awaited check includes Squirrel's automatic download and can return a readonly
provider-pinned `DownloadedUpdate` Entity for installation. Native updater events remain adapter-private.
There is no ambient resolver, sentinel provider, independent download, public progress/event model, or
channel/config/rollback policy surface.

## Decisions

- **[2026-08-30] Reduce to one explicit Squirrel transaction.** Feed URL is immutable provider policy;
  downloaded handles retain exact provider origin; provider destroy releases in-flight listeners but never
  undoes durable feed/default policy. Unknown metadata is null and frozen rather than fabricated.
- **[2026-07-02] Squirrel is the current target.** The current scope covers Squirrel-style update mechanics (check / download / quit-and-install). Other update mechanisms (Sparkle, Tauri updater, custom CDN-based) are future backends, not changes to the API surface.

## Open directions

- A non-Squirrel provider requires its own separately ruled transaction mapping; richer
  electron-updater-only controls are not implicit additions to this contract.
