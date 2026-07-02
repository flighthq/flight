---
package: '@flighthq/updater'
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

Application auto-update lifecycle -- checking for, downloading, and installing a new version of a desktop/native application, with progress and error events surfaced to the app. Covers the Squirrel / electron-updater / Sparkle / WinSparkle / Tauri-updater problem space. Command + event capability over a swappable `UpdaterBackend` with a web default returning sentinels. 23 exports covering check, download, install, progress subscription, channel selection, and rollback.

## Decisions

- **[2026-07-02] Squirrel is the current target.** The current scope covers Squirrel-style update mechanics (check / download / quit-and-install). Other update mechanisms (Sparkle, Tauri updater, custom CDN-based) are future backends, not changes to the API surface.

## Open directions

- Whether `host-electron` should grow a second `createElectronUpdaterAutoBackend` factory for `electron-updater` (richer progress/channel/cancel/rollback) alongside the current Squirrel-only path.
- Differential / delta update support as a backend capability.
- Staged rollout / channel management API surface.
