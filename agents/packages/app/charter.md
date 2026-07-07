---
package: '@flighthq/app'
crate: flighthq-app
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# app — Charter

See [platform integration shared principles](../platform-integration.md) for the suite-wide decisions.

## What it is

Process-level application identity and OS integration -- the layer that answers "what the running application is to the OS." Owns application identity (name, version, locale triad, install paths via `AppPathKind`), process lifecycle control (quit + quit-veto, relaunch, focus, hide/show, activation policy), single-instance locking, dock/taskbar badging and attention, recent-document and login-item registration, and OS-level app events (`onActivate`, `onAllWindowsClosed`, `onOpenFile`, `onQuitRequest`, `onReady`, `onSecondInstance`). Distinct from `@flighthq/application` (main loop + windowing): `app` = who you are, `application` = how you run. Command + event capability over a swappable `AppBackend` seam with a lazy web default returning sentinels.

## Decisions

- **[2026-07-02] Keep both `app` and `application` names.** `app` (process identity, OS integration, 42 exports) and `application` (main loop, windowing, frame control) are distinct domains with a clear boundary. The names stay.
- **[2026-07-02] 42 exports is the scope ceiling for process identity.** The current export count covers the full process-identity surface. Growth beyond this should be scrutinized for scope creep into `application`, `lifecycle`, or `tray` territory.

## Open directions

- Seam to `@flighthq/lifecycle`: `onActivate` / `onAllWindowsClosed` here overlap conceptually with lifecycle's active/background events. The boundary needs an explicit ruling.
- Memory-pressure and launch-kind events: `AppMemoryPressure` and `AppLaunchKind` exist as types in `@flighthq/types` with no implementer. Wire them here or move to `@flighthq/lifecycle`.
- Jump-list / dock-menu unification across platforms.
- Five parked rulings in status.md (quit-veto mechanism, locale triad split, filesystem-paths boundary, tray-vs-badge ownership, `setAppUserModelId` ownership) are candidates for promotion to Decisions.
